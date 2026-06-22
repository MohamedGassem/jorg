"""provenance fields on L2 evidence tags

Revision ID: d4e5f6a7b8c9
Revises: f7c2a1b3d4e5
Create Date: 2026-06-21

Socle de provenance (tranche #59) : source / review_status / confidence / validated_at sur les
tags de preuve L2, et intensity rendu nullable (NULL = pre-confirmation). Additif ; le backfill
des lignes existantes se fait via les server_default (manual_candidate / accepted).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "f7c2a1b3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SOURCE_DEFAULT = "manual_candidate"
_REVIEW_DEFAULT = "accepted"
_PROVENANCE_TABLES = ("experience_skill_usages", "achievement_skill_tags")


def _evidence_source() -> postgresql.ENUM:
    return postgresql.ENUM(
        "cv_import",
        "manual_candidate",
        "llm_inferred",
        "recruiter_curated",
        name="evidence_source",
        create_type=False,
    )


def _review_status() -> postgresql.ENUM:
    return postgresql.ENUM(
        "pending",
        "accepted",
        "edited",
        "rejected",
        name="review_status",
        create_type=False,
    )


def _usage_intensity() -> postgresql.ENUM:
    return postgresql.ENUM(
        "primary", "secondary", "incidental", name="usage_intensity", create_type=False
    )


def upgrade() -> None:
    op.execute(
        "CREATE TYPE evidence_source AS ENUM "
        "('cv_import', 'manual_candidate', 'llm_inferred', 'recruiter_curated')"
    )
    op.execute("CREATE TYPE review_status AS ENUM ('pending', 'accepted', 'edited', 'rejected')")

    for table in _PROVENANCE_TABLES:
        op.add_column(
            table,
            sa.Column("source", _evidence_source(), nullable=False, server_default=_SOURCE_DEFAULT),
        )
        op.add_column(
            table,
            sa.Column(
                "review_status",
                _review_status(),
                nullable=False,
                server_default=_REVIEW_DEFAULT,
            ),
        )
        op.add_column(table, sa.Column("confidence", sa.Float(), nullable=True))
        op.add_column(table, sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True))

    # intensity nullable : NULL = preuve proposee, centralite non confirmee
    op.alter_column(
        "experience_skill_usages",
        "intensity",
        existing_type=_usage_intensity(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "experience_skill_usages",
        "intensity",
        existing_type=_usage_intensity(),
        nullable=False,
    )
    for table in _PROVENANCE_TABLES:
        op.drop_column(table, "validated_at")
        op.drop_column(table, "confidence")
        op.drop_column(table, "review_status")
        op.drop_column(table, "source")
    op.execute("DROP TYPE IF EXISTS review_status")
    op.execute("DROP TYPE IF EXISTS evidence_source")
