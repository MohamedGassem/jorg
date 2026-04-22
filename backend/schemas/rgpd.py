# backend/schemas/rgpd.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from schemas.candidate import (
    CandidateProfileRead,
    CertificationRead,
    EducationRead,
    ExperienceRead,
    LanguageRead,
    SkillRead,
)


class AccessGrantExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    status: str
    granted_at: datetime
    revoked_at: datetime | None


class GeneratedDocumentExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    access_grant_id: UUID | None
    template_id: UUID | None
    generated_by_user_id: UUID | None
    file_format: str
    generated_at: datetime


class CandidateExport(BaseModel):
    """Payload RGPD complet pour un candidat."""

    exported_at: datetime
    user_id: UUID
    email: str
    role: str
    created_at: datetime

    profile: CandidateProfileRead | None
    experiences: list[ExperienceRead]
    skills: list[SkillRead]
    education: list[EducationRead]
    certifications: list[CertificationRead]
    languages: list[LanguageRead]
    access_grants: list[AccessGrantExport]
    generated_documents: list[GeneratedDocumentExport]
