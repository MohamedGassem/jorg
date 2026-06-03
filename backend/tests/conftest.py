# backend/tests/conftest.py
import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-xxxxxxxxxxxxxxx")
os.environ.setdefault("ENV", "test")
os.environ.setdefault("EMAIL_BACKEND", "console")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("ALPHA_INVITE_REQUIRED", "false")
