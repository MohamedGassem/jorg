import pytest
from httpx import AsyncClient

from core.config import get_settings


@pytest.mark.asyncio
async def test_generate_codes_requires_secret(client: AsyncClient) -> None:
    resp = await client.post("/admin/alpha-codes", json={"count": 3})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_generate_codes_returns_codes(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ADMIN_SECRET", "test-secret")
    get_settings.cache_clear()
    try:
        resp = await client.post(
            "/admin/alpha-codes",
            json={"count": 3},
            headers={"X-Admin-Secret": "test-secret"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["codes"]) == 3
        assert all(c.startswith("JORG-") for c in data["codes"])
    finally:
        get_settings.cache_clear()
