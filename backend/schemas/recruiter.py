# backend/schemas/recruiter.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

# ---- Organization -----------------------------------------------------------


class OrganizationCreate(BaseModel):
    name: str
    logo_url: str | None = None


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    logo_url: str | None
    created_at: datetime


# ---- RecruiterProfile -------------------------------------------------------


class RecruiterProfileUpdate(BaseModel):
    """Tous les champs optionnels — sémantique PATCH appliquée via PUT."""

    first_name: str | None = None
    last_name: str | None = None
    job_title: str | None = None
    organization_id: UUID | None = None


class RecruiterProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    organization_id: UUID | None
    first_name: str | None
    last_name: str | None
    job_title: str | None
    created_at: datetime
    updated_at: datetime
