from fastapi import APIRouter, Request

from app.schemas.health import HealthResponse

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=request.app.title,
        version=request.app.version,
        environment=request.app.state.settings.environment,
    )
