from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class OpportunityStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class Opportunity(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "opportunities"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[OpportunityStatus] = mapped_column(
        Enum(OpportunityStatus, name="opportunity_status", values_callable=lambda x: [e.value for e in x]),
        default=OpportunityStatus.OPEN,
        nullable=False,
        server_default="open",
    )


class ShortlistEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "shortlist_entries"

    __table_args__ = (
        UniqueConstraint("opportunity_id", "candidate_id", name="uq_shortlist_entry"),
    )

    opportunity_id: Mapped[UUID] = mapped_column(
        ForeignKey("opportunities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
