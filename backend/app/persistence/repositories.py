from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.persistence.exceptions import (
    ArtifactConflictError,
    DatasetInUseError,
    DuplicateRequestError,
)
from app.persistence.models import (
    AnalysisRun,
    AnalysisRunChannel,
    Artifact,
    Dataset,
    DatasetChannel,
    DatasetVariable,
    SimulationConfig,
)
from app.schemas.analysis import AnalysisRequest
from app.schemas.common import ErrorBody
from app.schemas.datasets import DatasetManifest, DatasetMapping
from app.schemas.enums import AnalysisStage, AnalysisStatus
from app.schemas.simulations import SimulationRequest


class DatasetRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, manifest: DatasetManifest) -> Dataset:
        dataset = Dataset(
            id=str(manifest.dataset_id),
            original_filename=manifest.original_filename,
            media_type=manifest.media_type.value,
            origin=manifest.origin.value,
            source_sha256=manifest.source_sha256,
            file_size_bytes=manifest.file_size_bytes,
            total_numeric_count=manifest.total_numeric_count,
            confirmed_mapping=(
                manifest.confirmed_mapping.model_dump(mode="json")
                if manifest.confirmed_mapping
                else None
            ),
            validation_summary=manifest.validation_summary.model_dump(mode="json"),
            extra=dict(manifest.metadata),
        )
        dataset.variables = [
            DatasetVariable(
                id=str(uuid4()),
                variable_path=variable.variable_path,
                data_type=variable.data_type,
                shape=list(variable.shape),
                is_complex=variable.is_complex,
                estimated_numeric_count=variable.estimated_numeric_count,
                supported=variable.supported,
                unsupported_reason=variable.unsupported_reason,
            )
            for variable in manifest.variables
        ]
        dataset.channels = [
            DatasetChannel(
                id=str(uuid4()),
                label=channel.label,
                sample_count=channel.sample_count,
                signal_kind=channel.signal_kind.value,
                sampling_kind=channel.sampling_kind.value,
                sample_rate_hz=channel.sample_rate_hz,
                duration_s=channel.duration_s,
                amplitude_unit=channel.amplitude_unit,
                quality_flags=list(channel.quality_flags),
            )
            for channel in manifest.channels
        ]
        self.session.add(dataset)
        self.session.commit()
        self.session.refresh(dataset)
        return dataset

    def get(self, dataset_id: UUID) -> Dataset | None:
        return self.session.get(Dataset, str(dataset_id))

    def list(self, limit: int, offset: int) -> tuple[list[Dataset], int]:
        total = self.session.scalar(select(func.count()).select_from(Dataset)) or 0
        datasets = list(
            self.session.scalars(
                select(Dataset).order_by(Dataset.created_at.desc()).limit(limit).offset(offset)
            )
        )
        return datasets, total

    def update_mapping(self, dataset_id: UUID, mapping: DatasetMapping) -> Dataset:
        dataset = self.get(dataset_id)
        if dataset is None:
            raise ValueError("dataset not found")
        dataset.confirmed_mapping = mapping.model_dump(mode="json")
        self.session.commit()
        return dataset

    def delete(self, dataset_id: UUID) -> None:
        dataset = self.get(dataset_id)
        if dataset is None:
            raise ValueError("dataset not found")
        referenced = self.session.scalar(
            select(func.count())
            .select_from(AnalysisRun)
            .where(AnalysisRun.dataset_id == str(dataset_id))
        )
        if referenced:
            raise DatasetInUseError("dataset is referenced by analysis runs")
        self.session.delete(dataset)
        self.session.commit()


class AnalysisRunRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, request: AnalysisRequest, dataset_id: UUID) -> AnalysisRun:
        run = AnalysisRun(
            id=str(uuid4()),
            dataset_id=str(dataset_id),
            channel_ids=list(request.channel_ids),
            status="queued",
            stage=None,
            config_json=request.model_dump(mode="json"),
            client_request_id=request.client_request_id,
        )
        run_channels = [
            AnalysisRunChannel(id=str(uuid4()), channel_id=channel_id)
            for channel_id in request.channel_ids
        ]
        run.channel_rows = run_channels
        self.session.add(run)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise DuplicateRequestError("client_request_id already exists") from exc
        self.session.refresh(run)
        return run

    def get(self, run_id: UUID) -> AnalysisRun | None:
        return self.session.get(AnalysisRun, str(run_id))

    def list(
        self,
        limit: int,
        offset: int,
        status: AnalysisStatus | None = None,
    ) -> tuple[list[AnalysisRun], int]:
        statement = select(AnalysisRun)
        count_statement = select(func.count()).select_from(AnalysisRun)
        if status is not None:
            statement = statement.where(AnalysisRun.status == status.value)
            count_statement = count_statement.where(AnalysisRun.status == status.value)
        total = self.session.scalar(count_statement) or 0
        runs = list(
            self.session.scalars(
                statement.order_by(AnalysisRun.created_at.desc()).limit(limit).offset(offset)
            )
        )
        return runs, total

    def update_status(
        self,
        run_id: UUID,
        status: AnalysisStatus,
        *,
        stage: AnalysisStage | None = None,
        error: ErrorBody | None = None,
    ) -> AnalysisRun:
        run = self.get(run_id)
        if run is None:
            raise ValueError("analysis run not found")
        run.status = status.value
        if stage is not None:
            run.stage = stage.value
        run.error_json = error.model_dump(mode="json") if error else None
        self.session.commit()
        return run


class ArtifactRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        *,
        artifact_id: str,
        artifact_type: str,
        media_type: str,
        relative_path: str,
        size_bytes: int,
        sha256: str,
        dataset_id: UUID | None = None,
        run_id: UUID | None = None,
    ) -> Artifact:
        artifact = Artifact(
            id=artifact_id,
            run_id=str(run_id) if run_id else None,
            dataset_id=str(dataset_id) if dataset_id else None,
            artifact_type=artifact_type,
            media_type=media_type,
            relative_path=relative_path,
            size_bytes=size_bytes,
            sha256=sha256,
        )
        self.session.add(artifact)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise ArtifactConflictError("artifact conflict") from exc
        self.session.refresh(artifact)
        return artifact

    def list_for_run(self, run_id: UUID) -> list[Artifact]:
        return list(
            self.session.scalars(
                select(Artifact).where(Artifact.run_id == str(run_id)).order_by(Artifact.created_at)
            )
        )


class SimulationConfigRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def store(
        self,
        simulation_id: UUID,
        config: SimulationRequest,
        dataset_id: UUID | None = None,
    ) -> SimulationConfig:
        record = SimulationConfig(
            id=str(simulation_id),
            dataset_id=str(dataset_id) if dataset_id else None,
            config_json=config.model_dump(mode="json"),
        )
        self.session.add(record)
        self.session.commit()
        return record
