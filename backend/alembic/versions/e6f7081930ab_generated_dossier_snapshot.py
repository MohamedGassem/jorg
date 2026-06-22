"""generated dossier snapshot, dossier validation, document link

Revision ID: e6f7081930ab
Revises: d5e6f7081930
Create Date: 2026-06-22

Fige un dossier au moment de la generation (#67). generated_dossier_snapshots
porte le render model resolu et la policy de consentement figes (JSONB) ; le
snapshot est immuable, regenerer cree une nouvelle ligne (invariant #7).
dossiers gagne validated_at / validated_by (validation optionnelle a l'initiative
du recruteur). generated_documents.snapshot_id rattache le DOCX au snapshot.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e6f7081930ab"
down_revision: str | Sequence[str] | None = "d5e6f7081930"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "generated_dossier_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("render_model_snapshot_json", postgresql.JSONB(), nullable=False),
        sa.Column("consent_policy_snapshot_json", postgresql.JSONB(), nullable=False),
        sa.Column("template_id", sa.Uuid(), nullable=True),
        sa.Column("generated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("recipient_context", sa.String(length=500), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_generated_dossier_snapshots_dossier_id",
        "generated_dossier_snapshots",
        ["dossier_id"],
    )
    op.create_index(
        "ix_generated_dossier_snapshots_template_id",
        "generated_dossier_snapshots",
        ["template_id"],
    )
    op.create_index(
        "ix_generated_dossier_snapshots_generated_by_user_id",
        "generated_dossier_snapshots",
        ["generated_by_user_id"],
    )

    op.add_column("dossiers", sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dossiers", sa.Column("validated_by", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_dossiers_validated_by",
        "dossiers",
        "users",
        ["validated_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("generated_documents", sa.Column("snapshot_id", sa.Uuid(), nullable=True))
    op.create_index("ix_generated_documents_snapshot_id", "generated_documents", ["snapshot_id"])
    op.create_foreign_key(
        "fk_generated_documents_snapshot_id",
        "generated_documents",
        "generated_dossier_snapshots",
        ["snapshot_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_generated_documents_snapshot_id", "generated_documents", type_="foreignkey"
    )
    op.drop_index("ix_generated_documents_snapshot_id", table_name="generated_documents")
    op.drop_column("generated_documents", "snapshot_id")

    op.drop_constraint("fk_dossiers_validated_by", "dossiers", type_="foreignkey")
    op.drop_column("dossiers", "validated_by")
    op.drop_column("dossiers", "validated_at")

    op.drop_table("generated_dossier_snapshots")
