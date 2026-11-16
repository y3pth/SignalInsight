import numpy as np

from app.schemas.enums import SamplingKind
from app.schemas.simulations import SimulationSampling
from app.simulation.types import Timebase


def generate_timebase(sampling: SimulationSampling, rng: np.random.Generator) -> Timebase:
    count = sampling.sample_count
    if sampling.kind == SamplingKind.UNIFORM:
        time_s = (
            sampling.time_start_s + np.arange(count, dtype=np.float64) / sampling.sample_rate_hz
        )
    else:
        dt = 1.0 / sampling.sample_rate_hz
        increments = np.full(count - 1, dt, dtype=np.float64)
        if sampling.jitter_ratio:
            factors = rng.uniform(
                1.0 - sampling.jitter_ratio,
                1.0 + sampling.jitter_ratio,
                size=count - 1,
            )
            increments *= factors
        time_s = sampling.time_start_s + np.concatenate(
            ([0.0], np.cumsum(increments, dtype=np.float64))
        )

    keep = np.ones(count, dtype=bool)
    for start, end in sampling.dropout_ranges:
        keep[start:end] = False
    if np.count_nonzero(keep) < 64:
        raise ValueError("at least 64 samples must remain after dropout")

    kept_indices = np.flatnonzero(keep).astype(np.int64)
    time_s = np.asarray(time_s[keep], dtype=np.float64)
    if np.any(np.diff(time_s) <= 0):
        raise ValueError("generated timebase must be strictly increasing")

    time_s.setflags(write=False)
    kept_indices.setflags(write=False)
    return Timebase(
        time_s=time_s,
        kept_indices=kept_indices,
        nominal_sample_rate_hz=sampling.sample_rate_hz,
    )
