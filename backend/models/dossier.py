# backend/models/dossier.py
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DossierOwnerType(StrEnum):
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"


class Dossier(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """L3 deliverable: a thin, arranged selection over L2 evidence.

    The Dossier references retained L2 evidence, orders it, marks per-dossier
    highlights and carries a native L3 framing text (``accroche``). It never
    copies or rewrites L2 facts (ADR-0002). Its anonymization settings are
    bounded by the ``AccessGrant`` envelope it operates under.
    """

    __tablename__ = "dossiers"

    # Nullable: a recruiter-owned dossier (L3b) carries the ESN org; a
    # candidate-owned dossier (L3a) has none.
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    candidate_profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_type: Mapped[DossierOwnerType] = mapped_column(
        SQLEnum(
            DossierOwnerType,
            name="dossier_owner_type",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    candidate_owner_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recruiter_owner_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    access_grant_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("access_grants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    opportunity_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("opportunities.id", ondelete="SET NULL"), nullable=True, index=True
    )
    accroche: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional per-dossier validation, at the recruiter's initiative: a
    # reassurance tool before sending, not a consent gate (ADR-0002).
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    share_contact: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    share_finances: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )

    skill_selections: Mapped[list[DossierSkillSelection]] = relationship(
        "DossierSkillSelection",
        cascade="all, delete-orphan",
        order_by="DossierSkillSelection.position",
        back_populates="dossier",
    )
    experience_selections: Mapped[list[DossierExperienceSelection]] = relationship(
        "DossierExperienceSelection",
        cascade="all, delete-orphan",
        order_by="DossierExperienceSelection.position",
        back_populates="dossier",
    )

    __table_args__ = (
        CheckConstraint(
            "(owner_type = 'candidate' AND candidate_owner_id IS NOT NULL "
            "AND recruiter_owner_id IS NULL) OR "
            "(owner_type = 'recruiter' AND recruiter_owner_id IS NOT NULL "
            "AND candidate_owner_id IS NULL)",
            name="ck_dossier_owner_consistency",
        ),
    )


class DossierSkillSelection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Per-dossier reference to one L2 ``CandidateSkill``: order + commercial highlight.

    No fact-text column: the recruiter arranges, never rewrites (ADR-0002).
    ``is_featured`` is the per-dossier (L3) highlight, distinct from the L2
    profile highlight on ``CandidateSkill``.
    """

    __tablename__ = "dossier_skill_selections"

    dossier_id: Mapped[UUID] = mapped_column(
        ForeignKey("dossiers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    candidate_skill_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_skills.id", ondelete="CASCADE"), index=True, nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_featured: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    dossier: Mapped[Dossier] = relationship("Dossier", back_populates="skill_selections")

    __table_args__ = (
        UniqueConstraint("dossier_id", "candidate_skill_id", name="uq_dossier_skill_selection"),
    )


class DossierExperienceSelection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Per-dossier reference to one L2 ``Experience``: order + commercial highlight.

    Mirrors ``DossierSkillSelection``: references and arranges, never copies facts.
    """

    __tablename__ = "dossier_experience_selections"

    dossier_id: Mapped[UUID] = mapped_column(
        ForeignKey("dossiers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    experience_id: Mapped[UUID] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"), index=True, nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_featured: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    dossier: Mapped[Dossier] = relationship("Dossier", back_populates="experience_selections")

    __table_args__ = (
        UniqueConstraint("dossier_id", "experience_id", name="uq_dossier_experience_selection"),
    )
