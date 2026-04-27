from typing import Literal
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.invitation import AccessGrant, AccessGrantStatus
from models.opportunity import Opportunity, ShortlistEntry
from models.user import User
from schemas.opportunity import (
    BulkGenerateResult,
    OpportunityCreate,
    OpportunityDetail,
    OpportunityUpdate,
    ShortlistCandidateInfo,
)
from services import generation_service

logger = structlog.get_logger()


async def create_opportunity(
    db: AsyncSession, organization_id: UUID, created_by: UUID, data: OpportunityCreate
) -> Opportunity:
    opp = Opportunity(
        organization_id=organization_id,
        created_by=created_by,
        title=data.title,
        description=data.description,
    )
    db.add(opp)
    await db.commit()
    await db.refresh(opp)
    return opp


async def list_opportunities(db: AsyncSession, organization_id: UUID) -> list[Opportunity]:
    result = await db.execute(
        select(Opportunity)
        .where(Opportunity.organization_id == organization_id)
        .order_by(Opportunity.created_at.desc())
    )
    return list(result.scalars().all())


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
) -> Opportunity:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(opp, field, value)
    await db.commit()
    await db.refresh(opp)
    return opp


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
    shortlist = [
        ShortlistCandidateInfo(
            user_id=row.User.id,
            email=row.User.email,
            first_name=row.CandidateProfile.first_name if row.CandidateProfile else None,
            last_name=row.CandidateProfile.last_name if row.CandidateProfile else None,
            title=row.CandidateProfile.title if row.CandidateProfile else None,
        )
        for row in result.all()
    ]

    return OpportunityDetail(
        id=opp.id,
        organization_id=opp.organization_id,
        title=opp.title,
        description=opp.description,
        status=opp.status,
        created_at=opp.created_at,
        updated_at=opp.updated_at,
        shortlist=shortlist,
    )


async def add_to_shortlist(
    db: AsyncSession, opportunity_id: UUID, organization_id: UUID, candidate_id: UUID
) -> ShortlistEntry:
    grant_result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.candidate_id == candidate_id,
            AccessGrant.organization_id == organization_id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
    )
    if grant_result.scalar_one_or_none() is None:
        raise ValueError("no_active_grant")

    entry = ShortlistEntry(opportunity_id=opportunity_id, candidate_id=candidate_id)
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError as err:
        await db.rollback()
        raise ValueError("duplicate_entry") from err
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
    template_id: UUID,
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
                candidate_id=entry.candidate_id,
                generated_by_user_id=generated_by_user_id,
                fmt=fmt,
            )
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="ok", doc_id=doc.id)
            )
        except (FileNotFoundError, ValueError, KeyError) as e:
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="error", error=str(e))
            )
        except Exception:
            logger.exception(
                "bulk_generate.unexpected_error",
                opportunity_id=str(opportunity_id),
                candidate_id=str(entry.candidate_id),
            )
            raise
    return results
