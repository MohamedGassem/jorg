# C2 — Timeline des interactions candidat ↔ organisations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer via `GET /candidates/me/organizations` une vue par organisation de toutes les interactions du candidat (invitations, grants, documents générés), et enrichir la page `/candidate/access` avec ces données.

**Architecture:** Pas de nouvelle table DB. L'endpoint reconstruit la timeline à la lecture depuis `Invitation`, `AccessGrant`, `GeneratedDocument`. La page `/candidate/access` est enrichie pour afficher toutes les orgas (pas seulement celles avec accès actif) avec un accordéon d'événements.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2 async, Pydantic v2, Next.js 15 + shadcn/ui Accordion, pytest + testcontainers.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section C2)

**Prérequis:** Plans 1–6 + P0/P1/P2 mergés. Toutes les commandes backend depuis `backend/`.

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/schemas/candidate.py` | MODIFY | Ajouter InteractionEvent + OrganizationInteractionCard |
| `backend/api/routes/candidates.py` | MODIFY | Ajouter GET /candidates/me/organizations |
| `backend/tests/integration/test_candidate_api.py` | MODIFY | Tests du nouvel endpoint |
| `frontend/app/(candidate)/candidate/access/page.tsx` | MODIFY | Enrichir avec accordéon timeline |
| `frontend/types/api.ts` | MODIFY | Ajouter OrganizationInteractionCard + InteractionEvent |

---

### Task 1 : Schémas Pydantic

**Files:**
- Modify: `backend/schemas/candidate.py`

- [ ] **Step 1 : Ajouter les schémas de timeline à la fin de `schemas/candidate.py`**

```python
# ---- Interaction timeline ----------------------------------------------------

from datetime import datetime
from typing import Literal

InteractionEventType = Literal[
    "invitation_sent",
    "invitation_accepted",
    "invitation_rejected",
    "invitation_expired",
    "access_granted",
    "access_revoked",
    "document_generated",
]

OrganizationStatus = Literal["invited", "active", "revoked", "expired"]


class InteractionEventMetadata(BaseModel):
    template_name: str | None = None
    file_format: str | None = None


class InteractionEvent(BaseModel):
    type: InteractionEventType
    occurred_at: datetime
    metadata: InteractionEventMetadata = InteractionEventMetadata()


class OrganizationInteractionCard(BaseModel):
    organization_id: UUID
    organization_name: str
    logo_url: str | None
    current_status: OrganizationStatus
    events: list[InteractionEvent]
