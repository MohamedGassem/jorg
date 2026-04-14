# Plan 1 — Fondations Backend + Authentification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en place le socle backend FastAPI de Jorg (scaffolding, config, DB, migrations) et un système d'authentification complet (email/password + OAuth Google/LinkedIn) avec JWT access/refresh tokens, vérification email et reset password.

**Architecture:** FastAPI avec SQLAlchemy 2.x async + PostgreSQL 18.3. Séparation claire `api/` (routes fines), `services/` (logique métier testable), `core/` (config, DB, sécurité, email), `models/` (SQLAlchemy), `schemas/` (Pydantic I/O). Auth maison légère avec `python-jose` (JWT), `passlib[bcrypt]` (hash), `authlib` (OAuth). Tests d'intégration sur Postgres réel via `testcontainers`.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.x async, Alembic, PostgreSQL 18.3, Pydantic v2, pydantic-settings, python-jose, passlib[bcrypt], authlib, httpx, pytest, pytest-asyncio, testcontainers, ruff, mypy.

**Spec reference:** [../specs/2026-04-14-jorg-mvp-design.md](../specs/2026-04-14-jorg-mvp-design.md) (sections "Stack technique", "Authentification & portails").

---

## Structure de fichiers créés/modifiés

```
jorg/
├── docker-compose.yml                      CREATE  (Postgres 18.3 dev)
├── .env.example                            CREATE  (template variables env)
├── .gitignore                              CREATE
└── backend/
    ├── pyproject.toml                      CREATE  (dépendances + config tools)
    ├── alembic.ini                         CREATE
    ├── main.py                             CREATE  (entry point FastAPI)
    ├── alembic/
    │   ├── env.py                          CREATE  (async Alembic setup)
    │   └── versions/                       CREATE  (migrations générées)
    ├── core/
    │   ├── __init__.py                     CREATE
    │   ├── config.py                       CREATE  (Settings Pydantic)
    │   ├── database.py                     CREATE  (async engine + session)
    │   ├── security.py                     CREATE  (hash passwords + JWT)
    │   └── email.py                        CREATE  (envoi d'emails)
    ├── models/
    │   ├── __init__.py                     CREATE
    │   ├── base.py                         CREATE  (DeclarativeBase)
    │   └── user.py                         CREATE  (User model)
    ├── schemas/
    │   ├── __init__.py                     CREATE
    │   ├── auth.py                         CREATE  (Register/Login/Token)
    │   └── user.py                         CREATE  (UserRead)
    ├── services/
    │   ├── __init__.py                     CREATE
    │   ├── auth_service.py                 CREATE  (logique register/login/refresh)
    │   ├── email_verification_service.py   CREATE
    │   ├── password_reset_service.py       CREATE
    │   └── oauth_service.py                CREATE  (Google + LinkedIn)
    ├── api/
    │   ├── __init__.py                     CREATE
    │   ├── deps.py                         CREATE  (get_current_user, get_db)
    │   └── routes/
    │       ├── __init__.py                 CREATE
    │       └── auth.py                     CREATE  (tous endpoints /auth/*)
    └── tests/
        ├── __init__.py                     CREATE
        ├── conftest.py                     CREATE  (fixtures globales)
        ├── unit/
        │   ├── __init__.py                 CREATE
        │   └── test_security.py            CREATE
        └── integration/
            ├── __init__.py                 CREATE
            ├── conftest.py                 CREATE  (fixtures DB)
            └── test_auth_api.py            CREATE
```

**Principe de décomposition :** chaque fichier a une responsabilité unique. `services/` contient la logique métier testable indépendamment des routes HTTP. `api/routes/` reste fin (déléguation aux services).

---

## Prérequis

Avant de démarrer :
- Python 3.14 installé (`python --version` affiche 3.14.x)
- Docker + Docker Compose installés
- Git installé et repo initialisé à la racine `jorg/` (`git init` si nécessaire)
- `uv` installé pour gérer les dépendances Python (`pip install uv` ou via installer officiel)

---

## Task 1 : Scaffolding repo + .gitignore + docker-compose

**Files:**
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Créer `.gitignore`**

Fichier `.gitignore` à la racine :

```
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Env
.env
.env.local

# Node
node_modules/
.next/
dist/
build/

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Storage dev
storage/

# Claude Code (project-level settings)
.claude/
```

- [ ] **Step 2: Créer `docker-compose.yml` à la racine**

```yaml
services:
  postgres:
    image: postgres:18.3
    container_name: jorg-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: jorg
      POSTGRES_PASSWORD: jorg_dev_password
      POSTGRES_DB: jorg
    ports:
      - "5432:5432"
    volumes:
      - jorg_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jorg"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  jorg_pgdata:
```

- [ ] **Step 3: Créer `.env.example`**

```
# Database
DATABASE_URL=postgresql+asyncpg://jorg:jorg_dev_password@localhost:5432/jorg

# Security
SECRET_KEY=change-me-in-production-use-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# Email (console en dev)
EMAIL_BACKEND=console
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@jorg.local

# Frontend URL (pour les liens dans les emails)
FRONTEND_URL=http://localhost:3000

# OAuth Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/oauth/google/callback

# OAuth LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:8000/auth/oauth/linkedin/callback

# Env
ENV=development
```

- [ ] **Step 4: Démarrer Postgres et vérifier**

Run: `docker compose up -d postgres`
Expected: `Container jorg-postgres Started`

