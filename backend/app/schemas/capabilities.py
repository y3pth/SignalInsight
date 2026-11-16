from typing import Literal

from pydantic import Field

from app.schemas.base import ContractModel
from app.schemas.enums import ModelId, SamplingKind, SignalKind


class AIProviderCapability(ContractModel):
    provider: Literal["qoder", "bailian", "template"]
    available: bool
    reason: str | None = None


class CapabilitiesResponse(ContractModel):
    api_version: Literal["v1"]
    contract_version: str
    dataset_formats: list[str]
    signal_kinds: list[SignalKind]
    sampling_kinds: list[SamplingKind]
    analysis_tasks: bool
    batch_tasks: bool
    ai_providers: list[AIProviderCapability]


class ModelParameterDefinition(ContractModel):
    parameter_id: str
    name: str
    unit: str
    description: str
    bounds: list[float | None] = Field(min_length=2, max_length=2)


class ModelDefinition(ContractModel):
    model_id: ModelId
    model_version: str
    expression_id: str
    display_name: str
    supported_signal_kinds: list[SignalKind]
    supported_sampling_kinds: list[SamplingKind]
    enabled: bool
    parameters: list[ModelParameterDefinition]
