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
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    access_grant_id: UUID
    template_id: UUID | None
    generated_by_user_id: UUID | None
    file_path: str
    file_format: str
    generated_at: datetime
