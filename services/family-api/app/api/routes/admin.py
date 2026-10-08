from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_matrix_admin, get_settings, require_admin
from app.core.config import Settings
from app.core.errors import MatrixAdminError
from app.models.user import User
from app.schemas.admin import (
    AdminAuditResponse,
    AdminDiagnosticsResponse,
    AdminStatusResponse,
    AdminUserResponse,
)
from app.schemas.common import SuccessResponse
from app.services.admin import DEFAULT_AUDIT_LIMIT, AdminActionError, AdminService

router = APIRouter(
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Admin access required"},
    }
)


@router.get("/users", response_model=list[AdminUserResponse])
def list_admin_users(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> list[AdminUserResponse]:
    service = AdminService(settings=settings, matrix_admin=matrix_admin)
    return [AdminUserResponse.model_validate(item) for item in service.list_users(db, admin)]


@router.post("/users/{admin_ref}/deactivate", response_model=SuccessResponse)
def deactivate_user(
    admin_ref: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> SuccessResponse:
    service = AdminService(settings=settings, matrix_admin=matrix_admin)
    target = service.resolve_user_ref(db, admin_ref)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        service.deactivate_user(db, actor=admin, target=target)
        db.commit()
    except AdminActionError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=exc.reason) from None
    except MatrixAdminError:
        db.rollback()
        raise HTTPException(
            status_code=502, detail="User deactivation could not be completed"
        ) from None
    return SuccessResponse()


@router.get("/status", response_model=AdminStatusResponse)
def admin_status(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> AdminStatusResponse:
    del admin
    service = AdminService(settings=settings, matrix_admin=matrix_admin)
    return AdminStatusResponse.model_validate(service.safe_status(db))


@router.get("/diagnostics", response_model=AdminDiagnosticsResponse)
def admin_diagnostics(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> AdminDiagnosticsResponse:
    service = AdminService(settings=settings, matrix_admin=matrix_admin)
    return AdminDiagnosticsResponse.model_validate(service.diagnostics(db, admin))


@router.get("/audit", response_model=AdminAuditResponse)
def admin_audit(
    limit: int = Query(default=DEFAULT_AUDIT_LIMIT, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> AdminAuditResponse:
    del admin
    service = AdminService(settings=settings, matrix_admin=matrix_admin)
    return AdminAuditResponse.model_validate(service.audit_entries(db, limit=limit, offset=offset))
