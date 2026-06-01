"""add creator candidate id to skill references

Revision ID: c60b7d564cdb
Revises: 3f6f6a002c8f
Create Date: 2026-06-01 10:57:55.004711

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c60b7d564cdb"
down_revision: str | Sequence[str] | None = "3f6f6a002c8f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "skill_references",
        sa.Column("creator_candidate_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_skill_references_creator",
        "skill_references",
        "candidate_profiles",
        ["creator_candidate_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_skill_references_creator_candidate_id",
        "skill_references",
        ["creator_candidate_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_skill_references_creator_candidate_id", table_name="skill_references")
    op.drop_constraint("fk_skill_references_creator", "skill_references", type_="foreignkey")
    op.drop_column("skill_references", "creator_candidate_id")
