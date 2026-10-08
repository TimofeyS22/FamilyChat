from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FamilyUserResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: UUID
    matrix_user_id: str = Field(alias="matrixUserId")
    username: str
    display_name: str = Field(alias="displayName")
    family_code: str = Field(alias="familyCode")
    avatar_url: str | None = Field(alias="avatarUrl")
