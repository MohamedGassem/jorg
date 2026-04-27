# backend/schemas/candidate.py
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.candidate_profile import (
    AvailabilityStatus,
    ContractType,
    LanguageLevel,
    MissionDuration,
    SkillCategory,
    WorkMode,
)

VALID_DOMAINS = {
    "finance",
    "retail",
    "industry",
    "public",
    "health",
    "tech",
    "telecom",
    "energy",
    "other",
}

# ---- CandidateProfile -------------------------------------------------------


class CandidateProfileUpdate(BaseModel):
    """Tous les champs optionnels — sémantique PATCH appliquée via PUT."""

    first_name: str | None = None
    last_name: str | None = None
    title: str | None = None
    summary: str | None = None
    phone: str | None = None
    email_contact: str | None = None
    linkedin_url: str | None = None
    location: str | None = None
    avatar_url: str | None = None
    years_of_experience: int | None = None
    daily_rate: int | None = None
    contract_type: ContractType | None = None
    annual_salary: int | None = None
    extra_fields: dict[str, Any] | None = None
    availability_status: AvailabilityStatus | None = None
    availability_date: date | None = None
    work_mode: WorkMode | None = None
    location_preference: str | None = None
    preferred_domains: list[str] | None = None
    mission_duration: MissionDuration | None = None

    @field_validator("preferred_domains")
    @classmethod
    def validate_domains(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        invalid = set(v) - VALID_DOMAINS
        if invalid:
            raise ValueError(f"invalid domains: {invalid}")
        return v


class CandidateProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    first_name: str | None
    last_name: str | None
    title: str | None
    summary: str | None
    phone: str | None
    email_contact: str | None
    linkedin_url: str | None
    location: str | None
    avatar_url: str | None
    years_of_experience: int | None
    daily_rate: int | None
    contract_type: ContractType
    annual_salary: int | None
    extra_fields: dict[str, Any] | None
    availability_status: AvailabilityStatus = AvailabilityStatus.NOT_AVAILABLE
    availability_date: date | None = None
    work_mode: WorkMode | None = None
    location_preference: str | None = None
    preferred_domains: list[str] | None = None
    mission_duration: MissionDuration | None = None
    created_at: datetime
    updated_at: datetime


# ---- Experience -------------------------------------------------------------


class ExperienceCreate(BaseModel):
    client_name: str
    role: str
    start_date: date
    end_date: date | None = None
    is_current: bool = False
    description: str | None = None
    context: str | None = None
    achievements: str | None = None
    technologies: list[str] = []


class ExperienceUpdate(BaseModel):
    client_name: str | None = None
    role: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None
    description: str | None = None
    context: str | None = None
    achievements: str | None = None
    technologies: list[str] | None = None


class ExperienceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    client_name: str
    role: str
    start_date: date
    end_date: date | None
    is_current: bool
    description: str | None
    context: str | None
    achievements: str | None
    technologies: list[str]
    created_at: datetime
    updated_at: datetime


# ---- Skill ------------------------------------------------------------------


class SkillCreate(BaseModel):
    name: str
    category: SkillCategory
    level: str | None = None
    level_rating: int | None = Field(default=None, ge=1, le=5)
    years_of_experience: int | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    category: SkillCategory | None = None
    level: str | None = None
    level_rating: int | None = Field(default=None, ge=1, le=5)
    years_of_experience: int | None = None


class SkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    category: SkillCategory
    level: str | None
    level_rating: int | None
    years_of_experience: int | None
    created_at: datetime
    updated_at: datetime


# ---- Education --------------------------------------------------------------


class EducationCreate(BaseModel):
    school: str
    degree: str | None = None
    field_of_study: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None


class EducationUpdate(BaseModel):
    school: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None


class EducationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    school: str
    degree: str | None
    field_of_study: str | None
    start_date: date | None
    end_date: date | None
    description: str | None
    created_at: datetime
    updated_at: datetime


# ---- Certification ----------------------------------------------------------


class CertificationCreate(BaseModel):
    name: str
    issuer: str
    issue_date: date
    expiry_date: date | None = None
    credential_url: str | None = None


class CertificationUpdate(BaseModel):
    name: str | None = None
    issuer: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    credential_url: str | None = None


class CertificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    issuer: str
    issue_date: date
    expiry_date: date | None
    credential_url: str | None
    created_at: datetime
    updated_at: datetime


# ---- Language ---------------------------------------------------------------


class LanguageCreate(BaseModel):
    name: str
    level: LanguageLevel


class LanguageUpdate(BaseModel):
    name: str | None = None
    level: LanguageLevel | None = None


class LanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    level: LanguageLevel
    created_at: datetime
    updated_at: datetime


# ---- Interaction timeline ----------------------------------------------------

InteractionEventType = Literal[
    "invitation_sent",
    "invitation_accepted",
    "invitation_rejected",
    "invitation_expired",
    "access_granted",
    "access_revoked",
    "document_generated",
]

OrganizationStatus = Literal["invited", "active", "revoked", "expired"]


class InteractionEventMetadata(BaseModel):
    template_name: str | None = None
    file_format: str | None = None


class InteractionEvent(BaseModel):
    type: InteractionEventType
    occurred_at: datetime
    metadata: InteractionEventMetadata = InteractionEventMetadata()


class OrganizationInteractionCard(BaseModel):
    organization_id: UUID
    organization_name: str
    logo_url: str | None
    current_status: OrganizationStatus
    events: list[InteractionEvent]
