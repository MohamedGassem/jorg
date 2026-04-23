# Plan 3 — Organizations + Recruiter Profile + Templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter les entités `Organization`, `RecruiterProfile` et `Template` avec upload de fichier Word, extraction automatique des placeholders `{{...}}` via `python-docx`, mise à jour des mappings et calcul de `is_valid`.

**Architecture:** Nouveaux modèles SQLAlchemy dans `models/recruiter.py` (Organization + RecruiterProfile) et `models/template.py` (Template). Extraction de placeholders dans `services/docx_parser.py` (unité pure, testable sans DB). Stockage fichiers local via `core/storage.py`. Routes séparées : `/recruiters/me/*` (profil recruteur) et `/organizations/*` (CRUD orga + gestion templates). Authorization two-level : JWT role=recruiter + vérification que `RecruiterProfile.organization_id` correspond à l'org ciblée.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.x async, Alembic, Pydantic v2, `python-docx` (parsing Word), pytest + testcontainers, ruff, mypy strict.

**Spec reference:** [../specs/2026-04-14-jorg-mvp-design.md](../specs/2026-04-14-jorg-mvp-design.md) (sections "Profil recruteur", "Templates", "Flux template & génération").

**Prérequis:** Plan 2 complété. Toutes les commandes depuis `backend/`.

---

## Structure de fichiers créés/modifiés

```
backend/
├── pyproject.toml                         MODIFY  (ajouter python-docx)
├── core/
│   └── storage.py                         CREATE  (sauvegarde fichiers locale)
├── models/
│   ├── recruiter.py                       CREATE  (Organization, RecruiterProfile)
│   ├── template.py                        CREATE  (Template)
│   └── __init__.py                        MODIFY  (exports)
├── schemas/
│   ├── recruiter.py                       CREATE  (Organization + RecruiterProfile)
│   └── template.py                        CREATE  (Template)
├── services/
│   ├── docx_parser.py                     CREATE  (extraction {{...}} depuis Word)
│   ├── recruiter_service.py               CREATE  (CRUD orga + profil recruteur)
│   └── template_service.py                CREATE  (CRUD templates, update mappings)
├── api/routes/
│   ├── recruiters.py                      CREATE  (/recruiters/me/*)
│   └── organizations.py                   CREATE  (/organizations/* + templates)
├── main.py                                MODIFY  (inclure les 2 nouveaux routers)
├── alembic/versions/
│   └── <hash>_create_recruiter_template_tables.py  CREATE via autogenerate
└── tests/
    ├── unit/
    │   └── test_docx_parser.py            CREATE  (unit tests parser, pas de DB)
    └── integration/
        └── test_recruiter_api.py          CREATE  (tests end-to-end)
```

---

## Task 1 : Modèles SQLAlchemy + mise à jour `__init__.py`

**Files:**
- Create: `backend/models/recruiter.py`
- Create: `backend/models/template.py`
- Modify: `backend/models/__init__.py`

- [ ] **Step 1 : Créer `backend/models/recruiter.py`**

```python
# backend/models/recruiter.py
from __future__ import annotations

from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Organization(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class RecruiterProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "recruiter_profiles"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
```

- [ ] **Step 2 : Créer `backend/models/template.py`**

```python
# backend/models/template.py
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Template(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "templates"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    word_file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    detected_placeholders: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    mappings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

- [ ] **Step 3 : Mettre à jour `backend/models/__init__.py`**

```python
# backend/models/__init__.py
from models.base import Base
from models.candidate_profile import (
    Certification,
    CandidateProfile,
    Education,
    Experience,
    Language,
    LanguageLevel,
    Skill,
    SkillCategory,
)
from models.recruiter import Organization, RecruiterProfile
from models.template import Template
from models.user import OAuthProvider, User, UserRole

