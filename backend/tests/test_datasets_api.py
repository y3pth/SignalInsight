import hashlib
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.contracts.examples import payloads
from app.core.config import Settings
from app.db import create_database_engine, engine_for_url
from app.main import create_app
from app.persistence.models import Base
from app.persistence.repositories import AnalysisRunRepository
from app.schemas.analysis import AnalysisRequest
from app.schemas.enums import DatasetMediaType


@pytest.fixture
def dataset_settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        data_dir=tmp_path / "data",
        database_url=f"sqlite:///{(tmp_path / 'signalinsight.db').as_posix()}",
    )


@pytest.fixture
def api_client(dataset_settings: Settings) -> TestClient:
    engine = create_database_engine(dataset_settings)
    Base.metadata.create_all(engine)
    engine.dispose()
    with TestClient(create_app(dataset_settings)) as client:
        yield client


def upload(client: TestClient, filename: str, content: bytes):
    return client.post(
        "/api/v1/datasets",
        files={"file": (filename, content, "application/octet-stream")},
    )


def test_upload_csv_flow(dataset_settings: Settings, api_client: TestClient) -> None:
    content = b"time,ch_1\n0.0,1.0\n0.001,2.0\n"
    response = upload(api_client, "sample.csv", content)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "uploaded"
    assert body["media_type"] == "csv"
    assert body["file_size_bytes"] == len(content)
    assert body["source_sha256"] == hashlib.sha256(content).hexdigest()
    dataset_id = UUID(body["dataset_id"])

    stored_path = dataset_settings.data_dir.resolve() / "uploads" / f"{dataset_id}" / "original.csv"
    assert stored_path.read_bytes() == content

    listed = api_client.get("/api/v1/datasets").json()
    assert listed["total"] == 1
    assert listed["items"][0]["dataset_id"] == str(dataset_id)

    detail = api_client.get(f"/api/v1/datasets/{dataset_id}").json()
    assert detail["manifest"] is None
    assert detail["status"] == "uploaded"
    assert stored_path.read_bytes() == content

    deleted = api_client.delete(f"/api/v1/datasets/{dataset_id}")
    assert deleted.status_code == 204
    assert not stored_path.exists()
    assert api_client.get("/api/v1/datasets").json()["total"] == 0


def test_unsupported_extension_is_rejected(api_client: TestClient) -> None:
    response = upload(api_client, "sample.txt", b"content")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE_FORMAT"


def test_empty_upload_is_rejected(api_client: TestClient) -> None:
    response = upload(api_client, "sample.csv", b"")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "EMPTY_FILE"


def test_oversized_upload_is_rejected(tmp_path: Path) -> None:
    settings = Settings(
        environment="test",
        data_dir=tmp_path / "data",
        database_url=f"sqlite:///{(tmp_path / 'signalinsight.db').as_posix()}",
        max_upload_bytes=8,
    )
    engine = create_database_engine(settings)
    Base.metadata.create_all(engine)
    engine.dispose()
    with TestClient(create_app(settings)) as client:
        response = upload(client, "large.csv", b"a" * 32)

    assert response.status_code == 413
    error = response.json()["error"]
    assert error["code"] == "FILE_TOO_LARGE"
    assert error["details"]["max_bytes"] == 8
    uploads_dir = settings.data_dir.resolve() / "uploads"
    assert not uploads_dir.exists() or not any(uploads_dir.rglob("*.csv"))


def test_mat_v7_3_detection(api_client: TestClient) -> None:
    content = b"\x89HDF\r\n\x1a\n" + b"\x00" * 64
    response = upload(api_client, "signal.mat", content)

    assert response.status_code == 201
    assert response.json()["media_type"] == "mat_v7_3"


def test_classic_mat_detection(api_client: TestClient) -> None:
    content = b"MATL" + b"\x00" * 64
    response = upload(api_client, "signal.mat", content)

    assert response.status_code == 201
    assert response.json()["media_type"] == DatasetMediaType.MAT.value


def test_delete_is_blocked_for_referenced_dataset(
    dataset_settings: Settings, api_client: TestClient
) -> None:
    response = upload(api_client, "sample.csv", b"time,ch_1\n0.0,1.0\n")
    dataset_id = UUID(response.json()["dataset_id"])
    request = AnalysisRequest.model_validate(payloads()["analysis_request"][1])

    engine = engine_for_url(dataset_settings.database_url)
    with Session(engine, expire_on_commit=False) as session:
        AnalysisRunRepository(session).create(request, dataset_id)
    engine.dispose()

    deleted = api_client.delete(f"/api/v1/datasets/{dataset_id}")
    assert deleted.status_code == 409
    assert deleted.json()["error"]["code"] == "DATASET_IN_USE"


def test_missing_dataset_returns_404(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/datasets/11111111-1111-4111-8111-111111111111")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "DATASET_NOT_FOUND"
    assert api_client.get("/api/v1/datasets").json()["items"] == []
