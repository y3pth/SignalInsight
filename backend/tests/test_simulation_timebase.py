import numpy as np
import pytest
from pydantic import ValidationError

from app.schemas.enums import SamplingKind
from app.schemas.simulations import SimulationSampling
from app.simulation.timebase import generate_timebase


def test_uniform_timebase_is_exact() -> None:
    sampling = SimulationSampling(
        kind=SamplingKind.UNIFORM,
        sample_rate_hz=1000.0,
        sample_count=64,
        time_start_s=2.0,
    )
    result = generate_timebase(sampling, np.random.default_rng(42))

    assert result.time_s[0] == 2.0
    assert result.time_s[-1] == 2.063
    assert np.array_equal(result.kept_indices, np.arange(64))
    assert not result.time_s.flags.writeable


def test_nonuniform_timebase_is_reproducible_and_strictly_increasing() -> None:
    sampling = SimulationSampling(
        kind=SamplingKind.NONUNIFORM,
        sample_rate_hz=1000.0,
        sample_count=128,
        jitter_ratio=0.2,
        dropout_ranges=[(10, 20)],
    )
    first = generate_timebase(sampling, np.random.default_rng(42))
    second = generate_timebase(sampling, np.random.default_rng(42))

    assert np.array_equal(first.time_s, second.time_s)
    assert np.all(np.diff(first.time_s) > 0)
    assert first.time_s.size == 118
    assert not np.any((first.kept_indices >= 10) & (first.kept_indices < 20))


def test_nonuniform_requires_actual_nonuniformity() -> None:
    with pytest.raises(ValidationError):
        SimulationSampling(
            kind=SamplingKind.NONUNIFORM,
            sample_rate_hz=1000.0,
            sample_count=128,
        )


def test_dropout_must_leave_enough_samples() -> None:
    sampling = SimulationSampling(
        kind=SamplingKind.NONUNIFORM,
        sample_rate_hz=1000.0,
        sample_count=64,
        dropout_ranges=[(0, 1)],
    )
    with pytest.raises(ValueError, match="at least 64"):
        generate_timebase(sampling, np.random.default_rng(42))


def test_overlapping_dropout_ranges_are_rejected() -> None:
    with pytest.raises(ValidationError):
        SimulationSampling(
            kind=SamplingKind.NONUNIFORM,
            sample_rate_hz=1000.0,
            sample_count=128,
            dropout_ranges=[(0, 20), (10, 30)],
        )