Run: `docker compose ps`
Expected: statut `running (healthy)` pour `jorg-postgres`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore docker-compose.yml .env.example
git commit -m "chore: initial repo scaffold with postgres dev container"
```

---

## Task 2 : Backend Python — pyproject.toml + structure

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/core/__init__.py`
- Create: `backend/models/__init__.py`
- Create: `backend/schemas/__init__.py`
- Create: `backend/services/__init__.py`
- Create: `backend/api/__init__.py`
- Create: `backend/api/routes/__init__.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/unit/__init__.py`
- Create: `backend/tests/integration/__init__.py`

- [ ] **Step 1: Créer `backend/pyproject.toml`**

```toml
[project]
name = "jorg-backend"
version = "0.1.0"
description = "Backend for Jorg - consulting skill profile platform"
requires-python = ">=3.14"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0.35",
    "asyncpg>=0.29",
    "alembic>=1.13",
    "pydantic>=2.9",
    "pydantic-settings>=2.5",
    "python-jose[cryptography]>=3.3",
    "passlib[bcrypt]>=1.7.4",
    "authlib>=1.3.2",
    "httpx>=0.27",
    "email-validator>=2.2",
    "structlog>=24.4",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "pytest-cov>=5.0",
    "testcontainers[postgres]>=4.8",
    "ruff>=0.6",
    "mypy>=1.11",
    "httpx>=0.27",
]

[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "SIM", "RUF"]

[tool.mypy]
python_version = "3.14"
strict = true
plugins = ["pydantic.mypy"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]

[tool.coverage.run]
source = ["."]
omit = ["tests/*", "alembic/*"]
```

- [ ] **Step 2: Créer les `__init__.py` vides**

Créer chaque fichier listé dans **Files** avec un contenu vide.

- [ ] **Step 3: Installer les dépendances**

Run: `cd backend && uv sync`
Expected: `.venv/` créé, dépendances installées sans erreur.

- [ ] **Step 4: Vérifier que Python peut importer FastAPI**

Run: `cd backend && uv run python -c "import fastapi; print(fastapi.__version__)"`
Expected: une version >= 0.115 affichée.

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/core backend/models backend/schemas backend/services backend/api backend/tests
git commit -m "chore(backend): initialize python project with dependencies"
```

---

## Task 3 : Configuration (core/config.py)

**Files:**
- Create: `backend/core/config.py`
- Create: `backend/tests/unit/test_config.py`

- [ ] **Step 1: Écrire le test `test_config.py`**

```python
# backend/tests/unit/test_config.py
import os

import pytest

from core.config import Settings


def test_settings_loads_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
    monkeypatch.setenv("SECRET_KEY", "test-secret-" + "x" * 32)
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://u:p@h:5432/d"
    assert settings.secret_key.startswith("test-secret-")
    assert settings.access_token_expire_minutes == 15  # default
    assert settings.refresh_token_expire_days == 30  # default


def test_settings_rejects_short_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
    monkeypatch.setenv("SECRET_KEY", "too-short")

    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings()
```

- [ ] **Step 2: Exécuter le test (doit échouer)**

Run: `cd backend && uv run pytest tests/unit/test_config.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'core.config'`.

- [ ] **Step 3: Écrire `core/config.py`**

```python
# backend/core/config.py
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    env: Literal["development", "test", "production"] = "development"

    database_url: str

    secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    email_backend: Literal["console", "smtp"] = "console"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    email_from: str = "noreply@jorg.local"

    frontend_url: str = "http://localhost:3000"

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/auth/oauth/google/callback"

    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    linkedin_redirect_uri: str = "http://localhost:8000/auth/oauth/linkedin/callback"

    @field_validator("secret_key")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
```

- [ ] **Step 4: Exécuter le test (doit passer)**

Run: `cd backend && uv run pytest tests/unit/test_config.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/config.py backend/tests/unit/test_config.py
git commit -m "feat(backend): add Settings with env loading and validation"
```

---

## Task 4 : Base SQLAlchemy et connexion DB (core/database.py + models/base.py)

**Files:**
- Create: `backend/models/base.py`
- Create: `backend/core/database.py`

- [ ] **Step 1: Créer `models/base.py`**

```python
# backend/models/base.py
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
```

- [ ] **Step 2: Créer `core/database.py`**

```python
# backend/core/database.py
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from core.config import get_settings


def _create_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        echo=settings.env == "development",
        pool_pre_ping=True,
    )


engine: AsyncEngine = _create_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
```

- [ ] **Step 3: Vérifier la connexion à Postgres**

Créer un `.env` depuis `.env.example` si pas déjà fait, puis :

Run: `cd backend && uv run python -c "import asyncio; from core.database import engine; asyncio.run(engine.connect())"`

(Attendu : pas d'erreur, commande se termine proprement. Si échec, vérifier que Postgres tourne : `docker compose ps`.)

- [ ] **Step 4: Commit**

```bash
git add backend/models/base.py backend/core/database.py
git commit -m "feat(backend): add async DB engine, session factory, declarative base"
```

---

## Task 5 : Modèle User + migration initiale Alembic

**Files:**
- Create: `backend/models/user.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/.gitkeep`
- Modify: `backend/models/__init__.py`

- [ ] **Step 1: Créer `models/user.py`**

```python
# backend/models/user.py
from enum import StrEnum

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserRole(StrEnum):
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"


class OAuthProvider(StrEnum):
    GOOGLE = "google"
    LINKEDIN = "linkedin"


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    oauth_provider: Mapped[OAuthProvider | None] = mapped_column(
        Enum(OAuthProvider, name="oauth_provider"), nullable=True
    )
    oauth_subject: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)

    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
