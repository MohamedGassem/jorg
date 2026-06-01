"""fix slug uniqueness for custom skill isolation

Revision ID: 43435deebc25
Revises: c60b7d564cdb
Create Date: 2026-06-01 11:09:27.507363

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "43435deebc25"
down_revision: str | Sequence[str] | None = "c60b7d564cdb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop the old global unique index on slug
    op.drop_index(op.f("ix_skill_references_slug"), table_name="skill_references")
    # Recreate as a plain (non-unique) index — uniqueness is enforced by partial indexes below
    op.create_index(op.f("ix_skill_references_slug"), "skill_references", ["slug"], unique=False)
    # ESCO skills: slug unique where creator_candidate_id IS NULL
    op.create_index(
        "uq_skill_references_slug_esco",
        "skill_references",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("creator_candidate_id IS NULL"),
    )
    # Custom skills: (slug, creator_candidate_id) unique per candidate
    op.create_index(
        "uq_skill_references_slug_custom",
        "skill_references",
        ["slug", "creator_candidate_id"],
        unique=True,
        postgresql_where=sa.text("creator_candidate_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_skill_references_slug_esco", table_name="skill_references")
    op.drop_index("uq_skill_references_slug_custom", table_name="skill_references")
    op.drop_index(op.f("ix_skill_references_slug"), table_name="skill_references")
    op.create_index(op.f("ix_skill_references_slug"), "skill_references", ["slug"], unique=True)
