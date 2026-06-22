# backend/tests/integration/test_dossier_snapshot.py
"""Freezing a dossier at generation time (#67).

Invariant #7: a generated dossier does not change after generation. The snapshot
captures the resolved render model and the consent policy as they were; later
edits to the dossier never alter an existing snapshot, and regenerating produces
a new snapshot rather than mutating the old one.
"""

import json
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.dossier import Dossier, DossierExperienceSelection, DossierOwnerType
from services.documents.snapshot_service import create_dossier_snapshot


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


async def _dossier_with(profile: CandidateProfile, exp_id: UUID) -> Dossier:
    return Dossier(
        candidate_profile_id=profile.id,
        owner_type=DossierOwnerType.CANDIDATE,
        candidate_owner_id=profile.user_id,
        experience_selections=[DossierExperienceSelection(experience_id=exp_id, position=0)],
    )


async def test_snapshot_is_immutable_after_dossier_edit(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp = await _create_experience(client, candidate_headers, "FrozenClient")
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    dossier = await _dossier_with(profile, exp)
    db_session.add(dossier)
    await db_session.flush()

    snap1 = await create_dossier_snapshot(db_session, dossier)

    # The recruiter edits the dossier after the snapshot went out.
    dossier.experience_selections.clear()
    await db_session.flush()
    snap2 = await create_dossier_snapshot(db_session, dossier)

    assert "FrozenClient" in json.dumps(snap1.render_model_snapshot_json)
    # Regeneration is a new row; the first snapshot is untouched.
    assert snap1.id != snap2.id
    assert "FrozenClient" not in json.dumps(snap2.render_model_snapshot_json)


async def test_snapshot_captures_consent_policy(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp = await _create_experience(client, candidate_headers, "AnyClient")
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    dossier = await _dossier_with(profile, exp)
    db_session.add(dossier)
    await db_session.flush()

    snap = await create_dossier_snapshot(db_session, dossier)

    # The consent policy at generation time is frozen alongside the render model.
    assert "share_contact" in snap.consent_policy_snapshot_json
