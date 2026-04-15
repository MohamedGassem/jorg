# Document Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the document generation pipeline — recruiter triggers generation, backend applies template mappings to candidate profile data, produces a `.docx` (and optionally `.pdf`), stores it, and records history for both portals.

**Architecture:** One new model (`GeneratedDocument`) stores history. A pure-Python `generation_service` handles the docx assembly algorithm (block cloning for lists, simple placeholder substitution). A `generation` router exposes four endpoints: generate, download, candidate history, recruiter org history.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, `python-docx` (lxml XML API for block cloning), `subprocess` → LibreOffice headless for optional PDF, Alembic, pytest + testcontainers.

**Parallelization note:** Requires Plan 4 (`AccessGrant` model) to be merged before starting. Plan 6 (frontend) can run in parallel with this plan.

**Prerequisite:** Plans 1-4 complete. The following imports must resolve: `models.invitation.AccessGrant`, `services.invitation_service.get_active_grant`, `services.template_service.get_template`, `core.storage`.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/models/generated_document.py` | Create | `GeneratedDocument` model |
| `backend/models/__init__.py` | Modify | Export new model |
| `backend/schemas/generation.py` | Create | `GenerateRequest`, `GeneratedDocumentRead` |
| `backend/tests/unit/test_docx_generator.py` | Create | Unit tests for generation service (TDD red) |
| `backend/services/generation_service.py` | Create | Core generation algorithm + PDF conversion |
| `backend/tests/integration/test_generation_api.py` | Create | Integration tests (TDD red) |
| `backend/api/routes/generation.py` | Create | All generation + history + download endpoints |
| `backend/main.py` | Modify | Register new router |

---

## Task 1: `GeneratedDocument` Model + Migration

**Files:**
- Create: `backend/models/generated_document.py`
- Modify: `backend/models/__init__.py`
- Create: `backend/alembic/versions/<hash>_create_generated_documents_table.py` (generated)

- [ ] **Step 1: Create `backend/models/generated_document.py`**

```python
# backend/models/generated_document.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKeyMixin


