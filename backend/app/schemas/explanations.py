from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import ContractModel
from app.schemas.common import ErrorBody
from app.schemas.enums import ExplanationProvider, ExplanationStatus


class ExplanationCreateRequest(ContractModel):
    provider: ExplanationProvider = ExplanationProvider.AUTO
    response_language: Literal["zh-CN"] = "zh-CN"


class ExplanationAccepted(ContractModel):
    explanation_id: UUID
    status: Literal["queued"]
    created_at: datetime


class ParameterExplanation(ContractModel):
    parameter_id: str
    text: str


class Observation(ContractModel):
    text: str
    evidence_refs: list[str] = Field(min_length=1)


class ExplanationResult(ContractModel):
    summary: str
    parameter_explanations: list[ParameterExplanation]
    observations: list[Observation]
    limitations: list[str]
    recommended_next_steps: list[str]
    provider: Literal["qoder", "bailian", "template"]
    runtime_model: str | None = None
    prompt_version: str
    is_fallback: bool
    validation_report: dict[str, Any]


class ExplanationRecord(ContractModel):
    explanation_id: UUID
    analysis_id: UUID
    status: ExplanationStatus
    result: ExplanationResult | None = None
    error: ErrorBody | None = None
    created_at: datetime
    completed_at: datetime | None = None
