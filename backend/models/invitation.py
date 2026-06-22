# backend/models/invitation.py
from __future__ import annotations

import secrets
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text
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


class TemporalPrecision(StrEnum):
    """How precise the dates shown to a client may be."""

    EXACT = "exact"
    MONTH = "month"
    YEAR = "year"


class ExclusionTargetType(StrEnum):
    """Kind of L2 item an opposable exclusion targets."""

    EXPERIENCE = "experience"


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

    candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[AccessGrantStatus] = mapped_column(
        SQLEnum(AccessGrantStatus), default=AccessGrantStatus.ACTIVE, nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Consent envelope: the opposable ceiling the recruiter composes within.
    # Visibility of the candidate's finances internally to the ESN.
    share_finances_internal: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    share_contact: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    # Identity anonymized when presented to the end client.
    identity_anonymized_to_client: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # Client (mission employer) names masked in outgoing dossiers.
    mask_client_names: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # Whether the candidate may be contacted directly by the client.
    reachable: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    temporal_precision: Mapped[TemporalPrecision] = mapped_column(
        SQLEnum(
            TemporalPrecision,
            name="temporal_precision",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=TemporalPrecision.EXACT,
        server_default=TemporalPrecision.EXACT.value,
        nullable=False,
    )
    # GDPR purpose of processing and retention horizon.
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    retention_until: Mapped[date | None] = mapped_column(Date, nullable=True)


class AccessGrantExclusion(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """An item the candidate has excluded from any outgoing dossier (opposable).

    Granularity is mixed: categories plus explicit per-item exclusions. Only the
    excluded item is opposable; a non-featured item stays showable (invariant #6).
    """

    __tablename__ = "access_grant_exclusions"

    grant_id: Mapped[UUID] = mapped_column(
        ForeignKey("access_grants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    target_type: Mapped[ExclusionTargetType] = mapped_column(
        SQLEnum(
            ExclusionTargetType,
            name="exclusion_target_type",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    target_id: Mapped[UUID] = mapped_column(nullable=False, index=True)


def make_invitation_token() -> str:
    """Generate a cryptographically secure invitation token."""
    return secrets.token_urlsafe(32)


def invitation_expiry() -> datetime:
    """Return timestamp 30 days from now (UTC)."""
    return datetime.now(UTC) + timedelta(days=30)
