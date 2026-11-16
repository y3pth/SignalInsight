from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, File, Query, UploadFile

from app.schemas.analysis import (
    AnalysisBatchAccepted,
    AnalysisBatchDetail,
    AnalysisListResponse,
    AnalysisRequest,
    AnalysisRunAccepted,
    AnalysisRunDetail,
    BatchAnalysisRequest,
    RerunRequest,
)
from app.schemas.capabilities import CapabilitiesResponse, ModelDefinition
from app.schemas.common import ErrorResponse
from app.schemas.datasets import (
    DatasetDetail,
    DatasetManifest,
    DatasetMapping,
    DatasetSummaryListResponse,
    DatasetUploadAccepted,
    VariableDescriptor,
)
from app.schemas.enums import AnalysisStatus, ExportFormat, ModelId, SeriesKind
from app.schemas.explanations import (
    ExplanationAccepted,
    ExplanationCreateRequest,
    ExplanationRecord,
)
from app.schemas.health import HealthResponse
from app.schemas.series import SeriesResponse
from app.schemas.simulations import SimulationRequest, SimulationResponse

contract_router = APIRouter()

ERROR: dict[str, Any] = {"model": ErrorResponse}
DEFAULT_ERRORS: dict[int | str, dict[str, Any]] = {
    400: ERROR,
    404: ERROR,
    409: ERROR,
    422: ERROR,
    500: ERROR,
}
UPLOAD_ERRORS: dict[int | str, dict[str, Any]] = {**DEFAULT_ERRORS, 413: ERROR}
AI_ERRORS: dict[int | str, dict[str, Any]] = {**DEFAULT_ERRORS, 503: ERROR}


@contract_router.get(
    "/api/v1/health",
    response_model=HealthResponse,
    summary="Get service health",
)
def health() -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/capabilities",
    response_model=CapabilitiesResponse,
    responses=DEFAULT_ERRORS,
    summary="Get runtime capabilities",
)
def capabilities() -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/models",
    response_model=list[ModelDefinition],
    responses=DEFAULT_ERRORS,
    summary="List registered models",
)
def list_models() -> None:
    raise NotImplementedError


@contract_router.post(
    "/api/v1/datasets",
    response_model=DatasetUploadAccepted,
    status_code=201,
    responses=UPLOAD_ERRORS,
    summary="Upload a dataset",
)
def create_dataset(file: Annotated[UploadFile, File()]) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/datasets",
    response_model=DatasetSummaryListResponse,
    responses=DEFAULT_ERRORS,
    summary="List datasets",
)
def list_datasets(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/datasets/{dataset_id}",
    response_model=DatasetDetail,
    responses=DEFAULT_ERRORS,
    summary="Get dataset details",
)
def get_dataset(dataset_id: UUID) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/datasets/{dataset_id}/variables",
    response_model=list[VariableDescriptor],
    responses=DEFAULT_ERRORS,
    summary="List dataset variables",
)
def get_dataset_variables(dataset_id: UUID) -> None:
    raise NotImplementedError


@contract_router.put(
    "/api/v1/datasets/{dataset_id}/mapping",
    response_model=DatasetManifest,
    responses=DEFAULT_ERRORS,
    summary="Confirm dataset mapping",
)
def put_dataset_mapping(dataset_id: UUID, mapping: DatasetMapping) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/datasets/{dataset_id}/series",
    response_model=SeriesResponse,
    responses=DEFAULT_ERRORS,
    summary="Get dataset preview series",
)
def get_dataset_series(
    dataset_id: UUID,
    series_kind: Annotated[SeriesKind, Query()],
    channel_id: Annotated[str, Query()],
    max_points: Annotated[int, Query(ge=1, le=5000)] = 5000,
    start_time_s: Annotated[float | None, Query()] = None,
    end_time_s: Annotated[float | None, Query()] = None,
) -> None:
    raise NotImplementedError


@contract_router.delete(
    "/api/v1/datasets/{dataset_id}",
    status_code=204,
    responses=DEFAULT_ERRORS,
    summary="Delete a dataset",
)
def delete_dataset(dataset_id: UUID) -> None:
    raise NotImplementedError


