from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CallMode(StrEnum):
    audio = "audio"
    video = "video"


class CallTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_user_id: UUID = Field(alias="targetUserId")
    call_id: str = Field(alias="callId", min_length=12, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    mode: CallMode


class CallTokenResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    livekit_url: str = Field(alias="livekitUrl")
    token: str
    expires_at: str = Field(alias="expiresAt")
    call_id: str = Field(alias="callId")
    peer_display_name: str = Field(alias="peerDisplayName")
