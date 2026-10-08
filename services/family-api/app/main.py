from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.routes.push import matrix_push_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.session import create_db_engine, create_session_factory
from app.integrations.synapse import SynapseAdminClient
from app.security.rate_limit import InMemoryRateLimiter
from app.services.matrix_admin import MatrixAdminService


def create_app(
    *,
    settings: Settings | None = None,
    matrix_admin: MatrixAdminService | None = None,
) -> FastAPI:
    configure_logging()
    resolved_settings = settings or get_settings()
    engine = create_db_engine(resolved_settings)
    session_factory = create_session_factory(engine)

    app = FastAPI(title="FamilyChat Family API", version="0.1.0")
    cors_origins = resolved_settings.cors_origins()
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_headers=["Authorization", "Content-Type"],
            allow_methods=["GET", "PATCH", "POST", "OPTIONS"],
            allow_origins=cors_origins,
        )
    app.state.settings = resolved_settings
    app.state.engine = engine
    app.state.SessionLocal = session_factory
    app.state.rate_limiter = InMemoryRateLimiter(resolved_settings.rate_limit_window_seconds)
    app.state.matrix_admin = matrix_admin or MatrixAdminService(
        SynapseAdminClient(resolved_settings),
        resolved_settings,
    )
    app.include_router(api_router, prefix="/api")
    app.include_router(matrix_push_router)
    return app


app = create_app()
