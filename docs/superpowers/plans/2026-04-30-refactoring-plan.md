# Jorg Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ~200 lines of duplicate CRUD code, split the generation service into pure/orchestration layers, unify exception handling, and consolidate 15+ repeated frontend patterns into shared hooks and components — without changing API contracts, DB models, or business logic.

**Architecture:** Layer-level refactor across backend (FastAPI/SQLAlchemy) and frontend (Next.js 15 App Router). Backend changes introduce `core/exceptions.py` (unified errors), `services/base_crud.py` (generic CRUD), and `services/docx_engine.py` (pure doc generation). Frontend changes add `lib/hooks/` and new `components/ui/` shared primitives. The API contract and HTTP response shapes are untouched throughout.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy async, python-docx; Next.js 15 App Router, TypeScript, shadcn/ui

---

## File Map

### Backend — New files

- `backend/core/exceptions.py` — unified `JorgError` hierarchy
- `backend/services/base_crud.py` — generic `CRUDService[T]`
- `backend/services/docx_engine.py` — pure placeholder/block functions extracted from generation_service
- `backend/tests/unit/test_docx_engine.py` — unit tests for pure engine functions

### Backend — Modified files

- `backend/main.py` — register `JorgError` exception handler
- `backend/services/candidate_service.py` — use `CRUDService`; remove 200 lines of per-model CRUD
- `backend/services/generation_service.py` — slim to orchestration; import from docx_engine
- `backend/services/invitation_service.py` — replace `ValueError` with `BusinessRuleError`
- `backend/services/opportunity_service.py` — replace custom exception classes with `JorgError` subclasses
- `backend/api/routes/candidates.py` — add profile dependency; remove `ValueError` try/except
- `backend/api/routes/organizations.py` — remove per-endpoint `ValueError` catch blocks
- `backend/api/routes/opportunities.py` — remove custom exception catch blocks
- `backend/api/deps.py` — add `get_candidate_profile` dependency
- `backend/services/recruiter_service.py` — extract `CandidateQueryBuilder`

### Frontend — New files

- `frontend/lib/errors.ts` — `extractErrorMessage()` utility
- `frontend/lib/hooks/useAsyncData.ts`
- `frontend/lib/hooks/useRecruiterOrg.ts`
- `frontend/lib/hooks/useDownload.ts`
- `frontend/lib/hooks/useFormField.ts`
- `frontend/lib/hooks/index.ts` — barrel export
- `frontend/components/ui/ErrorAlert.tsx`
- `frontend/components/ui/EmptyState.tsx`
- `frontend/components/ui/StatusBadge.tsx`
- `frontend/components/ui/CRUDSection.tsx`

### Frontend — Modified files

- `frontend/app/(candidate)/candidate/history/page.tsx`
- `frontend/app/(recruiter)/recruiter/history/page.tsx`
- `frontend/app/(recruiter)/recruiter/generate/page.tsx`
- `frontend/app/(recruiter)/recruiter/candidates/page.tsx`
- `frontend/app/(recruiter)/recruiter/opportunities/page.tsx`
- `frontend/app/(recruiter)/recruiter/templates/page.tsx`
- `frontend/app/(candidate)/candidate/skills/page.tsx`
- `frontend/app/(candidate)/candidate/access/page.tsx`
- `frontend/app/(candidate)/candidate/requests/page.tsx`
- `frontend/app/(recruiter)/recruiter/invitations/page.tsx`

---

## Task 1: Exception Hierarchy

**Files:**

- Create: `backend/core/exceptions.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create `backend/core/exceptions.py`**

```python
# backend/core/exceptions.py


class JorgError(Exception):
    status_code: int = 500

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class NotFoundError(JorgError):
    status_code = 404


class ForbiddenError(JorgError):
    status_code = 403


class ConflictError(JorgError):
    status_code = 409


class BusinessRuleError(JorgError):
    status_code = 422
```

- [ ] **Step 2: Register the exception handler in `backend/main.py`**

Add after the existing imports:

```python
from fastapi import Request
from fastapi.responses import JSONResponse

from core.exceptions import JorgError
```

Add after `app = FastAPI(...)`:

```python
@app.exception_handler(JorgError)
async def jorg_error_handler(request: Request, exc: JorgError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
```

- [ ] **Step 3: Run tests to confirm nothing breaks**

```bash
cd backend && python -m pytest tests/ -x -q
```

Expected: all tests pass (no services raise `JorgError` yet).

- [ ] **Step 4: Commit**

```bash
git add backend/core/exceptions.py backend/main.py
git commit -m "refactor: add unified JorgError exception hierarchy"
```

---

## Task 2: Migrate Services to JorgError

**Files:**

- Modify: `backend/services/invitation_service.py`
- Modify: `backend/services/generation_service.py`
- Modify: `backend/services/opportunity_service.py`

- [ ] **Step 1: Update `invitation_service.py`**

Replace the top-level import block — add `JorgError` import:

```python
from core.exceptions import BusinessRuleError
```

In `accept_invitation()`, replace:

```python
        raise ValueError("invitation_expired")
```

with:

```python
        raise BusinessRuleError("invitation_expired")
```

- [ ] **Step 2: Update `generation_service.py`**

Add import:

```python
from core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
```

In `_load_profile()`, replace:

```python
    raise ValueError("candidate_profile_not_found")
```

with:

```python
    raise NotFoundError("candidate_profile_not_found")
```

In `generate_for_candidate()`, replace:

```python
    if grant is None:
        raise ValueError("no_active_grant")
```

with:

```python
    if grant is None:
        raise ForbiddenError("no_active_grant")
```

Replace:

```python
    if tmpl is None:
        raise ValueError("template_not_found")
    if not tmpl.is_valid:
        raise ValueError("template_invalid")
```

with:

```python
    if tmpl is None:
        raise NotFoundError("template_not_found")
    if not tmpl.is_valid:
        raise BusinessRuleError("template_invalid")
```

- [ ] **Step 3: Update `opportunity_service.py`**

Remove the two custom exception classes at the top:

```python
class NoActiveGrantError(Exception):
    pass


class DuplicateShortlistEntryError(Exception):
    pass
```

Add import:

```python
from core.exceptions import ConflictError, ForbiddenError
```

In `add_to_shortlist()`, replace:

```python
    if grant_result.scalar_one_or_none() is None:
        raise NoActiveGrantError
```

with:

```python
    if grant_result.scalar_one_or_none() is None:
        raise ForbiddenError("no_active_grant")
```

Replace:

```python
        raise DuplicateShortlistEntryError from err
```

with:

```python
        raise ConflictError("already_in_shortlist") from err
```

In `bulk_generate()`, update the exception catch to no longer catch `ValueError` from generation errors (they now propagate as typed `JorgError`). Replace:

```python
        except (FileNotFoundError, ValueError, KeyError) as e:
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="error", error=str(e))
            )
