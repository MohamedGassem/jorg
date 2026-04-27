# P1.1 — Liste des candidats accessibles côté recruteur

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un recruteur de voir la liste des candidats qui ont accordé un accès actif à son organisation, et de sélectionner un candidat par nom (plutôt que de taper un UUID) sur la page "Générer".

**Architecture:** Un nouvel endpoint `GET /organizations/{org_id}/candidates` joint `AccessGrant` (statut `active`) et `CandidateProfile` pour exposer une liste minimale `{ user_id, first_name, last_name, email }`. Côté frontend, la page `candidates` affiche cette liste (remplaçant le placeholder actuel) et la page `generate` utilise une recherche filtrable simple (Input + liste filtrée) à la place du champ UUID libre. Aucun nouveau composant shadcn n'est ajouté — on reste sur `Input` + un `<ul>` filtré pour éviter une dépendance `cmdk`.

**Tech Stack:** FastAPI + SQLAlchemy 2 async (backend), Next.js 15 App Router + shadcn/ui (frontend). pytest + testcontainers (tests backend).

**Prerequisite:**

- Modèles `AccessGrant`, `CandidateProfile`, `User` existants (Plans 2 et 4).
- Endpoint `GET /organizations/{org_id}` et garde `_require_org_membership` existants dans [backend/api/routes/organizations.py](backend/api/routes/organizations.py).

---

## File Structure

| File                                                     | Action | Purpose                                                |
| -------------------------------------------------------- | ------ | ------------------------------------------------------ |
| `backend/schemas/recruiter.py`                           | Modify | Ajouter `AccessibleCandidateRead`                      |
| `backend/services/recruiter_service.py`                  | Modify | Ajouter `list_accessible_candidates(db, org_id)`       |
| `backend/api/routes/organizations.py`                    | Modify | Ajouter route `GET /organizations/{org_id}/candidates` |
| `backend/tests/integration/test_recruiter_api.py`        | Modify | Ajouter tests de l'endpoint                            |
| `frontend/types/api.ts`                                  | Modify | Ajouter `AccessibleCandidate`                          |
| `frontend/app/(recruiter)/recruiter/candidates/page.tsx` | Modify | Afficher la liste au lieu du placeholder               |
| `frontend/app/(recruiter)/recruiter/generate/page.tsx`   | Modify | Remplacer le champ UUID par une recherche filtrable    |

---

## Task 1: Schéma Pydantic `AccessibleCandidateRead`

**Files:**

- Modify: `backend/schemas/recruiter.py`

- [ ] **Step 1: Lire le fichier existant**

Depuis la racine :

```bash
cat backend/schemas/recruiter.py
```

But : repérer les imports et le style utilisé (ConfigDict, UUID, etc.) pour rester cohérent.

- [ ] **Step 2: Ajouter le schéma au bas du fichier**

Ajouter ces lignes à la fin de [backend/schemas/recruiter.py](backend/schemas/recruiter.py) (conserver tous les imports existants, ajouter ceux manquants en tête du fichier) :

```python
class AccessibleCandidateRead(BaseModel):
    """Candidate exposed to a recruiter via an active AccessGrant."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
```

Si `UUID`, `BaseModel` ou `ConfigDict` ne sont pas déjà importés, ajouter :

```python
from uuid import UUID
from pydantic import BaseModel, ConfigDict
```

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/recruiter.py
git commit -m "feat(backend): add AccessibleCandidateRead schema"
```

---

## Task 2: Test d'intégration (TDD — phase rouge)

**Files:**

- Modify: `backend/tests/integration/test_recruiter_api.py`

- [ ] **Step 1: Ajouter un test qui échoue**

Ajouter à la fin de [backend/tests/integration/test_recruiter_api.py](backend/tests/integration/test_recruiter_api.py) :

```python
# ---- Accessible candidates --------------------------------------------------


