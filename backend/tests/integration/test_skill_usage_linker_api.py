# backend/tests/integration/test_skill_usage_linker_api.py
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
            "client_name": "LinkerCorp",
            "role": "Dev",
            "start_date": "2022-01-01",
            "end_date": "2023-01-01",
            "description": description,
        },
    )
    return str(r.json()["id"])


async def test_suggest_then_confirm_moves_skill_into_metrics(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await _skill_ref(client, candidate_headers, "Python")
    exp_id = await _experience(client, candidate_headers, "Developpement en Python sur le projet")

    # Le linker propose une liaison en pending (intensite NULL = pre-confirmation)
    suggest = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages/suggest", headers=candidate_headers
    )
    assert suggest.status_code == 201
    proposals = suggest.json()
    assert len(proposals) == 1
    usage = proposals[0]
    assert usage["skill_ref"]["name"] == "Python"
    assert usage["review_status"] == "pending"
    assert usage["source"] == "cv_import"
    assert usage["intensity"] is None

    # Avant confirmation : une proposition pending ne pese pas dans le ranking.
    before = await client.get("/candidates/me/skill-metrics", headers=candidate_headers)
    assert all(m["skill_name"] != "Python" for m in before.json())

    # Confirmation candidat : pending -> accepted, porte l'intensite
    confirm = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages/{usage['id']}/confirm",
        headers=candidate_headers,
        json={"intensity": "primary"},
    )
    assert confirm.status_code == 200
    assert confirm.json()["review_status"] == "accepted"
    assert confirm.json()["intensity"] == "primary"

    # Apres confirmation : la competence entre dans les metrics, validated et poids plein.
    after = await client.get("/candidates/me/skill-metrics", headers=candidate_headers)
    py_after = next(m for m in after.json() if m["skill_name"] == "Python")
    assert py_after["validated"] is True
    assert py_after["months_weighted"] > 0


async def test_suggest_excludes_already_used_skill(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    ref_id = await _skill_ref(client, candidate_headers, "Rust")
    exp_id = await _experience(client, candidate_headers, "Projet en Rust embarque")
    await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "intensity": "primary"},
    )

    suggest = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages/suggest", headers=candidate_headers
    )
    assert suggest.status_code == 201
    assert suggest.json() == []
