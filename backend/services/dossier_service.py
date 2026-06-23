# backend/services/dossier_service.py
"""Dossier lifecycle beyond resolution (#67): validation and candidate visibility.

Validation is optional and at the recruiter's initiative (a reassurance tool, not
a consent gate). The candidate sees the snapshots produced about them and can veto
future sends; a veto is promoted to an opposable exclusion (ADR-0002).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.dossier import Dossier, DossierOwnerType
from models.dossier_snapshot import GeneratedDossierSnapshot
from models.invitation import AccessGrantExclusion, ExclusionTargetType


async def _get_or_create_general(
    db: AsyncSession, lookup: Select[tuple[Dossier]], build: Callable[[], Dossier]
) -> Dossier:
    """Return the existing general dossier or create it, race-safe via the index.

    The partial unique index makes a concurrent insert fail; we catch it, roll the
    savepoint back and re-read the row the winner created.
    """
    existing = (await db.execute(lookup)).scalar_one_or_none()
    if existing is not None:
        return existing
    dossier = build()
    try:
        async with db.begin_nested():
            db.add(dossier)
            await db.flush()
    except IntegrityError:
        return (await db.execute(lookup)).scalar_one()
    return dossier


async def get_or_create_general_candidate(
    db: AsyncSession, *, candidate_profile_id: UUID, candidate_owner_id: UUID
) -> Dossier:
    """The candidate's single general dossier (one per profile, locked decision #2)."""
    lookup = select(Dossier).where(
        Dossier.is_general.is_(True),
        Dossier.owner_type == DossierOwnerType.CANDIDATE,
        Dossier.candidate_profile_id == candidate_profile_id,
    )
    return await _get_or_create_general(
        db,
        lookup,
        lambda: Dossier(
            candidate_profile_id=candidate_profile_id,
            owner_type=DossierOwnerType.CANDIDATE,
            candidate_owner_id=candidate_owner_id,
            is_general=True,
        ),
    )


async def get_or_create_general_recruiter(
    db: AsyncSession,
    *,
    candidate_profile_id: UUID,
    organization_id: UUID,
    access_grant_id: UUID,
    recruiter_owner_id: UUID,
) -> Dossier:
    """The recruiter's single general dossier for a grant (one per grant, decision #5)."""
    lookup = select(Dossier).where(
        Dossier.is_general.is_(True),
        Dossier.owner_type == DossierOwnerType.RECRUITER,
        Dossier.access_grant_id == access_grant_id,
    )
    return await _get_or_create_general(
        db,
        lookup,
        lambda: Dossier(
            candidate_profile_id=candidate_profile_id,
            organization_id=organization_id,
            access_grant_id=access_grant_id,
            owner_type=DossierOwnerType.RECRUITER,
            recruiter_owner_id=recruiter_owner_id,
            is_general=True,
        ),
    )


async def validate_dossier(db: AsyncSession, dossier: Dossier, *, user_id: UUID) -> Dossier:
    """Mark a dossier validated by the recruiter. Optional, not a send gate."""
    dossier.validated_at = datetime.now(UTC)
    dossier.validated_by = user_id
    await db.flush()
    await db.refresh(dossier)
    return dossier


async def list_candidate_snapshots(
    db: AsyncSession, candidate_user_id: UUID
) -> list[GeneratedDossierSnapshot]:
    """Snapshots produced about a candidate, for their post-hoc visibility."""
    result = await db.execute(
        select(GeneratedDossierSnapshot)
        .join(Dossier, GeneratedDossierSnapshot.dossier_id == Dossier.id)
        .join(CandidateProfile, Dossier.candidate_profile_id == CandidateProfile.id)
        .where(CandidateProfile.user_id == candidate_user_id)
        .order_by(GeneratedDossierSnapshot.generated_at.desc())
    )
    return list(result.scalars().all())


async def veto_experience(
    db: AsyncSession, *, grant_id: UUID, experience_id: UUID
) -> AccessGrantExclusion:
    """Promote a candidate veto into an opposable exclusion on the grant.

    The veto blocks future sends; it does not undo snapshots already produced.
    """
    exclusion = AccessGrantExclusion(
        grant_id=grant_id,
        target_type=ExclusionTargetType.EXPERIENCE,
        target_id=experience_id,
    )
    db.add(exclusion)
    await db.flush()
    await db.refresh(exclusion)
    return exclusion
