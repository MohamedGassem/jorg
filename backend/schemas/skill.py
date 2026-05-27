# backend/schemas/skill.py
# Stub — expanded in Task 3
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.skill import SkillKind


class SkillReferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    kind: SkillKind
    aliases: list[str]
    esco_uri: str | None
    esco_skill_type: str | None
    source: str
    description: str | None
    is_custom: bool
    created_at: datetime
    updated_at: datetime


class CandidateSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    candidate_id: UUID
    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    self_assessed_level: str | None
    featured: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
