import numpy as np

from app.schemas.simulations import SimulationRequest
from app.simulation.fixtures import read_analysis_fixture, validate_simulation_fixture
from app.simulation.generator import generate_simulation
from scripts.generate_foundation_fixtures import FIXTURE_DIR, single_tone


def test_committed_foundation_fixture_is_valid() -> None:
    report = validate_simulation_fixture(FIXTURE_DIR)
    assert report.valid, report.errors


def test_committed_fixture_reproduces_from_seed(simulation_config: SimulationRequest) -> None:
    regenerated = generate_simulation(simulation_config, single_tone, "1.0.0")
    stored = read_analysis_fixture(FIXTURE_DIR)

    assert stored.source_sha256 == regenerated.analysis_input.source_sha256
    assert np.array_equal(stored.values, regenerated.analysis_input.values)
    assert np.array_equal(stored.time_s, regenerated.analysis_input.time_s)
