# Jorg UX Refonte — Implementation Plan (Tracks C–E)

> **For agentic workers:** This is Part 2 of the plan. Complete Part 1 (`2026-06-02-ux-refonte-implementation.md`) first — Tracks A and B must be done before starting here.
>
> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**⚠️ Before any routing/redirect work:** Read `frontend/node_modules/next/dist/docs/` as instructed by `frontend/AGENTS.md`.

---

## TRACK C — Navigation Shell

---

### Task 9: Recruiter nav 7 → 5 + deprecated route redirects

**Files:**

- Modify: `frontend/app/(recruiter)/layout.tsx`
- Modify: `frontend/components/nav-sidebar.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/invitations/page.tsx` (redirect)
- Modify: `frontend/app/(recruiter)/recruiter/generate/page.tsx` (redirect)
- Modify: `frontend/app/(recruiter)/recruiter/history/page.tsx` (redirect)

- [ ] **Step 1: Update `frontend/app/(recruiter)/layout.tsx`**

```typescript
// frontend/app/(recruiter)/layout.tsx
import { NavSidebar } from "@/components/nav-sidebar";

const recruiterNav = [
  { href: "/recruiter/dashboard", label: "Tableau de bord" },
  { href: "/recruiter/candidates", label: "Candidats" },
  { href: "/recruiter/opportunities", label: "Opportunités" },
  { href: "/recruiter/documents", label: "Dossiers" },
  { href: "/recruiter/settings", label: "Configuration" },
];

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <NavSidebar
        items={recruiterNav}
        title="Espace recruteur"
        homeHref="/recruiter/dashboard"
      />
      <main className="flex-1 overflow-auto p-8" id="main-content">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update ICON_MAP in `frontend/components/nav-sidebar.tsx`**

Add new entries, keep existing ones for pages that still exist:

```typescript
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "/candidate/dashboard": LayoutDashboard,
  "/candidate/profile": User,
  "/candidate/access": Shield,
  "/candidate/settings": Settings,
  "/recruiter/dashboard": LayoutDashboard,
  "/recruiter/candidates": Users,
  "/recruiter/opportunities": Zap,
  "/recruiter/documents": Clock,
  "/recruiter/settings": Settings,
};
```

Remove unused imports: `Mail`, `Briefcase`, `FileText`, `Send`, `Sparkles`, `History` (only if they're not used elsewhere in the file).

- [ ] **Step 3: Replace `frontend/app/(recruiter)/recruiter/invitations/page.tsx` with redirect**

```typescript
// frontend/app/(recruiter)/recruiter/invitations/page.tsx
import { redirect } from "next/navigation";

export default function InvitationsRedirect() {
  redirect("/recruiter/candidates");
}
```

- [ ] **Step 4: Replace `frontend/app/(recruiter)/recruiter/generate/page.tsx` with redirect**

```typescript
// frontend/app/(recruiter)/recruiter/generate/page.tsx
import { redirect } from "next/navigation";

export default function GenerateRedirect() {
  redirect("/recruiter/candidates");
}
```

- [ ] **Step 5: Replace `frontend/app/(recruiter)/recruiter/history/page.tsx` with redirect**

```typescript
// frontend/app/(recruiter)/recruiter/history/page.tsx
import { redirect } from "next/navigation";

export default function HistoryRedirect() {
  redirect("/recruiter/documents");
}
```

- [ ] **Step 6: Verify TypeScript and build**

```
cd frontend && npm run build 2>&1 | head -60
```

Expected: no errors related to the removed nav items.

- [ ] **Step 7: Commit**

```
git add frontend/app/(recruiter)/ frontend/components/nav-sidebar.tsx
git commit -m "feat(nav): recruiter nav 7→5, deprecated routes redirect"
```

---

### Task 10: Candidate nav 7 → 4 + deprecated route redirects

**Files:**

- Modify: `frontend/app/(candidate)/layout.tsx`
- Modify: `frontend/app/(candidate)/candidate/requests/page.tsx` (redirect)
- Modify: `frontend/app/(candidate)/candidate/history/page.tsx` (redirect)

- [ ] **Step 1: Update `frontend/app/(candidate)/layout.tsx`**

```typescript
// frontend/app/(candidate)/layout.tsx
import { NavSidebar } from "@/components/nav-sidebar";

const candidateNav = [
  { href: "/candidate/dashboard", label: "Tableau de bord" },
  { href: "/candidate/profile", label: "Mon profil" },
  { href: "/candidate/access", label: "Accès" },
  { href: "/candidate/settings", label: "Paramètres" },
];

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <NavSidebar
        items={candidateNav}
        title="Espace candidat"
        homeHref="/candidate/dashboard"
      />
      <main className="flex-1 overflow-auto p-8" id="main-content">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Replace `frontend/app/(candidate)/candidate/requests/page.tsx` with redirect**

```typescript
// frontend/app/(candidate)/candidate/requests/page.tsx
import { redirect } from "next/navigation";

export default function RequestsRedirect() {
  redirect("/candidate/access");
}
```

- [ ] **Step 3: Replace `frontend/app/(candidate)/candidate/history/page.tsx` with redirect**

