from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_settings
from app.core.config import Settings
from app.models.user import User
from app.schemas.calls import CallTokenRequest, CallTokenResponse
from app.services.calls import (
    CallsService,
    CallsUnavailableError,
    InvalidCallTargetError,
    TargetNotFoundError,
)

router = APIRouter(responses={401: {"description": "Authentication required"}})


@router.post("/token", response_model=CallTokenResponse)
def create_call_token(
    payload: CallTokenRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> CallTokenResponse:
    service = CallsService(settings)
    try:
        issued = service.issue_join_token(
            db,
            caller=current_user,
            target_user_id=payload.target_user_id,
            call_id=payload.call_id,
            mode=payload.mode,
        )
        db.commit()
    except CallsUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calls are not configured",
        ) from None
    except TargetNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family user not found",
        ) from None
    except InvalidCallTargetError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Call target is not available",
        ) from None

    return CallTokenResponse(
        livekitUrl=settings.livekit_url,
        token=issued.token.token,
        expiresAt=issued.token.expires_at.isoformat(),
        callId=payload.call_id,
        peerDisplayName=issued.peer_display_name,
    )
