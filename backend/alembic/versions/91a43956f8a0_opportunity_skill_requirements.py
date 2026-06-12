"""opportunity skill requirements

Revision ID: 91a43956f8a0
Revises: 5ebe8630d2b8
Create Date: 2026-06-11 15:13:46.258959

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "91a43956f8a0"
down_revision: str | Sequence[str] | None = "5ebe8630d2b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opportunity_skill_requirements",
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("skill_ref_id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["skill_ref_id"], ["skill_references.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("opportunity_id", "skill_ref_id", name="uq_opportunity_skill"),
    )
    op.create_index(
        op.f("ix_opportunity_skill_requirements_opportunity_id"),
        "opportunity_skill_requirements",
        ["opportunity_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_opportunity_skill_requirements_opportunity_id"),
        table_name="opportunity_skill_requirements",
    )
    op.drop_table("opportunity_skill_requirements")