```typescript
// frontend/app/(candidate)/candidate/history/page.tsx
import { redirect } from "next/navigation";

export default function HistoryRedirect() {
  redirect("/candidate/access");
}
```

- [ ] **Step 4: Update QuickActionCard hrefs in dashboard — fix stale links**

In `frontend/app/(candidate)/candidate/dashboard/page.tsx`, find any links pointing to `/candidate/requests` or `/candidate/skills` and update them:

```typescript
// Change:
href = "/candidate/requests";
// To:
href = "/candidate/access";

// Change:
href = "/candidate/skills";
// To:
href = "/candidate/profile?tab=competences";
```

- [ ] **Step 5: Build check**

```
cd frontend && npm run build 2>&1 | head -60
```

- [ ] **Step 6: Commit**

```
git add frontend/app/(candidate)/
git commit -m "feat(nav): candidate nav 7→4, deprecated routes redirect, fix dashboard hrefs"
```

---

## TRACK D — Recruiter Pages

---

### Task 11: Recruiter dashboard — onboarding CTA + NotificationBell

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`

- [ ] **Step 1: Add OnboardingOrg to dashboard when no org**

In `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`, replace the no-org empty state with `OnboardingOrg`:

```typescript
// Add import at top:
import { OnboardingOrg } from "@/components/onboarding-org";
import { NotificationBell } from "@/components/notification-bell";

// Replace the !orgId empty state block:
if (!orgId) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bienvenue sur Jorg 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Commencez par configurer votre organisation.
        </p>
      </div>
      <OnboardingOrg onSuccess={(newOrgId) => window.location.reload()} />
    </div>
  );
}
```

- [ ] **Step 2: Add NotificationBell to the page header area**

In the main return of `RecruiterDashboardPage`, wrap the existing h1 in a flex row with the bell:

```typescript
<div className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold">
      Bonjour{firstName ? `, ${firstName}` : ""} 👋
    </h1>
    <p className="mt-1 text-sm text-muted-foreground">
      Aperçu de votre activité recrutement
    </p>
  </div>
  <NotificationBell portal="recruiter" orgId={orgId} />
</div>
```

- [ ] **Step 3: Update the "Inviter un candidat" quick action card href**

Change from `/recruiter/invitations` to open the invite modal via state — since this is a direct link, point it to `/recruiter/candidates` instead (the modal lives there):

```typescript
<QuickActionCard
  icon={Mail}
  label="Inviter un candidat"
  description="Envoyer une invitation par email"
  href="/recruiter/candidates"   // was: /recruiter/invitations
/>
```

- [ ] **Step 4: Update the "Générer un dossier" quick action href**

```typescript
<QuickActionCard
  icon={Sparkles}
  label="Générer un dossier"
  description="Créer un dossier candidat"
  href="/recruiter/candidates"   // was: /recruiter/generate
/>
```

- [ ] **Step 5: Build check**

```
cd frontend && npm run build 2>&1 | head -40
```

- [ ] **Step 6: Commit**

```
git add frontend/app/(recruiter)/recruiter/dashboard/page.tsx
git commit -m "feat(recruiter): dashboard onboarding CTA + NotificationBell + fix action hrefs"
```

---

### Task 12: Candidats hub — invite modal, generate dialog, voir profil, templates preload

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/candidates/page.tsx`

This is the largest frontend change. Read the current file carefully before editing.

- [ ] **Step 1: Add imports at the top of the file**

```typescript
import Link from "next/link";
import { InviteCandidateDialog } from "@/components/invite-candidate-dialog";
import { GenerateDossierDialog } from "@/components/generate-dossier-dialog";
import type { Template } from "@/types/api";
```

- [ ] **Step 2: Add state variables after existing state declarations**

```typescript
const [inviteOpen, setInviteOpen] = useState(false);
const [generateFor, setGenerateFor] = useState<{
  candidateId: string;
  candidateName: string;
} | null>(null);
const [templates, setTemplates] = useState<Template[]>([]);
```

- [ ] **Step 3: Load templates in the existing useEffect**

Inside the `useEffect` that fetches candidates (after the `!orgId` guard), add a parallel fetch for templates:

```typescript
// Add alongside the existing Promise.all:
Promise.all([
  fetchCandidates(orgId, EMPTY_FILTERS),
  api
    .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
    .then((opps) => setOpportunities(opps.filter((o) => o.status === "open")))
    .catch(() => {}),
  api
    .get<Template[]>(`/organizations/${orgId}/templates`)
    .then(setTemplates)
    .catch(() => {}),
]);
```

- [ ] **Step 4: Add [Inviter un candidat] button and dialogs before the filter card**

```typescript
// Before the filter Card:
<div className="flex items-center justify-between gap-4">
  <h1 className="text-2xl font-bold">Candidats accessibles</h1>
  <Button onClick={() => setInviteOpen(true)}>
    Inviter un candidat
  </Button>
</div>

<InviteCandidateDialog
  open={inviteOpen}
  onOpenChange={setInviteOpen}
  orgId={orgId}
/>

{generateFor && (
  <GenerateDossierDialog
    open={!!generateFor}
    onOpenChange={(open) => { if (!open) setGenerateFor(null); }}
    orgId={orgId}
    candidateId={generateFor.candidateId}
    candidateName={generateFor.candidateName}
    templates={templates}
  />
)}
```

