# backend/tests/integration/test_observability.py
from httpx import AsyncClient


async def test_request_id_header_present(client: AsyncClient) -> None:
    """Every response must carry X-Request-ID."""
    r = await client.get("/health")
    assert r.status_code == 200
    assert "x-request-id" in r.headers
    rid = r.headers["x-request-id"]
    assert len(rid) == 36
    assert rid.count("-") == 4


async def test_different_requests_get_different_request_ids(client: AsyncClient) -> None:
    r1 = await client.get("/health")
    r2 = await client.get("/health")
    assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


async def test_auth_endpoint_returns_request_id(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r.status_code == 200
    assert "x-request-id" in r.headers