```

- [ ] **Step 2: Exporter `User` depuis `models/__init__.py`**

```python
# backend/models/__init__.py
from models.base import Base
from models.user import OAuthProvider, User, UserRole

__all__ = ["Base", "OAuthProvider", "User", "UserRole"]
```

- [ ] **Step 3: Initialiser Alembic**

Run: `cd backend && uv run alembic init -t async alembic`
Expected: dossier `alembic/` créé avec `env.py`, `script.py.mako`, et `alembic.ini` à la racine de `backend/`.

- [ ] **Step 4: Configurer `alembic.ini`**

Dans `backend/alembic.ini`, remplacer la ligne `sqlalchemy.url = driver://...` par :

```ini
sqlalchemy.url =
```

(Laisser vide — l'URL sera lue depuis `Settings` dans `env.py`.)

- [ ] **Step 5: Réécrire `alembic/env.py`**

```python
# backend/alembic/env.py
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from core.config import get_settings
from models import Base  # noqa: F401 (ensure all models loaded)

config = context.config
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 6: Générer la migration initiale**

Run: `cd backend && uv run alembic revision --autogenerate -m "create users table"`
Expected: fichier créé dans `alembic/versions/` mentionnant la création de `users`, `user_role`, `oauth_provider`.

- [ ] **Step 7: Appliquer la migration**

Run: `cd backend && uv run alembic upgrade head`
Expected: `Running upgrade -> <hash>, create users table`.

Vérifier :

Run: `docker exec -i jorg-postgres psql -U jorg -d jorg -c "\dt"`
Expected: table `users` listée + `alembic_version`.

- [ ] **Step 8: Commit**

```bash
git add backend/alembic.ini backend/alembic backend/models/user.py backend/models/__init__.py
git commit -m "feat(backend): add User model and initial migration"
```

---

## Task 6 : Entry point FastAPI (main.py)

**Files:**
- Create: `backend/main.py`

- [ ] **Step 1: Créer `main.py`**

```python
# backend/main.py
from fastapi import FastAPI

from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
```

- [ ] **Step 2: Lancer le serveur**

Run: `cd backend && uv run uvicorn main:app --reload --port 8000`

Dans un autre terminal :

Run: `curl http://localhost:8000/health`
Expected: `{"status":"ok","env":"development"}`.

Stopper le serveur (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat(backend): add FastAPI entry point with health endpoint"
```

---

## Task 7 : Sécurité — hash de mot de passe (core/security.py partie 1)

**Files:**
- Create: `backend/core/security.py`
- Create: `backend/tests/unit/test_security.py`

- [ ] **Step 1: Écrire le test de hashing**

```python
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
```

- [ ] **Step 2: Exécuter le test (doit échouer)**

Run: `cd backend && uv run pytest tests/unit/test_security.py -v`
Expected: FAIL — `ModuleNotFoundError` ou `ImportError`.

- [ ] **Step 3: Créer `core/security.py` (partie hashing)**

```python
# backend/core/security.py
from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)
```

- [ ] **Step 4: Exécuter le test (doit passer)**

Run: `cd backend && uv run pytest tests/unit/test_security.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/security.py backend/tests/unit/test_security.py
git commit -m "feat(backend): add password hashing with bcrypt"
```

---

## Task 8 : Sécurité — JWT access + refresh tokens (core/security.py partie 2)

**Files:**
- Modify: `backend/core/security.py`
- Modify: `backend/tests/unit/test_security.py`

- [ ] **Step 1: Ajouter les tests JWT**

Ajouter à `backend/tests/unit/test_security.py` :

```python
from datetime import timedelta
from uuid import uuid4

import pytest

from core.security import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
)


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
    with pytest.raises(ValueError, match="expired|invalid"):
        decode_token(token, expected_type=TokenType.ACCESS)


def test_decode_token_rejects_tampered_token() -> None:
    token = create_access_token(subject=str(uuid4()))
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(ValueError, match="invalid|signature"):
        decode_token(tampered, expected_type=TokenType.ACCESS)
```

- [ ] **Step 2: Exécuter (doit échouer)**

Run: `cd backend && uv run pytest tests/unit/test_security.py -v`
Expected: 5 nouveaux échecs (ImportError sur `create_access_token` etc.).

- [ ] **Step 3: Ajouter la partie JWT à `core/security.py`**

Remplacer le contenu de `backend/core/security.py` par :

```python
# backend/core/security.py
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from passlib.context import CryptContext

from core.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_ALGORITHM = "HS256"


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


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
    return jwt.encode(payload, get_settings().secret_key, algorithm=_ALGORITHM)


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
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[_ALGORITHM])
    except ExpiredSignatureError as e:
        raise ValueError("token expired") from e
    except JWTError as e:
        raise ValueError("invalid token signature") from e

    if payload.get("type") != expected_type.value:
        raise ValueError(f"wrong token type: expected {expected_type.value}")
    return payload
```

- [ ] **Step 4: Exécuter les tests (doit passer)**

Run: `cd backend && uv run pytest tests/unit/test_security.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/security.py backend/tests/unit/test_security.py
git commit -m "feat(backend): add JWT access/refresh tokens with encode/decode"
```

---

## Task 9 : Email sender (core/email.py)

**Files:**
- Create: `backend/core/email.py`
- Create: `backend/tests/unit/test_email.py`

- [ ] **Step 1: Écrire les tests**

```python
# backend/tests/unit/test_email.py
from core.email import ConsoleEmailBackend, EmailMessage


