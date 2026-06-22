# backend/tests/integration/test_candidate_skill_projection_api.py
from httpx import AsyncClient


async def _skill_ref(client: AsyncClient, headers: dict[str, str], name: str) -> str:
    r = await client.post(
        "/skill-references", headers=headers, json={"name": name, "kind": "technical"}
    )
    return str(r.json()["id"])


async def _experience(client: AsyncClient, headers: dict[str, str], description: str) -> str:
    r = await client.post(
        "/candidates/me/experiences",
        headers=headers,
        json={
            "client_name": "ProjCorp",
            "role": "Dev",
            "start_date": "2022-01-01",
            "end_date": "2023-01-01",
            "description": description,
        },
    )
    return str(r.json()["id"])


async def _projection_item(
    client: AsyncClient, headers: dict[str, str], skill_ref_id: str
) -> dict | None:
    r = await client.get("/candidates/me/skill-projection", headers=headers)
    assert r.status_code == 200
    return next((p for p in r.json() if p["skill_ref_id"] == skill_ref_id), None)


async def test_declared_skill_with_self_assessment_stays_declared_only(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    # Invariant #4 : self_assessed_level n'entre jamais dans le ranking
    ref_id = await _skill_ref(client, candidate_headers, "ProjDeclared")
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "self_assessed_level": "expert"},
    )
    assert r.status_code == 201

    item = await _projection_item(client, candidate_headers, ref_id)
    assert item is not None
    assert item["status"] == "declared_only"
    assert item["evidence_count"] == 0


async def test_skill_is_evidenced_only_after_accepted_proof(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    # Invariant #3 : une competence rankee a au moins une preuve acceptee/validee
    ref_id = await _skill_ref(client, candidate_headers, "ProjEvidence")
    exp_id = await _experience(client, candidate_headers, "Projet en ProjEvidence sur le terrain")

    suggest = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages/suggest", headers=candidate_headers
    )
    assert suggest.status_code == 201
    usage = suggest.json()[0]
    assert usage["skill_ref_id"] == ref_id

    # Preuve pending seulement -> inferred, aucune evidence comptee
    inferred = await _projection_item(client, candidate_headers, ref_id)
    assert inferred is not None
    assert inferred["status"] == "inferred"
    assert inferred["evidence_count"] == 0

    # Confirmation -> accepted + validated_at -> validated, 1 evidence
    confirm = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages/{usage['id']}/confirm",
        headers=candidate_headers,
        json={"intensity": "primary"},
    )
    assert confirm.status_code == 200

    evidenced = await _projection_item(client, candidate_headers, ref_id)
    assert evidenced is not None
    assert evidenced["status"] == "validated"
    assert evidenced["evidence_count"] == 1
    assert evidenced["last_used"] == "2023-01-01"