class GeneratedDocument(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "generated_documents"

    access_grant_id: Mapped[UUID] = mapped_column(
        ForeignKey("access_grants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # Nullable — kept for audit even if template is deleted
    template_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("templates.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    # Nullable — kept for audit even if user is deleted
    generated_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_format: Mapped[str] = mapped_column(String(10), nullable=False)  # "docx" | "pdf"
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Update `backend/models/__init__.py`**

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
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization, RecruiterProfile
from models.template import Template
from models.user import OAuthProvider, User, UserRole

__all__ = [
    "AccessGrant",
    "AccessGrantStatus",
    "Base",
    "Certification",
    "CandidateProfile",
    "Education",
    "Experience",
    "GeneratedDocument",
    "Invitation",
    "InvitationStatus",
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

- [ ] **Step 3: Generate + apply migration**

```bash
alembic revision --autogenerate -m "create_generated_documents_table"
alembic upgrade head && alembic current
```

Expected: `<hash> (head)`. Verify migration creates `generated_documents` with FKs to `access_grants`, `templates`, `users`.

- [ ] **Step 4: Commit**

```bash
git add backend/models/generated_document.py backend/models/__init__.py backend/alembic/versions/
git commit -m "feat(backend): add GeneratedDocument model + migration"
```

---

## Task 2: Schemas

**Files:**
- Create: `backend/schemas/generation.py`

- [ ] **Step 1: Create `backend/schemas/generation.py`**

```python
# backend/schemas/generation.py
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class GenerateRequest(BaseModel):
    candidate_id: UUID
    template_id: UUID
    format: Literal["docx", "pdf"] = "docx"


class GeneratedDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    access_grant_id: UUID
    template_id: UUID | None
    generated_by_user_id: UUID | None
    file_path: str
    file_format: str
    generated_at: datetime
```

- [ ] **Step 2: Verify**

```bash
python -c "from schemas.generation import GenerateRequest, GeneratedDocumentRead; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/generation.py
git commit -m "feat(backend): add generation schemas"
```

---

## Task 3: Unit Tests for Generation Service (Red Phase)

**Files:**
- Create: `backend/tests/unit/test_docx_generator.py`

- [ ] **Step 1: Create `backend/tests/unit/test_docx_generator.py`**

```python
# backend/tests/unit/test_docx_generator.py
import io
import tempfile
from datetime import date
from unittest.mock import MagicMock

from docx import Document  # type: ignore[import-untyped,unused-ignore]

from services.generation_service import generate_document


def _make_docx_path(paragraphs: list[str]) -> str:
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        doc.save(tmp.name)
        return tmp.name


def _mock_profile(**kwargs: object) -> MagicMock:
    defaults: dict[str, object] = {
        "first_name": "Alice",
        "last_name": "Martin",
        "title": "Software Engineer",
        "summary": "Senior developer with 8 years of experience",
        "phone": "0601020304",
        "email_contact": "alice@test.com",
        "linkedin_url": "https://linkedin.com/in/alice",
        "location": "Paris",
        "years_of_experience": 8,
        "daily_rate": 600,
    }
    profile = MagicMock()
    for k, v in {**defaults, **kwargs}.items():
        setattr(profile, k, v)
    return profile


def _mock_exp(**kwargs: object) -> MagicMock:
    defaults: dict[str, object] = {
        "client_name": "TechCorp",
        "role": "Backend Developer",
        "start_date": date(2022, 1, 1),
        "end_date": None,
        "is_current": True,
        "description": "Developed REST APIs",
        "context": "Greenfield project",
        "achievements": "Reduced latency by 30%",
        "technologies": ["Python", "FastAPI", "PostgreSQL"],
    }
    exp = MagicMock()
    for k, v in {**defaults, **kwargs}.items():
        setattr(exp, k, v)
    return exp


def test_simple_placeholder_replaced() -> None:
    path = _make_docx_path(["Nom: {{NOM}}", "Prénom: {{PRENOM}}"])
    result = generate_document(
        path,
        _mock_profile(),
        [],
        {"{{NOM}}": "last_name", "{{PRENOM}}": "first_name"},
    )
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Martin" in texts
    assert "Alice" in texts
    assert "{{NOM}}" not in texts


def test_unknown_field_replaced_with_empty() -> None:
    path = _make_docx_path(["Data: {{GHOST}}"])
    result = generate_document(
        path, _mock_profile(), [], {"{{GHOST}}": "nonexistent_field"}
    )
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "{{GHOST}}" not in texts
    assert "Data: " in texts or "Data:" in texts


def test_experience_block_repeated_per_item() -> None:
    path = _make_docx_path([
        "{{#EXPERIENCES}}",
        "{{EXP_CLIENT}} — {{EXP_ROLE}}",
        "{{/EXPERIENCES}}",
    ])
    exp1 = _mock_exp(client_name="Alpha", role="Dev")
    exp2 = _mock_exp(client_name="Beta", role="Lead")
    mappings = {
        "{{EXP_CLIENT}}": "experience.client_name",
        "{{EXP_ROLE}}": "experience.role",
    }
    result = generate_document(path, _mock_profile(), [exp1, exp2], mappings)
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Alpha" in texts
    assert "Beta" in texts
    assert "{{#EXPERIENCES}}" not in texts
    assert "{{/EXPERIENCES}}" not in texts


def test_no_experiences_removes_block_markers() -> None:
    path = _make_docx_path([
        "Header",
        "{{#EXPERIENCES}}",
        "{{EXP_CLIENT}}",
        "{{/EXPERIENCES}}",
        "Footer",
    ])
    result = generate_document(
        path, _mock_profile(), [], {"{{EXP_CLIENT}}": "experience.client_name"}
    )
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "{{#EXPERIENCES}}" not in texts
    assert "{{/EXPERIENCES}}" not in texts
    assert "Header" in texts
    assert "Footer" in texts


def test_experience_current_end_date_shows_present() -> None:
    path = _make_docx_path([
        "{{#EXPERIENCES}}",
        "{{EXP_START}} - {{EXP_END}}",
        "{{/EXPERIENCES}}",
    ])
    exp = _mock_exp(start_date=date(2022, 6, 1), end_date=None, is_current=True)
    mappings = {
        "{{EXP_START}}": "experience.start_date",
        "{{EXP_END}}": "experience.end_date",
    }
    result = generate_document(path, _mock_profile(), [exp], mappings)
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "06/2022" in texts
    assert "présent" in texts


def test_date_formatted_mm_yyyy() -> None:
    path = _make_docx_path([
        "{{#EXPERIENCES}}",
        "{{EXP_START}} to {{EXP_END}}",
        "{{/EXPERIENCES}}",
    ])
    exp = _mock_exp(
        start_date=date(2021, 3, 15),
        end_date=date(2023, 11, 1),
        is_current=False,
    )
    mappings = {
        "{{EXP_START}}": "experience.start_date",
        "{{EXP_END}}": "experience.end_date",
    }
    result = generate_document(path, _mock_profile(), [exp], mappings)
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "03/2021" in texts
    assert "11/2023" in texts


def test_technologies_joined_as_string() -> None:
    path = _make_docx_path([
        "{{#EXPERIENCES}}",
        "Stack: {{EXP_TECH}}",
        "{{/EXPERIENCES}}",
    ])
    exp = _mock_exp(technologies=["Python", "FastAPI", "Redis"])
    result = generate_document(
        path, _mock_profile(), [exp], {"{{EXP_TECH}}": "experience.technologies"}
    )
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Python, FastAPI, Redis" in texts
```

- [ ] **Step 2: Verify tests fail (service not yet implemented)**

```bash
pytest tests/unit/test_docx_generator.py -v --tb=line 2>&1 | tail -5
```

Expected: `ModuleNotFoundError: No module named 'services.generation_service'`

- [ ] **Step 3: Commit**

```bash
git add backend/tests/unit/test_docx_generator.py
git commit -m "test(backend): add failing unit tests for docx generation service"
```

---

## Task 4: Generation Service (Green Phase)

**Files:**
- Create: `backend/services/generation_service.py`

- [ ] **Step 1: Create `backend/services/generation_service.py`**

```python
# backend/services/generation_service.py
"""Generate Word documents by applying candidate profile mappings to a template."""
from __future__ import annotations

import copy
import io
import re
import subprocess
from datetime import date
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from docx import Document  # type: ignore[import-untyped,unused-ignore]
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core import storage
from models.candidate_profile import CandidateProfile, Experience
from models.generated_document import GeneratedDocument
from services import invitation_service, template_service

_PH = re.compile(r"\{\{[^}]+\}\}")


# ---------- helpers ----------------------------------------------------------


def _fmt_date(d: date | None) -> str:
    return d.strftime("%m/%Y") if d else ""


def _profile_flat(profile: CandidateProfile) -> dict[str, str]:
    return {
        "first_name": profile.first_name or "",
        "last_name": profile.last_name or "",
        "title": profile.title or "",
        "summary": profile.summary or "",
        "phone": profile.phone or "",
        "email_contact": profile.email_contact or "",
        "linkedin_url": profile.linkedin_url or "",
        "location": profile.location or "",
        "years_of_experience": str(profile.years_of_experience or ""),
        "daily_rate": str(profile.daily_rate or ""),
    }


def _exp_flat(exp: Experience) -> dict[str, str]:
    end = (
        _fmt_date(exp.end_date)
        if not exp.is_current
        else "présent"
    )
    return {
        "experience.client_name": exp.client_name or "",
        "experience.role": exp.role or "",
        "experience.start_date": _fmt_date(exp.start_date),
        "experience.end_date": end,
        "experience.description": exp.description or "",
        "experience.context": exp.context or "",
        "experience.achievements": exp.achievements or "",
        "experience.technologies": ", ".join(exp.technologies or []),
    }


def _replace_element(elem: Any, lookup: dict[str, str]) -> None:
    """Replace {{PLACEHOLDER}} in every XML text node using the lookup dict."""
    for node in elem.iter():
        if node.text:
            node.text = _PH.sub(lambda m: lookup.get(m.group(), ""), node.text)
        if node.tail:
            node.tail = _PH.sub(lambda m: lookup.get(m.group(), ""), node.tail)


def _apply_block(
    doc: Any,
    start_marker: str,
    end_marker: str,
    items: list[dict[str, str]],
    base_lookup: dict[str, str],
) -> None:
    """Clone template paragraphs between markers for each item, then remove markers.

    Uses a while loop to re-scan after each replacement, in case the same
    block appears multiple times in the document.
    """
    while True:
        paras = list(doc.paragraphs)
        start_idx = next(
            (i for i, p in enumerate(paras) if start_marker in p.text), None
        )
        end_idx = next(
            (i for i, p in enumerate(paras) if end_marker in p.text), None
        )
        if start_idx is None or end_idx is None:
            break

        # Deep-copy the template XML elements (between markers, exclusive)
        template_elems = [
            copy.deepcopy(paras[j]._element)
            for j in range(start_idx + 1, end_idx)
        ]

        anchor = paras[start_idx]._element
        body = doc.element.body

        # Insert clones after anchor (reversed so first item ends up first)
        for item in reversed(items):
            lookup = {**base_lookup, **item}
            for tmpl in reversed(template_elems):
                new_elem = copy.deepcopy(tmpl)
                _replace_element(new_elem, lookup)
                anchor.addnext(new_elem)

        # Remove marker paragraphs and original template paragraphs
        for j in range(start_idx, end_idx + 1):
            body.remove(paras[j]._element)


# ---------- public API -------------------------------------------------------


def generate_document(
    template_path: str,
    profile: CandidateProfile,
    experiences: list[Experience],
    mappings: dict[str, Any],
) -> bytes:
    """Apply mappings to a template docx and return the result as bytes.

    Algorithm:
    1. Build reverse lookup: placeholder → resolved string value.
    2. For experience block markers, clone template paragraphs per experience.
    3. Replace remaining simple placeholders in all paragraphs and table cells.
    4. Return docx bytes.
    """
    doc = Document(template_path)

    profile_data = _profile_flat(profile)

    # Build the simple placeholder → value lookup
    base_lookup: dict[str, str] = {}
    for placeholder, field in mappings.items():
        if not isinstance(field, str):
            continue
        if not field.startswith("experience."):
            base_lookup[placeholder] = profile_data.get(field, "")

    # Build per-experience lookup rows
    exp_items: list[dict[str, str]] = []
    for exp in experiences:
        exp_data = _exp_flat(exp)
        item: dict[str, str] = {}
        for placeholder, field in mappings.items():
            if isinstance(field, str) and field.startswith("experience."):
                item[placeholder] = exp_data.get(field, "")
        exp_items.append(item)

    # Handle {{#EXPERIENCES}}...{{/EXPERIENCES}} blocks
    _apply_block(doc, "{{#EXPERIENCES}}", "{{/EXPERIENCES}}", exp_items, base_lookup)

    # Replace simple placeholders in paragraphs
    for para in doc.paragraphs:
        _replace_element(para._element, base_lookup)

    # Replace simple placeholders in table cells
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    _replace_element(para._element, base_lookup)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def convert_to_pdf(docx_path: str) -> str | None:
    """Convert a docx file to PDF using LibreOffice headless.

    Returns the PDF path on success, or None if LibreOffice is unavailable
    or conversion fails. Failure is non-fatal: caller delivers docx instead.
    """
    try:
        output_dir = str(Path(docx_path).parent)
        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                output_dir,
                docx_path,
            ],
            capture_output=True,
            timeout=60,
        )
        if result.returncode == 0:
            pdf_path = str(Path(docx_path).with_suffix(".pdf"))
            if Path(pdf_path).exists():
                return pdf_path
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


async def _load_profile(db: AsyncSession, candidate_id: UUID) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise ValueError("candidate_profile_not_found")
    return profile


async def _load_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    result = await db.execute(
        select(Experience).where(Experience.profile_id == profile_id)
    )
    return list(result.scalars().all())


async def generate_for_candidate(
    db: AsyncSession,
    organization_id: UUID,
    template_id: UUID,
    candidate_id: UUID,
    generated_by_user_id: UUID,
    fmt: Literal["docx", "pdf"],
) -> GeneratedDocument:
    """Full pipeline: verify grant → load data → generate → save → record."""
    # 1. Verify active AccessGrant
    grant = await invitation_service.get_active_grant(db, candidate_id, organization_id)
    if grant is None:
        raise ValueError("no_active_grant")

    # 2. Verify template is valid and belongs to the organization
    tmpl = await template_service.get_template(db, template_id, organization_id)
    if tmpl is None:
        raise ValueError("template_not_found")
    if not tmpl.is_valid:
        raise ValueError("template_invalid")

    # 3. Load candidate profile and experiences
    profile = await _load_profile(db, candidate_id)
    experiences = await _load_experiences(db, profile.id)

    # 4. Generate docx bytes
    docx_bytes = generate_document(
        tmpl.word_file_path, profile, experiences, tmpl.mappings
    )

    # 5. Save docx to local storage
    filename = f"doc_{candidate_id}_{template_id}.docx"
    file_path = storage.save_upload(docx_bytes, filename)

    # 6. Optional PDF conversion (non-fatal on failure)
    actual_path = file_path
    actual_format: str = "docx"
    if fmt == "pdf":
        pdf_path = convert_to_pdf(file_path)
        if pdf_path:
            actual_path = pdf_path
            actual_format = "pdf"

    # 7. Record in DB
    doc = GeneratedDocument(
        access_grant_id=grant.id,
        template_id=template_id,
        generated_by_user_id=generated_by_user_id,
        file_path=actual_path,
        file_format=actual_format,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def list_candidate_documents(
    db: AsyncSession, candidate_id: UUID
) -> list[GeneratedDocument]:
    """All documents generated for a candidate (across all orgs)."""
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.candidate_id == candidate_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())


async def list_org_documents(
    db: AsyncSession, organization_id: UUID
) -> list[GeneratedDocument]:
    """All documents generated by recruiter's organization."""
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.organization_id == organization_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())
```

- [ ] **Step 2: Run unit tests**

```bash
pytest tests/unit/test_docx_generator.py -v
```

Expected: 7/7 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/services/generation_service.py
git commit -m "feat(backend): add generation_service with docx assembly and PDF conversion"
```

---

## Task 5: Integration Tests (Red Phase)

**Files:**
- Create: `backend/tests/integration/test_generation_api.py`

- [ ] **Step 1: Create `backend/tests/integration/test_generation_api.py`**

```python
# backend/tests/integration/test_generation_api.py
import io

from docx import Document  # type: ignore[import-untyped,unused-ignore]
from httpx import AsyncClient


# ---- helpers ----------------------------------------------------------------


def _make_docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def _setup_org_with_grant(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> tuple[str, str]:
    """Create org, link recruiter, invite+accept candidate. Returns (org_id, candidate_id)."""
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "GenCorp"}
    )
    org_id: str = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    # Get candidate id from profile
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    candidate_id: str = profile.json()["user_id"]

    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    token = inv.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    return org_id, candidate_id


async def _upload_valid_template(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    org_id: str,
) -> str:
    """Upload a template with {{NOM}} and fully map it. Returns template_id."""
    docx_bytes = _make_docx_bytes(["Nom: {{NOM}}", "Titre: {{TITRE}}"])
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "CV Template"},
        files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    template_id: str = r.json()["id"]
    await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name", "{{TITRE}}": "title"}},
    )
    return template_id


# ---- generate ---------------------------------------------------------------


async def test_recruiter_generates_document(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(
        client, recruiter_headers, candidate_headers
    )
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)

    r = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["file_format"] == "docx"
    assert "id" in data
    assert data["template_id"] == template_id


async def test_cannot_generate_without_access_grant(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    # Setup org + template but NO invitation/grant
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "NoGrant Corp"}
    )
    org_id: str = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    candidate_id = profile.json()["user_id"]

    r = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    assert r.status_code == 403


async def test_cannot_generate_with_invalid_template(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(
        client, recruiter_headers, candidate_headers
    )
    # Upload template but do NOT map all placeholders → is_valid=False
    docx_bytes = _make_docx_bytes(["{{NOM}} {{UNMAPPED}}"])
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "Bad Template"},
        files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    template_id = r.json()["id"]
    # Only map one of two placeholders
    await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name"}},
    )

    r2 = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    assert r2.status_code == 422


