import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_generate_codes_requires_secret(client: AsyncClient):
    resp = await client.post("/admin/alpha-codes", json={"count": 3})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_generate_codes_returns_codes(client: AsyncClient, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "test-secret")
    resp = await client.post(
        "/admin/alpha-codes",
        json={"count": 3},
        headers={"X-Admin-Secret": "test-secret"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["codes"]) == 3
    assert all(c.startswith("JORG-") for c in data["codes"])
