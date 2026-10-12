# backend/tests/integration/test_dossier_api.py
"""Dossier APIs (slice 2): candidate and recruiter CRUD + selections + generate.

The recruiter composes a presentation over the candidate's L2 evidence but never
mutates it. Selections are full-list replace payloads, ordered by position. Writes
referencing a vetoed or foreign id are rejected (decision #7). A recruiter dossier
requires a live grant (decision #6).
"""

import io
from uuid import UUID

from docx import Document  # type: ignore[import-untyped,unused-ignore]
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.dossier_snapshot import GeneratedDossierSnapshot
from models.invitation import AccessGrant, AccessGrantExclusion, ExclusionTargetType


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


# --- candidate CRUD + metadata ------------------------------------------------


async def test_candidate_creates_and_gets_dossier(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/dossiers",
        headers=candidate_headers,
        json={"name": "Version data", "objectif": "Poste data engineer"},
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["name"] == "Version data"
    assert body["objectif"] == "Poste data engineer"
    assert body["owner_type"] == "candidate"
    assert body["is_general"] is False

    got = await client.get(f"/dossiers/{body['id']}", headers=candidate_headers)
    assert got.status_code == 200
    assert got.json()["id"] == body["id"]


async def test_candidate_lists_only_own_dossiers(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    await client.post("/dossiers", headers=candidate_headers, json={"name": "Mine"})
    await client.post("/dossiers", headers=second_candidate_headers, json={"name": "Theirs"})

    listed = await client.get("/dossiers", headers=candidate_headers)
    assert listed.status_code == 200
    names = [d["name"] for d in listed.json()]
    assert names == ["Mine"]


async def test_candidate_updates_metadata(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "Draft"})
    dossier_id = created.json()["id"]

    patched = await client.patch(
        f"/dossiers/{dossier_id}",
        headers=candidate_headers,
        json={
            "name": "Final",
            "accroche": "Ingenieur passionne",
            "share_contact": False,
            "share_finances": False,
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["name"] == "Final"
    assert body["accroche"] == "Ingenieur passionne"
    assert body["share_contact"] is False
    assert body["share_finances"] is False


async def test_candidate_cannot_get_foreign_dossier(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "Secret"})
    dossier_id = created.json()["id"]

    got = await client.get(f"/dossiers/{dossier_id}", headers=second_candidate_headers)
    assert got.status_code == 403


# --- selection replace --------------------------------------------------------


async def test_replace_experience_selections_is_ordered_and_idempotent(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_a = await _create_experience(client, candidate_headers, "Alpha", "2020-01-01")
    exp_b = await _create_experience(client, candidate_headers, "Beta", "2022-01-01")
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "Sel"})
    dossier_id = created.json()["id"]

    payload = [
        {"experience_id": exp_b, "is_featured": True},
        {"experience_id": exp_a},
    ]
    first = await client.put(
        f"/dossiers/{dossier_id}/experiences", headers=candidate_headers, json=payload
    )
    assert first.status_code == 200, first.text
    sels = first.json()["experience_selections"]
    assert [s["experience_id"] for s in sels] == [exp_b, exp_a]
    assert [s["position"] for s in sels] == [0, 1]
    assert sels[0]["is_featured"] is True

    # Idempotent full-list replace: same payload yields the same two rows.
    second = await client.put(
        f"/dossiers/{dossier_id}/experiences", headers=candidate_headers, json=payload
    )
    assert second.status_code == 200
    assert len(second.json()["experience_selections"]) == 2


async def test_replace_skill_selections_orders_by_index(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    skill_py = await _create_skill(client, candidate_headers, "Python")
    skill_go = await _create_skill(client, candidate_headers, "Go")
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "Skills"})
    dossier_id = created.json()["id"]

    r = await client.put(
        f"/dossiers/{dossier_id}/skills",
        headers=candidate_headers,
        json=[{"candidate_skill_id": skill_go}, {"candidate_skill_id": skill_py}],
    )
    assert r.status_code == 200, r.text
    sels = r.json()["skill_selections"]
    assert [s["candidate_skill_id"] for s in sels] == [skill_go, skill_py]


async def test_replace_rejects_foreign_experience(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    foreign = await _create_experience(client, second_candidate_headers, "Foreign", "2021-01-01")
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "X"})
    dossier_id = created.json()["id"]

    r = await client.put(
        f"/dossiers/{dossier_id}/experiences",
        headers=candidate_headers,
        json=[{"experience_id": foreign}],
    )
    assert r.status_code == 422, r.text


