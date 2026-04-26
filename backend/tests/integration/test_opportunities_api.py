from httpx import AsyncClient


async def _setup_org(client: AsyncClient, headers: dict) -> str:
    org = await client.post("/organizations", json={"name": "Opp Org"}, headers=headers)
    org_id = org.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=headers)
    return org_id


async def _create_opportunity(client: AsyncClient, headers: dict, org_id: str, title: str = "Mission Alpha") -> dict:
    r = await client.post(
        f"/organizations/{org_id}/opportunities",
        json={"title": title},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()


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
    r = await client.get(f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers)
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

    detail = await client.get(f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers)
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

    await client.post(f"/organizations/{org_id}/opportunities/{opp['id']}/candidates", json={"candidate_id": cand_user_id}, headers=recruiter_headers)
    r2 = await client.post(f"/organizations/{org_id}/opportunities/{opp['id']}/candidates", json={"candidate_id": cand_user_id}, headers=recruiter_headers)
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

    await client.post(f"/organizations/{org_id}/opportunities/{opp['id']}/candidates", json={"candidate_id": cand_user_id}, headers=recruiter_headers)
    r = await client.delete(f"/organizations/{org_id}/opportunities/{opp['id']}/candidates/{cand_user_id}", headers=recruiter_headers)
    assert r.status_code == 204

    detail = await client.get(f"/organizations/{org_id}/opportunities/{opp['id']}", headers=recruiter_headers)
    assert detail.json()["shortlist"] == []
