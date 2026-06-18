"""make templates.created_by_user_id nullable

The FK is ON DELETE SET NULL but the column was NOT NULL, so deleting a recruiter
who created a template raised a NotNullViolation and blocked account erasure.
Aligning the column with the FK lets the template survive with an anonymised creator.

Revision ID: f7c2a1b3d4e5
Revises: e66c3e15e7a6
Create Date: 2026-06-18 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7c2a1b3d4e5"
down_revision: str | Sequence[str] | None = "e66c3e15e7a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Allow NULL so the ON DELETE SET NULL foreign key can fire."""
    op.alter_column(
        "templates",
        "created_by_user_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )


def downgrade() -> None:
    """Restore NOT NULL (fails if any anonymised template rows remain)."""
    op.alter_column(
        "templates",
        "created_by_user_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
