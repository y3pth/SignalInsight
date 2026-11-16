from collections.abc import Callable
from typing import cast

import numpy as np

from app.core.hashing import compute_signal_sha256
from app.schemas.enums import DatasetOrigin, SamplingKind, SignalKind
from app.schemas.simulations import SimulationRequest
from app.simulation.noise import apply_gaussian_noise
from app.simulation.timebase import generate_timebase
from app.simulation.types import (
    AnalysisSignalInput,
    SignalArray,
    SimulationContext,
    SimulationResult,
    SimulationTruth,
)

GENERATOR_VERSION = "1.0.0"
ModelGenerator = Callable[[SimulationContext], SignalArray]


def _validate_generated_values(
    values: SignalArray,
    expected_size: int,
    signal_kind: SignalKind,
) -> SignalArray:
    if values.shape != (expected_size,):
        raise ValueError("model generator must return a one-dimensional time-aligned array")
    if not np.all(np.isfinite(values)):
        raise ValueError("model generator returned non-finite samples")
    if signal_kind == SignalKind.REAL:
        if np.iscomplexobj(values):
            raise ValueError("real signal generator must not return complex samples")
        return np.asarray(values, dtype=np.float64)
    return np.asarray(values, dtype=np.complex128)


def generate_simulation(
    config: SimulationRequest,
    generator: ModelGenerator,
    model_version: str,
) -> SimulationResult:
    if not model_version:
        raise ValueError("model_version is required")
    rng = np.random.default_rng(config.random_seed)
    timebase = generate_timebase(config.sampling, rng)
    context = SimulationContext(
        time_s=timebase.time_s,
        parameters=dict(config.parameters),
        signal_kind=config.signal_kind,
        phase_reference_s=config.sampling.time_start_s,
    )
    clean_values = _validate_generated_values(
        generator(context),
        timebase.time_s.size,
        config.signal_kind,
    )
    noise = apply_gaussian_noise(clean_values, config.snr_db, rng)
    noisy_values = cast(SignalArray, np.asarray(noise.noisy_values))
    source_sha256 = compute_signal_sha256(noisy_values, timebase.time_s)

    for array in (
        clean_values,
        noise.noise_values,
        noisy_values,
    ):
        array.setflags(write=False)

    analysis_input = AnalysisSignalInput(
        values=noisy_values,
        time_s=timebase.time_s,
        sample_rate_hz=(
            config.sampling.sample_rate_hz if config.sampling.kind == SamplingKind.UNIFORM else None
        ),
        signal_kind=config.signal_kind,
        sampling_kind=config.sampling.kind,
        amplitude_unit=config.amplitude_unit,
        phase_reference_s=config.sampling.time_start_s,
        origin=DatasetOrigin.SIMULATION,
        source_sha256=source_sha256,
    )
    truth = SimulationTruth(
        config=config.model_copy(deep=True),
        model_version=model_version,
        generator_version=GENERATOR_VERSION,
        noise=noise.report,
        clean_values=clean_values,
        noise_values=noise.noise_values,
        kept_indices=timebase.kept_indices,
    )
    return SimulationResult(analysis_input=analysis_input, truth=truth)
