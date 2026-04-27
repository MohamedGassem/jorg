# G1 + G2 — RGPD : export des données candidat + suppression de compte avec cascade & anonymisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un candidat (1) d'**exporter** l'intégralité de ses données personnelles au format JSON téléchargeable, et (2) de **supprimer** son compte avec cascade SQL sur les sous-entités du profil + anonymisation des `AccessGrant` et préservation des `GeneratedDocument` existants pour audit recruteur (spec §Sécurité RGPD).

**Architecture:**

- **Backend** : deux nouveaux endpoints sous le préfixe `/candidates/me` : `GET /candidates/me/export` (JSON complet) et `DELETE /candidates/me` (suppression). Un nouveau service `rgpd_service.py` orchestre l'export et la suppression-anonymisation dans une transaction. Une migration Alembic change `access_grants.candidate_id` de `NOT NULL + CASCADE` vers `NULL + SET NULL` pour permettre l'anonymisation (la colonne sera explicitement nullée côté service avant le `DELETE` du user, la contrainte `SET NULL` sert de filet de sécurité).
- **Frontend** : une nouvelle page `/candidate/settings` avec 2 actions — "Exporter mes données" (télécharge `jorg-export-{userId}-{date}.json`) et "Supprimer mon compte" (dialog de confirmation, puis logout + redirect `/`). Ajout dans la sidebar candidat.
- **Pas de tâche Jinja2/templating** ni de batch — tout est synchrone et transactionnel.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic + Pydantic (backend) ; Next.js 15 App Router + shadcn/ui Dialog (frontend) ; pytest + testcontainers.

**Prerequisite:**

