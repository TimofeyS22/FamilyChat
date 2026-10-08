from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_matrix_admin, get_settings
from app.core.config import Settings
from app.models.user import User
from app.schemas.family import FamilyUserResponse
from app.services.user_service import UserService

router = APIRouter(responses={401: {"description": "Authentication required"}})


@router.get("/users", response_model=list[FamilyUserResponse])
def list_family_users(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    current_user: User = Depends(get_current_user),
) -> list[FamilyUserResponse]:
    del current_user
    users = UserService(settings=settings, matrix_admin=matrix_admin).active_family_users(db)
    return [FamilyUserResponse.model_validate(user) for user in users]


@router.get("/users/search", response_model=FamilyUserResponse)
def search_family_user(
    code: str = Query(min_length=4, max_length=16),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    current_user: User = Depends(get_current_user),
) -> FamilyUserResponse:
    del current_user
    user = UserService(settings=settings, matrix_admin=matrix_admin).search_active_by_family_code(
        db,
        family_code=code,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="Family user not found")
    return FamilyUserResponse.model_validate(user)
