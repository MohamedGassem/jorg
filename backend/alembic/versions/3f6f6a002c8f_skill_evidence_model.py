"""skill evidence model

Revision ID: 3f6f6a002c8f
Revises: a3b4c5d6e7f8
Create Date: 2026-05-27 22:35:58.888153

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f6f6a002c8f"
down_revision: str | Sequence[str] | None = "a3b4c5d6e7f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # New enums — raw DDL is more reliable than sa.Enum.create() with asyncpg
    op.execute(
        "CREATE TYPE skill_kind AS ENUM "
        "('technical', 'functional', 'sectoral', 'methodology', 'tool', 'soft')"
    )
    op.execute(
        "CREATE TYPE usage_role AS ENUM "
        "('lead', 'implementer', 'contributor', 'user', 'exposed_to')"
    )
    op.execute("CREATE TYPE usage_intensity AS ENUM ('primary', 'secondary', 'incidental')")

    op.create_table(
        "skill_references",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=200), nullable=False),
        sa.Column(
            "kind",
            postgresql.ENUM(
                "technical",
                "functional",
                "sectoral",
                "methodology",
                "tool",
                "soft",
                name="skill_kind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("aliases", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("esco_uri", sa.String(length=500), nullable=True),
        sa.Column("esco_skill_type", sa.String(length=50), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="esco"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_custom", sa.Boolean(), nullable=False, server_default="false"),
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
        sa.ForeignKeyConstraint(["parent_id"], ["skill_references.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_skill_references_name"), "skill_references", ["name"], unique=False)
    op.create_index(op.f("ix_skill_references_slug"), "skill_references", ["slug"], unique=True)

    op.create_table(
        "candidate_skills",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("skill_ref_id", sa.Uuid(), nullable=False),
        sa.Column("self_assessed_level", sa.String(length=50), nullable=True),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["candidate_id"], ["candidate_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["skill_ref_id"], ["skill_references.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("candidate_id", "skill_ref_id", name="uq_candidate_skill"),
    )
    op.create_index(
        op.f("ix_candidate_skills_candidate_id"), "candidate_skills", ["candidate_id"], unique=False
    )
    op.create_index(
        op.f("ix_candidate_skills_skill_ref_id"), "candidate_skills", ["skill_ref_id"], unique=False
    )

    op.create_table(
        "achievements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experience_id", sa.Uuid(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("impact", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
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
        sa.ForeignKeyConstraint(["experience_id"], ["experiences.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_achievements_experience_id"), "achievements", ["experience_id"], unique=False
    )

    op.create_table(
        "experience_skill_usages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experience_id", sa.Uuid(), nullable=False),
        sa.Column("skill_ref_id", sa.Uuid(), nullable=False),
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
        ),
        sa.Column(
            "intensity",
            postgresql.ENUM(
                "primary",
                "secondary",
                "incidental",
                name="usage_intensity",
                create_type=False,
            ),
            nullable=False,
            server_default="secondary",
        ),
        sa.Column("achievement_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["achievement_id"], ["achievements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["experience_id"], ["experiences.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["skill_ref_id"], ["skill_references.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experience_id", "skill_ref_id", name="uq_experience_skill_usage"),
    )
    op.create_index(
        op.f("ix_experience_skill_usages_experience_id"),
        "experience_skill_usages",
        ["experience_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_experience_skill_usages_skill_ref_id"),
        "experience_skill_usages",
        ["skill_ref_id"],
        unique=False,
    )

    # Drop old skills table
    op.drop_index(op.f("ix_skills_profile_id"), table_name="skills")
    op.drop_table("skills")

    # Drop technologies column
    op.drop_column("experiences", "technologies")

    # Rename achievements → achievements_summary (preserve data)
    op.alter_column("experiences", "achievements", new_column_name="achievements_summary")

    # Drop old enum
    op.execute("DROP TYPE IF EXISTS skill_category")


def downgrade() -> None:
    """Downgrade schema."""
    # Recreate old enum — raw DDL avoids asyncpg checkfirst issues
    op.execute(
        "CREATE TYPE skill_category AS ENUM "
        "('LANGUAGE', 'FRAMEWORK', 'DATABASE', 'TOOL', 'METHODOLOGY', 'OTHER')"
    )

    # Rename achievements_summary → achievements
    op.alter_column("experiences", "achievements_summary", new_column_name="achievements")

    # Restore technologies column (nullable to avoid issues with existing rows)
    op.add_column(
        "experiences",
        sa.Column(
            "technologies",
            postgresql.JSON(astext_type=sa.Text()),
            autoincrement=False,
            nullable=True,
        ),
    )

    # Recreate skills table
    op.create_table(
        "skills",
        sa.Column("profile_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("name", sa.VARCHAR(length=100), autoincrement=False, nullable=False),
        sa.Column(
            "category",
            postgresql.ENUM(
                "LANGUAGE",
                "FRAMEWORK",
                "DATABASE",
                "TOOL",
                "METHODOLOGY",
                "OTHER",
                name="skill_category",
                create_type=False,
            ),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column("level", sa.VARCHAR(length=50), autoincrement=False, nullable=True),
        sa.Column("years_of_experience", sa.INTEGER(), autoincrement=False, nullable=True),
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column("level_rating", sa.INTEGER(), autoincrement=False, nullable=True),
        sa.CheckConstraint(
            "level_rating >= 1 AND level_rating <= 5",
            name=op.f("ck_skills_level_rating_range"),
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["candidate_profiles.id"],
            name=op.f("skills_profile_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("skills_pkey")),
    )
    op.create_index(op.f("ix_skills_profile_id"), "skills", ["profile_id"], unique=False)

    # Drop new tables in reverse dependency order
    op.drop_index(
        op.f("ix_experience_skill_usages_skill_ref_id"), table_name="experience_skill_usages"
    )
    op.drop_index(
        op.f("ix_experience_skill_usages_experience_id"), table_name="experience_skill_usages"
    )
    op.drop_table("experience_skill_usages")
    op.drop_index(op.f("ix_achievements_experience_id"), table_name="achievements")
    op.drop_table("achievements")
    op.drop_index(op.f("ix_candidate_skills_skill_ref_id"), table_name="candidate_skills")
    op.drop_index(op.f("ix_candidate_skills_candidate_id"), table_name="candidate_skills")
    op.drop_table("candidate_skills")
    op.drop_index(op.f("ix_skill_references_slug"), table_name="skill_references")
    op.drop_index(op.f("ix_skill_references_name"), table_name="skill_references")
    op.drop_table("skill_references")

    # Drop new enums
    op.execute("DROP TYPE IF EXISTS skill_kind")
    op.execute("DROP TYPE IF EXISTS usage_role")
    op.execute("DROP TYPE IF EXISTS usage_intensity")
