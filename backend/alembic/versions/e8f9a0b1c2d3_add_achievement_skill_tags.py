"""add achievement skill tags

Revision ID: e8f9a0b1c2d3
Revises: 91867dfba791
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | Sequence[str] | None = "91867dfba791"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "achievement_skill_tags",
        sa.Column("achievement_id", sa.Uuid(), nullable=False),
        sa.Column("skill_ref_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["achievement_id"], ["achievements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["skill_ref_id"], ["skill_references.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("achievement_id", "skill_ref_id", name="uq_achievement_skill_tag"),
        sa.PrimaryKeyConstraint("achievement_id", "skill_ref_id"),
    )
    op.create_index(
        "ix_achievement_skill_tags_achievement_id",
        "achievement_skill_tags",
        ["achievement_id"],
        unique=False,
    )
    op.drop_column("experience_skill_usages", "achievement_id")


def downgrade() -> None:
    op.add_column(
        "experience_skill_usages",
        sa.Column("achievement_id", sa.Uuid(), nullable=True),
    )
    op.drop_index("ix_achievement_skill_tags_achievement_id", table_name="achievement_skill_tags")
    op.drop_table("achievement_skill_tags")
