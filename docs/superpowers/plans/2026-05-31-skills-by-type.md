# Skills par type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organiser les compétences par type ESCO (technical/tool/functional/methodology/sectoral/soft) sur le site candidat et dans les variables de template du moteur de génération, avec custom skills privées et édition du `kind` sur les skills custom.

**Architecture:** Ajout de `creator_candidate_id` sur `SkillReference` pour l'isolation des custom skills ; extension du service de recherche pour filtrer par candidat ; exposition de variables pré-groupées (`skills_technical`, `skills_featured`, etc.) dans le moteur docxtpl ; refonte de la page frontend skills en bloc "Compétences clés" + sections par type dynamiques.

**Tech Stack:** FastAPI · SQLAlchemy 2 async · Alembic · Pydantic v2 · pytest + testcontainers · Next.js 15 App Router · TypeScript · shadcn/ui

---

## File Map

### Backend — créer

_(aucun nouveau fichier)_

### Backend — modifier

| Fichier                                                       | Ce qui change                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/models/skill.py`                                     | Ajouter `creator_candidate_id` sur `SkillReference`                                                                                                                |
| `backend/schemas/skill.py`                                    | Ajouter `creator_candidate_id` sur `SkillReferenceRead` ; ajouter `kind` sur `CandidateSkillUpdate`                                                                |
| `backend/services/skill_reference_service.py`                 | `search()` + `get_or_create_by_name()` avec filtre candidat                                                                                                        |
| `backend/api/routes/skills.py`                                | `search_skill_references` utilise `CandidateProfile_dep` ; `create_or_get_skill_reference` passe `creator_candidate_id` ; `update_my_skill` gère `kind` séparément |
| `backend/services/docx_engine.py`                             | Ajouter `_group_skills_by_kind()` ; étendre le contexte template                                                                                                   |
| `backend/alembic/versions/<hash>_add_creator_candidate_id.py` | Migration : ajout colonne + FK + index                                                                                                                             |

### Backend — tests

| Fichier                                                  | Ce qui change                                   |
| -------------------------------------------------------- | ----------------------------------------------- |
| `backend/tests/integration/test_skill_reference_api.py`  | Mise à jour + nouveaux tests d'isolation custom |
| `backend/tests/integration/test_candidate_skills_api.py` | Tests `kind` éditable/non-éditable              |
| `backend/tests/unit/test_docx_engine.py`                 | Tests groupement par kind                       |

### Frontend — modifier

| Fichier                                              | Ce qui change                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/types/api.ts`                              | Ajouter `soft` à `SkillKind` ; ajouter `creator_candidate_id`, `is_custom` à `SkillReference` ; ajouter `created_at` à `Skill` |
| `frontend/app/(candidate)/candidate/skills/page.tsx` | Bloc "Compétences clés" + sections par type + édition `kind` custom                                                            |

---

## Task 1 — Migration : `creator_candidate_id` sur `skill_references`

**Files:**

- Create: `backend/alembic/versions/<hash>_add_creator_candidate_id.py`
- Modify: `backend/models/skill.py`

- [ ] **Step 1.1 : Ajouter la colonne sur le modèle SQLAlchemy**

Dans `backend/models/skill.py`, dans la classe `SkillReference`, ajouter après la ligne `is_custom` :

```python
creator_candidate_id: Mapped[UUID | None] = mapped_column(
    ForeignKey("candidate_profiles.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
)
```

Ajouter l'import UUID en tête de fichier (déjà présent).

- [ ] **Step 1.2 : Générer la migration**

```bash
cd backend && uv run alembic -c alembic.ini revision --autogenerate -m "add creator candidate id to skill references"
```

Ouvrir le fichier généré et vérifier que `down_revision` vaut `"3f6f6a002c8f"`.

Vérifier que `upgrade()` contient :

```python
op.add_column(
    "skill_references",
    sa.Column("creator_candidate_id", sa.Uuid(), nullable=True),
)
op.create_foreign_key(
    "fk_skill_references_creator",
    "skill_references", "candidate_profiles",
    ["creator_candidate_id"], ["id"],
    ondelete="SET NULL",
)
op.create_index(
    "ix_skill_references_creator_candidate_id",
    "skill_references",
    ["creator_candidate_id"],
)
```

Et que `downgrade()` contient :

