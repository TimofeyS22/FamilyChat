from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_push_service
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.push import (
    MatrixPusherResponse,
    MatrixPushNotifyRequest,
    MatrixPushNotifyResponse,
    PushPrivacyResponse,
    PushPrivacyUpdateRequest,
    PushSettingsResponse,
    PushSubscribeRequest,
    PushSubscribeResponse,
    PushUnsubscribeRequest,
)
from app.services.push_service import PushService

router = APIRouter(responses={401: {"description": "Authentication required"}})
matrix_push_router = APIRouter()


@router.get("/settings", response_model=PushSettingsResponse)
def push_settings(
    db: Session = Depends(get_db),
    service: PushService = Depends(get_push_service),
    current_user: User = Depends(get_current_user),
) -> PushSettingsResponse:
    return PushSettingsResponse.model_validate(service.settings_for_user(db, current_user))


@router.post(
    "/subscribe", response_model=PushSubscribeResponse, status_code=status.HTTP_201_CREATED
)
def subscribe(
    payload: PushSubscribeRequest,
    db: Session = Depends(get_db),
    service: PushService = Depends(get_push_service),
    current_user: User = Depends(get_current_user),
) -> PushSubscribeResponse:
    if not service.push_available():
        raise HTTPException(status_code=503, detail="Web Push is not configured")

    subscription = service.subscribe(db, current_user, payload)
    db.commit()
    matrix_pusher = service.matrix_pusher(subscription)
    return PushSubscribeResponse(
        subscriptionId=subscription.id,
        enabled=subscription.enabled,
        privacyPreference=subscription.privacy_preference,
        matrixPusher=MatrixPusherResponse(
            appId=matrix_pusher["app_id"],
            gatewayUrl=matrix_pusher["gateway_url"],
            pushKey=matrix_pusher["push_key"],
        ),
    )


@router.post("/unsubscribe", response_model=SuccessResponse)
def unsubscribe(
    payload: PushUnsubscribeRequest,
    db: Session = Depends(get_db),
    service: PushService = Depends(get_push_service),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    service.disable(
        db,
        current_user,
        endpoint=payload.endpoint,
        subscription_id=payload.subscription_id,
    )
    db.commit()
    return SuccessResponse()


@router.post("/privacy", response_model=PushPrivacyResponse)
def update_privacy(
    payload: PushPrivacyUpdateRequest,
    db: Session = Depends(get_db),
    service: PushService = Depends(get_push_service),
    current_user: User = Depends(get_current_user),
) -> PushPrivacyResponse:
    preference = service.update_privacy(db, current_user, payload.privacy_preference)
    db.commit()
    return PushPrivacyResponse(privacyPreference=preference)


@router.post("/test", response_model=SuccessResponse)
def send_test_push(
    db: Session = Depends(get_db),
    service: PushService = Depends(get_push_service),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not service.push_available():
        raise HTTPException(status_code=503, detail="Web Push is not configured")
    service.send_test_push(db, current_user)
    db.commit()
    return SuccessResponse()


@router.post("/matrix/notify", response_model=MatrixPushNotifyResponse)
def matrix_notify(
    payload: MatrixPushNotifyRequest,
    db: Session = Depends(get_db),
    service: PushService = Depends(get_push_service),
) -> MatrixPushNotifyResponse:
    rejected = service.handle_matrix_notification(db, payload.notification)
    db.commit()
    return MatrixPushNotifyResponse(rejected=rejected)


@matrix_push_router.post("/_matrix/push/v1/notify", response_model=MatrixPushNotifyResponse)
def matrix_push_notify(
    payload: MatrixPushNotifyRequest,
    db: Session = Depends(get_db),
    service: PushService = Depends(get_push_service),
) -> MatrixPushNotifyResponse:
    return matrix_notify(payload, db, service)
