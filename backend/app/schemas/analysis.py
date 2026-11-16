from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import ContractModel
from app.schemas.common import ErrorBody
from app.schemas.datasets import DatasetManifest
from app.schemas.enums import (
    AnalysisMode,
    AnalysisStage,
    AnalysisStatus,
    ExplanationPolicy,
    ModelId,
    ReliabilityLevel,
    SignalKind,
    UncertaintyMethod,
)


class PreprocessingStep(ContractModel):
    name: str
    version: str
    parameters: dict[str, Any] = Field(default_factory=dict)


class PreprocessingConfig(ContractModel):
    missing_policy: Literal["reject", "drop", "interpolate"] = "reject"
    detrend: Literal["none", "constant", "linear"] = "none"
    steps: list[PreprocessingStep] = Field(default_factory=list)


class AnalysisConfig(ContractModel):
    max_tones: int = Field(default=8, ge=1, le=32)
    random_seed: int | None = None
    uncertainty_methods: list[UncertaintyMethod] = Field(
        default_factory=lambda: [UncertaintyMethod.ASYMPTOTIC, UncertaintyMethod.MULTI_START]
    )


class AnalysisRequestBase(ContractModel):
    dataset_id: UUID
    mode: AnalysisMode
    candidate_models: list[ModelId] = Field(default_factory=list)
    preprocessing: PreprocessingConfig = Field(default_factory=PreprocessingConfig)
    analysis_config: AnalysisConfig = Field(default_factory=AnalysisConfig)
    explanation_policy: ExplanationPolicy = ExplanationPolicy.NONE
    client_request_id: str = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_candidates(self) -> "AnalysisRequestBase":
        if self.mode == AnalysisMode.SPECIFIED and not self.candidate_models:
            raise ValueError("candidate_models is required in specified mode")
        if len(set(self.candidate_models)) != len(self.candidate_models):
            raise ValueError("candidate_models must not contain duplicates")
        return self


class AnalysisRequest(AnalysisRequestBase):
    channel_ids: list[str] = Field(min_length=1, max_length=1)


class BatchAnalysisRequest(AnalysisRequestBase):
    channel_ids: list[str] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def validate_channels(self) -> "BatchAnalysisRequest":
        if len(set(self.channel_ids)) != len(self.channel_ids):
            raise ValueError("channel_ids must not contain duplicates")
        return self


class RerunRequest(ContractModel):
    client_request_id: str = Field(min_length=1, max_length=100)


class AnalysisRunAccepted(ContractModel):
    analysis_id: UUID
    status: Literal["queued"]
    created_at: datetime


class ArtifactRef(ContractModel):
    artifact_id: str
    artifact_type: str
    media_type: str
    download_path: str
    size_bytes: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class EvidenceItem(ContractModel):
    evidence_id: str
    category: Literal[
        "sampling",
        "feature",
        "fit",
        "residual",
        "uncertainty",
        "model_comparison",
        "data_quality",
    ]
    code: str
    value: float | str | bool | dict[str, Any] | None
    unit: str | None = None
    threshold: dict[str, Any] | None = None
    source_artifact: str | None = None
    description_key: str


class ParameterEstimate(ContractModel):
    parameter_id: str
    name: str
    value: float | None
    unit: str
    standard_error: float | None = None
    ci95: list[float] | None = Field(default=None, min_length=2, max_length=2)
    estimable: bool
    bounds: list[float | None] = Field(min_length=2, max_length=2)
    at_bound: bool
    phase_reference_s: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OptimizerReport(ContractModel):
    name: str
    success: bool
    status_code: str
    message: str
    iterations: int = Field(ge=0)
    initial_value: float | None = None
    final_value: float | None = None
    multistart_count: int = Field(default=1, ge=1)


class FitMetrics(ContractModel):
    rss: float = Field(ge=0)
    rmse: float = Field(ge=0)
    r2: float | None
    aic: float
    bic: float
    sample_count: int = Field(ge=1)
    free_parameter_count: int = Field(ge=0)


