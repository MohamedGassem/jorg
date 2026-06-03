# backend/tests/integration/test_auth_alpha.py
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from services.alpha_service import create_alpha_codes


@pytest.mark.asyncio
async def test_recruiter_register_requires_code_when_enabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        resp = await client.post(
            "/auth/register",
            json={"email": "rec@test.com", "password": "password123", "role": "recruiter"},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"].lower()
        assert "alpha" in detail or "invitation" in detail
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_recruiter_register_succeeds_with_valid_code(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        codes = await create_alpha_codes(db_session, count=1)
        resp = await client.post(
            "/auth/register",
            json={
                "email": "rec2@test.com",
                "password": "password123",
                "role": "recruiter",
                "alpha_invite_code": codes[0],
            },
        )
        assert resp.status_code == 201
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_candidate_register_does_not_require_code(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        resp = await client.post(
            "/auth/register",
            json={"email": "cand@test.com", "password": "password123", "role": "candidate"},
        )
        assert resp.status_code == 201
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_register_disabled_when_env_false(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "false")
    get_settings.cache_clear()
    try:
        resp = await client.post(
            "/auth/register",
            json={"email": "rec3@test.com", "password": "password123", "role": "recruiter"},
        )
        assert resp.status_code == 201
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_recruiter_register_fails_with_invalid_code(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        resp = await client.post(
            "/auth/register",
            json={
                "email": "rec4@test.com",
                "password": "password123",
                "role": "recruiter",
                "alpha_invite_code": "JORG-FAKE-CODE",
            },
        )
        assert resp.status_code == 400
        assert (
            "invalide" in resp.json()["detail"].lower()
            or "utilisé" in resp.json()["detail"].lower()
        )
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_alpha_code_links_to_recruiter_profile(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        codes = await create_alpha_codes(db_session, count=1)
        resp = await client.post(
            "/auth/register",
            json={
                "email": "link_test@test.com",
                "password": "password123",
                "role": "recruiter",
                "alpha_invite_code": codes[0],
            },
        )
        assert resp.status_code == 201
        # Verify used_by is set
        from sqlalchemy import select

        from models.alpha import AlphaInviteCode

        result = await db_session.execute(
            select(AlphaInviteCode).where(AlphaInviteCode.code == codes[0])
        )
        code_obj = result.scalar_one()
        assert code_obj.used_by is not None
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_recruiter_register_fails_with_already_used_code(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        codes = await create_alpha_codes(db_session, count=1)
        code = codes[0]
        # First registration: should succeed
        resp1 = await client.post(
            "/auth/register",
            json={
                "email": "rec5@test.com",
                "password": "password123",
                "role": "recruiter",
                "alpha_invite_code": code,
            },
        )
        assert resp1.status_code == 201
        # Second registration with the same code: should fail
        resp2 = await client.post(
            "/auth/register",
            json={
                "email": "rec6@test.com",
                "password": "password123",
                "role": "recruiter",
                "alpha_invite_code": code,
            },
        )
        assert resp2.status_code == 400
    finally:
        get_settings.cache_clear()
