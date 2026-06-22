# backend/tests/integration/test_consent_exclusions.py
"""Enriched consent envelope on AccessGrant (#66).

Invariant #6: an item the candidate has explicitly excluded never appears in an
outgoing dossier, even if the recruiter selected it. Only the excluded item is
opposable; a merely non-featured item stays showable.
"""

from datetime import UTC, datetime
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.dossier import Dossier, DossierExperienceSelection, DossierOwnerType
from models.invitation import (
    AccessGrant,
    AccessGrantExclusion,
    AccessGrantStatus,
    ExclusionTargetType,
)
from models.recruiter import Organization
from services.documents.generation_service import resolve_dossier


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


async def test_excluded_experience_never_appears_in_resolved_dossier(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    kept = await _create_experience(client, candidate_headers, "KeptClient")
    excluded = await _create_experience(client, candidate_headers, "CurrentEmployer")
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
    db_session.add(
        AccessGrantExclusion(
            grant_id=grant.id,
            target_type=ExclusionTargetType.EXPERIENCE,
            target_id=excluded,
        )
    )

    dossier = Dossier(
        candidate_profile_id=profile.id,
        owner_type=DossierOwnerType.CANDIDATE,
        candidate_owner_id=profile.user_id,
        access_grant_id=grant.id,
        experience_selections=[
            # The recruiter selected both, including the excluded one.
            DossierExperienceSelection(experience_id=excluded, position=0),
            DossierExperienceSelection(experience_id=kept, position=1),
        ],
    )
    db_session.add(dossier)
    await db_session.flush()

    model = await resolve_dossier(db_session, dossier)

    names = [e.client_name for e in model.experience_blocks]
    assert "CurrentEmployer" not in names
    assert names == ["KeptClient"]
