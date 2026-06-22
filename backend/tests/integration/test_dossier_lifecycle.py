# backend/tests/integration/test_dossier_lifecycle.py
"""Optional validation and candidate post-hoc visibility on dossiers (#67).

Validation is at the recruiter's initiative, a reassurance tool, not a gate.
The candidate sees the corpus of snapshots produced about them and can veto
future sends; a veto is promotable to an opposable exclusion (ADR-0002).
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.dossier import Dossier, DossierExperienceSelection, DossierOwnerType
from models.invitation import AccessGrant, AccessGrantStatus, ExclusionTargetType
from models.recruiter import Organization
from services.documents.snapshot_service import create_dossier_snapshot
from services.dossier_service import (
    list_candidate_snapshots,
    validate_dossier,
    veto_experience,
)


async def _create_experience(
    client: AsyncClient, headers: dict[str, str], client_name: str
) -> UUID:
    r = await client.post(
        "/candidates/me/experiences",
        headers=headers,
        json={"client_name": client_name, "role": "Dev", "start_date": "2021-01-01"},
    )
    assert r.status_code == 201, r.text
    return UUID(r.json()["id"])


async def _candidate_dossier(profile: CandidateProfile, exp_id: UUID) -> Dossier:
    return Dossier(
        candidate_profile_id=profile.id,
        owner_type=DossierOwnerType.CANDIDATE,
        candidate_owner_id=profile.user_id,
        experience_selections=[DossierExperienceSelection(experience_id=exp_id, position=0)],
    )


async def test_validate_dossier_sets_validated_fields(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp = await _create_experience(client, candidate_headers, "C")
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    dossier = await _candidate_dossier(profile, exp)
    db_session.add(dossier)
    await db_session.flush()

    validated = await validate_dossier(db_session, dossier, user_id=profile.user_id)

    assert validated.validated_at is not None
    assert validated.validated_by == profile.user_id


async def test_candidate_sees_snapshots_about_them(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp = await _create_experience(client, candidate_headers, "C")
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    dossier = await _candidate_dossier(profile, exp)
    db_session.add(dossier)
    await db_session.flush()
    snap = await create_dossier_snapshot(db_session, dossier)

    snapshots = await list_candidate_snapshots(db_session, profile.user_id)

    assert snap.id in [s.id for s in snapshots]


async def test_veto_promotes_to_opposable_exclusion(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp = await _create_experience(client, candidate_headers, "C")
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    org = Organization(name="ESN", slug="esn")
    db_session.add(org)
    await db_session.flush()
    grant = AccessGrant(
        candidate_id=profile.user_id,
        organization_id=org.id,
        status=AccessGrantStatus.ACTIVE,
        granted_at=datetime.now(UTC),
    )
    db_session.add(grant)
    await db_session.flush()

    exclusion = await veto_experience(db_session, grant_id=grant.id, experience_id=exp)

    assert exclusion.grant_id == grant.id
    assert exclusion.target_type == ExclusionTargetType.EXPERIENCE
    assert exclusion.target_id == exp


async def test_list_candidate_snapshots_excludes_other_candidates(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp = await _create_experience(client, candidate_headers, "C")
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    dossier = await _candidate_dossier(profile, exp)
    db_session.add(dossier)
    await db_session.flush()
    await create_dossier_snapshot(db_session, dossier)

    # A different candidate sees none of this candidate's snapshots.
    snapshots = await list_candidate_snapshots(db_session, uuid4())

    assert snapshots == []
