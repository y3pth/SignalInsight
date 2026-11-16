import pytest
from fastapi.testclient import TestClient

from app.contracts.examples import payloads
from app.core.config import Settings
from app.main import create_app
from app.schemas.simulations import SimulationRequest
from app.simulation.generator import generate_simulation
from app.simulation.types import SimulationResult
from scripts.generate_foundation_fixtures import single_tone


@pytest.fixture
def settings() -> Settings:
    return Settings(environment="test")


@pytest.fixture
def client(settings: Settings) -> TestClient:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def simulation_config() -> SimulationRequest:
    return SimulationRequest.model_validate(payloads()["simulation_request"][1])


@pytest.fixture
def simulation_result(simulation_config: SimulationRequest) -> SimulationResult:
    return generate_simulation(simulation_config, single_tone, model_version="1.0.0")