```

- [ ] **Step 2 : Commit**

```bash
git add backend/schemas/candidate.py
git commit -m "feat(c2): add interaction timeline schemas"
```

---

### Task 2 : Endpoint `GET /candidates/me/organizations`

**Files:**
- Modify: `backend/api/routes/candidates.py`

- [ ] **Step 1 : Écrire les tests en premier**

Ouvrir `backend/tests/integration/test_candidate_api.py`. Ajouter à la fin :

```python
async def test_organizations_empty_for_new_candidate(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/organizations", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_organizations_shows_org_after_invitation(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    # Setup: recruiter creates org and invites candidate
    org_r = await client.post("/organizations", json={"name": "Acme"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    cand_login = await client.post("/auth/login", json={"email": "candidate@test.com", "password": "testpass123"})
    cand_email = "candidate@test.com"

    await client.post(
        "/invitations",
        json={"candidate_email": cand_email, "organization_id": org_id},
        headers=recruiter_headers,
    )

    r = await client.get("/candidates/me/organizations", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    card = data[0]
    assert card["organization_name"] == "Acme"
    assert card["current_status"] == "invited"
    assert any(e["type"] == "invitation_sent" for e in card["events"])


async def test_organizations_requires_candidate_role(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/organizations", headers=recruiter_headers)
    assert r.status_code == 403
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
uv run pytest tests/integration/test_candidate_api.py -k "organizations" -v
```

Résultat attendu : FAIL (endpoint absent, 404).

- [ ] **Step 3 : Implémenter l'endpoint dans `candidates.py`**

Ajouter les imports manquants en haut de `api/routes/candidates.py` :

```python
from schemas.candidate import OrganizationInteractionCard
```

À la fin du fichier, après les routes RGPD, ajouter :

```python
# ---- Interaction timeline ---------------------------------------------------


@router.get("/me/organizations", response_model=list[OrganizationInteractionCard])
async def list_my_organizations(
    current_user: CandidateUser, db: DB
) -> list[OrganizationInteractionCard]:
    from datetime import UTC, datetime
    from sqlalchemy import or_
    from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
    from models.generated_document import GeneratedDocument
    from models.recruiter import Organization
    from models.template import Template
    from schemas.candidate import (
        InteractionEvent,
        InteractionEventMetadata,
        OrganizationInteractionCard,
    )

    # 1. Fetch all invitations for this candidate (by id or email)
    inv_result = await db.execute(
        select(Invitation, Organization)
        .join(Organization, Organization.id == Invitation.organization_id)
        .where(
            or_(
                Invitation.candidate_id == current_user.id,
                Invitation.candidate_email == current_user.email,
            )
        )
    )
    invitations = inv_result.all()

    # 2. Fetch all access grants
    grant_result = await db.execute(
        select(AccessGrant, Organization)
        .join(Organization, Organization.id == AccessGrant.organization_id)
        .where(AccessGrant.candidate_id == current_user.id)
    )
    grants = grant_result.all()

    # 3. Fetch generated documents linked to these grants
    grant_ids = [g.AccessGrant.id for g in grants]
    doc_rows = []
    if grant_ids:
        doc_result = await db.execute(
            select(GeneratedDocument, Template)
            .join(Template, Template.id == GeneratedDocument.template_id)
            .where(GeneratedDocument.access_grant_id.in_(grant_ids))
        )
        doc_rows = doc_result.all()

    # 4. Build org map
    orgs: dict[str, dict] = {}

    for inv, org in invitations:
        oid = str(org.id)
        if oid not in orgs:
            orgs[oid] = {"org": org, "events": [], "grants": []}
        event_type_map = {
            InvitationStatus.PENDING: "invitation_sent",
            InvitationStatus.ACCEPTED: "invitation_accepted",
            InvitationStatus.REJECTED: "invitation_rejected",
            InvitationStatus.EXPIRED: "invitation_expired",
        }
        orgs[oid]["events"].append(
            InteractionEvent(
                type=event_type_map[inv.status],
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
        oid = grant_org_map.get(str(doc.access_grant_id))
        if oid and oid in orgs:
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

    # 5. Compute current_status and sort
    result: list[OrganizationInteractionCard] = []
    for oid, data in orgs.items():
        org = data["org"]
        org_grants: list[AccessGrant] = data["grants"]
        events: list[InteractionEvent] = sorted(data["events"], key=lambda e: e.occurred_at)

        active_grant = next(
            (g for g in org_grants if g.status == AccessGrantStatus.ACTIVE), None
        )
        revoked_grant = next(
            (g for g in org_grants if g.status == AccessGrantStatus.REVOKED), None
        )

        if active_grant:
            status = "active"
        elif revoked_grant:
            status = "revoked"
        else:
            # Determine from invitation status
            org_invs = [
                inv for inv, o in invitations if str(o.id) == oid
            ]
            has_pending = any(i.status == InvitationStatus.PENDING for i in org_invs)
            status = "invited" if has_pending else "expired"

        result.append(
            OrganizationInteractionCard(
                organization_id=org.id,
                organization_name=org.name,
                logo_url=org.logo_url,
                current_status=status,
                events=events,
            )
        )

    # Sort orgs by most recent event DESC
    result.sort(
        key=lambda c: c.events[-1].occurred_at if c.events else datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return result
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
uv run pytest tests/integration/test_candidate_api.py -k "organizations" -v
```

Résultat attendu : 3 tests PASSED.

- [ ] **Step 5 : Vérifier la suite complète**

```bash
uv run pytest tests/ -v --tb=short
```

- [ ] **Step 6 : Commit**

```bash
git add backend/api/routes/candidates.py backend/tests/integration/test_candidate_api.py
git commit -m "feat(c2): add GET /candidates/me/organizations interaction timeline endpoint"
```

---

### Task 3 : Frontend — page `/candidate/access` enrichie

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/app/(candidate)/candidate/access/page.tsx`

- [ ] **Step 1 : Ajouter les types dans `frontend/types/api.ts`**

```typescript
export type OrganizationStatus = "invited" | "active" | "revoked" | "expired";
export type InteractionEventType =
  | "invitation_sent" | "invitation_accepted" | "invitation_rejected"
  | "invitation_expired" | "access_granted" | "access_revoked" | "document_generated";

export interface InteractionEvent {
  type: InteractionEventType;
  occurred_at: string;
  metadata: {
    template_name?: string | null;
    file_format?: string | null;
  };
}

export interface OrganizationInteractionCard {
  organization_id: string;
  organization_name: string;
  logo_url: string | null;
  current_status: OrganizationStatus;
  events: InteractionEvent[];
}
```

- [ ] **Step 2 : Réécrire `frontend/app/(candidate)/candidate/access/page.tsx`**

```tsx
// frontend/app/(candidate)/candidate/access/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { OrganizationInteractionCard } from "@/types/api";

const STATUS_LABELS: Record<string, string> = {
  active: "Accès actif",
  invited: "Invitation en attente",
  revoked: "Accès révoqué",
  expired: "Invitation expirée",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  invited: "secondary",
  revoked: "destructive",
  expired: "outline",
};

const EVENT_LABELS: Record<string, string> = {
  invitation_sent: "Invitation envoyée",
  invitation_accepted: "Invitation acceptée",
  invitation_rejected: "Invitation refusée",
  invitation_expired: "Invitation expirée",
  access_granted: "Accès accordé",
  access_revoked: "Accès révoqué",
  document_generated: "Dossier généré",
};

export default function AccessPage() {
  const [orgs, setOrgs] = useState<OrganizationInteractionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<OrganizationInteractionCard[]>("/candidates/me/organizations")
      .then(setOrgs)
      .catch((err) =>
        setError(err instanceof ApiError ? err.detail : "Impossible de charger les accès")
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleRevoke(orgId: string) {
    setRevoking(orgId);
    try {
      await api.post(`/access-grants/revoke`, { organization_id: orgId });
      setOrgs((prev) =>
        prev.map((o) =>
          o.organization_id === orgId ? { ...o, current_status: "revoked" } : o
        )
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.detail : "Erreur lors de la révocation");
    } finally {
      setRevoking(null);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Accès & interactions</h1>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {orgs.length === 0 ? (
        <p className="text-muted-foreground">Aucune interaction avec une organisation pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-4" role="list">
          {orgs.map((org) => (
            <li key={org.organization_id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{org.organization_name}</CardTitle>
                    <Badge variant={STATUS_VARIANTS[org.current_status]}>
                      {STATUS_LABELS[org.current_status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="events">
                      <AccordionTrigger className="text-sm">
                        Historique ({org.events.length} événement{org.events.length > 1 ? "s" : ""})
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {org.events.map((ev, i) => (
                            <li key={i} className="flex items-start justify-between gap-2">
                              <span>{EVENT_LABELS[ev.type] ?? ev.type}</span>
                              <span className="shrink-0 text-xs">
                                {new Date(ev.occurred_at).toLocaleDateString("fr-FR")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  {org.current_status === "active" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={revoking === org.organization_id}
                      onClick={() => handleRevoke(org.organization_id)}
                    >
                      {revoking === org.organization_id ? "Révocation…" : "Révoquer l'accès"}
                    </Button>
                  )}
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
git add frontend/types/api.ts frontend/app/\(candidate\)/candidate/access/page.tsx
git commit -m "feat(c2): enrich /candidate/access page with interaction timeline accordion"
```