@contract_router.post(
    "/api/v1/analysis-runs",
    response_model=AnalysisRunAccepted,
    status_code=202,
    responses=DEFAULT_ERRORS,
    summary="Create an analysis run",
)
def create_analysis_run(request: AnalysisRequest) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/analysis-runs",
    response_model=AnalysisListResponse,
    responses=DEFAULT_ERRORS,
    summary="List analysis runs",
)
def list_analysis_runs(
    status: Annotated[AnalysisStatus | None, Query()] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/analysis-runs/{analysis_id}",
    response_model=AnalysisRunDetail,
    responses=DEFAULT_ERRORS,
    summary="Get analysis run details",
)
def get_analysis_run(analysis_id: UUID) -> None:
    raise NotImplementedError


@contract_router.post(
    "/api/v1/analysis-runs/{analysis_id}/cancel",
    response_model=AnalysisRunDetail,
    responses=DEFAULT_ERRORS,
    summary="Cancel an analysis run",
)
def cancel_analysis_run(analysis_id: UUID) -> None:
    raise NotImplementedError


@contract_router.post(
    "/api/v1/analysis-runs/{analysis_id}/rerun",
    response_model=AnalysisRunAccepted,
    status_code=202,
    responses=DEFAULT_ERRORS,
    summary="Clone an analysis configuration",
)
def rerun_analysis_run(analysis_id: UUID, request: RerunRequest) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/analysis-runs/{analysis_id}/series",
    response_model=SeriesResponse,
    responses=DEFAULT_ERRORS,
    summary="Get fitted or residual series",
)
def get_analysis_series(
    analysis_id: UUID,
    series_kind: Annotated[SeriesKind, Query()],
    model_id: Annotated[ModelId | None, Query()] = None,
    max_points: Annotated[int, Query(ge=1, le=5000)] = 5000,
    start_time_s: Annotated[float | None, Query()] = None,
    end_time_s: Annotated[float | None, Query()] = None,
) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/analysis-runs/{analysis_id}/export",
    responses={
        **DEFAULT_ERRORS,
        200: {
            "content": {
                "application/json": {"schema": {"type": "string", "format": "binary"}},
                "application/zip": {"schema": {"type": "string", "format": "binary"}},
            }
        },
    },
    summary="Export an analysis result",
)
def export_analysis_run(
    analysis_id: UUID,
    format: Annotated[ExportFormat, Query()],
) -> None:
    raise NotImplementedError


@contract_router.post(
    "/api/v1/analysis-batches",
    response_model=AnalysisBatchAccepted,
    status_code=202,
    responses=DEFAULT_ERRORS,
    summary="Create a multichannel analysis batch",
)
def create_analysis_batch(request: BatchAnalysisRequest) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/analysis-batches/{batch_id}",
    response_model=AnalysisBatchDetail,
    responses=DEFAULT_ERRORS,
    summary="Get analysis batch details",
)
def get_analysis_batch(batch_id: UUID) -> None:
    raise NotImplementedError


@contract_router.post(
    "/api/v1/analysis-runs/{analysis_id}/explanations",
    response_model=ExplanationAccepted,
    status_code=202,
    responses=AI_ERRORS,
    summary="Create an analysis explanation",
)
def create_explanation(analysis_id: UUID, request: ExplanationCreateRequest) -> None:
    raise NotImplementedError


@contract_router.get(
    "/api/v1/explanations/{explanation_id}",
    response_model=ExplanationRecord,
    responses=AI_ERRORS,
    summary="Get explanation details",
)
def get_explanation(explanation_id: UUID) -> None:
    raise NotImplementedError


@contract_router.post(
    "/api/v1/simulated-datasets",
    response_model=SimulationResponse,
    status_code=201,
    responses=DEFAULT_ERRORS,
    summary="Generate a simulated dataset",
)
def create_simulated_dataset(request: SimulationRequest) -> None:
    raise NotImplementedError
