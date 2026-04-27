# P2.1 — Type de contrat (CDI / Freelance / Les deux) + salaire annuel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un candidat de déclarer son type de contrat (`freelance`, `cdi`, ou `both`) et d'exposer le TJM et/ou le salaire annuel selon ce choix. Le recruteur peut ensuite mapper deux placeholders distincts `daily_rate` (TJM) et `annual_salary` (salaire annuel) dans ses templates.

**Architecture:**

- Backend : ajouter un enum `ContractType` et deux colonnes (`contract_type`, `annual_salary`) sur `CandidateProfile`. Exposer dans les schémas, étendre le lookup de génération `_profile_flat` pour inclure `annual_salary`.
- Frontend : formulaire profil candidat étend un sélecteur de type de contrat + affichage conditionnel TJM / salaire annuel. UI de mapping de template ajoute **Salaire annuel** à `PROFILE_FIELDS`.
- Le champ `contract_type` est **obligatoire au niveau DB** (valeur par défaut `freelance` pour les profils existants) : un candidat ne peut donc pas le laisser vide, mais le seed existant reste compatible.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic (backend), Next.js 15 + shadcn/ui (frontend), pytest + testcontainers.

**Prerequisite:**

- Plan P1.2 mergé (pas bloquant mais on édite le même `PROFILE_FIELDS`, attention aux conflits).
- Migrations Alembic actuelles à jour ([cbc80ec8dcc0](backend/alembic/versions/cbc80ec8dcc0_create_candidate_profile_tables.py) pour `candidate_profiles`).

---

## File Structure

| File                                                                        | Action             | Purpose                                                                  |
| --------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `backend/models/candidate_profile.py`                                       | Modify             | Ajouter enum `ContractType`, colonnes `contract_type` et `annual_salary` |
| `backend/models/__init__.py`                                                | Modify             | Export de `ContractType`                                                 |
| `backend/alembic/versions/<hash>_add_contract_type_to_candidate_profile.py` | Create (generated) | Migration                                                                |
| `backend/schemas/candidate.py`                                              | Modify             | `contract_type` et `annual_salary` dans Update/Read                      |
| `backend/services/generation_service.py`                                    | Modify             | `_profile_flat` inclut `annual_salary`                                   |
| `backend/tests/integration/test_candidate_api.py`                           | Modify             | Tests profil étendu                                                      |
| `backend/tests/unit/test_docx_generator.py`                                 | Modify             | Test `annual_salary` dans le lookup                                      |
| `frontend/types/api.ts`                                                     | Modify             | `contract_type` et `annual_salary` sur `CandidateProfile`                |
| `frontend/app/(candidate)/candidate/profile/page.tsx`                       | Modify             | Ajout select + champs conditionnels                                      |
| `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx`                | Modify             | Ajouter `annual_salary` dans `PROFILE_FIELDS`                            |

---

## Task 1: Modèle SQLAlchemy + enum

**Files:**

- Modify: `backend/models/candidate_profile.py`

- [ ] **Step 1: Ajouter l'enum et les colonnes**

Dans [backend/models/candidate_profile.py](backend/models/candidate_profile.py), juste sous `LanguageLevel` (ligne 32) ajouter :

```python
class ContractType(StrEnum):
    FREELANCE = "freelance"
    CDI = "cdi"
    BOTH = "both"
```

Puis dans la classe `CandidateProfile`, juste après `daily_rate` (ligne 53), ajouter :

```python
    contract_type: Mapped[ContractType] = mapped_column(
        Enum(ContractType, name="contract_type"),
        default=ContractType.FREELANCE,
        nullable=False,
    )
    annual_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

L'import `Enum` de SQLAlchemy existe déjà en ligne 9 du fichier.

- [ ] **Step 2: Exporter l'enum**

Dans [backend/models/**init**.py](backend/models/__init__.py), ajouter `ContractType` à l'import et à `__all__` :

```python
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    ContractType,
    Education,
    Experience,
    Language,
    LanguageLevel,
    Skill,
    SkillCategory,
)
```

Puis dans `__all__`, insérer `"ContractType",` après `"Certification",`.

- [ ] **Step 3: Générer la migration**

Depuis `backend/` :

```bash
uv run alembic revision --autogenerate -m "add_contract_type_to_candidate_profile"
```

- [ ] **Step 4: Vérifier la migration générée**

Ouvrir le nouveau fichier dans `backend/alembic/versions/`. Il doit contenir **au moins** :

```python
contract_type_enum = sa.Enum("FREELANCE", "CDI", "BOTH", name="contract_type")

