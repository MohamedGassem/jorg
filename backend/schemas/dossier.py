# backend/schemas/dossier.py
"""Request/response shapes for the dossier APIs (slice 2).

Selections use full-list replace payloads ordered by array index; there are no
per-item move/toggle endpoints. The recruiter arranges, never rewrites (ADR-0002),
so no payload carries L2 fact text.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DossierCreate(BaseModel):
    # Recruiter context: required for a recruiter-owned (grant-bound) dossier,
    # ignored for a candidate creating their own.
    candidate_id: UUID | None = None
    organization_id: UUID | None = None
    name: str | None = None
    objectif: str | None = None
    accroche: str | None = None
    share_contact: bool = True
    share_finances: bool = True


class DossierMetadataUpdate(BaseModel):
    name: str | None = None
    objectif: str | None = None
    accroche: str | None = None
    share_contact: bool | None = None
    share_finances: bool | None = None


class ExperienceSelectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    experience_id: UUID
    position: int
    is_featured: bool


class SkillSelectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    candidate_skill_id: UUID
    position: int
    is_featured: bool


class DossierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_type: str
    candidate_profile_id: UUID
    organization_id: UUID | None
    access_grant_id: UUID | None
    is_general: bool
    name: str | None
    objectif: str | None
    accroche: str | None
    share_contact: bool
    share_finances: bool
    validated_at: datetime | None
    created_at: datetime
    experience_selections: list[ExperienceSelectionRead]
    skill_selections: list[SkillSelectionRead]


class ExperienceSelectionWrite(BaseModel):
    experience_id: UUID
    is_featured: bool = False


class SkillSelectionWrite(BaseModel):
    candidate_skill_id: UUID
    is_featured: bool = False


class CompositionPoolItem(BaseModel):
    """One non-vetoed experience offered to the recruiter, with per-item metadata.

    The metadata block is shaped now to carry future per-item flags (e.g. the
    deferred ``hidden_by_default``) additively, without reshaping the response.
    """

    experience_id: UUID
    role: str
    client_name: str
    start_date: date
    end_date: date | None
    is_current: bool
    hidden_by_default: bool = False


class DossierGenerateRequest(BaseModel):
    template_id: UUID | None = None
    system_template_key: str | None = None
    format: Literal["docx", "pdf"] = "docx"
