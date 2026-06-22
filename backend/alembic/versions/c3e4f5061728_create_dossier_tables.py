"""create dossier L3 tables

Revision ID: c3e4f5061728
Revises: b2d3e4f50607
Create Date: 2026-06-22

Entité Dossier L3 mince (#65) : une sélection arrangée par-dessus des preuves L2,
jamais une copie de faits (ADR-0002). `dossiers` porte l'accroche, l'ownership
(L3a candidat / L3b recruteur, CHECK exactement-un), l'anonymisation par dossier
et des FK nullables vers access_grant / opportunity. Les tables de sélection
référencent skills et expériences L2 avec ordre + mise en avant par dossier ;
aucune colonne de texte de fait.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3e4f5061728"
down_revision: str | Sequence[str] | None = "b2d3e4f50607"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dossiers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("candidate_profile_id", sa.Uuid(), nullable=False),
        sa.Column(
            "owner_type",
            sa.Enum("candidate", "recruiter", name="dossier_owner_type"),
            nullable=False,
        ),
        sa.Column("candidate_owner_id", sa.Uuid(), nullable=True),
        sa.Column("recruiter_owner_id", sa.Uuid(), nullable=True),
        sa.Column("access_grant_id", sa.Uuid(), nullable=True),
        sa.Column("opportunity_id", sa.Uuid(), nullable=True),
        sa.Column("accroche", sa.Text(), nullable=True),
        sa.Column("share_contact", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("share_finances", sa.Boolean(), server_default="true", nullable=False),
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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["candidate_profile_id"], ["candidate_profiles.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["candidate_owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recruiter_owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["access_grant_id"], ["access_grants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "(owner_type = 'candidate' AND candidate_owner_id IS NOT NULL "
            "AND recruiter_owner_id IS NULL) OR "
            "(owner_type = 'recruiter' AND recruiter_owner_id IS NOT NULL "
            "AND candidate_owner_id IS NULL)",
            name="ck_dossier_owner_consistency",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dossiers_organization_id", "dossiers", ["organization_id"])
    op.create_index("ix_dossiers_candidate_profile_id", "dossiers", ["candidate_profile_id"])
    op.create_index("ix_dossiers_candidate_owner_id", "dossiers", ["candidate_owner_id"])
    op.create_index("ix_dossiers_recruiter_owner_id", "dossiers", ["recruiter_owner_id"])
    op.create_index("ix_dossiers_access_grant_id", "dossiers", ["access_grant_id"])
    op.create_index("ix_dossiers_opportunity_id", "dossiers", ["opportunity_id"])

    op.create_table(
        "dossier_skill_selections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("candidate_skill_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_featured", sa.Boolean(), server_default="false", nullable=False),
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
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["candidate_skill_id"], ["candidate_skills.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("dossier_id", "candidate_skill_id", name="uq_dossier_skill_selection"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dossier_skill_selections_dossier_id", "dossier_skill_selections", ["dossier_id"]
    )
    op.create_index(
        "ix_dossier_skill_selections_candidate_skill_id",
        "dossier_skill_selections",
        ["candidate_skill_id"],
    )

    op.create_table(
        "dossier_experience_selections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("experience_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_featured", sa.Boolean(), server_default="false", nullable=False),
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
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["experience_id"], ["experiences.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("dossier_id", "experience_id", name="uq_dossier_experience_selection"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dossier_experience_selections_dossier_id",
        "dossier_experience_selections",
        ["dossier_id"],
    )
    op.create_index(
        "ix_dossier_experience_selections_experience_id",
        "dossier_experience_selections",
        ["experience_id"],
    )


def downgrade() -> None:
    op.drop_table("dossier_experience_selections")
    op.drop_table("dossier_skill_selections")
    op.drop_table("dossiers")
    sa.Enum(name="dossier_owner_type").drop(op.get_bind())
