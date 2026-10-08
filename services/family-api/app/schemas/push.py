from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.push_subscription import PushPrivacyPreference


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=16, max_length=255)
    auth: str = Field(min_length=8, max_length=255)


class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=16, max_length=2048)
    keys: PushSubscriptionKeys
    content_encoding: str = Field(default="aes128gcm", alias="contentEncoding", max_length=32)
    privacy_preference: PushPrivacyPreference | None = Field(
        default=None,
        alias="privacyPreference",
    )


class PushUnsubscribeRequest(BaseModel):
    endpoint: str | None = Field(default=None, min_length=16, max_length=2048)
    subscription_id: UUID | None = Field(default=None, alias="subscriptionId")

    @model_validator(mode="after")
    def require_identifier(self) -> "PushUnsubscribeRequest":
        if self.endpoint is None and self.subscription_id is None:
            raise ValueError("endpoint or subscriptionId is required")
        return self


class PushPrivacyUpdateRequest(BaseModel):
    privacy_preference: PushPrivacyPreference = Field(alias="privacyPreference")


class MatrixPusherResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    app_id: str = Field(alias="appId")
    gateway_url: str = Field(alias="gatewayUrl")
    push_key: str = Field(alias="pushKey")


class PushSettingsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool
    subscription_id: UUID | None = Field(alias="subscriptionId")
    privacy_preference: PushPrivacyPreference = Field(alias="privacyPreference")
    vapid_public_key: str | None = Field(alias="vapidPublicKey")
    matrix_pusher_app_id: str = Field(alias="matrixPusherAppId")
    matrix_push_gateway_url: str = Field(alias="matrixPushGatewayUrl")
    matrix_pusher: MatrixPusherResponse | None = Field(alias="matrixPusher")
    push_available: bool = Field(alias="pushAvailable")


class PushSubscribeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subscription_id: UUID = Field(alias="subscriptionId")
    enabled: bool
    privacy_preference: PushPrivacyPreference = Field(alias="privacyPreference")
    matrix_pusher: MatrixPusherResponse | None = Field(alias="matrixPusher")


class PushPrivacyResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    privacy_preference: PushPrivacyPreference = Field(alias="privacyPreference")


class MatrixPushDevice(BaseModel):
    app_id: str | None = Field(default=None, alias="app_id")
    pushkey: str | None = None
    data: dict[str, Any] | None = None


class MatrixPushNotification(BaseModel):
    devices: list[MatrixPushDevice] = Field(default_factory=list)
    event_id: str | None = Field(default=None, alias="event_id")
    room_id: str | None = Field(default=None, alias="room_id")
    sender: str | None = None
    type: str | None = None
    content: dict[str, Any] | None = None


class MatrixPushNotifyRequest(BaseModel):
    notification: MatrixPushNotification


class MatrixPushNotifyResponse(BaseModel):
    rejected: list[str] = Field(default_factory=list)