class ResidualSummary(ContractModel):
    mean: float
    std: float = Field(ge=0)
    rms: float = Field(ge=0)
    lag1_autocorr: float | None = None
    max_abs_acf: float | None = None
    dominant_residual_frequency_hz: float | None = None
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class UncertaintyReport(ContractModel):
    methods: list[UncertaintyMethod]
    covariance_artifact: ArtifactRef | None = None
    condition_number: float | None = Field(default=None, gt=0)
    rank: int | None = Field(default=None, ge=0)
    notes: list[str]


class AnalysisWarning(ContractModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class FitResult(ContractModel):
    model_id: ModelId
    model_version: str
    signal_kind: SignalKind
    expression_id: str
    parameters: list[ParameterEstimate]
    free_parameter_count: int = Field(ge=0)
    optimizer: OptimizerReport
    metrics: FitMetrics
    residual_summary: ResidualSummary
    uncertainty: UncertaintyReport
    artifacts: list[ArtifactRef]
    warnings: list[AnalysisWarning]
    evidence: list[EvidenceItem]


class ModelRanking(ContractModel):
    model_id: ModelId
    rank: int = Field(ge=1)
    rmse: float = Field(ge=0)
    aic: float
    bic: float
    eligible: bool


class ComparisonResult(ContractModel):
    recommended_model: ModelId | None
    unknown: bool
    reason_codes: list[str]
    evidence_refs: list[str]
    rankings: list[ModelRanking]

    @model_validator(mode="after")
    def validate_recommendation(self) -> "ComparisonResult":
        if self.unknown and self.recommended_model is not None:
            raise ValueError("unknown comparison must not recommend a model")
        if not self.unknown and self.recommended_model is None:
            raise ValueError("known comparison requires a recommended model")
        return self


class ReliabilityReport(ContractModel):
    level: ReliabilityLevel
    is_unknown: bool
    reason_codes: list[str]
    evidence_refs: list[str]
    limitations: list[str]
    recommended_actions: list[str]
    rule_set_version: str


class AnalysisResult(ContractModel):
    analysis_id: UUID
    input_manifest: DatasetManifest
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    algorithm_version: str
    features: dict[str, Any]
    candidate_results: list[FitResult]
    recommendation: ComparisonResult
    reliability: ReliabilityReport
    warnings: list[AnalysisWarning]
    artifacts: list[ArtifactRef]
    created_at: datetime

    @model_validator(mode="after")
    def validate_result_consistency(self) -> "AnalysisResult":
        if self.source_sha256 != self.input_manifest.source_sha256:
            raise ValueError("source_sha256 must match input_manifest")
        if self.recommendation.unknown != self.reliability.is_unknown:
            raise ValueError("recommendation and reliability unknown states must match")
        return self


class AnalysisRunSummary(ContractModel):
    analysis_id: UUID
    dataset_id: UUID
    channel_ids: list[str]
    status: AnalysisStatus
    stage: AnalysisStage | None
    created_at: datetime
    completed_at: datetime | None = None


class AnalysisRunDetail(AnalysisRunSummary):
    config: AnalysisRequest
    result: AnalysisResult | None = None
    error: ErrorBody | None = None

    @model_validator(mode="after")
    def validate_run_consistency(self) -> "AnalysisRunDetail":
        if self.config.dataset_id != self.dataset_id:
            raise ValueError("config dataset_id must match analysis run")
        if self.config.channel_ids != self.channel_ids:
            raise ValueError("config channel_ids must match analysis run")
        if self.result is not None and self.result.analysis_id != self.analysis_id:
            raise ValueError("result analysis_id must match analysis run")
        if self.status == AnalysisStatus.SUCCEEDED and self.result is None:
            raise ValueError("succeeded analysis run requires a result")
        if self.status == AnalysisStatus.FAILED and self.error is None:
            raise ValueError("failed analysis run requires an error")
        return self


class AnalysisListResponse(ContractModel):
    items: list[AnalysisRunSummary]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)


class AnalysisBatchAccepted(ContractModel):
    batch_id: UUID
    status: Literal["queued"]
    analysis_ids: list[UUID]
    created_at: datetime


class AnalysisBatchDetail(ContractModel):
    batch_id: UUID
    status: AnalysisStatus
    analysis_ids: list[UUID]
    runs: list[AnalysisRunSummary]
    created_at: datetime
    completed_at: datetime | None = None
