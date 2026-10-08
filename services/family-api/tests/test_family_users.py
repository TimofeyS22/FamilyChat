from conftest import create_user

from app.models.user import UserRole


def test_list_family_users_hides_inactive(client, db_session, member_headers):
    create_user(
        db_session,
        username="active",
        display_name="Active",
        family_code="ACT-1001",
        role=UserRole.member,
        is_active=True,
    )
    create_user(
        db_session,
        username="inactive",
        display_name="Inactive",
        family_code="INA-1001",
        role=UserRole.member,
        is_active=False,
    )

    response = client.get("/api/family/users", headers=member_headers)

    assert response.status_code == 200
    usernames = {item["username"] for item in response.json()}
    assert "active" in usernames
    assert "inactive" not in usernames


def test_search_by_family_code_works(client, db_session, member_headers):
    create_user(
        db_session,
        username="searchme",
        display_name="Search Me",
        family_code="SEA-1234",
    )

    response = client.get("/api/family/users/search?code=sea-1234", headers=member_headers)

    assert response.status_code == 200
    assert response.json()["username"] == "searchme"


def test_search_does_not_query_external_matrix_users(client, member_headers, fake_matrix):
    response = client.get("/api/family/users/search?code=REMOTE-1", headers=member_headers)

    assert response.status_code == 404
    assert fake_matrix.created_users == []
    assert fake_matrix.deactivated_users == []


def test_family_users_requires_auth(client):
    response = client.get("/api/family/users")
    assert response.status_code == 401
