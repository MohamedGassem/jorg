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

from sqlalchemy import Select, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.exceptions import BusinessRuleError, ForbiddenError
from models.candidate_profile import CandidateProfile, Experience
from models.dossier import (
    Dossier,
    DossierExperienceSelection,
    DossierOwnerType,
    DossierSkillSelection,
)
from models.dossier_snapshot import GeneratedDossierSnapshot
from models.invitation import (
    AccessGrant,
    AccessGrantExclusion,
    ExclusionTargetType,
)
from models.skill import CandidateSkill
from services import access_policy
from services.documents.consent_policy import ConsentPolicy


async def require_live_grant(db: AsyncSession, access_grant_id: UUID | None) -> AccessGrant:
    """A recruiter dossier operates only through a live grant (locked decision #6).

    Enforced here, in the service layer, because ``access_grant_id`` is
    ON DELETE SET NULL: no DB constraint can express the rule, so the guard
    travels with every recruiter write instead of living only at the API boundary.
    """
    if access_grant_id is None:
        raise ForbiddenError("recruiter dossier requires a live access grant")
    grant = (
        await db.execute(select(AccessGrant).where(AccessGrant.id == access_grant_id))
    ).scalar_one_or_none()
    if grant is None or not access_policy.is_live(grant):
        raise ForbiddenError("recruiter dossier requires a live access grant")
    return grant


def _is_recruiter(dossier: Dossier) -> bool:
    return dossier.owner_type == DossierOwnerType.RECRUITER


async def load_consent_policy(db: AsyncSession, dossier: Dossier) -> ConsentPolicy:
    """The opposable consent envelope for a dossier (decision #7).

    The single loader for the envelope: the render, freeze, and composition
    paths all read their projection from the value object it returns, so a
    candidate veto is enforced identically wherever it is consulted.
    """
    if dossier.access_grant_id is None:
        return ConsentPolicy.from_candidate_dossier(dossier)
    grant = (
        await db.execute(select(AccessGrant).where(AccessGrant.id == dossier.access_grant_id))
    ).scalar_one()
    exclusions = (
        (
            await db.execute(
                select(AccessGrantExclusion).where(AccessGrantExclusion.grant_id == grant.id)
            )
        )
        .scalars()
        .all()
    )
    return ConsentPolicy.from_grant(grant, exclusions)


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


