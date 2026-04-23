# C4 — Shortlist de staffing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au recruteur de créer des `Opportunity` (opportunités de mission) et d'y associer des candidats en shortlist, avec génération de dossiers en masse.

**Architecture:** Deux nouvelles tables (`opportunities`, `shortlist_entries`) avec contrainte unique `(opportunity_id, candidate_id)`. Nouveau service `opportunity_service.py`. Nouveau router `api/routes/opportunities.py` monté sous `/organizations/{org_id}/opportunities`. La génération bulk réutilise `generation_service.generate_for_candidate` existant. Bouton "Ajouter à une opportunité" dans la liste candidats existante.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, Next.js 15 + shadcn/ui Dialog, pytest + testcontainers.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section C4)

**Prérequis:** Plans 1–6 + P0/P1/P2 + G1+G2 mergés. Toutes les commandes depuis `backend/`.

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/models/opportunity.py` | CREATE | Modèles `Opportunity` + `ShortlistEntry` |
| `backend/models/__init__.py` | MODIFY | Exporter les nouveaux modèles |
| `backend/alembic/versions/XXXX_add_opportunities.py` | CREATE | Migration Alembic |
| `backend/schemas/opportunity.py` | CREATE | Tous les schémas Pydantic |
| `backend/services/opportunity_service.py` | CREATE | CRUD + génération bulk |
| `backend/api/routes/opportunities.py` | CREATE | Tous les endpoints |
| `backend/main.py` | MODIFY | Enregistrer le router |
| `backend/tests/integration/test_opportunities_api.py` | CREATE | Tests complets |
| `frontend/types/api.ts` | MODIFY | Ajouter types Opportunity |
| `frontend/app/(recruiter)/recruiter/opportunities/page.tsx` | CREATE | Liste des opportunités |
| `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx` | CREATE | Détail + shortlist |
| `frontend/app/(recruiter)/recruiter/candidates/page.tsx` | MODIFY | Bouton "Ajouter à une opportunité" |

---

### Task 1 : Modèles DB

**Files:**
- Create: `backend/models/opportunity.py`
- Modify: `backend/models/__init__.py`

- [ ] **Step 1 : Créer `backend/models/opportunity.py`**

```python
# backend/models/opportunity.py
from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class OpportunityStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class Opportunity(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "opportunities"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[OpportunityStatus] = mapped_column(
        Enum(OpportunityStatus, name="opportunity_status"),
        default=OpportunityStatus.OPEN,
        nullable=False,
    )


class ShortlistEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "shortlist_entries"

    __table_args__ = (
        UniqueConstraint("opportunity_id", "candidate_id", name="uq_shortlist_entry"),
    )

    opportunity_id: Mapped[UUID] = mapped_column(
        ForeignKey("opportunities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
```

- [ ] **Step 2 : Exporter dans `backend/models/__init__.py`**

Ajouter l'import :

```python
from models.opportunity import Opportunity, OpportunityStatus, ShortlistEntry
```

Et dans `__all__` :

```python
"Opportunity",
"OpportunityStatus",
"ShortlistEntry",
```

- [ ] **Step 3 : Commit**

```bash
git add backend/models/opportunity.py backend/models/__init__.py
git commit -m "feat(c4): add Opportunity and ShortlistEntry models"
```

---

### Task 2 : Migration Alembic

**Files:**
- Create: `backend/alembic/versions/XXXX_add_opportunities.py`

- [ ] **Step 1 : Générer la migration**

```bash
uv run alembic revision --autogenerate -m "add_opportunities_and_shortlist_entries"
```

- [ ] **Step 2 : Vérifier le contenu de la migration**

Le fichier généré doit contenir :
- `op.create_table("opportunities", ...)` avec toutes les colonnes
- `op.create_table("shortlist_entries", ...)` avec la contrainte unique `uq_shortlist_entry`
- `sa.Enum('open','closed', name='opportunity_status')`
- Le `down_revision` doit pointer sur `8ac7cd2e1874` (ou le head actuel — ajuster si C1 est mergé avant).

- [ ] **Step 3 : Appliquer**

```bash
uv run alembic upgrade head
```

- [ ] **Step 4 : Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(c4): alembic migration — create opportunities and shortlist_entries tables"
```

---

### Task 3 : Schémas Pydantic

**Files:**
- Create: `backend/schemas/opportunity.py`

- [ ] **Step 1 : Créer `backend/schemas/opportunity.py`**

```python
# backend/schemas/opportunity.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.opportunity import OpportunityStatus


class OpportunityCreate(BaseModel):
    title: str
    description: str | None = None


class OpportunityUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: OpportunityStatus | None = None


class ShortlistCandidateInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    title: str | None


class OpportunityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    title: str
    description: str | None
    status: OpportunityStatus
    created_at: datetime
    updated_at: datetime


class OpportunityDetail(OpportunityRead):
    shortlist: list[ShortlistCandidateInfo] = []


class ShortlistAddRequest(BaseModel):
    candidate_id: UUID


class BulkGenerateRequest(BaseModel):
    template_id: UUID
    format: str = "docx"


class BulkGenerateResult(BaseModel):
    candidate_id: UUID
    status: str          # "ok" | "error"
    doc_id: UUID | None = None
    error: str | None = None
```

- [ ] **Step 2 : Commit**

```bash
git add backend/schemas/opportunity.py
git commit -m "feat(c4): add opportunity Pydantic schemas"
```

---

### Task 4 : Service `opportunity_service.py`

**Files:**
- Create: `backend/services/opportunity_service.py`

- [ ] **Step 1 : Écrire les tests du service (via API)**

Créer `backend/tests/integration/test_opportunities_api.py` :

```python
# backend/tests/integration/test_opportunities_api.py
import uuid
from httpx import AsyncClient


# ---- Helpers -----------------------------------------------------------------

async def _setup_org(client: AsyncClient, headers: dict) -> str:
    """Create an org and link recruiter to it. Returns org_id."""
    org = await client.post("/organizations", json={"name": "Opp Org"}, headers=headers)
    org_id = org.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=headers)
    return org_id


async def _create_opportunity(client: AsyncClient, headers: dict, org_id: str, title: str = "Mission Alpha") -> dict:
    r = await client.post(
        f"/organizations/{org_id}/opportunities",
        json={"title": title},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()


# ---- CRUD -------------------------------------------------------------------


async def test_create_opportunity(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    assert opp["title"] == "Mission Alpha"
    assert opp["status"] == "open"


async def test_list_opportunities(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    await _create_opportunity(client, recruiter_headers, org_id, "Opp A")
    await _create_opportunity(client, recruiter_headers, org_id, "Opp B")

    r = await client.get(f"/organizations/{org_id}/opportunities", headers=recruiter_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_get_opportunity_detail(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    opp_id = opp["id"]

    r = await client.get(f"/organizations/{org_id}/opportunities/{opp_id}", headers=recruiter_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == opp_id
    assert data["shortlist"] == []


async def test_close_opportunity(client: AsyncClient, recruiter_headers: dict) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    opp_id = opp["id"]

    r = await client.patch(
        f"/organizations/{org_id}/opportunities/{opp_id}",
        json={"status": "closed"},
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "closed"


# ---- Shortlist --------------------------------------------------------------


async def test_add_candidate_to_shortlist(
    client: AsyncClient,
    recruiter_headers: dict,
    candidate_headers: dict,
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    opp_id = opp["id"]

    # Invite + accept candidate
    await client.post(
        "/invitations",
        json={"candidate_email": "candidate@test.com", "organization_id": org_id},
        headers=recruiter_headers,
    )
    inv_r = await client.get("/candidates/me/invitations", headers=candidate_headers)
    token = inv_r.json()[0]["token"]
    await client.post(f"/invitations/accept/{token}", headers=candidate_headers)

    # Get candidate user_id
    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]

    r = await client.post(
        f"/organizations/{org_id}/opportunities/{opp_id}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    assert r.status_code == 201

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp_id}", headers=recruiter_headers
    )
    assert len(detail.json()["shortlist"]) == 1


async def test_add_candidate_without_grant_returns_403(
    client: AsyncClient,
    recruiter_headers: dict,
    candidate_headers: dict,
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)

    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]

    r = await client.post(
        f"/organizations/{org_id}/opportunities/{opp['id']}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    assert r.status_code == 403


async def test_duplicate_shortlist_entry_returns_409(
    client: AsyncClient,
    recruiter_headers: dict,
    candidate_headers: dict,
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    opp_id = opp["id"]

    await client.post(
        "/invitations",
        json={"candidate_email": "candidate@test.com", "organization_id": org_id},
        headers=recruiter_headers,
    )
    inv_r = await client.get("/candidates/me/invitations", headers=candidate_headers)
    token = inv_r.json()[0]["token"]
    await client.post(f"/invitations/accept/{token}", headers=candidate_headers)

    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]

    await client.post(
        f"/organizations/{org_id}/opportunities/{opp_id}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    r2 = await client.post(
        f"/organizations/{org_id}/opportunities/{opp_id}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )
    assert r2.status_code == 409


async def test_remove_candidate_from_shortlist(
    client: AsyncClient,
    recruiter_headers: dict,
    candidate_headers: dict,
) -> None:
    org_id = await _setup_org(client, recruiter_headers)
    opp = await _create_opportunity(client, recruiter_headers, org_id)
    opp_id = opp["id"]

    await client.post(
        "/invitations",
        json={"candidate_email": "candidate@test.com", "organization_id": org_id},
        headers=recruiter_headers,
    )
    inv_r = await client.get("/candidates/me/invitations", headers=candidate_headers)
    token = inv_r.json()[0]["token"]
    await client.post(f"/invitations/accept/{token}", headers=candidate_headers)

    profile_r = await client.get("/candidates/me/profile", headers=candidate_headers)
    cand_user_id = profile_r.json()["user_id"]

    await client.post(
        f"/organizations/{org_id}/opportunities/{opp_id}/candidates",
        json={"candidate_id": cand_user_id},
        headers=recruiter_headers,
    )

    r = await client.delete(
        f"/organizations/{org_id}/opportunities/{opp_id}/candidates/{cand_user_id}",
        headers=recruiter_headers,
    )
    assert r.status_code == 204

    detail = await client.get(
        f"/organizations/{org_id}/opportunities/{opp_id}", headers=recruiter_headers
    )
    assert detail.json()["shortlist"] == []
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
uv run pytest tests/integration/test_opportunities_api.py -v
```

Résultat attendu : FAIL (router not registered, 404).

- [ ] **Step 3 : Créer `backend/services/opportunity_service.py`**

```python
# backend/services/opportunity_service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile
from models.invitation import AccessGrant, AccessGrantStatus
from models.opportunity import Opportunity, OpportunityStatus, ShortlistEntry
from models.user import User
from schemas.opportunity import (
    BulkGenerateResult,
    OpportunityCreate,
    OpportunityDetail,
    OpportunityUpdate,
    ShortlistCandidateInfo,
)


async def create_opportunity(
    db: AsyncSession,
    organization_id: UUID,
    created_by: UUID,
    data: OpportunityCreate,
) -> Opportunity:
    opp = Opportunity(
        organization_id=organization_id,
        created_by=created_by,
        title=data.title,
        description=data.description,
    )
    db.add(opp)
    await db.commit()
    await db.refresh(opp)
    return opp


async def list_opportunities(db: AsyncSession, organization_id: UUID) -> list[Opportunity]:
    result = await db.execute(
        select(Opportunity)
        .where(Opportunity.organization_id == organization_id)
        .order_by(Opportunity.created_at.desc())
    )
    return list(result.scalars().all())


async def get_opportunity(
    db: AsyncSession, opportunity_id: UUID, organization_id: UUID
) -> Opportunity | None:
    result = await db.execute(
        select(Opportunity).where(
            Opportunity.id == opportunity_id,
            Opportunity.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def update_opportunity(
    db: AsyncSession, opp: Opportunity, data: OpportunityUpdate
) -> Opportunity:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(opp, field, value)
    await db.commit()
    await db.refresh(opp)
    return opp


async def get_opportunity_detail(
    db: AsyncSession, opportunity_id: UUID, organization_id: UUID
) -> OpportunityDetail | None:
    opp = await get_opportunity(db, opportunity_id, organization_id)
    if opp is None:
        return None

    # Fetch shortlist candidates
    result = await db.execute(
        select(User, CandidateProfile, ShortlistEntry)
        .join(ShortlistEntry, ShortlistEntry.candidate_id == User.id)
        .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
        .where(ShortlistEntry.opportunity_id == opportunity_id)
        .order_by(ShortlistEntry.created_at)
    )
    shortlist = [
        ShortlistCandidateInfo(
            user_id=row.User.id,
            email=row.User.email,
            first_name=row.CandidateProfile.first_name if row.CandidateProfile else None,
            last_name=row.CandidateProfile.last_name if row.CandidateProfile else None,
            title=row.CandidateProfile.title if row.CandidateProfile else None,
        )
        for row in result.all()
    ]

    return OpportunityDetail(
        id=opp.id,
        organization_id=opp.organization_id,
        title=opp.title,
        description=opp.description,
        status=opp.status,
        created_at=opp.created_at,
        updated_at=opp.updated_at,
        shortlist=shortlist,
    )


async def add_to_shortlist(
    db: AsyncSession,
    opportunity_id: UUID,
    organization_id: UUID,
    candidate_id: UUID,
) -> ShortlistEntry:
    # Verify active grant
    grant_result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.candidate_id == candidate_id,
            AccessGrant.organization_id == organization_id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
    )
    if grant_result.scalar_one_or_none() is None:
        raise ValueError("no_active_grant")

    entry = ShortlistEntry(opportunity_id=opportunity_id, candidate_id=candidate_id)
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError("duplicate_entry")
    await db.refresh(entry)
    return entry


async def remove_from_shortlist(
    db: AsyncSession, opportunity_id: UUID, candidate_id: UUID
) -> bool:
    result = await db.execute(
        select(ShortlistEntry).where(
            ShortlistEntry.opportunity_id == opportunity_id,
            ShortlistEntry.candidate_id == candidate_id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return False
    await db.delete(entry)
    await db.commit()
    return True


async def bulk_generate(
    db: AsyncSession,
    opportunity_id: UUID,
    organization_id: UUID,
    template_id: UUID,
    generated_by_user_id: UUID,
    fmt: str,
) -> list[BulkGenerateResult]:
    from services import generation_service

    entries_result = await db.execute(
        select(ShortlistEntry).where(ShortlistEntry.opportunity_id == opportunity_id)
    )
    entries = list(entries_result.scalars().all())

    results: list[BulkGenerateResult] = []
    for entry in entries:
        try:
            doc = await generation_service.generate_for_candidate(
                db,
                organization_id=organization_id,
                template_id=template_id,
                candidate_id=entry.candidate_id,
                generated_by_user_id=generated_by_user_id,
                fmt=fmt,
            )
            results.append(BulkGenerateResult(
                candidate_id=entry.candidate_id,
                status="ok",
                doc_id=doc.id,
            ))
        except Exception as e:
            results.append(BulkGenerateResult(
                candidate_id=entry.candidate_id,
                status="error",
                error=str(e),
            ))
    return results
```

- [ ] **Step 4 : Commit**

```bash
git add backend/services/opportunity_service.py backend/tests/integration/test_opportunities_api.py
git commit -m "feat(c4): add opportunity_service and opportunity tests"
```

---

### Task 5 : Router `api/routes/opportunities.py` + main.py

**Files:**
- Create: `backend/api/routes/opportunities.py`
- Modify: `backend/main.py`

- [ ] **Step 1 : Créer `backend/api/routes/opportunities.py`**

```python
# backend/api/routes/opportunities.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

import services.opportunity_service as opportunity_service
import services.recruiter_service as recruiter_service
from api.deps import get_db, require_role
from models.opportunity import Opportunity
from models.user import User, UserRole
from schemas.opportunity import (
    BulkGenerateRequest,
    BulkGenerateResult,
    OpportunityCreate,
    OpportunityDetail,
    OpportunityRead,
    OpportunityUpdate,
    ShortlistAddRequest,
)

router = APIRouter(prefix="/organizations", tags=["opportunities"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _require_membership(db: AsyncSession, user_id: UUID, org_id: UUID) -> None:
    profile = await recruiter_service.get_or_create_profile(db, user_id)
    if profile.organization_id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")


async def _get_opp_or_404(
    db: AsyncSession, opp_id: UUID, org_id: UUID
) -> Opportunity:
    opp = await opportunity_service.get_opportunity(db, opp_id, org_id)
    if opp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="opportunity not found")
    return opp


@router.post("/{org_id}/opportunities", response_model=OpportunityRead, status_code=status.HTTP_201_CREATED)
async def create_opportunity(
    org_id: UUID, data: OpportunityCreate, current_user: RecruiterUser, db: DB
) -> Opportunity:
    await _require_membership(db, current_user.id, org_id)
    return await opportunity_service.create_opportunity(db, org_id, current_user.id, data)


@router.get("/{org_id}/opportunities", response_model=list[OpportunityRead])
async def list_opportunities(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[Opportunity]:
    await _require_membership(db, current_user.id, org_id)
    return await opportunity_service.list_opportunities(db, org_id)


@router.get("/{org_id}/opportunities/{opp_id}", response_model=OpportunityDetail)
async def get_opportunity(
    org_id: UUID, opp_id: UUID, current_user: RecruiterUser, db: DB
) -> OpportunityDetail:
    await _require_membership(db, current_user.id, org_id)
    detail = await opportunity_service.get_opportunity_detail(db, opp_id, org_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="opportunity not found")
    return detail


@router.patch("/{org_id}/opportunities/{opp_id}", response_model=OpportunityRead)
async def update_opportunity(
    org_id: UUID, opp_id: UUID, data: OpportunityUpdate, current_user: RecruiterUser, db: DB
) -> Opportunity:
    await _require_membership(db, current_user.id, org_id)
    opp = await _get_opp_or_404(db, opp_id, org_id)
    return await opportunity_service.update_opportunity(db, opp, data)


@router.post(
    "/{org_id}/opportunities/{opp_id}/candidates",
    status_code=status.HTTP_201_CREATED,
)
async def add_to_shortlist(
    org_id: UUID, opp_id: UUID, data: ShortlistAddRequest, current_user: RecruiterUser, db: DB
) -> dict:
    await _require_membership(db, current_user.id, org_id)
    await _get_opp_or_404(db, opp_id, org_id)
    try:
        await opportunity_service.add_to_shortlist(db, opp_id, org_id, data.candidate_id)
        return {"status": "added"}
    except ValueError as e:
        if str(e) == "no_active_grant":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no active access grant")
        if str(e) == "duplicate_entry":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="candidate already in shortlist")
        raise


@router.delete("/{org_id}/opportunities/{opp_id}/candidates/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_shortlist(
    org_id: UUID, opp_id: UUID, candidate_id: UUID, current_user: RecruiterUser, db: DB
) -> None:
    await _require_membership(db, current_user.id, org_id)
    await _get_opp_or_404(db, opp_id, org_id)
    removed = await opportunity_service.remove_from_shortlist(db, opp_id, candidate_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="entry not found")


@router.post("/{org_id}/opportunities/{opp_id}/generate", response_model=list[BulkGenerateResult])
async def bulk_generate(
    org_id: UUID, opp_id: UUID, data: BulkGenerateRequest, current_user: RecruiterUser, db: DB
) -> list[BulkGenerateResult]:
    await _require_membership(db, current_user.id, org_id)
    await _get_opp_or_404(db, opp_id, org_id)
    return await opportunity_service.bulk_generate(
        db,
        opportunity_id=opp_id,
        organization_id=org_id,
        template_id=data.template_id,
        generated_by_user_id=current_user.id,
        fmt=data.format,
    )
```

- [ ] **Step 2 : Enregistrer dans `main.py`**

```python
from api.routes.opportunities import router as opportunities_router

app.include_router(opportunities_router)
```

- [ ] **Step 3 : Vérifier que les tests passent**

```bash
uv run pytest tests/integration/test_opportunities_api.py -v
```

Résultat attendu : tous les tests PASSED.

- [ ] **Step 4 : Vérifier la suite complète**

```bash
uv run pytest tests/ -v --tb=short
```

- [ ] **Step 5 : Commit**

```bash
git add backend/api/routes/opportunities.py backend/main.py
git commit -m "feat(c4): add opportunities router with CRUD, shortlist and bulk generate"
```

---

### Task 6 : Frontend — pages opportunités

**Files:**
- Modify: `frontend/types/api.ts`
- Create: `frontend/app/(recruiter)/recruiter/opportunities/page.tsx`
- Create: `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/candidates/page.tsx`

- [ ] **Step 1 : Ajouter les types dans `frontend/types/api.ts`**

```typescript
export type OpportunityStatus = "open" | "closed";

export interface OpportunityRead {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: OpportunityStatus;
  created_at: string;
  updated_at: string;
}

export interface ShortlistCandidateInfo {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
}

export interface OpportunityDetail extends OpportunityRead {
  shortlist: ShortlistCandidateInfo[];
}

export interface BulkGenerateResult {
  candidate_id: string;
  status: "ok" | "error";
  doc_id: string | null;
  error: string | null;
}
```

- [ ] **Step 2 : Créer `frontend/app/(recruiter)/recruiter/opportunities/page.tsx`**

```tsx
// frontend/app/(recruiter)/recruiter/opportunities/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import type { OpportunityRead, RecruiterProfile } from "@/types/api";

export default function OpportunitiesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get<RecruiterProfile>("/recruiters/me/profile").then((p) => {
      setOrgId(p.organization_id);
      if (p.organization_id) {
        return api
          .get<OpportunityRead[]>(`/organizations/${p.organization_id}/opportunities`)
          .then(setOpportunities)
          .catch((err) => setError(err instanceof ApiError ? err.detail : "Erreur"));
      }
    }).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      const opp = await api.post<OpportunityRead>(
        `/organizations/${orgId}/opportunities`,
        { title: title.trim(), description: description.trim() || null }
      );
      setOpportunities((prev) => [opp, ...prev]);
      setTitle("");
      setDescription("");
      setOpen(false);
    } catch (err) {
      alert(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId) return <p className="text-muted-foreground">Associez-vous à une organisation d&apos;abord.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Opportunités</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nouvelle opportunité</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une opportunité</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="opp-title">Titre</Label>
                <Input
                  id="opp-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="ex: Mission Data Engineer — Fintech"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opp-desc">Description (optionnel)</Label>
                <Textarea
                  id="opp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit" disabled={creating || !title.trim()}>
                  {creating ? "Création…" : "Créer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {opportunities.length === 0 ? (
        <p className="text-muted-foreground">Aucune opportunité. Créez-en une ci-dessus.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {opportunities.map((opp) => (
            <li key={opp.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{opp.title}</CardTitle>
                    <Badge variant={opp.status === "open" ? "default" : "secondary"}>
                      {opp.status === "open" ? "Ouverte" : "Clôturée"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {opp.description && (
                    <p className="mb-3 text-sm text-muted-foreground">{opp.description}</p>
                  )}
                  <Link href={`/recruiter/opportunities/${opp.id}`}>
                    <Button size="sm" variant="outline">Voir la shortlist</Button>
                  </Link>
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

- [ ] **Step 3 : Créer `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx`**

```tsx
// frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type {
  BulkGenerateResult,
  OpportunityDetail,
  RecruiterProfile,
  ShortlistCandidateInfo,
  Template,
} from "@/types/api";

export default function OpportunityDetailPage() {
  const { id: oppId } = useParams<{ id: string }>();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [opp, setOpp] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genFormat, setGenFormat] = useState("docx");
  const [generating, setGenerating] = useState(false);
  const [genResults, setGenResults] = useState<BulkGenerateResult[] | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    api.get<RecruiterProfile>("/recruiters/me/profile").then(async (p) => {
      setOrgId(p.organization_id);
      if (!p.organization_id) return;
      const [oppData, tmplData] = await Promise.all([
        api.get<OpportunityDetail>(`/organizations/${p.organization_id}/opportunities/${oppId}`),
        api.get<Template[]>(`/organizations/${p.organization_id}/templates`),
      ]);
      setOpp(oppData);
      setTemplates(tmplData.filter((t) => t.is_valid));
    }).catch((err) => setError(err instanceof ApiError ? err.detail : "Erreur")).finally(() => setLoading(false));
  }, [oppId]);

  async function handleRemove(candidateId: string) {
    if (!orgId || !opp) return;
    await api.delete(`/organizations/${orgId}/opportunities/${opp.id}/candidates/${candidateId}`);
    setOpp((prev) => prev ? { ...prev, shortlist: prev.shortlist.filter((c) => c.user_id !== candidateId) } : prev);
  }

  async function handleBulkGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !opp || !genTemplateId) return;
    setGenerating(true);
    try {
      const results = await api.post<BulkGenerateResult[]>(
        `/organizations/${orgId}/opportunities/${opp.id}/generate`,
        { template_id: genTemplateId, format: genFormat }
      );
      setGenResults(results);
    } catch (err) {
      alert(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setGenerating(false);
    }
  }

  async function handleClose() {
    if (!orgId || !opp) return;
    setClosing(true);
    try {
      const updated = await api.patch<OpportunityDetail>(
        `/organizations/${orgId}/opportunities/${opp.id}`,
        { status: "closed" }
      );
      setOpp((prev) => prev ? { ...prev, status: updated.status } : prev);
    } finally {
      setClosing(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!opp) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{opp.title}</h1>
          {opp.description && <p className="mt-1 text-sm text-muted-foreground">{opp.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={opp.status === "open" ? "default" : "secondary"}>
            {opp.status === "open" ? "Ouverte" : "Clôturée"}
          </Badge>
          {opp.status === "open" && (
            <Button variant="outline" size="sm" onClick={handleClose} disabled={closing}>
              {closing ? "…" : "Clôturer"}
            </Button>
          )}
        </div>
      </div>

      {/* Shortlist */}
      <Card>
        <CardHeader><CardTitle>Shortlist ({opp.shortlist.length} candidat{opp.shortlist.length !== 1 ? "s" : ""})</CardTitle></CardHeader>
        <CardContent>
          {opp.shortlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun candidat. Ajoutez-en depuis la{" "}
              <a href="/recruiter/candidates" className="underline">liste des candidats</a>.
            </p>
          ) : (
            <ul className="space-y-2">
              {opp.shortlist.map((c: ShortlistCandidateInfo) => (
                <li key={c.user_id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                  <span>
                    {c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : c.email}
                    {c.title && <span className="ml-2 text-muted-foreground">— {c.title}</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(c.user_id)}
                  >
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Bulk generate */}
      {opp.shortlist.length > 0 && templates.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Générer tous les dossiers</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleBulkGenerate} className="space-y-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={genTemplateId} onValueChange={setGenTemplateId} required>
                  <SelectTrigger><SelectValue placeholder="Choisir un template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={genFormat} onValueChange={setGenFormat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Word (.docx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={generating || !genTemplateId}>
                {generating ? "Génération en cours…" : `Générer pour ${opp.shortlist.length} candidat${opp.shortlist.length > 1 ? "s" : ""}`}
              </Button>
            </form>

            {genResults && (
              <div className="mt-4 space-y-1">
                <p className="text-sm font-medium">Résultats :</p>
                {genResults.map((r) => (
                  <p key={r.candidate_id} className="text-sm">
                    {r.candidate_id.slice(0, 8)}… —{" "}
                    <span className={r.status === "ok" ? "text-green-600" : "text-destructive"}>
                      {r.status === "ok" ? "✓ Généré" : `✗ ${r.error}`}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4 : Ajouter le bouton "Ajouter à une opportunité" dans la liste candidats**

Ouvrir `frontend/app/(recruiter)/recruiter/candidates/page.tsx`. Dans chaque carte candidat (dans la liste `candidates.map`), ajouter après le contenu existant :

```tsx
// Ajouter l'import en haut :
import Link from "next/link";

// Dans chaque card candidat, ajouter un bouton :
<Link href={`/recruiter/opportunities`}>
  <Button size="sm" variant="ghost">+ Opportunité</Button>
</Link>
```

- [ ] **Step 5 : Vérifier la compilation TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Résultat attendu : aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add frontend/types/api.ts \
        "frontend/app/(recruiter)/recruiter/opportunities/page.tsx" \
        "frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx" \
        "frontend/app/(recruiter)/recruiter/candidates/page.tsx"
git commit -m "feat(c4): add opportunity management pages in recruiter portal"
```