def upgrade() -> None:
    contract_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "candidate_profiles",
        sa.Column(
            "contract_type",
            contract_type_enum,
            nullable=False,
            server_default="FREELANCE",
        ),
    )
    op.add_column(
        "candidate_profiles",
        sa.Column("annual_salary", sa.Integer(), nullable=True),
    )
    # Drop server_default after backfill: new rows set default via SQLAlchemy.
    op.alter_column("candidate_profiles", "contract_type", server_default=None)


def downgrade() -> None:
    op.drop_column("candidate_profiles", "annual_salary")
    op.drop_column("candidate_profiles", "contract_type")
    contract_type_enum.drop(op.get_bind(), checkfirst=True)
```

**Si l'autogenerate n'a pas produit ce code** (alembic peut oublier le `server_default` qui est nécessaire pour remplir les lignes existantes avec NOT NULL), éditer à la main pour correspondre au bloc ci-dessus. La stratégie est : créer avec default → backfill auto par Postgres → drop le default.

- [ ] **Step 5: Appliquer la migration**

```bash
uv run alembic upgrade head && uv run alembic current
```

Expected: `<hash> (head)`.

- [ ] **Step 6: Commit**

```bash
git add backend/models/candidate_profile.py backend/models/__init__.py backend/alembic/versions/
git commit -m "feat(backend): add ContractType enum and annual_salary to CandidateProfile"
```

---

## Task 2: Pydantic schemas

**Files:**

- Modify: `backend/schemas/candidate.py`

- [ ] **Step 1: Importer l'enum**

En haut de [backend/schemas/candidate.py](backend/schemas/candidate.py), remplacer la ligne 10 par :

```python
from models.candidate_profile import ContractType, LanguageLevel, SkillCategory
```

- [ ] **Step 2: Étendre CandidateProfileUpdate**

Dans `CandidateProfileUpdate` (lignes 15-29), ajouter deux champs après `daily_rate` (ligne 28) :

```python
    contract_type: ContractType | None = None
    annual_salary: int | None = None
```

- [ ] **Step 3: Étendre CandidateProfileRead**

Dans `CandidateProfileRead` (lignes 32-50), ajouter deux champs après `daily_rate` (ligne 47) :

```python
    contract_type: ContractType
    annual_salary: int | None
```

- [ ] **Step 4: Commit**

```bash
git add backend/schemas/candidate.py
git commit -m "feat(backend): expose contract_type and annual_salary in candidate schemas"
```

---

## Task 3: Générateur — inclure `annual_salary`

**Files:**

- Modify: `backend/services/generation_service.py`

- [ ] **Step 1: Étendre `_profile_flat`**

Dans [backend/services/generation_service.py](backend/services/generation_service.py), modifier la fonction `_profile_flat` (lignes 34-46) pour ajouter une entrée `annual_salary` :

```python
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
    }
