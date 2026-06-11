"""user consent record

Revision ID: c7e8f9a0b1c2
Revises: a9b1c2d3e4f5
Create Date: 2026-06-11 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7e8f9a0b1c2"
down_revision: str | Sequence[str] | None = "a9b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add timestamped RGPD consent proof to users."""
    op.add_column(
        "users",
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("consent_version", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "consent_version")
    op.drop_column("users", "consented_at")
