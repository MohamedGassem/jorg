# backend/models/candidate_profile.py
from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    ARRAY,
    JSON,
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from models.skill import Achievement, ExperienceSkillUsage


class LanguageLevel(StrEnum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"
    NATIVE = "native"


class ContractType(StrEnum):
    FREELANCE = "freelance"
    CDI = "cdi"
    BOTH = "both"


class AvailabilityStatus(StrEnum):
    AVAILABLE_NOW = "available_now"
    AVAILABLE_FROM = "available_from"
    NOT_AVAILABLE = "not_available"


class WorkMode(StrEnum):
    REMOTE = "remote"
    ONSITE = "onsite"
    HYBRID = "hybrid"


class MissionDuration(StrEnum):
    SHORT = "short"  # < 3 mois
    MEDIUM = "medium"  # 3-6 mois
    LONG = "long"  # 6 mois+
    PERMANENT = "permanent"


class CVExtractionStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    REVIEWED = "reviewed"
    FAILED = "failed"


class CandidateProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "candidate_profiles"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(
        default=False, nullable=False, server_default="false"
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email_contact: Mapped[str | None] = mapped_column(String(320), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    years_of_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contract_type: Mapped[ContractType] = mapped_column(
        Enum(
            ContractType, name="contract_type", values_callable=lambda obj: [e.value for e in obj]
        ),
        default=ContractType.FREELANCE,
        nullable=False,
    )
    annual_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extra_fields: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    availability_status: Mapped[AvailabilityStatus] = mapped_column(
        Enum(
            AvailabilityStatus,
            name="availability_status",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=AvailabilityStatus.NOT_AVAILABLE,
        nullable=False,
    )
    availability_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    work_mode: Mapped[WorkMode | None] = mapped_column(
        Enum(WorkMode, name="work_mode", values_callable=lambda obj: [e.value for e in obj]),
        nullable=True,
    )
    location_preference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    preferred_domains: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)), nullable=True)
    mission_duration: Mapped[MissionDuration | None] = mapped_column(
        Enum(
            MissionDuration,
            name="mission_duration",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=True,
    )


class Experience(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "experiences"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    achievements_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # technologies removed — replaced by ExperienceSkillUsage
    # achievements (Text) renamed to achievements_summary — achievements is now list[Achievement]

    achievements: Mapped[list[Achievement]] = relationship(
        "Achievement",
        cascade="all, delete-orphan",
        order_by="Achievement.order",
        back_populates="experience",
    )
    skill_usages: Mapped[list[ExperienceSkillUsage]] = relationship(
        "ExperienceSkillUsage",
        cascade="all, delete-orphan",
        back_populates="experience",
    )
    projects: Mapped[list[Project]] = relationship(
        "Project",
        cascade="all, delete-orphan",
        order_by="Project.order_index",
        back_populates="experience",
    )


class Project(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Engagement nommé et distinct au sein d'une expérience (POC, livrable).

    Optionnel : une réalisation se rattache directement à l'expérience ou, quand
    l'expérience contient des engagements distincts, à un projet. Un projet se
    justifie par l'engagement, pas par un simple thème de regroupement (L3).
    """

    __tablename__ = "projects"

    experience_id: Mapped[UUID] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    experience: Mapped[Experience] = relationship("Experience", back_populates="projects")
    achievements: Mapped[list[Achievement]] = relationship(
        "Achievement",
        back_populates="project",
    )


class Education(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "education"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    school: Mapped[str] = mapped_column(String(200), nullable=False)
    degree: Mapped[str | None] = mapped_column(String(200), nullable=True)
    field_of_study: Mapped[str | None] = mapped_column(String(200), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Certification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "certifications"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    issuer: Mapped[str] = mapped_column(String(200), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    credential_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class Language(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "languages"
    __table_args__ = (UniqueConstraint("profile_id", "name", name="uq_language_profile_name"),)

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[LanguageLevel] = mapped_column(
        Enum(LanguageLevel, name="language_level"), nullable=False
    )


class LanguageReference(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "language_references"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_language_references_slug"),
        UniqueConstraint("esco_uri", name="uq_language_references_esco_uri"),
        Index("ix_language_references_name", "name"),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    esco_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class CVExtractionProposal(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "cv_extraction_proposals"

    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    extraction_method: Mapped[str] = mapped_column(String(40), nullable=False)
    quality_score: Mapped[int] = mapped_column(Integer, nullable=False)
    quality_details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    proposed_profile: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[CVExtractionStatus] = mapped_column(
        Enum(
            CVExtractionStatus,
            name="cv_extraction_status",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=CVExtractionStatus.PENDING_REVIEW,
        nullable=False,
        index=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
