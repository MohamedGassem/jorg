import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillKind, SkillReference


async def _setup_org(client: AsyncClient, headers: dict[str, str]) -> str:
    org = await client.post("/organizations", json={"name": "Opp Org"}, headers=headers)
    org_id: str = org.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=headers)
    return org_id


async def _create_opportunity(
    client: AsyncClient,
    headers: dict[str, str],
    org_id: str,
    title: str = "Mission Alpha",
    skill_ref_ids: list[str] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {"title": title}
    if skill_ref_ids is not None:
        payload["skill_ref_ids"] = skill_ref_ids
    r = await client.post(
        f"/organizations/{org_id}/opportunities",
        json=payload,
        headers=headers,
    )
    assert r.status_code == 201
    result: dict[str, object] = r.json()
    return result


async def _create_skill_ref(db_session: AsyncSession, name: str) -> str:
    ref = SkillReference(
        name=name,
        slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}",
        kind=SkillKind.technical,
        aliases=[],
        source="jorg",
        is_custom=False,
        is_displayable=True,
        categories=[],
    )
    db_session.add(ref)
    await db_session.commit()
    return str(ref.id)


async def _shortlist_candidate_with_skills(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
    org_id: str,
    opp_id: str,
    candidate_skill_ids: list[str],
) -> str:
    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "candidate@test.com"},
        headers=recruiter_headers,
    )
    token = inv_r.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id: str = profile_r.json()["user_id"]

    for skill_id in candidate_skill_ids:
        await client.post(
            "/candidates/me/skills",
            json={"skill_ref_id": skill_id},
            headers=candidate_headers,
        )

    r = await client.post(
        f"/organizations/{org_id}/opportunities/{opp_id}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    assert r.status_code == 201
    return cand_user_id


async def test_create_opportunity(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    assert opp["title"] == "Mission Alpha"
    assert opp["status"] == "open"


async def test_list_opportunities(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    await _create_opportunity(client, recruiter_headers, org_id, "Opp A")
    await _create_opportunity(client, recruiter_headers, org_id, "Opp B")
    r = await client.get(f"/organizations/{org_id}/opportunities", headers=recruiter_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_get_opportunity_detail(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    r = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    assert r.status_code == 200
    assert r.json()["shortlist"] == []


async def test_close_opportunity(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    r = await client.patch(
        f"/organizations/{org_id}/opportunities/{opp['id']}",
        json={"status": "closed"},
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "closed"


async def test_add_candidate_to_shortlist(
    client: AsyncClient, recruiter_headers: dict, candidate_headers: dict
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)

    # Invite + accept candidate
    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "candidate@test.com"},
        headers=recruiter_headers,
    )
    token = inv_r.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)

    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]

    r = await client.post(
        f"/organizations/{org_id}/opportunities/{opp['id']}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    assert r.status_code == 201

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    assert len(detail.json()["shortlist"]) == 1


async def test_add_candidate_without_grant_returns_403(
    client: AsyncClient, recruiter_headers: dict, candidate_headers: dict
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]
    r = await client.post(
        f"/organizations/{org_id}/opportunities/{opp['id']}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    assert r.status_code == 403


async def test_duplicate_shortlist_entry_returns_409(
    client: AsyncClient, recruiter_headers: dict, candidate_headers: dict
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)

    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "candidate@test.com"},
        headers=recruiter_headers,
    )
    token = inv_r.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]

    await client.post(
        f"/organizations/{org_id}/opportunities/{opp['id']}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    r2 = await client.post(
        f"/organizations/{org_id}/opportunities/{opp['id']}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    assert r2.status_code == 409


async def test_remove_candidate_from_shortlist(
    client: AsyncClient, recruiter_headers: dict, candidate_headers: dict
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)

    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "candidate@test.com"},
        headers=recruiter_headers,
    )
    token = inv_r.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]

    await client.post(
        f"/organizations/{org_id}/opportunities/{opp['id']}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    r = await client.delete(
        f"/organizations/{org_id}/opportunities/{opp['id']}/candidates/{cand_user_id}",
        headers=recruiter_headers,
    )
    assert r.status_code == 204

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    assert detail.json()["shortlist"] == []


async def test_create_opportunity_with_required_skills(
    client: AsyncClient, recruiter_headers: dict, db_session: AsyncSession
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    s1 = await _create_skill_ref(db_session, "ReqSkillOne")
    s2 = await _create_skill_ref(db_session, "ReqSkillTwo")
    opp = await _create_opportunity(client, recruiter_headers, org_id, skill_ref_ids=[s1, s2])

    # The create (POST) response body itself must already include the hydrated skills.
    create_names = {s["name"] for s in opp["required_skills"]}
    assert create_names == {"ReqSkillOne", "ReqSkillTwo"}

    r = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    assert r.status_code == 200
    names = {s["name"] for s in r.json()["required_skills"]}
    assert names == {"ReqSkillOne", "ReqSkillTwo"}


async def test_update_opportunity_required_skills(
    client: AsyncClient, recruiter_headers: dict, db_session: AsyncSession
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    s1 = await _create_skill_ref(db_session, "InitialSkill")
    s2 = await _create_skill_ref(db_session, "ReplacementSkill")
    opp = await _create_opportunity(client, recruiter_headers, org_id, skill_ref_ids=[s1])

    r = await client.patch(
        f"/organizations/{org_id}/opportunities/{opp['id']}",
        json={"skill_ref_ids": [s2]},
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    # The update (PATCH) response body itself must reflect the new hydrated skills.
    patch_names = {s["name"] for s in r.json()["required_skills"]}
    assert patch_names == {"ReplacementSkill"}

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    names = {s["name"] for s in detail.json()["required_skills"]}
    assert names == {"ReplacementSkill"}


async def test_match_score_half(
    client: AsyncClient,
    recruiter_headers: dict,
    candidate_headers: dict,
    db_session: AsyncSession,
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    s1 = await _create_skill_ref(db_session, "MatchSkillA")
    s2 = await _create_skill_ref(db_session, "MatchSkillB")
    opp = await _create_opportunity(client, recruiter_headers, org_id, skill_ref_ids=[s1, s2])
    await _shortlist_candidate_with_skills(
        client, recruiter_headers, candidate_headers, org_id, str(opp["id"]), [s1]
    )

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    shortlist = detail.json()["shortlist"]
    assert len(shortlist) == 1
    assert shortlist[0]["match_score"] == 50


async def test_match_score_zero(
    client: AsyncClient,
    recruiter_headers: dict,
    candidate_headers: dict,
    db_session: AsyncSession,
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    s1 = await _create_skill_ref(db_session, "ZeroReqA")
    s2 = await _create_skill_ref(db_session, "ZeroReqB")
    other = await _create_skill_ref(db_session, "ZeroOther")
    opp = await _create_opportunity(client, recruiter_headers, org_id, skill_ref_ids=[s1, s2])
    await _shortlist_candidate_with_skills(
        client, recruiter_headers, candidate_headers, org_id, str(opp["id"]), [other]
    )

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    assert detail.json()["shortlist"][0]["match_score"] == 0


async def test_match_score_none_when_no_required_skills(
    client: AsyncClient,
    recruiter_headers: dict,
    candidate_headers: dict,
    db_session: AsyncSession,
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    skill = await _create_skill_ref(db_session, "NoReqSkill")
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    await _shortlist_candidate_with_skills(
        client, recruiter_headers, candidate_headers, org_id, str(opp["id"]), [skill]
    )

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers
    )
    assert detail.json()["shortlist"][0]["match_score"] is None
