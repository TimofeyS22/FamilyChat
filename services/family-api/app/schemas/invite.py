from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InviteCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str = Field(min_length=1, max_length=32)
    bound_display_name: str | None = Field(default=None, alias="boundDisplayName", max_length=120)
    expires_at: datetime | None = Field(default=None, alias="expiresAt")
    max_uses: int = Field(default=1, alias="maxUses", ge=1, le=50)

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        return value.strip().upper()


class InviteCreateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    admin_ref: str = Field(alias="adminRef")
    code: str
    label: str
    expires_at: datetime | None = Field(alias="expiresAt")
    max_uses: int = Field(alias="maxUses")
    status: str


class InviteListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    admin_ref: str = Field(alias="adminRef")
    label: str
    bound_display_name: str | None = Field(alias="boundDisplayName")
    expires_at: datetime | None = Field(alias="expiresAt")
    max_uses: int = Field(alias="maxUses")
    used_count: int = Field(alias="usedCount")
    disabled_at: datetime | None = Field(alias="disabledAt")
    created_at: datetime = Field(alias="createdAt")
    used_at: datetime | None = Field(alias="usedAt")
    status: str
