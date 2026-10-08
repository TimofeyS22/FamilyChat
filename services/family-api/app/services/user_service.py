from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import (
    AdminBootstrapError,
    DuplicateUsernameError,
    MatrixAdminError,
    MatrixUserConflictError,
)
from app.models.user import User, UserRole
from app.schemas.auth import RegisterRequest
from app.security.hashing import hash_password, verify_password
from app.services.audit_service import AuditService
from app.services.family_code_service import FamilyCodeService
from app.services.invite_service import InviteService
from app.services.matrix_admin import MatrixAdminService


class UserService:
    def __init__(
        self,
        settings: Settings,
        matrix_admin: MatrixAdminService,
        invite_service: InviteService | None = None,
        family_code_service: FamilyCodeService | None = None,
        audit_service: AuditService | None = None,
    ) -> None:
        self._settings = settings
        self._matrix_admin = matrix_admin
        self._invite_service = invite_service or InviteService(settings)
        self._family_code_service = family_code_service or FamilyCodeService()
        self._audit_service = audit_service or AuditService()

    def register_user(self, db: Session, request: RegisterRequest) -> User:
        existing = db.scalar(select(User).where(User.username == request.username))
        if existing is not None:
            raise DuplicateUsernameError

        invite = self._invite_service.get_available_invite_for_update(db, request.invite_code)
        display_name = invite.bound_display_name or request.display_name
        password_hash = hash_password(request.password)
        family_code = self._family_code_service.generate(
            db,
            username=request.username,
            display_name=display_name,
        )
        try:
            matrix_user_id = self._matrix_admin.build_matrix_user_id(request.username)
        except MatrixUserConflictError as exc:
            raise DuplicateUsernameError from exc

        user = User(
            matrix_user_id=matrix_user_id,
            username=request.username,
            display_name=display_name,
            family_code=family_code,
            role=UserRole.member,
            password_hash=password_hash,
        )
        db.add(user)
        self._invite_service.consume(invite)
        try:
            db.flush()
        except IntegrityError as exc:
            raise DuplicateUsernameError from exc

        matrix_created = False
        try:
            created_matrix_user_id = self._matrix_admin.create_user(
                username=request.username,
                display_name=display_name,
                password=request.password,
            )
            matrix_created = True
            if created_matrix_user_id != matrix_user_id:
                raise MatrixAdminError("Matrix user id mismatch")
        except MatrixUserConflictError as exc:
            raise DuplicateUsernameError from exc
        except MatrixAdminError:
            raise

        try:
            self._audit_service.log(
                db,
                actor_user_id=user.id,
                action="invite.consumed",
                target_type="invite",
                target_id=str(invite.id),
                metadata={
                    "label": invite.label,
                    "max_uses": invite.max_uses,
                    "used_count": invite.used_count,
                },
            )
            self._audit_service.log(
                db,
                actor_user_id=user.id,
                action="user.registered",
                target_type="user",
                target_id=str(user.id),
                metadata={"role": user.role.value},
            )
            db.flush()
        except SQLAlchemyError:
            if matrix_created:
                self.compensate_matrix_user(user.matrix_user_id)
            raise
        return user

    def bootstrap_admin(
        self,
        db: Session,
        *,
        username: str,
        display_name: str,
        password: str,
    ) -> User:
        existing_admin = db.scalar(select(User.id).where(User.role == UserRole.admin))
        if existing_admin is not None:
            raise AdminBootstrapError("An admin user already exists")
        existing_user = db.scalar(select(User.id).where(User.username == username))
        if existing_user is not None:
            raise DuplicateUsernameError

        try:
            matrix_user_id = self._matrix_admin.build_matrix_user_id(username)
        except MatrixUserConflictError as exc:
            raise DuplicateUsernameError from exc

        user = User(
            matrix_user_id=matrix_user_id,
            username=username,
            display_name=display_name,
            family_code=self._family_code_service.generate(
                db,
                username=username,
                display_name=display_name,
            ),
            role=UserRole.admin,
            password_hash=hash_password(password),
        )
        db.add(user)
        try:
            db.flush()
        except IntegrityError as exc:
            raise DuplicateUsernameError from exc

        matrix_created = False
        try:
            created_matrix_user_id = self._matrix_admin.create_user(
                username=username,
                display_name=display_name,
                password=password,
            )
            matrix_created = True
            if created_matrix_user_id != matrix_user_id:
                raise MatrixAdminError("Matrix user id mismatch")
            self._audit_service.log(
                db,
                actor_user_id=user.id,
                action="admin.bootstrapped",
                target_type="user",
                target_id=str(user.id),
                metadata={"role": user.role.value},
            )
            db.flush()
        except MatrixUserConflictError as exc:
            raise DuplicateUsernameError from exc
        except SQLAlchemyError:
            if matrix_created:
                self.compensate_matrix_user(user.matrix_user_id)
            raise
        return user

    def compensate_matrix_user(self, matrix_user_id: str) -> None:
        try:
            self._matrix_admin.deactivate_user(matrix_user_id)
        except MatrixAdminError:
            # Best-effort cleanup; callers still report the original failure.
            return

    def authenticate(self, db: Session, *, username: str, password: str) -> User | None:
        user = db.scalar(select(User).where(User.username == username))
        if user is None or not user.is_active:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user

    def active_family_users(self, db: Session) -> list[User]:
        return list(
            db.scalars(
                select(User).where(User.is_active.is_(True)).order_by(User.display_name.asc())
            )
        )

    def search_active_by_family_code(self, db: Session, *, family_code: str) -> User | None:
        normalized = family_code.strip().upper()
        return db.scalar(
            select(User).where(User.family_code == normalized, User.is_active.is_(True))
        )

    def all_users_for_admin(self, db: Session) -> list[User]:
        return list(db.scalars(select(User).order_by(User.created_at.desc())))

    def deactivate_user(self, db: Session, *, actor: User, user: User) -> User:
        if user.is_active:
            self._matrix_admin.deactivate_user(user.matrix_user_id)
            user.is_active = False
            self._audit_service.log(
                db,
                actor_user_id=actor.id,
                action="user.deactivated",
                target_type="user",
                target_id=str(user.id),
                metadata={"role": user.role.value},
            )
        return user
