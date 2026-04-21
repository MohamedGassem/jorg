"""add_level_rating_to_skill

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-21

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "skills",
        sa.Column("level_rating", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_skills_level_rating_range",
        "skills",
        "level_rating BETWEEN 1 AND 5",
    )


def downgrade() -> None:
    op.drop_constraint("ck_skills_level_rating_range", "skills", type_="check")
    op.drop_column("skills", "level_rating")