Remove the old `<h1 className="text-2xl font-bold">Candidats accessibles</h1>` that was standalone.

- [ ] **Step 5: Add [Générer un dossier] and [Voir le profil] buttons to each candidate card**

In the `CardContent` of each candidate card, after the existing `<div className="pt-1 space-y-2">` action area, add:

```typescript
<div className="flex items-center gap-2 pt-1 flex-wrap">
  <Button
    size="sm"
    variant="outline"
    onClick={() =>
      setGenerateFor({
        candidateId: c.user_id,
        candidateName:
          c.first_name && c.last_name
            ? `${c.first_name} ${c.last_name}`
            : c.email,
      })
    }
  >
    Générer un dossier
  </Button>
  <Link href={`/recruiter/candidates/${c.user_id}`}>
    <Button size="sm" variant="ghost">
      Voir le profil →
    </Button>
  </Link>
</div>
```

Place this **before** the existing `pickingFor` / `+ Opportunité` block within `<CardContent>`.

- [ ] **Step 6: Build check**

```
cd frontend && npm run build 2>&1 | head -60
```

- [ ] **Step 7: Commit**

```
git add frontend/app/(recruiter)/recruiter/candidates/page.tsx
git commit -m "feat(recruiter): Candidats hub — invite modal, generate dialog, voir profil"
```

---

### Task 13: /recruiter/candidates/[id] — candidate detail page

**Files:**

- Create: `frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

```typescript
// frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Breadcrumb } from "@/components/breadcrumb";
import { GenerateDossierDialog } from "@/components/generate-dossier-dialog";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type {
  AccessibleCandidateRead,
  OpportunityRead,
  Template,
} from "@/types/api";

// Re-use CandidateExperiencePanel inline — copy the component definition
// from recruiter/candidates/page.tsx rather than importing from a page file.
// (See note in spec §5.3 — a dedicated endpoint GET /candidates/{id} is a
// future optimization; for now we fetch the full list and filter.)

function candidateName(c: AccessibleCandidateRead): string {
  return c.first_name && c.last_name
    ? `${c.first_name} ${c.last_name}`
    : c.email;
}

