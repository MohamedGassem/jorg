"""add_alpha_invite_codes

Revision ID: 9e18fec67698
Revises: 62712a8cca31
Create Date: 2026-06-03 15:18:30.957077

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9e18fec67698"
down_revision: str | Sequence[str] | None = "62712a8cca31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "alpha_invite_codes",
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("used_by", sa.Uuid(), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["used_by"], ["recruiter_profiles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_alpha_invite_codes_code"), "alpha_invite_codes", ["code"], unique=True)
    op.create_index(
        op.f("ix_alpha_invite_codes_used_by"), "alpha_invite_codes", ["used_by"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_alpha_invite_codes_used_by"), table_name="alpha_invite_codes")
    op.drop_index(op.f("ix_alpha_invite_codes_code"), table_name="alpha_invite_codes")
    op.drop_table("alpha_invite_codes")
