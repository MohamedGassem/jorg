# backend/tests/integration/test_auth_api.py
import pytest
from httpx import AsyncClient

from models.user import OAuthProvider
from services.oauth_service import (
    OAuthUserInfo,
    override_oauth_client,
)

# ---- Register tests --------------------------------------------------------


async def test_register_candidate_returns_201_and_user(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/register",
        json={
            "email": "alice@example.com",
            "password": "securepass123",
            "role": "candidate",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "alice@example.com"
    assert data["role"] == "candidate"
    assert data["email_verified"] is False
    assert "id" in data
    assert "hashed_password" not in data


async def test_register_duplicate_email_returns_409(client: AsyncClient) -> None:
    payload = {
        "email": "bob@example.com",
        "password": "securepass123",
        "role": "recruiter",
    }
    r1 = await client.post("/auth/register", json=payload)
    assert r1.status_code == 201

    r2 = await client.post("/auth/register", json=payload)
    assert r2.status_code == 409


async def test_register_short_password_returns_422(client: AsyncClient) -> None:
    r = await client.post(
        "/auth/register",
        json={"email": "c@ex.com", "password": "short", "role": "candidate"},
    )
    assert r.status_code == 422


async def test_register_sends_verification_email(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "ver@ex.com", "password": "securepass123", "role": "candidate"},
    )
    sent = client.email_backend.sent  # type: ignore[attr-defined]
    assert any(m.to == "ver@ex.com" and "verif" in m.subject.lower() for m in sent)


# ---- Login tests -----------------------------------------------------------


async def test_login_with_valid_credentials_returns_tokens(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "log@ex.com", "password": "securepass123", "role": "candidate"},
    )
    r = await client.post(
        "/auth/login",
        json={"email": "log@ex.com", "password": "securepass123"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]


async def test_login_with_wrong_password_returns_401(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "wp@ex.com", "password": "securepass123", "role": "candidate"},
    )
    r = await client.post(
        "/auth/login",
        json={"email": "wp@ex.com", "password": "wrong"},
    )
    assert r.status_code == 401


async def test_login_with_unknown_email_returns_401(client: AsyncClient) -> None:
    r = await client.post(
        "/auth/login",
        json={"email": "nobody@ex.com", "password": "securepass123"},
    )
    assert r.status_code == 401


# ---- Refresh tests ---------------------------------------------------------


async def test_refresh_with_valid_token_returns_new_pair(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "rf@ex.com", "password": "securepass123", "role": "candidate"},
    )
    login = await client.post(
        "/auth/login",
        json={"email": "rf@ex.com", "password": "securepass123"},
    )
    refresh = login.json()["refresh_token"]

    r = await client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
    assert data["refresh_token"]


async def test_refresh_with_access_token_returns_401(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "rf2@ex.com", "password": "securepass123", "role": "candidate"},
    )
    login = await client.post(
        "/auth/login",
        json={"email": "rf2@ex.com", "password": "securepass123"},
    )
    access = login.json()["access_token"]

    r = await client.post("/auth/refresh", json={"refresh_token": access})
    assert r.status_code == 401


async def test_refresh_with_malformed_token_returns_401(client: AsyncClient) -> None:
    r = await client.post("/auth/refresh", json={"refresh_token": "not.a.token"})
    assert r.status_code == 401


# ---- Email verification tests ----------------------------------------------


async def test_verify_email_marks_user_as_verified(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "vm@ex.com", "password": "securepass123", "role": "candidate"},
    )
    sent = client.email_backend.sent  # type: ignore[attr-defined]
    verify_msg = next(m for m in sent if m.to == "vm@ex.com")
    token = verify_msg.body.split("token=")[1].split()[0].strip()

    r = await client.post("/auth/verify-email", json={"token": token})
    assert r.status_code == 200

    login = await client.post(
        "/auth/login", json={"email": "vm@ex.com", "password": "securepass123"}
    )
    access = login.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.json()["email_verified"] is True


async def test_verify_email_with_invalid_token_returns_400(client: AsyncClient) -> None:
    r = await client.post("/auth/verify-email", json={"token": "not.a.token"})
    assert r.status_code == 400


# ---- Password reset tests --------------------------------------------------


async def test_request_password_reset_sends_email(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "pr@ex.com", "password": "securepass123", "role": "candidate"},
    )
    r = await client.post("/auth/request-password-reset", json={"email": "pr@ex.com"})
    assert r.status_code == 204

    sent = client.email_backend.sent  # type: ignore[attr-defined]
    assert any(m.to == "pr@ex.com" and "réinitialis" in m.subject.lower() for m in sent)


