from fastapi import APIRouter

from app.domain.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.api_route("/health", methods=["GET", "HEAD"], response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()
