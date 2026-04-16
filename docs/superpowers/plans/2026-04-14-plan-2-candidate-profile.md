# Plan 2 — Candidate Profile CRUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le profil candidat complet — `CandidateProfile` et ses sous-entités (`Experience`, `Skill`, `Education`, `Certification`, `Language`) — avec migration Alembic, schémas Pydantic, service CRUD, routes REST protégées par rôle, et tests d'intégration Postgres complets.

**Architecture:** Les nouveaux modèles SQLAlchemy 2.x dans `models/candidate_profile.py` n'utilisent que des foreign keys (pas de relationships Python, évite les imports circulaires et le lazy-loading async). La logique métier est dans `services/candidate_service.py`, les routes dans `api/routes/candidates.py` sont fines. Les tests d'intégration testent les endpoints HTTP contre une vraie Postgres (testcontainers, pattern établi en Plan 1). Les fixtures `candidate_headers` / `recruiter_headers` sont ajoutées dans `tests/integration/conftest.py` pour réutilisation future.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.x async, Alembic autogenerate, Pydantic v2, pytest-asyncio, testcontainers, ruff, mypy strict.

**Spec reference:** [../specs/2026-04-14-jorg-mvp-design.md](../specs/2026-04-14-jorg-mvp-design.md) (section "Profil candidat").

**Prérequis:** Plan 1 complété — branche `feat/plan-1-foundations-auth` fusionnée ou checkout sur la branche de travail actuelle. Toutes les commandes sont à exécuter depuis `backend/`.

---

## Structure de fichiers créés/modifiés

```
backend/
├── models/
│   ├── candidate_profile.py   CREATE  (CandidateProfile, Experience, Skill, Education,
│   │                                   Certification, Language + 2 enums)
│   └── __init__.py            MODIFY  (exporter les nouveaux modèles)
├── schemas/
│   └── candidate.py           CREATE  (schémas Pydantic I/O pour tous les types)
├── services/
│   └── candidate_service.py   CREATE  (get_or_create_profile, update_profile, CRUD
│                                       pour chaque sous-entité)
├── api/routes/
│   └── candidates.py          CREATE  (tous les endpoints /candidates/me/*)
├── main.py                    MODIFY  (inclure le router candidates)
├── alembic/versions/
│   └── <hash>_create_candidate_profile_tables.py  CREATE via alembic autogenerate
└── tests/integration/
    ├── conftest.py            MODIFY  (ajouter candidate_headers + recruiter_headers)
    └── test_candidate_api.py  CREATE  (tests d'intégration complets)
```

**Principe :** chaque fichier a une responsabilité unique. Aucune relation SQLAlchemy entre modèles (on navigue via FK + SELECT explicite dans les services). `api/routes/candidates.py` délègue tout à `candidate_service`.

---

## Task 1 : Modèles SQLAlchemy — CandidateProfile et sous-entités

**Files:**
- Create: `backend/models/candidate_profile.py`

- [ ] **Step 1 : Créer `backend/models/candidate_profile.py`**

```python
# backend/models/candidate_profile.py
from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SkillCategory(StrEnum):
    LANGUAGE = "language"
    FRAMEWORK = "framework"
    DATABASE = "database"
    TOOL = "tool"
    METHODOLOGY = "methodology"
    OTHER = "other"


class LanguageLevel(StrEnum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"
    NATIVE = "native"


class CandidateProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "candidate_profiles"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email_contact: Mapped[str | None] = mapped_column(String(320), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    years_of_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extra_fields: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class Experience(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "experiences"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    achievements: Mapped[str | None] = mapped_column(Text, nullable=True)
    technologies: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)


class Skill(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "skills"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[SkillCategory] = mapped_column(
        Enum(SkillCategory, name="skill_category"), nullable=False
    )
    level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    years_of_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Education(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "education"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    school: Mapped[str] = mapped_column(String(200), nullable=False)
    degree: Mapped[str | None] = mapped_column(String(200), nullable=True)
    field_of_study: Mapped[str | None] = mapped_column(String(200), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Certification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "certifications"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    issuer: Mapped[str] = mapped_column(String(200), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    credential_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class Language(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "languages"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[LanguageLevel] = mapped_column(
        Enum(LanguageLevel, name="language_level"), nullable=False
    )
```

- [ ] **Step 2 : Vérifier la syntaxe**

```bash
cd backend && python -c "from models.candidate_profile import CandidateProfile, Experience, Skill, Education, Certification, Language; print('OK')"
```

Expected: `OK`

- [ ] **Step 3 : Commit**

```bash
git add backend/models/candidate_profile.py
git commit -m "feat(backend): add candidate profile SQLAlchemy models"
```