def test_console_backend_captures_messages() -> None:
    backend = ConsoleEmailBackend()
    msg = EmailMessage(
        to="alice@example.com",
        subject="Hello",
        body="Welcome, Alice!",
    )
    backend.send(msg)
    assert len(backend.sent) == 1
    assert backend.sent[0].to == "alice@example.com"
    assert backend.sent[0].subject == "Hello"
```

- [ ] **Step 2: Exécuter (doit échouer)**

Run: `cd backend && uv run pytest tests/unit/test_email.py -v`
Expected: FAIL ImportError.

- [ ] **Step 3: Créer `core/email.py`**

```python
# backend/core/email.py
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import structlog

from core.config import get_settings

logger = structlog.get_logger()


@dataclass
class EmailMessage:
    to: str
    subject: str
    body: str
    from_: str | None = None


class EmailBackend(ABC):
    @abstractmethod
    def send(self, message: EmailMessage) -> None: ...


@dataclass
class ConsoleEmailBackend(EmailBackend):
    sent: list[EmailMessage] = field(default_factory=list)

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)
        logger.info(
            "email.send.console",
            to=message.to,
            subject=message.subject,
            body_preview=message.body[:200],
        )


class SmtpEmailBackend(EmailBackend):
    def send(self, message: EmailMessage) -> None:
        import smtplib
        from email.mime.text import MIMEText

        settings = get_settings()
        assert settings.smtp_host, "SMTP_HOST required for smtp backend"

        msg = MIMEText(message.body, "plain", "utf-8")
        msg["Subject"] = message.subject
        msg["From"] = message.from_ or settings.email_from
        msg["To"] = message.to

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
            smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)


_backend: EmailBackend | None = None


def get_email_backend() -> EmailBackend:
    global _backend
    if _backend is None:
        settings = get_settings()
        _backend = ConsoleEmailBackend() if settings.email_backend == "console" else SmtpEmailBackend()
    return _backend


def override_email_backend(backend: EmailBackend | None) -> None:
    """Test helper: override le singleton backend."""
    global _backend
    _backend = backend
```

- [ ] **Step 4: Exécuter les tests**

Run: `cd backend && uv run pytest tests/unit/test_email.py -v`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/email.py backend/tests/unit/test_email.py
git commit -m "feat(backend): add email backend abstraction (console + smtp)"
```

---

## Task 10 : Schemas Pydantic auth (schemas/auth.py + schemas/user.py)

**Files:**
- Create: `backend/schemas/auth.py`
- Create: `backend/schemas/user.py`

- [ ] **Step 1: Créer `schemas/user.py`**

```python
# backend/schemas/user.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from models.user import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    role: UserRole
    email_verified: bool
    is_active: bool
    created_at: datetime
```

- [ ] **Step 2: Créer `schemas/auth.py`**

```python
# backend/schemas/auth.py
from pydantic import BaseModel, EmailStr, Field

from models.user import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class VerifyEmailRequest(BaseModel):
    token: str


class RequestPasswordResetRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
```

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/auth.py backend/schemas/user.py
git commit -m "feat(backend): add auth and user pydantic schemas"
```

---

## Task 11 : Fixtures de tests d'intégration (conftest.py)

**Files:**
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/integration/conftest.py`

- [ ] **Step 1: Créer `tests/conftest.py` (fixtures globales)**

```python
# backend/tests/conftest.py
import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-xxxxxxxxxxxxxxx")
os.environ.setdefault("ENV", "test")
os.environ.setdefault("EMAIL_BACKEND", "console")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
```

- [ ] **Step 2: Créer `tests/integration/conftest.py`**

```python
# backend/tests/integration/conftest.py
from collections.abc import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

from api.deps import get_db
from core.email import ConsoleEmailBackend, override_email_backend
from main import app
from models import Base


@pytest.fixture(scope="session")
def postgres_container() -> Generator[PostgresContainer, None, None]:
    with PostgresContainer("postgres:18.3", driver="asyncpg") as pg:
        yield pg


@pytest_asyncio.fixture
async def db_engine(postgres_container: PostgresContainer):  # noqa: ANN201
    url = postgres_container.get_connection_url()
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:  # noqa: ANN001
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    email_backend = ConsoleEmailBackend()
    override_email_backend(email_backend)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.email_backend = email_backend  # type: ignore[attr-defined]
        yield ac

    app.dependency_overrides.clear()
    override_email_backend(None)
```

- [ ] **Step 3: Vérifier que les fixtures chargent**

Run: `cd backend && uv run pytest tests/integration --collect-only`
Expected: `no tests ran` (pas encore de test), mais sans erreur d'import.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/conftest.py backend/tests/integration/conftest.py
git commit -m "test(backend): add testcontainers postgres fixtures and test client"
```

---

## Task 12 : Dépendance `get_current_user` (api/deps.py)

**Files:**
- Create: `backend/api/deps.py`

- [ ] **Step 1: Créer `api/deps.py`**

```python
# backend/api/deps.py
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import TokenType, decode_token
from models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=True)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        payload = decode_token(token, expected_type=TokenType.ACCESS)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token subject",
        ) from e

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found or inactive",
        )
    return user


def require_role(role: UserRole):  # noqa: ANN201
    async def _dep(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"role {role.value} required",
            )
        return current_user

    return _dep


