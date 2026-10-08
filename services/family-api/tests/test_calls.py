import json
from uuid import uuid4

import jwt
from conftest import create_user, login

from app.models.audit_log import AuditLog
from app.security.tokens import create_access_token

CALL_ID = "call_1234567890"
LIVEKIT_SECRET = "test-livekit-secret-with-at-least-32-bytes"


def enable_calls(client) -> None:
    settings = client.app.state.settings
    settings.livekit_calls_enabled = True
    settings.livekit_url = "wss://livekit.test:7880"
    settings.livekit_api_key = "testkey123"
    settings.livekit_api_secret = LIVEKIT_SECRET


def call_token(client, headers, target_id, call_id=CALL_ID, mode="audio"):
    return client.post(
        "/api/calls/token",
        headers=headers,
        json={"callId": call_id, "mode": mode, "targetUserId": str(target_id)},
    )


def decoded_token(response):
    return jwt.decode(
        response.json()["token"],
        LIVEKIT_SECRET,
        algorithms=["HS256"],
        options={"verify_exp": False},
    )


def inactive_headers(client, settings, db_session):
    inactive = create_user(db_session, username="inactive-caller", is_active=False)
    token = create_access_token(inactive, settings)
    return {"Authorization": f"Bearer {token}"}


def test_call_token_requires_auth(client, member_user):
    enable_calls(client)

    response = client.post(
        "/api/calls/token",
        json={"callId": CALL_ID, "mode": "audio", "targetUserId": str(member_user.id)},
    )

    assert response.status_code == 401


def test_inactive_caller_denied(client, settings, db_session, member_user):
    enable_calls(client)

    response = call_token(client, inactive_headers(client, settings, db_session), member_user.id)

    assert response.status_code == 401


def test_missing_target_denied(client, member_headers):
    enable_calls(client)

    response = call_token(client, member_headers, uuid4())

    assert response.status_code == 404


def test_inactive_target_denied(client, db_session, member_headers):
    enable_calls(client)
    target = create_user(db_session, username="inactive-target", is_active=False)

    response = call_token(client, member_headers, target.id)

    assert response.status_code == 403


def test_external_matrix_target_denied(client, db_session, member_headers):
    enable_calls(client)
    target = create_user(db_session, username="external-target")
    target.matrix_user_id = "@external:elsewhere.example"
    db_session.commit()

    response = call_token(client, member_headers, target.id)

    assert response.status_code == 403


def test_self_call_denied(client, member_user, member_headers):
    enable_calls(client)

    response = call_token(client, member_headers, member_user.id)

    assert response.status_code == 403


def test_invalid_call_id_denied(client, db_session, member_headers):
    enable_calls(client)
    target = create_user(db_session, username="call-peer")

    response = call_token(client, member_headers, target.id, call_id="../bad-room")

    assert response.status_code == 422


def test_arbitrary_room_name_injection_denied(client, db_session, member_headers):
    enable_calls(client)
    target = create_user(db_session, username="room-injection-peer")

    response = client.post(
        "/api/calls/token",
        headers=member_headers,
        json={
            "callId": CALL_ID,
            "mode": "audio",
            "roomName": "attacker-controlled-room",
            "targetUserId": str(target.id),
        },
    )

    assert response.status_code == 422


def test_call_token_contains_short_lived_stable_backend_room(
    client,
    db_session,
    member_user,
    member_headers,
):
    enable_calls(client)
    target = create_user(db_session, username="stable-peer")
    target_headers = login(client, target.username)

    caller_response = call_token(client, member_headers, target.id, mode="video")
    target_response = call_token(client, target_headers, member_user.id, mode="video")

    assert caller_response.status_code == 200, caller_response.text
    assert target_response.status_code == 200, target_response.text
    caller_claims = decoded_token(caller_response)
    target_claims = decoded_token(target_response)
    assert caller_claims["video"]["room"] == target_claims["video"]["room"]
    assert caller_claims["video"]["room"].startswith("fc-call-")
    assert "../" not in caller_claims["video"]["room"]
    assert caller_claims["video"]["roomJoin"] is True
    assert caller_claims["video"]["canPublish"] is True
    assert caller_claims["video"]["canSubscribe"] is True
    assert caller_claims["video"]["canPublishData"] is False
    assert caller_claims["video"]["canPublishSources"] == ["camera", "microphone"]
    assert caller_claims["exp"] - caller_claims["nbf"] <= 300


def test_audio_call_token_only_grants_microphone_publish_source(
    client,
    db_session,
    member_headers,
):
    enable_calls(client)
    target = create_user(db_session, username="audio-peer")

    response = call_token(client, member_headers, target.id, mode="audio")

    assert response.status_code == 200, response.text
    claims = decoded_token(response)
    assert claims["video"]["canPublishSources"] == ["microphone"]


def test_token_response_does_not_expose_secret_and_audit_is_technical_only(
    client,
    db_session,
    member_headers,
):
    enable_calls(client)
    target = create_user(db_session, username="audit-peer", display_name="Audit Peer")

    response = call_token(client, member_headers, target.id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["livekitUrl"] == "wss://livekit.test:7880"
    assert body["peerDisplayName"] == "Audit Peer"
    assert body["callId"] == CALL_ID
    serialized = json.dumps(body)
    assert LIVEKIT_SECRET not in serialized
    assert "testkey123" not in serialized
    assert "fc-call-" not in serialized

    audit = db_session.query(AuditLog).filter_by(action="livekit_call_token_issued").one()
    assert audit.target_type == "livekit_call"
    assert audit.target_id is not None
    assert "fc-call-" not in audit.target_id
    audit_payload = json.dumps(audit.event_metadata)
    assert "token" not in audit_payload.lower()
    assert "secret" not in audit_payload.lower()
    assert "room" not in audit_payload.lower()
    assert audit.event_metadata == {
        "call_id_length": len(CALL_ID),
        "mode": "audio",
        "peer_count": 2,
        "ttl_seconds": 300,
    }


def test_calls_unavailable_without_livekit_config(client, db_session, member_headers):
    target = create_user(db_session, username="disabled-calls-peer")

    response = call_token(client, member_headers, target.id)

    assert response.status_code == 503
