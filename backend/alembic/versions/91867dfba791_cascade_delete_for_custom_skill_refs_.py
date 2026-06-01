"""cascade delete for custom skill refs and add is_custom consistency check

Revision ID: 91867dfba791
Revises: 43435deebc25
Create Date: 2026-06-01 17:38:17.870141

"""

from collections.abc import Sequence

from alembic import op

revision: str = "91867dfba791"
down_revision: str | Sequence[str] | None = "43435deebc25"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # CASCADE: deleting a candidate now removes their custom skill refs (was SET NULL)
    op.drop_constraint("fk_skill_references_creator", "skill_references", type_="foreignkey")
    op.create_foreign_key(
        "fk_skill_references_creator",
        "skill_references",
        "candidate_profiles",
        ["creator_candidate_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Enforce is_custom = (creator_candidate_id IS NOT NULL) at DB level
    op.create_check_constraint(
        "ck_skill_ref_custom_consistency",
        "skill_references",
        "is_custom = (creator_candidate_id IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_skill_ref_custom_consistency", "skill_references", type_="check")
    op.drop_constraint("fk_skill_references_creator", "skill_references", type_="foreignkey")
    op.create_foreign_key(
        "fk_skill_references_creator",
        "skill_references",
        "candidate_profiles",
        ["creator_candidate_id"],
        ["id"],
        ondelete="SET NULL",
    )
