# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le projet déployable sur une VM unique (Render/Railway/Fly.io) avec de vraies données, en corrigeant le stockage de fichiers éphémère, la conversion PDF LibreOffice, l'OAuth state en mémoire, et en ajoutant rate limiting et couverture de tests calibrée.

**Architecture:** StorageBackend abstrait (Local pour dev, S3/R2 pour prod) pour les documents générés. Gotenberg microservice pour PDF via HTTP. OAuth state migré en DB. Rate limiting slowapi en mémoire. Templates Word restent en local (lus par docxtpl au moment de la génération).

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, slowapi, boto3, httpx (déjà présent), pytest-asyncio, Cloudflare R2 / AWS S3

---

## Fichiers créés / modifiés

| Action   | Fichier                                                | Responsabilité                                                        |
| -------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Créer    | `.env.example`                                         | Variables d'environnement de référence                                |
| Créer    | `docs/deployment.md`                                   | Guide de déploiement                                                  |
| Modifier | `backend/pyproject.toml`                               | Dépendances slowapi + boto3, seuil coverage                           |
| Créer    | `backend/core/limiter.py`                              | Instance slowapi Limiter (évite l'import circulaire)                  |
| Modifier | `backend/main.py`                                      | Setup limiter slowapi                                                 |
| Modifier | `backend/api/routes/auth.py`                           | Décorateurs rate limit + OAuth state DB                               |
| Modifier | `backend/api/routes/generation.py`                     | Décorateur rate limit + download via storage                          |
| Créer    | `backend/models/oauth_state.py`                        | Modèle OAuthState                                                     |
| Modifier | `backend/models/__init__.py`                           | Enregistrer OAuthState                                                |
| Créer    | `backend/services/oauth_state_service.py`              | create_state / consume_state                                          |
| Créer    | `backend/alembic/versions/XXXX_create_oauth_states.py` | Migration oauth_states                                                |
| Modifier | `backend/core/storage.py`                              | StorageBackend + LocalStorageBackend + S3StorageBackend + get_storage |
| Modifier | `backend/core/config.py`                               | Settings S3 + GOTENBERG_URL                                           |
| Modifier | `backend/services/generation_service.py`               | Utilise get_storage() + Gotenberg async                               |
| Créer    | `docker-compose.yml`                                   | App + Gotenberg sidecar                                               |
| Créer    | `backend/tests/unit/test_storage.py`                   | Tests StorageBackend                                                  |
| Créer    | `backend/tests/unit/test_oauth_state_service.py`       | Tests oauth_state_service                                             |

---

## Task 1 : Secrets & docs de déploiement

**Files:**

- Create: `.env.example`
- Create: `docs/deployment.md`

> Note: `secret_key` validator (`len >= 32`) est déjà en place dans `backend/core/config.py:46-51`. Aucun code à modifier.

- [ ] **Step 1 : Vérifier que `.env` est dans `.gitignore`**

```bash
grep "^\.env$" .gitignore
```

Résultat attendu : `.env` (la ligne existe). Si absent, ajouter la ligne.

- [ ] **Step 2 : Créer `.env.example` à la racine du projet**

```
# .env.example — copier en .env et remplir les valeurs

ENV=development

DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/jorg
SECRET_KEY=change-me-to-a-random-string-of-at-least-32-chars

# Storage: "local" (dev) or "s3" (production)
STORAGE_BACKEND=local
S3_BUCKET_NAME=
S3_ENDPOINT_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=auto

# Gotenberg PDF service (laisser vide pour désactiver)
GOTENBERG_URL=

# Email
EMAIL_BACKEND=console
EMAIL_FROM=noreply@jorg.local
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000"]

# OAuth Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/oauth/google/callback

# OAuth LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:8000/auth/oauth/linkedin/callback
```

- [ ] **Step 3 : Créer `docs/deployment.md`**

```markdown
# Guide de déploiement — Jorg

## Variables d'environnement obligatoires

| Variable       | Description                                       |
| -------------- | ------------------------------------------------- |
| `DATABASE_URL` | URL PostgreSQL async (`postgresql+asyncpg://...`) |
| `SECRET_KEY`   | Clé aléatoire ≥ 32 caractères                     |
| `ENV`          | `production` pour activer les cookies secure      |
| `FRONTEND_URL` | URL publique du frontend                          |
| `CORS_ORIGINS` | JSON array des origines autorisées                |

## Stockage fichiers (documents générés)

### Local (dev uniquement)
```

STORAGE_BACKEND=local

```
Les fichiers sont sauvegardés dans `backend/uploads/`. **Éphémère sur les PaaS.**

### S3 / Cloudflare R2 (production)
1. Créer un bucket R2 sur [dash.cloudflare.com](https://dash.cloudflare.com) → R2
2. Créer une API token R2 avec permission "Object Read & Write"
3. Configurer :
```

STORAGE_BACKEND=s3
S3_BUCKET_NAME=<nom-du-bucket>
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<clé>
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=auto

```

## Conversion PDF (Gotenberg)

Gotenberg tourne en sidecar Docker sur le port 3000 :
```

GOTENBERG_URL=http://gotenberg:3000

````
Sans cette variable, seule la génération DOCX est disponible.

## Déploiement avec docker-compose

```bash
cp .env.example .env
# Remplir .env

docker-compose up -d
docker-compose exec api alembic upgrade head
````

## Checklist avant mise en ligne

- [ ] `SECRET_KEY` est aléatoire et ≥ 32 caractères
- [ ] `ENV=production`
- [ ] `DATABASE_URL` pointe vers la vraie DB PostgreSQL
- [ ] `STORAGE_BACKEND=s3` + credentials R2 configurés
- [ ] `FRONTEND_URL` et `CORS_ORIGINS` pointent vers le domaine de production
- [ ] OAuth Google/LinkedIn : redirect URIs mises à jour dans les consoles développeur

````

- [ ] **Step 4 : Commiter**

```bash
git add .env.example docs/deployment.md
git commit -m "docs: add env.example and deployment guide"
````

---

## Task 2 : Rate limiting (slowapi)

**Files:**

- Modify: `backend/pyproject.toml`
- Modify: `backend/main.py`
- Modify: `backend/api/routes/auth.py`
- Modify: `backend/api/routes/generation.py`

- [ ] **Step 1 : Ajouter `slowapi` aux dépendances dans `pyproject.toml`**

Dans la section `[project] dependencies`, ajouter :

```toml
"slowapi>=0.1.9",
```

Installer :

```bash
cd backend && uv sync
```

- [ ] **Step 2 : Créer `backend/core/limiter.py`**

Ce module isole le singleton `Limiter` pour éviter l'import circulaire (`main.py` importe les routes, les routes importeraient `main` → boucle).

```python
# backend/core/limiter.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

- [ ] **Step 3 : Setup dans `main.py`**

Ajouter après les imports existants :

```python
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.limiter import limiter
```

Ajouter après `app = FastAPI(...)` :

```python
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
```

- [ ] **Step 4 : Importer le limiter dans `auth.py` et ajouter les décorateurs**

En haut du fichier `backend/api/routes/auth.py`, ajouter :

```python
from starlette.requests import Request
from core.limiter import limiter
```

Sur `register` :

```python
@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
```

Sur `login` :

```python
@router.post("/login", response_model=TokenPair)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
```

Sur `request_reset` :

```python
@router.post("/request-password-reset", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def request_reset(
    request: Request,
    payload: RequestPasswordResetRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
```

- [ ] **Step 5 : Ajouter le décorateur sur la route de génération**

En haut de `backend/api/routes/generation.py`, ajouter :

```python
from starlette.requests import Request
from core.limiter import limiter
```

Sur `generate_document` :

```python
@router.post(
    "/organizations/{org_id}/generate",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def generate_document(
    request: Request,
    org_id: UUID,
    data: GenerateRequest,
    current_user: RecruiterUser,
    db: DB,
) -> GeneratedDocument:
```

- [ ] **Step 6 : Lancer les tests existants pour vérifier qu'ils passent toujours**

```bash
cd backend && uv run pytest tests/unit/ -v
```

Résultat attendu : tous les tests passent.

- [ ] **Step 7 : Commiter**

```bash
git add backend/core/limiter.py backend/pyproject.toml backend/main.py backend/api/routes/auth.py backend/api/routes/generation.py
git commit -m "feat: add rate limiting with slowapi on auth and generation routes"
```

---

## Task 3 : Modèle OAuthState + service

**Files:**

- Create: `backend/models/oauth_state.py`
- Modify: `backend/models/__init__.py`
- Create: `backend/services/oauth_state_service.py`
- Create: `backend/tests/unit/test_oauth_state_service.py`

- [ ] **Step 1 : Écrire le test qui doit échouer**

Créer `backend/tests/unit/test_oauth_state_service.py` :

```python
# backend/tests/unit/test_oauth_state_service.py
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.oauth_state import OAuthState
from services import oauth_state_service


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    return db


async def test_create_state_returns_token(mock_db: AsyncMock) -> None:
    state = await oauth_state_service.create_state(mock_db, "google", "candidate")
    assert len(state) > 16
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


async def test_consume_state_returns_provider_and_role(mock_db: AsyncMock) -> None:
    entry = OAuthState(
        state="test-state-token",
        provider="google",
        role="candidate",
        created_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = entry
    mock_db.execute = AsyncMock(return_value=mock_result)

    result = await oauth_state_service.consume_state(mock_db, "test-state-token")

    assert result == ("google", "candidate")
    mock_db.delete.assert_called_once_with(entry)
    mock_db.commit.assert_called_once()


async def test_consume_state_returns_none_for_missing(mock_db: AsyncMock) -> None:
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_result)

    result = await oauth_state_service.consume_state(mock_db, "nonexistent")

    assert result is None
```

- [ ] **Step 2 : Vérifier que le test échoue**

```bash
cd backend && uv run pytest tests/unit/test_oauth_state_service.py -v
```

Résultat attendu : `ImportError` ou `ModuleNotFoundError` (le modèle n'existe pas encore).

- [ ] **Step 3 : Créer `backend/models/oauth_state.py`**

```python
# backend/models/oauth_state.py
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class OAuthState(Base):
    __tablename__ = "oauth_states"

    state: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

- [ ] **Step 4 : Enregistrer OAuthState dans `backend/models/__init__.py`**

Ajouter l'import :

```python
from models.oauth_state import OAuthState
```

Ajouter dans `__all__` :

```python
"OAuthState",
```

- [ ] **Step 5 : Créer `backend/services/oauth_state_service.py`**

```python
# backend/services/oauth_state_service.py
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.oauth_state import OAuthState

_TTL_MINUTES = 10


async def create_state(db: AsyncSession, provider: str, role: str) -> str:
    """Create an OAuth CSRF state token, persist it, and return the token."""
    state = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.add(
        OAuthState(
            state=state,
            provider=provider,
            role=role,
            created_at=now,
            expires_at=now + timedelta(minutes=_TTL_MINUTES),
        )
    )
    await db.commit()
    return state


async def consume_state(db: AsyncSession, state: str) -> tuple[str, str] | None:
    """Validate, delete, and return (provider, role) for a state token.

    Returns None if the state is unknown or expired.
    Cleans up all expired states as a side-effect.
    """
    now = datetime.now(UTC)
    await db.execute(delete(OAuthState).where(OAuthState.expires_at < now))

    result = await db.execute(select(OAuthState).where(OAuthState.state == state))
    entry = result.scalar_one_or_none()
    if entry is None:
        await db.commit()
        return None

    provider = entry.provider
    role = entry.role
    await db.delete(entry)
    await db.commit()
    return provider, role
```

- [ ] **Step 6 : Vérifier que les tests passent**

```bash
cd backend && uv run pytest tests/unit/test_oauth_state_service.py -v
```

Résultat attendu : 3 tests PASSED.

- [ ] **Step 7 : Commiter**

```bash
git add backend/models/oauth_state.py backend/models/__init__.py backend/services/oauth_state_service.py backend/tests/unit/test_oauth_state_service.py
git commit -m "feat: add OAuthState model and service for DB-backed OAuth CSRF state"
```

---

## Task 4 : Migration Alembic + câblage dans auth.py

**Files:**

- Create: `backend/alembic/versions/XXXX_create_oauth_states.py` (généré)
- Modify: `backend/api/routes/auth.py`

- [ ] **Step 1 : Générer la migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "create_oauth_states_table"
```

Vérifier le fichier généré dans `backend/alembic/versions/` — il doit contenir `create_table("oauth_states", ...)`.

- [ ] **Step 2 : Mettre à jour `backend/api/routes/auth.py`**

Remplacer les imports en haut du fichier — supprimer `import secrets` (sera géré par le service) et ajouter :

```python
from services import oauth_state_service
```

Supprimer la variable module-level `_oauth_states` (ligne 45) :

```python
# Supprimer cette ligne :
_oauth_states: dict[str, dict[str, object]] = {}  # { state: { role, created_at } }
```

Mettre à jour `oauth_login` pour accepter `db` et utiliser le service :

```python
@router.get("/oauth/{provider}/login")
async def oauth_login(
    provider: OAuthProvider,
    role: Annotated[UserRole, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    state = await oauth_state_service.create_state(db, provider.value, role.value)
    client = get_oauth_client(provider)
    return RedirectResponse(url=client.authorization_url(state), status_code=307)
```

Mettre à jour `oauth_callback` pour utiliser le service :

```python
@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: OAuthProvider,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    result = await oauth_state_service.consume_state(db, state)
    if result is None:
        raise HTTPException(status_code=400, detail="invalid or expired state")

    _provider_str, role_str = result
    role = UserRole(role_str)
    client = get_oauth_client(provider)
    info = await client.exchange_code(code)
    user = await find_or_create_oauth_user(db, info, default_role=role)

    access, refresh = await issue_token_pair(db, user)
    settings = get_settings()
    redirect_url = (
        f"{settings.frontend_url}/candidate/profile"
        if user.role == UserRole.CANDIDATE
        else f"{settings.frontend_url}/recruiter/templates"
    )
    redirect_response = RedirectResponse(url=redirect_url, status_code=302)
    _set_auth_cookies(redirect_response, access, refresh)
    return redirect_response
```

- [ ] **Step 3 : Lancer mypy pour vérifier les types**

```bash
cd backend && uv run mypy api/routes/auth.py services/oauth_state_service.py models/oauth_state.py
```

Résultat attendu : `Success: no issues found`.

- [ ] **Step 4 : Lancer les tests d'intégration OAuth pour vérifier**

Les tests existants dans `tests/integration/test_auth_api.py` (fonctions `test_oauth_google_*`) doivent toujours passer car ils appellent le flow complet (login → callback) qui maintenant passe par la DB.

```bash
cd backend && uv run pytest tests/integration/test_auth_api.py -v -k "oauth"
```

Résultat attendu : tous les tests OAuth passent.

- [ ] **Step 5 : Commiter**

```bash
git add backend/alembic/versions/ backend/api/routes/auth.py
git commit -m "feat: migrate OAuth CSRF state from in-memory dict to database"
```

---

## Task 5 : StorageBackend abstraction

**Files:**

- Modify: `backend/core/storage.py`
- Create: `backend/tests/unit/test_storage.py`

> Périmètre : uniquement les **documents générés** (.docx/.pdf). Les templates Word restent sur le filesystem local (ils sont lus par docxtpl au moment de la génération). Les fonctions `save_upload()`, `delete_file()`, `upload_dir()` existantes sont **conservées** pour les templates.

- [ ] **Step 1 : Écrire les tests qui doivent échouer**

Créer `backend/tests/unit/test_storage.py` :

```python
# backend/tests/unit/test_storage.py
import tempfile
from pathlib import Path

import pytest

from core.storage import LocalStorageBackend


@pytest.fixture
def tmp_backend(tmp_path: Path) -> LocalStorageBackend:
    return LocalStorageBackend(upload_dir=tmp_path)


async def test_local_save_returns_path_under_upload_dir(
    tmp_backend: LocalStorageBackend, tmp_path: Path
) -> None:
    key = await tmp_backend.save(b"hello docx", "test.docx")
    assert Path(key).exists()
    assert Path(key).is_relative_to(tmp_path)


async def test_local_save_creates_unique_keys(tmp_backend: LocalStorageBackend) -> None:
    key1 = await tmp_backend.save(b"content", "file.docx")
    key2 = await tmp_backend.save(b"content", "file.docx")
    assert key1 != key2


async def test_local_delete_removes_file(tmp_backend: LocalStorageBackend) -> None:
    key = await tmp_backend.save(b"data", "doc.docx")
    assert Path(key).exists()
    await tmp_backend.delete(key)
    assert not Path(key).exists()


async def test_local_delete_silently_ignores_missing(tmp_backend: LocalStorageBackend) -> None:
    await tmp_backend.delete("/nonexistent/path.docx")  # must not raise


async def test_local_get_download_url_returns_none(tmp_backend: LocalStorageBackend) -> None:
    key = await tmp_backend.save(b"data", "doc.docx")
    url = await tmp_backend.get_download_url(key)
    assert url is None
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd backend && uv run pytest tests/unit/test_storage.py -v
```

Résultat attendu : `ImportError` (`LocalStorageBackend` n'existe pas encore).

- [ ] **Step 3 : Mettre à jour `backend/core/storage.py`**

Remplacer le contenu entier du fichier :

```python
# backend/core/storage.py
"""File storage backends. Local for dev; S3/R2 for production.

Generated documents use get_storage() / StorageBackend.
Template files use the module-level save_upload() / delete_file() (local only).
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Protocol

_UPLOAD_DIR = Path(__file__).parent.parent / "uploads"


# ---------------------------------------------------------------------------
# Legacy helpers — used by template upload/delete in organizations.py
# ---------------------------------------------------------------------------


def upload_dir() -> Path:
    return _UPLOAD_DIR.resolve()


def save_upload(content: bytes, original_filename: str) -> str:
    """Save raw bytes to local upload dir. Returns absolute path."""
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{Path(original_filename).name}"
    dest = _UPLOAD_DIR / safe_name
    dest.write_bytes(content)
    return str(dest)


def delete_file(file_path: str) -> None:
    """Delete a local file. Silently ignores missing files."""
    path = Path(file_path)
    if path.exists():
        path.unlink()


# ---------------------------------------------------------------------------
# StorageBackend — used for generated documents
# ---------------------------------------------------------------------------


class StorageBackend(Protocol):
    async def save(self, file_bytes: bytes, filename: str) -> str: ...

    async def delete(self, key: str) -> None: ...

    async def get_download_url(self, key: str, expires_in: int = 3600) -> str | None: ...


class LocalStorageBackend:
    def __init__(self, upload_dir: Path = _UPLOAD_DIR) -> None:
        self._dir = upload_dir

    def upload_dir(self) -> Path:
        return self._dir.resolve()

    async def save(self, file_bytes: bytes, filename: str) -> str:
        self._dir.mkdir(parents=True, exist_ok=True)
        safe_name = f"{uuid.uuid4()}_{Path(filename).name}"
        dest = self._dir / safe_name
        dest.write_bytes(file_bytes)
        return str(dest)

    async def delete(self, key: str) -> None:
        path = Path(key)
        if path.exists():
            path.unlink()

    async def get_download_url(self, key: str, expires_in: int = 3600) -> str | None:
        return None  # served locally by the download endpoint


class S3StorageBackend:
    def __init__(
        self,
        bucket: str,
        endpoint_url: str | None,
        access_key: str,
        secret_key: str,
        region: str,
    ) -> None:
        import boto3
        from botocore.config import Config

        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )

    async def save(self, file_bytes: bytes, filename: str) -> str:
        key = f"{uuid.uuid4()}_{Path(filename).name}"
        loop = asyncio.get_event_loop()
        client = self._client
        bucket = self._bucket
        await loop.run_in_executor(
            None, lambda: client.put_object(Bucket=bucket, Key=key, Body=file_bytes)
        )
        return key

    async def delete(self, key: str) -> None:
        loop = asyncio.get_event_loop()
        client = self._client
        bucket = self._bucket
        await loop.run_in_executor(
            None, lambda: client.delete_object(Bucket=bucket, Key=key)
        )

    async def get_download_url(self, key: str, expires_in: int = 3600) -> str | None:
        loop = asyncio.get_event_loop()
        client = self._client
        bucket = self._bucket
        url: str = await loop.run_in_executor(
            None,
            lambda: client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires_in,
            ),
        )
        return url


_storage_instance: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage_instance
    if _storage_instance is None:
        from core.config import get_settings

        settings = get_settings()
        if settings.storage_backend == "s3":
            bucket = settings.s3_bucket_name or ""
            access_key = settings.s3_access_key_id or ""
            secret_key = settings.s3_secret_access_key or ""
            if not bucket or not access_key or not secret_key:
                raise ValueError(
                    "S3_BUCKET_NAME, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY "
                    "are required when STORAGE_BACKEND=s3"
                )
            _storage_instance = S3StorageBackend(
                bucket=bucket,
                endpoint_url=settings.s3_endpoint_url,
                access_key=access_key,
                secret_key=secret_key,
                region=settings.s3_region,
            )
        else:
            _storage_instance = LocalStorageBackend()
    return _storage_instance


def override_storage(backend: StorageBackend | None) -> None:
    """Test helper — override the storage singleton."""
    global _storage_instance
    _storage_instance = backend
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd backend && uv run pytest tests/unit/test_storage.py -v
```

Résultat attendu : 5 tests PASSED.

- [ ] **Step 5 : Commiter**

```bash
git add backend/core/storage.py backend/tests/unit/test_storage.py
git commit -m "feat: add StorageBackend abstraction with Local and S3 implementations"
```

---

## Task 6 : Config S3/Gotenberg + dépendance boto3

**Files:**

- Modify: `backend/core/config.py`
- Modify: `backend/pyproject.toml`

- [ ] **Step 1 : Ajouter les settings S3 et Gotenberg dans `backend/core/config.py`**

Ajouter après `linkedin_redirect_uri` :

```python
    # Storage backend
    storage_backend: Literal["local", "s3"] = "local"
    s3_bucket_name: str | None = None
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_region: str = "auto"

    # Gotenberg PDF service
    gotenberg_url: str | None = None
```

- [ ] **Step 2 : Ajouter `boto3` aux dépendances dans `pyproject.toml`**

Dans `[project] dependencies` :

```toml
"boto3>=1.35",
```

Ajouter dans `[[tool.mypy.overrides]]` (module boto3 sans stubs) :

```toml
[[tool.mypy.overrides]]
module = ["boto3", "boto3.*", "botocore", "botocore.*"]
ignore_missing_imports = true
```

Installer :

```bash
cd backend && uv sync
```

- [ ] **Step 3 : Vérifier que mypy passe sur config.py**

```bash
cd backend && uv run mypy core/config.py core/storage.py
```

Résultat attendu : `Success: no issues found`.

- [ ] **Step 4 : Commiter**

```bash
git add backend/core/config.py backend/pyproject.toml
git commit -m "feat: add S3 and Gotenberg configuration settings"
```

---

## Task 7 : Câbler storage + Gotenberg dans generation_service.py

**Files:**

- Modify: `backend/services/generation_service.py`
- Modify: `backend/api/routes/generation.py`

- [ ] **Step 1 : Mettre à jour `backend/services/generation_service.py`**

Remplacer les imports en haut (supprimer `subprocess`, `Path`, ajouter `httpx`) :

```python
# backend/services/generation_service.py
from __future__ import annotations

from typing import Literal
from uuid import UUID

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from core.storage import get_storage
from models.candidate_profile import CandidateProfile, Experience, Skill
from models.generated_document import GeneratedDocument
from models.recruiter import Organization
from models.template import Template
from schemas.generation import GeneratedDocumentCandidateView
from services import invitation_service, template_service
from services.docx_engine import generate_document
```

Remplacer la fonction `convert_to_pdf` par la version Gotenberg async :

```python
async def _convert_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to PDF via Gotenberg. Raises BusinessRuleError on failure."""
    settings = get_settings()
    if not settings.gotenberg_url:
        raise BusinessRuleError(
            "PDF conversion not available: GOTENBERG_URL is not configured"
        )
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{settings.gotenberg_url}/forms/libreoffice/convert",
            files={
                "files": (
                    "document.docx",
                    docx_bytes,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )
    if response.status_code != 200:
        raise BusinessRuleError(f"PDF conversion failed (HTTP {response.status_code})")
    return response.content
```

Remplacer les étapes 5-6 dans `generate_for_candidate` (lignes 117-127 actuelles) :

```python
    # 5. Save to storage (convert to PDF in memory if requested)
    storage = get_storage()
    base_filename = f"doc_{candidate_id}_{template_id}"
    if fmt == "pdf":
        pdf_bytes = await _convert_to_pdf(docx_bytes)
        storage_key = await storage.save(pdf_bytes, f"{base_filename}.pdf")
        actual_format: str = "pdf"
    else:
        storage_key = await storage.save(docx_bytes, f"{base_filename}.docx")
        actual_format = "docx"

    # 6. Record generated document
    doc = GeneratedDocument(
        access_grant_id=grant.id,
        template_id=template_id,
        generated_by_user_id=generated_by_user_id,
        file_path=storage_key,
        file_format=actual_format,
    )
```

- [ ] **Step 2 : Mettre à jour le download endpoint dans `backend/api/routes/generation.py`**

Remplacer la fonction `download_document` :

```python
@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: UUID,
    current_user: CurrentUser,
    db: DB,
) -> Response:
    result = await db.execute(select(GeneratedDocument).where(GeneratedDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    from models.invitation import AccessGrant

    grant_result = await db.execute(
        select(AccessGrant).where(AccessGrant.id == doc.access_grant_id)
    )
    grant = grant_result.scalar_one_or_none()
    if grant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    is_candidate = grant.candidate_id == current_user.id
    is_recruiter_of_org = False
    if current_user.role == UserRole.RECRUITER:
        profile = await recruiter_service.get_or_create_profile(db, current_user.id)
        is_recruiter_of_org = profile.organization_id == grant.organization_id

    if not is_candidate and not is_recruiter_of_org:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="access denied")

    from core.storage import LocalStorageBackend, get_storage

    storage = get_storage()
    download_url = await storage.get_download_url(doc.file_path)
    if download_url is not None:
        from fastapi.responses import RedirectResponse

        return RedirectResponse(url=download_url, status_code=302)

    # Local storage: file_path is an absolute filesystem path
    if not isinstance(storage, LocalStorageBackend):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    file_path = Path(doc.file_path).resolve()
    if not file_path.is_relative_to(storage.upload_dir()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid file path")
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    mime = (
        "application/pdf"
        if doc.file_format == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(path=str(file_path), filename=file_path.name, media_type=mime)
```

Ajouter `Response` dans les imports FastAPI du fichier :

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from starlette.responses import Response
```

- [ ] **Step 3 : Lancer mypy**

```bash
cd backend && uv run mypy services/generation_service.py api/routes/generation.py
```

Résultat attendu : `Success: no issues found`.

- [ ] **Step 4 : Lancer les tests d'intégration de génération**

```bash
cd backend && uv run pytest tests/integration/test_generation_api.py -v
```

Résultat attendu : tous les tests passent (ils utilisent LocalStorageBackend par défaut).

- [ ] **Step 5 : Commiter**

```bash
git add backend/services/generation_service.py backend/api/routes/generation.py
git commit -m "feat: use StorageBackend for generated docs and Gotenberg for PDF conversion"
```

---

## Task 8 : docker-compose pour déploiement

**Files:**

- Create: `docker-compose.yml`
- Create: `backend/Dockerfile` (si inexistant)

- [ ] **Step 1 : Vérifier si un Dockerfile existe**

```bash
ls backend/Dockerfile 2>/dev/null && echo "exists" || echo "missing"
```

- [ ] **Step 2 : Créer `backend/Dockerfile` si inexistant**

```dockerfile
FROM python:3.14-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml .
RUN uv sync --no-dev

COPY . .

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3 : Créer `docker-compose.yml` à la racine**

```yaml
services:
  api:
    build: ./backend
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      - GOTENBERG_URL=http://gotenberg:3000
    depends_on:
      - gotenberg
    restart: unless-stopped

  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped
```

> Note: La base de données PostgreSQL n'est pas incluse dans ce compose — utiliser une DB managée (Render Postgres, Railway Postgres, Supabase) pour la démo.

- [ ] **Step 4 : Commiter**

```bash
git add docker-compose.yml
git add backend/Dockerfile 2>/dev/null || true
git commit -m "feat: add docker-compose with Gotenberg sidecar for deployment"
```

---

## Task 9 : Calibrer le seuil de couverture

**Files:**

- Modify: `backend/pyproject.toml`

- [ ] **Step 1 : Mesurer la couverture réelle**

```bash
cd backend && uv run pytest tests/unit/ --cov=. --cov-report=term-missing --no-cov-on-fail -q 2>&1 | tail -20
```

Noter le pourcentage total affiché sur la ligne `TOTAL`.

- [ ] **Step 2 : Mettre à jour le seuil dans `pyproject.toml`**

Calculer `seuil = couverture_réelle - 5` (arrondir à l'entier inférieur).

Remplacer dans `[tool.pytest.ini_options]` :

```toml
addopts = "--cov-fail-under=<seuil>"
```

Mettre à jour `[tool.coverage.run]` pour exclure les fichiers légitimement non testés :

```toml
[tool.coverage.run]
source = ["."]
omit = [
    "tests/*",
    "alembic/*",
    "core/config.py",
    "main.py",
]
```

- [ ] **Step 3 : Vérifier que les tests passent avec le nouveau seuil**

```bash
cd backend && uv run pytest tests/unit/ -q
```

Résultat attendu : `passed`, pas de `CoverageWarning`.

- [ ] **Step 4 : Commiter**

```bash
git add backend/pyproject.toml
git commit -m "test: calibrate coverage threshold to actual measured coverage"
```

---

## Vérification finale

- [ ] **Lancer la suite complète de tests unitaires**

```bash
cd backend && uv run pytest tests/unit/ -v
```

- [ ] **Lancer mypy sur tout le backend**

```bash
cd backend && uv run mypy .
```

- [ ] **Vérifier ruff**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

- [ ] **Commit final si tout passe**

```bash
git commit --allow-empty -m "chore: production readiness complete — all checks pass"
```
