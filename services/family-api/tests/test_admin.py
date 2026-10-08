import json
from datetime import UTC, datetime

from conftest import create_user, login

from app.models.audit_log import AuditLog
from app.models.push_subscription import PushPrivacyPreference, PushSubscription
from app.models.user import UserRole
from app.security.tokens import create_access_token


def inactive_headers(client, settings, db_session):
    inactive = create_user(
        db_session,
        username="inactive-admin",
        role=UserRole.admin,
        is_active=False,
    )
    token = create_access_token(inactive, settings)
    return {"Authorization": f"Bearer {token}"}


def user_item(response, username: str) -> dict:
    return next(item for item in response.json() if item["username"] == username)


def assert_no_sensitive_values(payload: object) -> None:
    serialized = json.dumps(payload)
    forbidden = [
        "password_hash",
        "matrixUserId",
        "matrix_user_id",
        "@member:familychat.local",
        "access_token",
        "LiveKit token",
        "LIVEKIT_API_SECRET",
        "push-secret",
        "p256dh-secret",
        "code_hash",
        "invite_pepper",
        "postgresql+psycopg",
        "Traceback",
        "!room",
        "$event",
    ]
    for marker in forbidden:
        assert marker not in serialized


def test_admin_endpoints_require_auth(client):
    endpoints = [
        ("GET", "/api/admin/users"),
        ("GET", "/api/admin/status"),
        ("GET", "/api/admin/audit"),
        ("GET", "/api/invites"),
    ]

    for method, path in endpoints:
        response = client.request(method, path)
        assert response.status_code == 401


def test_member_and_inactive_user_cannot_read_admin_surfaces(
    client,
    settings,
    db_session,
    member_headers,
):
    blocked_headers = [member_headers, inactive_headers(client, settings, db_session)]

    for headers in blocked_headers:
        assert client.get("/api/admin/users", headers=headers).status_code in {401, 403}
        assert client.get("/api/admin/status", headers=headers).status_code in {401, 403}
        assert client.get("/api/admin/audit", headers=headers).status_code in {401, 403}
        assert client.get("/api/invites", headers=headers).status_code in {401, 403}


def test_admin_can_list_users_safely(client, admin_headers, member_user):
    response = client.get("/api/admin/users", headers=admin_headers)

    assert response.status_code == 200
    usernames = {item["username"] for item in response.json()}
    assert "admin" in usernames
    assert member_user.username in usernames
    member = user_item(response, "member")
    assert member["adminRef"].startswith("user_")
    assert member["displayName"] == "Member"
    assert member["familyCode"] == "MEM-0001"
    assert member["role"] == "member"
    assert member["isActive"] is True
    assert member["technicalStatus"] == "active"
    assert member["canDeactivate"] is True
    assert member["deactivateBlockedReason"] is None
    assert "id" not in member
    assert "matrixUserId" not in member
    assert_no_sensitive_values(response.json())