async def test_list_accessible_candidates_empty(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Access Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )

    r = await client.get(
        f"/organizations/{org_id}/candidates", headers=recruiter_headers
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_list_accessible_candidates_returns_granted(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    # 1. Recruiter creates org, links to it
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Access Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )

    # 2. Candidate updates their profile with a name
    await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"first_name": "Alice", "last_name": "Dupont"},
    )

    # 3. Recruiter invites candidate
    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    token = inv.json()["token"]

    # 4. Candidate accepts
    r = await client.post(
        f"/invitations/{token}/accept", headers=candidate_headers
    )
    assert r.status_code == 201

    # 5. Recruiter lists accessible candidates
    r = await client.get(
        f"/organizations/{org_id}/candidates", headers=recruiter_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["email"] == "candidate@test.com"
    assert data[0]["first_name"] == "Alice"
    assert data[0]["last_name"] == "Dupont"
    assert "user_id" in data[0]


async def test_list_accessible_candidates_excludes_revoked(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Access Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    accepted = await client.post(
        f"/invitations/{inv.json()['token']}/accept", headers=candidate_headers
    )
    grant_id = accepted.json()["id"]

    # Candidate revokes
    await client.delete(f"/access/me/{grant_id}", headers=candidate_headers)

    r = await client.get(
        f"/organizations/{org_id}/candidates", headers=recruiter_headers
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_list_accessible_candidates_requires_membership(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    # Create org but do NOT link recruiter to it
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Other Org"}
    )
    org_id = org.json()["id"]

    r = await client.get(
        f"/organizations/{org_id}/candidates", headers=recruiter_headers
    )
    assert r.status_code == 403


async def test_list_accessible_candidates_forbids_candidate_role(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get(
        "/organizations/00000000-0000-0000-0000-000000000000/candidates",
        headers=candidate_headers,
    )
    assert r.status_code == 403
```

- [ ] **Step 2: Exécuter, vérifier que les tests échouent**

Depuis `backend/` :

```bash
uv run pytest tests/integration/test_recruiter_api.py::test_list_accessible_candidates_empty tests/integration/test_recruiter_api.py::test_list_accessible_candidates_returns_granted tests/integration/test_recruiter_api.py::test_list_accessible_candidates_excludes_revoked tests/integration/test_recruiter_api.py::test_list_accessible_candidates_requires_membership tests/integration/test_recruiter_api.py::test_list_accessible_candidates_forbids_candidate_role -v
```

Expected: 5 FAIL — 404 (route absente) sur la plupart.

---

## Task 3: Service `list_accessible_candidates`

**Files:**

- Modify: `backend/services/recruiter_service.py`

- [ ] **Step 1: Ajouter la fonction service**

Ajouter à la fin de [backend/services/recruiter_service.py](backend/services/recruiter_service.py) :

```python
async def list_accessible_candidates(
    db: AsyncSession, organization_id: UUID
) -> list[dict]:
    """Return minimal info for all candidates with an active AccessGrant on this org.

    Joins AccessGrant (status=active) + User + CandidateProfile (left join, profile
    may be empty with no name). Returns plain dicts matching AccessibleCandidateRead.
    """
    from models.candidate_profile import CandidateProfile
    from models.invitation import AccessGrant, AccessGrantStatus
    from models.user import User

    stmt = (
        select(
            User.id.label("user_id"),
            User.email,
            CandidateProfile.first_name,
            CandidateProfile.last_name,
        )
        .join(AccessGrant, AccessGrant.candidate_id == User.id)
        .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
        .where(
            AccessGrant.organization_id == organization_id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
        .order_by(CandidateProfile.last_name.nulls_last(), CandidateProfile.first_name.nulls_last())
    )
    result = await db.execute(stmt)
    return [
        {
            "user_id": row.user_id,
            "email": row.email,
            "first_name": row.first_name,
            "last_name": row.last_name,
        }
        for row in result.all()
    ]
```

Vérifier que les imports existants en tête du fichier incluent déjà `select` et `AsyncSession` ; sinon, ajouter :

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
```

Les imports internes (`CandidateProfile`, `AccessGrant`, `User`) sont faits **à l'intérieur de la fonction** pour éviter tout cycle d'import entre `recruiter_service` et `invitation_service` (même pattern que `generation_service.list_candidate_documents`).

- [ ] **Step 2: Commit**

```bash
git add backend/services/recruiter_service.py
git commit -m "feat(backend): add list_accessible_candidates service"
```

---

## Task 4: Route `GET /organizations/{org_id}/candidates`

**Files:**

- Modify: `backend/api/routes/organizations.py`

- [ ] **Step 1: Ajouter la route**

Ajouter dans [backend/api/routes/organizations.py](backend/api/routes/organizations.py), juste après `get_organization` (autour de la ligne 55), avant la section `# ---- Templates` :

```python
@router.get("/{org_id}/candidates", response_model=list[AccessibleCandidateRead])
async def list_accessible_candidates(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[dict]:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    return await recruiter_service.list_accessible_candidates(db, org_id)
```

Ajouter l'import en haut du fichier :

```python
from schemas.recruiter import AccessibleCandidateRead, OrganizationCreate, OrganizationRead
```

(remplacer l'import existant, ne pas dupliquer `OrganizationCreate`/`OrganizationRead`).

- [ ] **Step 2: Exécuter les tests, vérifier qu'ils passent**

```bash
uv run pytest tests/integration/test_recruiter_api.py -v
```

Expected: les 5 nouveaux tests PASSent, pas de régression sur les autres.

- [ ] **Step 3: Lint backend**

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy .
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/api/routes/organizations.py backend/tests/integration/test_recruiter_api.py
git commit -m "feat(backend): add GET /organizations/{org_id}/candidates endpoint"
```

---

## Task 5: Type TypeScript `AccessibleCandidate`

**Files:**

- Modify: `frontend/types/api.ts`

- [ ] **Step 1: Ajouter le type**

Ajouter à la fin de [frontend/types/api.ts](frontend/types/api.ts), avant `export interface ApiError` :

```ts
export interface AccessibleCandidate {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/types/api.ts
git commit -m "feat(frontend): add AccessibleCandidate type"
```

---

## Task 6: Page `/recruiter/candidates` — liste réelle

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/candidates/page.tsx`

- [ ] **Step 1: Remplacer la page par la version qui charge et affiche la liste**

Remplacer **tout le contenu** de [frontend/app/(recruiter)/recruiter/candidates/page.tsx](<frontend/app/(recruiter)/recruiter/candidates/page.tsx>) par :

```tsx
// frontend/app/(recruiter)/recruiter/candidates/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { AccessibleCandidate, RecruiterProfile } from "@/types/api";

function displayName(c: AccessibleCandidate): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || c.email;
}

export default function CandidatesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AccessibleCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await api.get<RecruiterProfile>(
          "/recruiters/me/profile",
        );
        if (cancelled) return;
        setOrgId(profile.organization_id);
        if (!profile.organization_id) return;
        const list = await api.get<AccessibleCandidate[]>(
          `/organizations/${profile.organization_id}/candidates`,
        );
        if (!cancelled) setCandidates(list);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.detail : "Erreur de chargement",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez votre compte à une organisation.
      </p>
    );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Candidats avec accès</h1>
      <p className="text-muted-foreground">
        Pour générer un dossier, rendez-vous sur la page{" "}
        <Link href="/recruiter/generate" className="underline">
          Générer
        </Link>
        .
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle>{candidates.length} candidat(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {candidates.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              Aucun candidat n'a encore accepté votre invitation.
            </p>
          )}
          {candidates.map((c) => (
            <div
              key={c.user_id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="space-y-0.5">
                <p className="font-medium">{displayName(c)}</p>
                <p className="text-xs text-muted-foreground">{c.email}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Vérification type-check**

Depuis `frontend/` :

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/candidates/page.tsx
git commit -m "feat(frontend): list accessible candidates on recruiter candidates page"
```

---

## Task 7: Page `/recruiter/generate` — combobox filtrable

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/generate/page.tsx`

- [ ] **Step 1: Remplacer entièrement la page**

Remplacer le contenu de [frontend/app/(recruiter)/recruiter/generate/page.tsx](<frontend/app/(recruiter)/recruiter/generate/page.tsx>) par :

```tsx
// frontend/app/(recruiter)/recruiter/generate/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type {
  AccessibleCandidate,
  GeneratedDocument,
  RecruiterProfile,
  Template,
} from "@/types/api";

function candidateLabel(c: AccessibleCandidate): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full ? `${full} (${c.email})` : c.email;
}

export default function GeneratePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [candidates, setCandidates] = useState<AccessibleCandidate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await api.get<RecruiterProfile>(
          "/recruiters/me/profile",
        );
        if (cancelled) return;
        setOrgId(profile.organization_id);
        if (!profile.organization_id) return;
        const [tmpls, cands] = await Promise.all([
          api.get<Template[]>(
            `/organizations/${profile.organization_id}/templates`,
          ),
          api.get<AccessibleCandidate[]>(
            `/organizations/${profile.organization_id}/candidates`,
          ),
        ]);
        if (cancelled) return;
        setTemplates(tmpls.filter((t) => t.is_valid));
        setCandidates(cands);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.detail : "Erreur de chargement",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.user_id === candidateId) ?? null,
    [candidates, candidateId],
  );

  const filteredCandidates = useMemo(() => {
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      candidateLabel(c).toLowerCase().includes(q),
    );
  }, [candidates, candidateQuery]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !templateId || !candidateId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const doc = await api.post<GeneratedDocument>(
        `/organizations/${orgId}/generate`,
        {
          candidate_id: candidateId,
          template_id: templateId,
          format,
        },
      );
      setResult(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur de génération");
    } finally {
      setGenerating(false);
    }
  }

  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez votre compte à une organisation.
      </p>
    );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Générer un dossier</h1>
      <Card>
        <CardHeader>
          <CardTitle>Paramètres de génération</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="candidate-search">Candidat</Label>
              <Input
                id="candidate-search"
                placeholder="Rechercher par nom ou email…"
                value={
                  selectedCandidate
                    ? candidateLabel(selectedCandidate)
                    : candidateQuery
                }
                onChange={(e) => {
                  setCandidateId("");
                  setCandidateQuery(e.target.value);
                }}
                aria-autocomplete="list"
                aria-expanded={
                  !selectedCandidate && filteredCandidates.length > 0
                }
              />
              {!selectedCandidate && candidateQuery && (
                <ul
                  role="listbox"
                  className="max-h-48 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
                >
                  {filteredCandidates.length === 0 && (
                    <li className="px-2 py-1.5 text-muted-foreground">
                      Aucun candidat ne correspond.
                    </li>
                  )}
                  {filteredCandidates.map((c) => (
                    <li key={c.user_id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          setCandidateId(c.user_id);
                          setCandidateQuery("");
                        }}
                      >
                        <span className="font-medium">{candidateLabel(c)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedCandidate && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => {
                    setCandidateId("");
                    setCandidateQuery("");
                  }}
                >
                  Changer de candidat
                </button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select
                value={templateId}
                onValueChange={(v) => v && setTemplateId(v)}
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder="Choisir un template valide…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <Select
                value={format}
                onValueChange={(v) => v && setFormat(v as "docx" | "pdf")}
              >
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={generating || !templateId || !candidateId}
            >
              {generating ? "Génération…" : "Générer le dossier"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-sm text-green-600 font-medium">
              Dossier généré avec succès !
            </p>
            <Button asChild variant="outline">
              <a
                href={api.downloadUrl(`/documents/${result.id}/download`)}
                download
              >
                Télécharger ({result.file_format.toUpperCase()})
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Notes de design :**

- Pas de dépendance `cmdk` — un simple `Input` + `<ul>` filtré en local, cohérent avec le reste de l'UI (même approche que les formulaires existants dans [skills/page.tsx](<frontend/app/(candidate)/candidate/skills/page.tsx>)).
- Le bouton **Générer** est désactivé tant que `candidateId` (issu d'un clic dans la liste) n'est pas présent — on ne laisse pas un UUID libre passer.
- `selectedCandidate` affiche le label dans l'input une fois un candidat choisi, avec un lien pour en changer.

- [ ] **Step 2: Type-check**

Depuis `frontend/` :

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Vérification manuelle en navigateur**

```bash
npm run dev
```

Scénario à tester :

1. Se connecter comme recruteur **sans** aucun candidat : la liste est vide, le bouton reste désactivé.
2. Inviter un candidat, se connecter côté candidat, accepter. Retourner côté recruteur sur `/recruiter/candidates` → le candidat apparaît. Sur `/recruiter/generate`, taper quelques lettres du prénom → la liste se filtre → cliquer → l'input se met à jour → choisir un template → Générer fonctionne.
3. Révoquer l'accès côté candidat → retour recruteur : le candidat disparaît des deux pages.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/generate/page.tsx
git commit -m "feat(frontend): replace UUID input with searchable candidate list on generate page"
```

---

## Self-Review — Spec coverage

| Besoin utilisateur                                             | Couvert par                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| Endpoint backend listant les candidats avec AccessGrant actif  | Tasks 1-4                                                   |
| Page "Candidats" affiche la liste réelle                       | Task 6                                                      |
| Page "Générer" avec recherche par nom (plus d'UUID à taper)    | Task 7                                                      |
| Pas de fuite transverse (recruteur ne voit que sa propre orga) | `_require_org_membership` réutilisé en Task 4 + test Task 2 |
| Grants révoqués exclus                                         | Requête filtrée + test dédié Task 2                         |

**Pas de placeholder détecté.** Pas de référence à des symboles non définis. Les noms (`AccessibleCandidate`, `AccessibleCandidateRead`, `list_accessible_candidates`, `candidateLabel`) sont cohérents sur les tâches 1, 3, 4, 5, 6, 7.

## Notes pour Codex

- **Hors scope de ce plan** : pagination de la liste (volume attendu faible au MVP, `order_by` suffit) ; cache côté frontend (SWR, React Query) ; invalidation cross-tab. À rajouter si un vrai besoin d'échelle apparaît.
- **Choix de l'`outerjoin` sur `CandidateProfile`** : un candidat peut avoir accordé l'accès avant d'avoir rempli son profil (le profil est créé lazy via `get_or_create_profile`). On retombe alors sur l'email comme label.
- **Pas de composant `Combobox` shadcn** : intentionnel — éviter une nouvelle dépendance (`cmdk`) pour un cas simple ; le pattern `Input + ul filtré` reste maintenable et accessible (roles `listbox`/`option`).
