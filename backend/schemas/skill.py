# backend/schemas/skill.py
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.skill import (
    EvidenceSource,
    ReviewStatus,
    SkillKind,
    SkillStatus,
    UsageIntensity,
    UsageRole,
)


class SkillReferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    kind: SkillKind
    aliases: list[str]
    esco_uri: str | None
    esco_skill_type: str | None
    source: str
    description: str | None
    is_custom: bool
    is_displayable: bool
    categories: list[str]
    creator_candidate_id: UUID | None
    created_at: datetime
    updated_at: datetime


class SkillReferenceCreate(BaseModel):
    name: str
    kind: SkillKind
    aliases: list[str] = []
    esco_uri: str | None = None


# ---- CandidateSkill ----------------------------------------------------------


class CandidateSkillCreate(BaseModel):
    skill_ref_id: UUID
    self_assessed_level: str | None = None
    featured: bool = False
    notes: str | None = None


class CandidateSkillUpdate(BaseModel):
    self_assessed_level: str | None = None
    featured: bool | None = None
    notes: str | None = None
    kind: SkillKind | None = None


class CandidateSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    candidate_id: UUID
    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    self_assessed_level: str | None
    featured: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


# ---- ExperienceSkillUsage ----------------------------------------------------


class ExperienceSkillUsageCreate(BaseModel):
    skill_ref_id: UUID
    usage_role: UsageRole
    intensity: UsageIntensity = UsageIntensity.secondary


class ExperienceSkillUsageConfirm(BaseModel):
    # La confirmation candidat (régime B) EST le choix d'intensité : pending -> accepted.
    intensity: UsageIntensity


class ExperienceSkillUsageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experience_id: UUID
    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    usage_role: UsageRole
    intensity: UsageIntensity | None
    source: EvidenceSource
    review_status: ReviewStatus
    confidence: float | None
    validated_at: datetime | None
    created_at: datetime


# ---- AchievementSkillTag -----------------------------------------------------


class AchievementSkillTagCreate(BaseModel):
    skill_ref_id: UUID


class AchievementSkillTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    source: EvidenceSource
    review_status: ReviewStatus
    confidence: float | None
    validated_at: datetime | None
    created_at: datetime


# ---- Achievement -------------------------------------------------------------


class AchievementCreate(BaseModel):
    description: str
    impact: str | None = None
    order: int = 0
    featured: bool = False


class AchievementUpdate(BaseModel):
    description: str | None = None
    impact: str | None = None
    order: int | None = None
    featured: bool | None = None


class AchievementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experience_id: UUID
    description: str
    impact: str | None
    order: int
    featured: bool
    skill_tags: list[AchievementSkillTagRead] = []
    created_at: datetime
    updated_at: datetime


# ---- Metrics -----------------------------------------------------------------


class SkillMetricsRead(BaseModel):
    skill_ref_id: UUID
    skill_name: str
    skill_kind: SkillKind
    months_weighted: float
    last_used: date | None
    distinct_contexts: int
    validated: bool


class CandidateSkillProjectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skill_ref_id: UUID
    skill_name: str
    skill_kind: SkillKind
    status: SkillStatus
    evidence_count: int
    first_used: date | None
    last_used: date | None
    is_profile_highlighted: bool
