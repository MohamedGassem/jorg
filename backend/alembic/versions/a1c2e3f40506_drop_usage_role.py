"""drop usage_role on experience_skill_usages

Revision ID: a1c2e3f40506
Revises: e5f6a7b8c9d0
Create Date: 2026-06-22

Dépréciation de usage_role (#62) : aucun scorer ne le lit, le rendu DOCX ne le
consomme plus, et le dossier affiche le rôle de mission (Experience.role).
Drop de la colonne puis du type enum. intensity (signal de matching) est conservé.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1c2e3f40506"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("experience_skill_usages", "usage_role")
    op.execute("DROP TYPE IF EXISTS usage_role")


def downgrade() -> None:
    op.execute(
        "CREATE TYPE usage_role AS ENUM "
        "('lead', 'implementer', 'contributor', 'user', 'exposed_to')"
    )
    op.add_column(
        "experience_skill_usages",
        sa.Column(
            "usage_role",
            postgresql.ENUM(
                "lead",
                "implementer",
                "contributor",
                "user",
                "exposed_to",
                name="usage_role",
                create_type=False,
            ),
            nullable=False,
            server_default="implementer",
        ),
    )
    op.alter_column("experience_skill_usages", "usage_role", server_default=None)
