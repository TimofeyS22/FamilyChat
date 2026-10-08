from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import SQLAlchemyError

from app.models.audit_log import AuditLog
from app.models.family_room import FamilyRoom
from app.models.invite import InviteCode
from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.security.hashing import hash_invite_code, verify_password
from app.services.user_service import UserService


def _create_invite(client, admin_headers, label="Mama", **overrides) -> str:
    payload = {"label": label, "maxUses": 1}
    payload.update(overrides)
    response = client.post("/api/invites", headers=admin_headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()["code"]


def test_register_with_valid_invite_creates_matrix_and_local_user(
    client,
    db_session,
    admin_headers,
    fake_matrix,
):
    code = _create_invite(client, admin_headers, label="Tim", boundDisplayName="Timofey")

    response = client.post(
        "/api/auth/register",
        json={
            "displayName": "Ignored Because Bound",
            "username": "timofey",
            "password": "secure-password",
            "inviteCode": code,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["success"] is True
    assert body["userId"] == "timofey"
    assert body["matrixUserId"] == "@timofey:familychat.local"
    assert body["familyCode"].startswith("TIM-")

    user = db_session.query(User).filter_by(username="timofey").one()
    assert user.display_name == "Timofey"
    assert user.password_hash != "secure-password"
    assert verify_password("secure-password", user.password_hash)
    assert fake_matrix.created_users[0]["username"] == "timofey"
    assert fake_matrix.created_users[0]["display_name"] == "Timofey"
    assert fake_matrix.created_users[0]["password"] == "secure-password"
    assert fake_matrix.created_rooms == [
        {
            "encrypted": False,
            "matrix_room_id": "!room-1:familychat.local",
            "name": "Family Chat",
        }
    ]
    assert fake_matrix.joined_rooms[-1] == {
        "matrix_room_id": "!room-1:familychat.local",
        "matrix_user_id": "@timofey:familychat.local",
    }
    assert (
        db_session.query(FamilyRoom).filter_by(kind="common").one().matrix_room_id
        == "!room-1:familychat.local"
    )


def test_register_succeeds_when_common_room_join_is_pending(
    client,
    db_session,
    admin_headers,
    fake_matrix,
):
    code = _create_invite(client, admin_headers, label="Pending")
    fake_matrix.fail_join_room = True

    response = client.post(
        "/api/auth/register",
        json={
            "displayName": "Pending",
            "username": "pending",
            "password": "secure-password",
            "inviteCode": code,
        },
    )

    assert response.status_code == 201, response.text
    assert db_session.query(User).filter_by(username="pending").one().matrix_user_id
    pending_log = (
        db_session.query(AuditLog)
        .filter_by(action="common_room.join_pending", target_type="user")
        .one()
    )
    assert pending_log.event_metadata["matrix_user_id"] == "@pending:familychat.local"


def test_register_with_invalid_invite_fails_generically(client):
    response = client.post(
        "/api/auth/register",
        json={
            "displayName": "Timofey",
            "username": "timofey",
            "password": "secure-password",
            "inviteCode": "NOPE-0000",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or unavailable invite code"


def test_register_with_reused_one_time_invite_fails(client, admin_headers):
    code = _create_invite(client, admin_headers)
    first = client.post(
        "/api/auth/register",
        json={
            "displayName": "One",
            "username": "oneuser",
            "password": "secure-password",
            "inviteCode": code,
        },
    )
    assert first.status_code == 201

    second = client.post(
        "/api/auth/register",
        json={
            "displayName": "Two",
            "username": "twouser",
            "password": "secure-password",
            "inviteCode": code,
        },
    )
    assert second.status_code == 400
    assert second.json()["detail"] == "Invalid or unavailable invite code"


def test_register_with_expired_invite_fails(client, db_session, settings, admin_user):
    expired_code = "OLD-0001"
    invite = InviteCode(
        code_hash=hash_invite_code(expired_code, settings.invite_pepper),
        label="OLD",
        expires_at=datetime.now(UTC) - timedelta(days=1),
        max_uses=1,
        used_count=0,
        created_by_user_id=admin_user.id,
    )
    db_session.add(invite)
    db_session.commit()

    response = client.post(
        "/api/auth/register",
        json={
            "displayName": "Old",
            "username": "olduser",
            "password": "secure-password",
            "inviteCode": expired_code,
        },
    )

    assert response.status_code == 400


def test_duplicate_username_fails_safely(client, admin_headers, member_user):
    del member_user
    code = _create_invite(client, admin_headers)

    response = client.post(
        "/api/auth/register",
        json={
            "displayName": "Member Again",
            "username": "member",
            "password": "secure-password",
            "inviteCode": code,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Username is not available"


def test_register_refuses_reserved_matrix_localpart(client, admin_headers, fake_matrix):
    code = _create_invite(client, admin_headers, label="Root")

    response = client.post(
        "/api/auth/register",
        json={
            "displayName": "Root",
            "username": "root",
            "password": "secure-password",
            "inviteCode": code,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Username is not available"
    assert fake_matrix.created_users == []


def test_register_refuses_existing_remote_matrix_user_without_consuming_invite(
    client,
    db_session,
    admin_headers,
    fake_matrix,
    settings,
):
    code = _create_invite(client, admin_headers, label="Remote")
    fake_matrix.existing_user_ids.add("@remoteuser:familychat.local")

    response = client.post(
        "/api/auth/register",
        json={
            "displayName": "Remote User",
            "username": "remoteuser",
            "password": "secure-password",
            "inviteCode": code,
        },
    )

    assert response.status_code == 409
    assert fake_matrix.created_users == []
    invite = (
        db_session.query(InviteCode)
        .filter_by(code_hash=hash_invite_code(code, settings.invite_pepper))
        .one()
    )
    assert invite.used_count == 0
    assert invite.used_at is None


def test_registration_compensates_matrix_user_after_local_post_create_failure(
    db_session,
    settings,
    fake_matrix,
    admin_user,
):
    code = "COMP-1234567890"
    invite = InviteCode(
        code_hash=hash_invite_code(code, settings.invite_pepper),
        label="COMP",
        max_uses=1,
        used_count=0,
        created_by_user_id=admin_user.id,
    )
    db_session.add(invite)
    db_session.commit()

    class FailingAuditService:
        def log(self, *args, **kwargs):
            raise SQLAlchemyError("forced local failure")

    service = UserService(
        settings=settings,
        matrix_admin=fake_matrix,
        audit_service=FailingAuditService(),
    )

    try:
        service.register_user(
            db_session,
            request=RegisterRequest.model_validate(
                {
                    "displayName": "Compensate",
                    "username": "compensate",
                    "password": "secure-password",
                    "inviteCode": code,
                }
            ),
        )
    except SQLAlchemyError:
        assert "@compensate:familychat.local" in fake_matrix.deactivated_users
        return
    raise AssertionError("registration did not fail")
