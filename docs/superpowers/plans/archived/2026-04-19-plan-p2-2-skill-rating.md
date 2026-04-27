# P2.2 — Niveau de compétence 1→5 (rating numérique normalisé)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un niveau de compétence **numérique** entre 1 et 5 sur chaque `Skill`, tout en conservant le champ `level` texte libre existant pour une nuance optionnelle ("notions", "autonome", etc.). Le niveau numérique est destiné aux futurs filtres/tris côté recruteur ; le champ texte reste pour la narration dans le document généré.

**Architecture:**

- Backend : nouvelle colonne `level_rating: int | None` (1-5) sur `Skill`, contrainte `CHECK (level_rating BETWEEN 1 AND 5)` au niveau DB + validation Pydantic `ge=1, le=5`. Le champ texte `level` reste inchangé et optionnel.
- Frontend : le formulaire d'ajout/édition de compétence ajoute un `Select` 1-5. L'affichage liste un "2/5" après la catégorie.
- **Générateur inchangé** pour cette itération : pas d'injection automatique dans les documents (pas de demande utilisateur, pas de placeholder `skill.level_rating` dans les templates existants). À ajouter seulement si le besoin remonte.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic (backend), Next.js 15 + shadcn/ui (frontend), pytest + testcontainers.

**Prerequisite:**

