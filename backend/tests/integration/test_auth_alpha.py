# backend/tests/integration/test_auth_alpha.py
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from models.user import OAuthProvider
from services.auth.alpha_service import create_alpha_codes
from services.auth.oauth_service import OAuthUserInfo, override_oauth_client


@pytest.mark.asyncio
async def test_recruiter_register_requires_code_when_enabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
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
) -> None:
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
) -> None:
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
) -> None:
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
) -> None:
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
) -> None:
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
async def test_alpha_code_with_org_attaches_recruiter(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        from models.recruiter import Organization

        org = Organization(name="Demo Org", slug="demo-org-alpha", join_code="demojoin1")
        db_session.add(org)
        await db_session.commit()
        await db_session.refresh(org)
        org_id = org.id

        codes = await create_alpha_codes(db_session, count=1, organization_id=org_id)
        resp = await client.post(
            "/auth/register",
            json={
                "email": "org_attach@test.com",
                "password": "password123",
                "role": "recruiter",
                "alpha_invite_code": codes[0],
            },
        )
        assert resp.status_code == 201
        login = await client.post(
            "/auth/login",
            json={"email": "org_attach@test.com", "password": "password123"},
        )
        token = login.json()["access_token"]
        profile = await client.get(
            "/recruiters/me/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert profile.status_code == 200
        assert profile.json()["organization_id"] == str(org_id)
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_alpha_code_without_org_leaves_recruiter_orgless(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        codes = await create_alpha_codes(db_session, count=1)
        resp = await client.post(
            "/auth/register",
            json={
                "email": "orgless@test.com",
                "password": "password123",
                "role": "recruiter",
                "alpha_invite_code": codes[0],
            },
        )
        assert resp.status_code == 201
        login = await client.post(
            "/auth/login",
            json={"email": "orgless@test.com", "password": "password123"},
        )
        token = login.json()["access_token"]
        profile = await client.get(
            "/recruiters/me/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert profile.status_code == 200
        assert profile.json()["organization_id"] is None
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_recruiter_register_fails_with_already_used_code(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
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


# ---- OAuth alpha gating tests -----------------------------------------------


class _FakeGoogleClientAlpha:
    provider = OAuthProvider.GOOGLE

    def authorization_url(self, state: str) -> str:
        return f"https://fake-google/auth?state={state}"

    async def exchange_code(self, code: str) -> OAuthUserInfo:
        return OAuthUserInfo(
            provider=OAuthProvider.GOOGLE,
            subject="google-alpha-test",
            email="oauth_recruiter_alpha@test.com",
        )


@pytest.mark.asyncio
async def test_oauth_recruiter_callback_blocked_during_alpha(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """OAuth recruiter registration must be blocked with 403 when alpha_invite_required=True."""
    fake = _FakeGoogleClientAlpha()
    override_oauth_client(OAuthProvider.GOOGLE, fake)
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        # Initiate OAuth login to get a real state token stored in the DB
        login = await client.get(
            "/auth/oauth/google/login?role=recruiter",
            follow_redirects=False,
        )
        assert login.status_code == 307
        state = login.headers["location"].split("state=")[1]

        # Attempt the callback — should be blocked
        r = await client.get(
            f"/auth/oauth/google/callback?code=fake-code&state={state}",
            follow_redirects=False,
        )
        assert r.status_code == 403
        detail = r.json()["detail"].lower()
        assert "oauth" in detail or "alpha" in detail or "invitation" in detail
    finally:
        get_settings.cache_clear()
        override_oauth_client(OAuthProvider.GOOGLE, None)


@pytest.mark.asyncio
async def test_oauth_recruiter_callback_allowed_when_alpha_disabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """OAuth recruiter registration must succeed when alpha_invite_required=False."""
    fake = _FakeGoogleClientAlpha()
    override_oauth_client(OAuthProvider.GOOGLE, fake)
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "false")
    get_settings.cache_clear()
    try:
        login = await client.get(
            "/auth/oauth/google/login?role=recruiter",
            follow_redirects=False,
        )
        assert login.status_code == 307
        state = login.headers["location"].split("state=")[1]

        r = await client.get(
            f"/auth/oauth/google/callback?code=fake-code&state={state}",
            follow_redirects=False,
        )
        assert r.status_code == 302
        assert "access_token" in r.cookies
    finally:
        get_settings.cache_clear()
        override_oauth_client(OAuthProvider.GOOGLE, None)


@pytest.mark.asyncio
async def test_oauth_candidate_callback_not_blocked_during_alpha(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Candidate OAuth registration must NOT be blocked by alpha gating."""
    fake_candidate = _FakeGoogleClientAlpha()
    override_oauth_client(OAuthProvider.GOOGLE, fake_candidate)
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    get_settings.cache_clear()
    try:
        login = await client.get(
            "/auth/oauth/google/login?role=candidate",
            follow_redirects=False,
        )
        assert login.status_code == 307
        state = login.headers["location"].split("state=")[1]

        r = await client.get(
            f"/auth/oauth/google/callback?code=fake-code&state={state}",
            follow_redirects=False,
        )
        assert r.status_code == 302
        assert "access_token" in r.cookies
    finally:
        get_settings.cache_clear()
        override_oauth_client(OAuthProvider.GOOGLE, None)
