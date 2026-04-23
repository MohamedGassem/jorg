"""anonymizable access grants

Revision ID: 8ac7cd2e1874
Revises: 0262dfeed461
Create Date: 2026-04-22 08:28:45.497827

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ac7cd2e1874'
down_revision: Union[str, Sequence[str], None] = '0262dfeed461'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Allow anonymization of access grants when a candidate user is deleted.
    op.alter_column(
        "access_grants",
        "candidate_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.drop_constraint(
        "access_grants_candidate_id_fkey", "access_grants", type_="foreignkey"
    )
    op.create_foreign_key(
        "access_grants_candidate_id_fkey",
        "access_grants",
        "users",
        ["candidate_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema.

    WARNING: will fail at the ALTER COLUMN step if any access_grants row has
    candidate_id = NULL (i.e. an account was already anonymised via RGPD
    deletion).  This migration is not safely reversible in production once
    any candidate account has been deleted.
    """
    op.drop_constraint(
        "access_grants_candidate_id_fkey", "access_grants", type_="foreignkey"
    )
    op.create_foreign_key(
        "access_grants_candidate_id_fkey",
        "access_grants",
        "users",
        ["candidate_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column(
        "access_grants",
        "candidate_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