- Plans 1-6 + P0/P1/P2 mergés sur `master` (état actuel au 2026-04-22).
- Les modèles actuels ont ces cascades pertinentes :
  - [users.id ← candidate_profiles.user_id](backend/models/candidate_profile.py#L43-L48) : `CASCADE` (OK, cascade chainée vers experiences/skills/etc).
  - [access_grants.candidate_id → users.id](backend/models/invitation.py#L51-L53) : `CASCADE` **NOT NULL** — **à modifier par ce plan** vers `SET NULL` + nullable.
  - [generated_documents.access_grant_id](backend/models/generated_document.py#L15-L19) : `CASCADE` **NOT NULL** — **inchangé** (on préserve les grants, donc les documents restent référençables).
  - [invitations.candidate_id → users.id](backend/models/invitation.py#L38-L40) : déjà `SET NULL` nullable (OK).

---

## File Structure

| File                                                            | Action                        | Purpose                                                                                         |
| --------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `backend/schemas/rgpd.py`                                       | Create                        | Schémas Pydantic `CandidateExport` + sous-schémas minimaux (réutilise les `*Read` existants)    |
| `backend/services/rgpd_service.py`                              | Create                        | Fonctions `export_candidate_data` + `delete_candidate_account` (orchestration transactionnelle) |
| `backend/api/routes/candidates.py`                              | Modify                        | Ajouter `GET /me/export` + `DELETE /me`                                                         |
| `backend/alembic/versions/<hash>_anonymizable_access_grants.py` | Create (generated puis édité) | Rendre `access_grants.candidate_id` nullable + changer FK vers `SET NULL`                       |
| `backend/models/invitation.py`                                  | Modify                        | Refléter `candidate_id` nullable + `ondelete="SET NULL"`                                        |
| `backend/tests/integration/test_rgpd_api.py`                    | Create                        | Tests d'intégration export + delete + anonymisation                                             |
| `frontend/types/api.ts`                                         | Modify                        | Ajouter `CandidateExport` (optionnel — utile pour le typage de la réponse)                      |
| `frontend/app/(candidate)/candidate/settings/page.tsx`          | Create                        | Page Settings avec boutons export + delete                                                      |
| `frontend/app/(candidate)/layout.tsx`                           | Modify                        | Ajouter l'entrée "Paramètres" dans la nav                                                       |
| `frontend/lib/api.ts`                                           | (Ne pas modifier)             | `api.download()` et `api.delete()` existent déjà                                                |

---

## Task 1 : Schéma Pydantic `CandidateExport`

**Files:**

- Create: `backend/schemas/rgpd.py`

- [ ] **Step 1 : Créer le fichier de schéma**

Créer [backend/schemas/rgpd.py](backend/schemas/rgpd.py) avec ce contenu exact :

```python
# backend/schemas/rgpd.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from schemas.candidate import (
    CandidateProfileRead,
    CertificationRead,
    EducationRead,
    ExperienceRead,
    LanguageRead,
    SkillRead,
)


class AccessGrantExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    status: str
    granted_at: datetime
    revoked_at: datetime | None


class GeneratedDocumentExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    access_grant_id: UUID | None
    template_id: UUID | None
    generated_by_user_id: UUID | None
    file_format: str
    generated_at: datetime


class CandidateExport(BaseModel):
    """Payload RGPD complet pour un candidat."""

    exported_at: datetime
    user_id: UUID
    email: str
    role: str
    created_at: datetime

    profile: CandidateProfileRead | None
    experiences: list[ExperienceRead]
    skills: list[SkillRead]
    education: list[EducationRead]
    certifications: list[CertificationRead]
    languages: list[LanguageRead]
    access_grants: list[AccessGrantExport]
    generated_documents: list[GeneratedDocumentExport]
```

**Pourquoi pas de test unitaire ici :** c'est un BaseModel sans logique. Les tests d'intégration (Task 6) couvrent la sérialisation via l'endpoint.

- [ ] **Step 2 : Lancer ruff et mypy**

Depuis `backend/` :

```bash
ruff check schemas/rgpd.py
mypy schemas/rgpd.py
```

Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add backend/schemas/rgpd.py
git commit -m "feat(rgpd): add CandidateExport pydantic schema"
```

---

## Task 2 : Service d'export — `rgpd_service.export_candidate_data`

**Files:**

- Create: `backend/services/rgpd_service.py`
- Test: (ajouté en Task 6 — test d'intégration, pas d'unit test dédié ici car la fonction ne fait que des requêtes DB et un assemblage trivial)

- [ ] **Step 1 : Créer le service avec `export_candidate_data`**

Créer [backend/services/rgpd_service.py](backend/services/rgpd_service.py) avec :

```python
# backend/services/rgpd_service.py
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
    Skill,
)
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant
from models.user import User
from schemas.rgpd import (
    AccessGrantExport,
    CandidateExport,
    GeneratedDocumentExport,
)
from schemas.candidate import (
    CandidateProfileRead,
    CertificationRead,
    EducationRead,
    ExperienceRead,
    LanguageRead,
    SkillRead,
)


async def export_candidate_data(db: AsyncSession, user: User) -> CandidateExport:
    """Assemble l'intégralité des données personnelles d'un candidat.

    N'écrit rien en DB. Lecture seule.
    """
    profile_q = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user.id)
    )
    profile = profile_q.scalar_one_or_none()

    if profile is not None:
        exp_q = await db.execute(
            select(Experience).where(Experience.profile_id == profile.id)
        )
        skill_q = await db.execute(select(Skill).where(Skill.profile_id == profile.id))
        edu_q = await db.execute(
            select(Education).where(Education.profile_id == profile.id)
        )
        cert_q = await db.execute(
            select(Certification).where(Certification.profile_id == profile.id)
        )
        lang_q = await db.execute(
            select(Language).where(Language.profile_id == profile.id)
        )
        experiences = list(exp_q.scalars().all())
        skills = list(skill_q.scalars().all())
        education = list(edu_q.scalars().all())
        certifications = list(cert_q.scalars().all())
        languages = list(lang_q.scalars().all())
    else:
        experiences = []
        skills = []
        education = []
        certifications = []
        languages = []

    grant_q = await db.execute(
        select(AccessGrant).where(AccessGrant.candidate_id == user.id)
    )
    grants = list(grant_q.scalars().all())

    doc_q = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.candidate_id == user.id)
    )
    documents = list(doc_q.scalars().all())

    return CandidateExport(
        exported_at=datetime.now(UTC),
        user_id=user.id,
        email=user.email,
        role=user.role.value,
        created_at=user.created_at,
        profile=CandidateProfileRead.model_validate(profile) if profile else None,
        experiences=[ExperienceRead.model_validate(e) for e in experiences],
        skills=[SkillRead.model_validate(s) for s in skills],
        education=[EducationRead.model_validate(e) for e in education],
        certifications=[CertificationRead.model_validate(c) for c in certifications],
        languages=[LanguageRead.model_validate(lang) for lang in languages],
        access_grants=[AccessGrantExport.model_validate(g) for g in grants],
        generated_documents=[GeneratedDocumentExport.model_validate(d) for d in documents],
    )
```

- [ ] **Step 2 : Vérifier les imports et le lint**

Depuis `backend/` :

```bash
ruff check services/rgpd_service.py
mypy services/rgpd_service.py
```

Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add backend/services/rgpd_service.py
git commit -m "feat(rgpd): add export_candidate_data service"
```

---

## Task 3 : Endpoint `GET /candidates/me/export`

**Files:**

