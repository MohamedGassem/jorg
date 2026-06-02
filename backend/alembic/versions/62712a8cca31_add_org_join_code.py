"""add_org_join_code

Revision ID: 62712a8cca31
Revises: e8f9a0b1c2d3
Create Date: 2026-06-02 15:47:09.742993

"""

import secrets
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "62712a8cca31"
down_revision: str | Sequence[str] | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add nullable first
    op.add_column(
        "organizations",
        sa.Column("join_code", sa.String(32), nullable=True),
    )

    # 2. Backfill existing rows with unique codes
    bind = op.get_bind()
    org_ids = bind.execute(sa.text("SELECT id FROM organizations")).fetchall()
    seen: set[str] = set()
    for (org_id,) in org_ids:
        while True:
            code = secrets.token_urlsafe(6)
            if code not in seen:
                seen.add(code)
                break
        bind.execute(
            sa.text("UPDATE organizations SET join_code = :code WHERE id = :id"),
            {"code": code, "id": str(org_id)},
        )

    # 3. Make NOT NULL + add unique constraint + index
    op.alter_column("organizations", "join_code", nullable=False)
    op.create_unique_constraint("uq_organizations_join_code", "organizations", ["join_code"])
    op.create_index("ix_organizations_join_code", "organizations", ["join_code"])


def downgrade() -> None:
    op.drop_index("ix_organizations_join_code", table_name="organizations")
    op.drop_constraint("uq_organizations_join_code", "organizations", type_="unique")
    op.drop_column("organizations", "join_code")