---

## Task 2 : Mettre à jour `models/__init__.py`

**Files:**
- Modify: `backend/models/__init__.py`

- [ ] **Step 1 : Mettre à jour les exports**

Remplacer le contenu de `backend/models/__init__.py` :

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
    "Skill",
    "SkillCategory",
    "User",
    "UserRole",
]
```

- [ ] **Step 2 : Vérifier que les modèles sont bien dans Base.metadata**

```bash
cd backend && python -c "
from models import Base
tables = list(Base.metadata.tables.keys())
print(tables)
assert 'candidate_profiles' in tables
assert 'experiences' in tables
assert 'skills' in tables
assert 'education' in tables
assert 'certifications' in tables
assert 'languages' in tables
print('All tables registered OK')
"
```

Expected: liste contenant `candidate_profiles`, `experiences`, `skills`, `education`, `certifications`, `languages` puis `All tables registered OK`.

- [ ] **Step 3 : Commit**

```bash
git add backend/models/__init__.py
git commit -m "feat(backend): export candidate profile models from models package"
```

---

## Task 3 : Migration Alembic

**Files:**
- Create: `backend/alembic/versions/<hash>_create_candidate_profile_tables.py` (généré automatiquement)

- [ ] **Step 1 : Générer la migration**

```bash
cd backend && alembic revision --autogenerate -m "create_candidate_profile_tables"
```

Expected: `Generating /path/to/backend/alembic/versions/<hash>_create_candidate_profile_tables.py ... done`

- [ ] **Step 2 : Inspecter la migration générée**

Ouvrir le fichier `alembic/versions/<hash>_create_candidate_profile_tables.py` et vérifier que `upgrade()` contient les `op.create_table` pour :
- `candidate_profiles`
- `experiences`
- `skills`
- `education`
- `certifications`
- `languages`

Et que `downgrade()` contient les `op.drop_table` correspondants (dans l'ordre inverse).

Vérifier aussi que les enums `skill_category` et `language_level` sont créés dans `upgrade()` et droppés dans `downgrade()`.

- [ ] **Step 3 : Appliquer la migration sur la DB de dev**

S'assurer que Docker est actif (`docker compose up -d`), puis :

```bash
cd backend && alembic upgrade head
```

Expected (dernière ligne) : `Running upgrade b8ec6350025b -> <new_hash>, create_candidate_profile_tables`

- [ ] **Step 4 : Vérifier la tête courante**

```bash
cd backend && alembic current
```

Expected: `<new_hash> (head)`

- [ ] **Step 5 : Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(backend): add migration for candidate profile tables"
```

---

## Task 4 : Schémas Pydantic

**Files:**
- Create: `backend/schemas/candidate.py`

- [ ] **Step 1 : Créer `backend/schemas/candidate.py`**

