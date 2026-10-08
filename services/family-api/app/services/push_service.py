import hashlib
import hmac
import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.push_subscription import PushPrivacyPreference, PushSubscription
from app.models.user import User
from app.schemas.push import MatrixPushNotification, PushSubscribeRequest

DEFAULT_PUSH_TITLE = "FamilyChat"
DEFAULT_PUSH_BODY = "Новое сообщение"
CALL_INVITE_EVENT_TYPE = "com.familychat.call.invite"
PREVIEW_MAX_LENGTH = 140
WEB_PUSH_TTL_SECONDS = 86_400
logger = logging.getLogger(__name__)


class PushSendError(Exception):
    def __init__(
        self, reason: str = "push_send_failed", *, invalid_subscription: bool = False
    ) -> None:
        super().__init__(reason)
        self.reason = reason
        self.invalid_subscription = invalid_subscription


PushSender = Callable[[dict, str, str, str], None]


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _default_push_sender(
    subscription_info: dict, payload: str, private_key: str, subject: str
) -> None:
    try:
        from pywebpush import WebPushException, webpush
    except ImportError as exc:
        raise PushSendError("web_push_dependency_missing") from exc

    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            ttl=WEB_PUSH_TTL_SECONDS,
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
        )
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        invalid = status_code in {404, 410}
        raise PushSendError("push_service_rejected", invalid_subscription=invalid) from exc


