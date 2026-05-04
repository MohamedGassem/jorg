# backend/services/recruiter_service.py
import re
from typing import Any, Self
from uuid import UUID

from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile, Skill
from models.invitation import AccessGrant, AccessGrantStatus
from models.recruiter import Organization, RecruiterProfile
from models.user import User
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


async def get_profile(db: AsyncSession, user_id: UUID) -> RecruiterProfile | None:
    result = await db.execute(select(RecruiterProfile).where(RecruiterProfile.user_id == user_id))
    return result.scalar_one_or_none()


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


class CandidateQueryBuilder:
    def __init__(self, organization_id: UUID) -> None:
        self._stmt: Select[Any] = (
            select(
                User.id.label("user_id"),
                User.email,
                CandidateProfile.first_name,
                CandidateProfile.last_name,
                CandidateProfile.title,
                CandidateProfile.daily_rate,
                CandidateProfile.contract_type,
                CandidateProfile.availability_status,
                CandidateProfile.work_mode,
                CandidateProfile.location_preference,
                CandidateProfile.preferred_domains,
            )
            .join(AccessGrant, AccessGrant.candidate_id == User.id)
            .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
            .where(
                AccessGrant.organization_id == organization_id,
                AccessGrant.status == AccessGrantStatus.ACTIVE,
            )
            .order_by(
                CandidateProfile.last_name.nulls_last(),
                CandidateProfile.first_name.nulls_last(),
            )
        )

    def filter_availability(self, status: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.availability_status == status)
        return self

    def filter_work_mode(self, mode: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.work_mode == mode)
        return self

    def filter_contract_type(self, contract_type: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.contract_type == contract_type)
        return self

    def filter_mission_duration(self, duration: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.mission_duration == duration)
        return self

    def filter_max_rate(self, max_rate: int) -> Self:
        self._stmt = self._stmt.where(
            or_(
                CandidateProfile.daily_rate.is_(None),
                CandidateProfile.daily_rate <= max_rate,
            )
        )
        return self

    def filter_skill(self, skill: str) -> Self:
        self._stmt = self._stmt.where(
            exists(
                select(Skill.id).where(
                    Skill.profile_id == CandidateProfile.id,
                    func.lower(Skill.name).contains(skill.lower()),
                )
            )
        )
        return self

    def filter_location(self, location: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.location_preference.ilike(f"%{location}%"))
        return self

    def filter_domain(self, domain: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.preferred_domains.contains(array([domain])))
        return self

    def filter_query(self, q: str) -> Self:
        q_like = f"%{q}%"
        self._stmt = self._stmt.where(
            or_(
                CandidateProfile.title.ilike(q_like),
                CandidateProfile.summary.ilike(q_like),
            )
        )
        return self

    def build(self) -> Select[Any]:
        return self._stmt


async def list_accessible_candidates(
    db: AsyncSession,
    organization_id: UUID,
    *,
    availability_status: str | None = None,
    work_mode: str | None = None,
    contract_type: str | None = None,
    mission_duration: str | None = None,
    max_daily_rate: int | None = None,
    skill: str | None = None,
    location: str | None = None,
    domain: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    """Return candidates with an active AccessGrant on this org, with optional filters."""
    builder = CandidateQueryBuilder(organization_id)
    if availability_status:
        builder = builder.filter_availability(availability_status)
    if work_mode:
        builder = builder.filter_work_mode(work_mode)
    if contract_type:
        builder = builder.filter_contract_type(contract_type)
    if mission_duration:
        builder = builder.filter_mission_duration(mission_duration)
    if max_daily_rate is not None:
        builder = builder.filter_max_rate(max_daily_rate)
    if skill:
        builder = builder.filter_skill(skill)
    if location:
        builder = builder.filter_location(location)
    if domain:
        builder = builder.filter_domain(domain)
    if q:
        builder = builder.filter_query(q)

    result = await db.execute(builder.build())
    return [
        {
            "user_id": row.user_id,
            "email": row.email,
            "first_name": row.first_name,
            "last_name": row.last_name,
            "title": row.title,
            "daily_rate": row.daily_rate,
            "contract_type": row.contract_type,
            "availability_status": row.availability_status,
            "work_mode": row.work_mode,
            "location_preference": row.location_preference,
            "preferred_domains": row.preferred_domains,
        }
        for row in result.all()
    ]