```python
# backend/schemas/candidate.py
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.candidate_profile import LanguageLevel, SkillCategory


# ---- CandidateProfile -------------------------------------------------------


class CandidateProfileUpdate(BaseModel):
    """Tous les champs optionnels — sémantique PATCH appliquée via PUT."""

    first_name: str | None = None
    last_name: str | None = None
    title: str | None = None
    summary: str | None = None
    phone: str | None = None
    email_contact: str | None = None
    linkedin_url: str | None = None
    location: str | None = None
    avatar_url: str | None = None
    years_of_experience: int | None = None
    daily_rate: int | None = None
    extra_fields: dict[str, Any] | None = None


class CandidateProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    first_name: str | None
    last_name: str | None
    title: str | None
    summary: str | None
    phone: str | None
    email_contact: str | None
    linkedin_url: str | None
    location: str | None
    avatar_url: str | None
    years_of_experience: int | None
    daily_rate: int | None
    extra_fields: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


# ---- Experience -------------------------------------------------------------


class ExperienceCreate(BaseModel):
    client_name: str
    role: str
    start_date: date
    end_date: date | None = None
    is_current: bool = False
    description: str | None = None
    context: str | None = None
    achievements: str | None = None
    technologies: list[str] = []


class ExperienceUpdate(BaseModel):
    client_name: str | None = None
    role: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None
    description: str | None = None
    context: str | None = None
    achievements: str | None = None
    technologies: list[str] | None = None


class ExperienceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    client_name: str
    role: str
    start_date: date
    end_date: date | None
    is_current: bool
    description: str | None
    context: str | None
    achievements: str | None
    technologies: list[str]
    created_at: datetime
    updated_at: datetime


# ---- Skill ------------------------------------------------------------------


class SkillCreate(BaseModel):
    name: str
    category: SkillCategory
    level: str | None = None
    years_of_experience: int | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    category: SkillCategory | None = None
    level: str | None = None
    years_of_experience: int | None = None


class SkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    category: SkillCategory
    level: str | None
    years_of_experience: int | None
    created_at: datetime
    updated_at: datetime


# ---- Education --------------------------------------------------------------


class EducationCreate(BaseModel):
    school: str
    degree: str | None = None
    field_of_study: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None


class EducationUpdate(BaseModel):
    school: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None


class EducationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    school: str
    degree: str | None
    field_of_study: str | None
    start_date: date | None
    end_date: date | None
    description: str | None
    created_at: datetime
    updated_at: datetime


# ---- Certification ----------------------------------------------------------


class CertificationCreate(BaseModel):
    name: str
    issuer: str
    issue_date: date
    expiry_date: date | None = None
    credential_url: str | None = None


class CertificationUpdate(BaseModel):
    name: str | None = None
    issuer: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    credential_url: str | None = None


class CertificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    issuer: str
    issue_date: date
    expiry_date: date | None
    credential_url: str | None
    created_at: datetime
    updated_at: datetime


# ---- Language ---------------------------------------------------------------


class LanguageCreate(BaseModel):
    name: str
    level: LanguageLevel


class LanguageUpdate(BaseModel):
    name: str | None = None
    level: LanguageLevel | None = None


class LanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    level: LanguageLevel
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2 : Vérifier la syntaxe**

```bash
cd backend && python -c "from schemas.candidate import CandidateProfileRead, ExperienceRead, SkillRead, EducationRead, CertificationRead, LanguageRead; print('OK')"
```

Expected: `OK`

- [ ] **Step 3 : Commit**

```bash
git add backend/schemas/candidate.py
git commit -m "feat(backend): add Pydantic schemas for candidate profile"
```

---

## Task 5 : Tests d'intégration (écriture avant implémentation)

**Files:**
- Modify: `backend/tests/integration/conftest.py`
- Create: `backend/tests/integration/test_candidate_api.py`

- [ ] **Step 1 : Ajouter les fixtures auth dans `conftest.py`**

Ajouter à la fin de `backend/tests/integration/conftest.py` (après la fixture `client`) :

```python
@pytest_asyncio.fixture
async def candidate_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/auth/register",
        json={
            "email": "candidate@test.com",
            "password": "testpass123",
            "role": "candidate",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": "candidate@test.com", "password": "testpass123"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def recruiter_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/auth/register",
        json={
            "email": "recruiter@test.com",
            "password": "testpass123",
            "role": "recruiter",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": "recruiter@test.com", "password": "testpass123"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2 : Créer `backend/tests/integration/test_candidate_api.py`**

```python
# backend/tests/integration/test_candidate_api.py
import pytest
from httpx import AsyncClient


# ---- Auth & role guards -----------------------------------------------------


async def test_get_profile_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/candidates/me/profile")
    assert r.status_code == 401


async def test_recruiter_cannot_get_candidate_profile(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=recruiter_headers)
    assert r.status_code == 403


# ---- CandidateProfile -------------------------------------------------------


async def test_get_profile_auto_creates_empty_profile(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] is None
    assert data["last_name"] is None
    assert "id" in data
    assert "user_id" in data


async def test_get_profile_returns_same_profile_on_subsequent_calls(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r1 = await client.get("/candidates/me/profile", headers=candidate_headers)
    r2 = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r1.json()["id"] == r2.json()["id"]


async def test_update_profile(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={
            "first_name": "Alice",
            "last_name": "Dupont",
            "title": "Full Stack Developer",
            "years_of_experience": 5,
            "daily_rate": 600,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Dupont"
    assert data["title"] == "Full Stack Developer"
    assert data["years_of_experience"] == 5
    assert data["daily_rate"] == 600


async def test_update_profile_partial_does_not_overwrite_other_fields(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"first_name": "Alice", "last_name": "Dupont"},
    )
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"title": "Tech Lead"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] == "Alice"   # non écrasé
    assert data["last_name"] == "Dupont"   # non écrasé
    assert data["title"] == "Tech Lead"    # mis à jour


async def test_update_profile_extra_fields(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"extra_fields": {"github": "alice", "portfolio": "https://alice.dev"}},
    )
    assert r.status_code == 200
    assert r.json()["extra_fields"]["github"] == "alice"


# ---- Experience -------------------------------------------------------------


async def test_create_experience(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={
            "client_name": "Acme Corp",
            "role": "Backend Developer",
            "start_date": "2023-01-01",
            "is_current": True,
            "technologies": ["Python", "FastAPI", "PostgreSQL"],
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["client_name"] == "Acme Corp"
    assert data["role"] == "Backend Developer"
    assert data["is_current"] is True
    assert data["technologies"] == ["Python", "FastAPI", "PostgreSQL"]
    assert "id" in data


async def test_list_experiences(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Corp A", "role": "Dev", "start_date": "2022-01-01"},
    )
    await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Corp B", "role": "Lead", "start_date": "2023-06-01"},
    )
    r = await client.get("/candidates/me/experiences", headers=candidate_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_update_experience(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Old Corp", "role": "Junior Dev", "start_date": "2021-01-01"},
    )
    exp_id = create.json()["id"]

    r = await client.put(
        f"/candidates/me/experiences/{exp_id}",
        headers=candidate_headers,
        json={"client_name": "New Corp", "technologies": ["Go"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["client_name"] == "New Corp"
    assert data["role"] == "Junior Dev"         # non écrasé
    assert data["technologies"] == ["Go"]


async def test_delete_experience(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Corp", "role": "Dev", "start_date": "2022-01-01"},
    )
    exp_id = create.json()["id"]

    r = await client.delete(
        f"/candidates/me/experiences/{exp_id}", headers=candidate_headers
    )
    assert r.status_code == 204

    list_r = await client.get("/candidates/me/experiences", headers=candidate_headers)
    assert len(list_r.json()) == 0


async def test_update_experience_not_found_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/experiences/00000000-0000-0000-0000-000000000000",
        headers=candidate_headers,
        json={"client_name": "Corp"},
    )
    assert r.status_code == 404


# ---- Skill ------------------------------------------------------------------


async def test_create_and_list_skills(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level": "expert"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Python"
    assert r.json()["category"] == "language"

    list_r = await client.get("/candidates/me/skills", headers=candidate_headers)
    assert len(list_r.json()) == 1


async def test_update_and_delete_skill(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Docker", "category": "tool"},
    )
    skill_id = create.json()["id"]

    upd = await client.put(
        f"/candidates/me/skills/{skill_id}",
        headers=candidate_headers,
        json={"level": "intermediate"},
    )
    assert upd.status_code == 200
    assert upd.json()["level"] == "intermediate"
    assert upd.json()["name"] == "Docker"  # non écrasé

    del_r = await client.delete(
        f"/candidates/me/skills/{skill_id}", headers=candidate_headers
    )
    assert del_r.status_code == 204


# ---- Education --------------------------------------------------------------


async def test_create_and_list_education(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/education",
        headers=candidate_headers,
        json={
            "school": "Université Paris VI",
            "degree": "Master",
            "field_of_study": "Informatique",
            "start_date": "2015-09-01",
            "end_date": "2017-06-30",
        },
    )
    assert r.status_code == 201
    assert r.json()["school"] == "Université Paris VI"

    list_r = await client.get("/candidates/me/education", headers=candidate_headers)
    assert len(list_r.json()) == 1


async def test_delete_education(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/candidates/me/education",
        headers=candidate_headers,
        json={"school": "École Polytechnique"},
    )
    edu_id = create.json()["id"]

    r = await client.delete(
        f"/candidates/me/education/{edu_id}", headers=candidate_headers
    )
    assert r.status_code == 204


# ---- Certification ----------------------------------------------------------


async def test_create_and_list_certifications(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/certifications",
        headers=candidate_headers,
        json={
            "name": "AWS Solutions Architect",
            "issuer": "Amazon",
            "issue_date": "2024-03-15",
            "credential_url": "https://aws.amazon.com/verify/ABC123",
        },
    )
    assert r.status_code == 201
    assert r.json()["name"] == "AWS Solutions Architect"

    list_r = await client.get("/candidates/me/certifications", headers=candidate_headers)
    assert len(list_r.json()) == 1


async def test_delete_certification(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/candidates/me/certifications",
        headers=candidate_headers,
        json={"name": "GCP Associate", "issuer": "Google", "issue_date": "2023-10-01"},
    )
    cert_id = create.json()["id"]

    r = await client.delete(
        f"/candidates/me/certifications/{cert_id}", headers=candidate_headers
    )
    assert r.status_code == 204


# ---- Language ---------------------------------------------------------------


async def test_create_and_list_languages(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/languages",
        headers=candidate_headers,
        json={"name": "Français", "level": "native"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Français"
    assert r.json()["level"] == "native"

    r2 = await client.post(
        "/candidates/me/languages",
        headers=candidate_headers,
        json={"name": "English", "level": "C1"},
    )
    assert r2.status_code == 201

    list_r = await client.get("/candidates/me/languages", headers=candidate_headers)
    assert len(list_r.json()) == 2


async def test_delete_language(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/candidates/me/languages",
        headers=candidate_headers,
        json={"name": "Espagnol", "level": "B2"},
    )
    lang_id = create.json()["id"]

    r = await client.delete(
        f"/candidates/me/languages/{lang_id}", headers=candidate_headers
    )
    assert r.status_code == 204
```

- [ ] **Step 3 : Vérifier que les tests échouent (routes inexistantes)**

```bash
cd backend && pytest tests/integration/test_candidate_api.py -v --tb=short 2>&1 | head -30
```

Expected: tous les tests échouent avec `404 Not Found` ou `AssertionError` — les routes n'existent pas encore.

- [ ] **Step 4 : Commit**

```bash
git add backend/tests/integration/conftest.py backend/tests/integration/test_candidate_api.py
git commit -m "test(backend): add failing integration tests for candidate profile CRUD"
```

---

## Task 6 : Service CRUD

**Files:**
- Create: `backend/services/candidate_service.py`

- [ ] **Step 1 : Créer `backend/services/candidate_service.py`**

```python
# backend/services/candidate_service.py
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import (
    Certification,
    CandidateProfile,
    Education,
    Experience,
    Language,
    Skill,
)
from schemas.candidate import (
    CandidateProfileUpdate,
    CertificationCreate,
    CertificationUpdate,
    EducationCreate,
    EducationUpdate,
    ExperienceCreate,
    ExperienceUpdate,
    LanguageCreate,
    LanguageUpdate,
    SkillCreate,
    SkillUpdate,
)


# ---- CandidateProfile -------------------------------------------------------


async def get_or_create_profile(db: AsyncSession, user_id: UUID) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = CandidateProfile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    profile: CandidateProfile,
    data: CandidateProfileUpdate,
) -> CandidateProfile:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


# ---- Experience -------------------------------------------------------------


async def list_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    result = await db.execute(
        select(Experience).where(Experience.profile_id == profile_id)
    )
    return list(result.scalars().all())


async def create_experience(
    db: AsyncSession, profile_id: UUID, data: ExperienceCreate
) -> Experience:
    exp = Experience(profile_id=profile_id, **data.model_dump())
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return exp


async def get_experience(
    db: AsyncSession, experience_id: UUID, profile_id: UUID
) -> Experience | None:
    result = await db.execute(
        select(Experience).where(
            Experience.id == experience_id,
            Experience.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_experience(
    db: AsyncSession, exp: Experience, data: ExperienceUpdate
) -> Experience:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(exp, field, value)
    await db.commit()
    await db.refresh(exp)
    return exp


async def delete_experience(db: AsyncSession, exp: Experience) -> None:
    await db.delete(exp)
    await db.commit()


# ---- Skill ------------------------------------------------------------------


async def list_skills(db: AsyncSession, profile_id: UUID) -> list[Skill]:
    result = await db.execute(
        select(Skill).where(Skill.profile_id == profile_id)
    )
    return list(result.scalars().all())


async def create_skill(
    db: AsyncSession, profile_id: UUID, data: SkillCreate
) -> Skill:
    skill = Skill(profile_id=profile_id, **data.model_dump())
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


async def get_skill(
    db: AsyncSession, skill_id: UUID, profile_id: UUID
) -> Skill | None:
    result = await db.execute(
        select(Skill).where(Skill.id == skill_id, Skill.profile_id == profile_id)
    )
    return result.scalar_one_or_none()


async def update_skill(
    db: AsyncSession, skill: Skill, data: SkillUpdate
) -> Skill:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    await db.commit()
    await db.refresh(skill)
    return skill


async def delete_skill(db: AsyncSession, skill: Skill) -> None:
    await db.delete(skill)
    await db.commit()


# ---- Education --------------------------------------------------------------


async def list_education(db: AsyncSession, profile_id: UUID) -> list[Education]:
    result = await db.execute(
        select(Education).where(Education.profile_id == profile_id)
    )
    return list(result.scalars().all())


async def create_education(
    db: AsyncSession, profile_id: UUID, data: EducationCreate
) -> Education:
    edu = Education(profile_id=profile_id, **data.model_dump())
    db.add(edu)
    await db.commit()
    await db.refresh(edu)
    return edu


async def get_education_item(
    db: AsyncSession, education_id: UUID, profile_id: UUID
) -> Education | None:
    result = await db.execute(
        select(Education).where(
            Education.id == education_id,
            Education.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_education(
    db: AsyncSession, edu: Education, data: EducationUpdate
) -> Education:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(edu, field, value)
    await db.commit()
    await db.refresh(edu)
    return edu


async def delete_education(db: AsyncSession, edu: Education) -> None:
    await db.delete(edu)
    await db.commit()


# ---- Certification ----------------------------------------------------------


async def list_certifications(db: AsyncSession, profile_id: UUID) -> list[Certification]:
    result = await db.execute(
        select(Certification).where(Certification.profile_id == profile_id)
    )
    return list(result.scalars().all())


async def create_certification(
    db: AsyncSession, profile_id: UUID, data: CertificationCreate
) -> Certification:
    cert = Certification(profile_id=profile_id, **data.model_dump())
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return cert


async def get_certification(
    db: AsyncSession, certification_id: UUID, profile_id: UUID
) -> Certification | None:
    result = await db.execute(
        select(Certification).where(
            Certification.id == certification_id,
            Certification.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_certification(
    db: AsyncSession, cert: Certification, data: CertificationUpdate
) -> Certification:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cert, field, value)
    await db.commit()
    await db.refresh(cert)
    return cert


async def delete_certification(db: AsyncSession, cert: Certification) -> None:
    await db.delete(cert)
    await db.commit()


# ---- Language ---------------------------------------------------------------


async def list_languages(db: AsyncSession, profile_id: UUID) -> list[Language]:
    result = await db.execute(
        select(Language).where(Language.profile_id == profile_id)
    )
    return list(result.scalars().all())


async def create_language(
    db: AsyncSession, profile_id: UUID, data: LanguageCreate
) -> Language:
    lang = Language(profile_id=profile_id, **data.model_dump())
    db.add(lang)
    await db.commit()
    await db.refresh(lang)
    return lang


async def get_language(
    db: AsyncSession, language_id: UUID, profile_id: UUID
) -> Language | None:
    result = await db.execute(
        select(Language).where(
            Language.id == language_id,
            Language.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_language(
    db: AsyncSession, lang: Language, data: LanguageUpdate
) -> Language:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lang, field, value)
    await db.commit()
    await db.refresh(lang)
    return lang


async def delete_language(db: AsyncSession, lang: Language) -> None:
    await db.delete(lang)
    await db.commit()
```

- [ ] **Step 2 : Vérifier la syntaxe**

```bash
cd backend && python -c "import services.candidate_service; print('OK')"
```

Expected: `OK`

- [ ] **Step 3 : Commit**

```bash
git add backend/services/candidate_service.py
git commit -m "feat(backend): add candidate_service with CRUD for profile and sub-entities"
```

---

## Task 7 : Routes API `/candidates/*`

**Files:**
- Create: `backend/api/routes/candidates.py`
- Modify: `backend/main.py`

- [ ] **Step 1 : Créer `backend/api/routes/candidates.py`**

```python
# backend/api/routes/candidates.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

import services.candidate_service as candidate_service
from api.deps import get_db, require_role
from models.candidate_profile import (
    Certification,
    CandidateProfile,
    Education,
    Experience,
    Language,
    Skill,
)
from models.user import User, UserRole
from schemas.candidate import (
    CandidateProfileRead,
    CandidateProfileUpdate,
    CertificationCreate,
    CertificationRead,
    CertificationUpdate,
    EducationCreate,
    EducationRead,
    EducationUpdate,
    ExperienceCreate,
    ExperienceRead,
    ExperienceUpdate,
    LanguageCreate,
    LanguageRead,
    LanguageUpdate,
    SkillCreate,
    SkillRead,
    SkillUpdate,
)

router = APIRouter(prefix="/candidates", tags=["candidates"])

CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]


# ---- Profile ----------------------------------------------------------------


@router.get("/me/profile", response_model=CandidateProfileRead)
async def get_my_profile(current_user: CandidateUser, db: DB) -> CandidateProfile:
    return await candidate_service.get_or_create_profile(db, current_user.id)


@router.put("/me/profile", response_model=CandidateProfileRead)
async def update_my_profile(
    data: CandidateProfileUpdate,
    current_user: CandidateUser,
    db: DB,
) -> CandidateProfile:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.update_profile(db, profile, data)


# ---- Experiences ------------------------------------------------------------


@router.get("/me/experiences", response_model=list[ExperienceRead])
async def list_my_experiences(
    current_user: CandidateUser, db: DB
) -> list[Experience]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_experiences(db, profile.id)


@router.post(
    "/me/experiences", response_model=ExperienceRead, status_code=status.HTTP_201_CREATED
)
async def create_my_experience(
    data: ExperienceCreate,
    current_user: CandidateUser,
    db: DB,
) -> Experience:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_experience(db, profile.id, data)


@router.put("/me/experiences/{experience_id}", response_model=ExperienceRead)
async def update_my_experience(
    experience_id: UUID,
    data: ExperienceUpdate,
    current_user: CandidateUser,
    db: DB,
) -> Experience:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    exp = await candidate_service.get_experience(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    return await candidate_service.update_experience(db, exp, data)


@router.delete("/me/experiences/{experience_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_experience(
    experience_id: UUID,
    current_user: CandidateUser,
    db: DB,
) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    exp = await candidate_service.get_experience(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    await candidate_service.delete_experience(db, exp)


# ---- Skills -----------------------------------------------------------------


@router.get("/me/skills", response_model=list[SkillRead])
async def list_my_skills(current_user: CandidateUser, db: DB) -> list[Skill]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_skills(db, profile.id)


@router.post(
    "/me/skills", response_model=SkillRead, status_code=status.HTTP_201_CREATED
)
async def create_my_skill(
    data: SkillCreate, current_user: CandidateUser, db: DB
) -> Skill:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_skill(db, profile.id, data)


@router.put("/me/skills/{skill_id}", response_model=SkillRead)
async def update_my_skill(
    skill_id: UUID, data: SkillUpdate, current_user: CandidateUser, db: DB
) -> Skill:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    skill = await candidate_service.get_skill(db, skill_id, profile.id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    return await candidate_service.update_skill(db, skill, data)


@router.delete("/me/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_skill(
    skill_id: UUID, current_user: CandidateUser, db: DB
) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    skill = await candidate_service.get_skill(db, skill_id, profile.id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    await candidate_service.delete_skill(db, skill)


# ---- Education --------------------------------------------------------------


@router.get("/me/education", response_model=list[EducationRead])
async def list_my_education(current_user: CandidateUser, db: DB) -> list[Education]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_education(db, profile.id)


@router.post(
    "/me/education", response_model=EducationRead, status_code=status.HTTP_201_CREATED
)
async def create_my_education(
    data: EducationCreate, current_user: CandidateUser, db: DB
) -> Education:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_education(db, profile.id, data)


@router.put("/me/education/{education_id}", response_model=EducationRead)
async def update_my_education(
    education_id: UUID,
    data: EducationUpdate,
    current_user: CandidateUser,
    db: DB,
) -> Education:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    edu = await candidate_service.get_education_item(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    return await candidate_service.update_education(db, edu, data)


@router.delete("/me/education/{education_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_education(
    education_id: UUID, current_user: CandidateUser, db: DB
) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    edu = await candidate_service.get_education_item(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    await candidate_service.delete_education(db, edu)


# ---- Certifications ---------------------------------------------------------


@router.get("/me/certifications", response_model=list[CertificationRead])
async def list_my_certifications(
    current_user: CandidateUser, db: DB
) -> list[Certification]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_certifications(db, profile.id)


@router.post(
    "/me/certifications",
    response_model=CertificationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_certification(
    data: CertificationCreate, current_user: CandidateUser, db: DB
) -> Certification:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_certification(db, profile.id, data)


@router.put("/me/certifications/{certification_id}", response_model=CertificationRead)
async def update_my_certification(
    certification_id: UUID,
    data: CertificationUpdate,
    current_user: CandidateUser,
    db: DB,
) -> Certification:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    cert = await candidate_service.get_certification(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="certification not found"
        )
    return await candidate_service.update_certification(db, cert, data)


@router.delete(
    "/me/certifications/{certification_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_my_certification(
    certification_id: UUID, current_user: CandidateUser, db: DB
) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    cert = await candidate_service.get_certification(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="certification not found"
        )
    await candidate_service.delete_certification(db, cert)


# ---- Languages --------------------------------------------------------------


@router.get("/me/languages", response_model=list[LanguageRead])
async def list_my_languages(current_user: CandidateUser, db: DB) -> list[Language]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_languages(db, profile.id)


@router.post(
    "/me/languages", response_model=LanguageRead, status_code=status.HTTP_201_CREATED
)
async def create_my_language(
    data: LanguageCreate, current_user: CandidateUser, db: DB
) -> Language:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_language(db, profile.id, data)


@router.put("/me/languages/{language_id}", response_model=LanguageRead)
async def update_my_language(
    language_id: UUID, data: LanguageUpdate, current_user: CandidateUser, db: DB
) -> Language:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    lang = await candidate_service.get_language(db, language_id, profile.id)
    if lang is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="language not found")
    return await candidate_service.update_language(db, lang, data)


@router.delete("/me/languages/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_language(
    language_id: UUID, current_user: CandidateUser, db: DB
) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    lang = await candidate_service.get_language(db, language_id, profile.id)
    if lang is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="language not found")
    await candidate_service.delete_language(db, lang)
```

- [ ] **Step 2 : Mettre à jour `backend/main.py`**

Remplacer le contenu de `backend/main.py` :

```python
# backend/main.py
from fastapi import FastAPI

from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")
app.include_router(auth_router)
app.include_router(candidates_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
```

- [ ] **Step 3 : Vérifier que l'application démarre**

```bash
cd backend && python -c "from main import app; print(f'{len(app.routes)} routes chargées')"
```

Expected: un nombre ≥ 25 (routes auth + candidates + health).

- [ ] **Step 4 : Commit**

```bash
git add backend/api/routes/candidates.py backend/main.py
git commit -m "feat(backend): add /candidates/me/* REST endpoints"
```

---

## Task 8 : Vérification — tests verts

**Files:** aucun

- [ ] **Step 1 : Lancer uniquement les tests candidat**

```bash
cd backend && pytest tests/integration/test_candidate_api.py -v
```

Expected: tous les tests passent (résumé `X passed`). Si des tests échouent, corriger avant de continuer.

**Erreurs courantes et corrections :**

- `ImportError: cannot import name 'X'` → vérifier que `models/__init__.py` exporte le modèle manquant.
- `sqlalchemy.exc.ProgrammingError: table "candidate_profiles" doesn't exist` → le testcontainer recrée le schéma via `Base.metadata.create_all` — vérifier que les nouveaux modèles sont importés dans `models/__init__.py` avant que le test ne s'exécute.
- `422 Unprocessable Entity` sur un POST → vérifier que le corps JSON du test correspond exactement au schéma Pydantic (`ExperienceCreate`, etc.).
- `500 Internal Server Error` → lire le détail avec `pytest -s` pour voir la traceback serveur.

- [ ] **Step 2 : Lancer la suite complète pour vérifier l'absence de régression**

```bash
cd backend && pytest -v
```

Expected: tous les tests (auth + candidate) passent.

---

## Task 9 : Lint, typage et commit final

**Files:** corrections à apporter selon les résultats

- [ ] **Step 1 : Ruff — auto-fix**

```bash
cd backend && ruff check . --fix && ruff format .
```

Expected: `All checks passed!` après le fix. Corriger manuellement toute erreur résiduelle non auto-fixable (typiquement E501 — lignes > 100 chars).

- [ ] **Step 2 : Mypy**

```bash
cd backend && mypy .
```

Expected: `Success: no issues found in N source files`

**Erreurs mypy fréquentes et corrections :**

- `Returning Any from function declared to return "CandidateProfile"` : ajouter un cast explicite `return cast(CandidateProfile, obj)` ou typer correctement le résultat SQLAlchemy.
- `error: Argument 1 to "X" has incompatible type` sur `**data.model_dump()` : remplacer par décomposition explicite des champs si nécessaire.
- `error: "X" has no attribute "Y"` sur un modèle SQLAlchemy : vérifier que le champ est bien déclaré dans le modèle avec `Mapped[...]`.
- Si mypy se plaint sur `Mapped[list[str]]` avec `JSON` : ajouter `# type: ignore[assignment]` uniquement sur la ligne concernée (cas rare avec certaines versions du plugin SQLAlchemy mypy).

- [ ] **Step 3 : Commit final si des corrections ont été faites**

```bash
git add -u
git commit -m "fix(backend): ruff and mypy cleanup for candidate profile"
```

Si aucune correction n'est nécessaire, passer au step suivant.

- [ ] **Step 4 : Vérification finale**

```bash
cd backend && pytest -v && echo "ALL TESTS PASS"
```

Expected: `ALL TESTS PASS`

---

## Ce qui est livré à la fin du Plan 2

- **6 modèles SQLAlchemy** : `CandidateProfile`, `Experience`, `Skill`, `Education`, `Certification`, `Language` + 2 enums (`SkillCategory`, `LanguageLevel`).
- **Migration Alembic** : tables créées en production via `alembic upgrade head`.
- **18 schémas Pydantic** (Create/Update/Read pour chaque type).
- **Service CRUD complet** : 30 fonctions dans `candidate_service.py`, toutes testables via les endpoints.
- **20 endpoints REST** : `GET/PUT /candidates/me/profile` + CRUD pour les 5 sous-entités.
- **Protections** : authentification JWT requise + rôle `candidate` obligatoire sur tous les endpoints.
- **Tests d'intégration** : 25+ tests couvrant auth guards, CRUD complet, mises à jour partielles, 404.
- **Fixtures réutilisables** : `candidate_headers` et `recruiter_headers` dans `conftest.py` (utilisées par Plans 3-5).

## Ce qui reste à faire (plans suivants)

- Plan 3 : organizations + profil recruteur + templates (upload Word, détection placeholders, mapping).
- Plan 4 : flux invitation + AccessGrant (acceptation, révocation).
- Plan 5 : génération `.docx` + conversion PDF.
- Plan 6 : frontend Next.js (portails candidate + recruiter).
