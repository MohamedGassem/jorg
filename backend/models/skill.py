# backend/models/skill.py
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from models.candidate_profile import Experience, Project


class SkillKind(StrEnum):
    technical = "technical"
    functional = "functional"
    sectoral = "sectoral"
    methodology = "methodology"
    tool = "tool"
    soft = "soft"


class UsageIntensity(StrEnum):
    primary = "primary"
    secondary = "secondary"
    incidental = "incidental"


class EvidenceSource(StrEnum):
    cv_import = "cv_import"
    manual_candidate = "manual_candidate"
    llm_inferred = "llm_inferred"
    recruiter_curated = "recruiter_curated"


class ReviewStatus(StrEnum):
    pending = "pending"
    accepted = "accepted"
    edited = "edited"
    rejected = "rejected"


class SkillStatus(StrEnum):
    """Rollup dérivé d'une compétence candidat (projection des preuves). Ordre croissant."""

    declared_only = "declared_only"
    inferred = "inferred"
    evidenced = "evidenced"
    validated = "validated"


# Types Enum partagés : le même objet sur les deux tables de preuve, sinon create_all
# (tests d'intégration) tente de créer deux fois le type PG de même nom.
_EVIDENCE_SOURCE_ENUM = Enum(
    EvidenceSource, name="evidence_source", values_callable=lambda obj: [e.value for e in obj]
)
_REVIEW_STATUS_ENUM = Enum(
    ReviewStatus, name="review_status", values_callable=lambda obj: [e.value for e in obj]
)


class ProvenanceMixin:
    """Provenance et état de revue d'une preuve L2 (tag expérience ou réalisation).

    Backfill et création par les chemins actuels : manual_candidate / accepted.
    Le linker (régime B) crée des preuves cv_import|llm_inferred en review_status pending.
    """

    source: Mapped[EvidenceSource] = mapped_column(
        _EVIDENCE_SOURCE_ENUM,
        default=EvidenceSource.manual_candidate,
        server_default=EvidenceSource.manual_candidate.value,
        nullable=False,
    )
    review_status: Mapped[ReviewStatus] = mapped_column(
        _REVIEW_STATUS_ENUM,
        default=ReviewStatus.accepted,
        server_default=ReviewStatus.accepted.value,
        nullable=False,
    )
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SkillReference(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "skill_references"

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    kind: Mapped[SkillKind] = mapped_column(
        Enum(SkillKind, name="skill_kind", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("skill_references.id", ondelete="SET NULL"),
        nullable=True,
    )
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    esco_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    esco_skill_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="esco", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_displayable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    categories: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    creator_candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        Index(
            "uq_skill_references_slug_esco",
            "slug",
            unique=True,
            postgresql_where=text("creator_candidate_id IS NULL"),
        ),
        Index(
            "uq_skill_references_slug_custom",
            "slug",
            "creator_candidate_id",
            unique=True,
            postgresql_where=text("creator_candidate_id IS NOT NULL"),
        ),
        CheckConstraint(
            "is_custom = (creator_candidate_id IS NOT NULL)",
            name="ck_skill_ref_custom_consistency",
        ),
    )


class CandidateSkill(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "candidate_skills"

    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_ref_id: Mapped[UUID] = mapped_column(
        ForeignKey("skill_references.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    self_assessed_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Highlight profil candidat (L2), distinct du featured commercial par dossier (L3).
    is_profile_highlighted: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # No lazy="joined" — use explicit selectinload in list endpoints
    skill_ref: Mapped[SkillReference] = relationship("SkillReference")

    __table_args__ = (UniqueConstraint("candidate_id", "skill_ref_id", name="uq_candidate_skill"),)


class AchievementSkillTag(Base, ProvenanceMixin):
    __tablename__ = "achievement_skill_tags"

    achievement_id: Mapped[UUID] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    skill_ref_id: Mapped[UUID] = mapped_column(
        ForeignKey("skill_references.id", ondelete="RESTRICT"),
        nullable=False,
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # No lazy="joined" — use explicit selectinload in list endpoints
    skill_ref: Mapped[SkillReference] = relationship("SkillReference")

    __table_args__ = (
        UniqueConstraint("achievement_id", "skill_ref_id", name="uq_achievement_skill_tag"),
    )


class Achievement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "achievements"

    experience_id: Mapped[UUID] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Rattachement optionnel à un projet de l'expérience ; NULL = directement au
    # niveau expérience. SET NULL au drop du projet : la réalisation retombe sur
    # l'expérience sans être supprimée.
    project_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    featured: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )

    experience: Mapped[Experience] = relationship("Experience", back_populates="achievements")
    project: Mapped[Project | None] = relationship("Project", back_populates="achievements")
    skill_tags: Mapped[list[AchievementSkillTag]] = relationship(
        "AchievementSkillTag",
        cascade="all, delete-orphan",
        primaryjoin="Achievement.id == AchievementSkillTag.achievement_id",
    )


class ExperienceSkillUsage(Base, UUIDPrimaryKeyMixin, ProvenanceMixin):
    __tablename__ = "experience_skill_usages"

    experience_id: Mapped[UUID] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_ref_id: Mapped[UUID] = mapped_column(
        ForeignKey("skill_references.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    intensity: Mapped[UsageIntensity | None] = mapped_column(
        Enum(
            UsageIntensity,
            name="usage_intensity",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        # Pas de default : NULL = pré-confirmation (régime B). Les chemins de création
        # explicitent l'intensité (schéma ExperienceSkillUsageCreate -> secondary).
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # No lazy="joined" — use explicit selectinload in list endpoints
    skill_ref: Mapped[SkillReference] = relationship("SkillReference")
    experience: Mapped[Experience] = relationship("Experience", back_populates="skill_usages")

    __table_args__ = (
        UniqueConstraint("experience_id", "skill_ref_id", name="uq_experience_skill_usage"),
    )
