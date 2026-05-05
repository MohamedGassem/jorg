# backend/schemas/generation.py
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class GenerateRequest(BaseModel):
    candidate_id: UUID
    template_id: UUID
    format: Literal["docx", "pdf"] = "docx"


class GeneratedDocumentRead(BaseModel):
    """Used for recruiter-facing endpoints (org history, generate response)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    access_grant_id: UUID | None
    template_id: UUID | None
    generated_by_user_id: UUID | None
    file_format: str
    generated_at: datetime
    # file_path intentionally omitted — server-side concern only


class GeneratedDocumentCandidateView(BaseModel):
    """Used for GET /candidates/me/documents — includes joined human-readable names."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    generated_at: datetime
    file_format: str
    organization_name: str
    template_name: str