```

with:

```python
        except (FileNotFoundError, KeyError) as e:
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="error", error=str(e))
            )
        except JorgError as e:
            results.append(
                BulkGenerateResult(candidate_id=entry.candidate_id, status="error", error=e.detail)
            )
```

Also add `JorgError` to the import:

```python
from core.exceptions import ConflictError, ForbiddenError, JorgError
```

- [ ] **Step 4: Update `backend/api/routes/candidates.py`**

In `update_my_profile()`, remove the `try/except` block. Replace:

```python
    try:
        return await candidate_service.update_profile(db, profile, data)
    except ValueError as e:
        if str(e) == "availability_date_required":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="availability_date is required when availability_status is 'available_from'",
            ) from e
        raise
```

with:

```python
    return await candidate_service.update_profile(db, profile, data)
```

Update `candidate_service.update_profile()` to raise `BusinessRuleError` instead of `ValueError`. In `backend/services/candidate_service.py`, add import:

```python
from core.exceptions import BusinessRuleError
```

Replace:

```python
    if new_status == _AvailabilityStatus.AVAILABLE_FROM and new_date is None:
        raise ValueError("availability_date_required")
```

with:

```python
    if new_status == _AvailabilityStatus.AVAILABLE_FROM and new_date is None:
        raise BusinessRuleError(
            "availability_date is required when availability_status is 'available_from'"
        )
```

- [ ] **Step 5: Update `backend/api/routes/opportunities.py`**

Find all `except NoActiveGrantError` and `except DuplicateShortlistEntryError` blocks and remove them — the global handler now covers these. Also remove the import of those classes from `opportunity_service`. The routes can simply `await opportunity_service.add_to_shortlist(...)` without any catch block for those errors.

Read the file first:

```bash
cat backend/api/routes/opportunities.py
```

Remove the lines that import `NoActiveGrantError` and `DuplicateShortlistEntryError` from opportunity_service, and remove their corresponding `try/except` blocks (leaving just the `await` call inside).

- [ ] **Step 6: Run tests**

```bash
cd backend && python -m pytest tests/ -x -q
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/services/invitation_service.py backend/services/generation_service.py \
    backend/services/opportunity_service.py backend/api/routes/candidates.py \
    backend/api/routes/opportunities.py
git commit -m "refactor: replace ValueError/custom exceptions with JorgError hierarchy"
```

---

## Task 3: Extract docx_engine (TDD first)

**Files:**

- Create: `backend/tests/unit/test_docx_engine.py`
- Create: `backend/services/docx_engine.py`
- Modify: `backend/services/generation_service.py`

- [ ] **Step 1: Write failing tests for `docx_engine`**

Create `backend/tests/unit/test_docx_engine.py`:

```python
# backend/tests/unit/test_docx_engine.py
"""Unit tests for the pure docx generation engine."""
import io
from datetime import date
from unittest.mock import MagicMock

import pytest

# These imports will fail until docx_engine is created — that's expected.
from services.docx_engine import (
    _exp_flat,
    _fmt_date,
    _profile_flat,
    generate_document,
)


def _mock_profile(**kwargs):
    profile = MagicMock()
    profile.first_name = kwargs.get("first_name", "Alice")
    profile.last_name = kwargs.get("last_name", "Martin")
    profile.title = kwargs.get("title", "Dev")
    profile.summary = kwargs.get("summary", "")
    profile.phone = kwargs.get("phone", "")
    profile.email_contact = kwargs.get("email_contact", "")
    profile.linkedin_url = kwargs.get("linkedin_url", "")
    profile.location = kwargs.get("location", "")
    profile.years_of_experience = kwargs.get("years_of_experience", None)
    profile.daily_rate = kwargs.get("daily_rate", None)
    profile.annual_salary = kwargs.get("annual_salary", None)
    profile.availability_status = kwargs.get("availability_status", None)
    profile.work_mode = kwargs.get("work_mode", None)
    profile.location_preference = kwargs.get("location_preference", None)
    profile.mission_duration = kwargs.get("mission_duration", None)
    return profile


def _mock_experience(**kwargs):
    exp = MagicMock()
    exp.client_name = kwargs.get("client_name", "Acme")
    exp.role = kwargs.get("role", "Engineer")
    exp.start_date = kwargs.get("start_date", date(2022, 1, 1))
    exp.end_date = kwargs.get("end_date", date(2023, 6, 1))
    exp.is_current = kwargs.get("is_current", False)
    exp.description = kwargs.get("description", "desc")
    exp.context = kwargs.get("context", "ctx")
    exp.achievements = kwargs.get("achievements", "ach")
    exp.technologies = kwargs.get("technologies", ["Python"])
    return exp


class TestFmtDate:
    def test_returns_empty_string_for_none(self):
        assert _fmt_date(None) == ""

    def test_formats_date_as_mm_yyyy(self):
        assert _fmt_date(date(2023, 6, 15)) == "06/2023"


class TestProfileFlat:
    def test_returns_first_name(self):
        p = _mock_profile(first_name="Bob")
        flat = _profile_flat(p)
        assert flat["first_name"] == "Bob"

    def test_returns_empty_string_for_none_fields(self):
        p = _mock_profile(phone=None)
        flat = _profile_flat(p)
        assert flat["phone"] == ""


class TestExpFlat:
    def test_formats_end_date(self):
        exp = _mock_experience(end_date=date(2023, 6, 1), is_current=False)
        flat = _exp_flat(exp)
        assert flat["experience.end_date"] == "06/2023"

    def test_current_experience_shows_present(self):
        exp = _mock_experience(is_current=True)
        flat = _exp_flat(exp)
        assert flat["experience.end_date"] == "présent"

    def test_technologies_joined(self):
        exp = _mock_experience(technologies=["Python", "FastAPI"])
        flat = _exp_flat(exp)
        assert flat["experience.technologies"] == "Python, FastAPI"


class TestGenerateDocument:
    def test_returns_bytes(self, tmp_path):
        """generate_document returns non-empty bytes for a minimal template."""
        from docx import Document

        # Create a minimal .docx template with one placeholder
        tmpl_path = tmp_path / "template.docx"
        doc = Document()
        doc.add_paragraph("Bonjour {{first_name}} {{last_name}}")
        doc.save(str(tmpl_path))

        profile = _mock_profile(first_name="Alice", last_name="Martin")
        mappings = {"{{first_name}}": "first_name", "{{last_name}}": "last_name"}

        result = generate_document(str(tmpl_path), profile, [], mappings)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_replaces_simple_placeholder(self, tmp_path):
        """Placeholder {{first_name}} is replaced with the profile value."""
        from docx import Document

        tmpl_path = tmp_path / "template.docx"
        doc = Document()
        doc.add_paragraph("{{first_name}}")
        doc.save(str(tmpl_path))

        profile = _mock_profile(first_name="Alice")
        mappings = {"{{first_name}}": "first_name"}

        docx_bytes = generate_document(str(tmpl_path), profile, [], mappings)
        result_doc = Document(io.BytesIO(docx_bytes))
        texts = [p.text for p in result_doc.paragraphs]
        assert "Alice" in texts
