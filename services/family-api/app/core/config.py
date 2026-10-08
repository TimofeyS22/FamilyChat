import base64
import binascii
from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_VALUES = {
    "",
    "change-me",
    "change-me-later",
    "change-me-in-real-env",
}


def _decode_base64url_without_padding(value: str) -> bytes:
    sanitized = "".join(value.strip().split()).rstrip("=")
    padding = "=" * ((4 - (len(sanitized) % 4)) % 4)
    try:
        return base64.urlsafe_b64decode(f"{sanitized}{padding}")
    except (binascii.Error, ValueError) as exc:
        raise ValueError("WEB_PUSH_VAPID_PUBLIC_KEY must be base64url encoded") from exc


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    database_url: str = Field(
        alias="FAMILY_API_DATABASE_URL",
    )
    allow_sqlite: bool = Field(default=False, alias="FAMILY_API_ALLOW_SQLITE")
    secret_key: str = Field(alias="FAMILY_API_SECRET_KEY")
    invite_pepper: str = Field(alias="FAMILY_API_INVITE_PEPPER")
    access_token_minutes: int = Field(default=43200, alias="FAMILY_API_ACCESS_TOKEN_MINUTES")

    matrix_homeserver_url: str = Field(
        default="http://synapse:8008",
        alias="MATRIX_HOMESERVER_URL",
    )
    matrix_server_name: str = Field(default="familychat.local", alias="MATRIX_SERVER_NAME")
    matrix_admin_access_token: str = Field(
        alias="MATRIX_ADMIN_ACCESS_TOKEN",
    )
    matrix_admin_user: str = Field(
        default="@admin:familychat.local",
        alias="MATRIX_ADMIN_USER",
    )

    rate_limit_window_seconds: int = Field(default=60, alias="FAMILY_API_RATE_LIMIT_WINDOW_SECONDS")
    register_rate_limit: int = Field(default=10, alias="FAMILY_API_REGISTER_RATE_LIMIT")
    login_rate_limit: int = Field(default=10, alias="FAMILY_API_LOGIN_RATE_LIMIT")
    invite_rate_limit: int = Field(default=20, alias="FAMILY_API_INVITE_RATE_LIMIT")
    cors_allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="FAMILY_API_CORS_ALLOWED_ORIGINS",
    )
    reserved_matrix_localparts: str = Field(
        default="admin,administrator,root,support,system,synapse,server,api,bot,moderator",
        alias="FAMILY_API_RESERVED_MATRIX_LOCALPARTS",
    )
    web_push_enabled: bool = Field(default=False, alias="WEB_PUSH_ENABLED")
    web_push_vapid_public_key: str = Field(default="", alias="WEB_PUSH_VAPID_PUBLIC_KEY")
    web_push_vapid_private_key: str = Field(default="", alias="WEB_PUSH_VAPID_PRIVATE_KEY")
    web_push_subject: str = Field(default="", alias="WEB_PUSH_SUBJECT")
    matrix_push_app_id: str = Field(default="familychat.web", alias="MATRIX_PUSH_APP_ID")
    matrix_push_gateway_url: str = Field(
        default="http://family-api:8000/_matrix/push/v1/notify",
        alias="MATRIX_PUSH_GATEWAY_URL",
    )
    livekit_calls_enabled: bool = Field(default=False, alias="LIVEKIT_CALLS_ENABLED")
    livekit_url: str = Field(default="", alias="LIVEKIT_URL")
    livekit_api_key: str = Field(default="", alias="LIVEKIT_API_KEY")
    livekit_api_secret: str = Field(default="", alias="LIVEKIT_API_SECRET")

    @model_validator(mode="after")
    def validate_safe_runtime_config(self) -> "Settings":
        if self.database_url.startswith("sqlite") and not self.allow_sqlite:
            raise ValueError("SQLite is only allowed when FAMILY_API_ALLOW_SQLITE=true")

        for field_name in (
            "secret_key",
            "invite_pepper",
            "matrix_admin_access_token",
        ):
            value = getattr(self, field_name)
            if value.strip() in PLACEHOLDER_VALUES or "change-me" in value:
                raise ValueError(f"{field_name} must be replaced before Family API starts")
            if len(value) < 32:
                raise ValueError(f"{field_name} must be at least 32 characters")

        if "change-me" in self.database_url:
            raise ValueError("FAMILY_API_DATABASE_URL contains a placeholder password")

        if self.web_push_enabled:
            for field_name in (
                "web_push_vapid_public_key",
                "web_push_vapid_private_key",
                "web_push_subject",
            ):
                value = getattr(self, field_name)
                if value.strip() in PLACEHOLDER_VALUES or "change-me" in value:
                    raise ValueError(f"{field_name} must be replaced before Web Push is enabled")
            if not (
                self.web_push_subject.startswith("mailto:")
                or self.web_push_subject.startswith("https://")
            ):
                raise ValueError("WEB_PUSH_SUBJECT must start with mailto: or https://")
            if len(self.web_push_vapid_private_key.strip()) < 32:
                raise ValueError("WEB_PUSH_VAPID_PRIVATE_KEY is too short")
            if len(self.web_push_vapid_public_key.strip()) < 32:
                raise ValueError("WEB_PUSH_VAPID_PUBLIC_KEY is too short")
            if len(_decode_base64url_without_padding(self.web_push_vapid_public_key)) != 65:
                raise ValueError("WEB_PUSH_VAPID_PUBLIC_KEY must decode to 65 bytes")
            if urlparse(self.matrix_push_gateway_url).path != "/_matrix/push/v1/notify":
                raise ValueError(
                    "MATRIX_PUSH_GATEWAY_URL path must be /_matrix/push/v1/notify"
                )

        if self.livekit_calls_enabled:
            for field_name in ("livekit_url", "livekit_api_key", "livekit_api_secret"):
                value = getattr(self, field_name)
                if value.strip() in PLACEHOLDER_VALUES or "change-me" in value:
                    raise ValueError(f"{field_name} must be replaced before calls are enabled")
            livekit_url = urlparse(self.livekit_url)
            if livekit_url.scheme not in {"ws", "wss"}:
                raise ValueError("LIVEKIT_URL must use a websocket scheme")
            if livekit_url.scheme == "ws" and livekit_url.hostname not in {
                "localhost",
                "127.0.0.1",
                "::1",
            }:
                raise ValueError("LIVEKIT_URL must use TLS outside local development")
            if len(self.livekit_api_key.strip()) < 8:
                raise ValueError("LIVEKIT_API_KEY is too short")
            if len(self.livekit_api_secret.strip()) < 32:
                raise ValueError("LIVEKIT_API_SECRET is too short")

        return self

    def reserved_localparts(self) -> set[str]:
        configured = {
            item.strip().lower()
            for item in self.reserved_matrix_localparts.split(",")
            if item.strip()
        }
        admin_localpart = self.matrix_admin_user.split(":", 1)[0].removeprefix("@").lower()
        configured.add(admin_localpart)
        return configured

    def cors_origins(self) -> list[str]:
        return [
            item.strip().rstrip("/")
            for item in self.cors_allowed_origins.split(",")
            if item.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
