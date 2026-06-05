"""language unique per profile

Revision ID: 3bea8da1da3b
Revises: 7bf1808fa2e2
Create Date: 2026-06-04 18:41:55.642259

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3bea8da1da3b"
down_revision: str | Sequence[str] | None = "7bf1808fa2e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint("uq_language_profile_name", "languages", ["profile_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_language_profile_name", "languages", type_="unique")
