"""is_profile_highlighted on candidate_skills

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-22

Flag de highlight profil candidat (tranche #61), distinct du featured commercial par dossier.
Additif, server_default false pour les lignes existantes.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "candidate_skills",
        sa.Column(
            "is_profile_highlighted", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("candidate_skills", "is_profile_highlighted")
