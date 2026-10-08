import hashlib
import hmac
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import MatrixAdminError
from app.models.audit_log import AuditLog
from app.models.invite import InviteCode
from app.models.push_subscription import PushSubscription
from app.models.user import User, UserRole
from app.services.matrix_admin import MatrixAdminService
from app.services.push_service import PushService

DEFAULT_AUDIT_LIMIT = 25
MAX_AUDIT_LIMIT = 100

SAFE_METADATA_KEYS = {
    "call_id_length",
    "expires_at",
    "label",
    "max_uses",
    "mode",
    "peer_count",
    "privacy_preference",
    "ttl_seconds",
    "used_count",
}


class AdminActionError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class SafeServiceStatus:
    name: str
    status: str
    detail: str


class AdminService:
    def __init__(
        self,
        settings: Settings,
        matrix_admin: MatrixAdminService,
        push_service: PushService | None = None,
    ) -> None:
        self._settings = settings
        self._matrix_admin = matrix_admin
        self._push_service = push_service or PushService(settings)

    def user_ref(self, user_id: UUID) -> str:
        return self._opaque_ref("user", str(user_id))

    def invite_ref(self, invite_id: UUID) -> str:
        return self._opaque_ref("invite", str(invite_id))

    def push_subscription_ref(self, subscription_id: UUID) -> str:
        return self._opaque_ref("push", str(subscription_id))

    def resolve_user_ref(self, db: Session, admin_ref: str) -> User | None:
        return self._resolve_ref(db, User, admin_ref, self.user_ref)

    def resolve_invite_ref(self, db: Session, admin_ref: str) -> InviteCode | None:
        return self._resolve_ref(db, InviteCode, admin_ref, self.invite_ref)

    def list_users(self, db: Session, actor: User) -> list[dict[str, Any]]:
        active_admin_count = self._active_admin_count(db)
        users = db.scalars(select(User).order_by(User.created_at.desc())).all()
        return [
            {
                "admin_ref": self.user_ref(user.id),
                "can_deactivate": self._can_deactivate(
                    actor=actor,
                    target=user,
                    active_admin_count=active_admin_count,
                ),
                "created_at": user.created_at,
                "deactivate_blocked_reason": self._deactivate_blocked_reason(
                    actor=actor,
                    target=user,
                    active_admin_count=active_admin_count,
                ),
                "display_name": user.display_name,
                "family_code": user.family_code,
                "is_active": user.is_active,
                "role": user.role,
                "technical_status": "active" if user.is_active else "inactive",
                "updated_at": user.updated_at,
                "username": user.username,
            }
            for user in users
        ]

    def deactivate_user(self, db: Session, *, actor: User, target: User) -> User:
        reason = self._deactivate_blocked_reason(
            actor=actor,
            target=target,
            active_admin_count=self._active_admin_count(db),
        )
        if reason is not None:
            raise AdminActionError(reason)

        if target.is_active:
            self._matrix_admin.deactivate_user(target.matrix_user_id)
            target.is_active = False
            self._log_admin_action(
                db,
                actor=actor,
                action="user.deactivated",
                target_type="user",
                target_id=str(target.id),
                metadata={"role": target.role.value},
            )
        return target

    def safe_status(self, db: Session) -> dict[str, Any]:
        services = [
            self._database_status(db),
            self._matrix_status(),
            self._livekit_status(),
            self._push_status(),
        ]
        return {
            "api": {"status": "ok", "detail": "Family API is responding."},
            "services": [
                {"detail": item.detail, "name": item.name, "status": item.status}
                for item in services
            ],
            "stage_blockers": [
                {
                    "stage": "Stage 7",
                    "status": "partial",
                    "detail": "Browser file-picker live smoke remains pending.",
                },
                {
                    "stage": "Stage 8",
                    "status": "partial",
                    "detail": "Real browser microphone record/send/play smoke remains pending.",
                },
                {
                    "stage": "Stage 9",
                    "status": "partial",
                    "detail": "Real browser Web Push subscribe/delivery smoke remains pending.",
                },
                {
                    "stage": "Stage 10",
                    "status": "partial",
                    "detail": "Real browser LiveKit audio/video call smoke remains pending.",
                },
            ],
        }

    def diagnostics(self, db: Session, actor: User) -> dict[str, Any]:
        del actor
        users = db.scalars(select(User).order_by(User.created_at.desc())).all()
        user_ids = [user.id for user in users]
        subscription_rows = (
            db.scalars(
                select(PushSubscription)
                .where(PushSubscription.user_id.in_(user_ids))
                .order_by(PushSubscription.updated_at.desc())
            ).all()
            if user_ids
            else []
        )
        subscriptions_by_user: dict[UUID, list[PushSubscription]] = {}
        for subscription in subscription_rows:
            subscriptions_by_user.setdefault(subscription.user_id, []).append(subscription)

        return {
            "matrix_pusher_app_id": self._settings.matrix_push_app_id,
            "matrix_push_gateway_configured": bool(self._settings.matrix_push_gateway_url.strip()),
            "push_available": self._push_service.push_available(),
            "users": [
                self._user_diagnostics(user, subscriptions_by_user.get(user.id, []))
                for user in users
            ],
        }

    def audit_entries(self, db: Session, *, limit: int, offset: int) -> dict[str, Any]:
        safe_limit = min(max(limit, 1), MAX_AUDIT_LIMIT)
        safe_offset = max(offset, 0)
        rows = db.scalars(
            select(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .offset(safe_offset)
            .limit(safe_limit)
        ).all()
        actor_ids = {row.actor_user_id for row in rows if row.actor_user_id is not None}
        actors = (
            {user.id: user for user in db.scalars(select(User).where(User.id.in_(actor_ids))).all()}
            if actor_ids
            else {}
        )
        return {
            "items": [
                {
                    "action": row.action,
                    "actor_label": self._actor_label(actors.get(row.actor_user_id)),
                    "created_at": row.created_at,
                    "metadata": self._safe_metadata(row.event_metadata),
                    "target_label": self._target_label(row.target_type),
                    "target_type": self._safe_target_type(row.target_type),
                }
                for row in rows
            ],
            "limit": safe_limit,
            "offset": safe_offset,
        }

    def _user_diagnostics(self, user: User, subscriptions: list[PushSubscription]) -> dict[str, Any]:
        active_subscriptions = [subscription for subscription in subscriptions if subscription.enabled]
        latest_subscription = subscriptions[0] if subscriptions else None
        return {
            "active_push_count": len(active_subscriptions),
            "admin_ref": self.user_ref(user.id),
            "display_name": user.display_name,
            "is_active": user.is_active,
            "latest_push_updated_at": latest_subscription.updated_at if latest_subscription else None,
            "role": user.role,
            "subscriptions": [
                {
                    "content_encoding": subscription.content_encoding,
                    "created_at": subscription.created_at,
                    "disabled_at": subscription.disabled_at,
                    "enabled": subscription.enabled,
                    "failure_count": subscription.failure_count,
                    "last_failure_at": subscription.last_failure_at,
                    "last_failure_reason": subscription.last_failure_reason,
                    "privacy_preference": subscription.privacy_preference.value,
                    "subscription_ref": self.push_subscription_ref(subscription.id),
                    "updated_at": subscription.updated_at,
                }
                for subscription in subscriptions
            ],
            "total_push_count": len(subscriptions),
            "username": user.username,
        }

    def _opaque_ref(self, prefix: str, raw_value: str) -> str:
        digest = hmac.new(
            self._settings.invite_pepper.encode("utf-8"),
            f"{prefix}:{raw_value}".encode(),
            hashlib.sha256,
        ).hexdigest()[:24]
        return f"{prefix}_{digest}"

    def _resolve_ref(self, db: Session, model, admin_ref: str, ref_for) -> Any | None:
        for item in db.scalars(select(model)).all():
            if hmac.compare_digest(ref_for(item.id), admin_ref):
                return item
        return None

    def _active_admin_count(self, db: Session) -> int:
        return int(
            db.scalar(
                select(func.count(User.id)).where(
                    User.role == UserRole.admin,
                    User.is_active.is_(True),
                )
            )
            or 0
        )

    def _can_deactivate(
        self,
        *,
        actor: User,
        target: User,
        active_admin_count: int,
    ) -> bool:
        return (
            target.is_active
            and target.id != actor.id
            and not (target.role == UserRole.admin and active_admin_count <= 1)
        )

    def _deactivate_blocked_reason(
        self,
        *,
        actor: User,
        target: User,
        active_admin_count: int,
    ) -> str | None:
        if not target.is_active:
            return "User is already inactive."
        if target.id == actor.id:
            if target.role == UserRole.admin and active_admin_count <= 1:
                return (
                    "You cannot deactivate your own admin account. "
                    "The last active admin cannot be deactivated."
                )
            return "You cannot deactivate your own admin account."
        if target.role == UserRole.admin and active_admin_count <= 1:
            return "The last active admin cannot be deactivated."
        return None

    def _database_status(self, db: Session) -> SafeServiceStatus:
        try:
            db.execute(text("SELECT 1"))
        except Exception:
            return SafeServiceStatus("Database", "unavailable", "Database check failed.")
        return SafeServiceStatus("Database", "ok", "Database connectivity check passed.")

    def _matrix_status(self) -> SafeServiceStatus:
        try:
            self._matrix_admin.user_exists(self._settings.matrix_admin_user)
        except (AttributeError, MatrixAdminError):
            return SafeServiceStatus(
                "Matrix",
                "unavailable",
                "Matrix admin connectivity check failed.",
            )
        return SafeServiceStatus("Matrix", "ok", "Matrix admin connectivity check passed.")

    def _livekit_status(self) -> SafeServiceStatus:
        if not self._settings.livekit_calls_enabled:
            return SafeServiceStatus("LiveKit", "disabled", "LiveKit calls are disabled.")
        if not (
            self._settings.livekit_url.strip()
            and self._settings.livekit_api_key.strip()
            and self._settings.livekit_api_secret.strip()
        ):
            return SafeServiceStatus("LiveKit", "unavailable", "LiveKit calls are not configured.")
        return SafeServiceStatus("LiveKit", "configured", "LiveKit token configuration is present.")

    def _push_status(self) -> SafeServiceStatus:
        if not self._settings.web_push_enabled:
            return SafeServiceStatus("Web Push", "disabled", "Web Push is disabled.")
        if not self._push_service.push_available():
            return SafeServiceStatus("Web Push", "unavailable", "Web Push is not configured.")
        return SafeServiceStatus("Web Push", "configured", "Web Push configuration is present.")

    def _actor_label(self, actor: User | None) -> str:
        if actor is None:
            return "System or removed user"
        return actor.username

    def _target_label(self, target_type: str) -> str:
        if target_type == "user":
            return "User account"
        if target_type == "invite":
            return "Invite code"
        if target_type == "livekit_call":
            return "LiveKit call token"
        if target_type == "push_subscription":
            return "Push subscription"
        return "Technical event"

    def _safe_target_type(self, target_type: str) -> str:
        if target_type in {"user", "invite"}:
            return target_type
        return "technical"

    def _safe_metadata(self, metadata: dict | None) -> dict[str, Any]:
        if not isinstance(metadata, dict):
            return {}
        return {
            key: value
            for key, value in metadata.items()
            if key in SAFE_METADATA_KEYS and self._metadata_value_is_safe(value)
        }

    def _metadata_value_is_safe(self, value: Any) -> bool:
        if value is None or isinstance(value, bool | int | float):
            return True
        if isinstance(value, str):
            lowered = value.lower()
            return not any(
                marker in lowered
                for marker in (
                    "mxc://",
                    "matrix",
                    "token",
                    "secret",
                    "password",
                    "room",
                    "event",
                    "device",
                    "http://",
                    "https://",
                )
            )
        return False

    def _log_admin_action(
        self,
        db: Session,
        *,
        actor: User,
        action: str,
        target_type: str,
        target_id: str | None,
        metadata: dict | None = None,
    ) -> None:
        db.add(
            AuditLog(
                actor_user_id=actor.id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                event_metadata=metadata or {},
            )
        )
