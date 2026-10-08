import hashlib
import hmac
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import Settings
from app.models.user import User
from app.schemas.calls import CallMode

TOKEN_TTL = timedelta(minutes=5)


@dataclass(frozen=True)
class LiveKitTokenResult:
    token: str
    room_name: str
    expires_at: datetime


class LiveKitTokenService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def calls_available(self) -> bool:
        return (
            self._settings.livekit_calls_enabled
            and bool(self._settings.livekit_url.strip())
            and bool(self._settings.livekit_api_key.strip())
            and bool(self._settings.livekit_api_secret.strip())
        )

    def room_name_for(self, caller: User, target: User, call_id: str) -> str:
        pair = ":".join(sorted((str(caller.id), str(target.id))))
        digest = hmac.new(
            self._settings.invite_pepper.encode("utf-8"),
            f"{pair}:{call_id}".encode(),
            hashlib.sha256,
        ).hexdigest()[:32]
        return f"fc-call-{digest}"

    def room_audit_id(self, room_name: str) -> str:
        return hmac.new(
            self._settings.invite_pepper.encode("utf-8"),
            room_name.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:24]

    def issue_token(
        self,
        *,
        caller: User,
        target: User,
        call_id: str,
        mode: CallMode,
    ) -> LiveKitTokenResult:
        now = datetime.now(UTC)
        expires_at = now + TOKEN_TTL
        room_name = self.room_name_for(caller, target, call_id)
        identity = f"familychat-{caller.id.hex}"
        can_publish_sources = ["microphone"] if mode == CallMode.audio else ["camera", "microphone"]
        claims = {
            "exp": int(expires_at.timestamp()),
            "iss": self._settings.livekit_api_key,
            "nbf": int(time.time()),
            "sub": identity,
            "video": {
                "canPublish": True,
                "canPublishData": False,
                "canPublishSources": can_publish_sources,
                "canSubscribe": True,
                "room": room_name,
                "roomJoin": True,
            },
        }
        token = jwt.encode(
            claims,
            self._settings.livekit_api_secret,
            algorithm="HS256",
        )
        return LiveKitTokenResult(token=token, room_name=room_name, expires_at=expires_at)
