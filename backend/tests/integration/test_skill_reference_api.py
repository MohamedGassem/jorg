# backend/tests/integration/test_skill_reference_api.py
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillKind, SkillReference


async def test_search_skill_references_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/skill-references?q=python")
    assert r.status_code == 401


async def test_search_returns_matching_skills(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "MyUniqueCustomSkillXYZ", "kind": "technical"},
    )
    r = await client.get("/skill-references?q=UniqueCustomSkill", headers=candidate_headers)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "MyUniqueCustomSkillXYZ" in names


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


async def test_search_hides_esco_natural_languages(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        SkillReference(
            name="Fran\u00e7ais",
            slug="fran-ais",
            kind=SkillKind.technical,
            aliases=[],
            esco_uri="http://data.europa.eu/esco/skill/e747e77e-0ea1-4001-8b07-1d11946b5f1b",
            esco_skill_type="knowledge",
            source="esco",
            description="La langue fran\u00e7aise. Le fran\u00e7ais est une langue officielle.",
            is_custom=False,
        )
    )
    await db_session.commit()

    r = await client.get("/skill-references?q=Fran", headers=candidate_headers)

    assert r.status_code == 200
    assert "Fran\u00e7ais" not in [skill["name"] for skill in r.json()]


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
    assert data["source"] == "user_custom"


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


async def test_esco_skill_not_visible_in_display_search(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """ESCO skills must not appear in the picker (for_display=True default)."""
    db_session.add(
        SkillReference(
            name="EscoOnlySkill",
            slug="esco-only-skill",
            kind=SkillKind.technical,
            aliases=[],
            source="esco",
            is_custom=False,
            is_displayable=False,
            categories=[],
        )
    )
    await db_session.commit()

    r = await client.get("/skill-references?q=EscoOnly", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json() == []


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


async def test_skill_reference_response_includes_curation_fields(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "FieldCheckSkill", "kind": "technical"},
    )
    assert r.status_code == 201
    data = r.json()
    assert "is_displayable" in data
    assert "categories" in data
    assert data["is_displayable"] is False
    assert data["categories"] == []


async def test_search_finds_skill_via_alias(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        SkillReference(
            name="Retrieval-Augmented Generation",
            slug="retrieval-augmented-generation",
            kind=SkillKind.methodology,
            aliases=["RAG", "RAG pipeline"],
            source="jorg",
            is_custom=False,
            is_displayable=True,
            categories=["Generative AI"],
        )
    )
    await db_session.commit()

    r = await client.get("/skill-references?q=RAG", headers=candidate_headers)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Retrieval-Augmented Generation" in names


async def test_search_does_not_partial_match_aliases(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        SkillReference(
            name="Python",
            slug="python-jorg",
            kind=SkillKind.technical,
            aliases=["Python 3"],
            source="jorg",
            is_custom=False,
            is_displayable=True,
            categories=["Software Engineering"],
        )
    )
    db_session.add(
        SkillReference(
            name="Flask",
            slug="flask-jorg",
            kind=SkillKind.tool,
            aliases=["Flask Python"],
            source="jorg",
            is_custom=False,
            is_displayable=True,
            categories=["Software Engineering"],
        )
    )
    await db_session.commit()

    r = await client.get("/skill-references?q=pyth", headers=candidate_headers)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Python" in names
    assert "Flask" not in names


async def test_search_jorg_displayable_visible_to_all_candidates(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        SkillReference(
            name="GlobalJorgSkill",
            slug="global-jorg-skill",
            kind=SkillKind.technical,
            aliases=[],
            source="jorg",
            is_custom=False,
            is_displayable=True,
            categories=["Software Engineering"],
        )
    )
    await db_session.commit()

    r1 = await client.get("/skill-references?q=GlobalJorg", headers=candidate_headers)
    assert r1.status_code == 200
    assert any(s["name"] == "GlobalJorgSkill" for s in r1.json())


async def test_search_exact_name_ranked_before_contains(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        SkillReference(
            name="Python",
            slug="python-jorg",
            kind=SkillKind.technical,
            aliases=[],
            source="jorg",
            is_custom=False,
            is_displayable=True,
            categories=["Software Engineering"],
        )
    )
    db_session.add(
        SkillReference(
            name="Python Scripting",
            slug="python-scripting-jorg",
            kind=SkillKind.technical,
            aliases=[],
            source="jorg",
            is_custom=False,
            is_displayable=True,
            categories=["Software Engineering"],
        )
    )
    await db_session.commit()

    r = await client.get("/skill-references?q=Python", headers=candidate_headers)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert names.index("Python") < names.index("Python Scripting")
