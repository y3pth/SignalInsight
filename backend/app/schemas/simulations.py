from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import ContractModel
from app.schemas.datasets import DatasetManifest
from app.schemas.enums import DatasetOrigin, ModelId, SamplingKind, SignalKind


class SimulationSampling(ContractModel):
    kind: SamplingKind
    sample_rate_hz: float = Field(gt=0)
    sample_count: int = Field(ge=64, le=500_000)
    time_start_s: float = 0
    jitter_ratio: float = Field(default=0, ge=0, le=0.5)
    dropout_ranges: list[tuple[int, int]] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_sampling(self) -> "SimulationSampling":
        if self.kind == SamplingKind.UNKNOWN:
            raise ValueError("simulation sampling kind must be known")
        if self.kind == SamplingKind.UNIFORM and (self.jitter_ratio or self.dropout_ranges):
            raise ValueError("uniform sampling cannot define jitter or dropout ranges")
        if self.kind == SamplingKind.NONUNIFORM and not (self.jitter_ratio or self.dropout_ranges):
            raise ValueError("nonuniform sampling requires jitter or dropout ranges")
        previous_end = 0
        for start, end in sorted(self.dropout_ranges):
            if start < 0 or end <= start or end > self.sample_count:
                raise ValueError("dropout ranges must be ordered and within sample_count")
            if start < previous_end:
                raise ValueError("dropout ranges must not overlap")
            previous_end = end
        return self


class SimulationRequest(ContractModel):
    model_id: ModelId
    signal_kind: SignalKind
    parameters: dict[str, float]
    sampling: SimulationSampling
    noise_model: Literal["gaussian"] = "gaussian"
    snr_db: float | None = None
    random_seed: int
    amplitude_unit: str = "a.u."


class SimulationResponse(ContractModel):
    simulation_id: UUID
    dataset: DatasetManifest

    @model_validator(mode="after")
    def validate_simulation_origin(self) -> "SimulationResponse":
        if self.dataset.origin != DatasetOrigin.SIMULATION:
            raise ValueError("simulation response dataset origin must be simulation")
        return self