- Modèle `Skill` existant ([backend/models/candidate_profile.py:76-89](backend/models/candidate_profile.py#L76-L89)).
- Aucune dépendance directe avec les plans P1.1, P1.2, P2.1 — peut être développé en parallèle.

---

## File Structure

| File                                                           | Action             | Purpose                                                       |
| -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------- |
| `backend/models/candidate_profile.py`                          | Modify             | Colonne `level_rating` sur `Skill`                            |
| `backend/alembic/versions/<hash>_add_level_rating_to_skill.py` | Create (generated) | Migration                                                     |
| `backend/schemas/candidate.py`                                 | Modify             | `level_rating` dans Skill Create/Update/Read + validation 1-5 |
| `backend/tests/integration/test_candidate_api.py`              | Modify             | Tests CRUD skill avec rating                                  |
| `frontend/types/api.ts`                                        | Modify             | `level_rating` sur `Skill`                                    |
| `frontend/app/(candidate)/candidate/skills/page.tsx`           | Modify             | Select 1-5 dans le formulaire + affichage                     |

---

## Task 1: Modèle + migration

**Files:**

- Modify: `backend/models/candidate_profile.py`

- [ ] **Step 1: Ajouter la colonne sur Skill**

Dans [backend/models/candidate_profile.py](backend/models/candidate_profile.py), classe `Skill` (ligne 76), ajouter après `level` (ligne 88) :

```python
    level_rating: Mapped[int | None] = mapped_column(
        Integer,
        CheckConstraint("level_rating BETWEEN 1 AND 5", name="ck_skills_level_rating_range"),
        nullable=True,
    )
```

Puis en haut du fichier, étendre l'import SQLAlchemy (ligne 9) pour inclure `CheckConstraint` :

```python
from sqlalchemy import JSON, Boolean, CheckConstraint, Date, Enum, ForeignKey, Integer, String, Text
```

**Why un CHECK constraint DB :** garde-fou si un client bypass Pydantic. Suivre le même esprit que les autres modèles (enums protégés par le type SQL).

- [ ] **Step 2: Générer la migration**

Depuis `backend/` :

```bash
uv run alembic revision --autogenerate -m "add_level_rating_to_skill"
```

- [ ] **Step 3: Vérifier le contenu de la migration**

Ouvrir le nouveau fichier dans `backend/alembic/versions/`. Il doit contenir au moins :

```python
def upgrade() -> None:
    op.add_column(
        "skills",
        sa.Column("level_rating", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_skills_level_rating_range",
        "skills",
        "level_rating BETWEEN 1 AND 5",
    )


def downgrade() -> None:
    op.drop_constraint("ck_skills_level_rating_range", "skills", type_="check")
    op.drop_column("skills", "level_rating")
```

**Si l'autogenerate n'a pas inclus le `create_check_constraint`**, l'ajouter manuellement en suivant le bloc ci-dessus (alembic n'autodétecte pas toujours les CHECK inline).

- [ ] **Step 4: Appliquer**

```bash
uv run alembic upgrade head && uv run alembic current
```

Expected: `<hash> (head)`.

- [ ] **Step 5: Commit**

```bash
git add backend/models/candidate_profile.py backend/alembic/versions/
git commit -m "feat(backend): add level_rating (1-5) column to Skill with check constraint"
```

---

## Task 2: Schéma Pydantic

**Files:**

- Modify: `backend/schemas/candidate.py`

- [ ] **Step 1: Importer `Field`**

En haut de [backend/schemas/candidate.py](backend/schemas/candidate.py), modifier la ligne 8 :

```python
from pydantic import BaseModel, ConfigDict, Field
```

- [ ] **Step 2: Étendre `SkillCreate`, `SkillUpdate`, `SkillRead`**

Remplacer les trois classes (lignes 101-125) par :

```python
class SkillCreate(BaseModel):
    name: str
    category: SkillCategory
    level: str | None = None
    level_rating: int | None = Field(default=None, ge=1, le=5)
    years_of_experience: int | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    category: SkillCategory | None = None
    level: str | None = None
    level_rating: int | None = Field(default=None, ge=1, le=5)
    years_of_experience: int | None = None


class SkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    name: str
    category: SkillCategory
    level: str | None
    level_rating: int | None
    years_of_experience: int | None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/candidate.py
git commit -m "feat(backend): add level_rating to Skill schemas with 1-5 validation"
```

---

## Task 3: Tests d'intégration

**Files:**

- Modify: `backend/tests/integration/test_candidate_api.py`

- [ ] **Step 1: Ajouter les tests**

Trouver dans [backend/tests/integration/test_candidate_api.py](backend/tests/integration/test_candidate_api.py) la section `# ---- Skill` (les tests skill existants) et ajouter à la suite :

```python
async def test_create_skill_with_level_rating(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 4},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["level_rating"] == 4
    assert data["level"] is None


async def test_create_skill_level_rating_is_optional(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language"},
    )
    assert r.status_code == 201
    assert r.json()["level_rating"] is None


async def test_create_skill_rejects_rating_outside_range(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r_low = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 0},
    )
    assert r_low.status_code == 422

    r_high = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 6},
    )
    assert r_high.status_code == 422


async def test_update_skill_level_rating(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 2},
    )
    skill_id = created.json()["id"]

    r = await client.put(
        f"/candidates/me/skills/{skill_id}",
        headers=candidate_headers,
        json={"level_rating": 5},
    )
    assert r.status_code == 200
    assert r.json()["level_rating"] == 5


async def test_create_skill_with_level_text_and_rating_coexist(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={
            "name": "Python",
            "category": "language",
            "level": "autonome",
            "level_rating": 3,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["level"] == "autonome"
    assert data["level_rating"] == 3
```

- [ ] **Step 2: Exécuter**

```bash
uv run pytest tests/integration/test_candidate_api.py -v
```

Expected: les 5 nouveaux tests PASSent, aucune régression.

- [ ] **Step 3: Lint backend**

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy .
```

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/test_candidate_api.py
git commit -m "test(backend): cover level_rating 1-5 validation on skill API"
```

---

## Task 4: Type TypeScript

**Files:**

- Modify: `frontend/types/api.ts`

- [ ] **Step 1: Étendre `Skill`**

Dans [frontend/types/api.ts](frontend/types/api.ts), dans l'interface `Skill` (lignes 26-35), ajouter après `level` :

```ts
level_rating: number | null;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/types/api.ts
git commit -m "feat(frontend): add level_rating to Skill type"
```

---

## Task 5: Formulaire + affichage skills

**Files:**

- Modify: `frontend/app/(candidate)/candidate/skills/page.tsx`

- [ ] **Step 1: Étendre `SkillForm`**

Dans [frontend/app/(candidate)/candidate/skills/page.tsx](<frontend/app/(candidate)/candidate/skills/page.tsx>), modifier le type `SkillForm` (lignes 267-272) et `EMPTY_SKILL` (ligne 274) :

```tsx
type SkillForm = {
  name: string;
  category: SkillCategory;
  level: string;
  level_rating: string;
  years_of_experience: string;
};

const EMPTY_SKILL: SkillForm = {
  name: "",
  category: "language",
  level: "",
  level_rating: "",
  years_of_experience: "",
};
```

Ajouter une constante pour le dropdown, juste sous `EMPTY_SKILL` :

```tsx
const SKILL_RATING_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "1/5 — Notions" },
  { value: "2", label: "2/5 — Débutant" },
  { value: "3", label: "3/5 — Intermédiaire" },
  { value: "4", label: "4/5 — Confirmé" },
  { value: "5", label: "5/5 — Expert" },
];
```

- [ ] **Step 2: Mettre à jour le payload `handleAdd`**

Dans la fonction `handleAdd` de `SkillSection` (lignes 296-316), modifier le `body` :

```tsx
const body = {
  name: form.name,
  category: form.category,
  level: form.level || null,
  level_rating: form.level_rating ? Number(form.level_rating) : null,
  years_of_experience: form.years_of_experience
    ? Number(form.years_of_experience)
    : null,
};
```

- [ ] **Step 3: Étendre l'affichage liste**

Remplacer l'élément `<p>` secondaire de chaque skill (lignes 348-352) par :

```tsx
<p className="text-sm text-muted-foreground">
  {categoryLabel(skill.category)}
  {skill.level_rating ? ` · ${skill.level_rating}/5` : ""}
  {skill.level ? ` · ${skill.level}` : ""}
  {skill.years_of_experience ? ` · ${skill.years_of_experience} an(s)` : ""}
</p>
```

- [ ] **Step 4: Ajouter le Select 1-5 dans le formulaire**

Dans le `<form>` d'ajout de skill (lignes 366-395), remplacer le bloc actuel de deux colonnes (`skill-level` / `skill-years`) par trois champs :

```tsx
<div className="grid grid-cols-3 gap-3">
  <div className="space-y-1">
    <Label htmlFor="skill-rating">Niveau (1→5)</Label>
    <Select
      value={form.level_rating}
      onValueChange={(v) => v && set("level_rating", v)}
    >
      <SelectTrigger id="skill-rating" className="w-full">
        <SelectValue placeholder="–" />
      </SelectTrigger>
      <SelectContent>
        {SKILL_RATING_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  <div className="space-y-1">
    <Label htmlFor="skill-level">Nuance (libre)</Label>
    <Input
      id="skill-level"
      value={form.level}
      onChange={(e) => set("level", e.target.value)}
      placeholder="ex: autonome, Senior…"
    />
  </div>
  <div className="space-y-1">
    <Label htmlFor="skill-years">{"Années d'expérience"}</Label>
    <Input
      id="skill-years"
      type="number"
      min={0}
      value={form.years_of_experience}
      onChange={(e) => set("years_of_experience", e.target.value)}
    />
  </div>
</div>
```

**Design :** le rating numérique est le champ **primaire** (à gauche, saisie la plus rapide) ; le champ `level` texte devient **nuance optionnelle** pour affiner.

- [ ] **Step 5: Type-check**

Depuis `frontend/` :

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Vérification manuelle**

```bash
npm run dev
```

Scénario :

1. Se connecter comme candidat, ajouter une compétence avec rating `4/5 — Confirmé` et sans nuance texte. Vérifier que la liste affiche "Langage · 4/5".
2. Ajouter une deuxième compétence avec rating `3/5` et nuance `autonome`. Liste : "Langage · 3/5 · autonome".
3. Recharger la page : les valeurs sont persistées.
4. Essayer (via DevTools fetch) de POSTer `level_rating: 7` → recevoir 422.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/skills/page.tsx
git commit -m "feat(frontend): add 1-5 skill rating select alongside free-text level"
```

---

## Self-Review — Spec coverage

| Besoin utilisateur                                | Couvert par                                                     |
| ------------------------------------------------- | --------------------------------------------------------------- |
| Sélecteur 1→5 pour le niveau                      | Task 5 Step 4                                                   |
| Champ texte libre conservé en parallèle           | Task 2 (schéma gardé), Task 5 Step 4 (Input libre)              |
| Données comparables pour futurs filtres           | Task 1 : `int` + CHECK `BETWEEN 1 AND 5`                        |
| Rejet au niveau API si hors range                 | Task 2 : `Field(ge=1, le=5)` + tests Task 3                     |
| Doublons "Python" vs "python" _(cf. review P2.5)_ | **Non couvert ici** — hors scope de cette itération, voir Notes |

**Placeholders scannés :** aucun. Types cohérents : `level_rating` utilisé partout (model Python, schéma, type TS, form, JSON payload) avec le même nom et la même plage de valeurs. `SKILL_RATING_OPTIONS` est une constante locale, pas partagée.

## Notes pour Codex

- **Pas de modification du moteur de génération** — cette itération n'ajoute pas `skill.level_rating` dans le lookup `_profile_flat`. C'est volontaire : `skill` est une entité liste, pas un champ plat, et aucun template ne consomme encore de bloc `{{#SKILLS}}…{{/SKILLS}}`. À traiter dans une itération dédiée quand un vrai template en aura besoin (suivrait le pattern `_apply_block` existant pour les expériences).
- **Pas de suppression du champ texte `level`** : certains candidats tiennent à écrire "notions / autonome / expert" au lieu d'un chiffre. On laisse cohabiter. Le rating est la source pour les filtres, le texte pour la narration.
- **Normalisation (casse, doublons "Python 3" vs "Python")** : hors scope de ce plan. Ce sera l'objet d'un futur plan "autocomplete hybride" (P2.3 dans la review).
- **Pas de migration de données existantes** : les skills actuels conservent `level_rating=NULL`. Ils continuent d'afficher juste la catégorie + le texte ; les candidats peuvent éditer pour ajouter un rating plus tard.
