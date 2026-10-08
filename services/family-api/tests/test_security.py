from app.core.config import Settings
from app.models.invite import InviteCode
from app.models.user import User


def test_login_success_and_wrong_password(client, member_user):
    del member_user
    success = client.post(
        "/api/auth/login",
        json={"username": "member", "password": "secure-password"},
    )
    assert success.status_code == 200
    assert success.json()["tokenType"] == "bearer"
    assert "accessToken" in success.json()

    failure = client.post(
        "/api/auth/login",
        json={"username": "member", "password": "wrong-password"},
    )
    assert failure.status_code == 401


def test_invite_and_password_are_not_stored_raw(client, db_session, admin_headers):
    created = client.post(
        "/api/invites",
        headers=admin_headers,
        json={"label": "Safe"},
    )
    invite_code = created.json()["code"]

    registered = client.post(
        "/api/auth/register",
        json={
            "displayName": "Safe User",
            "username": "safeuser",
            "password": "secure-password",
            "inviteCode": invite_code,
        },
    )
    assert registered.status_code == 201

    invite = db_session.query(InviteCode).filter_by(label="SAFE").one()
    user = db_session.query(User).filter_by(username="safeuser").one()
    assert invite.code_hash != invite_code
    assert invite_code not in invite.code_hash
    assert user.password_hash != "secure-password"


def test_raw_admin_token_is_not_exposed(client, admin_headers, settings):
    response = client.get("/api/admin/users", headers=admin_headers)
    serialized = response.text

    assert response.status_code == 200
    assert settings.matrix_admin_access_token not in serialized


def test_rate_limiter_blocks_after_limit(settings):
    from app.core.errors import RateLimitExceededError
    from app.security.rate_limit import InMemoryRateLimiter

    limiter = InMemoryRateLimiter(window_seconds=settings.rate_limit_window_seconds)
    limiter.check("login:test", limit=2)
    limiter.check("login:test", limit=2)
    try:
        limiter.check("login:test", limit=2)
    except RateLimitExceededError:
        return
    raise AssertionError("rate limiter did not block")


def test_settings_reject_placeholder_runtime_secrets():
    try:
        Settings(
            database_url="postgresql+psycopg://familychat:secret@postgres:5432/familychat",
            secret_key="change-me",
            invite_pepper="test-invite-pepper-with-at-least-32-bytes",
            matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
        )
    except ValueError:
        return
    raise AssertionError("placeholder secret key was accepted")


def test_settings_reject_angle_bracket_production_placeholders():
    try:
        Settings(
            database_url="postgresql+psycopg://familychat:secret@postgres:5432/familychat",
            secret_key="<change-me-private-family-api-jwt-secret-at-least-32-chars>",
            invite_pepper="test-invite-pepper-with-at-least-32-bytes",
            matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
        )
    except ValueError:
        return
    raise AssertionError("angle-bracket production placeholder secret key was accepted")


def test_settings_reject_sqlite_without_explicit_test_override():
    try:
        Settings(
            database_url="sqlite:///./unsafe.db",
            allow_sqlite=False,
            secret_key="test-secret-key-with-at-least-32-bytes",
            invite_pepper="test-invite-pepper-with-at-least-32-bytes",
            matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
        )
    except ValueError:
        return
    raise AssertionError("SQLite runtime database was accepted without override")


def test_settings_reject_placeholder_web_push_secrets_when_enabled():
    try:
        Settings(
            database_url="sqlite:///./test.db",
            allow_sqlite=True,
            secret_key="test-secret-key-with-at-least-32-bytes",
            invite_pepper="test-invite-pepper-with-at-least-32-bytes",
            matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
            web_push_enabled=True,
            web_push_vapid_public_key="change-me",
            web_push_vapid_private_key="change-me",
            web_push_subject="mailto:test@example.com",
        )
    except ValueError:
        return
    raise AssertionError("placeholder Web Push secrets were accepted")


def test_settings_reject_placeholder_livekit_secrets_when_calls_enabled():
    try:
        Settings(
            database_url="sqlite:///./test.db",
            allow_sqlite=True,
            secret_key="test-secret-key-with-at-least-32-bytes",
            invite_pepper="test-invite-pepper-with-at-least-32-bytes",
            matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
            livekit_calls_enabled=True,
            livekit_url="wss://livekit.test:7880",
            livekit_api_key="change-me",
            livekit_api_secret="change-me",
        )
    except ValueError:
        return
    raise AssertionError("placeholder LiveKit secrets were accepted")


def test_settings_reject_short_livekit_secret_when_calls_enabled():
    try:
        Settings(
            database_url="sqlite:///./test.db",
            allow_sqlite=True,
            secret_key="test-secret-key-with-at-least-32-bytes",
            invite_pepper="test-invite-pepper-with-at-least-32-bytes",
            matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
            livekit_calls_enabled=True,
            livekit_url="wss://livekit.test:7880",
            livekit_api_key="localtestkey",
            livekit_api_secret="too-short-livekit-secret",
        )
    except ValueError:
        return
    raise AssertionError("short LiveKit secret was accepted")
