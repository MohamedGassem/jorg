import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_candidate_invitations_include_org_name(
    client: AsyncClient, recruiter_headers: dict, candidate_headers: dict
):
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
