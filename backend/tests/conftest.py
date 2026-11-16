import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.contracts.examples import payloads
from app.core.config import Settings
from app.db import create_database_engine
from app.main import create_app
from app.persistence.models import Base
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


@pytest.fixture
def db_engine(tmp_path):
    from sqlalchemy.engine import Engine

    database_url = f"sqlite:///{(tmp_path / 'signalinsight.db').as_posix()}"
    engine: Engine = create_database_engine(Settings(database_url=database_url))
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine) -> Session:
    with Session(db_engine, expire_on_commit=False) as session:
        yield session
