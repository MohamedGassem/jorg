# backend/services/recruiter_service.py
import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.recruiter import Organization, RecruiterProfile
from schemas.recruiter import OrganizationCreate, RecruiterProfileUpdate


def _slugify(name: str) -> str:
    """Convert an organization name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


async def _unique_slug(db: AsyncSession, base: str) -> str:
    """Return base slug if available, otherwise append a numeric suffix."""
    candidate = base
    suffix = 1
    while True:
        result = await db.execute(select(Organization).where(Organization.slug == candidate))
        if result.scalar_one_or_none() is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


# ---- Organization -----------------------------------------------------------


async def create_organization(db: AsyncSession, data: OrganizationCreate) -> Organization:
    slug = await _unique_slug(db, _slugify(data.name))
    org = Organization(name=data.name, slug=slug, logo_url=data.logo_url)
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


async def get_organization(db: AsyncSession, org_id: UUID) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    return result.scalar_one_or_none()


# ---- RecruiterProfile -------------------------------------------------------


async def get_or_create_profile(db: AsyncSession, user_id: UUID) -> RecruiterProfile:
    result = await db.execute(select(RecruiterProfile).where(RecruiterProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = RecruiterProfile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    profile: RecruiterProfile,
    data: RecruiterProfileUpdate,
) -> RecruiterProfile:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


# ---- Accessible candidates --------------------------------------------------


async def list_accessible_candidates(
    db: AsyncSession, organization_id: UUID
) -> list[dict[str, Any]]:
    """Return minimal info for all candidates with an active AccessGrant on this org."""
    from models.candidate_profile import CandidateProfile
    from models.invitation import AccessGrant, AccessGrantStatus
    from models.user import User

    stmt = (
        select(
            User.id.label("user_id"),
            User.email,
            CandidateProfile.first_name,
            CandidateProfile.last_name,
        )
        .join(AccessGrant, AccessGrant.candidate_id == User.id)
        .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
        .where(
            AccessGrant.organization_id == organization_id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
        .order_by(CandidateProfile.last_name.nulls_last(), CandidateProfile.first_name.nulls_last())
    )
    result = await db.execute(stmt)
    return [
        {
            "user_id": row.user_id,
            "email": row.email,
            "first_name": row.first_name,
            "last_name": row.last_name,
        }
        for row in result.all()
    ]
