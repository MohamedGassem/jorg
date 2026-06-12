from typing import Literal
from uuid import UUID

import structlog
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import services.documents.generation_service as generation_service
from core.exceptions import ConflictError, ForbiddenError, JorgError
from models.candidate_profile import CandidateProfile
from models.invitation import AccessGrant
from models.opportunity import Opportunity, OpportunitySkillRequirement, ShortlistEntry
from models.skill import CandidateSkill, SkillReference
from models.user import User
from schemas.opportunity import (
    BulkGenerateResult,
    OpportunityCreate,
    OpportunityDetail,
    OpportunityRead,
    OpportunitySkillOut,
    OpportunityUpdate,
    ShortlistCandidateInfo,
)
from services import access_policy

logger = structlog.get_logger()


def compute_match_score(candidate_ref_ids: set[UUID], required_ref_ids: set[UUID]) -> int | None:
    if not required_ref_ids:
        return None
    return round(100 * len(candidate_ref_ids & required_ref_ids) / len(required_ref_ids))


async def _load_required_skills(
    db: AsyncSession, opportunity_ids: list[UUID]
) -> dict[UUID, list[OpportunitySkillOut]]:
    """Load required skills for the given opportunities in one query (avoids N+1)."""
    by_opp: dict[UUID, list[OpportunitySkillOut]] = {oid: [] for oid in opportunity_ids}
    if not opportunity_ids:
        return by_opp
    result = await db.execute(
        select(
            OpportunitySkillRequirement.opportunity_id,
            SkillReference.id,
            SkillReference.name,
        )
        .join(SkillReference, SkillReference.id == OpportunitySkillRequirement.skill_ref_id)
        .where(OpportunitySkillRequirement.opportunity_id.in_(opportunity_ids))
    )
    for opp_id, skill_ref_id, name in result.all():
        by_opp[opp_id].append(OpportunitySkillOut(skill_ref_id=skill_ref_id, name=name))
    return by_opp


def _build_read(opp: Opportunity, skills: list[OpportunitySkillOut]) -> OpportunityRead:
    """Map an Opportunity and its required skills into an OpportunityRead."""
    return OpportunityRead(
        id=opp.id,
        organization_id=opp.organization_id,
        title=opp.title,
        description=opp.description,
        status=opp.status,
        created_at=opp.created_at,
        updated_at=opp.updated_at,
        required_skills=skills,
    )


async def _to_read(db: AsyncSession, opp: Opportunity) -> OpportunityRead:
    """Hydrate a single opportunity into an OpportunityRead with its required skills."""
    skills = (await _load_required_skills(db, [opp.id]))[opp.id]
    return _build_read(opp, skills)


async def _sync_required_skills(
    db: AsyncSession, opportunity_id: UUID, skill_ref_ids: list[UUID]
) -> None:
    """Replace the opportunity's required-skill rows with the given set."""
    await db.execute(
        delete(OpportunitySkillRequirement).where(
            OpportunitySkillRequirement.opportunity_id == opportunity_id
        )
    )
    for skill_ref_id in set(skill_ref_ids):
        db.add(
            OpportunitySkillRequirement(opportunity_id=opportunity_id, skill_ref_id=skill_ref_id)
        )


async def create_opportunity(
    db: AsyncSession, organization_id: UUID, created_by: UUID, data: OpportunityCreate
) -> OpportunityRead:
    opp = Opportunity(
        organization_id=organization_id,
        created_by=created_by,
        title=data.title,
        description=data.description,
    )
    db.add(opp)
    await db.flush()
    await _sync_required_skills(db, opp.id, data.skill_ref_ids)
    await db.commit()
    await db.refresh(opp)
    return await _to_read(db, opp)


async def list_opportunities(db: AsyncSession, organization_id: UUID) -> list[OpportunityRead]:
    result = await db.execute(
        select(Opportunity)
        .where(Opportunity.organization_id == organization_id)
        .order_by(Opportunity.created_at.desc())
    )
    opps = list(result.scalars().all())
    skills_by_opp = await _load_required_skills(db, [opp.id for opp in opps])
    return [_build_read(opp, skills_by_opp.get(opp.id, [])) for opp in opps]