__all__ = [
    "Base",
    "Certification",
    "CandidateProfile",
    "Education",
    "Experience",
    "Language",
    "LanguageLevel",
    "OAuthProvider",
    "Organization",
    "RecruiterProfile",
    "Skill",
    "SkillCategory",
    "Template",
    "User",
    "UserRole",
]
```

- [ ] **Step 4 : Vérifier que les tables sont bien dans Base.metadata**

```bash
python -c "
from models import Base
tables = list(Base.metadata.tables.keys())
print(tables)
assert 'organizations' in tables
assert 'recruiter_profiles' in tables
assert 'templates' in tables
print('All tables registered OK')
"
```

Expected: liste contenant `organizations`, `recruiter_profiles`, `templates` + les tables existantes.

- [ ] **Step 5 : Commit**

```bash
git add backend/models/recruiter.py backend/models/template.py backend/models/__init__.py
git commit -m "feat(backend): add Organization, RecruiterProfile, Template SQLAlchemy models"
```

---

## Task 2 : Migration Alembic

**Files:**
- Create: `backend/alembic/versions/<hash>_create_recruiter_template_tables.py` (généré)

- [ ] **Step 1 : Générer la migration**

```bash
alembic revision --autogenerate -m "create_recruiter_template_tables"
```

Expected: fichier généré dans `alembic/versions/`.

- [ ] **Step 2 : Inspecter la migration générée**

Vérifier que `upgrade()` crée les tables `organizations`, `recruiter_profiles`, `templates` avec les bons FK et colonnes.

- [ ] **Step 3 : Appliquer**

```bash
alembic upgrade head
alembic current
```

Expected (dernière ligne): `<new_hash> (head)`

- [ ] **Step 4 : Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(backend): add migration for organization, recruiter profile, template tables"
```

---

## Task 3 : `python-docx` + `services/docx_parser.py` + tests unitaires

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/services/docx_parser.py`
- Create: `backend/tests/unit/test_docx_parser.py`

- [ ] **Step 1 : Ajouter `python-docx` aux dépendances**

Dans `backend/pyproject.toml`, ajouter dans la liste `dependencies` :

```toml
"python-docx>=1.1",
```

Puis installer :

```bash
uv sync
```

Expected: `python-docx` installé dans `.venv`.

- [ ] **Step 2 : Créer `backend/services/docx_parser.py`**

```python
# backend/services/docx_parser.py
"""Extract {{...}} placeholders from a Word .docx file."""
from __future__ import annotations

import re

from docx import Document  # type: ignore[import-untyped]


_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")


def _iter_paragraphs(doc: Document) -> list[str]:  # type: ignore[type-arg]
    """Collect all text blocks from paragraphs and table cells."""
    texts: list[str] = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                texts.append(cell.text)
    return texts


def extract_placeholders(file_path: str) -> list[str]:
    """Return deduplicated list of {{...}} placeholders found in the document.

    Preserves first-occurrence order. Includes block markers such as
    {{#EXPERIENCES}} and {{/EXPERIENCES}}.
    """
    doc = Document(file_path)
    seen: dict[str, None] = {}
    for text in _iter_paragraphs(doc):
        for match in _PLACEHOLDER_RE.finditer(text):
            seen.setdefault(match.group(), None)
    return list(seen.keys())
```

- [ ] **Step 3 : Écrire les tests unitaires dans `backend/tests/unit/test_docx_parser.py`**

```python
# backend/tests/unit/test_docx_parser.py
import tempfile
from pathlib import Path

from docx import Document  # type: ignore[import-untyped]

from services.docx_parser import extract_placeholders


def _make_docx(paragraphs: list[str]) -> str:
    """Create a temporary .docx file with the given paragraphs, return path."""
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    tmp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    doc.save(tmp.name)
    return tmp.name


def test_extract_simple_placeholders() -> None:
    path = _make_docx(["Nom: {{NOM}}", "Prénom: {{PRENOM}}", "Titre: {{TITRE}}"])
    result = extract_placeholders(path)
    assert "{{NOM}}" in result
    assert "{{PRENOM}}" in result
    assert "{{TITRE}}" in result
    assert len(result) == 3


def test_extract_deduplicates_repeated_placeholders() -> None:
    path = _make_docx(["{{NOM}} et {{NOM}} encore {{NOM}}"])
    result = extract_placeholders(path)
    assert result.count("{{NOM}}") == 1


def test_extract_block_markers() -> None:
    path = _make_docx(["{{#EXPERIENCES}}", "{{EXP_CLIENT}}", "{{/EXPERIENCES}}"])
    result = extract_placeholders(path)
    assert "{{#EXPERIENCES}}" in result
    assert "{{EXP_CLIENT}}" in result
    assert "{{/EXPERIENCES}}" in result


def test_extract_empty_document_returns_empty_list() -> None:
    path = _make_docx(["No placeholders here."])
    result = extract_placeholders(path)
    assert result == []