```

- [ ] **Step 2: Run tests to confirm they FAIL (module does not exist yet)**

```bash
cd backend && python -m pytest tests/unit/test_docx_engine.py -v
```

Expected: `ModuleNotFoundError: No module named 'services.docx_engine'`

- [ ] **Step 3: Create `backend/services/docx_engine.py`**

Extract all pure functions from `generation_service.py` into this new file:

```python
# backend/services/docx_engine.py
"""Pure document generation engine — no DB, no I/O, no side effects."""

from __future__ import annotations

import copy
import io
import re
from datetime import date
from typing import Any

from docx import Document  # type: ignore[import-untyped,unused-ignore]

from models.candidate_profile import CandidateProfile, Experience

_PH = re.compile(r"\{\{[^}]+\}\}")


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
        "annual_salary": str(profile.annual_salary or ""),
        "availability_status": (
            str(profile.availability_status.value) if profile.availability_status else ""
        ),
        "work_mode": str(profile.work_mode.value) if profile.work_mode else "",
        "location_preference": profile.location_preference or "",
        "mission_duration": str(profile.mission_duration.value) if profile.mission_duration else "",
    }


def _exp_flat(exp: Experience) -> dict[str, str]:
    end = _fmt_date(exp.end_date) if not exp.is_current else "présent"
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


def _is_text_settable(node: Any) -> bool:
    for klass in type(node).__mro__:
        if "text" in klass.__dict__:
            attr = klass.__dict__["text"]
            if isinstance(attr, property):
                return attr.fset is not None
            return True
    return True


def _replace_element(elem: Any, lookup: dict[str, str]) -> None:
    for node in elem.iter():
        if _is_text_settable(node):
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
    while True:
        paras = list(doc.paragraphs)
        start_idx = next((i for i, p in enumerate(paras) if start_marker in p.text), None)
        end_idx = next((i for i, p in enumerate(paras) if end_marker in p.text), None)
        if start_idx is None or end_idx is None:
            break

        template_elems = [copy.deepcopy(paras[j]._element) for j in range(start_idx + 1, end_idx)]
        anchor = paras[start_idx]._element
        body = doc.element.body

        for item in reversed(items):
            lookup = {**base_lookup, **item}
            for tmpl in reversed(template_elems):
                new_elem = copy.deepcopy(tmpl)
                _replace_element(new_elem, lookup)
                anchor.addnext(new_elem)

        for j in range(start_idx, end_idx + 1):
            body.remove(paras[j]._element)


def generate_document(
    template_path: str,
    profile: CandidateProfile,
    experiences: list[Experience],
    mappings: dict[str, Any],
) -> bytes:
    """Apply mappings to a template docx and return the result as bytes."""
    doc = Document(template_path)
    profile_data = _profile_flat(profile)

    base_lookup: dict[str, str] = {}
    for placeholder, field in mappings.items():
        if not isinstance(field, str):
            continue
        if not field.startswith("experience."):
            base_lookup[placeholder] = profile_data.get(field, "")

    exp_items: list[dict[str, str]] = []
    for exp in experiences:
        exp_data = _exp_flat(exp)
        item: dict[str, str] = {}
        for placeholder, field in mappings.items():
            if isinstance(field, str) and field.startswith("experience."):
                item[placeholder] = exp_data.get(field, "")
        exp_items.append(item)

    _apply_block(doc, "{{#EXPERIENCES}}", "{{/EXPERIENCES}}", exp_items, base_lookup)

    for para in doc.paragraphs:
        _replace_element(para._element, base_lookup)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    _replace_element(para._element, base_lookup)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

- [ ] **Step 4: Run the new unit tests to confirm they PASS**