- Modify: `backend/api/routes/candidates.py`
- Test : dans Task 6

- [ ] **Step 1 : Écrire d'abord le test qui doit échouer (TDD)**

Créer [backend/tests/integration/test_rgpd_api.py](backend/tests/integration/test_rgpd_api.py) (ou ajouter si déjà créé en Task 6) **uniquement ce premier test** :

```python
# backend/tests/integration/test_rgpd_api.py
from httpx import AsyncClient


async def test_export_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/candidates/me/export")
    assert r.status_code == 401


async def test_recruiter_cannot_export_candidate_data(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/export", headers=recruiter_headers)
    assert r.status_code == 403


async def test_export_empty_profile_returns_shell(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/export", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "candidate@test.com"
    assert data["role"] == "candidate"
    assert data["profile"] is None
    assert data["experiences"] == []
    assert data["skills"] == []
    assert data["education"] == []
    assert data["certifications"] == []
    assert data["languages"] == []
    assert data["access_grants"] == []
    assert data["generated_documents"] == []
    assert "exported_at" in data
```

- [ ] **Step 2 : Lancer le test — doit échouer avec 404**

Depuis `backend/` :

```bash
pytest tests/integration/test_rgpd_api.py -v
```

Expected: `test_export_requires_auth` PASS (auth middleware) **mais** `test_export_empty_profile_returns_shell` FAIL avec 404 (route n'existe pas encore).

- [ ] **Step 3 : Ajouter l'endpoint dans `candidates.py`**

Ouvrir [backend/api/routes/candidates.py](backend/api/routes/candidates.py) et ajouter ces imports en haut (fusionner avec l'import existant depuis `services`) :

```python
import services.rgpd_service as rgpd_service
from schemas.rgpd import CandidateExport
```

Puis ajouter cette section **après la section `# ---- Languages ----`** (en fin de fichier) :

```python


# ---- RGPD -------------------------------------------------------------------


@router.get("/me/export", response_model=CandidateExport)
async def export_my_data(current_user: CandidateUser, db: DB) -> CandidateExport:
    return await rgpd_service.export_candidate_data(db, current_user)
```

- [ ] **Step 4 : Lancer les 3 tests — doivent passer**

```bash
pytest tests/integration/test_rgpd_api.py -v
```

Expected: 3/3 PASS.

- [ ] **Step 5 : Commit**

```bash
git add backend/api/routes/candidates.py backend/tests/integration/test_rgpd_api.py
git commit -m "feat(rgpd): expose GET /candidates/me/export"
```

---

## Task 4 : Migration Alembic — `access_grants.candidate_id` nullable + `SET NULL`

**Files:**

- Create: `backend/alembic/versions/<hash>_anonymizable_access_grants.py`
- Modify: `backend/models/invitation.py`

- [ ] **Step 1 : Modifier le modèle avant de générer la migration**

Dans [backend/models/invitation.py](backend/models/invitation.py), modifier la déclaration de `AccessGrant.candidate_id` (lignes 51-53) :

**Avant :**

```python
    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
```

**Après :**

```python
    candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
```

- [ ] **Step 2 : Générer la migration via Alembic autogenerate**

Depuis `backend/` :

```bash
alembic revision --autogenerate -m "anonymizable access grants"
```

Expected: un nouveau fichier est créé dans `alembic/versions/` du type `<hash>_anonymizable_access_grants.py`. Lire le fichier — il doit contenir quelque chose comme `alter_column(..., nullable=True)` et `drop_constraint` + `create_foreign_key(..., ondelete="SET NULL")`.

- [ ] **Step 3 : Vérifier et nettoyer le fichier généré**

Ouvrir le nouveau fichier et **remplacer entièrement** les fonctions `upgrade()` et `downgrade()` par ce contenu (même si l'autogen a produit du code correct, on force un texte stable pour éviter les divergences Postgres/SQLite) :

```python
def upgrade() -> None:
    """Upgrade schema."""
    # Allow anonymization of access grants when a candidate user is deleted.
    op.alter_column(
        "access_grants",
        "candidate_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.drop_constraint(
        "access_grants_candidate_id_fkey", "access_grants", type_="foreignkey"
    )
    op.create_foreign_key(
        "access_grants_candidate_id_fkey",
        "access_grants",
        "users",
        ["candidate_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "access_grants_candidate_id_fkey", "access_grants", type_="foreignkey"
    )
    op.create_foreign_key(
        "access_grants_candidate_id_fkey",
        "access_grants",
        "users",
        ["candidate_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column(
        "access_grants",
        "candidate_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
```

**Note sur le nom de la contrainte** : Postgres crée la contrainte FK avec le nom `<table>_<column>_fkey` par défaut. Si le nom réel diffère, récupérer le vrai nom via :

```bash
psql -c "SELECT conname FROM pg_constraint WHERE conrelid = 'access_grants'::regclass AND contype = 'f';"
```

Sur l'instance de test (testcontainer), on peut aussi lire la convention via l'autogen — si Alembic a produit un nom différent, l'aligner.

- [ ] **Step 4 : Appliquer et vérifier la migration**

Depuis `backend/` (avec une DB de dev lancée, ex. via docker-compose si G9 existe, sinon depuis une DB locale) :

```bash
alembic upgrade head
```

Expected: pas d'erreur. Vérifier en base :

```bash
psql -c "\d access_grants"
```

Expected: `candidate_id` apparaît `uuid` (sans `NOT NULL`), et la contrainte FK mentionne `ON DELETE SET NULL`.

- [ ] **Step 5 : Vérifier que les tests existants passent toujours**

```bash
pytest tests/integration/test_access_flow.py tests/integration/test_generation_api.py -v
```

Expected: tous PASS.

- [ ] **Step 6 : Commit**

```bash
git add backend/models/invitation.py backend/alembic/versions/
git commit -m "feat(rgpd): make access_grants.candidate_id nullable with SET NULL cascade"
```

---

## Task 5 : Service de suppression — `rgpd_service.delete_candidate_account`

**Files:**

- Modify: `backend/services/rgpd_service.py`

- [ ] **Step 1 : Ajouter la fonction `delete_candidate_account`**

Dans [backend/services/rgpd_service.py](backend/services/rgpd_service.py), ajouter ces imports en haut (après les imports existants) :

```python
from sqlalchemy import update

from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
```

**Note** : `AccessGrant` est peut-être déjà importé par la Task 2. Vérifier avant d'ajouter pour éviter un doublon. Ajouter seulement `update`, `AccessGrantStatus`, `Invitation`, `InvitationStatus`.

Puis ajouter cette fonction au bas du fichier :

```python
async def delete_candidate_account(db: AsyncSession, user: User) -> None:
    """Supprime un candidat en respectant les règles RGPD :

    1. Révoque toutes les `AccessGrant` actives et les anonymise
       (`candidate_id = NULL`) pour préserver l'historique recruteur.
    2. Marque les `Invitation` pending le ciblant (par email ou par id)
       comme `expired`.
    3. Supprime l'utilisateur — la cascade SQL s'occupe du profil,
       experiences, skills, education, certifications, languages.
    4. Les `GeneratedDocument` restent rattachés aux grants (désormais
       anonymisés) : le recruteur conserve son audit sans pouvoir relier
       le document à une identité candidat.

    Tout se passe dans la transaction courante — le caller est
    responsable du commit final.
    """
    now = datetime.now(UTC)

    # 1. Anonymiser + révoquer les grants.
    await db.execute(
        update(AccessGrant)
        .where(AccessGrant.candidate_id == user.id)
        .values(
            status=AccessGrantStatus.REVOKED,
            revoked_at=now,
            candidate_id=None,
        )
    )

    # 2. Invitations pending → expired (par candidate_id ET par email,
    #    car certaines invitations peuvent ne pas avoir été liées au user).
    await db.execute(
        update(Invitation)
        .where(
            Invitation.status == InvitationStatus.PENDING,
            (Invitation.candidate_id == user.id) | (Invitation.candidate_email == user.email),
        )
        .values(status=InvitationStatus.EXPIRED)
    )

    # 3. Supprimer l'utilisateur — CASCADE SQL s'occupe du reste.
    await db.delete(user)
    await db.commit()
```

- [ ] **Step 2 : Ruff + mypy**

```bash
ruff check services/rgpd_service.py
mypy services/rgpd_service.py
```

Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add backend/services/rgpd_service.py
git commit -m "feat(rgpd): add delete_candidate_account with anonymization"
```

---

## Task 6 : Endpoint `DELETE /candidates/me` + tests d'intégration complets

**Files:**

- Modify: `backend/api/routes/candidates.py`
- Modify: `backend/tests/integration/test_rgpd_api.py`

- [ ] **Step 1 : Ajouter les tests manquants (TDD) — les écrire _avant_ l'endpoint**

Ajouter ces tests à la fin de [backend/tests/integration/test_rgpd_api.py](backend/tests/integration/test_rgpd_api.py). Certaines fixtures (`recruiter_with_org`, `access_grant_active`) n'existent peut-être pas — si c'est le cas, les créer inline pour chaque test (pas de DRY prématuré ici, les tests doivent rester lisibles).

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CandidateProfile, Experience
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization
from models.user import User


async def test_delete_requires_auth(client: AsyncClient) -> None:
    r = await client.delete("/candidates/me")
    assert r.status_code == 401


async def test_recruiter_cannot_delete_candidate_account(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.delete("/candidates/me", headers=recruiter_headers)
    assert r.status_code == 403


async def test_delete_removes_user_and_profile_cascade(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    # Donne du contenu à supprimer
    await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"first_name": "Alice", "last_name": "Dupont"},
    )
    await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={
            "client_name": "Acme",
            "role": "Dev",
            "start_date": "2024-01-01",
            "is_current": True,
        },
    )

    r = await client.delete("/candidates/me", headers=candidate_headers)
    assert r.status_code == 204

    user_q = await db_session.execute(
        select(User).where(User.email == "candidate@test.com")
    )
    assert user_q.scalar_one_or_none() is None

    profile_q = await db_session.execute(select(CandidateProfile))
    assert profile_q.scalar_one_or_none() is None

    exp_q = await db_session.execute(select(Experience))
    assert exp_q.scalar_one_or_none() is None


async def test_delete_anonymizes_access_grants_and_preserves_documents(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    # Construit manuellement un grant + document "existant"
    org = Organization(name="Conseil Co", slug="conseil-co")
    db_session.add(org)
    await db_session.flush()

    user_q = await db_session.execute(
        select(User).where(User.email == "candidate@test.com")
    )
    candidate_user = user_q.scalar_one()

    from datetime import UTC, datetime as _dt

    grant = AccessGrant(
        candidate_id=candidate_user.id,
        organization_id=org.id,
        status=AccessGrantStatus.ACTIVE,
        granted_at=_dt.now(UTC),
    )
    db_session.add(grant)
    await db_session.flush()

    doc = GeneratedDocument(
        access_grant_id=grant.id,
        template_id=None,
        generated_by_user_id=None,
        file_path="generated/old-doc.docx",
        file_format="docx",
    )
    db_session.add(doc)
    await db_session.commit()

    r = await client.delete("/candidates/me", headers=candidate_headers)
    assert r.status_code == 204

    await db_session.expire_all()
    grant_q = await db_session.execute(select(AccessGrant).where(AccessGrant.id == grant.id))
    refreshed = grant_q.scalar_one()
    assert refreshed.candidate_id is None
    assert refreshed.status == AccessGrantStatus.REVOKED
    assert refreshed.revoked_at is not None

    doc_q = await db_session.execute(select(GeneratedDocument).where(GeneratedDocument.id == doc.id))
    refreshed_doc = doc_q.scalar_one()
    assert refreshed_doc.access_grant_id == grant.id
    assert refreshed_doc.file_path == "generated/old-doc.docx"


async def test_delete_expires_pending_invitations(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    # Une orga + un recruteur + une invitation pending par email
    org = Organization(name="Other Co", slug="other-co")
    db_session.add(org)
    await db_session.flush()

    from datetime import UTC, datetime as _dt, timedelta

    recruiter = User(email="rec@test.com", role="recruiter", hashed_password="x")
    db_session.add(recruiter)
    await db_session.flush()

    inv = Invitation(
        recruiter_id=recruiter.id,
        organization_id=org.id,
        candidate_email="candidate@test.com",
        candidate_id=None,
        token="tok-pending",
        status=InvitationStatus.PENDING,
        expires_at=_dt.now(UTC) + timedelta(days=30),
    )
    db_session.add(inv)
    await db_session.commit()

    r = await client.delete("/candidates/me", headers=candidate_headers)
    assert r.status_code == 204

    await db_session.expire_all()
    inv_q = await db_session.execute(select(Invitation).where(Invitation.id == inv.id))
    refreshed_inv = inv_q.scalar_one()
    assert refreshed_inv.status == InvitationStatus.EXPIRED
```

- [ ] **Step 2 : Lancer les tests — les 4 nouveaux doivent FAIL avec 405 ou 404**

```bash
pytest tests/integration/test_rgpd_api.py -v
```

Expected: les 3 premiers tests PASS (Task 3), les 4 nouveaux FAIL avec 405 Method Not Allowed ou 404.

- [ ] **Step 3 : Ajouter l'endpoint `DELETE /me`**

Dans [backend/api/routes/candidates.py](backend/api/routes/candidates.py), sous l'endpoint `export_my_data` (fin de la section RGPD), ajouter :

```python
@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(current_user: CandidateUser, db: DB) -> None:
    await rgpd_service.delete_candidate_account(db, current_user)
```

- [ ] **Step 4 : Re-lancer les tests — tout doit PASS**

```bash
pytest tests/integration/test_rgpd_api.py -v
```

Expected: 7/7 PASS.

- [ ] **Step 5 : Lancer toute la suite backend pour s'assurer qu'aucune régression**

```bash
pytest -q
```

Expected: tous les tests passent (y compris `test_access_flow.py` qui touche aux `AccessGrant`).

- [ ] **Step 6 : Commit**

```bash
git add backend/api/routes/candidates.py backend/tests/integration/test_rgpd_api.py
git commit -m "feat(rgpd): expose DELETE /candidates/me with full cascade and anonymization"
```

---

## Task 7 : Typage frontend + page `/candidate/settings`

**Files:**

- Modify: `frontend/types/api.ts`
- Create: `frontend/app/(candidate)/candidate/settings/page.tsx`
- Modify: `frontend/app/(candidate)/layout.tsx`

> ⚠️ **Attention Next.js** : le README frontend indique que la version de Next.js utilisée ici a des API potentiellement divergentes du Next.js standard. Avant d'écrire, lire [frontend/AGENTS.md](frontend/AGENTS.md) et consulter `node_modules/next/dist/docs/` si un doute émerge sur un hook ou une API (`useRouter`, `next/navigation`, etc.).

- [ ] **Step 1 : Ajouter le type `CandidateExport` (optionnel — pour typer la réponse)**

Dans [frontend/types/api.ts](frontend/types/api.ts), à la fin du fichier ajouter :

```typescript
export interface CandidateExport {
  exported_at: string;
  user_id: string;
  email: string;
  role: UserRole;
  created_at: string;
  profile: CandidateProfile | null;
  experiences: Experience[];
  skills: Skill[];
  education: Education[];
  certifications: Certification[];
  languages: Language[];
  access_grants: Array<{
    id: string;
    organization_id: string;
    status: AccessGrantStatus;
    granted_at: string;
    revoked_at: string | null;
  }>;
  generated_documents: Array<{
    id: string;
    access_grant_id: string | null;
    template_id: string | null;
    generated_by_user_id: string | null;
    file_format: FileFormat;
    generated_at: string;
  }>;
}
```

- [ ] **Step 2 : Créer la page Settings**

Créer [frontend/app/(candidate)/candidate/settings/page.tsx](<frontend/app/(candidate)/candidate/settings/page.tsx>) avec ce contenu complet :

```tsx
// frontend/app/(candidate)/candidate/settings/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { clearTokens } from "@/lib/auth";

export default function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.download("/candidates/me/export", `jorg-export-${today}.json`);
    } catch (err) {
      setExportError(
        err instanceof ApiError ? err.detail : "Échec de l'export",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== "SUPPRIMER") {
      setDeleteError('Saisir "SUPPRIMER" pour confirmer');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete<void>("/candidates/me");
      clearTokens();
      window.location.href = "/";
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.detail : "Échec de la suppression",
      );
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Paramètres</h1>

      <Card>
        <CardHeader>
          <CardTitle>Exporter mes données</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Télécharger un fichier JSON contenant l&apos;intégralité de vos
            données personnelles (profil, expériences, compétences, accès
            accordés, documents générés).
          </p>
          {exportError && (
            <p role="alert" className="text-sm text-destructive">
              {exportError}
            </p>
          )}
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Export en cours…" : "Exporter au format JSON"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">
            Supprimer mon compte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Action irréversible. Votre profil et toutes ses données seront
            supprimés définitivement. Les documents déjà générés par les
            recruteurs sont conservés pour audit mais anonymisés.
          </p>
          <Button variant="destructive" onClick={() => setDialogOpen(true)}>
            Supprimer définitivement mon compte
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmation requise</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Saisir <strong>SUPPRIMER</strong>{" "}
              ci-dessous pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-text">Confirmation</Label>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
            />
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Vérifier que `clearTokens` existe** : ouvrir [frontend/lib/auth.ts](frontend/lib/auth.ts) et chercher un export `clearTokens`. S'il s'appelle différemment (par ex. `logout`, `clearAuth`), l'adapter dans l'import et l'appel ci-dessus. Si aucune fonction équivalente n'existe, utiliser ce fallback inline (remplacer l'import et l'appel) :

```tsx
// Au lieu de: import { clearTokens } from "@/lib/auth";
// Utiliser :
function clearTokens() {
  if (typeof document !== "undefined") {
    document.cookie = "access_token=; Max-Age=0; path=/";
    document.cookie = "refresh_token=; Max-Age=0; path=/";
  }
}
```

- [ ] **Step 3 : Ajouter l'entrée nav "Paramètres"**

Dans [frontend/app/(candidate)/layout.tsx](<frontend/app/(candidate)/layout.tsx>), ajouter une entrée après "Historique" :

```tsx
const candidateNav = [
  { href: "/candidate/profile", label: "Mon profil" },
  { href: "/candidate/skills", label: "Compétences" },
  { href: "/candidate/requests", label: "Invitations" },
  { href: "/candidate/access", label: "Accès accordés" },
  { href: "/candidate/history", label: "Historique" },
  { href: "/candidate/settings", label: "Paramètres" },
];
```

- [ ] **Step 4 : Type-check frontend**

Depuis `frontend/` :

```bash
npx tsc --noEmit
```

Expected: pas d'erreur.

- [ ] **Step 5 : Vérification manuelle en navigateur**

Lancer backend + frontend en dev (dans deux shells). Depuis `frontend/` :

```bash
npm run dev
```

1. Se connecter comme candidat, aller sur `/candidate/settings`.
2. Cliquer **Exporter au format JSON** → un fichier `jorg-export-YYYY-MM-DD.json` se télécharge. Ouvrir le fichier : il contient `email`, `profile`, `experiences`, etc.
3. Cliquer **Supprimer définitivement mon compte** → le dialog s'ouvre.
4. Saisir `SUPPRIMER` exactement → cliquer Supprimer → on est redirigé vers `/` et la session est fermée.
5. Retenter de se connecter avec le même email/password → 401 (le user n'existe plus).
6. Cas d'erreur : saisir autre chose que "SUPPRIMER" → le bouton affiche l'erreur et ne supprime pas.

- [ ] **Step 6 : Commit**

```bash
git add frontend/types/api.ts \
        "frontend/app/(candidate)/candidate/settings/page.tsx" \
        "frontend/app/(candidate)/layout.tsx"
git commit -m "feat(rgpd): add candidate settings page with export and delete"
```

---

## Task 8 : Test e2e Playwright (optionnel mais recommandé)

**Files:**

- Create: `frontend/tests/e2e/rgpd-export-and-delete.spec.ts`

> À exécuter si la suite Playwright a déjà été configurée (cf. Plan 6). Sinon, sauter cette tâche et ouvrir un ticket de suivi.

- [ ] **Step 1 : Écrire le scénario e2e**

Créer [frontend/tests/e2e/rgpd-export-and-delete.spec.ts](frontend/tests/e2e/rgpd-export-and-delete.spec.ts) :

```typescript
// frontend/tests/e2e/rgpd-export-and-delete.spec.ts
import { test, expect } from "@playwright/test";

test.describe("RGPD — export + delete account", () => {
  test("candidate can export data and delete account", async ({ page }) => {
    // Préalable : un compte candidat `rgpd@test.com` / `testpass123` doit être créé
    //   soit par une fixture `beforeEach`, soit via l'API dans ce test.
    await page.goto("/login");
    await page.fill('input[name="email"]', "rgpd@test.com");
    await page.fill('input[name="password"]', "testpass123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/candidate/**");

    await page.goto("/candidate/settings");
    await expect(
      page.getByRole("heading", { name: "Paramètres" }),
    ).toBeVisible();

    // Export
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Exporter/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^jorg-export-\d{4}-\d{2}-\d{2}\.json$/,
    );

    // Delete
    await page
      .getByRole("button", { name: /Supprimer définitivement/ })
      .click();
    await page.getByLabel("Confirmation").fill("SUPPRIMER");
    await page.getByRole("button", { name: /^Supprimer$/ }).click();
    await page.waitForURL("**/");

    // Vérifier qu'on ne peut plus se connecter
    await page.goto("/login");
    await page.fill('input[name="email"]', "rgpd@test.com");
    await page.fill('input[name="password"]', "testpass123");
    await page.click('button[type="submit"]');
    await expect(
      page.getByText(/identifiants invalides|unauthorized/i),
    ).toBeVisible();
  });
});
```

- [ ] **Step 2 : Lancer le test**

Depuis `frontend/` (backend + frontend doivent tourner) :

```bash
npx playwright test rgpd-export-and-delete.spec.ts
```

Expected: PASS. En cas d'échec, ajuster les sélecteurs aux composants shadcn réels.

- [ ] **Step 3 : Commit**

```bash
git add frontend/tests/e2e/rgpd-export-and-delete.spec.ts
git commit -m "test(rgpd): add e2e playwright scenario for export + delete"
```

---

## Task 9 : Revue globale + update du MEMORY index roadmap

**Files:**

- Modify: `docs/superpowers/plans/2026-04-22-plan-mvp-analysis-roadmap.md`

- [ ] **Step 1 : Marquer G1+G2 comme couverts dans la roadmap**

Ouvrir [docs/superpowers/plans/2026-04-22-plan-mvp-analysis-roadmap.md](docs/superpowers/plans/2026-04-22-plan-mvp-analysis-roadmap.md), section 8.2, et modifier la ligne :

**Avant :**

```markdown
| `plan-g1-g2-rgpd-export-delete.md` | G1 (export) + G2 (delete cascade + anonymisation) | P1 | Moyen — 8-10 tasks |
```

**Après :**

```markdown
| [`plan-g1-g2-rgpd-export-delete.md`](2026-04-22-plan-g1-g2-rgpd-export-delete.md) ✅ rédigé | G1 (export) + G2 (delete cascade + anonymisation) | P1 | Moyen — 9 tasks |
```

- [ ] **Step 2 : Commit final**

```bash
git add docs/superpowers/plans/2026-04-22-plan-mvp-analysis-roadmap.md
git commit -m "docs: mark RGPD plan G1+G2 as written in roadmap"
```

---

## Cas limites & pièges à vérifier pendant l'exécution

| #   | Cas                                                      | Ce qu'il faut vérifier                                                                                                                                   |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Candidat sans profil (n'a jamais ouvert `/profile`)      | L'export retourne `profile: null` et listes vides — couvert par `test_export_empty_profile_returns_shell`.                                               |
| C2  | Candidat avec profil mais sans expériences               | Les listes peuvent être vides individuellement — non testé explicitement mais suit trivialement du code.                                                 |
| C3  | `DELETE` alors qu'un recruteur vient de révoquer l'accès | Pas de conflit : le grant passe à `REVOKED` deux fois (idempotent) et `candidate_id` devient NULL.                                                       |
| C4  | Invitation rejected/accepted non modifiée par le delete  | Le filtre `status == PENDING` est strict — vérifier que les acceptées/rejetées restent intactes (à ajouter en test si temps).                            |
| C5  | Re-inscription après suppression avec le même email      | Doit fonctionner : `users.email` est unique mais l'utilisateur a été supprimé. Test manuel recommandé en Step 5 de Task 7.                               |
| C6  | Appel `DELETE` deux fois (rejeu)                         | Le deuxième appel renvoie 401 car le JWT pointe sur un user inexistant (voir [api/deps.py:41-45](backend/api/deps.py#L41-L45)).                          |
| C7  | Fichiers `.docx` sur disque après suppression            | Hors scope — le spec dit "anonymisés mais conservés pour audit". Les fichiers restent sur le storage. Un job de purge est à faire plus tard si souhaité. |
| C8  | Export contient `hashed_password` ?                      | **Non** — le schéma `CandidateExport` n'expose pas `hashed_password` ni `oauth_subject`. À vérifier en lisant le JSON exporté.                           |

---

## Self-review

**Spec coverage :**

- ✅ "un candidat peut exporter toutes ses données" → Task 3.
- ✅ "supprimer son compte (cascade sur Experiences, Skills, etc.)" → Tasks 4-6, cascade SQL chainée via `candidate_profiles.user_id` ondelete CASCADE.
- ✅ "GeneratedDocument passés anonymisés mais conservés pour audit recruteur" → Task 5 (set `AccessGrant.candidate_id = NULL` sans supprimer le grant, donc les `GeneratedDocument.access_grant_id` restent valides).
- ✅ Invitations pending expirées → Task 5.

**Placeholder scan :** aucun TBD / TODO / « handle edge cases » dans ce plan. Tous les blocs de code sont complets.

**Type consistency :** `delete_candidate_account(db, user)` signature identique partout. `export_candidate_data(db, user) -> CandidateExport` idem. `CandidateExport` mentionné dans le schéma (Task 1), le service (Task 2), la route (Task 3), et le type TS (Task 7) — cohérent.

**Prévoir après ce plan :** G3 (email service) peut logger un événement "candidate_account_deleted" plus tard ; G4 (observabilité) ajoutera un `structlog.info("rgpd.account_deleted", user_id=...)` dans `delete_candidate_account`.

---

## Exécution

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-plan-g1-g2-rgpd-export-delete.md`. Two execution options :**

1. **Subagent-Driven (recommandé)** — je dispatche un subagent frais par Task, review entre chaque. Utilise `superpowers:subagent-driven-development`.
2. **Inline Execution** — exécuter les 9 Tasks dans cette session avec checkpoints. Utilise `superpowers:executing-plans`.

**Quelle approche ?**
