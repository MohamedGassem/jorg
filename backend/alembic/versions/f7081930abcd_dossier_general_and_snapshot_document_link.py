"""dossier is_general + general partial unique indexes; snapshot->document link

Revision ID: f7081930abcd
Revises: e6f7081930ab
Create Date: 2026-06-23

Cable le L3 dans la generation reelle (slice 1). dossiers.is_general marque le
miroir vif du profil (candidat par profil, recruteur par access_grant), borne par
deux index uniques partiels qui rendent get_or_create_general race-safe (decision
#2). Le lien snapshot<->document passe du document vers le snapshot
(generated_dossier_snapshots.generated_document_id, ON DELETE SET NULL) : le
snapshot est l'artefact durable et survit au stockage de fichier (decision #2/#9).
On retire l'ancien generated_documents.snapshot_id, jamais alimente.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f7081930abcd"
down_revision: str | Sequence[str] | None = "e6f7081930ab"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "dossiers",
        sa.Column("is_general", sa.Boolean(), server_default="false", nullable=False),
    )
    op.create_index(
        "uq_dossier_general_candidate",
        "dossiers",
        ["candidate_profile_id"],
        unique=True,
        postgresql_where=sa.text("is_general AND owner_type = 'candidate'"),
    )
    op.create_index(
        "uq_dossier_general_recruiter",
        "dossiers",
        ["access_grant_id"],
        unique=True,
        postgresql_where=sa.text("is_general AND owner_type = 'recruiter'"),
    )

    # Reverse the snapshot<->document link: snapshot is the durable artifact.
    op.drop_constraint(
        "fk_generated_documents_snapshot_id", "generated_documents", type_="foreignkey"
    )
    op.drop_index("ix_generated_documents_snapshot_id", table_name="generated_documents")
    op.drop_column("generated_documents", "snapshot_id")

    op.add_column(
        "generated_dossier_snapshots",
        sa.Column("generated_document_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_generated_dossier_snapshots_generated_document_id",
        "generated_dossier_snapshots",
        ["generated_document_id"],
    )
    op.create_foreign_key(
        "fk_generated_dossier_snapshots_generated_document_id",
        "generated_dossier_snapshots",
        "generated_documents",
        ["generated_document_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_generated_dossier_snapshots_generated_document_id",
        "generated_dossier_snapshots",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_generated_dossier_snapshots_generated_document_id",
        table_name="generated_dossier_snapshots",
    )
    op.drop_column("generated_dossier_snapshots", "generated_document_id")

    op.add_column(
        "generated_documents",
        sa.Column("snapshot_id", sa.Uuid(), nullable=True),
    )
    op.create_index("ix_generated_documents_snapshot_id", "generated_documents", ["snapshot_id"])
    op.create_foreign_key(
        "fk_generated_documents_snapshot_id",
        "generated_documents",
        "generated_dossier_snapshots",
        ["snapshot_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_index("uq_dossier_general_recruiter", table_name="dossiers")
    op.drop_index("uq_dossier_general_candidate", table_name="dossiers")
    op.drop_column("dossiers", "is_general")
