"""Create CV extraction proposals table.

Revision ID: 6f7a8b9c0d1e
Revises: 2f0a1b2c3d4e
Create Date: 2026-06-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "6f7a8b9c0d1e"
down_revision: str | None = "2f0a1b2c3d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    status = postgresql.ENUM(
        "pending_review",
        "reviewed",
        "failed",
        name="cv_extraction_status",
        create_type=False,
    )
    status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cv_extraction_proposals",
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("extraction_method", sa.String(length=40), nullable=False),
        sa.Column("quality_score", sa.Integer(), nullable=False),
        sa.Column("quality_details", sa.JSON(), nullable=False),
        sa.Column("proposed_profile", sa.JSON(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("status", status, nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidate_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cv_extraction_proposals_candidate_id",
        "cv_extraction_proposals",
        ["candidate_id"],
    )
    op.create_index(
        "ix_cv_extraction_proposals_file_hash",
        "cv_extraction_proposals",
        ["file_hash"],
    )
    op.create_index(
        "ix_cv_extraction_proposals_status",
        "cv_extraction_proposals",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_cv_extraction_proposals_status", table_name="cv_extraction_proposals")
    op.drop_index("ix_cv_extraction_proposals_file_hash", table_name="cv_extraction_proposals")
    op.drop_index("ix_cv_extraction_proposals_candidate_id", table_name="cv_extraction_proposals")
    op.drop_table("cv_extraction_proposals")
    sa.Enum(name="cv_extraction_status").drop(op.get_bind(), checkfirst=True)
