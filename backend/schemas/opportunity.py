from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from models.opportunity import OpportunityStatus


class OpportunitySkillOut(BaseModel):
    skill_ref_id: UUID
    name: str


class OpportunityCreate(BaseModel):
    title: str
    description: str | None = None
    skill_ref_ids: list[UUID] = []


class OpportunityUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: OpportunityStatus | None = None
    # None = leave required skills unchanged; [] = clear all required skills.
    skill_ref_ids: list[UUID] | None = None


class ShortlistCandidateInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    title: str | None
    match_score: int | None = None


class OpportunityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    title: str
    description: str | None
    status: OpportunityStatus
    created_at: datetime
    updated_at: datetime
    required_skills: list[OpportunitySkillOut] = []


class OpportunityDetail(OpportunityRead):
    shortlist: list[ShortlistCandidateInfo] = []


class ShortlistAddRequest(BaseModel):
    candidate_id: UUID


class BulkGenerateRequest(BaseModel):
    template_id: UUID | None = None
    system_template_key: str | None = None
    format: Literal["docx", "pdf"] = "docx"

    @model_validator(mode="after")
    def exactly_one_template_source(self) -> BulkGenerateRequest:
        if bool(self.template_id) == bool(self.system_template_key):
            raise ValueError("provide exactly one of template_id or system_template_key")
        return self


class BulkGenerateResult(BaseModel):
    candidate_id: UUID
    status: str
    doc_id: UUID | None = None
    error: str | None = None
