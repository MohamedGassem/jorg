"""dossier name + objectif metadata columns

Revision ID: a1b2c3d4e5f6
Revises: f7081930abcd
Create Date: 2026-06-23

Slice 2 (dossier APIs): an adapted dossier carries L3 framing metadata. ``name``
labels the version and ``objectif`` states the objective it targets. Both are
nullable Text and never touch L2 facts (ADR-0002).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "f7081930abcd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dossiers", sa.Column("name", sa.Text(), nullable=True))
    op.add_column("dossiers", sa.Column("objectif", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("dossiers", "objectif")
    op.drop_column("dossiers", "name")