async def test_request_password_reset_unknown_email_returns_204(client: AsyncClient) -> None:
    # Ne pas divulguer l'existence d'un compte → toujours 204
    r = await client.post("/auth/request-password-reset", json={"email": "none@ex.com"})
    assert r.status_code == 204


async def test_reset_password_with_valid_token_changes_password(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "cp@ex.com", "password": "securepass123", "role": "candidate"},
    )
    await client.post("/auth/request-password-reset", json={"email": "cp@ex.com"})
    sent = client.email_backend.sent  # type: ignore[attr-defined]
    reset_msg = next(m for m in sent if m.to == "cp@ex.com" and "réinitialis" in m.subject.lower())
    token = reset_msg.body.split("token=")[1].split()[0].strip()

    r = await client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "brandnewpass456"},
    )
    assert r.status_code == 204

    old = await client.post("/auth/login", json={"email": "cp@ex.com", "password": "securepass123"})
    assert old.status_code == 401

    new = await client.post(
        "/auth/login", json={"email": "cp@ex.com", "password": "brandnewpass456"}
    )
    assert new.status_code == 200


# ---- OAuth Google tests ----------------------------------------------------


class FakeGoogleClient:
    provider = OAuthProvider.GOOGLE

    def __init__(self, info: OAuthUserInfo) -> None:
        self.info = info

    def authorization_url(self, state: str) -> str:
        return f"https://fake-google/auth?state={state}"

    async def exchange_code(self, code: str) -> OAuthUserInfo:
        return self.info


@pytest.fixture
def fake_google():
    info = OAuthUserInfo(
        provider=OAuthProvider.GOOGLE,
        subject="google-123",
        email="gauth@ex.com",
    )
    client = FakeGoogleClient(info)
    override_oauth_client(OAuthProvider.GOOGLE, client)
    yield client
    override_oauth_client(OAuthProvider.GOOGLE, None)


async def test_oauth_google_login_redirects(
    client: AsyncClient, fake_google: FakeGoogleClient
) -> None:
    r = await client.get(
        "/auth/oauth/google/login?role=candidate",
        follow_redirects=False,
    )
    assert r.status_code == 307
    assert "fake-google/auth" in r.headers["location"]


async def test_oauth_google_callback_creates_user_and_returns_tokens(
    client: AsyncClient, fake_google: FakeGoogleClient
) -> None:
    login = await client.get(
        "/auth/oauth/google/login?role=candidate",
        follow_redirects=False,
    )
    state = login.headers["location"].split("state=")[1]

    r = await client.get(
        f"/auth/oauth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    assert r.status_code == 302
    assert "access_token" in r.cookies
    assert "refresh_token" in r.cookies


# ---- OAuth LinkedIn tests --------------------------------------------------


class FakeLinkedInClient:
    provider = OAuthProvider.LINKEDIN

    def __init__(self, info: OAuthUserInfo) -> None:
        self.info = info

    def authorization_url(self, state: str) -> str:
        return f"https://fake-linkedin/auth?state={state}"

    async def exchange_code(self, code: str) -> OAuthUserInfo:
        return self.info


@pytest.fixture
def fake_linkedin():
    info = OAuthUserInfo(
        provider=OAuthProvider.LINKEDIN,
        subject="li-456",
        email="liauth@ex.com",
    )
    client = FakeLinkedInClient(info)
    override_oauth_client(OAuthProvider.LINKEDIN, client)
    yield client
    override_oauth_client(OAuthProvider.LINKEDIN, None)


async def test_oauth_linkedin_full_flow(
    client: AsyncClient, fake_linkedin: FakeLinkedInClient
) -> None:
    login = await client.get(
        "/auth/oauth/linkedin/login?role=recruiter",
        follow_redirects=False,
    )
    assert login.status_code == 307
    assert "fake-linkedin/auth" in login.headers["location"]
    state = login.headers["location"].split("state=")[1]

    r = await client.get(
        f"/auth/oauth/linkedin/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    assert r.status_code == 302
    assert "access_token" in r.cookies


# ---- RefreshToken DB record tests -----------------------------------------


async def test_login_creates_refresh_token_record(client, db_session):
    from sqlalchemy import select

    from models.refresh_token import RefreshToken

    await client.post(
        "/auth/register",
        json={"email": "rttest@test.com", "password": "password123", "role": "candidate"},
    )
    r = await client.post(
        "/auth/login", json={"email": "rttest@test.com", "password": "password123"}
    )
    assert r.status_code == 200
    result = await db_session.execute(select(RefreshToken))
    records = result.scalars().all()
    assert len(records) >= 1
    assert records[-1].revoked_at is None