```

**Why ne pas exposer `contract_type` dans le lookup :** c'est une donnée discriminante interne, pas un texte à injecter dans un document. Les templates affichent TJM / salaire, pas "mon type de contrat est freelance".

- [ ] **Step 2: Commit**

```bash
git add backend/services/generation_service.py
git commit -m "feat(backend): include annual_salary in generation lookup"
```

---

## Task 4: Tests d'intégration candidate API

**Files:**

- Modify: `backend/tests/integration/test_candidate_api.py`

- [ ] **Step 1: Ajouter des tests**

Ajouter dans [backend/tests/integration/test_candidate_api.py](backend/tests/integration/test_candidate_api.py), juste après `test_update_profile_extra_fields` (vers ligne 93) :

```python
async def test_profile_defaults_contract_type_to_freelance(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json()["contract_type"] == "freelance"
    assert r.json()["annual_salary"] is None


async def test_update_profile_contract_type_cdi(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"contract_type": "cdi", "annual_salary": 55000, "daily_rate": None},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["contract_type"] == "cdi"
    assert data["annual_salary"] == 55000


async def test_update_profile_contract_type_both(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"contract_type": "both", "annual_salary": 60000, "daily_rate": 700},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["contract_type"] == "both"
    assert data["annual_salary"] == 60000
    assert data["daily_rate"] == 700


async def test_update_profile_rejects_invalid_contract_type(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"contract_type": "gig"},
    )
    assert r.status_code == 422
```

- [ ] **Step 2: Exécuter les tests**

```bash
uv run pytest tests/integration/test_candidate_api.py -v
```

Expected: les 4 nouveaux tests PASSent, pas de régression.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_candidate_api.py
git commit -m "test(backend): cover contract_type and annual_salary on profile API"
```

---

## Task 5: Test unitaire du générateur

**Files:**

- Modify: `backend/tests/unit/test_docx_generator.py`

- [ ] **Step 1: Repérer un test existant qui construit un profil**

Ouvrir [backend/tests/unit/test_docx_generator.py](backend/tests/unit/test_docx_generator.py) et repérer comment un `CandidateProfile` est construit dans un test existant (helper ou inline).

- [ ] **Step 2: Ajouter un test qui vérifie `annual_salary`**

