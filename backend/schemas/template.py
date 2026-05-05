# backend/schemas/template.py
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TemplateMappingsUpdate(BaseModel):
    """Mappings from placeholder to candidate profile field name.

    Example: {"{{NOM}}": "last_name", "{{PRENOM}}": "first_name"}
    """

    mappings: dict[str, str]
    version: int


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_by_user_id: UUID
    name: str
    description: str | None
    word_file_path: str
    detected_placeholders: list[str]
    mappings: dict[str, Any]
    is_valid: bool
    version: int
    created_at: datetime
    updated_at: datetime
