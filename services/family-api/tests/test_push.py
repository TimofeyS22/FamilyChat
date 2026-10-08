import json

from conftest import create_user

from app.models.push_subscription import PushPrivacyPreference, PushSubscription
from app.services.push_service import DEFAULT_PUSH_BODY, PushSendError

PUSH_ENDPOINT = "https://push.example/subscriptions/familychat-secret-endpoint"
PUSH_P256DH = "p256dh-public-key-material"
PUSH_AUTH = "auth-secret-material"


def configure_web_push(client, sender=None) -> list[dict]:
    sent: list[dict] = []

    def record_sender(subscription_info, payload, private_key, subject):
        del private_key, subject
        sent.append(
            {
                "payload": json.loads(payload),
                "subscription_info": subscription_info,
            }
        )

    settings = client.app.state.settings
    settings.web_push_enabled = True
    settings.web_push_vapid_public_key = "B" * 44
    settings.web_push_vapid_private_key = "C" * 44
    settings.web_push_subject = "mailto:test@example.com"
    client.app.state.push_sender = sender or record_sender
    return sent


def subscribe(client, headers, privacy_preference=None) -> dict:
    payload = {
        "contentEncoding": "aes128gcm",
        "endpoint": PUSH_ENDPOINT,
        "keys": {
            "auth": PUSH_AUTH,
            "p256dh": PUSH_P256DH,
        },
    }
    if privacy_preference:
        payload["privacyPreference"] = privacy_preference
    response = client.post("/api/push/subscribe", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def matrix_notification(pushkey: str, **overrides) -> dict:
    notification = {
        "content": {"body": "Private message text", "msgtype": "m.text"},
        "devices": [{"app_id": "familychat.web", "pushkey": pushkey}],
        "event_id": "$event:familychat.local",
        "room_id": "!room:familychat.local",
        "sender": "@sender:familychat.local",
        "type": "m.room.message",
    }
    notification.update(overrides)
    return {"notification": notification}


def call_notification(pushkey: str, mode: str = "audio") -> dict:
    return matrix_notification(
        pushkey,
        content={"callId": "family-call-123456", "mode": mode},
        type="com.familychat.call.invite",
    )


def test_push_settings_unavailable_without_vapid_config(client, member_headers):
    response = client.get("/api/push/settings", headers=member_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["pushAvailable"] is False
    assert body["vapidPublicKey"] is None
    assert body["privacyPreference"] == "fact_only"


def test_subscribe_persists_subscription_without_echoing_endpoint_or_keys(
    client,
    db_session,
    member_headers,
):
    configure_web_push(client)

    body = subscribe(client, member_headers)

    assert body["enabled"] is True
    assert body["privacyPreference"] == "fact_only"
    assert body["matrixPusher"] == {
        "appId": "familychat.web",
        "gatewayUrl": "http://family-api:8000/_matrix/push/v1/notify",
        "pushKey": body["subscriptionId"],
    }
    assert PUSH_ENDPOINT not in json.dumps(body)
    assert PUSH_P256DH not in json.dumps(body)
    assert PUSH_AUTH not in json.dumps(body)

    subscription = db_session.query(PushSubscription).one()
    assert subscription.endpoint == PUSH_ENDPOINT
    assert subscription.endpoint_hash != PUSH_ENDPOINT
    assert subscription.privacy_preference == PushPrivacyPreference.fact_only
    assert subscription.enabled is True


def test_privacy_update_and_unsubscribe(client, db_session, member_headers):
    configure_web_push(client)
    created = subscribe(client, member_headers)

    privacy = client.post(
        "/api/push/privacy",
        headers=member_headers,
        json={"privacyPreference": "sender_name"},
    )
    assert privacy.status_code == 200
    assert privacy.json() == {"privacyPreference": "sender_name"}

    subscription = db_session.query(PushSubscription).one()
    assert subscription.privacy_preference == PushPrivacyPreference.sender_name

    disabled = client.post(
        "/api/push/unsubscribe",
        headers=member_headers,
        json={"subscriptionId": created["subscriptionId"]},
    )
    assert disabled.status_code == 200
    db_session.refresh(subscription)
    assert subscription.enabled is False
    assert subscription.last_failure_reason == "disabled_by_user"


def test_matrix_push_gateway_sends_fact_only_by_default(client, member_headers):
    sent = configure_web_push(client)
    created = subscribe(client, member_headers)

    response = client.post(
        "/api/push/matrix/notify", json=matrix_notification(created["subscriptionId"])
    )

    assert response.status_code == 200
    assert response.json() == {"rejected": []}
    assert sent[0]["payload"] == {
        "body": DEFAULT_PUSH_BODY,
        "data": {"eventId": "$event:familychat.local", "roomId": "!room:familychat.local"},
        "title": "FamilyChat",
    }
    assert "FamilyChat" not in sent[0]["payload"]["body"]
    assert sent[0]["subscription_info"]["endpoint"] == PUSH_ENDPOINT


def test_matrix_push_gateway_accepts_spec_path(client, member_headers):
    sent = configure_web_push(client)
    created = subscribe(client, member_headers)

    response = client.post(
        "/_matrix/push/v1/notify", json=matrix_notification(created["subscriptionId"])
    )

    assert response.status_code == 200
    assert response.json() == {"rejected": []}
    assert sent[0]["payload"] == {
        "body": DEFAULT_PUSH_BODY,
        "data": {"eventId": "$event:familychat.local", "roomId": "!room:familychat.local"},
        "title": "FamilyChat",
    }


def test_matrix_push_gateway_can_use_verified_local_sender_name(
    client,
    db_session,
    member_headers,
):
    sender = create_user(db_session, username="sender", display_name="Mama")
    sent = configure_web_push(client)
    created = subscribe(client, member_headers, privacy_preference="sender_name")

    response = client.post(
        "/api/push/matrix/notify",
        json=matrix_notification(created["subscriptionId"], sender=sender.matrix_user_id),
    )

    assert response.status_code == 200
    assert sent[0]["payload"] == {
        "body": "Новое сообщение",
        "data": {"eventId": "$event:familychat.local", "roomId": "!room:familychat.local"},
        "title": "Mama",
    }


def test_matrix_push_gateway_does_not_show_encrypted_message_text(client, member_headers):
    sent = configure_web_push(client)
    created = subscribe(client, member_headers, privacy_preference="message_text")

    response = client.post(
        "/api/push/matrix/notify",
        json=matrix_notification(
            created["subscriptionId"],
            content={"body": "Encrypted secret", "msgtype": "m.text"},
            type="m.room.encrypted",
        ),
    )

    assert response.status_code == 200
    assert sent[0]["payload"] == {
        "body": DEFAULT_PUSH_BODY,
        "data": {"eventId": "$event:familychat.local", "roomId": "!room:familychat.local"},
        "title": "FamilyChat",
    }


def test_matrix_push_gateway_labels_call_invites(client, member_headers):
    sent = configure_web_push(client)
    created = subscribe(client, member_headers)

    response = client.post(
        "/_matrix/push/v1/notify", json=call_notification(created["subscriptionId"], "video")
    )

    assert response.status_code == 200
    assert sent[0]["payload"] == {
        "body": "Входящий видеозвонок",
        "data": {
            "callId": "family-call-123456",
            "callMode": "video",
            "eventId": "$event:familychat.local",
            "roomId": "!room:familychat.local",
        },
        "requireInteraction": True,
        "renotify": True,
        "silent": False,
        "title": "FamilyChat",
        "vibrate": [240, 120, 240, 120, 360],
    }


def test_matrix_push_gateway_labels_call_invite_marker_messages(client, member_headers):
    sent = configure_web_push(client)
    created = subscribe(client, member_headers)

    response = client.post(
        "/_matrix/push/v1/notify",
        json=matrix_notification(
            created["subscriptionId"],
            content={
                "body": "Входящий аудиозвонок",
                "callId": "family-call-123456",
                "mode": "audio",
                "msgtype": "m.notice",
                "org.familychat.call.invite": True,
            },
            type="m.room.message",
        ),
    )

    assert response.status_code == 200
    assert sent[0]["payload"]["title"] == "FamilyChat"
    assert sent[0]["payload"]["body"] == "Входящий аудиозвонок"
    assert sent[0]["payload"]["requireInteraction"] is True
    assert sent[0]["payload"]["renotify"] is True
    assert sent[0]["payload"]["silent"] is False
    assert sent[0]["payload"]["data"]["callId"] == "family-call-123456"


def test_matrix_push_gateway_can_show_sender_and_message_preview(
    client,
    db_session,
    member_headers,
):
    sender = create_user(db_session, username="sender", display_name="Mama")
    sent = configure_web_push(client)
    created = subscribe(client, member_headers, privacy_preference="sender_and_preview")

    response = client.post(
        "/api/push/matrix/notify",
        json=matrix_notification(created["subscriptionId"], sender=sender.matrix_user_id),
    )

    assert response.status_code == 200
    assert sent[0]["payload"] == {
        "body": "Private message text",
        "data": {"eventId": "$event:familychat.local", "roomId": "!room:familychat.local"},
        "title": "Mama",
    }


def test_matrix_push_gateway_ignores_count_only_updates(client, member_headers):
    sent = configure_web_push(client)
    created = subscribe(client, member_headers, privacy_preference="sender_and_preview")

    response = client.post(
        "/_matrix/push/v1/notify",
        json={
            "notification": {
                "counts": {"unread": 1},
                "devices": [{"app_id": "familychat.web", "pushkey": created["subscriptionId"]}],
            },
        },
    )

    assert response.status_code == 200
    assert response.json() == {"rejected": []}
    assert sent == []


def test_matrix_push_gateway_labels_media_previews(client, db_session, member_headers):
    sender = create_user(db_session, username="sender", display_name="Mama")
    sent = configure_web_push(client)
    created = subscribe(client, member_headers, privacy_preference="sender_and_preview")

    response = client.post(
        "/api/push/matrix/notify",
        json=matrix_notification(
            created["subscriptionId"],
            content={"body": "family.pdf", "msgtype": "m.file"},
            sender=sender.matrix_user_id,
        ),
    )

    assert response.status_code == 200
    assert sent[0]["payload"]["title"] == "Mama"
    assert sent[0]["payload"]["body"] == "Файл: family.pdf"


def test_invalid_subscription_is_disabled_and_rejected(client, db_session, member_headers):
    def failing_sender(subscription_info, payload, private_key, subject):
        del subscription_info, payload, private_key, subject
        raise PushSendError("push_gone", invalid_subscription=True)

    configure_web_push(client, sender=failing_sender)
    created = subscribe(client, member_headers)

    response = client.post(
        "/api/push/matrix/notify", json=matrix_notification(created["subscriptionId"])
    )

    assert response.status_code == 200
    assert response.json() == {"rejected": [created["subscriptionId"]]}
    subscription = db_session.query(PushSubscription).one()
    db_session.refresh(subscription)
    assert subscription.enabled is False
    assert subscription.failure_count == 1
    assert subscription.last_failure_reason == "invalid_subscription"


def test_subscribe_requires_web_push_configuration(client, member_headers):
    response = client.post(
        "/api/push/subscribe",
        headers=member_headers,
        json={
            "endpoint": PUSH_ENDPOINT,
            "keys": {"auth": PUSH_AUTH, "p256dh": PUSH_P256DH},
        },
    )

    assert response.status_code == 503
