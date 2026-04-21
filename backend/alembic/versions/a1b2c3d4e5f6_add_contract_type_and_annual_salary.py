"""add_contract_type_and_annual_salary_to_candidate_profile

Revision ID: a1b2c3d4e5f6
Revises: d5b9890bcbc6
Create Date: 2026-04-21

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "d5b9890bcbc6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

contract_type_enum = sa.Enum("freelance", "cdi", "both", name="contract_type")


def upgrade() -> None:
    contract_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "candidate_profiles",
        sa.Column(
            "contract_type",
            contract_type_enum,
            nullable=False,
            server_default="freelance",
        ),
    )
    op.add_column(
        "candidate_profiles",
        sa.Column("annual_salary", sa.Integer(), nullable=True),
    )
    op.alter_column("candidate_profiles", "contract_type", server_default=None)


def downgrade() -> None:
    op.drop_column("candidate_profiles", "annual_salary")
    op.drop_column("candidate_profiles", "contract_type")
    contract_type_enum.drop(op.get_bind(), checkfirst=True)
