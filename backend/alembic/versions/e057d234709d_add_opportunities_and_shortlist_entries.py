"""add_opportunities_and_shortlist_entries

Revision ID: e057d234709d
Revises: 917cefcec920
Create Date: 2026-04-26 16:08:27.119303

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e057d234709d"
down_revision: str | Sequence[str] | None = "917cefcec920"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opportunities",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("open", "closed", name="opportunity_status"),
            server_default="open",
            nullable=False,
        ),
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
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_opportunities_organization_id"), "opportunities", ["organization_id"], unique=False
    )
    op.create_table(
        "shortlist_entries",
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("opportunity_id", "candidate_id", name="uq_shortlist_entry"),
    )
    op.create_index(
        op.f("ix_shortlist_entries_candidate_id"),
        "shortlist_entries",
        ["candidate_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_shortlist_entries_opportunity_id"),
        "shortlist_entries",
        ["opportunity_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_shortlist_entries_opportunity_id"), table_name="shortlist_entries")
    op.drop_index(op.f("ix_shortlist_entries_candidate_id"), table_name="shortlist_entries")
    op.drop_table("shortlist_entries")
    op.drop_index(op.f("ix_opportunities_organization_id"), table_name="opportunities")
    op.drop_table("opportunities")
    op.execute("DROP TYPE IF EXISTS opportunity_status")
