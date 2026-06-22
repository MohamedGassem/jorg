# backend/tests/integration/test_dossier_resolve.py
"""A Dossier (L3) resolves into a DossierRenderModel (#65).

The Dossier is a thin selection over L2 evidence: it filters to the referenced
items, orders them by ``position`` and applies the per-dossier highlight. It
never copies or rewrites L2 facts (ADR-0002), so the resolved model reflects the
unchanged L2 labels.
"""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.dossier import (
    Dossier,
    DossierExperienceSelection,
    DossierOwnerType,
    DossierSkillSelection,
)
from services.documents.generation_service import resolve_dossier


async def _create_experience(
    client: AsyncClient, headers: dict[str, str], client_name: str, start_date: str
) -> str:
    r = await client.post(
        "/candidates/me/experiences",
        headers=headers,
        json={"client_name": client_name, "role": "Dev", "start_date": start_date},
    )
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def _create_skill(client: AsyncClient, headers: dict[str, str], name: str) -> str:
    ref = await client.post(
        "/skill-references", headers=headers, json={"name": name, "kind": "technical"}
    )
    r = await client.post(
        "/candidates/me/skills",
        headers=headers,
        json={"skill_ref_id": ref.json()["id"]},
    )
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def _profile(db: AsyncSession) -> CandidateProfile:
    return (await db.execute(select(CandidateProfile))).scalar_one()


async def test_resolve_keeps_only_selected_evidence_in_position_order(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp_alpha = await _create_experience(client, candidate_headers, "Alpha", "2020-01-01")
    exp_beta = await _create_experience(client, candidate_headers, "Beta", "2022-01-01")
    _exp_gamma = await _create_experience(client, candidate_headers, "Gamma", "2023-01-01")
    skill_py = await _create_skill(client, candidate_headers, "Python")
    _skill_go = await _create_skill(client, candidate_headers, "Go")
    await db_session.commit()

    profile = await _profile(db_session)
    dossier = Dossier(
        candidate_profile_id=profile.id,
        owner_type=DossierOwnerType.CANDIDATE,
        candidate_owner_id=profile.user_id,
        experience_selections=[
            DossierExperienceSelection(experience_id=UUID(exp_beta), position=0),
            DossierExperienceSelection(experience_id=UUID(exp_alpha), position=1),
        ],
        skill_selections=[
            DossierSkillSelection(candidate_skill_id=UUID(skill_py), position=0, is_featured=True),
        ],
    )
    db_session.add(dossier)
    await db_session.flush()

    model = await resolve_dossier(db_session, dossier)

    # Gamma was not selected; Beta precedes Alpha by position, not by L2 date order.
    assert [e.client_name for e in model.experience_blocks] == ["Beta", "Alpha"]
    # Only the selected skill is present, with the per-dossier highlight applied.
    assert len(model.skills) == 1
    assert model.skills[0].featured is True


async def test_resolve_does_not_rewrite_l2_facts(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp_id = await _create_experience(client, candidate_headers, "TrueClient", "2021-01-01")
    await db_session.commit()

    profile = await _profile(db_session)
    dossier = Dossier(
        candidate_profile_id=profile.id,
        owner_type=DossierOwnerType.CANDIDATE,
        candidate_owner_id=profile.user_id,
        experience_selections=[
            DossierExperienceSelection(experience_id=UUID(exp_id), position=0),
        ],
    )
    db_session.add(dossier)
    await db_session.flush()

    model = await resolve_dossier(db_session, dossier)

    # The resolved model carries the L2 fact verbatim; the recruiter arranges,
    # never rewrites (ADR-0002).
    assert model.experience_blocks[0].client_name == "TrueClient"


async def test_owner_must_match_owner_type(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await client.get("/candidates/me/profile", headers=candidate_headers)
    await db_session.commit()
    profile = await _profile(db_session)

    # owner_type recruiter but a candidate owner set: the CHECK rejects it.
    bad = Dossier(
        candidate_profile_id=profile.id,
        owner_type=DossierOwnerType.RECRUITER,
        candidate_owner_id=profile.user_id,
    )
    db_session.add(bad)
    with pytest.raises(IntegrityError):
        await db_session.flush()