def test_extract_preserves_first_occurrence_order() -> None:
    path = _make_docx(["{{A}} {{B}} {{C}} {{A}}"])
    result = extract_placeholders(path)
    assert result == ["{{A}}", "{{B}}", "{{C}}"]
```

- [ ] **Step 4 : Lancer les tests unitaires**

```bash
pytest tests/unit/test_docx_parser.py -v
```

Expected: 5/5 passed.

- [ ] **Step 5 : Commit**

```bash
git add backend/pyproject.toml backend/services/docx_parser.py backend/tests/unit/test_docx_parser.py
git commit -m "feat(backend): add docx_parser service and unit tests"
```

---

## Task 4 : `core/storage.py`

**Files:**
- Create: `backend/core/storage.py`

- [ ] **Step 1 : Créer `backend/core/storage.py`**

```python
# backend/core/storage.py
"""Local file storage for dev. Replace with S3 adapter in production."""
from __future__ import annotations

import uuid
from pathlib import Path

_UPLOAD_DIR = Path(__file__).parent.parent / "uploads"


def save_upload(content: bytes, original_filename: str) -> str:
    """Save raw bytes to local storage.

    Returns the absolute path of the saved file as a string.
    """
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{Path(original_filename).name}"
    dest = _UPLOAD_DIR / safe_name
    dest.write_bytes(content)
    return str(dest)


def delete_file(file_path: str) -> None:
    """Delete a file from local storage. Silently ignores missing files."""
    path = Path(file_path)
    if path.exists():
        path.unlink()
```

- [ ] **Step 2 : Vérifier la syntaxe**

```bash
python -c "from core.storage import save_upload, delete_file; print('OK')"
```

Expected: `OK`

- [ ] **Step 3 : Commit**

```bash
git add backend/core/storage.py
git commit -m "feat(backend): add local file storage helper"
```

---

## Task 5 : Schémas Pydantic

**Files:**
- Create: `backend/schemas/recruiter.py`
- Create: `backend/schemas/template.py`

- [ ] **Step 1 : Créer `backend/schemas/recruiter.py`**

```python
# backend/schemas/recruiter.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


# ---- Organization -----------------------------------------------------------


class OrganizationCreate(BaseModel):
    name: str
    logo_url: str | None = None


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    logo_url: str | None
    created_at: datetime


# ---- RecruiterProfile -------------------------------------------------------


class RecruiterProfileUpdate(BaseModel):
    """Tous les champs optionnels — sémantique PATCH appliquée via PUT."""

    first_name: str | None = None
    last_name: str | None = None
    job_title: str | None = None
    organization_id: UUID | None = None


class RecruiterProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    organization_id: UUID | None
    first_name: str | None
    last_name: str | None
    job_title: str | None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2 : Créer `backend/schemas/template.py`**

```python
# backend/schemas/template.py
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TemplateMappingsUpdate(BaseModel):
    """Mappings from placeholder to candidate profile field name.

    Example: {"{{NOM}}": "last_name", "{{PRENOM}}": "first_name"}
    """

    mappings: dict[str, str]


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_by_user_id: UUID
    name: str
    description: str | None
    word_file_path: str
    detected_placeholders: list[str]
    mappings: dict[str, Any]
    is_valid: bool
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 3 : Vérifier la syntaxe**

```bash
python -c "
from schemas.recruiter import OrganizationRead, RecruiterProfileRead
from schemas.template import TemplateRead, TemplateMappingsUpdate
print('OK')
"
```

Expected: `OK`

- [ ] **Step 4 : Commit**

```bash
git add backend/schemas/recruiter.py backend/schemas/template.py
git commit -m "feat(backend): add Pydantic schemas for recruiter, organization, template"
```

---

## Task 6 : `recruiter_service.py` + `template_service.py`

**Files:**
- Create: `backend/services/recruiter_service.py`
- Create: `backend/services/template_service.py`

- [ ] **Step 1 : Créer `backend/services/recruiter_service.py`**

```python
# backend/services/recruiter_service.py
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.recruiter import Organization, RecruiterProfile
from schemas.recruiter import OrganizationCreate, RecruiterProfileUpdate


