"""create language references

Revision ID: 5a6b7c8d9e0f
Revises: 3bea8da1da3b, e4f5a6b7c8d9
Create Date: 2026-06-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5a6b7c8d9e0f"
down_revision: str | Sequence[str] | None = ("3bea8da1da3b", "e4f5a6b7c8d9")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "language_references",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False),
        sa.Column("esco_uri", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("esco_uri", name="uq_language_references_esco_uri"),
        sa.UniqueConstraint("slug", name="uq_language_references_slug"),
    )
    op.create_index("ix_language_references_name", "language_references", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_language_references_name", table_name="language_references")
    op.drop_table("language_references")
