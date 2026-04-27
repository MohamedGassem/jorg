from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.opportunity import OpportunityStatus


class OpportunityCreate(BaseModel):
    title: str
    description: str | None = None


class OpportunityUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: OpportunityStatus | None = None


class ShortlistCandidateInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    title: str | None


class OpportunityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    title: str
    description: str | None
    status: OpportunityStatus
    created_at: datetime
    updated_at: datetime


class OpportunityDetail(OpportunityRead):
    shortlist: list[ShortlistCandidateInfo] = []


class ShortlistAddRequest(BaseModel):
    candidate_id: UUID


class BulkGenerateRequest(BaseModel):
    template_id: UUID
    format: Literal["docx", "pdf"] = "docx"


class BulkGenerateResult(BaseModel):
    candidate_id: UUID
    status: str
    doc_id: UUID | None = None
    error: str | None = None
