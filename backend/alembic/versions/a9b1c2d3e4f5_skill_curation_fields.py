"""skill_curation_fields

Revision ID: a9b1c2d3e4f5
Revises: 6f7a8b9c0d1e
Create Date: 2026-06-09

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a9b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "6f7a8b9c0d1e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "skill_references",
        sa.Column("is_displayable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "skill_references",
        sa.Column("categories", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.execute("UPDATE skill_references SET source = 'user_custom' WHERE source = 'manual'")
    op.alter_column("skill_references", "is_displayable", server_default=None)
    op.alter_column("skill_references", "categories", server_default=None)


def downgrade() -> None:
    op.execute("UPDATE skill_references SET source = 'manual' WHERE source = 'user_custom'")
    op.drop_column("skill_references", "categories")
    op.drop_column("skill_references", "is_displayable")
