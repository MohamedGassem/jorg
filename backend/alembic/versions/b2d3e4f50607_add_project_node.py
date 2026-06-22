"""add Project node between Experience and Achievement

Revision ID: b2d3e4f50607
Revises: a1c2e3f40506
Create Date: 2026-06-22

Nœud Project optionnel (#64) : une mission ESN peut contenir des engagements
nommés et distincts (POC, livrable). Additif. Achievement.project_id nullable :
une réalisation se rattache directement à l'expérience (project_id NULL) ou à un
projet. SET NULL au drop du projet pour ne pas supprimer les réalisations.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2d3e4f50607"
down_revision: str | Sequence[str] | None = "a1c2e3f40506"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experience_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
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
    op.create_index("ix_projects_experience_id", "projects", ["experience_id"])

    op.add_column("achievements", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_index("ix_achievements_project_id", "achievements", ["project_id"])
    op.create_foreign_key(
        "fk_achievements_project_id",
        "achievements",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_achievements_project_id", "achievements", type_="foreignkey")
    op.drop_index("ix_achievements_project_id", table_name="achievements")
    op.drop_column("achievements", "project_id")

    op.drop_index("ix_projects_experience_id", table_name="projects")
    op.drop_table("projects")