# --- recruiter (grant-scoped) -------------------------------------------------


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
    org = await client.post("/organizations", headers=recruiter_headers, json={"name": "ApiCorp"})
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


async def test_recruiter_creates_grant_scoped_dossier(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)

    created = await client.post(
        "/dossiers",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "organization_id": org_id, "name": "Pour mission"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["owner_type"] == "recruiter"
    assert body["organization_id"] == org_id
    assert body["access_grant_id"] is not None


async def test_recruiter_without_grant_is_rejected(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    # An org and a candidate, but no invitation accepted: no live grant.
    org = await client.post("/organizations", headers=recruiter_headers, json={"name": "NoGrant"})
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile", headers=recruiter_headers, json={"organization_id": org_id}
    )
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    candidate_id = profile.json()["user_id"]

    created = await client.post(
        "/dossiers",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "organization_id": org_id, "name": "X"},
    )
    assert created.status_code == 403, created.text


async def test_composition_pool_excludes_vetoed_experience(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    keep = await _create_experience(client, candidate_headers, "Keep", "2020-01-01")
    vetoed = await _create_experience(client, candidate_headers, "Vetoed", "2022-01-01")

    created = await client.post(
        "/dossiers",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "organization_id": org_id, "name": "Pool"},
    )
    dossier_id = created.json()["id"]
    grant = (
        await db_session.execute(
            select(AccessGrant).where(AccessGrant.candidate_id == candidate_id)
        )
    ).scalar_one()
    db_session.add(
        AccessGrantExclusion(
            grant_id=grant.id,
            target_type=ExclusionTargetType.EXPERIENCE,
            target_id=UUID(vetoed),
        )
    )
    await db_session.commit()

    pool = await client.get(f"/dossiers/{dossier_id}/composition-pool", headers=recruiter_headers)
    assert pool.status_code == 200, pool.text
    ids = [item["experience_id"] for item in pool.json()]
    assert keep in ids
    assert vetoed not in ids

    # And a write selecting the vetoed experience is rejected (decision #7).
    r = await client.put(
        f"/dossiers/{dossier_id}/experiences",
        headers=recruiter_headers,
        json=[{"experience_id": vetoed}],
    )
    assert r.status_code == 422, r.text


# --- generate-from-dossier ----------------------------------------------------


async def test_generate_from_candidate_dossier_creates_document_and_snapshot(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await client.get("/candidates/me/profile", headers=candidate_headers)
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "Gen"})
    dossier_id = created.json()["id"]

    r = await client.post(
        f"/dossiers/{dossier_id}/generate",
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
    assert str(snap.dossier_id) == dossier_id


# --- general (base) -----------------------------------------------------------


async def test_candidate_general_is_get_or_create_idempotent(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    first = await client.get("/dossiers/general", headers=candidate_headers)
    assert first.status_code == 200, first.text
    assert first.json()["is_general"] is True

    second = await client.get("/dossiers/general", headers=candidate_headers)
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


async def test_general_appears_in_list(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    general = await client.get("/dossiers/general", headers=candidate_headers)
    general_id = general.json()["id"]

    listed = await client.get("/dossiers", headers=candidate_headers)
    ids = [d["id"] for d in listed.json()]
    assert general_id in ids


async def test_recruiter_general_requires_grant(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    r = await client.get(
        f"/dossiers/general?organization_id={org_id}&candidate_id={candidate_id}",
        headers=recruiter_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["owner_type"] == "recruiter"
    assert r.json()["is_general"] is True


# --- delete -------------------------------------------------------------------


async def test_candidate_deletes_own_adapted_dossier(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "Jetable"})
    dossier_id = created.json()["id"]

    deleted = await client.delete(f"/dossiers/{dossier_id}", headers=candidate_headers)
    assert deleted.status_code == 204, deleted.text

    got = await client.get(f"/dossiers/{dossier_id}", headers=candidate_headers)
    assert got.status_code == 404


async def test_cannot_delete_general_dossier(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    # Materialise the general dossier, then try to delete it.
    general = await client.get("/dossiers/general", headers=candidate_headers)
    general_id = general.json()["id"]

    deleted = await client.delete(f"/dossiers/{general_id}", headers=candidate_headers)
    assert deleted.status_code == 422, deleted.text


async def test_candidate_cannot_delete_foreign_dossier(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    created = await client.post("/dossiers", headers=candidate_headers, json={"name": "Secret"})
    dossier_id = created.json()["id"]

    deleted = await client.delete(f"/dossiers/{dossier_id}", headers=second_candidate_headers)
    assert deleted.status_code == 403
