from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import ContractModel
from app.schemas.enums import (
    DatasetMediaType,
    DatasetOrigin,
    SamplingKind,
    Severity,
    SignalKind,
)


class DataLocator(ContractModel):
    variable_id: str
    column: str | None = None


class ChannelMapping(ContractModel):
    channel_id: str
    label: str
    signal_kind: SignalKind
    value: DataLocator
    imaginary_value: DataLocator | None = None
    complex_layout: Literal["single_complex_variable", "separate_i_q"] = "single_complex_variable"

    @model_validator(mode="after")
    def validate_complex_mapping(self) -> "ChannelMapping":
        if self.signal_kind == SignalKind.REAL and self.imaginary_value is not None:
            raise ValueError("real channels must not define imaginary_value")
        if self.complex_layout == "separate_i_q" and self.imaginary_value is None:
            raise ValueError("separate_i_q requires imaginary_value")
        return self


class DatasetMapping(ContractModel):
    time: DataLocator | None = None
    sample_rate_hz: float | None = Field(default=None, gt=0)
    channels: list[ChannelMapping] = Field(min_length=1, max_length=32)
    sample_axis: Literal[0, 1] | None = None
    amplitude_unit: str = "a.u."
    phase_reference_s: float = 0

    @model_validator(mode="after")
    def validate_sampling_source(self) -> "DatasetMapping":
        if self.time is None and self.sample_rate_hz is None:
            raise ValueError("time or sample_rate_hz is required")
        return self


class MappingCandidate(ContractModel):
    mapping: DatasetMapping
    reasons: list[str]
    requires_confirmation: bool = True


class VariableDescriptor(ContractModel):
    variable_id: str
    variable_path: str
    data_type: str
    shape: list[int]
    is_complex: bool
    estimated_numeric_count: int = Field(ge=0)
    supported: bool
    unsupported_reason: str | None = None


class ValidationIssue(ContractModel):
    code: str
    message: str
    severity: Severity
    details: dict[str, Any] = Field(default_factory=dict)


class ValidationSummary(ContractModel):
    valid: bool
    issues: list[ValidationIssue]


class ChannelDescriptor(ContractModel):
    channel_id: str
    label: str
    sample_count: int = Field(ge=64, le=500_000)
    signal_kind: SignalKind
    sampling_kind: SamplingKind
    sample_rate_hz: float | None = Field(default=None, gt=0)
    duration_s: float | None = Field(default=None, gt=0)
    amplitude_unit: str
    quality_flags: list[str]


class DatasetManifest(ContractModel):
    dataset_id: UUID
    original_filename: str
    media_type: DatasetMediaType
    origin: DatasetOrigin
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    file_size_bytes: int = Field(gt=0, le=52_428_800)
    total_numeric_count: int = Field(gt=0, le=2_000_000)
    variables: list[VariableDescriptor] = Field(min_length=1)
    channels: list[ChannelDescriptor] = Field(min_length=1, max_length=32)
    detected_mappings: list[MappingCandidate]
    confirmed_mapping: DatasetMapping | None
    validation_summary: ValidationSummary
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DatasetListResponse(ContractModel):
    items: list[DatasetManifest]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
