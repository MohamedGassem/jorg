import pytest
from httpx import AsyncClient

from core.config import Settings, get_settings
from main import app


def _settings_with_e2e(enabled: bool) -> Settings:
    base = get_settings()
    return base.model_copy(update={"e2e_test_mode": enabled})


async def _make_invitation(client: AsyncClient, recruiter_headers: dict[str, str]) -> str:
    org = await client.post("/organizations", json={"name": "E2E Org"}, headers=recruiter_headers)
    org_id = org.json()["id"]
    await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "invitee@jorgtest.com"},
        headers=recruiter_headers,
    )
    return "invitee@jorgtest.com"


@pytest.mark.asyncio
async def test_last_invitation_token_returns_token_when_enabled(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    from api.routes.test_support import get_settings_dep

    email = await _make_invitation(client, recruiter_headers)
    app.dependency_overrides[get_settings_dep] = lambda: _settings_with_e2e(True)
    try:
        res = await client.get(f"/test/last-invitation-token?email={email}")
    finally:
        app.dependency_overrides.pop(get_settings_dep, None)

    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["token"], str) and len(body["token"]) > 0
    assert body["public_url"].endswith(f"/invitation/{body['token']}")


@pytest.mark.asyncio
async def test_last_invitation_token_404_when_disabled(client: AsyncClient) -> None:
    from api.routes.test_support import get_settings_dep

    app.dependency_overrides[get_settings_dep] = lambda: _settings_with_e2e(False)
    try:
        res = await client.get("/test/last-invitation-token?email=whoever@e2e.test")
    finally:
        app.dependency_overrides.pop(get_settings_dep, None)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_last_invitation_token_404_when_no_invitation(client: AsyncClient) -> None:
    from api.routes.test_support import get_settings_dep

    app.dependency_overrides[get_settings_dep] = lambda: _settings_with_e2e(True)
    try:
        res = await client.get("/test/last-invitation-token?email=nobody@e2e.test")
    finally:
        app.dependency_overrides.pop(get_settings_dep, None)
    assert res.status_code == 404
