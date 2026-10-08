from app.models.invite import InviteCode


def invite_item(response, label: str) -> dict:
    return next(item for item in response.json() if item["label"] == label)


def test_create_invite_as_admin_returns_code_once(client, db_session, admin_headers):
    response = client.post(
        "/api/invites",
        headers=admin_headers,
        json={"label": "Mama", "boundDisplayName": "Mama", "maxUses": 1},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["code"].startswith("MAMA-")
    assert body["label"] == "MAMA"
    assert body["adminRef"].startswith("invite_")
    assert body["status"] == "unused"
    assert "id" not in body
    assert "codeHash" not in body
    assert "invite_pepper" not in response.text

    invite = db_session.query(InviteCode).one()
    assert invite.code_hash
    assert body["code"] not in invite.code_hash


def test_member_cannot_create_invite(client, member_headers):
    response = client.post(
        "/api/invites",
        headers=member_headers,
        json={"label": "Papa"},
    )

    assert response.status_code == 403


def test_list_invites_never_returns_code_or_hash(client, admin_headers):
    created = client.post(
        "/api/invites",
        headers=admin_headers,
        json={"label": "Sister"},
    )
    assert created.status_code == 201

    response = client.get("/api/invites", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert "code" not in body[0]
    assert "id" not in body[0]
    assert "codeHash" not in body[0]
    assert "code_hash" not in body[0]
    assert body[0]["adminRef"].startswith("invite_")
    assert body[0]["status"] == "unused"


def test_used_invite_is_visible_as_used(client, admin_headers):
    created = client.post(
        "/api/invites",
        headers=admin_headers,
        json={"label": "Used"},
    )
    code = created.json()["code"]

    registered = client.post(
        "/api/auth/register",
        json={
            "displayName": "Used Invite User",
            "inviteCode": code,
            "password": "secure-password",
            "username": "usedinvite",
        },
    )
    assert registered.status_code == 201, registered.text

    response = client.get("/api/invites", headers=admin_headers)

    assert response.status_code == 200
    item = invite_item(response, "USED")
    assert item["status"] == "used"
    assert item["usedCount"] == 1
    assert item["usedAt"] is not None
    assert code not in response.text


def test_disable_invite_as_admin(client, admin_headers):
    created = client.post(
        "/api/invites",
        headers=admin_headers,
        json={"label": "Disable"},
    )
    invite_ref = created.json()["adminRef"]

    response = client.post(f"/api/invites/{invite_ref}/disable", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {"success": True}
    listed = client.get("/api/invites", headers=admin_headers)
    assert invite_item(listed, "DISABLE")["status"] == "disabled"


def test_member_cannot_list_or_disable_invites(client, admin_headers, member_headers):
    created = client.post(
        "/api/invites",
        headers=admin_headers,
        json={"label": "Member Block"},
    )
    invite_ref = created.json()["adminRef"]

    list_response = client.get("/api/invites", headers=member_headers)
    disable_response = client.post(f"/api/invites/{invite_ref}/disable", headers=member_headers)

    assert list_response.status_code == 403
    assert disable_response.status_code == 403
