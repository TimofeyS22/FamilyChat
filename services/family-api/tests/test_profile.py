from conftest import create_user

from app.models.user import UserRole


def test_profile_requires_auth(client):
    response = client.get("/api/profile/me")
    assert response.status_code == 401


def test_profile_inactive_user_denied(client, db_session):
    create_user(db_session, username="inactive", is_active=False)

    response = client.post(
        "/api/auth/login",
        json={"username": "inactive", "password": "secure-password"},
    )

    assert response.status_code == 401


def test_profile_active_user_allowed(client, member_headers):
    response = client.get("/api/profile/me", headers=member_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "member"
    assert payload["displayName"] == "Member"
    assert payload["familyCode"] == "MEM-0001"
    assert payload["role"] == "member"
    assert payload["isActive"] is True
    assert payload["avatarUrl"] is None
    assert "createdAt" in payload
    assert "updatedAt" in payload
    assert "e2eeSessionHint" in payload


def test_profile_current_user_endpoint_has_no_other_user_route(client, db_session, member_headers):
    other = create_user(db_session, username="other", family_code="OTH-0001")

    response = client.get(f"/api/profile/{other.id}", headers=member_headers)

    assert response.status_code == 404


def test_profile_response_excludes_sensitive_fields(client, db_session, member_headers):
    del db_session
    response = client.get("/api/profile/me", headers=member_headers)

    assert response.status_code == 200
    payload = response.json()
    forbidden = {
        "id",
        "password_hash",
        "passwordHash",
        "matrix_user_id",
        "matrixUserId",
        "access_token",
        "accessToken",
        "matrixAdminToken",
        "livekitToken",
        "pushEndpoint",
        "p256dh",
        "auth",
        "code_hash",
        "codeHash",
        "invitePepper",
        "databaseUrl",
        "jwtSecret",
    }
    assert forbidden.isdisjoint(payload)


def test_update_display_name_trims_persists_and_syncs_matrix(
    client,
    db_session,
    fake_matrix,
    member_user,
    member_headers,
):
    before = member_user.updated_at

    response = client.patch(
        "/api/profile/me",
        headers=member_headers,
        json={"displayName": "  Updated Member  "},
    )

    assert response.status_code == 200
    assert response.json()["displayName"] == "Updated Member"
    db_session.refresh(member_user)
    assert member_user.display_name == "Updated Member"
    assert member_user.updated_at >= before
    assert fake_matrix.display_name_updates == [
        {
            "display_name": "Updated Member",
            "matrix_user_id": "@member:familychat.local",
        }
    ]


def test_update_display_name_rejects_empty(client, member_headers):
    response = client.patch(
        "/api/profile/me",
        headers=member_headers,
        json={"displayName": "   "},
    )

    assert response.status_code == 422


def test_update_display_name_rejects_too_long(client, member_headers):
    response = client.patch(
        "/api/profile/me",
        headers=member_headers,
        json={"displayName": "A" * 121},
    )

    assert response.status_code == 422


def test_profile_update_rejects_forbidden_fields(client, db_session, member_user, member_headers):
    response = client.patch(
        "/api/profile/me",
        headers=member_headers,
        json={
            "displayName": "Still Member",
            "role": "admin",
            "isActive": False,
            "familyCode": "ADM-9999",
            "matrixUserId": "@admin:familychat.local",
            "passwordHash": "not-allowed",
        },
    )

    assert response.status_code == 422
    db_session.refresh(member_user)
    assert member_user.display_name == "Member"
    assert member_user.role == UserRole.member
    assert member_user.is_active is True
    assert member_user.family_code == "MEM-0001"
    assert member_user.matrix_user_id == "@member:familychat.local"
    assert member_user.password_hash != "not-allowed"


def test_profile_patch_requires_current_user_auth(client):
    response = client.patch("/api/profile/me", json={"displayName": "No Auth"})
    assert response.status_code == 401


def test_update_display_name_matrix_sync_failure_rolls_back(
    client,
    db_session,
    fake_matrix,
    member_user,
    member_headers,
):
    fake_matrix.fail_display_name_update = True

    response = client.patch(
        "/api/profile/me",
        headers=member_headers,
        json={"displayName": "Unsynced Member"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Profile display name sync failed"
    db_session.refresh(member_user)
    assert member_user.display_name == "Member"