Ajouter à la fin du fichier (adapter l'import/le helper si un `_make_profile` existe déjà) :

```python
def test_generate_replaces_annual_salary_placeholder(tmp_path: Path) -> None:
    from docx import Document
    from models.candidate_profile import CandidateProfile, ContractType
    from services.generation_service import generate_document

    doc = Document()
    doc.add_paragraph("Salaire annuel souhaité : {{SALAIRE}} €")
    template_path = tmp_path / "tmpl.docx"
    doc.save(str(template_path))

    profile = CandidateProfile(
        first_name="Alice",
        last_name="Dupont",
        contract_type=ContractType.CDI,
        annual_salary=55000,
    )

    out_bytes = generate_document(
        str(template_path),
        profile,
        [],
        {"{{SALAIRE}}": "annual_salary"},
    )

    out_doc = Document(io.BytesIO(out_bytes))
    text = "\n".join(p.text for p in out_doc.paragraphs)
    assert "55000" in text
    assert "{{SALAIRE}}" not in text
```

Ajouter en haut du fichier si absent :

```python
import io
from pathlib import Path
```

- [ ] **Step 3: Exécuter**

```bash
uv run pytest tests/unit/test_docx_generator.py -v
```

Expected: PASS.

- [ ] **Step 4: Lint + type-check backend**

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy .
```

- [ ] **Step 5: Commit**

```bash
git add backend/tests/unit/test_docx_generator.py
git commit -m "test(backend): cover annual_salary placeholder in docx generator"
```

---

## Task 6: Type TypeScript

**Files:**

- Modify: `frontend/types/api.ts`

- [ ] **Step 1: Ajouter l'union type et étendre CandidateProfile**

Dans [frontend/types/api.ts](frontend/types/api.ts) :

1. Après la ligne 8 (après `LanguageLevel`), ajouter :

```ts
export type ContractType = "freelance" | "cdi" | "both";
```

2. Dans l'interface `CandidateProfile` (lignes 76-91), ajouter deux champs après `daily_rate` :

```ts
contract_type: ContractType;
annual_salary: number | null;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/types/api.ts
git commit -m "feat(frontend): add ContractType and annual_salary to CandidateProfile type"
```

---

## Task 7: Formulaire profil candidat

**Files:**

- Modify: `frontend/app/(candidate)/candidate/profile/page.tsx`

- [ ] **Step 1: Remplacer le composant par la version étendue**

Remplacer **tout le contenu** de [frontend/app/(candidate)/candidate/profile/page.tsx](<frontend/app/(candidate)/candidate/profile/page.tsx>) par :

```tsx
// frontend/app/(candidate)/candidate/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { CandidateProfile, ContractType } from "@/types/api";

type FormFields = {
  first_name: string;
  last_name: string;
  title: string;
  summary: string;
  phone: string;
  email_contact: string;
  linkedin_url: string;
  location: string;
  contract_type: ContractType;
  daily_rate: string;
  annual_salary: string;
};

const EMPTY_FORM: FormFields = {
  first_name: "",
  last_name: "",
  title: "",
  summary: "",
  phone: "",
  email_contact: "",
  linkedin_url: "",
  location: "",
  contract_type: "freelance",
  daily_rate: "",
  annual_salary: "",
};

const CONTRACT_OPTIONS: { value: ContractType; label: string }[] = [
  { value: "freelance", label: "Freelance (TJM)" },
  { value: "cdi", label: "CDI (salaire annuel)" },
  { value: "both", label: "Les deux" },
];

function profileToForm(p: CandidateProfile): FormFields {
  return {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    title: p.title ?? "",
    summary: p.summary ?? "",
    phone: p.phone ?? "",
    email_contact: p.email_contact ?? "",
    linkedin_url: p.linkedin_url ?? "",
    location: p.location ?? "",
    contract_type: p.contract_type,
    daily_rate: p.daily_rate !== null ? String(p.daily_rate) : "",
    annual_salary: p.annual_salary !== null ? String(p.annual_salary) : "",
  };
}

function formToPayload(f: FormFields): Record<string, unknown> {
  const showDaily =
    f.contract_type === "freelance" || f.contract_type === "both";
  const showSalary = f.contract_type === "cdi" || f.contract_type === "both";
  return {
    first_name: f.first_name || null,
    last_name: f.last_name || null,
    title: f.title || null,
    summary: f.summary || null,
    phone: f.phone || null,
    email_contact: f.email_contact || null,
    linkedin_url: f.linkedin_url || null,
    location: f.location || null,
    contract_type: f.contract_type,
    daily_rate: showDaily && f.daily_rate ? Number(f.daily_rate) : null,
    annual_salary:
      showSalary && f.annual_salary ? Number(f.annual_salary) : null,
  };
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((p) => setForm(profileToForm(p)))
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, []);

  function setField<K extends keyof FormFields>(k: K, v: FormFields[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        formToPayload(form),
      );
      setForm(profileToForm(updated));
      setMessage("Profil mis à jour");
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-muted-foreground">Chargement…</p>;

  const showDaily =
    form.contract_type === "freelance" || form.contract_type === "both";
  const showSalary =
    form.contract_type === "cdi" || form.contract_type === "both";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Mon profil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setField("first_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setField("last_name", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Titre</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="summary">Résumé</Label>
              <Input
                id="summary"
                value={form.summary}
                onChange={(e) => setField("summary", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email_contact">Email de contact</Label>
                <Input
                  id="email_contact"
                  type="email"
                  value={form.email_contact}
                  onChange={(e) => setField("email_contact", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin_url">LinkedIn URL</Label>
              <Input
                id="linkedin_url"
                type="url"
                value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Localisation</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contract_type">Type de contrat recherché</Label>
              <Select
                value={form.contract_type}
                onValueChange={(v) =>
                  v && setField("contract_type", v as ContractType)
                }
              >
                <SelectTrigger id="contract_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(showDaily || showSalary) && (
              <div className="grid grid-cols-2 gap-3">
                {showDaily && (
                  <div className="space-y-2">
                    <Label htmlFor="daily_rate">TJM (€)</Label>
                    <Input
                      id="daily_rate"
                      type="number"
                      min={0}
                      value={form.daily_rate}
                      onChange={(e) => setField("daily_rate", e.target.value)}
                    />
                  </div>
                )}
                {showSalary && (
                  <div className="space-y-2">
                    <Label htmlFor="annual_salary">
                      Salaire annuel brut (€)
                    </Label>
                    <Input
                      id="annual_salary"
                      type="number"
                      min={0}
                      value={form.annual_salary}
                      onChange={(e) =>
                        setField("annual_salary", e.target.value)
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Pourquoi ce design :** le Select pilote l'affichage conditionnel, `formToPayload` remet à `null` les champs monétaires non pertinents pour que la DB ne conserve pas un TJM obsolète si le candidat bascule sur `cdi`.

- [ ] **Step 2: Type-check**

Depuis `frontend/` :

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/profile/page.tsx
git commit -m "feat(frontend): add contract type selector with conditional daily rate/annual salary fields"
```

---

## Task 8: UI mapping — ajouter `annual_salary`

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx`

- [ ] **Step 1: Ajouter une entrée à `PROFILE_FIELDS`**

Dans [frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx](<frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx>), modifier `PROFILE_FIELDS` — insérer une ligne juste après celle de `daily_rate` (ligne 28) :

```tsx
  { value: "daily_rate", label: "TJM" },
  { value: "annual_salary", label: "Salaire annuel" },
```

**Note :** si le Plan P1.2 a déjà été mergé, les lignes `experience.context` / `experience.achievements` sont déjà présentes. Ne pas les enlever.

- [ ] **Step 2: Type-check + test manuel**

```bash
npx tsc --noEmit
npm run dev
```

Scénario :

1. Côté candidat : basculer sur `cdi`, renseigner un salaire annuel, sauvegarder.
2. Côté recruteur : créer un template contenant `{{SALAIRE}}`, le mapper sur **Salaire annuel**, générer pour le candidat ci-dessus → vérifier que `{{SALAIRE}}` est remplacé dans le docx.
3. Rebascule sur `freelance` côté candidat → le salaire est remis à `null` ; régénérer → le placeholder est remplacé par chaîne vide (comportement spec "Champ profil vide" de [la spec](docs/superpowers/specs/2026-04-14-jorg-mvp-design.md#L198)).

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/templates/\[id\]/page.tsx
git commit -m "feat(frontend): expose annual_salary in template mapping UI"
```

---

## Self-Review — Spec coverage

| Besoin utilisateur                                                    | Couvert par                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Candidat peut déclarer CDI / Freelance / Les deux                     | Task 1 (modèle), Task 2 (schéma), Task 7 (UI)                                  |
| TJM exposé si freelance/both, salaire si cdi/both, les deux si `both` | Task 7 (affichage conditionnel + `formToPayload`)                              |
| Recruteur peut mapper deux placeholders distincts                     | Task 3 (lookup) + Task 8 (UI mapping)                                          |
| Migration ne casse pas les profils existants                          | Task 1 Step 4 : `server_default="FREELANCE"` pendant la migration puis dropped |
| Données incohérentes nettoyées (ex: cdi avec TJM)                     | Task 7 `formToPayload` null-ifie le champ non pertinent                        |

**Placeholders scannés :** aucun. Types cohérents : `ContractType` utilisé partout (model Python, schéma Pydantic, type TS) ; `annual_salary` utilisé partout (column, schema, lookup, UI, mapping). Les identifiants ne divergent pas entre tâches.

## Notes pour Codex

- **Valeur par défaut `freelance`** : choix assumé (le MVP vient du monde freelance). Changeable plus tard sans migration en changeant juste le default SQLAlchemy.
- **Pas d'"unset" UI explicite** : un candidat qui veut sortir du rôle `cdi` choisit un autre type de contrat. Pas de state "je ne veux rien déclarer" (si un jour on le veut, ajouter une valeur `"unspecified"`).
- **Pas de contrainte DB TJM-requis-si-freelance** : le champ reste optionnel en DB pour rester tolérant au candidat qui rempli son profil en plusieurs étapes. Les templates qui mappent `daily_rate` sur un profil cdi retourneront simplement la chaîne vide (comportement spec).
- **Pas de refactor du lookup** : `_profile_flat` reste plat et statique, pas de dynamisme autour de `contract_type`. Plus simple, plus lisible pour un reviewer.
