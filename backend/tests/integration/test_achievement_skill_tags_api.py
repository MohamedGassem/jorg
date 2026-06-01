# backend/tests/integration/test_achievement_skill_tags_api.py
from httpx import AsyncClient


async def _create_experience(client: AsyncClient, headers: dict) -> str:
    r = await client.post(
        "/candidates/me/experiences",
        headers=headers,
        json={"client_name": "TagCorp", "role": "Dev", "start_date": "2022-01-01"},
    )
    assert r.status_code == 201
    return str(r.json()["id"])


async def _create_skill_ref(client: AsyncClient, headers: dict, name: str) -> str:
    r = await client.post(
        "/skill-references", headers=headers, json={"name": name, "kind": "technical"}
    )
    assert r.status_code in (200, 201)
    return str(r.json()["id"])


async def _add_skill_usage(client: AsyncClient, headers: dict, exp_id: str, ref_id: str) -> None:
    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=headers,
        json={"skill_ref_id": ref_id, "usage_role": "implementer", "intensity": "primary"},
    )
    assert r.status_code == 201


async def _create_achievement(
    client: AsyncClient, headers: dict, exp_id: str, description: str
) -> str:
    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements",
        headers=headers,
        json={"description": description},
    )
    assert r.status_code == 201
    return str(r.json()["id"])


async def test_add_skill_tag_to_achievement(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Python")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Deployed service")

    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["skill_ref"]["name"] == "Python"
    assert data["skill_ref_id"] == ref_id


async def test_delete_skill_tag(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Docker")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Built container")

    await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    r = await client.delete(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags/{ref_id}",
        headers=candidate_headers,
    )
    assert r.status_code == 204

    # Verify tag is gone via GET experiences
    exps = await client.get("/candidates/me/experiences", headers=candidate_headers)
    target = next(e for e in exps.json() if e["id"] == exp_id)
    ach = next(a for a in target["achievements"] if a["id"] == ach_id)
    assert ach["skill_tags"] == []


async def test_add_skill_tag_duplicate_returns_409(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Kafka")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Built pipeline")

    payload = {"skill_ref_id": ref_id}
    r1 = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json=payload,
    )
    assert r1.status_code == 201

    r2 = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json=payload,
    )
    assert r2.status_code == 409


async def test_add_skill_tag_skill_not_in_bouquet_returns_422(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "NotInBouquet")
    # deliberately do NOT add skill_usage for this experience
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Some work")

    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    assert r.status_code == 422
    assert "bouquet" in r.json()["detail"]


async def test_add_skill_tag_wrong_achievement_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Redis")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)

    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/00000000-0000-0000-0000-000000000000/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    assert r.status_code == 404


async def test_delete_nonexistent_skill_tag_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Phantom")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Nothing tagged")

    r = await client.delete(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags/{ref_id}",
        headers=candidate_headers,
    )
    assert r.status_code == 404


async def test_delete_skill_tag_wrong_experience_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp1_id = await _create_experience(client, candidate_headers)
    exp2_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "WrongExpSkill")
    await _add_skill_usage(client, candidate_headers, exp1_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp1_id, "Work in exp1")
    await client.post(
        f"/candidates/me/experiences/{exp1_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    # Try to delete from wrong experience
    r = await client.delete(
        f"/candidates/me/experiences/{exp2_id}/achievements/{ach_id}/skill-tags/{ref_id}",
        headers=candidate_headers,
    )
    assert r.status_code == 404


async def test_get_experiences_returns_skill_tags_on_achievements(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Terraform")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Infra as code")

    await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )

    r = await client.get("/candidates/me/experiences", headers=candidate_headers)
    assert r.status_code == 200
    exps = r.json()
    target = next(e for e in exps if e["id"] == exp_id)
    assert len(target["achievements"]) == 1
    ach = target["achievements"][0]
    assert len(ach["skill_tags"]) == 1
    assert ach["skill_tags"][0]["skill_ref"]["name"] == "Terraform"
    assert ach["skill_tags"][0]["skill_ref_id"] == ref_id
