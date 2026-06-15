# backend/models/template.py
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Template(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "templates"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    word_file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    # Original uploaded file, preserved so assisted templating always re-runs
    # from the source rather than from a previous templatized output.
    source_file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    detected_placeholders: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    unknown_placeholders: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    validation_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="active", server_default="active", nullable=False
    )  # "active" | "draft"
    templatize_report: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
