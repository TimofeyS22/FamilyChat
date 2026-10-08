import re
import secrets
import string
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import InvalidInviteError
from app.models.invite import InviteCode
from app.models.user import User
from app.security.hashing import hash_invite_code, normalize_invite_code
from app.services.audit_service import AuditService

LABEL_RE = re.compile(r"[^A-Z0-9]+")


class InviteService:
    def __init__(self, settings: Settings, audit_service: AuditService | None = None) -> None:
        self._settings = settings
        self._audit_service = audit_service or AuditService()

    def create_invite(
        self,
        db: Session,
        *,
        actor: User,
        label: str,
        bound_display_name: str | None,
        expires_at: datetime | None,
        max_uses: int,
    ) -> tuple[InviteCode, str]:
        sanitized_label = self._sanitize_label(label)
        code = self._new_unique_code(db, sanitized_label)
        invite = InviteCode(
            code_hash=hash_invite_code(code, self._settings.invite_pepper),
            label=sanitized_label,
            bound_display_name=bound_display_name,
            expires_at=expires_at,
            max_uses=max_uses,
            created_by_user_id=actor.id,
        )
        db.add(invite)
        db.flush()
        self._audit_service.log(
            db,
            actor_user_id=actor.id,
            action="invite.created",
            target_type="invite",
            target_id=str(invite.id),
            metadata={
                "label": sanitized_label,
                "max_uses": max_uses,
                "expires_at": expires_at.isoformat() if expires_at else None,
            },
        )
        return invite, code

    def list_invites(self, db: Session) -> list[InviteCode]:
        return list(db.scalars(select(InviteCode).order_by(InviteCode.created_at.desc())))

    def status_for(self, invite: InviteCode) -> str:
        now = datetime.now(UTC)
        if invite.disabled_at is not None:
            return "disabled"
        if invite.used_count >= invite.max_uses:
            return "used"
        if invite.expires_at is not None and self._as_utc(invite.expires_at) <= now:
            return "expired"
        return "unused"

    def disable_invite(self, db: Session, *, actor: User, invite_id: UUID) -> InviteCode | None:
        invite = db.get(InviteCode, invite_id)
        if invite is None:
            return None
        if invite.disabled_at is None:
            invite.disabled_at = datetime.now(UTC)
            self._audit_service.log(
                db,
                actor_user_id=actor.id,
                action="invite.disabled",
                target_type="invite",
                target_id=str(invite.id),
                metadata={"label": invite.label},
            )
        return invite

    def get_available_invite_for_update(self, db: Session, code: str) -> InviteCode:
        code_hash = hash_invite_code(code, self._settings.invite_pepper)
        invite = db.scalar(
            select(InviteCode).where(InviteCode.code_hash == code_hash).with_for_update()
        )
        if invite is None or not self._is_available(invite):
            raise InvalidInviteError
        return invite

    def consume(self, invite: InviteCode) -> None:
        if not self._is_available(invite):
            raise InvalidInviteError
        invite.used_count += 1
        invite.used_at = datetime.now(UTC)

    def _new_unique_code(self, db: Session, label: str) -> str:
        for _ in range(100):
            alphabet = string.ascii_uppercase + string.digits
            random_part = "".join(secrets.choice(alphabet) for _ in range(10))
            code = normalize_invite_code(f"{label}-{random_part}")
            code_hash = hash_invite_code(code, self._settings.invite_pepper)
            exists = db.scalar(select(InviteCode.id).where(InviteCode.code_hash == code_hash))
            if not exists:
                return code
        raise RuntimeError("Unable to generate unique invite code")

    def _sanitize_label(self, label: str) -> str:
        normalized = LABEL_RE.sub("", label.upper()).strip()
        if not normalized:
            normalized = "FAMILY"
        return normalized[:16]

    def _is_available(self, invite: InviteCode) -> bool:
        now = datetime.now(UTC)
        if invite.disabled_at is not None:
            return False
        if invite.expires_at is not None and self._as_utc(invite.expires_at) <= now:
            return False
        return invite.used_count < invite.max_uses

    def _as_utc(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
