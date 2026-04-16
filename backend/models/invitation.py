# backend/models/invitation.py
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"


class AccessGrantStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


class Invitation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invitations"

    recruiter_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    candidate_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    status: Mapped[InvitationStatus] = mapped_column(
        SQLEnum(InvitationStatus), default=InvitationStatus.PENDING, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AccessGrant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "access_grants"

    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[AccessGrantStatus] = mapped_column(
        SQLEnum(AccessGrantStatus), default=AccessGrantStatus.ACTIVE, nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def make_invitation_token() -> str:
    """Generate a cryptographically secure invitation token."""
    return secrets.token_urlsafe(32)


def invitation_expiry() -> datetime:
    """Return timestamp 30 days from now (UTC)."""
    return datetime.now(UTC) + timedelta(days=30)
