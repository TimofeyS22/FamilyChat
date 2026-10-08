from fastapi import APIRouter

from app.api.routes import admin, auth, calls, family, health, invites, profile, push

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(invites.router, prefix="/invites", tags=["invites"])
api_router.include_router(family.router, prefix="/family", tags=["family"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(push.router, prefix="/push", tags=["push"])
api_router.include_router(calls.router, prefix="/calls", tags=["calls"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