```bash
cd backend && python -m pytest tests/unit/test_docx_engine.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Slim `backend/services/generation_service.py` to orchestration only**

Replace the entire file content with:

```python
# backend/services/generation_service.py
"""Orchestrates document generation: DB → engine → storage → record."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Literal
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core import storage
from core.exceptions import ForbiddenError, NotFoundError, BusinessRuleError
from models.candidate_profile import CandidateProfile, Experience
from models.generated_document import GeneratedDocument
from services import invitation_service, template_service
from services.docx_engine import generate_document

logger = structlog.get_logger()


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
        raise NotFoundError("candidate_profile_not_found")
    return profile


async def _load_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    result = await db.execute(select(Experience).where(Experience.profile_id == profile_id))
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
    grant = await invitation_service.get_active_grant(db, candidate_id, organization_id)
    if grant is None:
        raise ForbiddenError("no_active_grant")

    tmpl = await template_service.get_template(db, template_id, organization_id)
    if tmpl is None:
        raise NotFoundError("template_not_found")
    if not tmpl.is_valid:
        raise BusinessRuleError("template_invalid")

    profile = await _load_profile(db, candidate_id)
    experiences = await _load_experiences(db, profile.id)

    docx_bytes = generate_document(tmpl.word_file_path, profile, experiences, tmpl.mappings)

    filename = f"doc_{candidate_id}_{template_id}.docx"
    file_path = storage.save_upload(docx_bytes, filename)

    actual_path = file_path
    actual_format: str = "docx"
    if fmt == "pdf":
        pdf_path = convert_to_pdf(file_path)
        if pdf_path:
            actual_path = pdf_path
            actual_format = "pdf"

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
    logger.info(
        "document.generated",
        template_id=str(template_id),
        candidate_id=str(candidate_id),
        format=fmt,
        access_grant_id=str(doc.access_grant_id),
    )
    return doc


async def list_candidate_documents(db: AsyncSession, candidate_id: UUID) -> list[GeneratedDocument]:
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.candidate_id == candidate_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())


async def list_org_documents(db: AsyncSession, organization_id: UUID) -> list[GeneratedDocument]:
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.organization_id == organization_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())
```

- [ ] **Step 6: Run full test suite**

```bash
cd backend && python -m pytest tests/ -x -q
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/services/docx_engine.py backend/services/generation_service.py \
    backend/tests/unit/test_docx_engine.py
git commit -m "refactor: extract pure docx_engine from generation_service"
```

---

## Task 4: Generic CRUDService

**Files:**

- Create: `backend/services/base_crud.py`

- [ ] **Step 1: Create `backend/services/base_crud.py`**

```python
# backend/services/base_crud.py
"""Generic async CRUD service for SQLAlchemy models owned by a parent UUID."""

from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.base import Base

T = TypeVar("T", bound=Base)


class CRUDService(Generic[T]):
    """Five-operation async CRUD helper parameterised over a SQLAlchemy model.

    owner_field: the column name on T that holds the parent/owner UUID
                 (e.g. "profile_id" for Experience, Skill, etc.)
    """

    def __init__(self, model: type[T], owner_field: str) -> None:
        self.model = model
        self.owner_field = owner_field

    async def list(self, db: AsyncSession, owner_id: UUID) -> list[T]:
        result = await db.execute(
            select(self.model).where(getattr(self.model, self.owner_field) == owner_id)
        )
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, owner_id: UUID, data: Any) -> T:
        fields = data.model_dump()
        fields[self.owner_field] = owner_id
        obj = self.model(**fields)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def get(self, db: AsyncSession, item_id: UUID, owner_id: UUID) -> T | None:
        result = await db.execute(
            select(self.model).where(
                self.model.id == item_id,
                getattr(self.model, self.owner_field) == owner_id,
            )
        )
        return result.scalar_one_or_none()

    async def update(self, db: AsyncSession, obj: T, data: Any) -> T:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def delete(self, db: AsyncSession, obj: T) -> None:
        await db.delete(obj)
        await db.commit()
```

- [ ] **Step 2: Run tests to confirm the new module doesn't break anything**

```bash
cd backend && python -m pytest tests/ -x -q
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/services/base_crud.py
git commit -m "refactor: add generic CRUDService base class"
```

---

## Task 5: Refactor candidate_service using CRUDService

**Files:**

- Modify: `backend/services/candidate_service.py`

- [ ] **Step 1: Replace the file content**

The five per-model CRUD sections (Experience, Skill, Education, Certification, Language) are replaced by five one-liners. The profile logic and interaction timeline stay unchanged.

Replace the **entire** `backend/services/candidate_service.py` with:

```python
# backend/services/candidate_service.py
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Row, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import BusinessRuleError
from models.candidate_profile import (
    AvailabilityStatus as _AvailabilityStatus,
)
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
    Skill,
)
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization
from models.template import Template
from schemas.candidate import (
    CandidateProfileUpdate,
    CertificationCreate,
    CertificationUpdate,
    EducationCreate,
    EducationUpdate,
    ExperienceCreate,
    ExperienceUpdate,
    InteractionEvent,
    InteractionEventMetadata,
    LanguageCreate,
    LanguageUpdate,
    OrganizationInteractionCard,
    SkillCreate,
    SkillUpdate,
)
from services.base_crud import CRUDService

# ---- Per-model CRUD instances -----------------------------------------------

experience_crud: CRUDService[Experience] = CRUDService(Experience, "profile_id")
skill_crud: CRUDService[Skill] = CRUDService(Skill, "profile_id")
education_crud: CRUDService[Education] = CRUDService(Education, "profile_id")
certification_crud: CRUDService[Certification] = CRUDService(Certification, "profile_id")
language_crud: CRUDService[Language] = CRUDService(Language, "profile_id")

# ---- CandidateProfile -------------------------------------------------------


async def get_or_create_profile(db: AsyncSession, user_id: UUID) -> CandidateProfile:
    result = await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == user_id))
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
    new_status = updates.get("availability_status", profile.availability_status)
    new_date = updates.get("availability_date", profile.availability_date)
    if new_status == _AvailabilityStatus.AVAILABLE_FROM and new_date is None:
        raise BusinessRuleError(
            "availability_date is required when availability_status is 'available_from'"
        )
    for field, value in updates.items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


# ---- Convenience shims (keep call-sites in routes unchanged) ----------------
# Routes call e.g. candidate_service.list_experiences(db, profile_id).
# These one-liners delegate to the typed CRUD instances.

async def list_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    return await experience_crud.list(db, profile_id)

async def create_experience(db: AsyncSession, profile_id: UUID, data: ExperienceCreate) -> Experience:
    return await experience_crud.create(db, profile_id, data)

async def get_experience(db: AsyncSession, experience_id: UUID, profile_id: UUID) -> Experience | None:
    return await experience_crud.get(db, experience_id, profile_id)

async def update_experience(db: AsyncSession, exp: Experience, data: ExperienceUpdate) -> Experience:
    return await experience_crud.update(db, exp, data)

async def delete_experience(db: AsyncSession, exp: Experience) -> None:
    return await experience_crud.delete(db, exp)


async def list_skills(db: AsyncSession, profile_id: UUID) -> list[Skill]:
    return await skill_crud.list(db, profile_id)

async def create_skill(db: AsyncSession, profile_id: UUID, data: SkillCreate) -> Skill:
    return await skill_crud.create(db, profile_id, data)

async def get_skill(db: AsyncSession, skill_id: UUID, profile_id: UUID) -> Skill | None:
    return await skill_crud.get(db, skill_id, profile_id)

async def update_skill(db: AsyncSession, skill: Skill, data: SkillUpdate) -> Skill:
    return await skill_crud.update(db, skill, data)

async def delete_skill(db: AsyncSession, skill: Skill) -> None:
    return await skill_crud.delete(db, skill)


async def list_education(db: AsyncSession, profile_id: UUID) -> list[Education]:
    return await education_crud.list(db, profile_id)

async def create_education(db: AsyncSession, profile_id: UUID, data: EducationCreate) -> Education:
    return await education_crud.create(db, profile_id, data)

async def get_education_item(db: AsyncSession, education_id: UUID, profile_id: UUID) -> Education | None:
    return await education_crud.get(db, education_id, profile_id)

async def update_education(db: AsyncSession, edu: Education, data: EducationUpdate) -> Education:
    return await education_crud.update(db, edu, data)

async def delete_education(db: AsyncSession, edu: Education) -> None:
    return await education_crud.delete(db, edu)


async def list_certifications(db: AsyncSession, profile_id: UUID) -> list[Certification]:
    return await certification_crud.list(db, profile_id)

async def create_certification(db: AsyncSession, profile_id: UUID, data: CertificationCreate) -> Certification:
    return await certification_crud.create(db, profile_id, data)

async def get_certification(db: AsyncSession, certification_id: UUID, profile_id: UUID) -> Certification | None:
    return await certification_crud.get(db, certification_id, profile_id)

async def update_certification(db: AsyncSession, cert: Certification, data: CertificationUpdate) -> Certification:
    return await certification_crud.update(db, cert, data)

async def delete_certification(db: AsyncSession, cert: Certification) -> None:
    return await certification_crud.delete(db, cert)


async def list_languages(db: AsyncSession, profile_id: UUID) -> list[Language]:
    return await language_crud.list(db, profile_id)

async def create_language(db: AsyncSession, profile_id: UUID, data: LanguageCreate) -> Language:
    return await language_crud.create(db, profile_id, data)

async def get_language(db: AsyncSession, language_id: UUID, profile_id: UUID) -> Language | None:
    return await language_crud.get(db, language_id, profile_id)

async def update_language(db: AsyncSession, lang: Language, data: LanguageUpdate) -> Language:
    return await language_crud.update(db, lang, data)

async def delete_language(db: AsyncSession, lang: Language) -> None:
    return await language_crud.delete(db, lang)


# ---- Interaction timeline ---------------------------------------------------

_INVITATION_EVENT_TYPE = {
    InvitationStatus.PENDING: "invitation_sent",
    InvitationStatus.ACCEPTED: "invitation_accepted",
    InvitationStatus.REJECTED: "invitation_rejected",
    InvitationStatus.EXPIRED: "invitation_expired",
}


async def list_organization_interactions(
    db: AsyncSession, user_id: UUID, user_email: str
) -> list[OrganizationInteractionCard]:
    inv_result = await db.execute(
        select(Invitation, Organization)
        .join(Organization, Organization.id == Invitation.organization_id)
        .where(
            or_(
                Invitation.candidate_id == user_id,
                Invitation.candidate_email == user_email,
            )
        )
    )
    invitations = inv_result.all()

    grant_result = await db.execute(
        select(AccessGrant, Organization)
        .join(Organization, Organization.id == AccessGrant.organization_id)
        .where(AccessGrant.candidate_id == user_id)
    )
    grants = grant_result.all()

    grant_ids = [g.AccessGrant.id for g in grants]
    doc_rows: list[Row[tuple[GeneratedDocument, Template]]] = []
    if grant_ids:
        doc_result = await db.execute(
            select(GeneratedDocument, Template)
            .join(Template, Template.id == GeneratedDocument.template_id)
            .where(GeneratedDocument.access_grant_id.in_(grant_ids))
        )
        doc_rows = list(doc_result.all())

    orgs: dict[str, dict[str, Any]] = {}

    for inv, org in invitations:
        oid = str(org.id)
        if oid not in orgs:
            orgs[oid] = {"org": org, "events": [], "grants": []}
        orgs[oid]["events"].append(
            InteractionEvent(
                type=_INVITATION_EVENT_TYPE[inv.status],
                occurred_at=inv.created_at,
            )
        )

    for grant, org in grants:
        oid = str(org.id)
        if oid not in orgs:
            orgs[oid] = {"org": org, "events": [], "grants": []}
        orgs[oid]["grants"].append(grant)
        orgs[oid]["events"].append(
            InteractionEvent(type="access_granted", occurred_at=grant.granted_at)
        )
        if grant.status == AccessGrantStatus.REVOKED and grant.revoked_at:
            orgs[oid]["events"].append(
                InteractionEvent(type="access_revoked", occurred_at=grant.revoked_at)
            )

    grant_org_map = {str(g.AccessGrant.id): str(org.id) for g, org in grants}
    for doc, tmpl in doc_rows:
        doc_oid = grant_org_map.get(str(doc.access_grant_id))
        if doc_oid and doc_oid in orgs:
            oid = doc_oid
            orgs[oid]["events"].append(
                InteractionEvent(
                    type="document_generated",
                    occurred_at=doc.generated_at,
                    metadata=InteractionEventMetadata(
                        template_name=tmpl.name,
                        file_format=doc.file_format,
                    ),
                )
            )

    result: list[OrganizationInteractionCard] = []
    for oid, data in orgs.items():
        org = data["org"]
        org_grants: list[AccessGrant] = data["grants"]
        events: list[InteractionEvent] = sorted(data["events"], key=lambda e: e.occurred_at)

        active_grant = next((g for g in org_grants if g.status == AccessGrantStatus.ACTIVE), None)
        revoked_grant = next((g for g in org_grants if g.status == AccessGrantStatus.REVOKED), None)

        if active_grant:
            status_val = "active"
        elif revoked_grant:
            status_val = "revoked"
        else:
            org_invs = [inv for inv, o in invitations if str(o.id) == oid]
            has_pending = any(i.status == InvitationStatus.PENDING for i in org_invs)
            status_val = "invited" if has_pending else "expired"

        result.append(
            OrganizationInteractionCard(
                organization_id=org.id,
                organization_name=org.name,
                logo_url=getattr(org, "logo_url", None),
                current_status=status_val,
                events=events,
            )
        )

    result.sort(
        key=lambda c: c.events[-1].occurred_at if c.events else datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return result
```

- [ ] **Step 2: Run tests**

```bash
cd backend && python -m pytest tests/ -x -q
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/services/candidate_service.py
git commit -m "refactor: replace per-model CRUD functions with CRUDService instances"
```

---

## Task 6: Profile dependency in candidates router

**Files:**

- Modify: `backend/api/deps.py`
- Modify: `backend/api/routes/candidates.py`

Every sub-resource endpoint in `candidates.py` (experiences, skills, education, certifications, languages) calls `await candidate_service.get_or_create_profile(db, current_user.id)` individually — 9 calls for what is always the same profile. This task moves that fetch into a shared FastAPI dependency.

- [ ] **Step 1: Add `get_candidate_profile` dependency to `backend/api/deps.py`**

Add after the existing imports:

```python
from models.candidate_profile import CandidateProfile
import services.candidate_service as candidate_service
```

Add at the bottom of the file (before any existing aliases):

```python
async def get_candidate_profile(
    current_user: Annotated[User, Depends(require_role(UserRole.CANDIDATE))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidateProfile:
    return await candidate_service.get_or_create_profile(db, current_user.id)


CandidateProfile_dep = Annotated[CandidateProfile, Depends(get_candidate_profile)]
```

- [ ] **Step 2: Update `backend/api/routes/candidates.py` to use the dependency**

Add import at the top:

```python
from api.deps import CandidateProfile_dep
```

Then replace every endpoint that has the pattern:

```python
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
```

with a `profile: CandidateProfile_dep` parameter instead. The `current_user` parameter can be removed from those endpoints too, since the profile dependency already resolves it internally.

For example, `list_my_experiences` goes from:

```python
@router.get("/me/experiences", response_model=list[ExperienceRead])
async def list_my_experiences(current_user: CandidateUser, db: DB) -> list[Experience]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_experiences(db, profile.id)
```

to:

```python
@router.get("/me/experiences", response_model=list[ExperienceRead])
async def list_my_experiences(profile: CandidateProfile_dep, db: DB) -> list[Experience]:
    return await candidate_service.list_experiences(db, profile.id)
```

Apply this pattern to all 9 endpoints that use the profile:

- `list_my_experiences`, `create_my_experience`, `update_my_experience`, `delete_my_experience`
- `list_my_skills`, `create_my_skill`, `update_my_skill`, `delete_my_skill`
- `list_my_education`, `create_my_education`, `update_my_education`, `delete_my_education`
- `list_my_certifications`, `create_my_certification`, `update_my_certification`, `delete_my_certification`
- `list_my_languages`, `create_my_language`, `update_my_language`, `delete_my_language`

Keep `get_my_profile` and `update_my_profile` using `current_user: CandidateUser` since they deal with profile creation/update directly.

- [ ] **Step 3: Run tests**

```bash
cd backend && python -m pytest tests/ -x -q
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/api/deps.py backend/api/routes/candidates.py
git commit -m "refactor: add profile dependency to candidates router — remove 9 redundant get_or_create calls"
```

---

## Task 7: CandidateQueryBuilder in recruiter_service

**Files:**

- Modify: `backend/services/recruiter_service.py`

- [ ] **Step 1: Add `CandidateQueryBuilder` class and slim `list_accessible_candidates`**

Insert the class before `list_accessible_candidates` and replace that function:

```python
# Add these imports at the top of recruiter_service.py (after existing imports):
from typing import Any, Self
from sqlalchemy import Select, exists, func, or_
from sqlalchemy.dialects.postgresql import array
from models.candidate_profile import CandidateProfile, Skill
from models.invitation import AccessGrant, AccessGrantStatus
from models.user import User


class CandidateQueryBuilder:
    def __init__(self, organization_id: UUID) -> None:
        self._stmt: Select[Any] = (
            select(
                User.id.label("user_id"),
                User.email,
                CandidateProfile.first_name,
                CandidateProfile.last_name,
                CandidateProfile.title,
                CandidateProfile.daily_rate,
                CandidateProfile.contract_type,
                CandidateProfile.availability_status,
                CandidateProfile.work_mode,
                CandidateProfile.location_preference,
                CandidateProfile.preferred_domains,
            )
            .join(AccessGrant, AccessGrant.candidate_id == User.id)
            .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
            .where(
                AccessGrant.organization_id == organization_id,
                AccessGrant.status == AccessGrantStatus.ACTIVE,
            )
            .order_by(
                CandidateProfile.last_name.nulls_last(),
                CandidateProfile.first_name.nulls_last(),
            )
        )

    def filter_availability(self, status: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.availability_status == status)
        return self

    def filter_work_mode(self, mode: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.work_mode == mode)
        return self

    def filter_contract_type(self, contract_type: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.contract_type == contract_type)
        return self

    def filter_mission_duration(self, duration: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.mission_duration == duration)
        return self

    def filter_max_rate(self, max_rate: int) -> Self:
        self._stmt = self._stmt.where(
            or_(
                CandidateProfile.daily_rate.is_(None),
                CandidateProfile.daily_rate <= max_rate,
            )
        )
        return self

    def filter_skill(self, skill: str) -> Self:
        self._stmt = self._stmt.where(
            exists(
                select(Skill.id).where(
                    Skill.profile_id == CandidateProfile.id,
                    func.lower(Skill.name).contains(skill.lower()),
                )
            )
        )
        return self

    def filter_location(self, location: str) -> Self:
        self._stmt = self._stmt.where(
            CandidateProfile.location_preference.ilike(f"%{location}%")
        )
        return self

    def filter_domain(self, domain: str) -> Self:
        self._stmt = self._stmt.where(
            CandidateProfile.preferred_domains.contains(array([domain]))
        )
        return self

    def filter_query(self, q: str) -> Self:
        q_like = f"%{q}%"
        self._stmt = self._stmt.where(
            or_(
                CandidateProfile.title.ilike(q_like),
                CandidateProfile.summary.ilike(q_like),
            )
        )
        return self

    def build(self) -> Select[Any]:
        return self._stmt


async def list_accessible_candidates(
    db: AsyncSession,
    organization_id: UUID,
    *,
    availability_status: str | None = None,
    work_mode: str | None = None,
    contract_type: str | None = None,
    mission_duration: str | None = None,
    max_daily_rate: int | None = None,
    skill: str | None = None,
    location: str | None = None,
    domain: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    builder = CandidateQueryBuilder(organization_id)
    if availability_status:
        builder.filter_availability(availability_status)
    if work_mode:
        builder.filter_work_mode(work_mode)
    if contract_type:
        builder.filter_contract_type(contract_type)
    if mission_duration:
        builder.filter_mission_duration(mission_duration)
    if max_daily_rate is not None:
        builder.filter_max_rate(max_daily_rate)
    if skill:
        builder.filter_skill(skill)
    if location:
        builder.filter_location(location)
    if domain:
        builder.filter_domain(domain)
    if q:
        builder.filter_query(q)

    result = await db.execute(builder.build())
    return [
        {
            "user_id": row.user_id,
            "email": row.email,
            "first_name": row.first_name,
            "last_name": row.last_name,
            "title": row.title,
            "daily_rate": row.daily_rate,
            "contract_type": row.contract_type,
            "availability_status": row.availability_status,
            "work_mode": row.work_mode,
            "location_preference": row.location_preference,
            "preferred_domains": row.preferred_domains,
        }
        for row in result.all()
    ]
```

Also **remove** the old inline imports at the top of `list_accessible_candidates` (the `from sqlalchemy import exists, func, or_` block inside the function body), since they're now at module level in the class.

- [ ] **Step 2: Clean up the old inline imports inside `list_accessible_candidates`**

The old function body had these inside it:

```python
    from sqlalchemy import exists, func, or_
    from models.candidate_profile import CandidateProfile, Skill
    from models.invitation import AccessGrant, AccessGrantStatus
    from models.user import User
```

Remove those four lines — they're now at module level via the class imports.

- [ ] **Step 3: Run tests**

```bash
cd backend && python -m pytest tests/ -x -q
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/services/recruiter_service.py
git commit -m "refactor: extract CandidateQueryBuilder from list_accessible_candidates"
```

---

## Task 7: Frontend — lib/errors.ts and ErrorAlert

**Files:**

- Create: `frontend/lib/errors.ts`
- Create: `frontend/components/ui/ErrorAlert.tsx`

- [ ] **Step 1: Create `frontend/lib/errors.ts`**

```typescript
// frontend/lib/errors.ts
import { ApiError } from "@/lib/api";

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return fallback;
}
```

- [ ] **Step 2: Create `frontend/components/ui/ErrorAlert.tsx`**

```tsx
// frontend/components/ui/ErrorAlert.tsx

interface ErrorAlertProps {
  error: string | null;
}

export function ErrorAlert({ error }: ErrorAlertProps) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/errors.ts frontend/components/ui/ErrorAlert.tsx
git commit -m "refactor: add extractErrorMessage utility and ErrorAlert component"
```

---

## Task 8: Frontend — useAsyncData hook

**Files:**

- Create: `frontend/lib/hooks/useAsyncData.ts`

- [ ] **Step 1: Create `frontend/lib/hooks/useAsyncData.ts`**

```typescript
// frontend/lib/hooks/useAsyncData.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  fallbackError = "Erreur de chargement",
): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err, fallbackError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { data, loading, error, refetch };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/hooks/useAsyncData.ts
git commit -m "refactor: add useAsyncData hook"
```

---

## Task 9: Frontend — useDownload hook

**Files:**

- Create: `frontend/lib/hooks/useDownload.ts`

- [ ] **Step 1: Create `frontend/lib/hooks/useDownload.ts`**

```typescript
// frontend/lib/hooks/useDownload.ts
"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";

interface UseDownload {
  download: (path: string, filename: string, id: string) => void;
  errors: Record<string, string>;
  clearError: (id: string) => void;
}

export function useDownload(): UseDownload {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function clearError(id: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function download(path: string, filename: string, id: string) {
    clearError(id);
    api.download(path, filename).catch((err) => {
      setErrors((prev) => ({
        ...prev,
        [id]: extractErrorMessage(err, "Erreur de téléchargement"),
      }));
    });
  }

  return { download, errors, clearError };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/hooks/useDownload.ts
git commit -m "refactor: add useDownload hook"
```

---

## Task 10: Frontend — useFormField hook

**Files:**

- Create: `frontend/lib/hooks/useFormField.ts`

- [ ] **Step 1: Create `frontend/lib/hooks/useFormField.ts`**

```typescript
// frontend/lib/hooks/useFormField.ts
"use client";

import { useCallback, useState } from "react";

type SetField<T> = <K extends keyof T>(key: K, value: T[K]) => void;

export function useFormField<T>(
  initial: T,
): [T | null, SetField<T>, () => void, (v: T) => void] {
  const [form, setForm] = useState<T | null>(null);

  const setField: SetField<T> = useCallback((key, value) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const reset = useCallback(() => setForm(null), []);
  const open = useCallback((value: T) => setForm(value), []);

  return [form, setField, reset, open];
}
```

Usage: `const [form, setField, closeForm, openForm] = useFormField<SkillForm>(EMPTY_SKILL);`

- `openForm(EMPTY_SKILL)` — open the form with a blank record
- `openForm(existingItem)` — open the form in edit mode
- `closeForm()` — close/reset to null
- `form` — current form value (null = form is closed)

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/hooks/useFormField.ts
git commit -m "refactor: add useFormField hook"
```

---

## Task 11: Frontend — useRecruiterOrg hook

**Files:**

- Create: `frontend/lib/hooks/useRecruiterOrg.ts`
- Create: `frontend/lib/hooks/index.ts`

- [ ] **Step 1: Create `frontend/lib/hooks/useRecruiterOrg.ts`**

```typescript
// frontend/lib/hooks/useRecruiterOrg.ts
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { RecruiterProfile } from "@/types/api";

interface RecruiterOrgState {
  orgId: string | null;
  profile: RecruiterProfile | null;
  loading: boolean;
  error: string | null;
}

export function useRecruiterOrg(): RecruiterOrgState {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RecruiterProfile>("/recruiters/me/profile")
      .then((p) => {
        setProfile(p);
        setOrgId(p.organization_id ?? null);
      })
      .catch((err) =>
        setError(extractErrorMessage(err, "Impossible de charger le profil")),
      )
      .finally(() => setLoading(false));
  }, []);

  return { orgId, profile, loading, error };
}
```

- [ ] **Step 2: Create `frontend/lib/hooks/index.ts`**

```typescript
// frontend/lib/hooks/index.ts
export { useAsyncData } from "./useAsyncData";
export { useDownload } from "./useDownload";
export { useFormField } from "./useFormField";
export { useRecruiterOrg } from "./useRecruiterOrg";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/hooks/useRecruiterOrg.ts frontend/lib/hooks/index.ts
git commit -m "refactor: add useRecruiterOrg hook and hooks barrel"
```

---

## Task 12: Frontend — EmptyState and StatusBadge components

**Files:**

- Create: `frontend/components/ui/EmptyState.tsx`
- Create: `frontend/components/ui/StatusBadge.tsx`

- [ ] **Step 1: Create `frontend/components/ui/EmptyState.tsx`**

```tsx
// frontend/components/ui/EmptyState.tsx

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return <p className="text-muted-foreground">{message}</p>;
}
```

- [ ] **Step 2: Create `frontend/components/ui/StatusBadge.tsx`**

```tsx
// frontend/components/ui/StatusBadge.tsx
import { Badge } from "@/components/ui/badge";

type Variant = "default" | "secondary" | "destructive" | "outline";

interface StatusBadgeProps {
  status: string;
  labels: Record<string, string>;
  variants: Record<string, Variant>;
  fallbackLabel?: string;
  fallbackVariant?: Variant;
}

export function StatusBadge({
  status,
  labels,
  variants,
  fallbackLabel = status,
  fallbackVariant = "secondary",
}: StatusBadgeProps) {
  return (
    <Badge variant={variants[status] ?? fallbackVariant}>
      {labels[status] ?? fallbackLabel}
    </Badge>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ui/EmptyState.tsx frontend/components/ui/StatusBadge.tsx
git commit -m "refactor: add EmptyState and StatusBadge shared components"
```

---

## Task 13: Migrate candidate/history page

**Files:**

- Modify: `frontend/app/(candidate)/candidate/history/page.tsx`

- [ ] **Step 1: Replace the file**

```tsx
// frontend/app/(candidate)/candidate/history/page.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { useAsyncData, useDownload } from "@/lib/hooks";
import type { GeneratedDocument } from "@/types/api";

export default function HistoryPage() {
  const {
    data: docs,
    loading,
    error,
  } = useAsyncData<GeneratedDocument[]>(
    () => api.get("/candidates/me/documents"),
    "Impossible de charger les dossiers",
  );
  const { download, errors: downloadErrors } = useDownload();

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dossiers générés</h1>
      <ErrorAlert error={error} />
      {!docs || docs.length === 0 ? (
        <EmptyState message="Aucun dossier généré pour l'instant." />
      ) : (
        <ul className="space-y-3" role="list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {new Date(doc.generated_at).toLocaleString("fr-FR")}
                    </CardTitle>
                    <Badge variant="secondary">
                      {doc.file_format.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      download(
                        `/documents/${doc.id}/download`,
                        `dossier.${doc.file_format}`,
                        doc.id,
                      )
                    }
                  >
                    Télécharger
                  </Button>
                  <ErrorAlert error={downloadErrors[doc.id] ?? null} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/(candidate)/candidate/history/page.tsx
git commit -m "refactor: migrate candidate history page to shared hooks"
```

---

## Task 14: Migrate recruiter/history and recruiter/candidates pages

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/history/page.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/candidates/page.tsx`

- [ ] **Step 1: Update `recruiter/history/page.tsx`**

Open the file and apply these changes:

1. Replace any inline recruiter profile/orgId fetch chain with `const { orgId, loading: orgLoading, error: orgError } = useRecruiterOrg();`
2. Replace inline download error state with `const { download, errors: downloadErrors } = useDownload();`
3. Replace all `api.download(...)` calls with `download(path, filename, doc.id)`
4. Replace all `{downloadErrors[doc.id] && <p role="alert">...</p>}` with `<ErrorAlert error={downloadErrors[doc.id] ?? null} />`
5. Replace empty-state inline paragraphs with `<EmptyState message="..." />`
6. Replace fetch error inline paragraphs with `<ErrorAlert error={error} />`
7. Add imports for the new hooks and components.

Read the current file before editing:

```bash
cat frontend/app/\(recruiter\)/recruiter/history/page.tsx
```

Then apply the above changes.

- [ ] **Step 2: Update `recruiter/candidates/page.tsx`**

In this file:

1. Replace the recruiter profile fetch chain at the top with `const { orgId, loading: orgLoading, error: orgError } = useRecruiterOrg();`
2. Replace all `err instanceof ApiError ? err.detail : "Erreur de chargement"` with `extractErrorMessage(err, "Erreur de chargement")`
3. Replace all inline `{error && <p role="alert" ...>}` with `<ErrorAlert error={error} />`
4. Import `useRecruiterOrg` from `@/lib/hooks`, `extractErrorMessage` from `@/lib/errors`, `ErrorAlert` from `@/components/ui/ErrorAlert`.

Read the current file before editing:

```bash
cat frontend/app/\(recruiter\)/recruiter/candidates/page.tsx
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/history/page.tsx \
         frontend/app/\(recruiter\)/recruiter/candidates/page.tsx
git commit -m "refactor: migrate recruiter history and candidates pages to shared hooks"
```

---

## Task 15: Migrate remaining recruiter pages

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/opportunities/page.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/templates/page.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/generate/page.tsx`

Apply the same migration pattern as Task 14 to each file:

- [ ] **Step 1: Read each file before editing**

```bash
cat frontend/app/\(recruiter\)/recruiter/opportunities/page.tsx
cat frontend/app/\(recruiter\)/recruiter/templates/page.tsx
cat frontend/app/\(recruiter\)/recruiter/generate/page.tsx
```

- [ ] **Step 2: Apply migrations to all three files**

For each file:

1. Replace recruiter profile/org fetch with `useRecruiterOrg()`
2. Replace `api.download` error handling with `useDownload()` (in generate page)
3. Replace inline error paragraphs with `<ErrorAlert error={...} />`
4. Replace inline empty-state paragraphs with `<EmptyState message="..." />`
5. Add the necessary imports.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/opportunities/page.tsx \
         frontend/app/\(recruiter\)/recruiter/templates/page.tsx \
         frontend/app/\(recruiter\)/recruiter/generate/page.tsx
git commit -m "refactor: migrate recruiter opportunities, templates, generate pages"
```

---

## Task 16: Migrate candidate pages (access, requests, invitations)

**Files:**

- Modify: `frontend/app/(candidate)/candidate/access/page.tsx`
- Modify: `frontend/app/(candidate)/candidate/requests/page.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/invitations/page.tsx`

- [ ] **Step 1: Read all three files**

```bash
cat frontend/app/\(candidate\)/candidate/access/page.tsx
cat frontend/app/\(candidate\)/candidate/requests/page.tsx
cat frontend/app/\(recruiter\)/recruiter/invitations/page.tsx
```

- [ ] **Step 2: Apply migrations to all three files**

For each file:

1. Replace the inline `useEffect → api.get → setState → setLoading → setError` block with `useAsyncData`
2. Replace `STATUS_LABELS` + `STATUS_VARIANTS` + `<Badge variant={...}>` pattern with `<StatusBadge status={...} labels={...} variants={...} />`
3. Replace inline empty-state paragraphs with `<EmptyState message="..." />`
4. Replace inline error paragraphs with `<ErrorAlert error={error} />`

For `access.tsx`, the `StatusBadge` call:

```tsx
<StatusBadge
  status={grant.status}
  labels={{ active: "Accès actif", revoked: "Accès révoqué" }}
  variants={{ active: "default", revoked: "destructive" }}
/>
```

For `requests.tsx` and `invitations.tsx`, the status maps correspond to InvitationStatus values — use the same pattern with appropriate labels.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/access/page.tsx \
         frontend/app/\(candidate\)/candidate/requests/page.tsx \
         frontend/app/\(recruiter\)/recruiter/invitations/page.tsx
git commit -m "refactor: migrate access, requests, invitations pages to shared hooks and components"
```

---

## Task 17: Migrate skills page and clean up constants

**Files:**

- Modify: `frontend/app/(candidate)/candidate/skills/page.tsx`

- [ ] **Step 1: Replace `errMsg` with `extractErrorMessage`**

In `skills/page.tsx`, remove the local `errMsg` function (lines 48–52) and add import:

```typescript
import { extractErrorMessage } from "@/lib/errors";
```

Replace all calls from `errMsg(err, fallback)` to `extractErrorMessage(err, fallback)`.

- [ ] **Step 2: Replace inline error paragraphs with `<ErrorAlert>`**

Replace all:

```tsx
{
  error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
```

with:

```tsx
<ErrorAlert error={error} />
```

Add import:

```typescript
import { ErrorAlert } from "@/components/ui/ErrorAlert";
```

- [ ] **Step 3: Replace inline empty-state paragraphs with `<EmptyState>`**

Replace all:

```tsx
<p className="text-muted-foreground">Aucune {entity} pour l&apos;instant.</p>
```

with:

```tsx
<EmptyState message="Aucune {entity} pour l'instant." />
```

Add import:

```typescript
import { EmptyState } from "@/components/ui/EmptyState";
```

- [ ] **Step 4: Remove duplicate `SKILL_CATEGORIES` constant**

The constant is already in `types/api.ts`. Remove the local `SKILL_CATEGORIES` declaration (lines 29–36 of skills/page.tsx) and import from types if it's exported there. If it isn't exported from types, keep the local declaration — do not add a re-export to types just for this.

- [ ] **Step 5: Remove duplicate `VALID_DOMAINS` from candidates page**

In `frontend/app/(recruiter)/recruiter/candidates/page.tsx`, find the inline domain list and replace it with an import from `@/types/api` (if exported). If not exported, leave the local copy and note that it should be exported from types in a follow-up.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/skills/page.tsx \
         frontend/app/\(recruiter\)/recruiter/candidates/page.tsx
git commit -m "refactor: migrate skills page and clean up duplicate constants"
```

---

## Task 18: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: all tests pass, coverage floor ≥ 20%.

- [ ] **Step 2: Run full frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run frontend lint**

```bash
cd frontend && npx eslint . --max-warnings 0
```

Expected: no warnings or errors.

- [ ] **Step 4: Run backend lint**

```bash
cd backend && ruff check . && ruff format --check .
```

Expected: no issues.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "refactor: full-stack refactoring — exceptions, docx_engine, CRUDService, frontend hooks/components"
```