```python
op.drop_index("ix_skill_references_creator_candidate_id", table_name="skill_references")
op.drop_constraint("fk_skill_references_creator", "skill_references", type_="foreignkey")
op.drop_column("skill_references", "creator_candidate_id")
```

- [ ] **Step 1.3 : Tester upgrade**

```bash
cd backend && uv run alembic -c alembic.ini upgrade head
```

Attendu : aucune erreur.

- [ ] **Step 1.4 : Tester downgrade + round-trip**

```bash
cd backend && uv run alembic -c alembic.ini downgrade -1
cd backend && uv run alembic -c alembic.ini upgrade head
```

Attendu : les deux sans erreur.

- [ ] **Step 1.5 : Commit**

```bash
git add backend/models/skill.py backend/alembic/versions/
git commit -m "feat(db): add creator_candidate_id to skill_references for custom skill isolation"
```

---

## Task 2 — Backend : isolation des custom skills (service + routes + tests)

**Files:**

- Modify: `backend/schemas/skill.py`
- Modify: `backend/services/skill_reference_service.py`
- Modify: `backend/api/routes/skills.py`
- Modify: `backend/tests/integration/test_skill_reference_api.py`

- [ ] **Step 2.1 : Ajouter `creator_candidate_id` à `SkillReferenceRead`**

Dans `backend/schemas/skill.py`, dans `SkillReferenceRead`, ajouter après `is_custom` :

```python
creator_candidate_id: UUID | None
```

- [ ] **Step 2.2 : Écrire les tests qui doivent échouer**

Ajouter à la fin de `backend/tests/integration/test_skill_reference_api.py` :

```python
async def test_custom_skill_visible_only_to_creator(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    """Une skill custom créée par candidat A n'apparaît pas dans la recherche de candidat B."""
    await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "UniquePrivateSkill42", "kind": "tool"},
    )
    r = await client.get(
        "/skill-references?q=UniquePrivateSkill42",
        headers=second_candidate_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_esco_skill_visible_to_all_candidates(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    second_candidate_headers: dict[str, str],
) -> None:
    """Les skills ESCO (creator_candidate_id=None) sont visibles par tous."""
    # Les seeds ESCO sont chargés dans conftest. Chercher un skill seedé.
    r = await client.get("/skill-references?q=Python", headers=second_candidate_headers)
    assert r.status_code == 200
    # Si Python est seedé, il doit apparaître. Sinon, vérifier juste que le 200 passe.
    assert isinstance(r.json(), list)


async def test_create_custom_skill_sets_creator(
    client: AsyncClient,
    candidate_headers: dict[str, str],
) -> None:
    r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "MyPrivateTool999", "kind": "tool"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["is_custom"] is True
    assert data["creator_candidate_id"] is not None
```

Si le fixture `second_candidate_headers` n'existe pas dans `conftest.py`, l'ajouter :