CurrentUser = Annotated[User, Depends(get_current_user)]
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/deps.py
git commit -m "feat(backend): add get_current_user and role-based auth dependencies"
```

---

## Task 13 : Register endpoint (services + route)

**Files:**
- Create: `backend/services/auth_service.py`
- Create: `backend/api/routes/auth.py`
- Modify: `backend/main.py`
- Create: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Écrire le test d'intégration**

```python
# backend/tests/integration/test_auth_api.py
from httpx import AsyncClient


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
    assert any("ver@ex.com" == m.to and "verif" in m.subject.lower() for m in sent)
```

- [ ] **Step 2: Exécuter (doit échouer)**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: erreurs 404 ou import errors.

- [ ] **Step 3: Créer `services/auth_service.py`**

```python
# backend/services/auth_service.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import hash_password
from models.user import User, UserRole


class EmailAlreadyRegisteredError(Exception):
    pass


async def register_user(
    db: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none() is not None:
        raise EmailAlreadyRegisteredError(email)

    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
```

- [ ] **Step 4: Créer un service de vérification email (squelette)**

```python
# backend/services/email_verification_service.py
from datetime import UTC, datetime, timedelta

from core.config import get_settings
from core.email import EmailMessage, get_email_backend
from core.security import create_access_token, decode_token, TokenType
from models.user import User

EMAIL_VERIFY_EXPIRE_HOURS = 24


def _create_verification_token(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        extra={"purpose": "email_verification"},
        expires_delta=timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS),
    )


def send_verification_email(user: User) -> str:
    """Envoie le mail et retourne le token (utile pour les tests)."""
    token = _create_verification_token(user)
    link = f"{get_settings().frontend_url}/verify-email?token={token}"
    message = EmailMessage(
        to=user.email,
        subject="Vérifiez votre email Jorg",
        body=f"Bonjour,\n\nCliquez pour vérifier votre email : {link}\n\nCe lien expire dans {EMAIL_VERIFY_EXPIRE_HOURS}h.",
    )
    get_email_backend().send(message)
    return token


def decode_verification_token(token: str) -> str:
    """Retourne l'user_id (str UUID) si le token est valide et a le bon purpose."""
    payload = decode_token(token, expected_type=TokenType.ACCESS)
    if payload.get("purpose") != "email_verification":
        raise ValueError("wrong token purpose")
    return payload["sub"]
```

- [ ] **Step 5: Créer `api/routes/auth.py` (route register)**

```python
# backend/api/routes/auth.py
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from schemas.auth import RegisterRequest
from schemas.user import UserRead
from services.auth_service import EmailAlreadyRegisteredError, register_user
from services.email_verification_service import send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    try:
        user = await register_user(db, payload.email, payload.password, payload.role)
    except EmailAlreadyRegisteredError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email already registered",
        ) from e

    send_verification_email(user)
    return UserRead.model_validate(user)
```

- [ ] **Step 6: Brancher le router dans `main.py`**

Remplacer le contenu de `backend/main.py` :

```python
# backend/main.py
from fastapi import FastAPI

from api.routes.auth import router as auth_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")
app.include_router(auth_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
```

- [ ] **Step 7: Exécuter les tests (doit passer)**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/services/auth_service.py backend/services/email_verification_service.py backend/api/routes/auth.py backend/main.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add register endpoint with email verification mail"
```

---

## Task 14 : Login endpoint

**Files:**
- Modify: `backend/services/auth_service.py`
- Modify: `backend/api/routes/auth.py`
- Modify: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Ajouter tests login**

Ajouter à `backend/tests/integration/test_auth_api.py` :

```python
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
```

- [ ] **Step 2: Exécuter (doit échouer)**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py::test_login_with_valid_credentials_returns_tokens -v`
Expected: FAIL 404.

- [ ] **Step 3: Ajouter fonction `authenticate_user` dans `auth_service.py`**

Ajouter à la fin de `backend/services/auth_service.py` :

```python
from core.security import create_access_token, create_refresh_token, verify_password


class InvalidCredentialsError(Exception):
    pass


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or user.hashed_password is None:
        raise InvalidCredentialsError()
    if not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError()
    if not user.is_active:
        raise InvalidCredentialsError()
    return user


def issue_token_pair(user: User) -> tuple[str, str]:
    access = create_access_token(
        subject=str(user.id),
        extra={"role": user.role.value},
    )
    refresh = create_refresh_token(subject=str(user.id))
    return access, refresh
```

- [ ] **Step 4: Ajouter la route login**

Ajouter à `backend/api/routes/auth.py` :

```python
from schemas.auth import LoginRequest, TokenPair
from services.auth_service import InvalidCredentialsError, authenticate_user, issue_token_pair


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    try:
        user = await authenticate_user(db, payload.email, payload.password)
    except InvalidCredentialsError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        ) from e

    access, refresh = issue_token_pair(user)
    return TokenPair(access_token=access, refresh_token=refresh)
```

- [ ] **Step 5: Exécuter tous les tests auth**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/services/auth_service.py backend/api/routes/auth.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add login endpoint returning JWT access+refresh tokens"
```

---

## Task 15 : Refresh token endpoint

**Files:**
- Modify: `backend/api/routes/auth.py`
- Modify: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Ajouter tests**

Ajouter à `backend/tests/integration/test_auth_api.py` :

```python
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
```

- [ ] **Step 2: Ajouter la route refresh**

Ajouter à `backend/api/routes/auth.py` :

