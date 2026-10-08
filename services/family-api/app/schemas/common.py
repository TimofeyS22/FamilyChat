from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class SuccessResponse(BaseModel):
    success: bool = True
