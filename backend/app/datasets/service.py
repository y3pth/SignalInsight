from collections.abc import Iterator
from datetime import datetime, timezone
from itertools import chain
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.datasets.media import detect_media_type, safe_original_filename
from app.persistence.exceptions import (
    ArtifactNotFoundError,
    EmptyUploadError,
    UnsupportedFileFormatError,
)
from app.persistence.models import Dataset
from app.persistence.repositories import DatasetRepository
from app.persistence.storage import UploadStore
from app.schemas.datasets import (
    DatasetDetail,
    DatasetSummary,
    DatasetSummaryListResponse,
    DatasetUploadAccepted,
)
from app.schemas.enums import DatasetMediaType, DatasetOrigin, DatasetStatus


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _summary(record: Dataset) -> DatasetSummary:
    return DatasetSummary(
        dataset_id=UUID(record.id),
        original_filename=record.original_filename,
        media_type=DatasetMediaType(record.media_type),
        origin=DatasetOrigin(record.origin),
        source_sha256=record.source_sha256,
        file_size_bytes=record.file_size_bytes,
        total_numeric_count=record.total_numeric_count,
        status=DatasetStatus(record.status),
        created_at=_as_utc(record.created_at),
    )


class DatasetService:
    def __init__(self, session: Session, upload_store: UploadStore) -> None:
        self.session = session
        self.upload_store = upload_store
        self.repository = DatasetRepository(session)

    def create_upload(
        self,
        filename: str,
        stream: Iterator[bytes],
    ) -> DatasetUploadAccepted:
        safe_name = safe_original_filename(filename)
        if safe_name is None:
            raise UnsupportedFileFormatError("invalid upload filename")
        try:
            first_chunk = next(stream)
        except StopIteration:
            raise EmptyUploadError("uploaded file is empty") from None
        if not first_chunk:
            raise EmptyUploadError("uploaded file is empty")
        media_type = detect_media_type(safe_name, first_chunk[:8])
        if media_type is None:
            raise UnsupportedFileFormatError("unsupported file extension")

        dataset_id = uuid4()
        relative_path = f"{dataset_id}/original{Path(safe_name).suffix.lower()}"
        stored = self.upload_store.store_stream(
            relative_path,
            chain([first_chunk], stream),
        )
        record = self.repository.create_upload(
            dataset_id=dataset_id,
            original_filename=safe_name,
            media_type=media_type,
            source_sha256=stored.sha256,
            file_size_bytes=stored.size_bytes,
            upload_path=stored.relative_path,
        )
        return DatasetUploadAccepted(
            dataset_id=dataset_id,
            status="uploaded",
            original_filename=safe_name,
            media_type=media_type,
            source_sha256=stored.sha256,
            file_size_bytes=stored.size_bytes,
            created_at=_as_utc(record.created_at),
        )

    def get_summary(self, dataset_id: UUID) -> DatasetSummary | None:
        record = self.repository.get(dataset_id)
        return _summary(record) if record else None

    def get_detail(self, dataset_id: UUID) -> DatasetDetail | None:
        record = self.repository.get(dataset_id)
        if record is None:
            return None
        return DatasetDetail.model_validate({**_summary(record).model_dump(), "manifest": None})

    def list(self, limit: int, offset: int) -> DatasetSummaryListResponse:
        records, total = self.repository.list(limit, offset)
        return DatasetSummaryListResponse(
            items=[_summary(record) for record in records],
            total=total,
            limit=limit,
            offset=offset,
        )

    def delete(self, dataset_id: UUID) -> None:
        record = self.repository.get(dataset_id)
        if record is None:
            raise ValueError("dataset not found")
        self.repository.delete(dataset_id)
        if record.upload_path:
            try:
                self.upload_store.delete(record.upload_path)
            except ArtifactNotFoundError:
                pass
