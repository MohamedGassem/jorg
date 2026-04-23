# G4 — Observabilité : structlog + request_id + événements métier

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un middleware FastAPI qui propage un `request_id` dans tous les logs structlog, configurer structlog en sortie JSON, et logger les événements métier clés dans les services existants.

**Architecture:** Middleware ASGI pur dans `main.py` qui génère un UUID par requête et l'injecte via `structlog.contextvars`. Configuration structlog dans `core/logging.py`. Ajout de `logger.info(event, ...)` dans 4 services existants. Aucune nouvelle table DB.

**Tech Stack:** Python 3.14, FastAPI, structlog (déjà en dépendance), pytest-asyncio, testcontainers.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section G4)

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/core/logging.py` | CREATE | Configuration structlog (JSON, contextvars) |
| `backend/main.py` | MODIFY | Import config logging + ajout middleware request_id |
| `backend/services/auth_service.py` | MODIFY | Log `auth.login` |
| `backend/services/invitation_service.py` | MODIFY | Log `invitation.sent`, `access.granted`, `access.revoked` |
| `backend/services/generation_service.py` | MODIFY | Log `document.generated` |
| `backend/services/template_service.py` | MODIFY | Log `template.uploaded` |
| `backend/tests/integration/test_observability.py` | CREATE | Tests du middleware et des événements |

---

### Task 1 : Configuration structlog centralisée

**Files:**
- Create: `backend/core/logging.py`
- Modify: `backend/main.py`

- [ ] **Step 1 : Créer `backend/core/logging.py`**

```python
# backend/core/logging.py
import logging
import sys

import structlog


def configure_logging(log_level: str = "INFO") -> None:
    """Configure structlog avec sortie JSON et support contextvars."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(log_level.upper())
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
```

- [ ] **Step 2 : Importer et appeler `configure_logging` dans `main.py`**

Ajouter en haut du fichier (après les imports existants) :

```python
# backend/main.py  — ajouter ces imports
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import structlog
from core.config import get_settings
from core.logging import configure_logging
```

Appeler la config avant la création de l'app :

```python
settings = get_settings()
configure_logging(log_level=settings.log_level)

app = FastAPI(title="Jorg API", version="0.1.0")
```

- [ ] **Step 3 : Ajouter le middleware `RequestIDMiddleware` dans `main.py`**

Après la création de `app` et avant les `add_middleware` existants :

```python
class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    # ... (conserver l'existant)
)
```

- [ ] **Step 4 : Ajouter `log_level` dans `core/config.py`**

Ouvrir `backend/core/config.py`. Repérer la classe `Settings` et ajouter :

```python
log_level: str = "INFO"
```

- [ ] **Step 5 : Commit**

```bash
git add backend/core/logging.py backend/main.py backend/core/config.py
git commit -m "feat(observability): configure structlog JSON + request_id middleware"
```

---

### Task 2 : Logger les événements métier dans les services

**Files:**
- Modify: `backend/services/auth_service.py`
- Modify: `backend/services/invitation_service.py`
- Modify: `backend/services/generation_service.py`
- Modify: `backend/services/template_service.py`

- [ ] **Step 1 : Logger `auth.login` dans `auth_service.py`**

Ouvrir `backend/services/auth_service.py`. Ajouter l'import en haut :

```python
import structlog

logger = structlog.get_logger()
```

Dans la fonction `authenticate_user`, juste avant le `return user` final (après la vérification du mot de passe) :

```python
logger.info("auth.login", user_id=str(user.id), role=user.role)
return user
```

- [ ] **Step 2 : Logger les événements dans `invitation_service.py`**

Ouvrir `backend/services/invitation_service.py`. Ajouter l'import :

```python
import structlog

logger = structlog.get_logger()
```

Dans la fonction qui crée une invitation (chercher `async def create_invitation` ou équivalent), juste avant le `return` :

```python
logger.info(
    "invitation.sent",
    recruiter_id=str(invitation.recruiter_id),
    candidate_email=invitation.candidate_email,
    organization_id=str(invitation.organization_id),
)
```

Dans la fonction qui accepte une invitation et crée un `AccessGrant`, juste avant le `return` :

```python
logger.info(
    "access.granted",
    candidate_id=str(grant.candidate_id),
    organization_id=str(grant.organization_id),
)
```

Dans la fonction qui révoque un access grant, juste avant le `return` :

```python
logger.info(
    "access.revoked",
    candidate_id=str(grant.candidate_id),
    organization_id=str(grant.organization_id),
)
```

- [ ] **Step 3 : Logger `document.generated` dans `generation_service.py`**

Ouvrir `backend/services/generation_service.py`. Ajouter l'import :

```python
import structlog

logger = structlog.get_logger()
```

Dans la fonction `generate_for_candidate`, juste avant le `return doc` final :

```python
logger.info(
    "document.generated",
    template_id=str(template_id),
    candidate_id=str(candidate_id),
    format=fmt,
    access_grant_id=str(doc.access_grant_id),
)
```

- [ ] **Step 4 : Logger `template.uploaded` dans `template_service.py`**

Ouvrir `backend/services/template_service.py`. Ajouter l'import :

```python
import structlog

logger = structlog.get_logger()
```

Dans la fonction `create_template`, juste avant le `return tmpl` final :

```python
logger.info(
    "template.uploaded",
    organization_id=str(tmpl.organization_id),
    template_id=str(tmpl.id),
    placeholder_count=len(tmpl.detected_placeholders),
)
```

- [ ] **Step 5 : Commit**

```bash
git add backend/services/auth_service.py backend/services/invitation_service.py \
        backend/services/generation_service.py backend/services/template_service.py
git commit -m "feat(observability): log business events in services"
```

---

### Task 3 : Tests du middleware et des événements

**Files:**
- Create: `backend/tests/integration/test_observability.py`

- [ ] **Step 1 : Écrire les tests**

```python
# backend/tests/integration/test_observability.py
import pytest
from httpx import AsyncClient


async def test_request_id_header_present(client: AsyncClient) -> None:
    """Every response must carry X-Request-ID."""
    r = await client.get("/health")
    assert r.status_code == 200
    assert "x-request-id" in r.headers
    rid = r.headers["x-request-id"]
    # Must be a valid UUID4 (36 chars with dashes)
    assert len(rid) == 36
    assert rid.count("-") == 4


async def test_different_requests_get_different_request_ids(client: AsyncClient) -> None:
    r1 = await client.get("/health")
    r2 = await client.get("/health")
    assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


async def test_auth_endpoint_returns_request_id(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r.status_code == 200
    assert "x-request-id" in r.headers
```

- [ ] **Step 2 : Vérifier que les tests passent**

```bash
uv run pytest tests/integration/test_observability.py -v
```

Résultat attendu : 3 tests PASSED.

- [ ] **Step 3 : Vérifier que la suite complète passe toujours**

```bash
uv run pytest tests/ -v --tb=short
```

Résultat attendu : tous les tests existants continuent à passer.

- [ ] **Step 4 : Commit**

```bash
git add backend/tests/integration/test_observability.py
git commit -m "test(observability): verify request_id middleware"
```
