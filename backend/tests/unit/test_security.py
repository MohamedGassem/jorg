# backend/tests/unit/test_security.py
from core.security import hash_password, verify_password


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
