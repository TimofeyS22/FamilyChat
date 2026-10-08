import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

USERNAME_RE = re.compile(r"^[a-z][a-z0-9._=-]{2,31}$")


class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    display_name: str = Field(alias="displayName", min_length=1, max_length=120)
    username: str = Field(min_length=3, max_length=32, pattern=USERNAME_RE.pattern)
    password: str = Field(min_length=8, max_length=256)
    invite_code: str = Field(alias="inviteCode", min_length=6, max_length=64)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not USERNAME_RE.fullmatch(normalized):
            raise ValueError("Username must be a valid Matrix localpart")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if value.strip() != value or len(value) < 8:
            raise ValueError("Password does not meet the minimal policy")
        return value

    @field_validator("invite_code")
    @classmethod
    def normalize_invite_code(cls, value: str) -> str:
        return value.strip().upper()


class RegisterResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    user_id: str = Field(alias="userId")
    matrix_user_id: str = Field(alias="matrixUserId")
    family_code: str = Field(alias="familyCode")


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=256)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class TokenResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    access_token: str = Field(alias="accessToken")
    token_type: str = Field(default="bearer", alias="tokenType")
