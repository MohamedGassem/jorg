"""add template status and templatize report

Revision ID: 48c45f248064
Revises: 634a8fed650a
Create Date: 2026-06-15 10:02:05.373543

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "48c45f248064"
down_revision: str | Sequence[str] | None = "634a8fed650a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add draft/active status and templatize report to templates."""
    op.add_column(
        "templates",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
    )
    op.add_column("templates", sa.Column("templatize_report", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Remove status and templatize report from templates."""
    op.drop_column("templates", "templatize_report")
    op.drop_column("templates", "status")
