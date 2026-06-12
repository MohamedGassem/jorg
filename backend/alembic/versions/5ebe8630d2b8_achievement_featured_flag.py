"""achievement featured flag

Revision ID: 5ebe8630d2b8
Revises: c7e8f9a0b1c2
Create Date: 2026-06-11 12:22:22.728862

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5ebe8630d2b8"
down_revision: str | Sequence[str] | None = "c7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "achievements",
        sa.Column("featured", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("achievements", "featured")