def _slugify(name: str) -> str:
    """Convert an organization name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


async def _unique_slug(db: AsyncSession, base: str) -> str:
    """Return base slug if available, otherwise append a numeric suffix."""
    candidate = base
    suffix = 1
    while True:
        result = await db.execute(
            select(Organization).where(Organization.slug == candidate)
        )
        if result.scalar_one_or_none() is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


# ---- Organization -----------------------------------------------------------


async def create_organization(
    db: AsyncSession, data: OrganizationCreate
) -> Organization:
    slug = await _unique_slug(db, _slugify(data.name))
    org = Organization(name=data.name, slug=slug, logo_url=data.logo_url)
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


async def get_organization(db: AsyncSession, org_id: UUID) -> Organization | None:
    result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    return result.scalar_one_or_none()


# ---- RecruiterProfile -------------------------------------------------------


async def get_or_create_profile(db: AsyncSession, user_id: UUID) -> RecruiterProfile:
    result = await db.execute(
        select(RecruiterProfile).where(RecruiterProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = RecruiterProfile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    profile: RecruiterProfile,
    data: RecruiterProfileUpdate,
) -> RecruiterProfile:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile
```

- [ ] **Step 2 : Créer `backend/services/template_service.py`**

```python
# backend/services/template_service.py
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.template import Template


def _compute_is_valid(
    detected_placeholders: list[str], mappings: dict[str, Any]
) -> bool:
    """A template is valid when every detected placeholder has a mapping."""
    return bool(detected_placeholders) and all(
        ph in mappings for ph in detected_placeholders
    )


async def create_template(
    db: AsyncSession,
    organization_id: UUID,
    created_by_user_id: UUID,
    name: str,
    description: str | None,
    word_file_path: str,
    detected_placeholders: list[str],
) -> Template:
    template = Template(
        organization_id=organization_id,
        created_by_user_id=created_by_user_id,
        name=name,
        description=description,
        word_file_path=word_file_path,
        detected_placeholders=detected_placeholders,
        mappings={},
        is_valid=False,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def list_templates(db: AsyncSession, organization_id: UUID) -> list[Template]:
    result = await db.execute(
        select(Template).where(Template.organization_id == organization_id)
    )
    return list(result.scalars().all())


async def get_template(
    db: AsyncSession, template_id: UUID, organization_id: UUID
) -> Template | None:
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def update_mappings(
    db: AsyncSession,
    template: Template,
    mappings: dict[str, str],
) -> Template:
    template.mappings = mappings  # type: ignore[assignment]
    template.is_valid = _compute_is_valid(template.detected_placeholders, mappings)
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(db: AsyncSession, template: Template) -> None:
    await db.delete(template)
    await db.commit()
```

- [ ] **Step 3 : Vérifier la syntaxe**

```bash
python -c "
import services.recruiter_service
import services.template_service
print('OK')
"
```

Expected: `OK`

- [ ] **Step 4 : Commit**

```bash
git add backend/services/recruiter_service.py backend/services/template_service.py
git commit -m "feat(backend): add recruiter_service and template_service"
```

---

## Task 7 : Tests d'intégration (écriture avant implémentation)

**Files:**
- Create: `backend/tests/integration/test_recruiter_api.py`

- [ ] **Step 1 : Créer `backend/tests/integration/test_recruiter_api.py`**

```python
# backend/tests/integration/test_recruiter_api.py
import io
import tempfile

from docx import Document  # type: ignore[import-untyped]
from httpx import AsyncClient


# ---- Auth & role guards -----------------------------------------------------


async def test_get_recruiter_profile_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/recruiters/me/profile")
    assert r.status_code == 401


async def test_candidate_cannot_get_recruiter_profile(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/recruiters/me/profile", headers=candidate_headers)
    assert r.status_code == 403


# ---- RecruiterProfile -------------------------------------------------------


async def test_get_recruiter_profile_auto_creates(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/recruiters/me/profile", headers=recruiter_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] is None
    assert data["organization_id"] is None
    assert "id" in data


async def test_update_recruiter_profile(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"first_name": "Bob", "last_name": "Smith", "job_title": "Talent Manager"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] == "Bob"
    assert data["job_title"] == "Talent Manager"


# ---- Organization -----------------------------------------------------------


async def test_create_organization(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Acme Corp"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Acme Corp"
    assert data["slug"] == "acme-corp"
    assert "id" in data


async def test_create_organization_slug_is_unique(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    await client.post("/organizations", headers=recruiter_headers, json={"name": "Dupont SA"})
    r2 = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Dupont SA"}
    )
    assert r2.status_code == 201
    assert r2.json()["slug"] == "dupont-sa-1"


async def test_get_organization(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Test Inc"}
    )
    org_id = create.json()["id"]
    r = await client.get(f"/organizations/{org_id}", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Test Inc"


async def test_get_organization_not_found(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get(
        "/organizations/00000000-0000-0000-0000-000000000000",
        headers=recruiter_headers,
    )
    assert r.status_code == 404


async def test_recruiter_can_link_to_organization(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "My Firm"}
    )
    org_id = org.json()["id"]
    r = await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    assert r.status_code == 200
    assert r.json()["organization_id"] == org_id


async def test_candidate_cannot_create_organization(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/organizations",
        headers=candidate_headers,
        json={"name": "Should Fail"},
    )
    assert r.status_code == 403


# ---- Template upload --------------------------------------------------------


def _make_docx_bytes(paragraphs: list[str]) -> bytes:
    """Create a minimal .docx in memory and return its bytes."""
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def _setup_org_and_link(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> str:
    """Helper: create an org and link the recruiter to it. Returns org_id."""
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Template Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    return org_id


async def test_upload_template_detects_placeholders(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(
        ["Nom: {{NOM}}", "Prénom: {{PRENOM}}", "Titre: {{TITRE}}"]
    )
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "Mon Template"},
        files={"file": ("template.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Mon Template"
    assert "{{NOM}}" in data["detected_placeholders"]
    assert "{{PRENOM}}" in data["detected_placeholders"]
    assert "{{TITRE}}" in data["detected_placeholders"]
    assert data["is_valid"] is False
    assert data["mappings"] == {}


async def test_list_templates(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}}"])
    for name in ["T1", "T2"]:
        await client.post(
            f"/organizations/{org_id}/templates",
            headers=recruiter_headers,
            data={"name": name},
            files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
    r = await client.get(f"/organizations/{org_id}/templates", headers=recruiter_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_update_mappings_sets_is_valid(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}} {{PRENOM}}"])
    upload = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "T"},
        files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    template_id = upload.json()["id"]

    # Partial mapping — still invalid
    r1 = await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name"}},
    )
    assert r1.status_code == 200
    assert r1.json()["is_valid"] is False

    # Full mapping — now valid
    r2 = await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name", "{{PRENOM}}": "first_name"}},
    )
    assert r2.status_code == 200
    assert r2.json()["is_valid"] is True


async def test_delete_template(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}}"])
    upload = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "ToDelete"},
        files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    template_id = upload.json()["id"]

    r = await client.delete(
        f"/organizations/{org_id}/templates/{template_id}",
        headers=recruiter_headers,
    )
    assert r.status_code == 204

    list_r = await client.get(
        f"/organizations/{org_id}/templates", headers=recruiter_headers
    )
    assert len(list_r.json()) == 0


async def test_recruiter_cannot_access_other_org_templates(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    """A recruiter not linked to an org gets 403 on its templates."""
    # Create org but don't link recruiter to it
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Other Corp"}
    )
    org_id = org.json()["id"]
    # recruiter is not linked to this org
    r = await client.get(
        f"/organizations/{org_id}/templates", headers=recruiter_headers
    )
    assert r.status_code == 403
```

- [ ] **Step 2 : Vérifier que les tests échouent (routes inexistantes)**

```bash
pytest tests/integration/test_recruiter_api.py -v --tb=line 2>&1 | tail -10
```

Expected: la majorité des tests échouent avec 404 — routes non implémentées.

- [ ] **Step 3 : Commit**

```bash
git add backend/tests/integration/test_recruiter_api.py
git commit -m "test(backend): add failing integration tests for recruiter/org/template"
```

---

## Task 8 : Routes API + mise à jour `main.py`

**Files:**
- Create: `backend/api/routes/recruiters.py`
- Create: `backend/api/routes/organizations.py`
- Modify: `backend/main.py`

- [ ] **Step 1 : Créer `backend/api/routes/recruiters.py`**

```python
# backend/api/routes/recruiters.py
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

import services.recruiter_service as recruiter_service
from api.deps import get_db, require_role
from models.recruiter import RecruiterProfile
from models.user import User, UserRole
from schemas.recruiter import RecruiterProfileRead, RecruiterProfileUpdate

router = APIRouter(prefix="/recruiters", tags=["recruiters"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me/profile", response_model=RecruiterProfileRead)
async def get_my_profile(current_user: RecruiterUser, db: DB) -> RecruiterProfile:
    return await recruiter_service.get_or_create_profile(db, current_user.id)


@router.put("/me/profile", response_model=RecruiterProfileRead)
async def update_my_profile(
    data: RecruiterProfileUpdate,
    current_user: RecruiterUser,
    db: DB,
) -> RecruiterProfile:
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    return await recruiter_service.update_profile(db, profile, data)
```

- [ ] **Step 2 : Créer `backend/api/routes/organizations.py`**

```python
# backend/api/routes/organizations.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

import core.storage as storage
import services.recruiter_service as recruiter_service
import services.template_service as template_service
from api.deps import get_db, require_role
from models.recruiter import Organization
from models.template import Template
from models.user import User, UserRole
from schemas.recruiter import OrganizationCreate, OrganizationRead
from schemas.template import TemplateMappingsUpdate, TemplateRead
from services.docx_parser import extract_placeholders

router = APIRouter(prefix="/organizations", tags=["organizations"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _get_org_or_404(db: AsyncSession, org_id: UUID) -> Organization:
    org = await recruiter_service.get_organization(db, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return org


async def _require_org_membership(
    db: AsyncSession, user_id: UUID, org_id: UUID
) -> None:
    """Raise 403 if the recruiter is not linked to the given organization."""
    profile = await recruiter_service.get_or_create_profile(db, user_id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )


# ---- Organization CRUD ------------------------------------------------------


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate, current_user: RecruiterUser, db: DB
) -> Organization:
    return await recruiter_service.create_organization(db, data)


@router.get("/{org_id}", response_model=OrganizationRead)
async def get_organization(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> Organization:
    return await _get_org_or_404(db, org_id)


# ---- Templates --------------------------------------------------------------


@router.get("/{org_id}/templates", response_model=list[TemplateRead])
async def list_templates(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[Template]:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    return await template_service.list_templates(db, org_id)


@router.post(
    "/{org_id}/templates",
    response_model=TemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_template(
    org_id: UUID,
    current_user: RecruiterUser,
    db: DB,
    name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    description: Annotated[str | None, Form()] = None,
) -> Template:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)

    content = await file.read()
    file_path = storage.save_upload(content, file.filename or "template.docx")
    placeholders = extract_placeholders(file_path)

    return await template_service.create_template(
        db,
        organization_id=org_id,
        created_by_user_id=current_user.id,
        name=name,
        description=description,
        word_file_path=file_path,
        detected_placeholders=placeholders,
    )


@router.get("/{org_id}/templates/{template_id}", response_model=TemplateRead)
async def get_template(
    org_id: UUID, template_id: UUID, current_user: RecruiterUser, db: DB
) -> Template:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return tmpl


@router.put(
    "/{org_id}/templates/{template_id}/mappings", response_model=TemplateRead
)
async def update_template_mappings(
    org_id: UUID,
    template_id: UUID,
    data: TemplateMappingsUpdate,
    current_user: RecruiterUser,
    db: DB,
) -> Template:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return await template_service.update_mappings(db, tmpl, data.mappings)


@router.delete(
    "/{org_id}/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_template(
    org_id: UUID, template_id: UUID, current_user: RecruiterUser, db: DB
) -> None:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    storage.delete_file(tmpl.word_file_path)
    await template_service.delete_template(db, tmpl)
```

- [ ] **Step 3 : Mettre à jour `backend/main.py`**

```python
# backend/main.py
from fastapi import FastAPI

from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from api.routes.organizations import router as organizations_router
from api.routes.recruiters import router as recruiters_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")
app.include_router(auth_router)
app.include_router(candidates_router)
app.include_router(organizations_router)
app.include_router(recruiters_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
```

- [ ] **Step 4 : Vérifier que l'application démarre**

```bash
python -c "
from main import app
org_routes = [r.path for r in app.routes if hasattr(r, 'path') and '/organizations' in r.path]
rec_routes = [r.path for r in app.routes if hasattr(r, 'path') and '/recruiters' in r.path]
print('Org routes:', len(org_routes), org_routes)
print('Recruiter routes:', len(rec_routes), rec_routes)
assert len(org_routes) >= 5
assert len(rec_routes) >= 2
print('OK')
"
```

Expected: 5+ org routes, 2+ recruiter routes.

- [ ] **Step 5 : Commit**

```bash
git add backend/api/routes/recruiters.py backend/api/routes/organizations.py backend/main.py
git commit -m "feat(backend): add /recruiters and /organizations REST endpoints"
```

---

## Task 9 : Vérification — tests verts

**Files:** corrections si nécessaire

- [ ] **Step 1 : Lancer les tests recruteur**

```bash
pytest tests/integration/test_recruiter_api.py -v
```

Expected: tous les tests passent. Si des tests échouent, diagnostiquer et corriger avant de continuer.

**Erreurs courantes :**
- `422 Unprocessable Entity` sur l'upload → vérifier que le content-type est bien `multipart/form-data` et que le fichier est bien envoyé via `files=`
- `500 Internal Server Error` sur l'upload → lancer `pytest -s` pour voir la traceback ; souvent `FileNotFoundError` si `uploads/` n'a pas pu être créé
- `assert 403 == 200` sur `test_recruiter_cannot_access_other_org_templates` → vérifier que `_require_org_membership` compare correctement deux UUID (les comparer via `str()` si nécessaire)
- UUID comparison issue : `profile.organization_id != org_id` — SQLAlchemy retourne un UUID Python et FastAPI parse le path param en UUID, la comparaison devrait fonctionner nativement

- [ ] **Step 2 : Lancer la suite complète**

```bash
pytest -v
```

Expected: tous les tests passent (auth + candidate + recruiter + unit docx).

---

## Task 10 : Lint, typage et commit final

**Files:** corrections selon résultats

- [ ] **Step 1 : Ruff**

```bash
ruff check . --fix && ruff format .
```

Expected: `All checks passed!`

- [ ] **Step 2 : Mypy**

```bash
mypy .
```

Expected: `Success: no issues found in N source files`

**Erreurs mypy fréquentes pour ce plan :**
- `error: Library stubs not installed for "docx"` → `python-docx` n'a pas de stubs mypy. Les annotations `# type: ignore[import-untyped]` dans `docx_parser.py` et dans les tests gèrent ça. Si mypy se plaint sur d'autres lignes, ajouter `# type: ignore[import-untyped]` ciblé.
- `error: Returning Any from function` sur les scalars SQLAlchemy → même pattern que Plan 2.
- `error: Incompatible types in assignment` sur `template.mappings = mappings` dans `template_service.py` → ajouter `# type: ignore[assignment]` sur cette ligne.

- [ ] **Step 3 : Run final des tests**

```bash
pytest -v && echo "ALL PASS"
```

- [ ] **Step 4 : Commit si des corrections ont été faites**

```bash
git add -u
git commit -m "fix(backend): ruff and mypy cleanup for plan 3"
```

- [ ] **Step 5 : Git log final**

```bash
git log --oneline -10
```

---

## Ce qui est livré à la fin du Plan 3

- **3 nouveaux modèles** : `Organization`, `RecruiterProfile`, `Template`.
- **Migration Alembic** avec les 3 nouvelles tables.
- **Parser `{{...}}`** : `services/docx_parser.py` avec 5 tests unitaires.
- **Stockage local** : `core/storage.py` (save/delete fichiers).
- **7 schémas Pydantic** : Organization, RecruiterProfile, Template, TemplateMappingsUpdate.
- **2 services** : `recruiter_service` (org + profil) + `template_service` (CRUD + mappings + is_valid).
- **8 endpoints REST** :
  - `GET/PUT /recruiters/me/profile`
  - `POST/GET /organizations`, `GET /organizations/{id}`
  - `GET/POST /organizations/{id}/templates`
  - `GET/PUT /organizations/{id}/templates/{tid}/mappings`
  - `DELETE /organizations/{id}/templates/{tid}`
- **Authorization** : JWT role=recruiter + membership check sur org.
- **Tests d'intégration** : 13+ tests couvrant auth guards, CRUD orga, upload Word, detection placeholders, mappings, is_valid.

## Ce qui reste à faire (plans suivants)

- Plan 4 : flux invitation + `AccessGrant` (invitation email, acceptation, révocation).
- Plan 5 : génération `.docx` + conversion PDF.
- Plan 6 : frontend Next.js (portails candidate + recruiter).
