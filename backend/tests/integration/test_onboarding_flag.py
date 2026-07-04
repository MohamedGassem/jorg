# backend/tests/integration/test_onboarding_flag.py
import pytest
from httpx import AsyncClient


async def test_candidate_profile_has_onboarding_completed_false_by_default(
    client: AsyncClient,
) -> None:
    await client.post(
        "/auth/register",
        json={"email": "onboard@test.com", "password": "password123", "role": "candidate"},
    )
    login = await client.post(
        "/auth/login",
        json={"email": "onboard@test.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    profile_resp = await client.get("/candidates/me/profile", headers=headers)
    assert profile_resp.status_code == 200
    assert profile_resp.json()["onboarding_completed"] is False


async def test_registration_saves_first_and_last_name(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={
            "email": "named@test.com",
            "password": "password123",
            "role": "candidate",
            "first_name": "Alice",
            "last_name": "Martin",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": "named@test.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    profile_resp = await client.get("/candidates/me/profile", headers=headers)
    data = profile_resp.json()
    assert profile_resp.status_code == 200
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Martin"


async def test_onboarding_completed_can_be_set_via_profile_update(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "complete@test.com", "password": "password123", "role": "candidate"},
    )
    login = await client.post(
        "/auth/login",
        json={"email": "complete@test.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.put(
        "/candidates/me/profile",
        headers=headers,
        json={"onboarding_completed": True},
    )
    assert resp.status_code == 200
    assert resp.json()["onboarding_completed"] is True


async def test_onboarding_complete_endpoint_sets_flag(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "endpoint@test.com", "password": "password123", "role": "candidate"},
    )
    login = await client.post(
        "/auth/login",
        json={"email": "endpoint@test.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/candidates/me/onboarding/complete", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["onboarding_completed"] is True

    # Idempotent: calling again keeps the flag set.
    again = await client.post("/candidates/me/onboarding/complete", headers=headers)
    assert again.status_code == 200
    assert again.json()["onboarding_completed"] is True

    profile_resp = await client.get("/candidates/me/profile", headers=headers)
    assert profile_resp.json()["onboarding_completed"] is True


async def test_onboarding_complete_endpoint_rejects_non_candidate(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "reco@test.com", "password": "password123", "role": "recruiter"},
    )
    login = await client.post(
        "/auth/login",
        json={"email": "reco@test.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/candidates/me/onboarding/complete", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_registration_saves_first_and_last_name(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={
            "email": "recruiter_named@test.com",
            "password": "password123",
            "role": "recruiter",
            "first_name": "Bob",
            "last_name": "Smith",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": "recruiter_named@test.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    profile_resp = await client.get("/recruiters/me/profile", headers=headers)
    assert profile_resp.status_code == 200
    data = profile_resp.json()
    assert data["first_name"] == "Bob"
    assert data["last_name"] == "Smith"
