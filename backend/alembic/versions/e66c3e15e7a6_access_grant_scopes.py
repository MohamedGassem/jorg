"""access grant scopes

Revision ID: e66c3e15e7a6
Revises: 1639b9987beb
Create Date: 2026-06-16 22:41:59.926732

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e66c3e15e7a6"
down_revision: str | Sequence[str] | None = "1639b9987beb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "access_grants",
        sa.Column("share_finances", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "access_grants",
        sa.Column("share_contact", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("access_grants", "share_contact")
    op.drop_column("access_grants", "share_finances")