```python
from uuid import UUID

from sqlalchemy import select

from core.security import TokenType, decode_token
from models.user import User
from schemas.auth import RefreshRequest


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(
    payload: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type=TokenType.REFRESH)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        ) from e

    user_id = UUID(claims["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found or inactive",
        )

    access, new_refresh = issue_token_pair(user)
    return TokenPair(access_token=access, refresh_token=new_refresh)
```

- [ ] **Step 3: Exécuter les tests**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: 10 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/api/routes/auth.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add refresh token endpoint"
```

---

## Task 16 : Verify email endpoint

**Files:**
- Modify: `backend/services/email_verification_service.py`
- Modify: `backend/api/routes/auth.py`
- Modify: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Ajouter tests**

Ajouter à `backend/tests/integration/test_auth_api.py` :

```python
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
```

- [ ] **Step 2: Ajouter la fonction de confirmation**

Ajouter à `backend/services/email_verification_service.py` :

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID


class InvalidVerificationTokenError(Exception):
    pass


async def confirm_email(db: AsyncSession, token: str) -> User:
    try:
        user_id_str = decode_verification_token(token)
    except ValueError as e:
        raise InvalidVerificationTokenError(str(e)) from e

    result = await db.execute(select(User).where(User.id == UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if user is None:
        raise InvalidVerificationTokenError("user not found")

    user.email_verified = True
    await db.commit()
    await db.refresh(user)
    return user
```

- [ ] **Step 3: Ajouter route verify-email + route /me**

Ajouter à `backend/api/routes/auth.py` :

```python
from api.deps import CurrentUser
from schemas.auth import VerifyEmailRequest
from services.email_verification_service import (
    InvalidVerificationTokenError,
    confirm_email,
)


@router.post("/verify-email", response_model=UserRead)
async def verify_email(
    payload: VerifyEmailRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    try:
        user = await confirm_email(db, payload.token)
    except InvalidVerificationTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid verification token: {e}",
        ) from e
    return UserRead.model_validate(user)


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)
```

- [ ] **Step 4: Exécuter les tests**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/services/email_verification_service.py backend/api/routes/auth.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add email verification and /auth/me endpoints"
```

---

## Task 17 : Password reset flow

**Files:**
- Create: `backend/services/password_reset_service.py`
- Modify: `backend/api/routes/auth.py`
- Modify: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Ajouter tests**

Ajouter à `backend/tests/integration/test_auth_api.py` :

```python
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

    old = await client.post(
        "/auth/login", json={"email": "cp@ex.com", "password": "securepass123"}
    )
    assert old.status_code == 401

    new = await client.post(
        "/auth/login", json={"email": "cp@ex.com", "password": "brandnewpass456"}
    )
    assert new.status_code == 200
```

- [ ] **Step 2: Créer `services/password_reset_service.py`**

```python
# backend/services/password_reset_service.py
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.email import EmailMessage, get_email_backend
from core.security import TokenType, create_access_token, decode_token, hash_password
from models.user import User

PASSWORD_RESET_EXPIRE_HOURS = 1


class InvalidResetTokenError(Exception):
    pass


def _create_reset_token(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        extra={"purpose": "password_reset"},
        expires_delta=timedelta(hours=PASSWORD_RESET_EXPIRE_HOURS),
    )


async def request_password_reset(db: AsyncSession, email: str) -> None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        return  # silent - ne pas divulguer l'existence du compte

    token = _create_reset_token(user)
    link = f"{get_settings().frontend_url}/reset-password?token={token}"
    message = EmailMessage(
        to=user.email,
        subject="Réinitialisation de votre mot de passe Jorg",
        body=(
            "Bonjour,\n\n"
            f"Cliquez pour réinitialiser votre mot de passe : {link}\n\n"
            f"Ce lien expire dans {PASSWORD_RESET_EXPIRE_HOURS}h."
        ),
    )
    get_email_backend().send(message)


async def reset_password(db: AsyncSession, token: str, new_password: str) -> User:
    try:
        payload = decode_token(token, expected_type=TokenType.ACCESS)
    except ValueError as e:
        raise InvalidResetTokenError(str(e)) from e

    if payload.get("purpose") != "password_reset":
        raise InvalidResetTokenError("wrong token purpose")

    result = await db.execute(select(User).where(User.id == UUID(payload["sub"])))
    user = result.scalar_one_or_none()
    if user is None:
        raise InvalidResetTokenError("user not found")

    user.hashed_password = hash_password(new_password)
    await db.commit()
    await db.refresh(user)
    return user
```

- [ ] **Step 3: Ajouter les routes**

Ajouter à `backend/api/routes/auth.py` :

```python
from fastapi import Response

from schemas.auth import RequestPasswordResetRequest, ResetPasswordRequest
from services.password_reset_service import (
    InvalidResetTokenError,
    request_password_reset,
    reset_password,
)


