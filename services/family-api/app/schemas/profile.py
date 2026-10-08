from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import UserRole


class CurrentUserProfileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    username: str
    display_name: str = Field(alias="displayName")
    family_code: str = Field(alias="familyCode")
    role: UserRole
    is_active: bool = Field(alias="isActive")
    avatar_url: str | None = Field(alias="avatarUrl")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    e2ee_session_hint: str = Field(
        default=(
            "Browser-side Matrix crypto is managed by the web client. "
            "Cross-device recovery is not implemented."
        ),
        alias="e2eeSessionHint",
    )


class CurrentUserProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    display_name: str = Field(alias="displayName", min_length=1, max_length=120)

    @field_validator("display_name")
    @classmethod
    def trim_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Display name is required")
        return normalized
