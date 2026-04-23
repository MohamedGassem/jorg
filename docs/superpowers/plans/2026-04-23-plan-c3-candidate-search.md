# C3 — Recherche & filtrage candidats côté recruteur

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au recruteur de filtrer la liste des candidats accessibles par disponibilité, mode de travail, type de contrat, TJM max, compétence, localisation, domaine et recherche full-text.

**Architecture:** Extension de `GET /organizations/{org_id}/candidates` avec query params optionnels. Filtrage 100% SQL via `WHERE` additives et `EXISTS` sur la table `skills`. Debounce 300ms côté frontend. Prérequis : C1 mergé (champs `availability_status`, `work_mode`, `preferred_domains` sur `CandidateProfile`).

**Tech Stack:** Python 3.14, FastAPI Query params, SQLAlchemy 2 async, Next.js 15 + shadcn/ui, pytest + testcontainers.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section C3)

**Prérequis:** Plan C1 mergé (colonnes `availability_status`, `work_mode`, `preferred_domains`, `location_preference` sur `candidate_profiles`).

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/services/recruiter_service.py` | MODIFY | Ajouter paramètres de filtre à `list_accessible_candidates` |
| `backend/schemas/recruiter.py` | MODIFY | Enrichir `AccessibleCandidateRead` avec les champs C1 |
| `backend/api/routes/organizations.py` | MODIFY | Ajouter query params à `list_accessible_candidates` |
| `backend/tests/integration/test_recruiter_api.py` | MODIFY | Tests des filtres |
| `frontend/app/(recruiter)/recruiter/candidates/page.tsx` | MODIFY | Barre de filtres + debounce |
| `frontend/types/api.ts` | MODIFY | Enrichir `AccessibleCandidateRead` |

---

### Task 1 : Backend — service de filtrage

**Files:**
- Modify: `backend/services/recruiter_service.py`
- Modify: `backend/schemas/recruiter.py`

- [ ] **Step 1 : Écrire les tests de filtrage**

Ouvrir `backend/tests/integration/test_recruiter_api.py`. Ajouter à la fin :

```python
async def test_filter_candidates_by_availability(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    """Candidates with 'available_now' appear when filter matches."""
    # Setup org + invite + accept
    org_r = await client.post("/organizations", json={"name": "Filter Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    # Set candidate availability
    await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"availability_status": "available_now"},
    )

    # Invite and accept
    await client.post(
        "/invitations",
        json={"candidate_email": "candidate@test.com", "organization_id": org_id},
        headers=recruiter_headers,
    )
    inv_r = await client.get("/candidates/me/invitations", headers=candidate_headers)
    token = inv_r.json()[0]["token"]
    await client.post(f"/invitations/accept/{token}", headers=candidate_headers)

    r = await client.get(
        f"/organizations/{org_id}/candidates?availability_status=available_now",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get(
        f"/organizations/{org_id}/candidates?availability_status=not_available",
        headers=recruiter_headers,
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 0


async def test_filter_candidates_by_skill(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    org_r = await client.post("/organizations", json={"name": "Skill Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    # Add skill to candidate
    await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language"},
    )

    # Invite + accept
    await client.post(
        "/invitations",
        json={"candidate_email": "candidate@test.com", "organization_id": org_id},
        headers=recruiter_headers,
    )
    inv_r = await client.get("/candidates/me/invitations", headers=candidate_headers)
    token = inv_r.json()[0]["token"]
    await client.post(f"/invitations/accept/{token}", headers=candidate_headers)

    r = await client.get(
        f"/organizations/{org_id}/candidates?skill=python",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get(
        f"/organizations/{org_id}/candidates?skill=java",
        headers=recruiter_headers,
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 0


async def test_filter_candidates_by_max_daily_rate(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    org_r = await client.post("/organizations", json={"name": "Rate Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    await client.put("/candidates/me/profile", headers=candidate_headers, json={"daily_rate": 700})

    await client.post(
        "/invitations",
        json={"candidate_email": "candidate@test.com", "organization_id": org_id},
        headers=recruiter_headers,
    )
    inv_r = await client.get("/candidates/me/invitations", headers=candidate_headers)
    token = inv_r.json()[0]["token"]
    await client.post(f"/invitations/accept/{token}", headers=candidate_headers)

    r = await client.get(
        f"/organizations/{org_id}/candidates?max_daily_rate=800",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get(
        f"/organizations/{org_id}/candidates?max_daily_rate=600",
        headers=recruiter_headers,
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 0
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
uv run pytest tests/integration/test_recruiter_api.py -k "filter_candidates" -v
```

Résultat attendu : FAIL (query params ignorés, filtre pas encore implémenté).

- [ ] **Step 3 : Enrichir `AccessibleCandidateRead` dans `schemas/recruiter.py`**

Ouvrir `backend/schemas/recruiter.py`. Repérer `AccessibleCandidateRead` et ajouter les champs C1 :

```python
from models.candidate_profile import AvailabilityStatus, ContractType, WorkMode

class AccessibleCandidateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    title: str | None = None
    daily_rate: int | None = None
    contract_type: ContractType | None = None
    availability_status: AvailabilityStatus | None = None
    work_mode: WorkMode | None = None
    location_preference: str | None = None
    preferred_domains: list[str] | None = None
```

- [ ] **Step 4 : Mettre à jour `list_accessible_candidates` dans `recruiter_service.py`**

Remplacer la fonction existante `list_accessible_candidates` par :

```python
async def list_accessible_candidates(
    db: AsyncSession,
    organization_id: UUID,
    *,
    availability_status: str | None = None,
    work_mode: str | None = None,
    contract_type: str | None = None,
    max_daily_rate: int | None = None,
    skill: str | None = None,
    location: str | None = None,
    domain: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    """Return candidates with active AccessGrant matching optional filters."""
    from models.candidate_profile import CandidateProfile, Skill
    from models.invitation import AccessGrant, AccessGrantStatus
    from models.user import User
    from sqlalchemy import and_, exists, func

    stmt = (
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
    )

    if availability_status:
        stmt = stmt.where(CandidateProfile.availability_status == availability_status)
    if work_mode:
        stmt = stmt.where(CandidateProfile.work_mode == work_mode)
    if contract_type:
        stmt = stmt.where(CandidateProfile.contract_type == contract_type)
    if max_daily_rate is not None:
        stmt = stmt.where(
            (CandidateProfile.daily_rate == None) | (CandidateProfile.daily_rate <= max_daily_rate)
        )
    if skill:
        stmt = stmt.where(
            exists(
                select(Skill.id).where(
                    Skill.profile_id == CandidateProfile.id,
                    func.lower(Skill.name).contains(skill.lower()),
                )
            )
        )
    if location:
        stmt = stmt.where(
            CandidateProfile.location_preference.ilike(f"%{location}%")
        )
    if domain:
        from sqlalchemy.dialects.postgresql import array
        stmt = stmt.where(
            CandidateProfile.preferred_domains.contains(array([domain]))
        )
    if q:
        q_like = f"%{q}%"
        from sqlalchemy import or_
        stmt = stmt.where(
            or_(
                CandidateProfile.title.ilike(q_like),
                CandidateProfile.summary.ilike(q_like),
            )
        )

    stmt = stmt.order_by(
        CandidateProfile.last_name.nulls_last(),
        CandidateProfile.first_name.nulls_last(),
    )
    result = await db.execute(stmt)
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

- [ ] **Step 5 : Ajouter les query params dans la route**

Ouvrir `backend/api/routes/organizations.py`. Remplacer l'endpoint `list_accessible_candidates` :

```python
from fastapi import Query

@router.get("/{org_id}/candidates", response_model=list[AccessibleCandidateRead])
async def list_accessible_candidates(
    org_id: UUID,
    current_user: RecruiterUser,
    db: DB,
    availability_status: str | None = Query(default=None),
    work_mode: str | None = Query(default=None),
    contract_type: str | None = Query(default=None),
    max_daily_rate: int | None = Query(default=None),
    skill: str | None = Query(default=None),
    location: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[dict[str, object]]:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    return await recruiter_service.list_accessible_candidates(
        db,
        org_id,
        availability_status=availability_status,
        work_mode=work_mode,
        contract_type=contract_type,
        max_daily_rate=max_daily_rate,
        skill=skill,
        location=location,
        domain=domain,
        q=q,
    )
```

- [ ] **Step 6 : Vérifier que les tests passent**

```bash
uv run pytest tests/integration/test_recruiter_api.py -k "filter_candidates" -v
```

Résultat attendu : 3 tests PASSED.

- [ ] **Step 7 : Vérifier la suite complète**

```bash
uv run pytest tests/ -v --tb=short
```

- [ ] **Step 8 : Commit**

```bash
git add backend/services/recruiter_service.py backend/schemas/recruiter.py \
        backend/api/routes/organizations.py backend/tests/integration/test_recruiter_api.py
git commit -m "feat(c3): add candidate filtering query params to list_accessible_candidates"
```

---

### Task 2 : Frontend — barre de filtres

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/app/(recruiter)/recruiter/candidates/page.tsx`

- [ ] **Step 1 : Enrichir `AccessibleCandidateRead` dans `frontend/types/api.ts`**

Repérer l'interface `AccessibleCandidateRead` (ou équivalent) et ajouter :

```typescript
export interface AccessibleCandidateRead {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  daily_rate: number | null;
  contract_type: "freelance" | "cdi" | "both" | null;
  availability_status: AvailabilityStatus | null;
  work_mode: WorkMode | null;
  location_preference: string | null;
  preferred_domains: string[] | null;
}
```

- [ ] **Step 2 : Réécrire la page `/recruiter/candidates` avec filtres**

Ouvrir `frontend/app/(recruiter)/recruiter/candidates/page.tsx`. Ajouter les états de filtres et le debounce :

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { AccessibleCandidateRead, RecruiterProfile } from "@/types/api";

const EMPTY_FILTERS = {
  availability_status: "",
  work_mode: "",
  contract_type: "",
  max_daily_rate: "",
  skill: "",
  location: "",
  domain: "",
  q: "",
};

export default function CandidatesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AccessibleCandidateRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCandidates = useCallback(
    async (currentOrgId: string, currentFilters: typeof EMPTY_FILTERS) => {
      const params = new URLSearchParams();
      Object.entries(currentFilters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const qs = params.toString();
      const url = `/organizations/${currentOrgId}/candidates${qs ? `?${qs}` : ""}`;
      try {
        const data = await api.get<AccessibleCandidateRead[]>(url);
        setCandidates(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Erreur de chargement");
      }
    },
    []
  );

  useEffect(() => {
    api
      .get<RecruiterProfile>("/recruiters/me/profile")
      .then((p) => {
        setOrgId(p.organization_id);
        if (p.organization_id) {
          return fetchCandidates(p.organization_id, EMPTY_FILTERS);
        }
      })
      .finally(() => setLoading(false));
  }, [fetchCandidates]);

  function handleFilterChange(key: keyof typeof EMPTY_FILTERS, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (!orgId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const isText = ["skill", "location", "q"].includes(key);
    if (isText) {
      debounceRef.current = setTimeout(() => fetchCandidates(orgId, next), 300);
    } else {
      fetchCandidates(orgId, next);
    }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    if (orgId) fetchCandidates(orgId, EMPTY_FILTERS);
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId) return <p className="text-muted-foreground">Associez-vous à une organisation d&apos;abord.</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Candidats accessibles</h1>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Disponibilité</Label>
              <Select value={filters.availability_status} onValueChange={(v) => handleFilterChange("availability_status", v)}>
                <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toutes</SelectItem>
                  <SelectItem value="available_now">Disponible maintenant</SelectItem>
                  <SelectItem value="available_from">Disponible prochainement</SelectItem>
                  <SelectItem value="not_available">Non disponible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mode de travail</Label>
              <Select value={filters.work_mode} onValueChange={(v) => handleFilterChange("work_mode", v)}>
                <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="remote">Télétravail</SelectItem>
                  <SelectItem value="onsite">Présentiel</SelectItem>
                  <SelectItem value="hybrid">Hybride</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Contrat</Label>
              <Select value={filters.contract_type} onValueChange={(v) => handleFilterChange("contract_type", v)}>
                <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="freelance">Freelance</SelectItem>
                  <SelectItem value="cdi">CDI</SelectItem>
                  <SelectItem value="both">Les deux</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>TJM max (€/j)</Label>
              <Input
                type="number"
                placeholder="ex: 800"
                value={filters.max_daily_rate}
                onChange={(e) => handleFilterChange("max_daily_rate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Compétence</Label>
              <Input
                placeholder="ex: Python"
                value={filters.skill}
                onChange={(e) => handleFilterChange("skill", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Localisation</Label>
              <Input
                placeholder="ex: Paris"
                value={filters.location}
                onChange={(e) => handleFilterChange("location", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Domaine</Label>
              <Select value={filters.domain} onValueChange={(v) => handleFilterChange("domain", v)}>
                <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  {["finance","retail","industry","public","health","tech","telecom","energy","other"].map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Recherche libre</Label>
              <Input
                placeholder="titre, résumé…"
                value={filters.q}
                onChange={(e) => handleFilterChange("q", e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{candidates.length} candidat{candidates.length > 1 ? "s" : ""}</span>
            <Button variant="outline" size="sm" onClick={resetFilters}>Réinitialiser</Button>
          </div>
        </CardContent>
      </Card>

      {/* Candidate list */}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {candidates.length === 0 ? (
        <p className="text-muted-foreground">Aucun candidat ne correspond aux filtres.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {candidates.map((c) => (
            <li key={c.user_id}>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">
                    {c.first_name && c.last_name
                      ? `${c.first_name} ${c.last_name}`
                      : c.email}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  {c.title && <p>{c.title}</p>}
                  <div className="flex flex-wrap gap-3">
                    {c.daily_rate && <span>TJM : {c.daily_rate} €/j</span>}
                    {c.availability_status && <span>Dispo : {c.availability_status}</span>}
                    {c.work_mode && <span>{c.work_mode}</span>}
                  </div>
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

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Résultat attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add frontend/types/api.ts frontend/app/\(recruiter\)/recruiter/candidates/page.tsx
git commit -m "feat(c3): add candidate filter bar with debounce in recruiter UI"
```
