"""support builtin template generated documents

Revision ID: 2f0a1b2c3d4e
Revises: 5a6b7c8d9e0f
Create Date: 2026-06-05 17:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2f0a1b2c3d4e"
down_revision: str | Sequence[str] | None = "5a6b7c8d9e0f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("generated_documents", sa.Column("template_name", sa.String(200), nullable=True))
    op.alter_column("generated_documents", "access_grant_id", nullable=True)


def downgrade() -> None:
    op.alter_column("generated_documents", "access_grant_id", nullable=False)
    op.drop_column("generated_documents", "template_name")
