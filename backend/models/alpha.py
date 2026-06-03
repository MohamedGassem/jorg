from __future__ import annotations

import secrets
import string
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKeyMixin


def _generate_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    part1 = "".join(secrets.choice(alphabet) for _ in range(4))
    part2 = "".join(secrets.choice(alphabet) for _ in range(4))
    return f"JORG-{part1}-{part2}"


class AlphaInviteCode(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "alpha_invite_codes"

    code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, default=_generate_code
    )
    used_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("recruiter_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
