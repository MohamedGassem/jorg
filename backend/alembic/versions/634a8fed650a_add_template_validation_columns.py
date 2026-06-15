"""add template validation columns

Revision ID: 634a8fed650a
Revises: 5fadf109a1c5
Create Date: 2026-06-13 00:12:48.790901

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "634a8fed650a"
down_revision: str | Sequence[str] | None = "5fadf109a1c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add render-based validation columns to templates."""
    op.add_column(
        "templates",
        sa.Column(
            "unknown_placeholders", sa.JSON(), nullable=False, server_default=sa.text("'[]'")
        ),
    )
    op.add_column("templates", sa.Column("validation_error", sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove render-based validation columns from templates."""
    op.drop_column("templates", "validation_error")
    op.drop_column("templates", "unknown_placeholders")
