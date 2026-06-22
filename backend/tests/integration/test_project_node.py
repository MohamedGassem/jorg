# backend/tests/integration/test_project_node.py
"""Project node between Experience and Achievement (#64), additive.

No public API yet — the slice introduces the data model only, so projects are
exercised at the ORM level against the experiences/achievements created via the
candidate API.
"""

from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import Project
from models.skill import Achievement


async def _create_experience(client: AsyncClient, headers: dict[str, str]) -> str:
    r = await client.post(
        "/candidates/me/experiences",
        headers=headers,
        json={"client_name": "TestCorp", "role": "Dev", "start_date": "2022-01-01"},
    )
    return str(r.json()["id"])


async def _create_achievement(client: AsyncClient, headers: dict[str, str], exp_id: str) -> str:
    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements",
        headers=headers,
        json={"description": "Shipped the POC"},
    )
    return str(r.json()["id"])


async def test_existing_achievement_has_null_project(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ach_id = await _create_achievement(client, candidate_headers, exp_id)

    ach = (
        await db_session.execute(select(Achievement).where(Achievement.id == UUID(ach_id)))
    ).scalar_one()
    assert ach.project_id is None


async def test_achievement_can_attach_to_a_project(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ach_id = await _create_achievement(client, candidate_headers, exp_id)

    project = Project(experience_id=UUID(exp_id), name="POC matching", context="Phase alpha")
    db_session.add(project)
    await db_session.flush()

    ach = (
        await db_session.execute(select(Achievement).where(Achievement.id == UUID(ach_id)))
    ).scalar_one()
    ach.project_id = project.id
    await db_session.flush()

    refreshed = (
        await db_session.execute(select(Achievement).where(Achievement.id == UUID(ach_id)))
    ).scalar_one()
    assert refreshed.project_id == project.id
    assert project.experience_id == UUID(exp_id)
    assert project.order_index == 0


async def test_dropping_a_project_keeps_its_achievements(
    client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ach_id = await _create_achievement(client, candidate_headers, exp_id)

    project = Project(experience_id=UUID(exp_id), name="Livrable")
    db_session.add(project)
    await db_session.flush()
    ach = (
        await db_session.execute(select(Achievement).where(Achievement.id == UUID(ach_id)))
    ).scalar_one()
    ach.project_id = project.id
    await db_session.flush()

    await db_session.delete(project)
    await db_session.flush()

    refreshed = (
        await db_session.execute(select(Achievement).where(Achievement.id == UUID(ach_id)))
    ).scalar_one()
    assert refreshed.project_id is None
