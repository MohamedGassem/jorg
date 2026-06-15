"""add template source_file_path

Revision ID: 1639b9987beb
Revises: 48c45f248064
Create Date: 2026-06-15 13:35:23.462422

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1639b9987beb"
down_revision: str | Sequence[str] | None = "48c45f248064"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Preserve the original uploaded file alongside the (possibly templatized) one."""
    op.add_column("templates", sa.Column("source_file_path", sa.String(length=500), nullable=True))
    # Backfill existing rows: the current file is also their source.
    op.execute("UPDATE templates SET source_file_path = word_file_path")


def downgrade() -> None:
    op.drop_column("templates", "source_file_path")
