from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_matrix_admin, get_rate_limiter, get_settings
from app.core.config import Settings
from app.core.errors import (
    DuplicateUsernameError,
    InvalidInviteError,
    MatrixAdminError,
    RateLimitExceededError,
)
from app.schemas.auth import LoginRequest, RegisterRequest, RegisterResponse, TokenResponse
from app.security.rate_limit import InMemoryRateLimiter
from app.security.tokens import create_access_token
from app.services.common_room_service import CommonRoomService
from app.services.user_service import UserService

router = APIRouter()


def _client_key(request: Request, scope: str, subject: str = "") -> str:
    host = request.client.host if request.client else "unknown"
    safe_subject = subject.strip().lower()[:64]
    return f"{scope}:{host}:{safe_subject}"


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"description": "Invalid or unavailable invite code"},
        409: {"description": "Username is not available"},
        429: {"description": "Too many attempts"},
        500: {"description": "Registration failed"},
        502: {"description": "Matrix user creation failed"},
    },
)
def register(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    rate_limiter: InMemoryRateLimiter = Depends(get_rate_limiter),
    matrix_admin=Depends(get_matrix_admin),
) -> RegisterResponse:
    try:
        rate_limiter.check(
            _client_key(request, "register", payload.username),
            settings.register_rate_limit,
        )
        rate_limiter.check(
            _client_key(request, "invite-verify"),
            settings.invite_rate_limit,
        )
    except RateLimitExceededError:
        raise HTTPException(status_code=429, detail="Too many attempts") from None

    service = UserService(settings=settings, matrix_admin=matrix_admin)
    user = None
    try:
        user = service.register_user(db, payload)
        db.commit()
    except InvalidInviteError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid or unavailable invite code") from None
    except DuplicateUsernameError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username is not available") from None
    except MatrixAdminError:
        db.rollback()
        raise HTTPException(status_code=502, detail="Matrix user creation failed") from None
    except SQLAlchemyError:
        db.rollback()
        if user is not None:
            service.compensate_matrix_user(user.matrix_user_id)
        raise HTTPException(status_code=500, detail="Registration failed") from None

    try:
        CommonRoomService(matrix_admin=matrix_admin).join_user(db, user)
        db.commit()
    except SQLAlchemyError:
        db.rollback()

    return RegisterResponse(
        user_id=user.username,
        matrix_user_id=user.matrix_user_id,
        family_code=user.family_code,
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={
        401: {"description": "Invalid credentials"},
        429: {"description": "Too many attempts"},
    },
)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    rate_limiter: InMemoryRateLimiter = Depends(get_rate_limiter),
    matrix_admin=Depends(get_matrix_admin),
) -> TokenResponse:
    try:
        rate_limiter.check(
            _client_key(request, "login", payload.username), settings.login_rate_limit
        )
    except RateLimitExceededError:
        raise HTTPException(status_code=429, detail="Too many attempts") from None

    service = UserService(settings=settings, matrix_admin=matrix_admin)
    user = service.authenticate(db, username=payload.username, password=payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse.model_validate({"accessToken": create_access_token(user, settings)})
