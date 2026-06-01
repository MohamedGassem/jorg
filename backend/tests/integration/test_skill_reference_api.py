# backend/tests/integration/test_skill_reference_api.py
from httpx import AsyncClient


async def test_search_skill_references_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/skill-references?q=python")
    assert r.status_code == 401


async def test_search_returns_matching_skills(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "Python", "kind": "technical"},
    )
    r = await client.get("/skill-references?q=Pyt", headers=candidate_headers)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Python" in names


async def test_search_filters_by_kind(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "Scrum", "kind": "methodology"},
    )
    r = await client.get("/skill-references?q=Scrum&kind=technical", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_create_custom_skill_reference(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "MyCustomSkill", "kind": "tool"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "MyCustomSkill"
    assert data["is_custom"] is True
    assert data["slug"] == "mycustomskill"
    assert data["source"] == "manual"


async def test_create_custom_skill_idempotent(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "UniqueSkill999", "kind": "tool"},
    )
    r2 = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "UniqueSkill999", "kind": "tool"},
    )
    assert r2.status_code == 200
    assert r2.json()["is_custom"] is True


async def test_skill_reference_response_has_source_field(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "CheckFields", "kind": "technical"},
    )
    data = r.json()
    assert "source" in data
    assert "esco_skill_type" in data
    assert "description" in data


async def test_custom_skill_visible_only_to_creator(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    """Une skill custom créée par candidat A n'apparaît pas dans la recherche de candidat B."""
    await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "UniquePrivateSkill42", "kind": "tool"},
    )
    r = await client.get(
        "/skill-references?q=UniquePrivateSkill42",
        headers=second_candidate_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_esco_skill_visible_to_all_candidates(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    """Les skills ESCO (creator_candidate_id=None) sont visibles par tous."""
    r = await client.get("/skill-references?q=Python", headers=second_candidate_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_create_custom_skill_sets_creator(
    client: AsyncClient,
    candidate_headers: dict[str, str],
) -> None:
    r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "MyPrivateTool999", "kind": "tool"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["is_custom"] is True
    assert data["creator_candidate_id"] is not None
