from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_matrix_admin
from app.core.errors import MatrixAdminError
from app.models.user import User
from app.schemas.profile import CurrentUserProfileResponse, CurrentUserProfileUpdateRequest

router = APIRouter(responses={401: {"description": "Authentication required"}})


@router.get("/me", response_model=CurrentUserProfileResponse)
def get_current_profile(
    current_user: User = Depends(get_current_user),
) -> CurrentUserProfileResponse:
    return CurrentUserProfileResponse.model_validate(current_user)


@router.patch("/me", response_model=CurrentUserProfileResponse)
def update_current_profile(
    payload: CurrentUserProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    matrix_admin=Depends(get_matrix_admin),
) -> CurrentUserProfileResponse:
    previous_display_name = current_user.display_name
    current_user.display_name = payload.display_name
    try:
        db.flush()
        matrix_admin.update_user_display_name(current_user.matrix_user_id, payload.display_name)
        db.commit()
        db.refresh(current_user)
    except MatrixAdminError:
        db.rollback()
        current_user.display_name = previous_display_name
        raise HTTPException(status_code=502, detail="Profile display name sync failed") from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Profile update failed") from None
    return CurrentUserProfileResponse.model_validate(current_user)
