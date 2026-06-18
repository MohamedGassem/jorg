import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_candidate_invitations_include_org_name(
    client: AsyncClient, recruiter_headers: dict[str, str], candidate_headers: dict[str, str]
) -> None:
    # recruiter creates org (auto-linked via atomic creation) + sends invitation
    org_r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "OrgName Test"},
    )
    assert org_r.status_code in (200, 201), org_r.text
    org_id = org_r.json()["id"]
    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    assert inv_r.status_code in (200, 201), inv_r.text

    r = await client.get("/invitations/me", headers=candidate_headers)
    assert r.status_code == 200
    invitations = r.json()
    assert len(invitations) >= 1
    assert invitations[0]["organization_name"] == "OrgName Test"


@pytest.mark.asyncio
async def test_invitation_sends_email_to_existing_candidate(
    client: AsyncClient, recruiter_headers: dict[str, str], candidate_headers: dict[str, str]
) -> None:
    org_r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Acme Conseil"},
    )
    org_id = org_r.json()["id"]
    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    assert inv_r.status_code in (200, 201), inv_r.text

    sent = client.email_backend.sent  # type: ignore[attr-defined]
    assert len(sent) == 1
    message = sent[0]
    assert message.to == "candidate@test.com"
    assert "Acme Conseil" in message.subject
    # The email carries the token so the candidate lands on the public invitation page.
    assert "/invitation/" in message.body


@pytest.mark.asyncio
async def test_invitation_sends_registration_email_to_unknown_candidate(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Acme Conseil"},
    )
    org_id = org_r.json()["id"]
    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "nouveau@exemple.com"},
    )
    assert inv_r.status_code in (200, 201), inv_r.text

    sent = client.email_backend.sent  # type: ignore[attr-defined]
    assert len(sent) == 1
    assert sent[0].to == "nouveau@exemple.com"
    assert "/invitation/" in sent[0].body


async def _setup_org_and_invite(
    client: AsyncClient, recruiter_headers: dict[str, str], email: str = "candidate@test.com"
) -> tuple[str, dict]:
    org_r = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Cycle Org"}
    )
    org_id = org_r.json()["id"]
    inv_r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": email},
    )
    assert inv_r.status_code in (200, 201), inv_r.text
    return org_id, inv_r.json()


@pytest.mark.asyncio
async def test_duplicate_pending_invitation_conflict(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id, _ = await _setup_org_and_invite(client, recruiter_headers)
    again = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_invite_candidate_with_active_grant_conflict(
    client: AsyncClient, recruiter_headers: dict[str, str], candidate_headers: dict[str, str]
) -> None:
    org_id, inv = await _setup_org_and_invite(client, recruiter_headers)
    accept = await client.post(f"/invitations/{inv['token']}/accept", headers=candidate_headers)
    assert accept.status_code == 201
    again = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_cancel_pending_invitation(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id, inv = await _setup_org_and_invite(client, recruiter_headers)
    r = await client.delete(
        f"/organizations/{org_id}/invitations/{inv['id']}", headers=recruiter_headers
    )
    assert r.status_code == 204
    listing = await client.get(f"/organizations/{org_id}/invitations", headers=recruiter_headers)
    assert all(i["id"] != inv["id"] for i in listing.json())
    again = await client.delete(
        f"/organizations/{org_id}/invitations/{inv['id']}", headers=recruiter_headers
    )
    assert again.status_code == 404


@pytest.mark.asyncio
async def test_cancel_accepted_invitation_conflict(
    client: AsyncClient, recruiter_headers: dict[str, str], candidate_headers: dict[str, str]
) -> None:
    org_id, inv = await _setup_org_and_invite(client, recruiter_headers)
    await client.post(f"/invitations/{inv['token']}/accept", headers=candidate_headers)
    r = await client.delete(
        f"/organizations/{org_id}/invitations/{inv['id']}", headers=recruiter_headers
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_resend_invitation_sends_email_again(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id, inv = await _setup_org_and_invite(client, recruiter_headers, "nouveau@exemple.com")
    sent = client.email_backend.sent  # type: ignore[attr-defined]
    assert len(sent) == 1
    r = await client.post(
        f"/organizations/{org_id}/invitations/{inv['id']}/resend", headers=recruiter_headers
    )
    assert r.status_code == 200
    assert len(sent) == 2
    assert sent[1].to == "nouveau@exemple.com"


@pytest.mark.asyncio
async def test_accept_with_scopes_persists_choices(
    client: AsyncClient, recruiter_headers: dict[str, str], candidate_headers: dict[str, str]
) -> None:
    _org_id, inv = await _setup_org_and_invite(client, recruiter_headers)
    r = await client.post(
        f"/invitations/{inv['token']}/accept",
        headers=candidate_headers,
        json={"share_finances": False, "share_contact": True},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["share_finances"] is False
    assert body["share_contact"] is True


@pytest.mark.asyncio
async def test_update_grant_scopes(
    client: AsyncClient, recruiter_headers: dict[str, str], candidate_headers: dict[str, str]
) -> None:
    _org_id, inv = await _setup_org_and_invite(client, recruiter_headers)
    accept = await client.post(
        f"/invitations/{inv['token']}/accept",
        headers=candidate_headers,
        json={"share_finances": True, "share_contact": True},
    )
    grant_id = accept.json()["id"]
    r = await client.patch(
        f"/access/me/{grant_id}",
        headers=candidate_headers,
        json={"share_finances": False, "share_contact": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["share_finances"] is False
    assert body["share_contact"] is True


@pytest.mark.asyncio
async def test_update_grant_scopes_unknown_grant_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.patch(
        "/access/me/00000000-0000-0000-0000-000000000000",
        headers=candidate_headers,
        json={"share_finances": False, "share_contact": False},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_public_invitation_lookup(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    _org_id, inv = await _setup_org_and_invite(client, recruiter_headers)
    r = await client.get(f"/public/invitations/{inv['token']}")  # pas d'auth
    assert r.status_code == 200
    body = r.json()
    assert body["organization_name"]
    assert body["status"] == "pending"
    assert body["candidate_email"] == "candidate@test.com"


@pytest.mark.asyncio
async def test_public_invitation_lookup_unknown_token_returns_404(
    client: AsyncClient,
) -> None:
    r = await client.get("/public/invitations/does-not-exist")
    assert r.status_code == 404
