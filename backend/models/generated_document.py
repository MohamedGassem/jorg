from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKeyMixin


class GeneratedDocument(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "generated_documents"

    access_grant_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("access_grants.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    # The frozen snapshot this DOCX renders (#67). Nullable: legacy documents and
    # the grant-based pipeline predate dossier snapshots.
    snapshot_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("generated_dossier_snapshots.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
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
    template_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
