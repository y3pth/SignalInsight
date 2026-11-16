"""create core persistence tables

Revision ID: 20261116_0001
Revises:
Create Date: 2026-11-16

"""
from alembic import op
import sqlalchemy as sa

revision = "20261116_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("original_filename", sa.String(length=512), nullable=False),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("origin", sa.String(length=16), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("total_numeric_count", sa.Integer(), nullable=False),
        sa.Column("confirmed_mapping", sa.JSON(), nullable=True),
        sa.Column("validation_summary", sa.JSON(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "dataset_variables",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("variable_path", sa.String(length=512), nullable=False),
        sa.Column("data_type", sa.String(length=64), nullable=False),
        sa.Column("shape", sa.JSON(), nullable=False),
        sa.Column("is_complex", sa.Boolean(), nullable=False),
        sa.Column("estimated_numeric_count", sa.Integer(), nullable=False),
        sa.Column("supported", sa.Boolean(), nullable=False),
        sa.Column("unsupported_reason", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dataset_variables_dataset_id",
        "dataset_variables",
        ["dataset_id"],
        unique=False,
    )
    op.create_table(
        "dataset_channels",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=256), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("signal_kind", sa.String(length=32), nullable=False),
        sa.Column("sampling_kind", sa.String(length=32), nullable=False),
        sa.Column("sample_rate_hz", sa.Float(), nullable=True),
        sa.Column("duration_s", sa.Float(), nullable=True),
        sa.Column("amplitude_unit", sa.String(length=64), nullable=False),
        sa.Column("quality_flags", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dataset_channels_dataset_id",
        "dataset_channels",
        ["dataset_id"],
        unique=False,
    )
    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("channel_ids", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("stage", sa.String(length=64), nullable=True),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("algorithm_version", sa.String(length=64), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_json", sa.JSON(), nullable=True),
        sa.Column("client_request_id", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_request_id", name="uq_analysis_runs_client_request_id"),
    )
    op.create_index("ix_analysis_runs_dataset_id", "analysis_runs", ["dataset_id"], unique=False)
    op.create_table(
        "analysis_run_channels",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("channel_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["analysis_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_analysis_run_channels_run_id",
        "analysis_run_channels",
        ["run_id"],
        unique=False,
    )
    op.create_table(
        "model_fits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("model_id", sa.String(length=32), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["analysis_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_model_fits_run_id", "model_fits", ["run_id"], unique=False)
    op.create_table(
        "evidence_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("fit_id", sa.String(length=36), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("value_json", sa.JSON(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("source_artifact", sa.String(length=512), nullable=True),
        sa.Column("description_key", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["analysis_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_items_run_id", "evidence_items", ["run_id"], unique=False)
    op.create_table(
        "artifacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("dataset_id", sa.String(length=36), nullable=True),
        sa.Column("artifact_type", sa.String(length=64), nullable=False),
        sa.Column("media_type", sa.String(length=128), nullable=False),
        sa.Column("relative_path", sa.String(length=1024), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["analysis_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("relative_path", name="uq_artifacts_relative_path"),
    )
    op.create_index("ix_artifacts_run_id", "artifacts", ["run_id"], unique=False)
    op.create_table(
        "explanations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("runtime_model", sa.String(length=128), nullable=True),
        sa.Column("prompt_version", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=True),
        sa.Column("error_json", sa.JSON(), nullable=True),
        sa.Column("is_fallback", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["analysis_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_explanations_run_id", "explanations", ["run_id"], unique=False)
    op.create_table(
        "simulation_configs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=True),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("simulation_configs")
    op.drop_table("explanations")
    op.drop_table("artifacts")
    op.drop_table("evidence_items")
    op.drop_table("model_fits")
    op.drop_table("analysis_run_channels")
    op.drop_table("analysis_runs")
    op.drop_table("dataset_channels")
    op.drop_table("dataset_variables")
    op.drop_table("datasets")
