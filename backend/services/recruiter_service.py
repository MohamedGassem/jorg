# backend/services/recruiter_service.py
import re
import secrets
from collections.abc import Sequence
from typing import Any, Self
from uuid import UUID

from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.candidate_profile import CandidateProfile, ContractType, Experience
from models.invitation import AccessGrant
from models.recruiter import Organization, RecruiterProfile
from models.skill import (
    Achievement,
    AchievementSkillTag,
    CandidateSkill,
    ExperienceSkillUsage,
    SkillReference,
)
from models.user import User
from schemas.recruiter import OrganizationCreate, RecruiterProfileUpdate
from services import access_policy


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


async def _unique_join_code(db: AsyncSession) -> str:
    while True:
        code = secrets.token_urlsafe(6)
        result = await db.execute(select(Organization).where(Organization.join_code == code))
        if result.scalar_one_or_none() is None:
            return code


async def create_organization(
    db: AsyncSession,
    data: OrganizationCreate,
    created_by_user_id: UUID | None = None,
) -> Organization:
    """Create org. If created_by_user_id provided, links that recruiter atomically."""
    # Ensure profile exists FIRST so the final commit is the only one that matters
    profile = None
    if created_by_user_id is not None:
        profile = await get_or_create_profile(db, created_by_user_id)

    slug = await _unique_slug(db, _slugify(data.name))
    join_code = await _unique_join_code(db)
    org = Organization(name=data.name, slug=slug, logo_url=data.logo_url, join_code=join_code)
    db.add(org)
    await db.flush()  # get org.id

    if profile is not None:
        profile.organization_id = org.id

    await db.commit()
    await db.refresh(org)
    return org


async def get_organization(db: AsyncSession, org_id: UUID) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    return result.scalar_one_or_none()


async def get_organization_by_join_code(db: AsyncSession, code: str) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.join_code == code))
    return result.scalar_one_or_none()


async def join_organization(db: AsyncSession, user_id: UUID, code: str) -> RecruiterProfile:
    """Join org by join_code. Idempotent if already a member.

    Raises ValueError on bad code or already_in_org (different org).
    """
    org = await get_organization_by_join_code(db, code)
    if org is None:
        raise ValueError("invalid_code")
    profile = await get_or_create_profile(db, user_id)
    if profile.organization_id == org.id:
        return profile  # already member — idempotent
    if profile.organization_id is not None:
        raise ValueError("already_in_org")  # already in a different org
    profile.organization_id = org.id
    await db.commit()
    await db.refresh(profile)
    return profile


async def regenerate_join_code(db: AsyncSession, org: Organization) -> Organization:
    org.join_code = await _unique_join_code(db)
    await db.commit()
    await db.refresh(org)
    return org


async def list_org_members(db: AsyncSession, org_id: UUID) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(RecruiterProfile, User.email)
        .join(User, User.id == RecruiterProfile.user_id)
        .where(RecruiterProfile.organization_id == org_id)
    )
    return [
        {
            "user_id": row.RecruiterProfile.user_id,
            "email": row.email,
            "first_name": row.RecruiterProfile.first_name,
            "last_name": row.RecruiterProfile.last_name,
            "job_title": row.RecruiterProfile.job_title,
        }
        for row in rows.all()
    ]


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
                access_policy.active_grant_clause(),
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
        # Un candidat "both" (Freelance ou CDI) doit ressortir des recherches
        # freelance comme des recherches cdi.
        if contract_type in (ContractType.FREELANCE, ContractType.CDI):
            self._stmt = self._stmt.where(
                CandidateProfile.contract_type.in_([contract_type, ContractType.BOTH])
            )
        else:
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
                select(CandidateSkill.id).where(
                    CandidateSkill.candidate_id == CandidateProfile.id,
                    exists(
                        select(SkillReference.id).where(
                            SkillReference.id == CandidateSkill.skill_ref_id,
                            func.lower(SkillReference.name).contains(skill.lower()),
                        )
                    ),
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

    # Add profile_id to the select so we can load experiences
    stmt = builder.build().add_columns(CandidateProfile.id.label("profile_id"))
    result = await db.execute(stmt)
    rows = result.all()

    profile_ids = [row.profile_id for row in rows if row.profile_id is not None]
    experiences_by_profile = await _batch_load_experiences(db, profile_ids)
    return assemble_accessible_candidates(rows, experiences_by_profile)


async def _batch_load_experiences(
    db: AsyncSession, profile_ids: list[UUID]
) -> dict[UUID, list[Experience]]:
    """Experiences (+ achievements + skill usages) de tous les profils en une requete."""
    experiences_by_profile: dict[UUID, list[Experience]] = {}
    if not profile_ids:
        return experiences_by_profile
    exp_result = await db.execute(
        select(Experience)
        .where(Experience.profile_id.in_(profile_ids))
        .options(
            selectinload(Experience.achievements)
            .selectinload(Achievement.skill_tags)
            .selectinload(AchievementSkillTag.skill_ref),
            selectinload(Experience.skill_usages).selectinload(ExperienceSkillUsage.skill_ref),
        )
        .order_by(Experience.start_date.desc())
    )
    for exp in exp_result.scalars().all():
        experiences_by_profile.setdefault(exp.profile_id, []).append(exp)
    return experiences_by_profile


def assemble_accessible_candidates(
    rows: Sequence[Any],
    experiences_by_profile: dict[UUID, list[Experience]],
) -> list[dict[str, Any]]:
    """Mise en forme pure du dossier accessible. Aucune I/O."""
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
            "experiences": experiences_by_profile.get(row.profile_id, []),
        }
        for row in rows
    ]
