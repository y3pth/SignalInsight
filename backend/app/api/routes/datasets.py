from collections.abc import Iterator
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.core.errors import AppError
from app.datasets.service import DatasetService
from app.db import get_session
from app.persistence.exceptions import (
    DatasetInUseError,
    EmptyUploadError,
    UnsupportedFileFormatError,
    UploadTooLargeError,
)
from app.persistence.storage import UploadStore
from app.schemas.common import ErrorResponse
from app.schemas.datasets import (
    DatasetDetail,
    DatasetSummaryListResponse,
    DatasetUploadAccepted,
)

router = APIRouter(tags=["datasets"])

ERROR: dict[str, Any] = {"model": ErrorResponse}
DATASET_ERRORS: dict[int | str, dict[str, Any]] = {
    400: ERROR,
    404: ERROR,
    409: ERROR,
    413: ERROR,
    422: ERROR,
    500: ERROR,
}


def upload_store_for(request: Request) -> UploadStore:
    settings = request.app.state.settings
    return UploadStore(settings.data_dir.resolve() / "uploads", settings.max_upload_bytes)


def read_chunks(file: UploadFile) -> Iterator[bytes]:
    while True:
        chunk = file.file.read(1024 * 1024)
        if not chunk:
            return
        yield chunk


@router.post(
    "/datasets",
    response_model=DatasetUploadAccepted,
    status_code=201,
    responses=DATASET_ERRORS,
    summary="Upload a dataset",
)
def create_dataset(
    file: Annotated[UploadFile, File()],
    session: Annotated[Session, Depends(get_session)],
    upload_store: Annotated[UploadStore, Depends(upload_store_for)],
) -> DatasetUploadAccepted:
    service = DatasetService(session, upload_store)
    try:
        return service.create_upload(file.filename or "", read_chunks(file))
    except UnsupportedFileFormatError as exc:
        raise AppError(
            status_code=400,
            code="UNSUPPORTED_FILE_FORMAT",
            message="Unsupported or invalid file format.",
            details={"filename": file.filename},
        ) from exc
    except EmptyUploadError as exc:
        raise AppError(
            status_code=400,
            code="EMPTY_FILE",
            message="Uploaded file is empty.",
        ) from exc
    except UploadTooLargeError as exc:
        raise AppError(
            status_code=413,
            code="FILE_TOO_LARGE",
            message="Uploaded file exceeds the size limit.",
            details={
                "size_bytes": exc.size_bytes,
                "max_bytes": exc.max_bytes,
            },
        ) from exc


@router.get(
    "/datasets",
    response_model=DatasetSummaryListResponse,
    responses=DATASET_ERRORS,
    summary="List datasets",
)
def list_datasets(
    session: Annotated[Session, Depends(get_session)],
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DatasetSummaryListResponse:
    upload_store = upload_store_for(request)
    return DatasetService(session, upload_store).list(limit, offset)


@router.get(
    "/datasets/{dataset_id}",
    response_model=DatasetDetail,
    responses=DATASET_ERRORS,
    summary="Get dataset details",
)
def get_dataset(
    dataset_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    request: Request,
) -> DatasetDetail:
    upload_store = upload_store_for(request)
    detail = DatasetService(session, upload_store).get_detail(dataset_id)
    if detail is None:
        raise AppError(
            status_code=404,
            code="DATASET_NOT_FOUND",
            message="Dataset not found.",
        )
    return detail


@router.delete(
    "/datasets/{dataset_id}",
    status_code=204,
    responses=DATASET_ERRORS,
    summary="Delete a dataset",
)
def delete_dataset(
    dataset_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    request: Request,
) -> Response:
    upload_store = upload_store_for(request)
    try:
        DatasetService(session, upload_store).delete(dataset_id)
    except DatasetInUseError as exc:
        raise AppError(
            status_code=409,
            code="DATASET_IN_USE",
            message="Dataset is referenced by analysis runs.",
        ) from exc
    except ValueError as exc:
        raise AppError(
            status_code=404,
            code="DATASET_NOT_FOUND",
            message="Dataset not found.",
        ) from exc
    return Response(status_code=204)
