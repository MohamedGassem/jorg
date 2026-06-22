"""enriched consent envelope on access_grants

Revision ID: d5e6f7081930
Revises: c3e4f5061728
Create Date: 2026-06-22

Enveloppe de consentement enrichie (#66). Regime hybride : axes globaux
opposables en colonnes typees sur access_grants, exclusions par item en table
relationnelle. share_finances est renomme share_finances_internal (visibilite
finances interne ESN). access_grant_exclusions porte les exclusions opposables ;
seul l'item exclu est opposable (invariant #6).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d5e6f7081930"
down_revision: str | Sequence[str] | None = "c3e4f5061728"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    temporal_precision = postgresql.ENUM(
        "exact", "month", "year", name="temporal_precision", create_type=False
    )
    exclusion_target_type = postgresql.ENUM(
        "experience", name="exclusion_target_type", create_type=False
    )
    temporal_precision.create(op.get_bind(), checkfirst=True)
    exclusion_target_type.create(op.get_bind(), checkfirst=True)

    op.alter_column("access_grants", "share_finances", new_column_name="share_finances_internal")
    op.add_column(
        "access_grants",
        sa.Column(
            "identity_anonymized_to_client",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )
    op.add_column(
        "access_grants",
        sa.Column("mask_client_names", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "access_grants",
        sa.Column("reachable", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "access_grants",
        sa.Column(
            "temporal_precision",
            temporal_precision,
            server_default="exact",
            nullable=False,
        ),
    )
    op.add_column("access_grants", sa.Column("purpose", sa.Text(), nullable=True))
    op.add_column("access_grants", sa.Column("retention_until", sa.Date(), nullable=True))

    op.create_table(
        "access_grant_exclusions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("grant_id", sa.Uuid(), nullable=False),
        sa.Column(
            "target_type",
            exclusion_target_type,
            nullable=False,
        ),
        sa.Column("target_id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(["grant_id"], ["access_grants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_access_grant_exclusions_grant_id", "access_grant_exclusions", ["grant_id"])
    op.create_index(
        "ix_access_grant_exclusions_target_id", "access_grant_exclusions", ["target_id"]
    )


def downgrade() -> None:
    op.drop_table("access_grant_exclusions")
    sa.Enum(name="exclusion_target_type").drop(op.get_bind())

    op.drop_column("access_grants", "retention_until")
    op.drop_column("access_grants", "purpose")
    op.drop_column("access_grants", "temporal_precision")
    sa.Enum(name="temporal_precision").drop(op.get_bind())
    op.drop_column("access_grants", "reachable")
    op.drop_column("access_grants", "mask_client_names")
    op.drop_column("access_grants", "identity_anonymized_to_client")
    op.alter_column("access_grants", "share_finances_internal", new_column_name="share_finances")
