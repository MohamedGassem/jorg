# backend/tests/integration/test_skill_reference_public_api.py
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillKind, SkillReference


async def test_public_search_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/skill-references/public?q=python")
    assert r.status_code == 401


async def test_recruiter_can_search_public_displayable_jorg(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        SkillReference(
            name="PublicJorgSkillXYZ",
            slug="public-jorg-skill-xyz",
            kind=SkillKind.technical,
            aliases=[],
            source="jorg",
            is_custom=False,
            is_displayable=True,
            categories=["Software Engineering"],
        )
    )
    await db_session.commit()

    r = await client.get("/skill-references/public?q=PublicJorgSkill", headers=recruiter_headers)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "PublicJorgSkillXYZ" in names


async def test_public_search_excludes_candidate_custom(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "CandidateCustomSecret777", "kind": "tool"},
    )
    r = await client.get(
        "/skill-references/public?q=CandidateCustomSecret777",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_public_search_excludes_non_displayable_jorg(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        SkillReference(
            name="HiddenJorgSkill",
            slug="hidden-jorg-skill",
            kind=SkillKind.technical,
            aliases=[],
            source="jorg",
            is_custom=False,
            is_displayable=False,
            categories=[],
        )
    )
    await db_session.commit()

    r = await client.get("/skill-references/public?q=HiddenJorg", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.json() == []
