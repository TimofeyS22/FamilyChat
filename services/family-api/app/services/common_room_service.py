from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import MatrixAdminError
from app.models.audit_log import AuditLog
from app.models.family_room import FamilyRoom
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.matrix_admin import MatrixAdminService

COMMON_ROOM_KIND = "common"
COMMON_ROOM_NAME = "Family Chat"


@dataclass
class CommonRoomReconcileResult:
    room_id: str | None
    joined: list[str] = field(default_factory=list)
    already_joined: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


class CommonRoomService:
    def __init__(
        self,
        *,
        matrix_admin: MatrixAdminService,
        audit_service: AuditService | None = None,
    ) -> None:
        self._matrix_admin = matrix_admin
        self._audit_service = audit_service or AuditService()

    def ensure_common_room(self, db: Session) -> FamilyRoom:
        existing = db.scalar(select(FamilyRoom).where(FamilyRoom.kind == COMMON_ROOM_KIND))
        if existing is not None:
            return existing

        matrix_room_id = self._matrix_admin.create_private_room(COMMON_ROOM_NAME)
        room = FamilyRoom(
            kind=COMMON_ROOM_KIND,
            name=COMMON_ROOM_NAME,
            matrix_room_id=matrix_room_id,
        )
        db.add(room)
        db.flush()
        self._audit_service.log(
            db,
            actor_user_id=None,
            action="common_room.created",
            target_type="matrix_room",
            target_id=matrix_room_id,
            metadata={"kind": COMMON_ROOM_KIND},
        )
        return room

    def join_user(self, db: Session, user: User) -> bool:
        try:
            room = self.ensure_common_room(db)
            self._matrix_admin.join_user_to_room(room.matrix_room_id, user.matrix_user_id)
            self._audit_service.log(
                db,
                actor_user_id=user.id,
                action="common_room.user_joined",
                target_type="matrix_room",
                target_id=room.matrix_room_id,
                metadata={"matrix_user_id": user.matrix_user_id},
            )
            db.flush()
            return True
        except MatrixAdminError:
            db.add(
                AuditLog(
                    actor_user_id=user.id,
                    action="common_room.join_pending",
                    target_type="user",
                    target_id=str(user.id),
                    event_metadata={"matrix_user_id": user.matrix_user_id},
                )
            )
            db.flush()
            return False

    def try_join_user(self, db: Session, user: User) -> bool:
        try:
            return self.join_user(db, user)
        except SQLAlchemyError:
            raise
        except Exception:
            return False

    def reconcile_active_users(self, db: Session) -> CommonRoomReconcileResult:
        room = self.ensure_common_room(db)
        active_users = list(
            db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.created_at.asc()))
        )
        try:
            members = self._matrix_admin.room_members(room.matrix_room_id)
        except MatrixAdminError:
            members = set()

        result = CommonRoomReconcileResult(room_id=room.matrix_room_id)
        for user in active_users:
            if user.matrix_user_id in members:
                result.already_joined.append(user.matrix_user_id)
                continue
            try:
                self._matrix_admin.join_user_to_room(room.matrix_room_id, user.matrix_user_id)
                self._audit_service.log(
                    db,
                    actor_user_id=user.id,
                    action="common_room.user_joined",
                    target_type="matrix_room",
                    target_id=room.matrix_room_id,
                    metadata={"matrix_user_id": user.matrix_user_id, "source": "reconcile"},
                )
                result.joined.append(user.matrix_user_id)
            except MatrixAdminError:
                db.add(
                    AuditLog(
                        actor_user_id=user.id,
                        action="common_room.join_pending",
                        target_type="user",
                        target_id=str(user.id),
                        event_metadata={"matrix_user_id": user.matrix_user_id},
                    )
                )
                result.failed.append(user.matrix_user_id)
        db.flush()
        return result
