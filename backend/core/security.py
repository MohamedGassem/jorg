# backend/core/security.py
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import bcrypt
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from core.config import get_settings

_ALGORITHM = "HS256"


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _create_token(
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type.value,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    if extra:
        payload.update(extra)
    return str(jwt.encode(payload, get_settings().secret_key, algorithm=_ALGORITHM))


def create_access_token(
    subject: str,
    extra: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    delta = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    return _create_token(subject, TokenType.ACCESS, delta, extra)


def create_refresh_token(
    subject: str,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    delta = expires_delta or timedelta(days=settings.refresh_token_expire_days)
    return _create_token(subject, TokenType.REFRESH, delta)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload: dict[str, Any] = jwt.decode(
            token, get_settings().secret_key, algorithms=[_ALGORITHM]
        )
    except ExpiredSignatureError as e:
        raise ValueError("token expired") from e
    except JWTError as e:
        raise ValueError("invalid token signature") from e

    if payload.get("type") != expected_type.value:
        raise ValueError(f"wrong token type: expected {expected_type.value}")
    return payload
