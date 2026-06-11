"""alpha code organization

Revision ID: 5fadf109a1c5
Revises: 91a43956f8a0
Create Date: 2026-06-11 16:00:15.996601

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5fadf109a1c5"
down_revision: str | Sequence[str] | None = "91a43956f8a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "alpha_invite_codes",
        sa.Column("organization_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_alpha_invite_codes_organization_id",
        "alpha_invite_codes",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "fk_alpha_invite_codes_organization_id",
        "alpha_invite_codes",
        type_="foreignkey",
    )
    op.drop_column("alpha_invite_codes", "organization_id")
