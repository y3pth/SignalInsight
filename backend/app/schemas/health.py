from typing import Literal

from app.schemas.base import ContractModel


class HealthResponse(ContractModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str