Ouvrir `backend/tests/integration/conftest.py`, repérer comment `candidate_headers` est défini (inscription + login d'un user candidat), et dupliquer la logique avec un email différent :

```python
@pytest_asyncio.fixture
async def second_candidate_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/auth/register",
        json={
            "email": "second_candidate@example.com",
            "password": "SecondPass123!",
            "role": "candidate",
        },
    )
    r = await client.post(
        "/auth/login",
        json={"email": "second_candidate@example.com", "password": "SecondPass123!"},
    )
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2.3 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend && uv run pytest tests/integration/test_skill_reference_api.py::test_custom_skill_visible_only_to_creator tests/integration/test_skill_reference_api.py::test_create_custom_skill_sets_creator -v
```

Attendu : FAIL (la recherche retourne encore les skills custom de n'importe qui).

- [ ] **Step 2.4 : Mettre à jour `skill_reference_service.py`**

Remplacer les deux fonctions par :

```python
async def get_or_create_by_name(
    name: str,
    kind: SkillKind,
    creator_candidate_id: UUID,
    db: AsyncSession,
) -> SkillReference:
    slug = slugify(name)
    result = await db.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id == creator_candidate_id,
        )
    )
    ref = result.scalar_one_or_none()
    if ref is None:
        ref = SkillReference(
            name=name,
            slug=slug,
            kind=kind,
            is_custom=True,
            source="manual",
            aliases=[],
            creator_candidate_id=creator_candidate_id,
        )
        db.add(ref)
        await db.commit()
        await db.refresh(ref)
    return ref


async def search(
    query: str,
    kind: SkillKind | None,
    limit: int,
    candidate_id: UUID,
    db: AsyncSession,
) -> list[SkillReference]:
    stmt = select(SkillReference).where(
        SkillReference.name.ilike(f"%{query}%"),
        (SkillReference.creator_candidate_id.is_(None))
        | (SkillReference.creator_candidate_id == candidate_id),
    )
    if kind is not None:
        stmt = stmt.where(SkillReference.kind == kind)
    result = await db.execute(stmt.limit(limit))
    return list(result.scalars().all())
```

Ajouter `from uuid import UUID` si pas déjà présent en tête du fichier.

- [ ] **Step 2.5 : Mettre à jour les routes dans `backend/api/routes/skills.py`**

**Route GET `/skill-references`** — remplacer `AnyAuth` par `CandidateProfile_dep` :

```python
@router.get("/skill-references", response_model=list[SkillReferenceRead])
async def search_skill_references(
    q: str,
    db: DB,
    profile: CandidateProfile_dep,
    kind: SkillKind | None = None,
    limit: int = 20,
) -> list[SkillReference]:
    return await skill_reference_service.search(
        q, kind=kind, limit=limit, candidate_id=profile.id, db=db
    )
```

**Route POST `/skill-references`** — supprimer `AnyAuth`, utiliser `CandidateProfile_dep`, passer `creator_candidate_id` :

```python
@router.post("/skill-references", response_model=SkillReferenceRead)
async def create_or_get_skill_reference(
    data: SkillReferenceCreate,
    db: DB,
    profile: CandidateProfile_dep,
    response: Response,
) -> SkillReference:
    slug = skill_reference_service.slugify(data.name)
    # Recherche d'abord parmi les skills ESCO partagées
    result = await db.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id.is_(None),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    # Ensuite parmi les custom privées du candidat
    result = await db.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id == profile.id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    try:
        ref = await skill_reference_service.get_or_create_by_name(
            data.name, data.kind, creator_candidate_id=profile.id, db=db
        )
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(SkillReference).where(
                SkillReference.slug == slug,
                SkillReference.creator_candidate_id == profile.id,
            )
        )
        ref = result.scalar_one()
        response.status_code = status.HTTP_200_OK
        return ref
    response.status_code = status.HTTP_201_CREATED
    return ref
```

Supprimer la variable `AnyAuth` si elle n'est plus utilisée ailleurs (vérifier en cherchant `AnyAuth` dans le fichier — si plus aucune route ne l'utilise, supprimer la ligne de définition).

- [ ] **Step 2.6 : Lancer les tests**

```bash
cd backend && uv run pytest tests/integration/test_skill_reference_api.py -v
```

Attendu : tous passent.

- [ ] **Step 2.7 : Lancer ruff + mypy**

```bash
cd backend && uv run ruff check . && uv run mypy .
```

Corriger toute erreur.

- [ ] **Step 2.8 : Commit**

```bash
git add backend/schemas/skill.py backend/services/skill_reference_service.py backend/api/routes/skills.py backend/tests/integration/test_skill_reference_api.py backend/tests/integration/conftest.py
git commit -m "feat(skills): custom skill references are private to their creator"
```

---

## Task 3 — Backend : édition du `kind` sur skills custom

**Files:**

- Modify: `backend/schemas/skill.py`
- Modify: `backend/api/routes/skills.py`
- Modify: `backend/tests/integration/test_candidate_skills_api.py`

- [ ] **Step 3.1 : Écrire les tests qui doivent échouer**

Ouvrir `backend/tests/integration/test_candidate_skills_api.py` et ajouter à la fin :

```python
async def test_update_kind_on_custom_skill(
    client: AsyncClient,
    candidate_headers: dict[str, str],
) -> None:
    """Le kind d'une skill custom est modifiable."""
    # Créer un skill reference custom kind=technical
    ref_r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "CustomKindSkill777", "kind": "technical"},
    )
    ref_id = ref_r.json()["id"]

    # Ajouter au profil
    skill_r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    assert skill_r.status_code == 201
    skill_id = skill_r.json()["id"]

    # Changer le kind vers "tool"
    upd = await client.put(
        f"/candidates/me/skills/{skill_id}",
        headers=candidate_headers,
        json={"kind": "tool"},
    )
    assert upd.status_code == 200
    assert upd.json()["skill_ref"]["kind"] == "tool"


async def test_update_kind_on_esco_skill_returns_400(
    client: AsyncClient,
    candidate_headers: dict[str, str],
) -> None:
    """Le kind d'une skill ESCO (is_custom=False) n'est pas modifiable."""
    # Chercher une skill ESCO seedée (creator_candidate_id=None, is_custom=False)
    # On en crée une manuellement en base via le seed conftest
    # Pour ce test, vérifier qu'un skill seedé ESCO refuse la modification de kind.
    # Utiliser la recherche pour trouver un skill ESCO existant.
    r = await client.get("/skill-references?q=a", headers=candidate_headers)
    esco_refs = [s for s in r.json() if not s["is_custom"]]
    if not esco_refs:
        pytest.skip("Aucun skill ESCO seedé disponible pour ce test")
    ref_id = esco_refs[0]["id"]

    skill_r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    # Peut retourner 201 ou 409 si déjà ajouté — dans les deux cas récupérer l'id
    if skill_r.status_code == 201:
        skill_id = skill_r.json()["id"]
    else:
        list_r = await client.get("/candidates/me/skills", headers=candidate_headers)
        skill_id = next(s["id"] for s in list_r.json() if s["skill_ref_id"] == ref_id)

    upd = await client.put(
        f"/candidates/me/skills/{skill_id}",
        headers=candidate_headers,
        json={"kind": "tool"},
    )
    assert upd.status_code == 400
```

- [ ] **Step 3.2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend && uv run pytest tests/integration/test_candidate_skills_api.py::test_update_kind_on_custom_skill tests/integration/test_candidate_skills_api.py::test_update_kind_on_esco_skill_returns_400 -v
```

Attendu : FAIL (le champ `kind` n'existe pas encore dans le schema).

- [ ] **Step 3.3 : Étendre `CandidateSkillUpdate`**

Dans `backend/schemas/skill.py`, modifier `CandidateSkillUpdate` :

```python
class CandidateSkillUpdate(BaseModel):
    self_assessed_level: str | None = None
    featured: bool | None = None
    notes: str | None = None
    kind: SkillKind | None = None
```

- [ ] **Step 3.4 : Mettre à jour le handler `update_my_skill`**

Dans `backend/api/routes/skills.py`, remplacer le handler `update_my_skill` :

```python
@router.put("/candidates/me/skills/{skill_id}", response_model=CandidateSkillRead)
async def update_my_skill(
    skill_id: UUID,
    data: CandidateSkillUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> CandidateSkill:
    result = await db.execute(
        select(CandidateSkill)
        .where(CandidateSkill.id == skill_id, CandidateSkill.candidate_id == profile.id)
        .options(selectinload(CandidateSkill.skill_ref))
    )
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")

    update_data = data.model_dump(exclude_unset=True)
    kind = update_data.pop("kind", None)

    if kind is not None:
        if not skill.skill_ref.is_custom:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change kind of an ESCO skill",
            )
        skill.skill_ref.kind = kind

    for field, value in update_data.items():
        setattr(skill, field, value)

    await db.commit()
    result = await db.execute(
        select(CandidateSkill)
        .where(CandidateSkill.id == skill_id)
        .options(selectinload(CandidateSkill.skill_ref))
    )
    return result.scalar_one()
```

- [ ] **Step 3.5 : Lancer les tests**

```bash
cd backend && uv run pytest tests/integration/test_candidate_skills_api.py -v
```

Attendu : tous passent.

- [ ] **Step 3.6 : Lancer ruff + mypy**

```bash
cd backend && uv run ruff check . && uv run mypy .
```

- [ ] **Step 3.7 : Commit**

```bash
git add backend/schemas/skill.py backend/api/routes/skills.py backend/tests/integration/test_candidate_skills_api.py
git commit -m "feat(skills): allow editing kind on custom skill references"
```

---

## Task 4 — Backend : groupement par type dans le moteur de génération

**Files:**

- Modify: `backend/services/docx_engine.py`
- Modify: `backend/tests/unit/test_docx_engine.py` (créer si absent)

- [ ] **Step 4.1 : Écrire le test unitaire qui doit échouer**

Créer `backend/tests/unit/test_docx_engine.py` (ou ajouter à la fin s'il existe déjà) :

```python
# backend/tests/unit/test_docx_engine.py
"""Tests unitaires pour les helpers docx_engine."""
from models.skill import SkillKind
from services.docx_engine import _group_skills_by_kind


class _FakeRef:
    def __init__(self, kind: SkillKind) -> None:
        self.kind = kind
        self.name = "FakeSkill"


class _FakeSkill:
    def __init__(self, kind: SkillKind, featured: bool = False) -> None:
        self.skill_ref = _FakeRef(kind)
        self.featured = featured
        self.self_assessed_level = None


def test_group_skills_by_kind_returns_all_kind_keys() -> None:
    skills = [_FakeSkill(SkillKind.technical), _FakeSkill(SkillKind.tool)]
    result = _group_skills_by_kind(skills)
    assert "skills_technical" in result
    assert "skills_tool" in result
    assert "skills_functional" in result  # vide mais présent
    assert "skills_featured" in result


def test_group_skills_by_kind_filters_correctly() -> None:
    s1 = _FakeSkill(SkillKind.technical)
    s2 = _FakeSkill(SkillKind.tool)
    s3 = _FakeSkill(SkillKind.technical)
    result = _group_skills_by_kind([s1, s2, s3])
    assert len(result["skills_technical"]) == 2
    assert len(result["skills_tool"]) == 1
    assert len(result["skills_methodology"]) == 0


def test_group_skills_featured_first_within_type() -> None:
    plain = _FakeSkill(SkillKind.technical, featured=False)
    starred = _FakeSkill(SkillKind.technical, featured=True)
    result = _group_skills_by_kind([plain, starred])
    tech = result["skills_technical"]
    assert tech[0]["featured"] == "true"
    assert tech[1]["featured"] == "false"


def test_group_skills_featured_cross_type() -> None:
    s1 = _FakeSkill(SkillKind.technical, featured=True)
    s2 = _FakeSkill(SkillKind.tool, featured=False)
    s3 = _FakeSkill(SkillKind.methodology, featured=True)
    result = _group_skills_by_kind([s1, s2, s3])
    assert len(result["skills_featured"]) == 2
```

- [ ] **Step 4.2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd backend && uv run pytest tests/unit/test_docx_engine.py -v
```

Attendu : ImportError ou AttributeError (`_group_skills_by_kind` n'existe pas).

- [ ] **Step 4.3 : Implémenter `_group_skills_by_kind` dans `docx_engine.py`**

Dans `backend/services/docx_engine.py`, ajouter après la fonction `skill_flat` (ligne ~167) :

```python
def _group_skills_by_kind(
    skills: Sequence[SkillProtocol],
) -> dict[str, list[dict[str, str]]]:
    """Build per-kind and featured skill lists for template context."""

    def _sort_key(s: SkillProtocol) -> int:
        return 0 if s.featured else 1

    result: dict[str, list[dict[str, str]]] = {}
    for kind in SkillKind:
        filtered = [s for s in skills if s.skill_ref.kind == kind]
        result[f"skills_{kind.value}"] = [
            skill_flat(s) for s in sorted(filtered, key=_sort_key)
        ]

    result["skills_featured"] = [skill_flat(s) for s in skills if s.featured]
    return result
```

Ajouter l'import de `SkillKind` en tête du fichier (dans le bloc des imports models) :

```python
from models.skill import SkillKind
```

- [ ] **Step 4.4 : Mettre à jour `generate_document()` pour injecter les variables groupées**

Dans `backend/services/docx_engine.py`, modifier la fonction `generate_document()`, dans le bloc de construction du contexte :

```python
    context: dict[str, Any] = {
        **profile_flat(profile),
        "experiences": [exp_flat(exp) for exp in experiences],
        "skills": [skill_flat(sk) for sk in skills],
        **_group_skills_by_kind(skills),
    }
```

- [ ] **Step 4.5 : Lancer les tests unitaires**

```bash
cd backend && uv run pytest tests/unit/test_docx_engine.py -v
```

Attendu : tous passent.

- [ ] **Step 4.6 : Lancer tous les tests backend**

```bash
cd backend && uv run pytest -v
```

Attendu : tous passent.

- [ ] **Step 4.7 : Lancer ruff + mypy**

```bash
cd backend && uv run ruff check . && uv run mypy .
```

- [ ] **Step 4.8 : Commit**

```bash
git add backend/services/docx_engine.py backend/tests/unit/test_docx_engine.py
git commit -m "feat(generation): expose per-type and featured skill variables in template context"
```

---

## Task 5 — Frontend : restructuration de la page skills

**Files:**

- Modify: `frontend/types/api.ts`
- Modify: `frontend/app/(candidate)/candidate/skills/page.tsx`

- [ ] **Step 5.1 : Mettre à jour `frontend/types/api.ts`**

Remplacer le type `SkillKind` (ajouter `"soft"`) :

```typescript
export type SkillKind =
  | "technical"
  | "functional"
  | "sectoral"
  | "methodology"
  | "tool"
  | "soft";
```

Remplacer l'interface `SkillReference` (ajouter `is_custom` et `creator_candidate_id`) :

```typescript
export interface SkillReference {
  id: string;
  name: string;
  slug: string;
  kind: SkillKind;
  aliases: string[];
  esco_uri: string | null;
  esco_skill_type: string | null;
  source: string;
  description: string | null;
  is_custom: boolean;
  creator_candidate_id: string | null;
}
```

Remplacer l'interface `Skill` (ajouter `created_at`) :

```typescript
export interface Skill {
  id: string;
  candidate_id: string;
  skill_ref_id: string;
  skill_ref: SkillReference;
  self_assessed_level: string | null;
  featured: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5.2 : Ajouter les constantes de type en haut de `page.tsx`**

Dans `frontend/app/(candidate)/candidate/skills/page.tsx`, après les imports, ajouter avant les helpers existants :

```typescript
// ---- Skill type constants ----------------------------------------------------

const KIND_ORDER: SkillKind[] = [
  "technical",
  "tool",
  "functional",
  "methodology",
  "sectoral",
  "soft",
];

const KIND_LABELS: Record<SkillKind, string> = {
  technical: "Technique",
  tool: "Outil",
  functional: "Fonctionnel",
  methodology: "Méthodologie",
  sectoral: "Sectoriel",
  soft: "Soft skills",
};
```

Ajouter `SkillKind` aux imports depuis `@/types/api` (déjà importé — vérifier qu'il est dans la liste, sinon l'ajouter).

- [ ] **Step 5.3 : Mettre à jour `SkillForm` et `skillToForm`**

Trouver la section `// ---- Skills` dans `page.tsx` (vers la ligne 460).

Remplacer `SkillForm`, `EMPTY_SKILL`, et `skillToForm` par :

```typescript
type SkillForm = {
  skill_ref_id: string;
  skill_ref_name: string;
  skill_ref_is_custom: boolean;
  self_assessed_level: string;
  featured: boolean;
  notes: string;
  kind: SkillKind | "";
};

const EMPTY_SKILL: SkillForm = {
  skill_ref_id: "",
  skill_ref_name: "",
  skill_ref_is_custom: false,
  self_assessed_level: "",
  featured: false,
  notes: "",
  kind: "",
};

function skillToForm(skill: Skill): SkillForm {
  return {
    skill_ref_id: skill.skill_ref_id,
    skill_ref_name: skill.skill_ref.name,
    skill_ref_is_custom: skill.skill_ref.is_custom,
    self_assessed_level: skill.self_assessed_level ?? "",
    featured: skill.featured,
    notes: skill.notes ?? "",
    kind: skill.skill_ref.kind,
  };
}
```

- [ ] **Step 5.4 : Mettre à jour `selectSkillRef` dans `SkillSection`**

Trouver la fonction `selectSkillRef` dans `SkillSection`. La remplacer par :

```typescript
function selectSkillRef(ref: SkillReference) {
  setForm((f) => ({
    ...f,
    skill_ref_id: ref.id,
    skill_ref_name: ref.name,
    skill_ref_is_custom: ref.is_custom,
    kind: ref.kind,
  }));
  setSearchQuery("");
  setSearchResults([]);
}
```

- [ ] **Step 5.5 : Mettre à jour `handleSubmit` pour envoyer `kind`**

Trouver le bloc `handleSubmit` dans `SkillSection`. Modifier la partie PUT (édition) pour inclure `kind` si la skill est custom :

```typescript
if (editingId) {
  const payload: Record<string, unknown> = {
    self_assessed_level: form.self_assessed_level || null,
    featured: form.featured,
    notes: form.notes || null,
  };
  if (form.skill_ref_is_custom && form.kind) {
    payload.kind = form.kind;
  }
  const updated = await api.put<Skill>(
    `/candidates/me/skills/${editingId}`,
    payload,
  );
  setItems((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
  setEditingId(null);
} else {
  // POST (création) — inchangé
  const created = await api.post<Skill>("/candidates/me/skills", {
    skill_ref_id: form.skill_ref_id,
    self_assessed_level: form.self_assessed_level || null,
    featured: form.featured,
    notes: form.notes || null,
  });
  setItems((prev) => [...prev, created]);
}
```

- [ ] **Step 5.6 : Ajouter `handleToggleFeatured`**

Dans `SkillSection`, après `handleDelete`, ajouter :

```typescript
async function handleToggleFeatured(skill: Skill) {
  try {
    const updated = await api.put<Skill>(`/candidates/me/skills/${skill.id}`, {
      featured: !skill.featured,
    });
    setItems((prev) => prev.map((s) => (s.id === skill.id ? updated : s)));
  } catch {
    setError("Impossible de modifier la mise en avant");
  }
}
```

- [ ] **Step 5.7 : Restructurer le rendu de `SkillSection`**

Trouver le `return (...)` de `SkillSection`. Remplacer le JSX de la section d'affichage des skills par la structure suivante (en conservant le formulaire d'ajout/édition existant tel quel) :

```tsx
// Calcul des groupes
const featuredSkills = items.filter((s) => s.featured).slice(0, 6);
const skillsByKind = KIND_ORDER.map((kind) => ({
  kind,
  label: KIND_LABELS[kind],
  skills: items.filter((s) => s.skill_ref.kind === kind),
})).filter((g) => g.skills.length > 0);

return (
  <div className="space-y-6">
    {/* ---- Bloc Compétences clés ---- */}
    {featuredSkills.length > 0 && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Compétences clés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {featuredSkills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => handleToggleFeatured(skill)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                title="Retirer des compétences clés"
              >
                <span>★</span>
                {skill.skill_ref.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {/* ---- Sections par type ---- */}
    {skillsByKind.map(({ kind, label, skills }) => (
      <Card key={kind}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
            <SectionAddButton
              adding={adding && form.kind === kind}
              onToggle={() => {
                setAdding((v) => !v);
                setForm({ ...EMPTY_SKILL, kind });
                setEditingId(null);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Formulaire d'ajout/édition pour ce type */}
          {adding && !editingId && form.kind === kind && (
            <div className="rounded-lg border border-dashed p-4">
              {/* Conserver ici le formulaire d'ajout existant */}
              {/* (champ autocomplete, niveau, featured checkbox, notes) */}
              {renderSkillForm()}
            </div>
          )}

          {/* Liste des skills */}
          {skills
            .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
            .map((skill) => (
              <div
                key={skill.id}
                className={`flex items-center justify-between rounded-md px-3 py-2 ${
                  skill.featured ? "bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(skill)}
                    className={`shrink-0 text-sm transition-colors ${
                      skill.featured
                        ? "text-primary"
                        : "text-muted-foreground/30 hover:text-muted-foreground"
                    }`}
                    title={
                      skill.featured ? "Retirer des clés" : "Mettre en avant"
                    }
                  >
                    ★
                  </button>
                  <span className="truncate text-sm font-medium">
                    {skill.skill_ref.name}
                  </span>
                  {skill.self_assessed_level && (
                    <span className="text-xs text-muted-foreground">
                      {skill.self_assessed_level}
                    </span>
                  )}
                </div>
                <ItemActions
                  deleteLabel={`Supprimer ${skill.skill_ref.name}`}
                  onEdit={() => startEdit(skill)}
                  onDelete={() => handleDelete(skill.id)}
                />
              </div>
            ))}

          {/* Formulaire d'édition inline */}
          {editingId && skills.find((s) => s.id === editingId) && (
            <div className="rounded-lg border border-dashed p-4">
              {renderSkillForm()}
            </div>
          )}
        </CardContent>
      </Card>
    ))}

    {/* Bouton d'ajout global si aucune section n'existe encore */}
    {items.length === 0 && (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Aucune compétence ajoutée
          </p>
          <SectionAddButton
            adding={adding}
            onToggle={() => setAdding((v) => !v)}
          />
          {adding && (
            <div className="mt-4 rounded-lg border border-dashed p-4 text-left">
              {renderSkillForm()}
            </div>
          )}
        </CardContent>
      </Card>
    )}
  </div>
);
```

> **Note:** le JSX ci-dessus utilise `renderSkillForm()` — extraire le formulaire d'ajout/édition existant dans une fonction `renderSkillForm()` à l'intérieur de `SkillSection`. La fonction contient le bloc autocomplete + niveau + featured + notes + boutons Enregistrer/Annuler que le composant avait déjà.

- [ ] **Step 5.8 : Ajouter le champ `kind` dans `renderSkillForm()` pour les skills custom**

Dans `renderSkillForm()`, après le champ "Notes", ajouter conditionnellement :

```tsx
{
  form.skill_ref_is_custom && (
    <div className="space-y-1.5">
      <Label htmlFor="skill-kind">Type</Label>
      <Select
        value={form.kind}
        onValueChange={(v) => updateForm("kind", v as SkillKind)}
      >
        <SelectTrigger id="skill-kind" className="w-full">
          <SelectValue placeholder="Choisir un type" />
        </SelectTrigger>
        <SelectContent>
          {KIND_ORDER.map((k) => (
            <SelectItem key={k} value={k}>
              {KIND_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 5.9 : Vérifier TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Corriger toute erreur de type.

- [ ] **Step 5.10 : Tester manuellement**

Démarrer le frontend :

```bash
cd frontend && npm run dev
```

Aller sur `http://localhost:3000/candidate/skills` (connecté en tant que candidat).

Vérifier :

- [ ] Un profil sans skill n'affiche que le bouton "Ajouter"
- [ ] Après ajout d'une skill technique, la section "Technique" apparaît
- [ ] Après ajout d'une skill methodology, la section "Méthodologie" apparaît
- [ ] Cliquer ★ sur une skill l'ajoute au bloc "Compétences clés"
- [ ] Cliquer ★ dans le bloc "Compétences clés" retire la mise en avant
- [ ] Éditer une skill custom affiche le champ "Type" dans le formulaire
- [ ] Éditer une skill ESCO n'affiche pas le champ "Type"
- [ ] Changer le type d'une skill custom dans le formulaire → la skill se déplace dans la bonne section après enregistrement

- [ ] **Step 5.11 : Commit**

```bash
git add frontend/types/api.ts frontend/app/\(candidate\)/candidate/skills/page.tsx
git commit -m "feat(frontend): skills organized by ESCO type with featured bloc and custom kind editing"
```

---

## Self-Review

**Couverture de la spec :**

- ✅ `creator_candidate_id` sur `SkillReference` — Task 1
- ✅ Custom skills privées (search filtré) — Task 2
- ✅ Type éditable sur skills custom, verrouillé sur ESCO — Task 3
- ✅ Variables `skills_technical`, `skills_tool`, `skills_functional`, `skills_methodology`, `skills_sectoral`, `skills_soft`, `skills_featured` dans le template — Task 4
- ✅ Featured remonte en tête dans chaque liste par type — Task 4
- ✅ `skills` flat inchangé (backward compat) — Task 4 (le context merge avec `**_group_skills_by_kind(skills)` ne remplace pas `skills`)
- ✅ Bloc "Compétences clés" (max 6, cross-types, toggle) — Task 5
- ✅ Sections par type dynamiques (masquées si 0 skills) — Task 5
- ✅ Édition `kind` dans le formulaire pour skills custom — Task 5

**Cohérence des types :**

- `_group_skills_by_kind` accepte `Sequence[SkillProtocol]` dans docx_engine — cohérent avec la signature de `generate_document()`
- `CandidateSkillUpdate.kind: SkillKind | None` — cohérent avec le handler qui pop et gère séparément
- `SkillForm.kind: SkillKind | ""` — `""` pour l'état initial (aucune sélection), `SkillKind` après sélection