async def load_with_selections(db: AsyncSession, dossier_id: UUID) -> Dossier | None:
    """Load a dossier with its selections eager-loaded for serialization."""
    result = await db.execute(
        select(Dossier)
        .where(Dossier.id == dossier_id)
        .options(
            selectinload(Dossier.experience_selections),
            selectinload(Dossier.skill_selections),
        )
        # Refresh collections on an already-identity-mapped Dossier; otherwise a
        # collection loaded earlier (e.g. empty at create) would shadow new rows.
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def delete_dossier(db: AsyncSession, dossier: Dossier) -> None:
    """Delete an adapted dossier. The general dossier (the base) is not deletable.

    Child rows (selections, snapshots) are removed by the ON DELETE CASCADE FKs.
    """
    if dossier.is_general:
        raise BusinessRuleError("the base dossier cannot be deleted")
    await db.delete(dossier)
    await db.flush()


async def create_candidate_dossier(
    db: AsyncSession,
    *,
    candidate_profile_id: UUID,
    candidate_owner_id: UUID,
    name: str | None,
    objectif: str | None,
    accroche: str | None,
    share_contact: bool,
    share_finances: bool,
) -> Dossier:
    """Create a candidate-owned adapted dossier (is_general stays false)."""
    dossier = Dossier(
        candidate_profile_id=candidate_profile_id,
        owner_type=DossierOwnerType.CANDIDATE,
        candidate_owner_id=candidate_owner_id,
        name=name,
        objectif=objectif,
        accroche=accroche,
        share_contact=share_contact,
        share_finances=share_finances,
    )
    db.add(dossier)
    await db.flush()
    loaded = await load_with_selections(db, dossier.id)
    assert loaded is not None
    return loaded


async def create_recruiter_dossier(
    db: AsyncSession,
    *,
    candidate_profile_id: UUID,
    organization_id: UUID,
    access_grant_id: UUID,
    recruiter_owner_id: UUID,
    name: str | None,
    objectif: str | None,
    accroche: str | None,
    share_contact: bool,
    share_finances: bool,
) -> Dossier:
    """Create a recruiter-owned adapted dossier bound to a live grant (decision #6)."""
    await require_live_grant(db, access_grant_id)
    dossier = Dossier(
        candidate_profile_id=candidate_profile_id,
        organization_id=organization_id,
        access_grant_id=access_grant_id,
        owner_type=DossierOwnerType.RECRUITER,
        recruiter_owner_id=recruiter_owner_id,
        name=name,
        objectif=objectif,
        accroche=accroche,
        share_contact=share_contact,
        share_finances=share_finances,
    )
    db.add(dossier)
    await db.flush()
    loaded = await load_with_selections(db, dossier.id)
    assert loaded is not None
    return loaded


async def list_candidate_dossiers(db: AsyncSession, candidate_profile_id: UUID) -> list[Dossier]:
    """The candidate's own dossiers (general + adapted), newest first."""
    result = await db.execute(
        select(Dossier)
        .where(
            Dossier.owner_type == DossierOwnerType.CANDIDATE,
            Dossier.candidate_profile_id == candidate_profile_id,
        )
        .options(
            selectinload(Dossier.experience_selections),
            selectinload(Dossier.skill_selections),
        )
        .order_by(Dossier.created_at.desc())
    )
    return list(result.scalars().all())


async def list_recruiter_dossiers(db: AsyncSession, access_grant_id: UUID) -> list[Dossier]:
    """The recruiter's dossiers for one grant (general + adapted), newest first."""
    result = await db.execute(
        select(Dossier)
        .where(
            Dossier.owner_type == DossierOwnerType.RECRUITER,
            Dossier.access_grant_id == access_grant_id,
        )
        .options(
            selectinload(Dossier.experience_selections),
            selectinload(Dossier.skill_selections),
        )
        .order_by(Dossier.created_at.desc())
    )
    return list(result.scalars().all())


async def update_metadata(
    db: AsyncSession,
    dossier: Dossier,
    *,
    fields: dict[str, object],
) -> Dossier:
    """Apply only the provided metadata fields (PATCH semantics)."""
    for key, value in fields.items():
        setattr(dossier, key, value)
    await db.flush()
    loaded = await load_with_selections(db, dossier.id)
    assert loaded is not None
    return loaded


async def _profile_experience_ids(db: AsyncSession, candidate_profile_id: UUID) -> set[UUID]:
    rows = (
        await db.execute(select(Experience.id).where(Experience.profile_id == candidate_profile_id))
    ).scalars()
    return set(rows.all())


async def _profile_skill_ids(db: AsyncSession, candidate_profile_id: UUID) -> set[UUID]:
    rows = (
        await db.execute(
            select(CandidateSkill.id).where(CandidateSkill.candidate_id == candidate_profile_id)
        )
    ).scalars()
    return set(rows.all())


async def replace_experience_selections(
    db: AsyncSession,
    dossier: Dossier,
    items: list[tuple[UUID, bool]],
) -> Dossier:
    """Replace the whole experience selection list, ordered by array index.

    Rejects (422) any id not belonging to the dossier's candidate profile, or any
    experience the candidate vetoed on the grant (decision #7). The opposable veto
    is never composable by the recruiter.
    """
    if _is_recruiter(dossier):
        await require_live_grant(db, dossier.access_grant_id)
    owned = await _profile_experience_ids(db, dossier.candidate_profile_id)
    vetoed = (await load_consent_policy(db, dossier)).excluded_experience_ids
    for exp_id, _ in items:
        if exp_id not in owned:
            raise BusinessRuleError("experience does not belong to this candidate")
        if exp_id in vetoed:
            raise BusinessRuleError("experience was excluded by the candidate")

    await db.execute(
        delete(DossierExperienceSelection).where(
            DossierExperienceSelection.dossier_id == dossier.id
        )
    )
    for position, (exp_id, is_featured) in enumerate(items):
        db.add(
            DossierExperienceSelection(
                dossier_id=dossier.id,
                experience_id=exp_id,
                position=position,
                is_featured=is_featured,
            )
        )
    await db.flush()
    loaded = await load_with_selections(db, dossier.id)
    assert loaded is not None
    return loaded


async def replace_skill_selections(
    db: AsyncSession,
    dossier: Dossier,
    items: list[tuple[UUID, bool]],
) -> Dossier:
    """Replace the whole skill selection list, ordered by array index.

    Rejects (422) any candidate_skill id not belonging to the dossier's profile.
    """
    if _is_recruiter(dossier):
        await require_live_grant(db, dossier.access_grant_id)
    owned = await _profile_skill_ids(db, dossier.candidate_profile_id)
    for skill_id, _ in items:
        if skill_id not in owned:
            raise BusinessRuleError("skill does not belong to this candidate")

    await db.execute(
        delete(DossierSkillSelection).where(DossierSkillSelection.dossier_id == dossier.id)
    )
    for position, (skill_id, is_featured) in enumerate(items):
        db.add(
            DossierSkillSelection(
                dossier_id=dossier.id,
                candidate_skill_id=skill_id,
                position=position,
                is_featured=is_featured,
            )
        )
    await db.flush()
    loaded = await load_with_selections(db, dossier.id)
    assert loaded is not None
    return loaded


async def composition_pool(db: AsyncSession, dossier: Dossier) -> list[Experience]:
    """Non-vetoed experiences offered for composition (decision #7), date desc."""
    vetoed = (await load_consent_policy(db, dossier)).excluded_experience_ids
    result = await db.execute(
        select(Experience)
        .where(Experience.profile_id == dossier.candidate_profile_id)
        .order_by(Experience.start_date.desc())
    )
    return [exp for exp in result.scalars().all() if exp.id not in vetoed]


async def validate_dossier(db: AsyncSession, dossier: Dossier, *, user_id: UUID) -> Dossier:
    """Mark a dossier validated by the recruiter. Optional, not a send gate."""
    if _is_recruiter(dossier):
        await require_live_grant(db, dossier.access_grant_id)
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
