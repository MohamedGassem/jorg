# backend/schemas/template.py
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_by_user_id: UUID
    name: str
    description: str | None
    word_file_path: str
    detected_placeholders: list[str]
    is_valid: bool
    unknown_placeholders: list[str]
    validation_error: str | None
    status: str
    templatize_report: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class BuiltinTemplateRead(BaseModel):
    key: str
    name: str
    description: str
