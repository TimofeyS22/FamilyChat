from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.user import User
from app.schemas.calls import CallMode
from app.services.audit_service import AuditService
from app.services.livekit_tokens import LiveKitTokenResult, LiveKitTokenService


class CallsUnavailableError(Exception):
    pass


class InvalidCallTargetError(Exception):
    pass


class TargetNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class CallTokenIssue:
    token: LiveKitTokenResult
    peer_display_name: str


class CallsService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._tokens = LiveKitTokenService(settings)
        self._audit = AuditService()

    def issue_join_token(
        self,
        db: Session,
        *,
        caller: User,
        target_user_id: UUID,
        call_id: str,
        mode: CallMode,
    ) -> CallTokenIssue:
        if not self._tokens.calls_available():
            raise CallsUnavailableError

        target = db.get(User, target_user_id)
        if target is None:
            raise TargetNotFoundError
        if not self._is_callable_user(caller) or not self._is_callable_user(target):
            raise InvalidCallTargetError
        if target.id == caller.id:
            raise InvalidCallTargetError

        result = self._tokens.issue_token(
            caller=caller,
            target=target,
            call_id=call_id,
            mode=mode,
        )
        self._audit.log(
            db,
            actor_user_id=caller.id,
            action="livekit_call_token_issued",
            target_type="livekit_call",
            target_id=self._tokens.room_audit_id(result.room_name),
            metadata={
                "call_id_length": len(call_id),
                "mode": mode.value,
                "peer_count": 2,
                "ttl_seconds": 300,
            },
        )
        return CallTokenIssue(token=result, peer_display_name=target.display_name)

    def _is_callable_user(self, user: User) -> bool:
        return user.is_active and user.matrix_user_id.endswith(
            f":{self._settings.matrix_server_name}"
        )