class PushService:
    def __init__(self, settings: Settings, sender: PushSender | None = None) -> None:
        self._settings = settings
        self._sender = sender or _default_push_sender

    def push_available(self) -> bool:
        return (
            self._settings.web_push_enabled
            and bool(self._settings.web_push_vapid_public_key.strip())
            and bool(self._settings.web_push_vapid_private_key.strip())
            and bool(self._settings.web_push_subject.strip())
        )

    def settings_for_user(self, db: Session, user: User) -> dict:
        subscription = self._latest_subscription(db, user)
        matrix_pusher = (
            self.matrix_pusher(subscription) if subscription and subscription.enabled else None
        )
        return {
            "enabled": bool(subscription and subscription.enabled),
            "subscription_id": subscription.id if subscription else None,
            "privacy_preference": subscription.privacy_preference
            if subscription
            else PushPrivacyPreference.fact_only,
            "vapid_public_key": self._settings.web_push_vapid_public_key
            if self.push_available()
            else None,
            "matrix_pusher_app_id": self._settings.matrix_push_app_id,
            "matrix_push_gateway_url": self._settings.matrix_push_gateway_url,
            "matrix_pusher": matrix_pusher,
            "push_available": self.push_available(),
        }

    def matrix_pusher(self, subscription: PushSubscription) -> dict:
        return {
            "app_id": self._settings.matrix_push_app_id,
            "gateway_url": self._settings.matrix_push_gateway_url,
            "push_key": str(subscription.id),
        }

    def subscribe(self, db: Session, user: User, payload: PushSubscribeRequest) -> PushSubscription:
        endpoint_hash = self._endpoint_hash(payload.endpoint)
        subscription = db.scalar(
            select(PushSubscription).where(PushSubscription.endpoint_hash == endpoint_hash)
        )
        privacy = payload.privacy_preference or PushPrivacyPreference.fact_only

        if subscription is None:
            subscription = PushSubscription(
                user_id=user.id,
                endpoint=payload.endpoint,
                endpoint_hash=endpoint_hash,
                p256dh=payload.keys.p256dh,
                auth_secret=payload.keys.auth,
                content_encoding=payload.content_encoding,
                privacy_preference=privacy,
                enabled=True,
                failure_count=0,
            )
            db.add(subscription)
        else:
            subscription.user_id = user.id
            subscription.endpoint = payload.endpoint
            subscription.p256dh = payload.keys.p256dh
            subscription.auth_secret = payload.keys.auth
            subscription.content_encoding = payload.content_encoding
            subscription.privacy_preference = privacy
            subscription.enabled = True
            subscription.disabled_at = None
            subscription.last_failure_at = None
            subscription.last_failure_reason = None

        subscription.updated_at = _utc_now()
        db.flush()
        return subscription

    def disable(
        self,
        db: Session,
        user: User,
        *,
        endpoint: str | None = None,
        subscription_id: UUID | None = None,
        reason: str | None = None,
    ) -> bool:
        query = select(PushSubscription).where(PushSubscription.user_id == user.id)
        if subscription_id is not None:
            query = query.where(PushSubscription.id == subscription_id)
        elif endpoint is not None:
            query = query.where(PushSubscription.endpoint_hash == self._endpoint_hash(endpoint))
        else:
            return False

        subscription = db.scalar(query)
        if subscription is None:
            return False
        self.disable_subscription(subscription, reason=reason or "disabled_by_user")
        db.flush()
        return True

    def update_privacy(
        self,
        db: Session,
        user: User,
        preference: PushPrivacyPreference,
    ) -> PushPrivacyPreference:
        subscriptions = list(
            db.scalars(select(PushSubscription).where(PushSubscription.user_id == user.id))
        )
        for subscription in subscriptions:
            subscription.privacy_preference = preference
            subscription.updated_at = _utc_now()
        db.flush()
        return preference

    def send_test_push(self, db: Session, user: User) -> int:
        subscriptions = list(
            db.scalars(
                select(PushSubscription).where(
                    PushSubscription.user_id == user.id,
                    PushSubscription.enabled.is_(True),
                )
            )
        )
        sent = 0
        for subscription in subscriptions:
            if self.send_subscription(
                db,
                subscription,
                self._payload(DEFAULT_PUSH_TITLE, DEFAULT_PUSH_BODY),
            ):
                sent += 1
        return sent

    def handle_matrix_notification(
        self,
        db: Session,
        notification: MatrixPushNotification,
    ) -> list[str]:
        if not self._should_show_notification(notification):
            logger.info(
                "Matrix push notification ignored: devices=%s reason=count_or_receipt_update",
                len(notification.devices),
            )
            return []

        rejected: list[str] = []
        matched_devices = 0
        sent = 0
        for device in notification.devices:
            if device.app_id != self._settings.matrix_push_app_id or not device.pushkey:
                continue
            matched_devices += 1
            subscription = self._subscription_by_id(db, device.pushkey)
            if subscription is None or not subscription.enabled:
                rejected.append(device.pushkey)
                continue
            payload = self._payload_for_subscription(db, subscription, notification)
            if not self.send_subscription(db, subscription, payload):
                rejected.append(device.pushkey)
                continue
            sent += 1
        logger.info(
            "Matrix push notification processed: devices=%s matched=%s sent=%s rejected=%s",
            len(notification.devices),
            matched_devices,
            sent,
            len(rejected),
        )
        return rejected

    def _should_show_notification(self, notification: MatrixPushNotification) -> bool:
        return bool(notification.event_id and notification.type)

    def send_subscription(self, db: Session, subscription: PushSubscription, payload: dict) -> bool:
        if not self.push_available():
            subscription.last_failure_at = _utc_now()
            subscription.last_failure_reason = "web_push_disabled"
            subscription.failure_count += 1
            db.flush()
            return False

        subscription_info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth_secret,
            },
        }
        try:
            self._sender(
                subscription_info,
                json.dumps(payload, ensure_ascii=False),
                self._settings.web_push_vapid_private_key,
                self._settings.web_push_subject,
            )
        except PushSendError as exc:
            subscription.failure_count += 1
            subscription.last_failure_at = _utc_now()
            subscription.last_failure_reason = exc.reason[:120]
            if exc.invalid_subscription:
                self.disable_subscription(subscription, reason="invalid_subscription")
            db.flush()
            return False

        subscription.failure_count = 0
        subscription.last_failure_at = None
        subscription.last_failure_reason = None
        subscription.updated_at = _utc_now()
        db.flush()
        return True

    def disable_subscription(self, subscription: PushSubscription, *, reason: str) -> None:
        subscription.enabled = False
        subscription.disabled_at = _utc_now()
        subscription.last_failure_reason = reason[:120]
        subscription.updated_at = _utc_now()

    def _payload_for_subscription(
        self,
        db: Session,
        subscription: PushSubscription,
        notification: MatrixPushNotification,
    ) -> dict:
        sender_name = self._safe_sender_name(db, notification.sender)
        call_payload = self._call_payload(notification, sender_name)
        if call_payload is not None:
            return call_payload

        preference = subscription.privacy_preference
        if preference == PushPrivacyPreference.fact_only:
            return self._payload(DEFAULT_PUSH_TITLE, DEFAULT_PUSH_BODY, notification)

        if preference == PushPrivacyPreference.sender_name:
            title = sender_name or DEFAULT_PUSH_TITLE
            return self._payload(title, "Новое сообщение", notification)

        message_preview = self._safe_message_preview(
            notification,
            include_encrypted=preference == PushPrivacyPreference.sender_and_preview,
        )
        if preference == PushPrivacyPreference.message_text:
            return self._payload(
                DEFAULT_PUSH_TITLE,
                message_preview or DEFAULT_PUSH_BODY,
                notification,
            )

        title = sender_name or DEFAULT_PUSH_TITLE
        return self._payload(title, message_preview or "Новое сообщение", notification)

    def _payload(
        self,
        title: str,
        body: str,
        notification: MatrixPushNotification | None = None,
    ) -> dict:
        payload: dict[str, object] = {
            "body": body,
            "title": title,
        }
        data = self._notification_data(notification)
        if data:
            payload["data"] = data
        return payload

    def _notification_data(self, notification: MatrixPushNotification | None) -> dict[str, str]:
        if notification is None:
            return {}
        data: dict[str, str] = {}
        if notification.room_id:
            data["roomId"] = notification.room_id
        if notification.event_id:
            data["eventId"] = notification.event_id
        if notification.content:
            call_id = notification.content.get("callId")
            if isinstance(call_id, str) and call_id:
                data["callId"] = call_id
            mode = notification.content.get("mode")
            if isinstance(mode, str) and mode:
                data["callMode"] = mode
            expires_at = notification.content.get("expiresAt")
            if isinstance(expires_at, int | float):
                data["expiresAt"] = str(int(expires_at))
        return data

    def _call_payload(
        self, notification: MatrixPushNotification, sender_name: str | None
    ) -> dict | None:
        is_call_invite_message = (
            notification.type == "m.room.message"
            and notification.content.get("org.familychat.call.invite") is True
        )
        if notification.type != CALL_INVITE_EVENT_TYPE and not is_call_invite_message:
            return None
        mode = notification.content.get("mode") if notification.content else None
        body = "Входящий видеозвонок" if mode == "video" else "Входящий аудиозвонок"
        payload = self._payload(sender_name or DEFAULT_PUSH_TITLE, body, notification)
        payload["requireInteraction"] = True
        payload["renotify"] = True
        payload["silent"] = False
        payload["vibrate"] = [240, 120, 240, 120, 360]
        return payload

    def _safe_message_preview(
        self, notification: MatrixPushNotification, *, include_encrypted: bool
    ) -> str | None:
        if not notification.content:
            return None
        if notification.type == "m.room.encrypted":
            if not include_encrypted:
                return None
            body = notification.content.get("body")
            if isinstance(body, str) and body.strip():
                return self._trim_preview(body)
            return "Зашифрованное сообщение"
        if notification.type != "m.room.message":
            return None

        msgtype = notification.content.get("msgtype")
        if msgtype == "m.text":
            body = notification.content.get("body")
            if isinstance(body, str) and body.strip():
                return self._trim_preview(body)
            return None
        if msgtype == "m.image":
            return "Фото"
        if msgtype == "m.video":
            return "Видео"
        if msgtype == "m.audio":
            return (
                "Голосовое сообщение"
                if notification.content.get("org.familychat.voice") is True
                else "Аудио"
            )
        if msgtype == "m.file":
            filename = notification.content.get("filename") or notification.content.get("body")
            if isinstance(filename, str) and filename.strip():
                return f"Файл: {self._trim_preview(filename, limit=80)}"
            return "Файл"
        return None

    def _trim_preview(self, value: str, *, limit: int = PREVIEW_MAX_LENGTH) -> str:
        text = " ".join(value.split())
        if len(text) <= limit:
            return text
        return f"{text[: limit - 1].rstrip()}…"

    def _safe_sender_name(self, db: Session, sender: str | None) -> str | None:
        if not sender:
            return None
        user = db.scalar(
            select(User).where(User.matrix_user_id == sender, User.is_active.is_(True))
        )
        if user is None:
            return None
        return user.display_name.strip()[:80] or None

    def _latest_subscription(self, db: Session, user: User) -> PushSubscription | None:
        return db.scalar(
            select(PushSubscription)
            .where(PushSubscription.user_id == user.id)
            .order_by(PushSubscription.updated_at.desc())
        )

    def _subscription_by_id(self, db: Session, pushkey: str) -> PushSubscription | None:
        try:
            subscription_id = UUID(pushkey)
        except ValueError:
            return None
        return db.get(PushSubscription, subscription_id)

    def _endpoint_hash(self, endpoint: str) -> str:
        return hmac.new(
            self._settings.invite_pepper.encode("utf-8"),
            endpoint.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
