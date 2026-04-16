# backend/services/oauth_service.py
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from models.user import OAuthProvider, User, UserRole


@dataclass
class OAuthUserInfo:
    provider: OAuthProvider
    subject: str  # provider's unique id
    email: str


class OAuthClient(Protocol):
    provider: OAuthProvider

    def authorization_url(self, state: str) -> str: ...
    async def exchange_code(self, code: str) -> OAuthUserInfo: ...


class GoogleOAuthClient:
    provider = OAuthProvider.GOOGLE

    def authorization_url(self, state: str) -> str:
        s = get_settings()
        params = {
            "client_id": s.google_client_id,
            "redirect_uri": s.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    async def exchange_code(self, code: str) -> OAuthUserInfo:
        s = get_settings()
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": s.google_client_id,
                    "client_secret": s.google_client_secret,
                    "redirect_uri": s.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_resp.raise_for_status()
            access_token = token_resp.json()["access_token"]

            profile = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile.raise_for_status()
            data = profile.json()
            return OAuthUserInfo(
                provider=OAuthProvider.GOOGLE,
                subject=data["sub"],
                email=data["email"],
            )


class LinkedInOAuthClient:
    provider = OAuthProvider.LINKEDIN

    def authorization_url(self, state: str) -> str:
        s = get_settings()
        params = {
            "response_type": "code",
            "client_id": s.linkedin_client_id,
            "redirect_uri": s.linkedin_redirect_uri,
            "state": state,
            "scope": "openid profile email",
        }
        return "https://www.linkedin.com/oauth/v2/authorization?" + urlencode(params)

    async def exchange_code(self, code: str) -> OAuthUserInfo:
        s = get_settings()
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(
                "https://www.linkedin.com/oauth/v2/accessToken",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": s.linkedin_redirect_uri,
                    "client_id": s.linkedin_client_id,
                    "client_secret": s.linkedin_client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            token_resp.raise_for_status()
            access_token = token_resp.json()["access_token"]

            profile = await client.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile.raise_for_status()
            data = profile.json()
            return OAuthUserInfo(
                provider=OAuthProvider.LINKEDIN,
                subject=data["sub"],
                email=data["email"],
            )


async def find_or_create_oauth_user(
    db: AsyncSession,
    info: OAuthUserInfo,
    default_role: UserRole,
) -> User:
    result = await db.execute(
        select(User).where(
            User.oauth_provider == info.provider,
            User.oauth_subject == info.subject,
        )
    )
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    result = await db.execute(select(User).where(User.email == info.email.lower()))
    user = result.scalar_one_or_none()
    if user is not None:
        user.oauth_provider = info.provider
        user.oauth_subject = info.subject
        user.email_verified = True
        await db.commit()
        await db.refresh(user)
        return user

    user = User(
        email=info.email.lower(),
        oauth_provider=info.provider,
        oauth_subject=info.subject,
        role=default_role,
        email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


_clients: dict[OAuthProvider, OAuthClient] = {}


def get_oauth_client(provider: OAuthProvider) -> OAuthClient:
    if provider not in _clients:
        if provider == OAuthProvider.GOOGLE:
            _clients[provider] = GoogleOAuthClient()
        else:
            _clients[provider] = _build_linkedin()
    return _clients[provider]


def override_oauth_client(provider: OAuthProvider, client: OAuthClient | None) -> None:
    """Test helper."""
    if client is None:
        _clients.pop(provider, None)
    else:
        _clients[provider] = client


def _build_linkedin() -> OAuthClient:
    return LinkedInOAuthClient()
