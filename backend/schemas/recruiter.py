# backend/schemas/recruiter.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.candidate_profile import AvailabilityStatus, ContractType, WorkMode
from schemas.candidate import ExperienceRead

# ---- Organization -----------------------------------------------------------


class OrganizationCreate(BaseModel):
    name: str
    logo_url: str | None = None


class OrgJoinRequest(BaseModel):
    code: str


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    logo_url: str | None
    join_code: str
    created_at: datetime


class OrgMemberRead(BaseModel):
    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    job_title: str | None


# ---- RecruiterProfile -------------------------------------------------------


class RecruiterProfileUpdate(BaseModel):
    """Tous les champs optionnels — sémantique PATCH appliquée via PUT."""

    first_name: str | None = None
    last_name: str | None = None
    job_title: str | None = None
    organization_id: UUID | None = None
    onboarding_completed: bool | None = None


class RecruiterProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    organization_id: UUID | None
    first_name: str | None
    last_name: str | None
    job_title: str | None
    onboarding_completed: bool = False
    created_at: datetime
    updated_at: datetime


# ---- AccessibleCandidate ----------------------------------------------------


class AccessibleCandidateRead(BaseModel):
    """Candidate exposed to a recruiter via an active AccessGrant."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    title: str | None = None
    daily_rate: int | None = None
    contract_type: ContractType | None = None
    availability_status: AvailabilityStatus | None = None
    work_mode: WorkMode | None = None
    location_preference: str | None = None
    preferred_domains: list[str] | None = None
    experiences: list[ExperienceRead] = []
