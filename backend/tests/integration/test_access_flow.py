# backend/tests/integration/test_access_flow.py
from httpx import AsyncClient


# ---- helpers ----------------------------------------------------------------


async def _create_org_and_link(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> str:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Invite Corp"}
    )
    org_id: str = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    return org_id


# ---- invitation creation ----------------------------------------------------


async def test_recruiter_creates_invitation(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "newcandidate@test.com"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["candidate_email"] == "newcandidate@test.com"
    assert data["status"] == "PENDING"
    assert "token" in data
    assert "id" in data


async def test_invitation_links_existing_candidate(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    assert r.status_code == 201
    assert r.json()["candidate_id"] is not None


async def test_candidate_cannot_create_invitation(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/organizations/00000000-0000-0000-0000-000000000000/invitations",
        headers=candidate_headers,
        json={"candidate_email": "x@test.com"},
    )
    assert r.status_code == 403


async def test_unlinked_recruiter_cannot_invite(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    # recruiter not linked to org → 403
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Other Org"}
    )
    org_id = org.json()["id"]
    # recruiter did NOT link to this org
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "x@test.com"},
    )
    assert r.status_code == 403


# ---- candidate views invitations --------------------------------------------


async def test_candidate_lists_invitations(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    r = await client.get("/invitations/me", headers=candidate_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ---- accept flow ------------------------------------------------------------


async def _create_invite_token(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    org_id: str,
    email: str = "candidate@test.com",
) -> str:
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": email},
    )
    return str(r.json()["token"])


async def test_candidate_accepts_invitation(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    r = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "ACTIVE"
    assert data["organization_id"] == org_id


async def test_accept_is_idempotent(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    r1 = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    # Second invite to same org
    token2 = await _create_invite_token(client, recruiter_headers, org_id)
    r2 = await client.post(f"/invitations/{token2}/accept", headers=candidate_headers)
    assert r1.json()["id"] == r2.json()["id"]  # same grant returned


async def test_candidate_rejects_invitation(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    r = await client.post(f"/invitations/{token}/reject", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "REJECTED"


async def test_cannot_accept_already_rejected(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    await client.post(f"/invitations/{token}/reject", headers=candidate_headers)
    r = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    assert r.status_code == 409


async def test_accept_unknown_token_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post("/invitations/doesnotexist/accept", headers=candidate_headers)
    assert r.status_code == 404


# ---- access grants ----------------------------------------------------------


async def test_candidate_lists_grants(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    r = await client.get("/access/me", headers=candidate_headers)
    assert r.status_code == 200
    grants = r.json()
    assert any(g["organization_id"] == org_id for g in grants)


async def test_candidate_revokes_grant(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    grant = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    grant_id = grant.json()["id"]
    r = await client.delete(f"/access/me/{grant_id}", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "REVOKED"
    assert r.json()["revoked_at"] is not None
