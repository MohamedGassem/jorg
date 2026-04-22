# backend/tests/integration/test_rgpd_api.py
from httpx import AsyncClient


async def test_export_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/candidates/me/export")
    assert r.status_code == 401


async def test_recruiter_cannot_export_candidate_data(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/export", headers=recruiter_headers)
    assert r.status_code == 403


async def test_export_empty_profile_returns_shell(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/export", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "candidate@test.com"
    assert data["role"] == "candidate"
    assert data["profile"] is None
    assert data["experiences"] == []
    assert data["skills"] == []
    assert data["education"] == []
    assert data["certifications"] == []
    assert data["languages"] == []
    assert data["access_grants"] == []
    assert data["generated_documents"] == []
    assert "exported_at" in data
