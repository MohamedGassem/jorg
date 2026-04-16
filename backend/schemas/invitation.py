from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from models.invitation import AccessGrantStatus, InvitationStatus


class InvitationCreate(BaseModel):
    candidate_email: EmailStr


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recruiter_id: UUID
    organization_id: UUID
    candidate_email: str
    candidate_id: UUID | None
    token: str
    status: InvitationStatus
    expires_at: datetime
    created_at: datetime


class AccessGrantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    candidate_id: UUID
    organization_id: UUID
    status: AccessGrantStatus
    granted_at: datetime
    revoked_at: datetime | None
    created_at: datetime
