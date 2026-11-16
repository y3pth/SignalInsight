from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.contracts.examples import payloads
from app.persistence.exceptions import DatasetInUseError, DuplicateRequestError
from app.persistence.models import DatasetVariable
from app.persistence.repositories import (
    AnalysisRunRepository,
    ArtifactRepository,
    DatasetRepository,
    SimulationConfigRepository,
)
from app.persistence.storage import ArtifactStore
from app.schemas.analysis import AnalysisRequest, AnalysisStatus
from app.schemas.common import ErrorBody
from app.schemas.datasets import DatasetManifest
from app.schemas.enums import AnalysisStage
from app.schemas.simulations import SimulationRequest


@pytest.fixture
def manifest() -> DatasetManifest:
    return DatasetManifest.model_validate(payloads()["dataset_manifest"][1])


@pytest.fixture
def analysis_request() -> AnalysisRequest:
    return AnalysisRequest.model_validate(payloads()["analysis_request"][1])


def test_dataset_create_list_and_delete(db_session: Session, manifest: DatasetManifest) -> None:
    repository = DatasetRepository(db_session)
    created = repository.create(manifest)

    loaded = repository.get(manifest.dataset_id)
    assert loaded is not None
    assert loaded.id == created.id
    assert len(loaded.variables) == 2
    assert len(loaded.channels) == 1

    datasets, total = repository.list(limit=10, offset=0)
    assert total == 1
    assert datasets[0].id == created.id

    repository.delete(manifest.dataset_id)
    assert repository.get(manifest.dataset_id) is None
    variables = db_session.scalars(select(DatasetVariable)).all()
    assert variables == []


def test_dataset_delete_is_blocked_while_referenced(
    db_session: Session,
    manifest: DatasetManifest,
    analysis_request: AnalysisRequest,
) -> None:
    DatasetRepository(db_session).create(manifest)
    run = AnalysisRunRepository(db_session).create(analysis_request, manifest.dataset_id)

    with pytest.raises(DatasetInUseError):
        DatasetRepository(db_session).delete(manifest.dataset_id)

    db_session.delete(run)
    db_session.commit()
    DatasetRepository(db_session).delete(manifest.dataset_id)
    assert DatasetRepository(db_session).get(manifest.dataset_id) is None


def test_duplicate_client_request_id_is_rejected(
    db_session: Session,
    manifest: DatasetManifest,
    analysis_request: AnalysisRequest,
) -> None:
    DatasetRepository(db_session).create(manifest)
    repository = AnalysisRunRepository(db_session)
    repository.create(analysis_request, manifest.dataset_id)

    with pytest.raises(DuplicateRequestError):
        repository.create(analysis_request, manifest.dataset_id)


def test_analysis_run_status_update(
    db_session: Session,
    manifest: DatasetManifest,
    analysis_request: AnalysisRequest,
) -> None:
    DatasetRepository(db_session).create(manifest)
    repository = AnalysisRunRepository(db_session)
    run = repository.create(analysis_request, manifest.dataset_id)

    updated = repository.update_status(
        UUID(run.id),
        AnalysisStatus.FAILED,
        stage=AnalysisStage.FITTING_MODELS,
        error=ErrorBody(
            code="OPTIMIZATION_FAILED",
            message="optimization failed",
            request_id="request-1",
        ),
    )

    assert updated.status == "failed"
    assert updated.stage == "fitting_models"
    assert updated.error_json is not None
    assert updated.error_json["code"] == "OPTIMIZATION_FAILED"

    runs, total = repository.list(limit=10, offset=0, status=AnalysisStatus.FAILED)
    assert total == 1
    assert runs[0].id == run.id


def test_artifact_repository_and_store(
    db_session: Session,
    tmp_path: Path,
    manifest: DatasetManifest,
    analysis_request: AnalysisRequest,
) -> None:
    DatasetRepository(db_session).create(manifest)
    run = AnalysisRunRepository(db_session).create(analysis_request, manifest.dataset_id)

    store = ArtifactStore(tmp_path / "artifacts")
    stored = store.store("runs/run-1/fit.npz", b"binary-content")

    artifact = ArtifactRepository(db_session).create(
        artifact_id="artifact-1",
        artifact_type="fitted_series",
        media_type="application/octet-stream",
        relative_path=stored.relative_path,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        run_id=UUID(run.id),
    )

    artifacts = ArtifactRepository(db_session).list_for_run(UUID(run.id))
    assert [item.id for item in artifacts] == [artifact.id]
    assert store.verify(stored.relative_path, artifact.sha256) == stored


def test_simulation_config_repository(
    db_session: Session,
    analysis_request: AnalysisRequest,
) -> None:
    config = SimulationRequest.model_validate(payloads()["simulation_request"][1])
    record = SimulationConfigRepository(db_session).store(
        UUID("55555555-5555-4555-8555-555555555555"),
        config,
    )

    assert record.config_json["model_id"] == "single_tone"
    assert record.config_json["random_seed"] == 42
    assert record.dataset_id is None
    assert analysis_request.dataset_id is not None
