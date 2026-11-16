from pathlib import Path

import numpy as np

from app.contracts.examples import payloads
from app.schemas.simulations import SimulationRequest
from app.simulation.fixtures import validate_simulation_fixture, write_simulation_fixture
from app.simulation.generator import generate_simulation
from app.simulation.types import SignalArray, SimulationContext

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = PROJECT_ROOT / "fixtures" / "backend" / "single_tone_uniform_seed42"


def single_tone(context: SimulationContext) -> SignalArray:
    parameters = context.parameters
    tau = context.time_s - context.phase_reference_s
    return np.asarray(
        parameters["offset"]
        + parameters["amplitude"]
        * np.sin(2 * np.pi * parameters["frequency"] * tau + parameters["phase"]),
        dtype=np.float64,
    )


def main() -> None:
    if FIXTURE_DIR.exists():
        report = validate_simulation_fixture(FIXTURE_DIR)
        if not report.valid:
            raise ValueError(f"existing fixture is invalid: {report.errors}")
        print(f"Validated existing fixture: {FIXTURE_DIR}")
        return

    config = SimulationRequest.model_validate(payloads()["simulation_request"][1])
    result = generate_simulation(config, single_tone, model_version="1.0.0")
    manifest = write_simulation_fixture(result, FIXTURE_DIR)
    print(f"Generated fixture: {FIXTURE_DIR}")
    print(f"Analysis SHA-256: {manifest['analysis_source_sha256']}")


if __name__ == "__main__":
    main()
