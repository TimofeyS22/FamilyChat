from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_matrix_admin, get_settings, require_admin
from app.core.config import Settings
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.invite import InviteCreateRequest, InviteCreateResponse, InviteListItem
from app.services.admin import AdminService
from app.services.invite_service import InviteService

router = APIRouter(
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Admin access required"},
    }
)


@router.post("", response_model=InviteCreateResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: InviteCreateRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> InviteCreateResponse:
    service = InviteService(settings)
    invite, code = service.create_invite(
        db,
        actor=admin,
        label=payload.label,
        bound_display_name=payload.bound_display_name,
        expires_at=payload.expires_at,
        max_uses=payload.max_uses,
    )
    db.commit()
    admin_service = AdminService(settings=settings, matrix_admin=matrix_admin)
    return InviteCreateResponse(
        adminRef=admin_service.invite_ref(invite.id),
        code=code,
        label=invite.label,
        expires_at=invite.expires_at,
        max_uses=invite.max_uses,
        status=service.status_for(invite),
    )


@router.get("", response_model=list[InviteListItem])
def list_invites(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> list[InviteListItem]:
    del admin
    service = InviteService(settings)
    admin_service = AdminService(settings=settings, matrix_admin=matrix_admin)
    return [
        InviteListItem.model_validate(
            {
                "admin_ref": admin_service.invite_ref(invite.id),
                "bound_display_name": invite.bound_display_name,
                "created_at": invite.created_at,
                "disabled_at": invite.disabled_at,
                "expires_at": invite.expires_at,
                "label": invite.label,
                "max_uses": invite.max_uses,
                "status": service.status_for(invite),
                "used_at": invite.used_at,
                "used_count": invite.used_count,
            }
        )
        for invite in service.list_invites(db)
    ]


@router.post("/{admin_ref}/disable", response_model=SuccessResponse)
def disable_invite(
    admin_ref: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    matrix_admin=Depends(get_matrix_admin),
    admin: User = Depends(require_admin),
) -> SuccessResponse:
    admin_service = AdminService(settings=settings, matrix_admin=matrix_admin)
    invite = admin_service.resolve_invite_ref(db, admin_ref)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    InviteService(settings).disable_invite(db, actor=admin, invite_id=invite.id)
    db.commit()
    return SuccessResponse()
