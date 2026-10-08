import os
from collections.abc import Generator
from datetime import UTC, datetime

os.environ.setdefault("FAMILY_API_DATABASE_URL", "sqlite://")
os.environ.setdefault("FAMILY_API_ALLOW_SQLITE", "true")
os.environ.setdefault("FAMILY_API_SECRET_KEY", "test-secret-key-with-at-least-32-bytes")
os.environ.setdefault("FAMILY_API_INVITE_PEPPER", "test-invite-pepper-with-at-least-32-bytes")
os.environ.setdefault(
    "MATRIX_ADMIN_ACCESS_TOKEN",
    "test-matrix-admin-token-with-at-least-32-bytes",
)

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.base import Base
from app.main import create_app
from app.models.user import User, UserRole
from app.security.hashing import hash_password


class FakeMatrixAdmin:
    def __init__(self, server_name: str = "familychat.local") -> None:
        self.server_name = server_name
        self.created_users: list[dict] = []
        self.deactivated_users: list[str] = []
        self.display_name_updates: list[dict[str, str]] = []
        self.existing_user_ids: set[str] = set()
        self.created_rooms: list[dict] = []
        self.room_memberships: dict[str, set[str]] = {}
        self.joined_rooms: list[dict[str, str]] = []
        self.fail_create = False
        self.fail_deactivate = False
        self.fail_display_name_update = False
        self.fail_create_room = False
        self.fail_join_room = False

    def build_matrix_user_id(self, username: str) -> str:
        if username in {"admin", "administrator", "root", "support", "system", "synapse"}:
            from app.core.errors import MatrixUserConflictError

            raise MatrixUserConflictError("fake reserved localpart")
        return f"@{username}:{self.server_name}"

    def create_user(self, username: str, display_name: str, password: str) -> str:
        if self.fail_create:
            from app.core.errors import MatrixAdminError

            raise MatrixAdminError("fake create failure")
        matrix_user_id = self.build_matrix_user_id(username)
        if self.user_exists(matrix_user_id):
            from app.core.errors import MatrixUserConflictError

            raise MatrixUserConflictError("fake existing Matrix user")
        self.created_users.append(
            {
                "username": username,
                "display_name": display_name,
                "password": password,
                "matrix_user_id": matrix_user_id,
            }
        )
        self.existing_user_ids.add(matrix_user_id)
        return matrix_user_id

    def user_exists(self, matrix_user_id: str) -> bool:
        return matrix_user_id in self.existing_user_ids

    def update_user_display_name(self, matrix_user_id: str, display_name: str) -> None:
        if self.fail_display_name_update:
            from app.core.errors import MatrixAdminError

            raise MatrixAdminError("fake display name update failure")
        self.display_name_updates.append(
            {"display_name": display_name, "matrix_user_id": matrix_user_id}
        )

    def create_private_room(self, name: str, *, encrypted: bool = False) -> str:
        if self.fail_create_room:
            from app.core.errors import MatrixAdminError

            raise MatrixAdminError("fake room create failure")
        room_id = f"!room-{len(self.created_rooms) + 1}:{self.server_name}"
        self.created_rooms.append({"encrypted": encrypted, "matrix_room_id": room_id, "name": name})
        self.room_memberships.setdefault(room_id, set())
        return room_id

    def room_members(self, matrix_room_id: str) -> set[str]:
        return set(self.room_memberships.get(matrix_room_id, set()))

    def join_user_to_room(self, matrix_room_id: str, matrix_user_id: str) -> None:
        if self.fail_join_room:
            from app.core.errors import MatrixAdminError

            raise MatrixAdminError("fake room join failure")
        self.room_memberships.setdefault(matrix_room_id, set()).add(matrix_user_id)
        self.joined_rooms.append(
            {"matrix_room_id": matrix_room_id, "matrix_user_id": matrix_user_id}
        )

    def deactivate_user(self, matrix_user_id: str) -> None:
        if self.fail_deactivate:
            from app.core.errors import MatrixAdminError

            raise MatrixAdminError("fake deactivate failure")
        self.deactivated_users.append(matrix_user_id)


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path}/family-api-test.db",
        allow_sqlite=True,
        secret_key="test-secret-key-with-at-least-32-bytes",
        invite_pepper="test-invite-pepper-with-at-least-32-bytes",
        matrix_homeserver_url="http://synapse.test",
        matrix_server_name="familychat.local",
        matrix_admin_user="@admin:familychat.local",
        matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
        access_token_minutes=30,
        rate_limit_window_seconds=60,
        register_rate_limit=100,
        login_rate_limit=100,
        invite_rate_limit=100,
    )


@pytest.fixture
def fake_matrix() -> FakeMatrixAdmin:
    return FakeMatrixAdmin()


@pytest.fixture
def client(settings: Settings, fake_matrix: FakeMatrixAdmin) -> Generator[TestClient, None, None]:
    app = create_app(settings=settings, matrix_admin=fake_matrix)
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(app.state.engine)


@pytest.fixture
def db_session(client: TestClient):
    session = client.app.state.SessionLocal()
    try:
        yield session
    finally:
        session.close()


def create_user(
    db_session,
    *,
    username: str,
    display_name: str | None = None,
    family_code: str | None = None,
    role: UserRole = UserRole.member,
    is_active: bool = True,
    password: str = "secure-password",
) -> User:
    user = User(
        matrix_user_id=f"@{username}:familychat.local",
        username=username,
        display_name=display_name or username.title(),
        family_code=family_code or f"{username[:3].upper()}-0001",
        role=role,
        password_hash=hash_password(password),
        is_active=is_active,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def login(client: TestClient, username: str, password: str = "secure-password") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_user(db_session) -> User:
    return create_user(
        db_session,
        username="admin",
        display_name="Admin",
        family_code="ADM-0001",
        role=UserRole.admin,
    )


@pytest.fixture
def member_user(db_session) -> User:
    return create_user(
        db_session,
        username="member",
        display_name="Member",
        family_code="MEM-0001",
        role=UserRole.member,
    )


@pytest.fixture
def admin_headers(client: TestClient, admin_user: User) -> dict[str, str]:
    del admin_user
    return login(client, "admin")


@pytest.fixture
def member_headers(client: TestClient, member_user: User) -> dict[str, str]:
    del member_user
    return login(client, "member")
