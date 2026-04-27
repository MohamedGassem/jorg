# backend/tests/integration/test_sample_template.py
from httpx import AsyncClient


async def test_sample_template_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/templates/sample")
    assert r.status_code == 401


async def test_candidate_cannot_download_sample(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/templates/sample", headers=candidate_headers)
    assert r.status_code == 403


async def test_recruiter_can_download_sample(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/templates/sample", headers=recruiter_headers)
    assert r.status_code == 200
    assert "application/vnd.openxmlformats" in r.headers["content-type"]
    assert len(r.content) > 0
