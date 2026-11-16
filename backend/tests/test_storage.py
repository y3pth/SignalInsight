import os
import time
from pathlib import Path

import pytest

from app.persistence.exceptions import (
    ArtifactConflictError,
    ArtifactHashMismatchError,
    ArtifactNotFoundError,
)
from app.persistence.storage import ArtifactStore


@pytest.fixture
def store(tmp_path: Path) -> ArtifactStore:
    return ArtifactStore(tmp_path / "artifacts")


def test_store_read_verify_round_trip(store: ArtifactStore) -> None:
    content = b"artifact-content"
    stored = store.store("runs/run-1/data.npz", content)

    assert stored.size_bytes == len(content)
    assert store.read_bytes("runs/run-1/data.npz") == content
    assert store.verify("runs/run-1/data.npz", stored.sha256) == stored


def test_store_rejects_existing_path(store: ArtifactStore) -> None:
    store.store("a.bin", b"first")

    with pytest.raises(ArtifactConflictError):
        store.store("a.bin", b"second")


def test_store_rejects_path_escape(store: ArtifactStore) -> None:
    with pytest.raises(ValueError, match="escapes"):
        store.store("../escape.bin", b"x")

    with pytest.raises(ValueError, match="absolute"):
        store.store(str(store.root / "escape.bin"), b"x")


def test_missing_artifact_raises(store: ArtifactStore) -> None:
    with pytest.raises(ArtifactNotFoundError):
        store.read_bytes("missing.bin")

    with pytest.raises(ArtifactNotFoundError):
        store.verify("missing.bin", "0" * 64)


def test_hash_mismatch_is_detected(store: ArtifactStore) -> None:
    stored = store.store("a.bin", b"original")
    path = store.path_for("a.bin")
    path.write_bytes(b"tampered")

    with pytest.raises(ArtifactHashMismatchError):
        store.verify("a.bin", stored.sha256)


def test_delete(store: ArtifactStore) -> None:
    store.store("a.bin", b"x")
    assert store.delete("a.bin") is True
    assert store.delete("a.bin") is False


def test_cleanup_stale_temporaries(store: ArtifactStore) -> None:
    store.root.mkdir(parents=True)
    fresh = store.root / "fresh.tmp"
    stale = store.root / "stale.tmp"
    json_file = store.root / "keep.json"
    fresh.write_bytes(b"fresh")
    stale.write_bytes(b"stale")
    json_file.write_bytes(b"keep")
    old = time.time() - 7200
    stale.touch()
    fresh.touch()
    json_file.touch()
    os.utime(stale, (old, old))

    removed = store.cleanup_stale_temporaries(max_age_seconds=3600)

    assert removed == 1
    assert fresh.exists()
    assert json_file.exists()
    assert not stale.exists()