def test_admin_can_deactivate_member(client, db_session, admin_headers, member_user, fake_matrix):
    users = client.get("/api/admin/users", headers=admin_headers)
    admin_ref = user_item(users, "member")["adminRef"]

    response = client.post(f"/api/admin/users/{admin_ref}/deactivate", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert member_user.matrix_user_id in fake_matrix.deactivated_users
    db_session.refresh(member_user)
    assert member_user.is_active is False


def test_member_cannot_deactivate_user(client, member_headers, admin_headers):
    users = client.get("/api/admin/users", headers=admin_headers)
    admin_ref = user_item(users, "admin")["adminRef"]

    response = client.post(f"/api/admin/users/{admin_ref}/deactivate", headers=member_headers)

    assert response.status_code == 403


def test_admin_cannot_deactivate_self(client, admin_headers):
    users = client.get("/api/admin/users", headers=admin_headers)
    admin = user_item(users, "admin")

    response = client.post(
        f"/api/admin/users/{admin['adminRef']}/deactivate",
        headers=admin_headers,
    )

    assert response.status_code == 409
    assert "own admin account" in response.json()["detail"]
    refreshed = client.get("/api/admin/users", headers=admin_headers)
    assert user_item(refreshed, "admin")["canDeactivate"] is False


def test_admin_cannot_deactivate_last_active_admin(
    client,
    db_session,
    admin_headers,
    admin_user,
):
    second_admin = create_user(db_session, username="secondadmin", role=UserRole.admin)
    second_headers = login(client, second_admin.username)
    users = client.get("/api/admin/users", headers=second_headers)
    first_admin_ref = user_item(users, admin_user.username)["adminRef"]

    response = client.post(f"/api/admin/users/{first_admin_ref}/deactivate", headers=second_headers)

    assert response.status_code == 200, response.text
    db_session.refresh(admin_user)
    assert admin_user.is_active is False

    users = client.get("/api/admin/users", headers=second_headers)
    last_admin = user_item(users, "secondadmin")
    assert last_admin["canDeactivate"] is False
    assert "last active admin" in last_admin["deactivateBlockedReason"].lower()


def test_matrix_deactivation_failure_is_safe(
    client,
    db_session,
    admin_headers,
    member_user,
    fake_matrix,
):
    fake_matrix.fail_deactivate = True
    users = client.get("/api/admin/users", headers=admin_headers)
    admin_ref = user_item(users, "member")["adminRef"]

    response = client.post(f"/api/admin/users/{admin_ref}/deactivate", headers=admin_headers)

    assert response.status_code == 502
    assert response.json()["detail"] == "User deactivation could not be completed"
    assert "fake" not in response.text.lower()
    db_session.refresh(member_user)
    assert member_user.is_active is True


def test_admin_status_is_safe(client, admin_headers):
    response = client.get("/api/admin/status", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["api"] == {"detail": "Family API is responding.", "status": "ok"}
    service_names = {item["name"] for item in body["services"]}
    assert {"Database", "Matrix", "LiveKit", "Web Push"} <= service_names
    blockers = {item["stage"]: item["status"] for item in body["stageBlockers"]}
    assert blockers == {
        "Stage 7": "partial",
        "Stage 8": "partial",
        "Stage 9": "partial",
        "Stage 10": "partial",
    }
    serialized = json.dumps(body)
    assert "DONE" not in serialized
    assert_no_sensitive_values(body)


def test_admin_diagnostics_lists_push_health_safely(
    client,
    db_session,
    admin_headers,
    member_user,
):
    db_session.add(
        PushSubscription(
            auth_secret="push-secret",
            content_encoding="aes128gcm",
            enabled=False,
            endpoint="https://push.example.test/private-endpoint",
            endpoint_hash="safe-hash-1",
            failure_count=2,
            last_failure_at=datetime(2026, 1, 1, tzinfo=UTC),
            last_failure_reason="expired",
            p256dh="p256dh-secret",
            privacy_preference=PushPrivacyPreference.sender_name,
            user_id=member_user.id,
        )
    )
    db_session.commit()

    response = client.get("/api/admin/diagnostics", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert "pushAvailable" in body
    assert "matrixPusherAppId" in body
    member = next(item for item in body["users"] if item["username"] == member_user.username)
    assert member["adminRef"].startswith("user_")
    assert member["activePushCount"] == 0
    assert member["totalPushCount"] == 1
    subscription = member["subscriptions"][0]
    assert subscription["subscriptionRef"].startswith("push_")
    assert subscription["enabled"] is False
    assert subscription["failureCount"] == 2
    assert subscription["lastFailureReason"] == "expired"
    assert "endpoint" not in json.dumps(subscription).lower()
    assert_no_sensitive_values(body)


def test_admin_audit_log_is_limited_and_sanitized(client, db_session, admin_headers, admin_user):
    db_session.add(
        AuditLog(
            actor_user_id=admin_user.id,
            action="message.body.leak-test",
            target_type="room",
            target_id="!room:familychat.local",
            event_metadata={
                "label": "SAFE",
                "media_url": "mxc://familychat.local/private",
                "message_body": "private message body",
                "matrix_user_id": "@member:familychat.local",
                "token": "secret-token",
            },
        )
    )
    for index in range(30):
        db_session.add(
            AuditLog(
                actor_user_id=admin_user.id,
                action=f"invite.created.{index}",
                target_type="invite",
                target_id=f"invite-{index}",
                event_metadata={"label": f"SAFE{index}", "max_uses": 1},
            )
        )
    db_session.commit()

    response = client.get("/api/admin/audit?limit=5", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 5
    assert body["offset"] == 0
    assert len(body["items"]) == 5
    assert_no_sensitive_values(body)
    for item in body["items"]:
        assert "createdAt" in item
        assert "actorLabel" in item
        assert "targetLabel" in item
        assert "targetType" in item
        assert item["targetType"] in {"invite", "technical", "user"}
        assert "target_id" not in item
