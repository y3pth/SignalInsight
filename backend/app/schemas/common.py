from typing import Any

from pydantic import Field

from app.schemas.base import ContractModel


class ErrorBody(ContractModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str


class ErrorResponse(ContractModel):
    error: ErrorBody
