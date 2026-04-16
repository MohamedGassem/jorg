# backend/tests/unit/test_security.py
from datetime import timedelta
from uuid import uuid4

import pytest

from core.security import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_hash_password_produces_different_hash_each_call() -> None:
    h1 = hash_password("s3cret!")
    h2 = hash_password("s3cret!")
    assert h1 != h2  # bcrypt uses random salt
    assert h1.startswith("$2b$") or h1.startswith("$2a$")


def test_verify_password_accepts_correct_password() -> None:
    h = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", h) is True


def test_verify_password_rejects_wrong_password() -> None:
    h = hash_password("correct horse battery staple")
    assert verify_password("wrong password", h) is False


def test_create_access_token_can_be_decoded() -> None:
    user_id = uuid4()
    token = create_access_token(subject=str(user_id), extra={"role": "candidate"})

    payload = decode_token(token, expected_type=TokenType.ACCESS)

    assert payload["sub"] == str(user_id)
    assert payload["role"] == "candidate"
    assert payload["type"] == "access"


def test_create_refresh_token_has_type_refresh() -> None:
    token = create_refresh_token(subject=str(uuid4()))
    payload = decode_token(token, expected_type=TokenType.REFRESH)
    assert payload["type"] == "refresh"


def test_decode_token_rejects_wrong_type() -> None:
    access = create_access_token(subject=str(uuid4()))
    with pytest.raises(ValueError, match="token type"):
        decode_token(access, expected_type=TokenType.REFRESH)


def test_decode_token_rejects_expired_token() -> None:
    token = create_access_token(
        subject=str(uuid4()),
        expires_delta=timedelta(seconds=-1),
    )
    with pytest.raises(ValueError, match=r"expired|invalid"):
        decode_token(token, expected_type=TokenType.ACCESS)


def test_decode_token_rejects_tampered_token() -> None:
    token = create_access_token(subject=str(uuid4()))
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(ValueError, match=r"invalid|signature"):
        decode_token(tampered, expected_type=TokenType.ACCESS)
