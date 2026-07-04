# backend/schemas/generation.py
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator


class GenerateRequest(BaseModel):
    candidate_id: UUID
    template_id: UUID | None = None
    system_template_key: str | None = None
    format: Literal["docx", "pdf"] = "docx"

    @model_validator(mode="after")
    def exactly_one_template_source(self) -> GenerateRequest:
        if bool(self.template_id) == bool(self.system_template_key):
            raise ValueError("provide exactly one of template_id or system_template_key")
        return self


class GenerateSelfRequest(BaseModel):
    system_template_key: str
    format: Literal["docx", "pdf"] = "docx"


class GeneratedDocumentRead(BaseModel):
    """Used for recruiter-facing endpoints (org history, generate response)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    access_grant_id: UUID | None
    template_id: UUID | None
    generated_by_user_id: UUID | None
    file_format: str
    template_name: str | None
    generated_at: datetime
    # file_path intentionally omitted — server-side concern only


class GeneratedDocumentCandidateView(BaseModel):
    """Used for GET /candidates/me/documents — includes joined human-readable names."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    generated_at: datetime
    file_format: str
    organization_name: str
    organization_id: UUID | None
    template_name: str | None
    recruiter_first_name: str | None
    recruiter_last_name: str | None


class GeneratedDocumentRecruiterView(BaseModel):
    """Used for GET /organizations/{id}/documents — includes candidate name and opportunity."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    generated_at: datetime
    file_format: str
    template_name: str | None
    candidate_first_name: str | None
    candidate_last_name: str | None
    opportunity_title: str | None
    generated_by_user_id: UUID | None
