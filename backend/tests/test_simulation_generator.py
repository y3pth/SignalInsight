import numpy as np
import pytest

from app.schemas.enums import DatasetOrigin
from app.schemas.simulations import SimulationRequest
from app.simulation.generator import generate_simulation
from app.simulation.types import SimulationResult
from scripts.generate_foundation_fixtures import single_tone


def test_generation_is_reproducible(simulation_config: SimulationRequest) -> None:
    first = generate_simulation(simulation_config, single_tone, "1.0.0")
    second = generate_simulation(simulation_config, single_tone, "1.0.0")

    assert np.array_equal(first.analysis_input.values, second.analysis_input.values)
    assert np.array_equal(first.analysis_input.time_s, second.analysis_input.time_s)
    assert first.analysis_input.source_sha256 == second.analysis_input.source_sha256
    assert first.truth.noise.actual_snr_db == second.truth.noise.actual_snr_db


def test_analysis_input_is_separate_from_truth(simulation_result: SimulationResult) -> None:
    signal = simulation_result.analysis_input

    assert signal.origin == DatasetOrigin.SIMULATION
    assert signal.sample_rate_hz == 1024.0
    assert not hasattr(signal, "model_id")
    assert not hasattr(signal, "parameters")
    assert not hasattr(signal, "random_seed")
    assert not hasattr(signal, "clean_values")
    assert not hasattr(signal, "noise_values")
    assert np.allclose(
        signal.values,
        simulation_result.truth.clean_values + simulation_result.truth.noise_values,
    )
    assert simulation_result.truth.noise.actual_snr_db == pytest.approx(20.0, abs=0.5)


def test_generated_arrays_are_read_only(simulation_result: SimulationResult) -> None:
    arrays = [
        simulation_result.analysis_input.values,
        simulation_result.analysis_input.time_s,
        simulation_result.truth.clean_values,
        simulation_result.truth.noise_values,
        simulation_result.truth.kept_indices,
    ]
    assert all(not array.flags.writeable for array in arrays)


def test_real_generator_rejects_complex_output(simulation_config: SimulationRequest) -> None:
    def invalid_generator(context: object) -> np.ndarray:
        return np.ones(1024, dtype=np.complex128)

    with pytest.raises(ValueError, match="must not return complex"):
        generate_simulation(simulation_config, invalid_generator, "1.0.0")


def test_model_version_is_required(simulation_config: SimulationRequest) -> None:
    with pytest.raises(ValueError, match="model_version"):
        generate_simulation(simulation_config, single_tone, "")
