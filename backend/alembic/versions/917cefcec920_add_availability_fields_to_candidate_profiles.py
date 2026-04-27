"""add_availability_fields_to_candidate_profiles

Revision ID: 917cefcec920
Revises: 8ac7cd2e1874
Create Date: 2026-04-26

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "917cefcec920"
down_revision: str | Sequence[str] | None = "8ac7cd2e1874"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

availability_status_enum = sa.Enum(
    "available_now", "available_from", "not_available", name="availability_status"
)
work_mode_enum = sa.Enum("remote", "onsite", "hybrid", name="work_mode")
mission_duration_enum = sa.Enum("short", "medium", "long", "permanent", name="mission_duration")


def upgrade() -> None:
    availability_status_enum.create(op.get_bind(), checkfirst=True)
    work_mode_enum.create(op.get_bind(), checkfirst=True)
    mission_duration_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "candidate_profiles",
        sa.Column(
            "availability_status",
            availability_status_enum,
            nullable=False,
            server_default="not_available",
        ),
    )
    op.add_column(
        "candidate_profiles",
        sa.Column("availability_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "candidate_profiles",
        sa.Column("work_mode", work_mode_enum, nullable=True),
    )
    op.add_column(
        "candidate_profiles",
        sa.Column("location_preference", sa.String(200), nullable=True),
    )
    op.add_column(
        "candidate_profiles",
        sa.Column(
            "preferred_domains",
            sa.ARRAY(sa.String(50)),
            nullable=True,
        ),
    )
    op.add_column(
        "candidate_profiles",
        sa.Column("mission_duration", mission_duration_enum, nullable=True),
    )
    # Remove server_default after adding the column
    op.alter_column("candidate_profiles", "availability_status", server_default=None)


def downgrade() -> None:
    op.drop_column("candidate_profiles", "mission_duration")
    op.drop_column("candidate_profiles", "preferred_domains")
    op.drop_column("candidate_profiles", "location_preference")
    op.drop_column("candidate_profiles", "work_mode")
    op.drop_column("candidate_profiles", "availability_date")
    op.drop_column("candidate_profiles", "availability_status")

    mission_duration_enum.drop(op.get_bind(), checkfirst=True)
    work_mode_enum.drop(op.get_bind(), checkfirst=True)
    availability_status_enum.drop(op.get_bind(), checkfirst=True)