async def test_candidate_cannot_trigger_generation(
    client: AsyncClient,
    candidate_headers: dict[str, str],
) -> None:
    r = await client.post(
        "/organizations/00000000-0000-0000-0000-000000000000/generate",
        headers=candidate_headers,
        json={"candidate_id": "00000000-0000-0000-0000-000000000001",
              "template_id": "00000000-0000-0000-0000-000000000002",
              "format": "docx"},
    )
    assert r.status_code == 403


# ---- history ----------------------------------------------------------------


async def test_candidate_history_lists_generated_docs(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(
        client, recruiter_headers, candidate_headers
    )
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )

    r = await client.get("/candidates/me/documents", headers=candidate_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


async def test_recruiter_org_history(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(
        client, recruiter_headers, candidate_headers
    )
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )

    r = await client.get(
        f"/organizations/{org_id}/documents", headers=recruiter_headers
    )
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ---- download ---------------------------------------------------------------


async def test_download_generated_document(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(
        client, recruiter_headers, candidate_headers
    )
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    gen = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    doc_id = gen.json()["id"]

    r = await client.get(f"/documents/{doc_id}/download", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument"
    )
```

- [ ] **Step 2: Verify tests fail**

```bash
pytest tests/integration/test_generation_api.py -v --tb=line 2>&1 | tail -5
```

Expected: most fail with 404 or 403 (routes not implemented).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_generation_api.py
git commit -m "test(backend): add failing integration tests for document generation"
```

---

## Task 6: API Routes + `main.py`

**Files:**
- Create: `backend/api/routes/generation.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create `backend/api/routes/generation.py`**

```python
# backend/api/routes/generation.py
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import services.generation_service as generation_service
import services.recruiter_service as recruiter_service
from api.deps import CurrentUser, get_db, require_role
from models.generated_document import GeneratedDocument
from models.user import User, UserRole
from schemas.generation import GenerateRequest, GeneratedDocumentRead

router = APIRouter(tags=["generation"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/organizations/{org_id}/generate",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def generate_document(
    org_id: UUID,
    data: GenerateRequest,
    current_user: RecruiterUser,
    db: DB,
) -> GeneratedDocument:
    # Verify recruiter belongs to org
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )

    try:
        return await generation_service.generate_for_candidate(
            db,
            organization_id=org_id,
            template_id=data.template_id,
            candidate_id=data.candidate_id,
            generated_by_user_id=current_user.id,
            fmt=data.format,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "no_active_grant":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no active access grant for this candidate",
            ) from e
        if msg == "template_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="template not found",
            ) from e
        if msg == "template_invalid":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="template is not fully mapped (is_valid=false)",
            ) from e
        if msg == "candidate_profile_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="candidate has no profile",
            ) from e
        raise


