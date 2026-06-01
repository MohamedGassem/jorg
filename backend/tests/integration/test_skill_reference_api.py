# backend/tests/integration/test_skill_reference_api.py
import pytest
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
    """Les skills ESCO (creator_candidate_id=None) sont visibles par tous les candidats."""
    # ESCO skills are seeded in conftest from data/esco_seed.csv with creator_candidate_id=NULL.
    # They must appear in search results for any authenticated candidate.
    # Search with q="" doesn't work (requires query), so search with a common substring.
    # First candidate searches
    r1 = await client.get("/skill-references?q=a&limit=5", headers=candidate_headers)
    assert r1.status_code == 200
    esco_from_candidate_a = [s for s in r1.json() if not s["is_custom"]]

    if not esco_from_candidate_a:
        pytest.skip("No ESCO seeds available — cannot test ESCO visibility")

    # Second candidate must see the same ESCO skills
    r2 = await client.get("/skill-references?q=a&limit=5", headers=second_candidate_headers)
    assert r2.status_code == 200
    esco_from_candidate_b = [s for s in r2.json() if not s["is_custom"]]

    esco_ids_a = {s["id"] for s in esco_from_candidate_a}
    esco_ids_b = {s["id"] for s in esco_from_candidate_b}
    assert esco_ids_a == esco_ids_b, "ESCO skills must be visible to all candidates identically"


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
