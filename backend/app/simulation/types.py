from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray

from app.schemas.enums import DatasetOrigin, SamplingKind, SignalKind
from app.schemas.simulations import SimulationRequest

FloatArray = NDArray[np.float64]
ComplexArray = NDArray[np.complex128]
IntArray = NDArray[np.int64]
SignalArray = FloatArray | ComplexArray


@dataclass(frozen=True)
class Timebase:
    time_s: FloatArray
    kept_indices: IntArray
    nominal_sample_rate_hz: float


@dataclass(frozen=True)
class SimulationContext:
    time_s: FloatArray
    parameters: dict[str, float]
    signal_kind: SignalKind
    phase_reference_s: float


@dataclass(frozen=True)
class NoiseReport:
    target_snr_db: float | None
    actual_snr_db: float | None
    signal_power: float
    noise_power: float
    definition: str


@dataclass(frozen=True)
class AnalysisSignalInput:
    values: SignalArray
    time_s: FloatArray
    sample_rate_hz: float | None
    signal_kind: SignalKind
    sampling_kind: SamplingKind
    amplitude_unit: str
    phase_reference_s: float
    origin: DatasetOrigin
    source_sha256: str


@dataclass(frozen=True)
class SimulationTruth:
    config: SimulationRequest
    model_version: str
    generator_version: str
    noise: NoiseReport
    clean_values: SignalArray
    noise_values: SignalArray
    kept_indices: IntArray


@dataclass(frozen=True)
class SimulationResult:
    analysis_input: AnalysisSignalInput
    truth: SimulationTruth


@dataclass(frozen=True)
class NoiseApplication:
    noisy_values: SignalArray
    noise_values: SignalArray
    report: NoiseReport


@dataclass(frozen=True)
class FixtureValidationReport:
    valid: bool
    errors: list[str]
    checked_files: int


JsonObject = dict[str, Any]
