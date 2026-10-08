from conftest import FakeMatrixAdmin
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_configured_web_origin_can_preflight_authorized_family_api(client):
    response = client.options(
        "/api/family/users",
        headers={
            "Access-Control-Request-Headers": "Authorization",
            "Access-Control-Request-Method": "GET",
            "Origin": "http://localhost:3000",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "Authorization" in response.headers["access-control-allow-headers"]


def test_configured_web_origin_can_preflight_profile_patch(client):
    response = client.options(
        "/api/profile/me",
        headers={
            "Access-Control-Request-Headers": "Authorization, Content-Type",
            "Access-Control-Request-Method": "PATCH",
            "Origin": "http://localhost:3000",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "PATCH" in response.headers["access-control-allow-methods"]


def test_production_web_origin_can_preflight_profile_patch(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/family-api-test.db",
        allow_sqlite=True,
        secret_key="test-secret-key-with-at-least-32-bytes",
        invite_pepper="test-invite-pepper-with-at-least-32-bytes",
        matrix_admin_access_token="test-matrix-admin-token-with-at-least-32-bytes",
        cors_allowed_origins="https://chat.example.invalid",
    )
    app = create_app(settings=settings, matrix_admin=FakeMatrixAdmin())
    with TestClient(app) as production_client:
        response = production_client.options(
            "/api/profile/me",
            headers={
                "Access-Control-Request-Headers": "Authorization, Content-Type",
                "Access-Control-Request-Method": "PATCH",
                "Origin": "https://chat.example.invalid",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://chat.example.invalid"
    assert "PATCH" in response.headers["access-control-allow-methods"]


def test_unknown_origin_is_not_allowed_for_family_api_preflight(client):
    response = client.options(
        "/api/family/users",
        headers={
            "Access-Control-Request-Headers": "Authorization",
            "Access-Control-Request-Method": "GET",
            "Origin": "https://evil.example",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
