from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


class AuditService:
    def log(
        self,
        db: Session,
        *,
        actor_user_id: UUID | None,
        action: str,
        target_type: str,
        target_id: str | None = None,
        metadata: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            event_metadata=metadata or {},
        )
        db.add(entry)
        return entry
