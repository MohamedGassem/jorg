from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKeyMixin


class GeneratedDocument(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "generated_documents"

    access_grant_id: Mapped[UUID] = mapped_column(
        ForeignKey("access_grants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # Nullable — kept for audit even if template is deleted
    template_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("templates.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    # Nullable — kept for audit even if user is deleted
    generated_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_format: Mapped[str] = mapped_column(String(10), nullable=False)  # "docx" | "pdf"
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
