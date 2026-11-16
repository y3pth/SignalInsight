"""add dataset upload path

Revision ID: 20261116_0002
Revises: 20261116_0001
Create Date: 2026-11-16

"""
from alembic import op
import sqlalchemy as sa

revision = "20261116_0002"
down_revision = "20261116_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("datasets") as batch_op:
        batch_op.add_column(
            sa.Column("upload_path", sa.String(length=1024), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("datasets") as batch_op:
        batch_op.drop_column("upload_path")
