# backend/tests/integration/test_general_dossier.py
"""The general dossier is the single live mirror of the profile (locked decision #1/#2).

``get_or_create_general`` returns the one general dossier for an owner, creating it
on first call and reusing it afterwards. The partial unique indexes bound it to one
per candidate profile and one per recruiter access_grant.
"""

import io
from uuid import UUID

import pytest
from docx import Document  # type: ignore[import-untyped,unused-ignore]
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ForbiddenError
from models.candidate_profile import CandidateProfile
from models.dossier import Dossier, DossierOwnerType
from models.dossier_snapshot import GeneratedDossierSnapshot
from models.invitation import AccessGrant, AccessGrantStatus
from services.dossier_service import (
    create_recruiter_dossier,
    get_or_create_general_candidate,
    replace_experience_selections,
)


async def test_general_candidate_dossier_created_then_reused(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await client.get("/candidates/me/profile", headers=candidate_headers)
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()

    first = await get_or_create_general_candidate(
        db_session, candidate_profile_id=profile.id, candidate_owner_id=profile.user_id
    )
    await db_session.flush()
    second = await get_or_create_general_candidate(
        db_session, candidate_profile_id=profile.id, candidate_owner_id=profile.user_id
    )

    assert first.is_general is True
    # Reused, not duplicated.
    assert first.id == second.id


def _make_docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def _setup_org_with_grant(
    client: AsyncClient, recruiter_headers: dict[str, str], candidate_headers: dict[str, str]
) -> tuple[str, str]:
    org = await client.post("/organizations", headers=recruiter_headers, json={"name": "GenCorp"})
    org_id: str = org.json()["id"]
    await client.put(
        "/recruiters/me/profile", headers=recruiter_headers, json={"organization_id": org_id}
    )
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    candidate_id: str = profile.json()["user_id"]
    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    token = inv.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    return org_id, candidate_id


async def _upload_valid_template(
    client: AsyncClient, recruiter_headers: dict[str, str], org_id: str
) -> str:
    docx_bytes = _make_docx_bytes(["Nom: {{last_name}}", "Titre: {{title}}"])
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "CV Template"},
        files={
            "file": (
                "t.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    return str(r.json()["id"])


async def test_self_generation_routes_through_general_dossier_and_links_snapshot(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await client.get("/candidates/me/profile", headers=candidate_headers)

    r = await client.post(
        "/candidates/me/generate",
        headers=candidate_headers,
        json={"system_template_key": "compact_esn", "format": "docx"},
    )
    assert r.status_code == 201, r.text
    doc_id = UUID(r.json()["id"])

    snap = (
        await db_session.execute(
            select(GeneratedDossierSnapshot).where(
                GeneratedDossierSnapshot.generated_document_id == doc_id
            )
        )
    ).scalar_one()
    dossier = (
        await db_session.execute(select(Dossier).where(Dossier.id == snap.dossier_id))
    ).scalar_one()
    assert dossier.is_general is True
    assert dossier.owner_type == DossierOwnerType.CANDIDATE
    assert dossier.access_grant_id is None


async def test_self_generation_reuses_one_general_dossier(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await client.get("/candidates/me/profile", headers=candidate_headers)
    body = {"system_template_key": "compact_esn", "format": "docx"}

    await client.post("/candidates/me/generate", headers=candidate_headers, json=body)
    await client.post("/candidates/me/generate", headers=candidate_headers, json=body)

    dossiers = (
        (await db_session.execute(select(Dossier).where(Dossier.is_general.is_(True))))
        .scalars()
        .all()
    )
    assert len(dossiers) == 1


async def test_recruiter_generation_routes_through_grant_bound_general_dossier(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)

    gen_body = {"candidate_id": candidate_id, "template_id": template_id, "format": "docx"}
    r1 = await client.post(
        f"/organizations/{org_id}/generate", headers=recruiter_headers, json=gen_body
    )
    assert r1.status_code == 201, r1.text
    doc_id = UUID(r1.json()["id"])
    # Reuse: a second send curates from the same grant-bound general dossier.
    r2 = await client.post(
        f"/organizations/{org_id}/generate", headers=recruiter_headers, json=gen_body
    )
    assert r2.status_code == 201, r2.text

    grant = (
        await db_session.execute(
            select(AccessGrant).where(AccessGrant.organization_id == UUID(org_id))
        )
    ).scalar_one()
    recruiter_dossiers = (
        (
            await db_session.execute(
                select(Dossier).where(
                    Dossier.is_general.is_(True),
                    Dossier.owner_type == DossierOwnerType.RECRUITER,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(recruiter_dossiers) == 1
    dossier = recruiter_dossiers[0]
    assert dossier.access_grant_id == grant.id

    snap = (
        await db_session.execute(
            select(GeneratedDossierSnapshot).where(
                GeneratedDossierSnapshot.generated_document_id == doc_id
            )
        )
    ).scalar_one()
    # Grant policy preserved: the snapshot froze the grant's consent envelope, not
    # the per-dossier booleans (a grant-only key proves the dossier is grant-bound).
    assert "identity_anonymized_to_client" in snap.consent_policy_snapshot_json


async def test_create_recruiter_dossier_requires_live_grant_in_service(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """The live-grant rule (decision #6) holds at the service boundary, not only
    in the route: creating a recruiter dossier on a dead grant is refused here."""
    org_id, _ = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    grant = (await db_session.execute(select(AccessGrant))).scalar_one()
    recruiter = await client.get("/recruiters/me/profile", headers=recruiter_headers)
    recruiter_user_id = UUID(recruiter.json()["user_id"])

    grant.status = AccessGrantStatus.REVOKED
    await db_session.flush()

    with pytest.raises(ForbiddenError):
        await create_recruiter_dossier(
            db_session,
            candidate_profile_id=profile.id,
            organization_id=UUID(org_id),
            access_grant_id=grant.id,
            recruiter_owner_id=recruiter_user_id,
            name=None,
            objectif=None,
            accroche=None,
            share_contact=True,
            share_finances=True,
        )


async def test_replace_selections_requires_live_grant_in_service(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """A recruiter mutation on a dossier whose grant has gone dead is refused at
    the service boundary (decision #6)."""
    org_id, _ = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    await db_session.commit()
    profile = (await db_session.execute(select(CandidateProfile))).scalar_one()
    grant = (await db_session.execute(select(AccessGrant))).scalar_one()
    recruiter = await client.get("/recruiters/me/profile", headers=recruiter_headers)
    recruiter_user_id = UUID(recruiter.json()["user_id"])

    dossier = await create_recruiter_dossier(
        db_session,
        candidate_profile_id=profile.id,
        organization_id=UUID(org_id),
        access_grant_id=grant.id,
        recruiter_owner_id=recruiter_user_id,
        name=None,
        objectif=None,
        accroche=None,
        share_contact=True,
        share_finances=True,
    )

    grant.status = AccessGrantStatus.REVOKED
    await db_session.flush()

    with pytest.raises(ForbiddenError):
        await replace_experience_selections(db_session, dossier, [])
