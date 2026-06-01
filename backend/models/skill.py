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
    from models.candidate_profile import Experience


class SkillKind(StrEnum):
    technical = "technical"
    functional = "functional"
    sectoral = "sectoral"
    methodology = "methodology"
    tool = "tool"
    soft = "soft"


class UsageRole(StrEnum):
    lead = "lead"
    implementer = "implementer"
    contributor = "contributor"
    user = "user"
    exposed_to = "exposed_to"


class UsageIntensity(StrEnum):
    primary = "primary"
    secondary = "secondary"
    incidental = "incidental"


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
    creator_candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        # ESCO skills: slug globally unique (creator_candidate_id IS NULL)
        Index(
            "uq_skill_references_slug_esco",
            "slug",
            unique=True,
            postgresql_where=text("creator_candidate_id IS NULL"),
        ),
        # Custom skills: (slug, creator_candidate_id) unique per candidate
        Index(
            "uq_skill_references_slug_custom",
            "slug",
            "creator_candidate_id",
            unique=True,
            postgresql_where=text("creator_candidate_id IS NOT NULL"),
        ),
        # Enforce is_custom = (creator_candidate_id IS NOT NULL)
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
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # No lazy="joined" — use explicit selectinload in list endpoints
    skill_ref: Mapped[SkillReference] = relationship("SkillReference")

    __table_args__ = (UniqueConstraint("candidate_id", "skill_ref_id", name="uq_candidate_skill"),)


class Achievement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "achievements"

    experience_id: Mapped[UUID] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    experience: Mapped[Experience] = relationship("Experience", back_populates="achievements")


class ExperienceSkillUsage(Base, UUIDPrimaryKeyMixin):
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
    usage_role: Mapped[UsageRole] = mapped_column(
        Enum(UsageRole, name="usage_role", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    intensity: Mapped[UsageIntensity] = mapped_column(
        Enum(
            UsageIntensity,
            name="usage_intensity",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=UsageIntensity.secondary,
        nullable=False,
    )
    achievement_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("achievements.id", ondelete="SET NULL"),
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
