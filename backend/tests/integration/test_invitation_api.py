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
    # Existing account: the email points to the access page, not registration.
    assert "/candidate/access" in message.body


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
    assert "/register?role=candidate" in sent[0].body
