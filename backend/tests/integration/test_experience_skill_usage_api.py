# backend/tests/integration/test_experience_skill_usage_api.py
from httpx import AsyncClient


async def _create_experience(client: AsyncClient, headers: dict) -> str:
    r = await client.post(
        "/candidates/me/experiences",
        headers=headers,
        json={"client_name": "TestCorp", "role": "Dev", "start_date": "2022-01-01"},
    )
    return str(r.json()["id"])


async def _create_skill_ref(client: AsyncClient, headers: dict, name: str) -> str:
    r = await client.post(
        "/skill-references", headers=headers, json={"name": name, "kind": "technical"}
    )
    return str(r.json()["id"])


async def test_add_skill_usage_to_experience(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "FastAPI")
    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "intensity": "primary"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["skill_ref"]["name"] == "FastAPI"
    assert data["intensity"] == "primary"


async def test_delete_skill_usage(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "ToDeleteUsage")
    create = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "intensity": "incidental"},
    )
    usage_id = create.json()["id"]
    r = await client.delete(
        f"/candidates/me/experiences/{exp_id}/skill-usages/{usage_id}",
        headers=candidate_headers,
    )
    assert r.status_code == 204


async def test_duplicate_usage_returns_409(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "UniqueUsage99")
    payload = {"skill_ref_id": ref_id, "intensity": "secondary"}
    await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages", headers=candidate_headers, json=payload
    )
    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages", headers=candidate_headers, json=payload
    )
    assert r.status_code == 409


async def test_add_usage_to_nonexistent_experience_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    ref_id = await _create_skill_ref(client, candidate_headers, "SomeSkill")
    r = await client.post(
        "/candidates/me/experiences/00000000-0000-0000-0000-000000000000/skill-usages",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "intensity": "incidental"},
    )
    assert r.status_code == 404


async def test_experience_read_returns_nested_achievements_and_usages(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_r = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "NestedCorp", "role": "Dev", "start_date": "2023-01-01"},
    )
    assert exp_r.status_code == 201
    exp_id = exp_r.json()["id"]

    ach_r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements",
        headers=candidate_headers,
        json={"description": "Shipped feature X", "impact": "-20% latency"},
    )
    assert ach_r.status_code == 201

    ref_r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "NestedSkill", "kind": "technical"},
    )
    ref_id = ref_r.json()["id"]
    usage_r = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "intensity": "primary"},
    )
    assert usage_r.status_code == 201

    r = await client.get("/candidates/me/experiences", headers=candidate_headers)
    assert r.status_code == 200
    exps = r.json()
    target = next((e for e in exps if e["id"] == exp_id), None)
    assert target is not None, "Created experience not found in list"

    assert len(target["achievements"]) == 1
    assert target["achievements"][0]["description"] == "Shipped feature X"

    assert len(target["skill_usages"]) == 1
    assert target["skill_usages"][0]["skill_ref"]["name"] == "NestedSkill"
