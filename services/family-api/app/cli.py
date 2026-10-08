import argparse
import sys

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AdminBootstrapError, DuplicateUsernameError, MatrixAdminError
from app.db.session import create_db_engine, create_session_factory
from app.integrations.synapse import SynapseAdminClient
from app.models.user import User
from app.services.common_room_service import CommonRoomService
from app.services.matrix_admin import MatrixAdminService
from app.services.user_service import UserService


def bootstrap_admin_user(
    db: Session,
    *,
    settings: Settings,
    matrix_admin: MatrixAdminService,
    username: str,
    display_name: str,
    password: str,
) -> User:
    if len(password) < 8 or password.strip() != password:
        raise ValueError("Password does not meet the minimal policy")
    if not display_name.strip():
        raise ValueError("Display name is required")
    service = UserService(settings=settings, matrix_admin=matrix_admin)
    return service.bootstrap_admin(
        db,
        username=username.strip().lower(),
        display_name=display_name.strip(),
        password=password,
    )


def run_bootstrap_admin(args: argparse.Namespace) -> int:
    settings = Settings()
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    matrix_admin = MatrixAdminService(SynapseAdminClient(settings), settings)
    user: User | None = None

    with session_factory() as db:
        try:
            user = bootstrap_admin_user(
                db,
                settings=settings,
                matrix_admin=matrix_admin,
                username=args.username,
                display_name=args.display_name,
                password=args.password,
            )
            db.commit()
        except (AdminBootstrapError, DuplicateUsernameError, MatrixAdminError, ValueError) as exc:
            db.rollback()
            print(f"bootstrap-admin failed: {exc}", file=sys.stderr)
            return 1
        except SQLAlchemyError as exc:
            db.rollback()
            if user is not None:
                UserService(settings=settings, matrix_admin=matrix_admin).compensate_matrix_user(
                    user.matrix_user_id
                )
            print(
                f"bootstrap-admin failed: database error: {exc.__class__.__name__}",
                file=sys.stderr,
            )
            return 1

    print(
        "bootstrap-admin created "
        f"username={user.username} matrixUserId={user.matrix_user_id} familyCode={user.family_code}"
    )
    return 0


def run_reconcile_common_room(args: argparse.Namespace) -> int:
    del args
    settings = Settings()
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    matrix_admin = MatrixAdminService(SynapseAdminClient(settings), settings)

    with session_factory() as db:
        try:
            result = CommonRoomService(matrix_admin=matrix_admin).reconcile_active_users(db)
            db.commit()
        except (MatrixAdminError, SQLAlchemyError) as exc:
            db.rollback()
            print(
                f"reconcile-common-room failed: {exc.__class__.__name__}",
                file=sys.stderr,
            )
            return 1

    print(
        "reconcile-common-room complete "
        f"roomId={result.room_id} "
        f"joined={len(result.joined)} "
        f"alreadyJoined={len(result.already_joined)} "
        f"failed={len(result.failed)}"
    )
    if result.failed:
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="family-api")
    subcommands = parser.add_subparsers(dest="command", required=True)

    bootstrap = subcommands.add_parser(
        "bootstrap-admin",
        help="Create the first local Family API admin from a trusted shell",
    )
    bootstrap.add_argument("--username", required=True)
    bootstrap.add_argument("--display-name", required=True)
    bootstrap.add_argument("--password", required=True)
    bootstrap.set_defaults(func=run_bootstrap_admin)

    reconcile = subcommands.add_parser(
        "reconcile-common-room",
        help="Ensure active local users are joined to the canonical Family Chat room",
    )
    reconcile.set_defaults(func=run_reconcile_common_room)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
