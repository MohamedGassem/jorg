# backend/tests/integration/test_candidate_skills_api.py
from httpx import AsyncClient


async def _create_skill_ref(
    client: AsyncClient, headers: dict, name: str, kind: str = "technical"
) -> str:
    r = await client.post("/skill-references", headers=headers, json={"name": name, "kind": kind})
    return str(r.json()["id"])


async def test_list_skills_empty(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    r = await client.get("/candidates/me/skills", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_create_candidate_skill(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    ref_id = await _create_skill_ref(client, candidate_headers, "Python")
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "featured": True},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["skill_ref"]["name"] == "Python"
    assert data["featured"] is True
    assert "id" in data


async def test_update_candidate_skill(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    ref_id = await _create_skill_ref(client, candidate_headers, "Kubernetes", "tool")
    create = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    skill_id = create.json()["id"]
    r = await client.put(
        f"/candidates/me/skills/{skill_id}",
        headers=candidate_headers,
        json={"self_assessed_level": "expert", "featured": True},
    )
    assert r.status_code == 200
    assert r.json()["self_assessed_level"] == "expert"
    assert r.json()["featured"] is True


async def test_delete_candidate_skill(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    ref_id = await _create_skill_ref(client, candidate_headers, "ToDelete", "tool")
    create = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    skill_id = create.json()["id"]
    r = await client.delete(f"/candidates/me/skills/{skill_id}", headers=candidate_headers)
    assert r.status_code == 204


async def test_duplicate_candidate_skill_returns_409(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    ref_id = await _create_skill_ref(client, candidate_headers, "UniqueRef99", "technical")
    await client.post(
        "/candidates/me/skills", headers=candidate_headers, json={"skill_ref_id": ref_id}
    )
    r = await client.post(
        "/candidates/me/skills", headers=candidate_headers, json={"skill_ref_id": ref_id}
    )
    assert r.status_code == 409


async def test_skill_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/candidates/me/skills")
    assert r.status_code == 401
