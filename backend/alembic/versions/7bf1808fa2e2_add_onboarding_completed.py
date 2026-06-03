"""add_onboarding_completed

Revision ID: 7bf1808fa2e2
Revises: 9e18fec67698
Create Date: 2026-06-03 16:28:30.463975

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7bf1808fa2e2"
down_revision: str | Sequence[str] | None = "9e18fec67698"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "candidate_profiles",
        sa.Column("onboarding_completed", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "recruiter_profiles",
        sa.Column("onboarding_completed", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("recruiter_profiles", "onboarding_completed")
    op.drop_column("candidate_profiles", "onboarding_completed")
