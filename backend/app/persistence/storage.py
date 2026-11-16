import hashlib
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from app.core.hashing import compute_file_sha256
from app.core.paths import resolve_within
from app.persistence.exceptions import (
    ArtifactConflictError,
    ArtifactHashMismatchError,
    ArtifactNotFoundError,
    EmptyUploadError,
    UploadTooLargeError,
)


@dataclass(frozen=True)
class StoredArtifact:
    relative_path: str
    size_bytes: int
    sha256: str


class ArtifactStore:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def path_for(self, relative_path: str) -> Path:
        return resolve_within(self.root, relative_path)

    def store(self, relative_path: str, content: bytes) -> StoredArtifact:
        path = self.path_for(relative_path)
        if path.exists():
            raise ArtifactConflictError(f"artifact already exists: {relative_path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with path.open("xb") as file:
                file.write(content)
        except Exception:
            if path.exists():
                path.unlink()
            raise
        return StoredArtifact(
            relative_path=relative_path,
            size_bytes=path.stat().st_size,
            sha256=compute_file_sha256(path),
        )

    def read_bytes(self, relative_path: str) -> bytes:
        path = self.path_for(relative_path)
        if not path.exists():
            raise ArtifactNotFoundError(relative_path)
        return path.read_bytes()

    def verify(self, relative_path: str, expected_sha256: str) -> StoredArtifact:
        path = self.path_for(relative_path)
        if not path.exists():
            raise ArtifactNotFoundError(relative_path)
        actual_sha256 = compute_file_sha256(path)
        if actual_sha256 != expected_sha256:
            raise ArtifactHashMismatchError(relative_path)
        return StoredArtifact(
            relative_path=relative_path,
            size_bytes=path.stat().st_size,
            sha256=actual_sha256,
        )

    def delete(self, relative_path: str) -> bool:
        path = self.path_for(relative_path)
        if not path.exists():
            return False
        path.unlink()
        return True

    def cleanup_stale_temporaries(self, max_age_seconds: int = 3600) -> int:
        cutoff = time.time() - max_age_seconds
        removed = 0
        for temporary in self.root.rglob("*.tmp"):
            try:
                if temporary.stat().st_mtime < cutoff:
                    temporary.unlink()
                    removed += 1
            except OSError:
                continue
        return removed


class UploadStore:
    def __init__(self, root: Path, max_bytes: int) -> None:
        self.root = root.resolve()
        self.max_bytes = max_bytes

    def store_stream(self, relative_path: str, stream: Iterator[bytes]) -> StoredArtifact:
        path = resolve_within(self.root, relative_path)
        if path.exists():
            raise ArtifactConflictError(f"upload already exists: {relative_path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        size = 0
        try:
            with path.open("xb") as output:
                for chunk in stream:
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > self.max_bytes:
                        raise UploadTooLargeError(size, self.max_bytes)
                    digest.update(chunk)
                    output.write(chunk)
        except Exception:
            if path.exists():
                path.unlink()
            raise
        if size == 0:
            path.unlink()
            raise EmptyUploadError("uploaded file is empty")
        try:
            path.chmod(path.stat().st_mode & ~0o222)
        except OSError:
            pass
        return StoredArtifact(
            relative_path=relative_path,
            size_bytes=size,
            sha256=digest.hexdigest(),
        )

    def delete(self, relative_path: str) -> bool:
        path = resolve_within(self.root, relative_path)
        if not path.exists():
            return False
        try:
            path.chmod(path.stat().st_mode | 0o222)
        except OSError:
            pass
        path.unlink()
        return True