@router.get(
    "/organizations/{org_id}/documents",
    response_model=list[GeneratedDocumentRead],
)
async def list_org_documents(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[GeneratedDocument]:
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )
    return await generation_service.list_org_documents(db, org_id)


@router.get(
    "/candidates/me/documents",
    response_model=list[GeneratedDocumentRead],
)
async def list_my_documents(
    current_user: CandidateUser, db: DB
) -> list[GeneratedDocument]:
    return await generation_service.list_candidate_documents(db, current_user.id)


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: UUID,
    current_user: CurrentUser,
    db: DB,
) -> FileResponse:
    result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="document not found"
        )

    # Authorization: recruiter from org OR the candidate themselves
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="access denied"
        )

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="file no longer available"
        )

    mime = (
        "application/pdf"
        if doc.file_format == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=mime,
    )
```

- [ ] **Step 2: Update `backend/main.py`**

```python
# backend/main.py
from fastapi import FastAPI

from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from api.routes.generation import router as generation_router
from api.routes.invitations import router as invitations_router
from api.routes.organizations import router as organizations_router
from api.routes.recruiters import router as recruiters_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")
app.include_router(auth_router)
app.include_router(candidates_router)
app.include_router(organizations_router)
app.include_router(recruiters_router)
app.include_router(invitations_router)
app.include_router(generation_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
```

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes/generation.py backend/main.py
git commit -m "feat(backend): add /generate, /documents, and /candidates/me/documents endpoints"
```

---

## Task 7: Verify Green + Lint + Mypy

**Files:** fixes as needed

- [ ] **Step 1: Run generation tests**

```bash
pytest tests/integration/test_generation_api.py -v
```

Expected: all pass. Common failures:

- `assert 201 == 201` but body parsing fails → `_setup_org_with_grant` calls `GET /candidates/me/profile` which returns `user_id`; verify the `CandidateProfile` schema exposes `user_id`.
- `410` on download → file was saved but path is different than what's in DB; verify `storage.save_upload` returns an absolute path and that it matches what was stored.
- `422` vs `403` on invalid template → verify error message matching in route handler.

- [ ] **Step 2: Run full test suite**

```bash
pytest -v && echo "ALL PASS"
```

Expected: all tests pass.

- [ ] **Step 3: Ruff**

```bash
ruff check . --fix && ruff format .
```

Expected: `All checks passed!`

- [ ] **Step 4: Mypy**

```bash
mypy .
```

Expected: `Success: no issues found in N source files`

Common mypy issues:
- `_load_profile` return type: make sure `CandidateProfile` is imported at top-level, not inside the function.
- `Returning Any` on scalars → add explicit type casts or use `result.scalar_one_or_none()` with typed select.

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "fix(backend): ruff and mypy cleanup for plan 5"
```
