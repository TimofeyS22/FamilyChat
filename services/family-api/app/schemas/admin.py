from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    admin_ref: str = Field(alias="adminRef")
    username: str
    display_name: str = Field(alias="displayName")
    family_code: str = Field(alias="familyCode")
    role: UserRole
    is_active: bool = Field(alias="isActive")
    technical_status: str = Field(alias="technicalStatus")
    can_deactivate: bool = Field(alias="canDeactivate")
    deactivate_blocked_reason: str | None = Field(alias="deactivateBlockedReason")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class AdminServiceStatusItem(BaseModel):
    name: str
    status: str
    detail: str


class AdminStageBlocker(BaseModel):
    stage: str
    status: str
    detail: str


class AdminApiStatus(BaseModel):
    status: str
    detail: str


class AdminStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api: AdminApiStatus
    services: list[AdminServiceStatusItem]
    stage_blockers: list[AdminStageBlocker] = Field(alias="stageBlockers")


class AdminAuditItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    action: str
    actor_label: str = Field(alias="actorLabel")
    created_at: datetime = Field(alias="createdAt")
    metadata: dict
    target_label: str = Field(alias="targetLabel")
    target_type: str = Field(alias="targetType")


class AdminAuditResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[AdminAuditItem]
    limit: int
    offset: int


class AdminPushSubscriptionDiagnostics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subscription_ref: str = Field(alias="subscriptionRef")
    enabled: bool
    privacy_preference: str = Field(alias="privacyPreference")
    content_encoding: str = Field(alias="contentEncoding")
    failure_count: int = Field(alias="failureCount")
    last_failure_at: datetime | None = Field(alias="lastFailureAt")
    last_failure_reason: str | None = Field(alias="lastFailureReason")
    disabled_at: datetime | None = Field(alias="disabledAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class AdminUserDiagnostics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    admin_ref: str = Field(alias="adminRef")
    username: str
    display_name: str = Field(alias="displayName")
    role: UserRole
    is_active: bool = Field(alias="isActive")
    active_push_count: int = Field(alias="activePushCount")
    total_push_count: int = Field(alias="totalPushCount")
    latest_push_updated_at: datetime | None = Field(alias="latestPushUpdatedAt")
    subscriptions: list[AdminPushSubscriptionDiagnostics]


class AdminDiagnosticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    push_available: bool = Field(alias="pushAvailable")
    matrix_pusher_app_id: str = Field(alias="matrixPusherAppId")
    matrix_push_gateway_configured: bool = Field(alias="matrixPushGatewayConfigured")
    users: list[AdminUserDiagnostics]