async def get_opportunity(
    db: AsyncSession, opportunity_id: UUID, organization_id: UUID
) -> Opportunity | None:
    result = await db.execute(
        select(Opportunity).where(
            Opportunity.id == opportunity_id,
            Opportunity.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def update_opportunity(
    db: AsyncSession, opp: Opportunity, data: OpportunityUpdate
) -> OpportunityRead:
    fields = data.model_dump(exclude_unset=True)
    skill_ref_ids = fields.pop("skill_ref_ids", None)
    for field, value in fields.items():
        setattr(opp, field, value)
    # skill_ref_ids is None means "leave unchanged"; [] means "clear".
    if skill_ref_ids is not None:
        await _sync_required_skills(db, opp.id, skill_ref_ids)
    await db.commit()
    await db.refresh(opp)
    return await _to_read(db, opp)


async def get_opportunity_detail(
    db: AsyncSession, opportunity_id: UUID, organization_id: UUID
) -> OpportunityDetail | None:
    opp = await get_opportunity(db, opportunity_id, organization_id)
    if opp is None:
        return None

    result = await db.execute(
        select(User, CandidateProfile, ShortlistEntry)
        .join(ShortlistEntry, ShortlistEntry.candidate_id == User.id)
        .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
        .where(ShortlistEntry.opportunity_id == opportunity_id)
        .order_by(ShortlistEntry.created_at)
    )
    rows = result.all()

    required_skills = (await _load_required_skills(db, [opportunity_id]))[opportunity_id]
    required_ref_ids = {s.skill_ref_id for s in required_skills}

    # Load every shortlisted candidate's skill refs in one query, grouped per user.
    user_ids = [row.User.id for row in rows]
    skills_by_user: dict[UUID, set[UUID]] = {uid: set() for uid in user_ids}
    if user_ids:
        skill_rows = await db.execute(
            select(CandidateProfile.user_id, CandidateSkill.skill_ref_id)
            .join(CandidateSkill, CandidateSkill.candidate_id == CandidateProfile.id)
            .where(CandidateProfile.user_id.in_(user_ids))
        )
        for user_id, skill_ref_id in skill_rows.all():
            skills_by_user.setdefault(user_id, set()).add(skill_ref_id)

    shortlist = [
        ShortlistCandidateInfo(
            user_id=row.User.id,
            email=row.User.email,
            first_name=row.CandidateProfile.first_name if row.CandidateProfile else None,
            last_name=row.CandidateProfile.last_name if row.CandidateProfile else None,
            title=row.CandidateProfile.title if row.CandidateProfile else None,
            match_score=compute_match_score(
                skills_by_user.get(row.User.id, set()), required_ref_ids
            ),
        )
        for row in rows
    ]

    return OpportunityDetail(
        id=opp.id,
        organization_id=opp.organization_id,
        title=opp.title,
        description=opp.description,
        status=opp.status,
        created_at=opp.created_at,
        updated_at=opp.updated_at,
        required_skills=required_skills,
        shortlist=shortlist,
    )


async def add_to_shortlist(
    db: AsyncSession, opportunity_id: UUID, organization_id: UUID, candidate_id: UUID
) -> ShortlistEntry:
    grant_result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.candidate_id == candidate_id,
            AccessGrant.organization_id == organization_id,
            access_policy.active_grant_clause(),
        )
    )
    if grant_result.scalar_one_or_none() is None:
        raise ForbiddenError("no_active_grant")

    entry = ShortlistEntry(opportunity_id=opportunity_id, candidate_id=candidate_id)
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError as err:
        await db.rollback()
        raise ConflictError("already_in_shortlist") from err
    await db.refresh(entry)
    return entry


async def remove_from_shortlist(db: AsyncSession, opportunity_id: UUID, candidate_id: UUID) -> bool:
    result = await db.execute(
        select(ShortlistEntry).where(
            ShortlistEntry.opportunity_id == opportunity_id,
            ShortlistEntry.candidate_id == candidate_id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return False
    await db.delete(entry)
    await db.commit()
    return True


async def bulk_generate(
    db: AsyncSession,
    opportunity_id: UUID,
    organization_id: UUID,
    template_id: UUID | None,
    system_template_key: str | None,
    generated_by_user_id: UUID,
    fmt: Literal["docx", "pdf"],
) -> list[BulkGenerateResult]:
    entries_result = await db.execute(
        select(ShortlistEntry).where(ShortlistEntry.opportunity_id == opportunity_id)
    )
    entries = list(entries_result.scalars().all())

    results: list[BulkGenerateResult] = []
    for entry in entries:
        try:
            doc = await generation_service.generate_for_candidate(
                db,
                organization_id=organization_id,
                template_id=template_id,
                system_template_key=system_template_key,
                candidate_id=entry.candidate_id,
                generated_by_user_id=generated_by_user_id,
                fmt=fmt,
            )
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="ok", doc_id=doc.id)
            )
        except (FileNotFoundError, KeyError) as e:
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="error", error=str(e))
            )
        except JorgError as e:
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="error", error=e.detail)
            )
        except Exception:
            logger.exception(
                "bulk_generate.unexpected_error",
                opportunity_id=str(opportunity_id),
                candidate_id=str(entry.candidate_id),
            )
            results.append(
                BulkGenerateResult(
                    candidate_id=entry.candidate_id,
                    status="error",
                    error="unexpected error during generation",
                )
            )
    return results
