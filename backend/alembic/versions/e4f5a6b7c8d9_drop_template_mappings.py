"""drop_template_mappings

Revision ID: e4f5a6b7c8d9
Revises: 7bf1808fa2e2
Create Date: 2026-06-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4f5a6b7c8d9"
down_revision: str | Sequence[str] | None = "7bf1808fa2e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("templates", "version")
    op.drop_column("templates", "mappings")


def downgrade() -> None:
    op.add_column(
        "templates",
        sa.Column("mappings", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "templates",
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("templates", "mappings", server_default=None)
    op.alter_column("templates", "version", server_default=None)
