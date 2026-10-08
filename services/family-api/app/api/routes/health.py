from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.migrations import check_database
from app.schemas.common import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/db", response_model=HealthResponse)
def health_db(db: Session = Depends(get_db)) -> HealthResponse:
    try:
        check_database(db)
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return HealthResponse(status="ok")
