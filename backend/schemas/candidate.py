# backend/schemas/candidate.py
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, overload
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from core.exceptions import BusinessRuleError
from models.candidate_profile import (
    AvailabilityStatus,
    ContractType,
    LanguageLevel,
    MissionDuration,
    WorkMode,
)
from models.skill import SkillKind
from schemas.skill import AchievementRead, ExperienceSkillUsageRead


@overload
def _non_empty(v: str) -> str: ...
@overload
def _non_empty(v: None) -> None: ...
def _non_empty(v: str | None) -> str | None:
    """Strip a string; reject if it becomes empty. Passes None through (PATCH)."""
    if v is None:
        return v
    stripped = v.strip()
    if not stripped:
        raise ValueError("must not be blank")
    return stripped


def _reject_null_required(data: Any, required: tuple[str, ...]) -> Any:
    """Reject an explicit null for columns that are NOT NULL in the DB.

    PATCH may omit these fields, but setting them to null would otherwise pass
    schema validation and only fail at write time as an IntegrityError. Catch it
    here so the client gets a clean 422 instead.
    """
    if isinstance(data, dict):
        for field in required:
            if field in data and data[field] is None:
                raise ValueError(f"{field} cannot be null")
    return data


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


def validate_experience_dates(
    start_date: date | None,
    end_date: date | None,
    is_current: bool,
) -> None:
    """Cross-field coherence for an Experience. Raises BusinessRuleError (422)."""
    if is_current and end_date is not None:
        raise BusinessRuleError("a current experience cannot have an end_date")
    if start_date is not None and end_date is not None and end_date < start_date:
        raise BusinessRuleError("end_date must be on or after start_date")


def validate_education_dates(start_date: date | None, end_date: date | None) -> None:
    if start_date is not None and end_date is not None and end_date < start_date:
        raise BusinessRuleError("end_date must be on or after start_date")


def validate_certification_dates(issue_date: date | None, expiry_date: date | None) -> None:
    if issue_date is not None and expiry_date is not None and expiry_date < issue_date:
        raise BusinessRuleError("expiry_date must be on or after issue_date")


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
    onboarding_completed: bool | None = None

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
    onboarding_completed: bool = False
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
    achievements_summary: str | None = None
    # technologies removed

    @field_validator("client_name", "role")
    @classmethod
    def _strip_required(cls, v: str) -> str:
        return _non_empty(v)


class ExperienceUpdate(BaseModel):
    client_name: str | None = None
    role: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None
    description: str | None = None
    context: str | None = None
    achievements_summary: str | None = None
    # technologies removed

    @field_validator("client_name", "role")
    @classmethod
    def _strip_required(cls, v: str | None) -> str | None:
        return _non_empty(v)

    @model_validator(mode="before")
    @classmethod
    def _no_null_required(cls, data: Any) -> Any:
        return _reject_null_required(data, ("client_name", "role", "start_date", "is_current"))


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
    achievements_summary: str | None
    achievements: list[AchievementRead] = []
    skill_usages: list[ExperienceSkillUsageRead] = []
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

    @field_validator("school")
    @classmethod
    def _strip_required(cls, v: str) -> str:
        return _non_empty(v)


class EducationUpdate(BaseModel):
    school: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None

    @field_validator("school")
    @classmethod
    def _strip_required(cls, v: str | None) -> str | None:
        return _non_empty(v)

    @model_validator(mode="before")
    @classmethod
    def _no_null_required(cls, data: Any) -> Any:
        return _reject_null_required(data, ("school",))


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

    @field_validator("name", "issuer")
    @classmethod
    def _strip_required(cls, v: str) -> str:
        return _non_empty(v)


class CertificationUpdate(BaseModel):
    name: str | None = None
    issuer: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    credential_url: str | None = None

    @field_validator("name", "issuer")
    @classmethod
    def _strip_required(cls, v: str | None) -> str | None:
        return _non_empty(v)

    @model_validator(mode="before")
    @classmethod
    def _no_null_required(cls, data: Any) -> Any:
        return _reject_null_required(data, ("name", "issuer", "issue_date"))


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

    @field_validator("name")
    @classmethod
    def _strip_required(cls, v: str) -> str:
        return _non_empty(v)


class LanguageUpdate(BaseModel):
    name: str | None = None
    level: LanguageLevel | None = None

    @field_validator("name")
    @classmethod
    def _strip_required(cls, v: str | None) -> str | None:
        return _non_empty(v)

    @model_validator(mode="before")
    @classmethod
    def _no_null_required(cls, data: Any) -> Any:
        return _reject_null_required(data, ("name", "level"))


class LanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    level: LanguageLevel
    created_at: datetime
    updated_at: datetime


class LanguageReferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    aliases: list[str]
    esco_uri: str | None
    source: str
    description: str | None
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
    recruiter_first_name: str | None = None
    recruiter_last_name: str | None = None


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


# ---- CV parsing -------------------------------------------------------------


class CVSkillSuggestion(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skill_ref_id: UUID
    name: str
    kind: SkillKind


class CVParseResult(BaseModel):
    """Suggestions extracted from an uploaded CV to pre-fill the profile.

    Never written to the DB automatically — the candidate confirms in the UI.
    """

    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    skills: list[CVSkillSuggestion] = []