export default function CandidateDetailPage() {
  const { id: candidateId } = useParams<{ id: string }>();
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [candidate, setCandidate] = useState<AccessibleCandidateRead | null>(
    null,
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [pickingOpp, setPickingOpp] = useState(false);
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      api
        .get<AccessibleCandidateRead[]>(`/organizations/${orgId}/candidates`)
        .then((list) => {
          const found = list.find((c) => c.user_id === candidateId) ?? null;
          setCandidate(found);
          if (!found) setError("Candidat introuvable ou accès non autorisé.");
        }),
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then(setTemplates),
      api
        .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
        .then((opps) =>
          setOpportunities(opps.filter((o) => o.status === "open")),
        ),
    ]).catch((err) => setError(extractErrorMessage(err, "Erreur de chargement")));
  }, [orgId, candidateId]);

  async function handleAddToOpportunity(oppId: string) {
    if (!orgId || !candidateId) return;
    setAddingTo(oppId);
    try {
      await api.post(
        `/organizations/${orgId}/opportunities/${oppId}/candidates`,
        { candidate_id: candidateId },
      );
      setAddFeedback("Candidat ajouté à l'opportunité ✓");
      setPickingOpp(false);
    } catch (err) {
      setAddFeedback(extractErrorMessage(err, "Erreur"));
    } finally {
      setAddingTo(null);
    }
  }

  if (orgLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (error) return <ErrorAlert error={error} />;
  if (!candidate) return <p className="text-muted-foreground">Chargement…</p>;

  const name = candidateName(candidate);

  return (
    <div className="max-w-3xl space-y-6">
      <Breadcrumb
        items={[
          { label: "Candidats", href: "/recruiter/candidates" },
          { label: name },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          {candidate.title && (
            <p className="mt-1 text-sm text-muted-foreground">
              {candidate.title}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setGenerateOpen(true)}>
            Générer un dossier
          </Button>
        </div>
      </div>

      <GenerateDossierDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        orgId={orgId!}
        candidateId={candidateId}
        candidateName={name}
        templates={templates}
      />

      {/* Profile summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {candidate.daily_rate && <p>TJM : {candidate.daily_rate} €/j</p>}
          {candidate.availability_status && (
            <p>Disponibilité : {candidate.availability_status}</p>
          )}
          {candidate.work_mode && <p>Mode : {candidate.work_mode}</p>}
          {candidate.location_preference && (
            <p>Localisation : {candidate.location_preference}</p>
          )}
        </CardContent>
      </Card>

      {/* Experiences */}
      {candidate.experiences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Expériences ({candidate.experiences.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidate.experiences.map((exp) => (
              <div
                key={exp.id}
                className="rounded-md border border-border/40 p-3"
              >
                <p className="text-sm font-medium">
                  {exp.client_name} — {exp.role}
                </p>
                <p className="text-xs text-muted-foreground">
                  {exp.start_date}
                  {exp.end_date
                    ? ` → ${exp.end_date}`
                    : exp.is_current
                      ? " → présent"
                      : ""}
                </p>
                {exp.achievements.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {exp.achievements.map((ach) => (
                      <li key={ach.id} className="text-xs text-muted-foreground">
                        • {ach.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add to opportunity */}
      <div className="space-y-2">
        {addFeedback && (
          <p className="text-sm text-muted-foreground">{addFeedback}</p>
        )}
        {pickingOpp ? (
          <div className="rounded border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Choisir une opportunité :
            </p>
            {opportunities.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aucune opportunité ouverte.
              </p>
            ) : (
              opportunities.map((opp) => (
                <Button
                  key={opp.id}
                  size="sm"
                  variant="outline"
                  className="w-full justify-start text-xs"
                  disabled={addingTo === opp.id}
                  onClick={() => handleAddToOpportunity(opp.id)}
                >
                  {opp.title}
                </Button>
              ))
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setPickingOpp(false)}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPickingOpp(true);
              setAddFeedback(null);
            }}
          >
            + Ajouter à une opportunité
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```
cd frontend && npm run build 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```
git add "frontend/app/(recruiter)/recruiter/candidates/[id]/"
git commit -m "feat(recruiter): candidate detail page /recruiter/candidates/[id]"
```

---

### Task 14: /recruiter/documents + opportunities fixes

**Files:**

- Create: `frontend/app/(recruiter)/recruiter/documents/page.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx`

- [ ] **Step 1: Create `frontend/app/(recruiter)/recruiter/documents/page.tsx`**

Copy the existing history page and rename headings:

```typescript
// frontend/app/(recruiter)/recruiter/documents/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload, useRecruiterOrg } from "@/lib/hooks";
import type { GeneratedDocument } from "@/types/api";

export default function DocumentsPage() {
  const { orgId, loading: orgLoading, error: orgError } = useRecruiterOrg();
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    setDocsLoading(true);
    api
      .get<GeneratedDocument[]>(`/organizations/${orgId}/documents`)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDocs(data);
          setDocsLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setFetchError(
            extractErrorMessage(err, "Impossible de charger les dossiers"),
          );
          setDocsLoading(false);
        }
      });
    return () => controller.abort();
  }, [orgId]);

  if (orgLoading || docsLoading)
    return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez votre compte à une organisation.
      </p>
    );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dossiers générés</h1>
      <ErrorAlert error={orgError ?? fetchError} />
      {docs.length === 0 ? (
        <EmptyState message="Aucun dossier généré par votre organisation." />
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

- [ ] **Step 2: Fix `alert()` in `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx`**

Find the `alert(...)` call in `handleBulkGenerate` and replace with a state-based error display:

```typescript
// Add state variable near the top of OpportunityDetailPage:
const [bulkError, setBulkError] = useState<string | null>(null);

// In handleBulkGenerate, replace:
alert(err instanceof ApiError ? err.detail : "Erreur");
// With:
setBulkError(err instanceof ApiError ? err.detail : "Erreur lors de la génération");

// In the JSX, add after the bulk generate form Button:
<ErrorAlert error={bulkError} />
```

Also add `import { ErrorAlert } from "@/components/ui/ErrorAlert";` if not already imported, and `import { ApiError } from "@/lib/api";` is already there.

- [ ] **Step 3: Add Breadcrumb to `opportunities/[id]/page.tsx`**

```typescript
// Add import:
import { Breadcrumb } from "@/components/breadcrumb";

// Add at the top of the returned JSX (before the title div):
<Breadcrumb
  items={[
    { label: "Opportunités", href: "/recruiter/opportunities" },
    { label: opp.title },
  ]}
/>
```

- [ ] **Step 4: Build check**

```
cd frontend && npm run build 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```
git add "frontend/app/(recruiter)/recruiter/documents/" "frontend/app/(recruiter)/recruiter/opportunities/"
git commit -m "feat(recruiter): Dossiers page, fix alert() in opportunities, add breadcrumb"
```

---

### Task 15: /recruiter/settings — Configuration page

**Files:**

- Create: `frontend/app/(recruiter)/recruiter/settings/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// frontend/app/(recruiter)/recruiter/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type { OrgMember, Organization, Template } from "@/types/api";

type Tab = "organisation" | "membres" | "templates";

export default function RecruiterSettingsPage() {
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [activeTab, setActiveTab] = useState<Tab>("organisation");
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      api
        .get<Organization>(`/organizations/${orgId}`)
        .then(setOrg)
        .catch((err) => setError(extractErrorMessage(err, "Erreur"))),
      api
        .get<OrgMember[]>(`/organizations/${orgId}/members`)
        .then(setMembers)
        .catch(() => {}),
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then(setTemplates)
        .catch(() => {}),
    ]);
  }, [orgId]);

  async function handleRegenerateCode() {
    if (!orgId) return;
    setRegenerating(true);
    try {
      const updated = await api.post<Organization>(
        `/organizations/${orgId}/regenerate-join-code`,
        {},
      );
      setOrg(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur"));
    } finally {
      setRegenerating(false);
    }
  }

  function copyCode() {
    if (!org) return;
    void navigator.clipboard.writeText(org.join_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "organisation", label: "Organisation" },
    { key: "membres", label: "Membres" },
    { key: "templates", label: "Templates" },
  ];

  if (orgLoading) return <p className="text-muted-foreground">Chargement…</p>;

  if (!orgId) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;êtes pas encore associé à une organisation. Retournez sur
          le{" "}
          <Link href="/recruiter/dashboard" className="underline">
            tableau de bord
          </Link>{" "}
          pour en créer ou rejoindre une.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Configuration</h1>
      <ErrorAlert error={error} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Organisation tab */}
      {activeTab === "organisation" && org && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{org.name}</CardTitle>
              <CardDescription>Slug : {org.slug}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Membres tab */}
      {activeTab === "membres" && (
        <div className="space-y-4">
          {/* Join code */}
          <Card>
            <CardHeader>
              <CardTitle>Code d&apos;invitation</CardTitle>
              <CardDescription>
                Partagez ce code pour permettre à un collègue de rejoindre
                votre organisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {org && (
                <div className="flex items-center gap-3">
                  <code className="rounded-md bg-muted px-4 py-2 font-mono text-lg tracking-widest">
                    {org.join_code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyCode}
                    className="gap-1.5"
                  >
                    {codeCopied ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {codeCopied ? "Copié !" : "Copier"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegenerateCode}
                    disabled={regenerating}
                    className="gap-1.5 text-muted-foreground"
                    title="Régénérer le code (invalide l'ancien)"
                  >
                    <RefreshCw
                      className={`size-3.5 ${regenerating ? "animate-spin" : ""}`}
                    />
                    Régénérer
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members list */}
          <Card>
            <CardHeader>
              <CardTitle>Membres ({members.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun membre pour l&apos;instant.
                </p>
              ) : (
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li
                      key={m.user_id}
                      className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {m.first_name && m.last_name
                            ? `${m.first_name} ${m.last_name}`
                            : m.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.email}
                          {m.job_title ? ` · ${m.job_title}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Templates tab */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </p>
            <Link
              href="/recruiter/templates"
              className={buttonVariants({ size: "sm" })}
            >
              Gérer les templates →
            </Link>
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun template. Cliquez sur &quot;Gérer les templates&quot; pour
              en uploader un.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.detected_placeholders.length} placeholder(s)
                    </p>
                  </div>
                  <Badge variant={t.is_valid ? "default" : "secondary"}>
                    {t.is_valid ? "Valide" : "Incomplet"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```
cd frontend && npm run build 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```
git add "frontend/app/(recruiter)/recruiter/settings/"
git commit -m "feat(recruiter): Configuration page (organisation + membres + templates)"
```

---

## TRACK E — Candidate Pages

---

### Task 16: skills/page.tsx — export sections + redirect

**Files:**

- Modify: `frontend/app/(candidate)/candidate/skills/page.tsx`

- [ ] **Step 1: Add `export` keyword to all five section functions**

In `skills/page.tsx`, find each function declaration and add `export`:

```typescript
// Change (line ~976):
function ExperienceSection() {
// To:
export function ExperienceSection() {

// Change (line ~1223):
function SkillSection() {
// To:
export function SkillSection() {

// Change (line ~1793):
function EducationSection() {
// To:
export function EducationSection() {

// Change (line ~2039):
function CertificationSection() {
// To:
export function CertificationSection() {

// Change (line ~2265):
function LanguageSection() {
// To:
export function LanguageSection() {
```

- [ ] **Step 2: Replace the `SkillsPage` default export with a redirect**

Find the `export default function SkillsPage()` at line ~2454 and replace the entire function body:

```typescript
export default function SkillsPage() {
  // This page has been merged into /candidate/profile?tab=competences
  // The section components are re-exported above for use by the profile page.
  if (typeof window !== "undefined") {
    window.location.replace("/candidate/profile?tab=competences");
  }
  return null;
}
```

> **Note:** A server-side `redirect()` cannot be used here because the file has `"use client"` at the top (required for all the interactive section components). The client-side redirect is the appropriate approach for a client component.

- [ ] **Step 3: Build check**

```
cd frontend && npm run build 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```
git add "frontend/app/(candidate)/candidate/skills/page.tsx"
git commit -m "feat(candidate): export CV sections from skills page, redirect to profile tabs"
```

---

### Task 17: /candidate/profile — tab shell with CV sections

**Files:**

- Modify: `frontend/app/(candidate)/candidate/profile/page.tsx`

This task wraps the existing profile form and imports the CV sections into a unified tab shell.

- [ ] **Step 1: Rename the existing `ProfilePage` function to `InformationsSection`**

At the bottom of `profile/page.tsx`, change:

```typescript
// Change:
export default function ProfilePage() {
// To:
function InformationsSection() {
```

Remove the `export default` — it will be replaced with a new tab-shell component.

- [ ] **Step 2: Add imports at the top of `profile/page.tsx`**

```typescript
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";
import {
  ExperienceSection,
  SkillSection,
  EducationSection,
  CertificationSection,
  LanguageSection,
} from "@/app/(candidate)/candidate/skills/page";
```

- [ ] **Step 3: Add the tab shell as the new default export at the bottom of the file**

```typescript
type ProfileTab =
  | "informations"
  | "experiences"
  | "competences"
  | "formation"
  | "langues";

const TABS: { key: ProfileTab; label: string }[] = [
  { key: "informations", label: "Informations" },
  { key: "experiences", label: "Expériences" },
  { key: "competences", label: "Compétences" },
  { key: "formation", label: "Formation" },
  { key: "langues", label: "Langues" },
];

function ProfileTabs() {
  const searchParams = useSearchParams();
  const activeTab =
    ((searchParams.get("tab") as ProfileTab) ?? "informations") in
    Object.fromEntries(TABS.map((t) => [t.key, true]))
      ? (searchParams.get("tab") as ProfileTab)
      : "informations";

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={`?tab=${tab.key}`}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Tab content — lazy: only mounts active section */}
      {activeTab === "informations" && <InformationsSection />}
      {activeTab === "experiences" && <ExperienceSection />}
      {activeTab === "competences" && <SkillSection />}
      {activeTab === "formation" && <EducationSection />}
      {activeTab === "langues" && <LanguageSection />}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Mon profil
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informations personnelles et profil de compétences.
          </p>
        </div>
        <NotificationBell portal="candidate" />
      </div>
      {/* Suspense required for useSearchParams in Next.js App Router */}
      <Suspense
        fallback={
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        }
      >
        <ProfileTabs />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 4: Build check**

```
cd frontend && npm run build 2>&1 | head -60
```

Fix any TypeScript errors (likely: `CertificationSection` may not exist as a named export yet — verify spelling matches what you exported in Task 16).

- [ ] **Step 5: Commit**

```
git add "frontend/app/(candidate)/candidate/profile/page.tsx"
git commit -m "feat(candidate): Mon profil tab shell — informations + CV sections unified"
```

---

### Task 18: Aperçu recruteur — preview drawer in profile

**Files:**

- Modify: `frontend/app/(candidate)/candidate/profile/page.tsx`

- [ ] **Step 1: Add preview dialog to `profile/page.tsx`**

Add imports:

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CandidateProfile, Experience, Skill } from "@/types/api";
```

Add state in `ProfilePage`:

```typescript
const [previewOpen, setPreviewOpen] = useState(false);
const [previewData, setPreviewData] = useState<{
  profile: CandidateProfile | null;
  experiences: Experience[];
  skills: Skill[];
} | null>(null);
const [previewLoading, setPreviewLoading] = useState(false);

async function loadPreview() {
  setPreviewLoading(true);
  setPreviewOpen(true);
  try {
    const [profile, experiences, skills] = await Promise.all([
      api.get<CandidateProfile>("/candidates/me/profile"),
      api.get<Experience[]>("/candidates/me/experiences"),
      api.get<Skill[]>("/candidates/me/skills"),
    ]);
    setPreviewData({ profile, experiences, skills });
  } catch {
    // show whatever we have
  } finally {
    setPreviewLoading(false);
  }
}
```

Add the button to the header row (next to `NotificationBell`):

```typescript
<Button variant="outline" size="sm" onClick={loadPreview}>
  Aperçu recruteur
</Button>
```

Add the dialog before the closing `</div>` of `ProfilePage`:

```typescript
<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
  <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Aperçu recruteur</DialogTitle>
    </DialogHeader>
    {previewLoading ? (
      <p className="text-sm text-muted-foreground">Chargement…</p>
    ) : previewData ? (
      <div className="space-y-4 text-sm">
        {previewData.profile && (
          <div>
            <p className="font-semibold text-base">
              {previewData.profile.first_name} {previewData.profile.last_name}
            </p>
            {previewData.profile.title && (
              <p className="text-muted-foreground">{previewData.profile.title}</p>
            )}
            {previewData.profile.summary && (
              <p className="mt-2">{previewData.profile.summary}</p>
            )}
          </div>
        )}
        {previewData.skills.filter((s) => s.featured).length > 0 && (
          <div>
            <p className="font-medium mb-1">Compétences clés</p>
            <div className="flex flex-wrap gap-1.5">
              {previewData.skills
                .filter((s) => s.featured)
                .map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {s.skill_ref.name}
                  </span>
                ))}
            </div>
          </div>
        )}
        {previewData.experiences.length > 0 && (
          <div>
            <p className="font-medium mb-2">Expériences</p>
            <div className="space-y-3">
              {previewData.experiences.map((exp) => (
                <div key={exp.id} className="rounded border border-border/40 p-3">
                  <p className="font-medium">
                    {exp.client_name} — {exp.role}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {exp.start_date}
                    {exp.end_date ? ` → ${exp.end_date}` : exp.is_current ? " → présent" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : null}
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Add `api` import** (if not already present — it's not currently in profile/page.tsx):

```typescript
import { api, ApiError } from "@/lib/api";
```

- [ ] **Step 3: Build check**

```
cd frontend && npm run build 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```
git add "frontend/app/(candidate)/candidate/profile/page.tsx"
git commit -m "feat(candidate): Aperçu recruteur preview dialog in Mon profil"
```

---

### Task 19: /candidate/access — fusion invitations + access + documents

**Files:**

- Modify: `frontend/app/(candidate)/candidate/access/page.tsx`

- [ ] **Step 1: Rewrite `frontend/app/(candidate)/candidate/access/page.tsx`**

```typescript
// frontend/app/(candidate)/candidate/access/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, ApiError } from "@/lib/api";
import {
  ACCESS_STATUS_LABELS,
  ACCESS_STATUS_VARIANTS,
  EVENT_LABELS,
  INVITATION_STATUS_LABELS,
  INVITATION_STATUS_VARIANTS,
} from "@/lib/labels";
import { useAsyncData, useDownload } from "@/lib/hooks";
import type {
  GeneratedDocumentCandidateView,
  Invitation,
  OrganizationInteractionCard,
} from "@/types/api";

export default function AccessPage() {
  // Invitations
  const {
    data: invitations,
    loading: invLoading,
    error: invError,
    refetch: refetchInvitations,
  } = useAsyncData<Invitation[]>(
    () => api.get("/invitations/me"),
    "Impossible de charger les invitations",
  );
  const [actionError, setActionError] = useState<string | null>(null);

  // Org access cards
  const {
    data: orgs,
    loading: orgsLoading,
    error: orgsError,
    refetch: refetchOrgs,
  } = useAsyncData<OrganizationInteractionCard[]>(
    () => api.get("/candidates/me/organizations"),
    "Impossible de charger les accès",
  );
  const [revoking, setRevoking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [docsExpanded, setDocsExpanded] = useState<Record<string, boolean>>({});

  // Documents per org (loaded lazily when expanded)
  const [orgDocs, setOrgDocs] = useState<
    Record<string, GeneratedDocumentCandidateView[]>
  >({});
  const [docsLoading, setDocsLoading] = useState<Record<string, boolean>>({});
  const { download, errors: downloadErrors } = useDownload();

  const loading = invLoading || orgsLoading;
  const pendingInvitations = (invitations ?? []).filter(
    (inv) => inv.status === "pending",
  );

  async function respond(token: string, action: "accept" | "reject") {
    setActionError(null);
    try {
      await api.post(`/invitations/${token}/${action}`);
      refetchInvitations();
      refetchOrgs();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Erreur");
    }
  }

  async function handleRevoke(orgId: string) {
    setRevoking(orgId);
    try {
      await api.post("/access-grants/revoke", { organization_id: orgId });
      refetchOrgs();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.detail : "Erreur lors de la révocation",
      );
    } finally {
      setRevoking(null);
    }
  }

  async function loadOrgDocs(orgName: string) {
    if (orgDocs[orgName] !== undefined) return;
    setDocsLoading((prev) => ({ ...prev, [orgName]: true }));
    try {
      const all = await api.get<GeneratedDocumentCandidateView[]>(
        "/candidates/me/documents",
      );
      const byOrg: Record<string, GeneratedDocumentCandidateView[]> = {};
      for (const doc of all) {
        byOrg[doc.organization_name] = [
          ...(byOrg[doc.organization_name] ?? []),
          doc,
        ];
      }
      setOrgDocs((prev) => ({ ...prev, ...byOrg }));
    } catch {
      // ignore
    } finally {
      setDocsLoading((prev) => ({ ...prev, [orgName]: false }));
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Accès</h1>
      <ErrorAlert error={invError ?? orgsError ?? actionError} />

      {/* Pending invitations — shown prominently */}
      {pendingInvitations.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-600">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            {pendingInvitations.length} invitation
            {pendingInvitations.length > 1 ? "s" : ""} en attente
          </h2>
          <ul className="space-y-3" role="list">
            {pendingInvitations.map((inv) => (
              <li key={inv.id}>
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">
                        {inv.organization_name ?? `Organisation ${inv.organization_id.slice(0, 8)}…`}
                      </CardTitle>
                      <StatusBadge
                        status={inv.status}
                        labels={INVITATION_STATUS_LABELS}
                        variants={INVITATION_STATUS_VARIANTS}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Expire le{" "}
                      {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => respond(inv.token, "accept")}
                      >
                        Accepter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respond(inv.token, "reject")}
                      >
                        Refuser
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* All organisations */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Organisations
        </h2>
        {!orgs || orgs.length === 0 ? (
          <EmptyState message="Aucune interaction avec une organisation pour l'instant." />
        ) : (
          <ul className="space-y-4" role="list">
            {orgs.map((org) => {
              const docs = orgDocs[org.organization_name] ?? [];
              return (
                <li key={org.organization_id}>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          {org.organization_name}
                        </CardTitle>
                        <StatusBadge
                          status={org.current_status}
                          labels={ACCESS_STATUS_LABELS}
                          variants={ACCESS_STATUS_VARIANTS}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Events history */}
                      <div>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [org.organization_id]: !prev[org.organization_id],
                            }))
                          }
                        >
                          Historique ({org.events.length} événement
                          {org.events.length > 1 ? "s" : ""})
                        </button>
                        {expanded[org.organization_id] && (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {org.events.map((ev, i) => (
                              <li
                                key={i}
                                className="flex items-start justify-between gap-2"
                              >
                                <span>{EVENT_LABELS[ev.type] ?? ev.type}</span>
                                <span className="shrink-0 text-xs">
                                  {new Date(ev.occurred_at).toLocaleDateString(
                                    "fr-FR",
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Dossiers générés — collapsed by default */}
                      <div>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => {
                            const next = !docsExpanded[org.organization_name];
                            setDocsExpanded((prev) => ({
                              ...prev,
                              [org.organization_name]: next,
                            }));
                            if (next) void loadOrgDocs(org.organization_name);
                          }}
                        >
                          Dossiers générés
                          {docsLoading[org.organization_name] ? " (chargement…)" : ""}
                        </button>
                        {docsExpanded[org.organization_name] && !docsLoading[org.organization_name] && (
                          <div className="mt-2">
                            {docs.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Aucun dossier.
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {docs.map((doc) => (
                                  <li
                                    key={doc.id}
                                    className="flex items-center justify-between gap-2 rounded border border-border/40 px-3 py-2"
                                  >
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(doc.generated_at).toLocaleDateString("fr-FR")} · {doc.file_format.toUpperCase()} · {doc.template_name}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
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
                                  </li>
                                ))}
                              </ul>
                            )}
                            {downloadErrors &&
                              Object.entries(downloadErrors).map(([id, err]) => (
                                <ErrorAlert key={id} error={err} />
                              ))}
                          </div>
                        )}
                      </div>

                      {org.current_status === "active" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={revoking === org.organization_id}
                          onClick={() => handleRevoke(org.organization_id)}
                        >
                          {revoking === org.organization_id
                            ? "Révocation…"
                            : "Révoquer l'accès"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```
cd frontend && npm run build 2>&1 | head -60
```

- [ ] **Step 3: Commit**

```
git add "frontend/app/(candidate)/candidate/access/page.tsx"
git commit -m "feat(candidate): Accès page — fusionne invitations + access + dossiers"
```

---

### Task 20: /candidate/dashboard — completion checklist update + NotificationBell

**Files:**

- Modify: `frontend/app/(candidate)/candidate/dashboard/page.tsx`

- [ ] **Step 1: Add NotificationBell to the dashboard header**

```typescript
// Add import:
import { NotificationBell } from "@/components/notification-bell";

// Wrap the greeting h1/p in a flex row:
<div className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold">
      Bonjour{firstName ? `, ${firstName}` : ""} 👋
    </h1>
    <p className="mt-1 text-sm text-muted-foreground">
      Voici l&apos;état de votre espace candidat
    </p>
  </div>
  <NotificationBell portal="candidate" />
</div>
```

- [ ] **Step 2: Update the completion checklist links**

In the `QuickActionCard` for profile completion, update the href to point to the correct tab:

```typescript
<QuickActionCard
  icon={User}
  label="Compléter mon profil"
  description="Complétez votre profil pour plus de visibilité"
  href="/candidate/profile"   // was /candidate/profile — keep as-is (lands on Informations tab)
/>
<QuickActionCard
  icon={Mail}
  label="Mes accès"
  description={...}
  href="/candidate/access"   // was /candidate/requests
  badge={pendingInvitations ?? undefined}
/>
<QuickActionCard
  icon={Shield}
  label="Gérer mes accès"
  description={...}
  href="/candidate/access"   // was /candidate/access — keep
/>
```

- [ ] **Step 3: Import labels from labels.ts**

Replace local `EVENT_LABELS`, `EVENT_ICONS`, `relativeDate` definitions with imports:

```typescript
import { EVENT_LABELS, EVENT_ICONS, relativeDate } from "@/lib/labels";
```

- [ ] **Step 4: Build check**

```
cd frontend && npm run build 2>&1 | head -40
```

- [ ] **Step 5: Full build + type check**

```
cd frontend && npm run build
```

All errors must be zero before this task is complete.

- [ ] **Step 6: Commit**

```
git add "frontend/app/(candidate)/candidate/dashboard/page.tsx"
git commit -m "feat(candidate): dashboard NotificationBell + fix stale hrefs + import labels"
```

---

## Final verification

- [ ] **Run full backend test suite**

```
cd backend && uv run pytest tests/ -q
```

Expected: all green, no regressions.

- [ ] **Run frontend build**

```
cd frontend && npm run build
```

Expected: compiled successfully, no TypeScript errors.

- [ ] **Manual smoke test — 5 key flows**

1. **Recruiter onboarding (create):** Register new recruiter → dashboard shows OnboardingOrg → create org → dashboard shows stats (org linked in 1 step, no second PUT needed).
2. **Recruiter onboarding (join):** Open Configuration → Membres → copy join_code → second recruiter account → dashboard → enter code → joined.
3. **Generate from Candidats:** Navigate to Candidats → click "Générer un dossier" on a card → dialog opens pre-filled with that candidate → select template → generate → download.
4. **Candidate invite response:** Candidate logs in → Accès page shows pending invitation with real org name → Accept → card appears in Organisations section.
5. **Candidate profile tabs:** Navigate to Mon profil → click Expériences tab → URL shows `?tab=experiences` → content loads → navigate to /candidate/skills → redirects back to `?tab=competences`.

- [ ] **Final commit**

```
git add .
git commit -m "chore: final verification pass — UX refonte sprint complete"
```