@router.post("/request-password-reset", status_code=status.HTTP_204_NO_CONTENT)
async def request_reset(
    payload: RequestPasswordResetRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await request_password_reset(db, payload.email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def perform_reset(
    payload: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    try:
        await reset_password(db, payload.token, payload.new_password)
    except InvalidResetTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid reset token: {e}",
        ) from e
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Exécuter les tests**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: 15 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/services/password_reset_service.py backend/api/routes/auth.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add password reset flow (request + perform)"
```

---

## Task 18 : OAuth Google — service + routes

**Files:**
- Create: `backend/services/oauth_service.py`
- Modify: `backend/api/routes/auth.py`
- Modify: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Créer `services/oauth_service.py`**

```python
# backend/services/oauth_service.py
from dataclasses import dataclass
from typing import Protocol

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
        from urllib.parse import urlencode
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
        _clients[provider] = GoogleOAuthClient() if provider == OAuthProvider.GOOGLE else _build_linkedin()
    return _clients[provider]


def override_oauth_client(provider: OAuthProvider, client: OAuthClient | None) -> None:
    """Test helper."""
    if client is None:
        _clients.pop(provider, None)
    else:
        _clients[provider] = client


def _build_linkedin() -> OAuthClient:
    # placeholder, défini dans Task 19
    raise NotImplementedError("LinkedIn client added in Task 19")
```

- [ ] **Step 2: Ajouter tests OAuth Google (mock client)**

Ajouter à `backend/tests/integration/test_auth_api.py` :

```python
import pytest

from models.user import OAuthProvider, UserRole
from services.oauth_service import (
    OAuthClient,
    OAuthUserInfo,
    override_oauth_client,
)


class FakeGoogleClient:
    provider = OAuthProvider.GOOGLE

    def __init__(self, info: OAuthUserInfo) -> None:
        self.info = info

    def authorization_url(self, state: str) -> str:
        return f"https://fake-google/auth?state={state}"

    async def exchange_code(self, code: str) -> OAuthUserInfo:
        return self.info


@pytest.fixture
def fake_google():  # noqa: ANN201
    info = OAuthUserInfo(
        provider=OAuthProvider.GOOGLE,
        subject="google-123",
        email="gauth@ex.com",
    )
    client = FakeGoogleClient(info)
    override_oauth_client(OAuthProvider.GOOGLE, client)  # type: ignore[arg-type]
    yield client
    override_oauth_client(OAuthProvider.GOOGLE, None)


async def test_oauth_google_login_redirects(client: AsyncClient, fake_google) -> None:  # noqa: ANN001
    r = await client.get(
        "/auth/oauth/google/login?role=candidate",
        follow_redirects=False,
    )
    assert r.status_code == 307
    assert "fake-google/auth" in r.headers["location"]


async def test_oauth_google_callback_creates_user_and_returns_tokens(
    client: AsyncClient, fake_google  # noqa: ANN001
) -> None:
    login = await client.get(
        "/auth/oauth/google/login?role=candidate",
        follow_redirects=False,
    )
    state = login.headers["location"].split("state=")[1]

    r = await client.get(
        f"/auth/oauth/google/callback?code=fake-code&state={state}",
    )
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
    assert data["refresh_token"]
```

- [ ] **Step 3: Ajouter les routes OAuth**

Ajouter à `backend/api/routes/auth.py` :

```python
import secrets

from fastapi import Query
from fastapi.responses import RedirectResponse

from models.user import OAuthProvider, UserRole
from services.oauth_service import find_or_create_oauth_user, get_oauth_client

# Simple in-memory state store (suffisant pour MVP single-instance).
# À remplacer par Redis quand on passera en multi-process.
_oauth_states: dict[str, UserRole] = {}


@router.get("/oauth/{provider}/login")
async def oauth_login(
    provider: OAuthProvider,
    role: Annotated[UserRole, Query()],
) -> RedirectResponse:
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = role
    client = get_oauth_client(provider)
    return RedirectResponse(url=client.authorization_url(state), status_code=307)


@router.get("/oauth/{provider}/callback", response_model=TokenPair)
async def oauth_callback(
    provider: OAuthProvider,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    role = _oauth_states.pop(state, None)
    if role is None:
        raise HTTPException(status_code=400, detail="invalid or expired state")

    client = get_oauth_client(provider)
    info = await client.exchange_code(code)
    user = await find_or_create_oauth_user(db, info, default_role=role)

    access, refresh = issue_token_pair(user)
    return TokenPair(access_token=access, refresh_token=refresh)
```

- [ ] **Step 4: Exécuter les tests**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: 17 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/services/oauth_service.py backend/api/routes/auth.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add OAuth Google login + callback"
```

---

## Task 19 : OAuth LinkedIn

**Files:**
- Modify: `backend/services/oauth_service.py`
- Modify: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Remplacer `_build_linkedin` dans `oauth_service.py`**

Remplacer la fonction stub `_build_linkedin` par une classe complète. Ajouter cette classe avant `_build_linkedin` dans `backend/services/oauth_service.py` :

```python
class LinkedInOAuthClient:
    provider = OAuthProvider.LINKEDIN

    def authorization_url(self, state: str) -> str:
        s = get_settings()
        from urllib.parse import urlencode
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
```

Puis remplacer :

```python
def _build_linkedin() -> OAuthClient:
    raise NotImplementedError("LinkedIn client added in Task 19")
```

par :

```python
def _build_linkedin() -> OAuthClient:
    return LinkedInOAuthClient()
```

- [ ] **Step 2: Ajouter tests LinkedIn (mock)**

Ajouter à `backend/tests/integration/test_auth_api.py` :

```python
class FakeLinkedInClient:
    provider = OAuthProvider.LINKEDIN

    def __init__(self, info: OAuthUserInfo) -> None:
        self.info = info

    def authorization_url(self, state: str) -> str:
        return f"https://fake-linkedin/auth?state={state}"

    async def exchange_code(self, code: str) -> OAuthUserInfo:
        return self.info


@pytest.fixture
def fake_linkedin():  # noqa: ANN201
    info = OAuthUserInfo(
        provider=OAuthProvider.LINKEDIN,
        subject="li-456",
        email="liauth@ex.com",
    )
    client = FakeLinkedInClient(info)
    override_oauth_client(OAuthProvider.LINKEDIN, client)  # type: ignore[arg-type]
    yield client
    override_oauth_client(OAuthProvider.LINKEDIN, None)


async def test_oauth_linkedin_full_flow(
    client: AsyncClient, fake_linkedin  # noqa: ANN001
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
    )
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
```

- [ ] **Step 3: Exécuter tests**

Run: `cd backend && uv run pytest tests/integration/test_auth_api.py -v`
Expected: 18 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/services/oauth_service.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add OAuth LinkedIn login + callback"
```

---

## Task 20 : CI GitHub Actions (lint + tests)

**Files:**
- Create: `.github/workflows/backend-ci.yml`

- [ ] **Step 1: Créer `.github/workflows/backend-ci.yml`**

```yaml
name: Backend CI

on:
  push:
    branches: [main]
    paths:
      - "backend/**"
      - ".github/workflows/backend-ci.yml"
  pull_request:
    paths:
      - "backend/**"
      - ".github/workflows/backend-ci.yml"

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3

      - name: Set up Python 3.14
        run: uv python install 3.14

      - name: Install dependencies
        run: uv sync --all-extras

      - name: Ruff
        run: uv run ruff check .

      - name: Ruff format check
        run: uv run ruff format --check .

      - name: Mypy
        run: uv run mypy .

      - name: Pytest
        run: uv run pytest -v --cov=. --cov-report=term-missing
```

- [ ] **Step 2: Vérifier localement que lint + tests passent**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy . && uv run pytest -v`
Expected: tout passe.

Si `ruff format --check` échoue, lancer `uv run ruff format .` et recommit.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backend-ci.yml
git commit -m "ci: add github actions workflow for backend lint and tests"
```

---

## Task 21 : README de plan 1

**Files:**
- Create: `backend/README.md`

- [ ] **Step 1: Créer `backend/README.md`**

```markdown
# Jorg Backend

FastAPI backend for Jorg. Python 3.14 + SQLAlchemy 2.x async + PostgreSQL 18.3.

## Setup

```bash
# Depuis la racine du repo :
cp .env.example .env
docker compose up -d postgres

# Puis :
cd backend
uv sync
uv run alembic upgrade head
```

## Run dev server

```bash
uv run uvicorn main:app --reload --port 8000
```

API : http://localhost:8000
Docs interactives : http://localhost:8000/docs

## Tests

```bash
uv run pytest -v
```

## Migrations

```bash
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
```

## Lint & format

```bash
uv run ruff check .
uv run ruff format .
uv run mypy .
```

## Auth endpoints disponibles (Plan 1)

- `POST /auth/register` — email/password
- `POST /auth/login` — retourne access + refresh
- `POST /auth/refresh`
- `POST /auth/verify-email`
- `POST /auth/request-password-reset`
- `POST /auth/reset-password`
- `GET /auth/me` — profil de l'utilisateur courant
- `GET /auth/oauth/{google,linkedin}/login?role=candidate|recruiter`
- `GET /auth/oauth/{google,linkedin}/callback`
```

- [ ] **Step 2: Commit**

```bash
git add backend/README.md
git commit -m "docs(backend): add backend README with setup and endpoint list"
```

---

## Vérification finale

- [ ] **Toute la suite de tests passe**

Run: `cd backend && uv run pytest -v`
Expected: tous les tests verts (≥ 25 tests).

- [ ] **Aucune erreur de lint / types**

Run: `cd backend && uv run ruff check . && uv run mypy .`
Expected: aucune erreur.

- [ ] **Le serveur démarre et `/health` répond**

Run: `cd backend && uv run uvicorn main:app --port 8000` puis `curl http://localhost:8000/health`.
Expected: `{"status":"ok","env":"development"}`.

- [ ] **Les migrations Alembic sont cohérentes**

Run: `cd backend && uv run alembic current`
Expected: affiche le hash de la migration courante.

---

## Ce qui est livré à la fin du Plan 1

- Backend FastAPI fonctionnel avec entry point `main.py` et `/health`.
- Base de données PostgreSQL 18.3 avec migration Alembic pour la table `users`.
- Modèle `User` (candidate/recruiter, OAuth ready, email_verified, is_active).
- Configuration via `Settings` Pydantic depuis `.env`.
- Hashing bcrypt et JWT access+refresh tokens testés unitairement.
- Backend email abstrait (console dev / SMTP prod).
- Flux d'authentification complet : register, login, refresh, verify email, password reset.
- OAuth Google et LinkedIn (flow authorization code + création/liaison d'utilisateur).
- Dépendance `get_current_user` et `require_role` pour protéger les endpoints.
- Tests unitaires (`security`, `email`, `config`) et d'intégration Postgres réelle via `testcontainers`.
- CI GitHub Actions (lint + format + types + tests).
- README documentant le setup.

## Ce qui reste à faire (plans suivants)

- Plan 2 : profil candidat complet (CRUD `CandidateProfile` + Experience, Skill, Education, etc.).
- Plan 3 : organizations + profil recruteur + templates (upload Word, détection placeholders, mapping).
- Plan 4 : flux invitation + AccessGrant (acceptation, révocation).
- Plan 5 : génération `.docx` + conversion PDF.
- Plan 6 : frontend Next.js (portails candidate + recruiter).
