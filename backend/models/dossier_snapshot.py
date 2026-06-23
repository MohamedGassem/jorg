# backend/models/dossier_snapshot.py
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKeyMixin


class GeneratedDossierSnapshot(Base, UUIDPrimaryKeyMixin):
    """Frozen record of a dossier at the moment it went out to a client (#67).

    Captures the resolved render model and the consent policy as they were, so an
    envoi stays justified even if the candidate later changes the rules. The
    snapshot is immutable: regenerating creates a new row (invariant #7).
    """

    __tablename__ = "generated_dossier_snapshots"

    dossier_id: Mapped[UUID] = mapped_column(
        ForeignKey("dossiers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    render_model_snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    consent_policy_snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Nullable — kept for audit even if template is deleted.
    template_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("templates.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # Nullable — kept for audit even if user is deleted.
    generated_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # The rendered DOCX/PDF this snapshot froze (locked decision #2/#9). Nullable
    # ON DELETE SET NULL: the snapshot is the durable artifact and outlives file
    # storage (deferred regenerate-on-demand keeps the snapshot, drops the file).
    generated_document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("generated_documents.id", ondelete="SET NULL"), index=True, nullable=True
    )
    recipient_context: Mapped[str | None] = mapped_column(String(500), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
