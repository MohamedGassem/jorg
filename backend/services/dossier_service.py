# backend/services/dossier_service.py
"""Dossier lifecycle beyond resolution (#67): validation and candidate visibility.

Validation is optional and at the recruiter's initiative (a reassurance tool, not
a consent gate). The candidate sees the snapshots produced about them and can veto
future sends; a veto is promoted to an opposable exclusion (ADR-0002).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.dossier import Dossier
from models.dossier_snapshot import GeneratedDossierSnapshot
from models.invitation import AccessGrantExclusion, ExclusionTargetType


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
