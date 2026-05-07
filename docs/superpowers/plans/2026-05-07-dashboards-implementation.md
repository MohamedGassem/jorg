# Dashboards Candidat & Recruteur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/candidate/dashboard` and `/recruiter/dashboard` page (combo stats + quick actions + recent activity), fix the logo link in the sidebar, and make the root `/` redirect intelligently based on the user's role.

**Architecture:** Two new backend endpoints (`GET /auth/me`, `GET /organizations/{org_id}/invitations`), two shared UI components (`StatCard`, `QuickActionCard`), two new `page.tsx` files in the existing route groups, small changes to `NavSidebar` and both layouts, and a server-side smart redirect on the root page.

**Tech Stack:** Next.js 15 App Router (Server Component for root page, Client Components for dashboards), FastAPI, pytest-asyncio + httpx + testcontainers (backend tests), Tailwind CSS, lucide-react

---

## File Map

| Action | File                                                    |
| ------ | ------------------------------------------------------- |
| Modify | `backend/api/routes/auth.py`                            |
| Modify | `backend/services/invitation_service.py`                |
| Modify | `backend/api/routes/invitations.py`                     |
| Modify | `backend/tests/integration/test_auth_api.py`            |
| Modify | `backend/tests/integration/test_recruiter_api.py`       |
| Modify | `frontend/types/api.ts`                                 |
| Create | `frontend/components/ui/StatCard.tsx`                   |
| Create | `frontend/components/ui/QuickActionCard.tsx`            |
| Modify | `frontend/components/nav-sidebar.tsx`                   |
| Modify | `frontend/app/(candidate)/layout.tsx`                   |
| Modify | `frontend/app/(recruiter)/layout.tsx`                   |
| Modify | `frontend/app/page.tsx`                                 |
| Create | `frontend/app/(candidate)/candidate/dashboard/page.tsx` |
| Create | `frontend/app/(recruiter)/recruiter/dashboard/page.tsx` |

---

## Task 1: Backend — `GET /auth/me` endpoint

**Files:**

- Modify: `backend/api/routes/auth.py`
- Test: `backend/tests/integration/test_auth_api.py`

- [ ] **Step 1: Write the failing test**

Add at the bottom of `backend/tests/integration/test_auth_api.py`:

```python
async def test_get_me_returns_current_user(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/auth/me", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "candidate@test.com"
    assert data["role"] == "candidate"
    assert "id" in data
    assert "hashed_password" not in data


async def test_get_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_get_me_works_for_recruiter(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/auth/me", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.json()["role"] == "recruiter"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
uv run pytest tests/integration/test_auth_api.py::test_get_me_returns_current_user tests/integration/test_auth_api.py::test_get_me_requires_auth tests/integration/test_auth_api.py::test_get_me_works_for_recruiter -v
```

Expected: 3 failures — `404 Not Found` or route not found.

- [ ] **Step 3: Add the endpoint**

In `backend/api/routes/auth.py`, add this import at the top (with the other imports):

```python
from api.deps import CurrentUser
```

Then add this endpoint anywhere in the file after the existing routes (e.g. after the `logout` route):

```python
@router.get("/me", response_model=UserRead)
async def get_me(current_user: CurrentUser) -> User:
    return current_user
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend
uv run pytest tests/integration/test_auth_api.py::test_get_me_returns_current_user tests/integration/test_auth_api.py::test_get_me_requires_auth tests/integration/test_auth_api.py::test_get_me_works_for_recruiter -v
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/api/routes/auth.py backend/tests/integration/test_auth_api.py
git commit -m "feat(backend): add GET /auth/me endpoint"
```

---

## Task 2: Backend — `GET /organizations/{org_id}/invitations` endpoint

**Files:**

- Modify: `backend/services/invitation_service.py`
- Modify: `backend/api/routes/invitations.py`
- Test: `backend/tests/integration/test_recruiter_api.py`

- [ ] **Step 1: Write the failing test**

Find an existing test in `backend/tests/integration/test_recruiter_api.py` that creates an org and get the fixture pattern, then add at the bottom of that file:

```python
async def test_list_org_invitations_returns_created_invitations(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    # Create org and link recruiter
    org_r = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Inv Corp"}
    )
    org_id = org_r.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )

    # Send an invitation
    await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "cand@test.com"},
    )

    r = await client.get(
        f"/organizations/{org_id}/invitations", headers=recruiter_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["candidate_email"] == "cand@test.com"
    assert data[0]["status"] == "pending"


async def test_list_org_invitations_requires_membership(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    # Create org but do NOT link recruiter to it
    org_r = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Other Corp"}
    )
    other_org_id = org_r.json()["id"]

    r = await client.get(
        f"/organizations/{other_org_id}/invitations", headers=recruiter_headers
    )
    assert r.status_code == 403
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
uv run pytest tests/integration/test_recruiter_api.py::test_list_org_invitations_returns_created_invitations tests/integration/test_recruiter_api.py::test_list_org_invitations_requires_membership -v
```

Expected: 2 failures — `404 Not Found`.

- [ ] **Step 3: Add `list_org_invitations` service function**

In `backend/services/invitation_service.py`, add after `list_candidate_invitations`:

```python
async def list_org_invitations(
    db: AsyncSession, org_id: UUID
) -> list[Invitation]:
    """Return all invitations sent by an organization."""
    result = await db.execute(
        select(Invitation).where(Invitation.organization_id == org_id)
    )
    return list(result.scalars().all())
```

- [ ] **Step 4: Add the route**

In `backend/api/routes/invitations.py`, add after the `create_invitation` route (around line 46):

```python
@router.get(
    "/organizations/{org_id}/invitations",
    response_model=list[InvitationRead],
)
async def list_org_invitations(
    org_id: UUID,
    current_user: RecruiterUser,
    db: DB,
) -> list[Invitation]:
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )
    return await invitation_service.list_org_invitations(db, org_id)
```

Make sure `recruiter_service` is imported — check the top of the file and add if missing:

```python
import services.recruiter_service as recruiter_service
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend
uv run pytest tests/integration/test_recruiter_api.py::test_list_org_invitations_returns_created_invitations tests/integration/test_recruiter_api.py::test_list_org_invitations_requires_membership -v
```

Expected: 2 PASS.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
cd backend
uv run pytest tests/ -v --tb=short
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/services/invitation_service.py backend/api/routes/invitations.py backend/tests/integration/test_recruiter_api.py
git commit -m "feat(backend): add GET /organizations/{org_id}/invitations endpoint"
```

---

## Task 3: Frontend — Add missing type + `StatCard` component

**Files:**

- Modify: `frontend/types/api.ts`
- Create: `frontend/components/ui/StatCard.tsx`

- [ ] **Step 1: Add `GeneratedDocumentCandidateView` type to `frontend/types/api.ts`**

Add after the `GeneratedDocument` interface (around line 185):

```typescript
export interface GeneratedDocumentCandidateView {
  id: string;
  generated_at: string;
  file_format: string;
  organization_name: string;
  template_name: string;
}
```

- [ ] **Step 2: Create `frontend/components/ui/StatCard.tsx`**

```tsx
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  color?: "primary" | "amber" | "emerald" | "neutral";
}

const COLOR_MAP: Record<NonNullable<StatCardProps["color"]>, string> = {
  primary: "text-primary",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  neutral: "text-foreground",
};

export function StatCard({
  label,
  value,
  subtitle,
  color = "neutral",
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </p>
      <p className={cn("mt-1 text-3xl font-bold", COLOR_MAP[color])}>{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/types/api.ts frontend/components/ui/StatCard.tsx
git commit -m "feat(frontend): add StatCard component and GeneratedDocumentCandidateView type"
```

---

## Task 4: Frontend — `QuickActionCard` component

**Files:**

- Create: `frontend/components/ui/QuickActionCard.tsx`

- [ ] **Step 1: Create `frontend/components/ui/QuickActionCard.tsx`**

```tsx
import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickActionCardProps {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
  badge?: number;
}

export function QuickActionCard({
  icon: Icon,
  label,
  description,
  href,
  badge,
}: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <Icon className="size-5 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ui/QuickActionCard.tsx
git commit -m "feat(frontend): add QuickActionCard component"
```

---

## Task 5: Frontend — NavSidebar `homeHref` + dashboard nav items in both layouts

**Files:**

- Modify: `frontend/components/nav-sidebar.tsx`
- Modify: `frontend/app/(candidate)/layout.tsx`
- Modify: `frontend/app/(recruiter)/layout.tsx`

- [ ] **Step 1: Update `NavSidebar` interface and logo link**

In `frontend/components/nav-sidebar.tsx`:

1. Add `LayoutDashboard` to the lucide-react import line:

```tsx
import {
  LayoutDashboard,
  User,
  Briefcase,
  Mail,
  Shield,
  Clock,
  Settings,
  FileText,
  Send,
  Users,
  Zap,
  Sparkles,
  History,
  LogOut,
} from "lucide-react";
```

2. Update the `NavSidebarProps` interface:

```tsx
interface NavSidebarProps {
  items: NavItem[];
  title: string;
  homeHref: string;
}
```

3. Add dashboard entries to `ICON_MAP`:

```tsx
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "/candidate/dashboard": LayoutDashboard,
  "/recruiter/dashboard": LayoutDashboard,
  "/candidate/profile": User,
  "/candidate/skills": Briefcase,
  "/candidate/requests": Mail,
  "/candidate/access": Shield,
  "/candidate/history": History,
  "/candidate/settings": Settings,
  "/recruiter/templates": FileText,
  "/recruiter/invitations": Send,
  "/recruiter/candidates": Users,
  "/recruiter/opportunities": Zap,
  "/recruiter/generate": Sparkles,
  "/recruiter/history": Clock,
};
```

4. Update the function signature and logo `href`:

```tsx
export function NavSidebar({ items, title, homeHref }: NavSidebarProps) {
```

And change the logo `Link` from `href="/"` to `href={homeHref}`:

```tsx
<Link href={homeHref} className="mb-6 flex items-center gap-2.5 px-3 py-1">
```

- [ ] **Step 2: Update candidate layout**

Replace the entire content of `frontend/app/(candidate)/layout.tsx`:

```tsx
import { NavSidebar } from "@/components/nav-sidebar";

const candidateNav = [
  { href: "/candidate/dashboard", label: "Tableau de bord" },
  { href: "/candidate/profile", label: "Mon profil" },
  { href: "/candidate/skills", label: "Compétences" },
  { href: "/candidate/requests", label: "Invitations" },
  { href: "/candidate/access", label: "Accès accordés" },
  { href: "/candidate/history", label: "Historique" },
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

- [ ] **Step 3: Update recruiter layout**

Replace the entire content of `frontend/app/(recruiter)/layout.tsx`:

```tsx
import { NavSidebar } from "@/components/nav-sidebar";

const recruiterNav = [
  { href: "/recruiter/dashboard", label: "Tableau de bord" },
  { href: "/recruiter/templates", label: "Templates" },
  { href: "/recruiter/invitations", label: "Invitations" },
  { href: "/recruiter/candidates", label: "Candidats" },
  { href: "/recruiter/opportunities", label: "Opportunités" },
  { href: "/recruiter/generate", label: "Générer" },
  { href: "/recruiter/history", label: "Historique" },
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

- [ ] **Step 4: Commit**

```bash
git add frontend/components/nav-sidebar.tsx frontend/app/"(candidate)"/layout.tsx frontend/app/"(recruiter)"/layout.tsx
git commit -m "feat(frontend): add dashboard nav items and fix logo homeHref"
```

---

## Task 6: Frontend — Smart root page redirect

**Files:**

- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Replace `frontend/app/page.tsx`**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) redirect("/login");

  const apiUrl = process.env.NEXT_PRIVATE_API_URL ?? "http://localhost:8000";

  const res = await fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) redirect("/login");

  const user = (await res.json()) as { role: "candidate" | "recruiter" };
  redirect(
    user.role === "candidate" ? "/candidate/dashboard" : "/recruiter/dashboard",
  );
}
```

- [ ] **Step 2: Start the dev server and verify**

```bash
cd frontend
npm run dev
```

Open http://localhost:3000 in a browser:

- Not logged in → should redirect to `/login`
- Logged in as candidate → should redirect to `/candidate/dashboard` (404 for now, that's expected)
- Logged in as recruiter → should redirect to `/recruiter/dashboard` (404 for now, that's expected)

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(frontend): smart root redirect based on user role"
```

---

## Task 7: Frontend — Candidate dashboard page

**Files:**

- Create: `frontend/app/(candidate)/candidate/dashboard/page.tsx`

- [ ] **Step 1: Create the candidate dashboard page**

Create `frontend/app/(candidate)/candidate/dashboard/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { User, Mail, Shield, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { QuickActionCard } from "@/components/ui/QuickActionCard";
import type {
  CandidateProfile,
  Invitation,
  AccessGrant,
  OrganizationInteractionCard,
  GeneratedDocumentCandidateView,
  Skill,
  Experience,
} from "@/types/api";

const EVENT_LABELS: Record<string, string> = {
  invitation_sent: "invitation envoyée",
  invitation_accepted: "invitation acceptée",
  invitation_rejected: "invitation refusée",
  invitation_expired: "invitation expirée",
  access_granted: "accès accordé",
  access_revoked: "accès révoqué",
  document_generated: "dossier généré",
};

function calcCompletion(
  profile: CandidateProfile,
  skills: Skill[],
  experiences: Experience[],
): number {
  const filled = [
    !!profile.first_name,
    !!profile.last_name,
    !!profile.title,
    !!profile.summary,
    !!profile.phone,
    !!profile.location,
    !!profile.work_mode,
    !!profile.linkedin_url,
    skills.length > 0,
    experiences.length > 0,
  ].filter(Boolean).length;
  return Math.round((filled / 10) * 100);
}

interface RecentEvent {
  type: string;
  occurred_at: string;
  org: string;
}

interface DashboardData {
  firstName: string | null;
  completionPct: number;
  pendingInvitations: number;
  activeGrants: number;
  docsCount: number;
  recentActivity: RecentEvent[];
}

export default function CandidateDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<CandidateProfile>("/candidates/me/profile"),
      api.get<Invitation[]>("/invitations/me"),
      api.get<AccessGrant[]>("/access/me"),
      api.get<GeneratedDocumentCandidateView[]>("/candidates/me/documents"),
      api.get<OrganizationInteractionCard[]>("/candidates/me/organizations"),
      api.get<Skill[]>("/candidates/me/skills"),
      api.get<Experience[]>("/candidates/me/experiences"),
    ])
      .then(
        ([profile, invitations, grants, docs, orgs, skills, experiences]) => {
          const allEvents: RecentEvent[] = orgs
            .flatMap((o) =>
              o.events.map((e) => ({
                type: e.type,
                occurred_at: e.occurred_at,
                org: o.organization_name,
              })),
            )
            .sort(
              (a, b) =>
                new Date(b.occurred_at).getTime() -
                new Date(a.occurred_at).getTime(),
            );

          setData({
            firstName: profile.first_name,
            completionPct: calcCompletion(profile, skills, experiences),
            pendingInvitations: invitations.filter(
              (i) => i.status === "pending",
            ).length,
            activeGrants: grants.filter((g) => g.status === "active").length,
            docsCount: docs.length,
            recentActivity: allEvents.slice(0, 3),
          });
        },
      )
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!data) return null;

  const greeting = data.firstName
    ? `Bonjour, ${data.firstName} 👋`
    : "Bonjour 👋";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Voici l'état de votre espace candidat.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Profil complété"
          value={`${data.completionPct}%`}
          color="primary"
          subtitle="informations renseignées"
        />
        <StatCard
          label="Invitations"
          value={data.pendingInvitations}
          color="amber"
          subtitle="en attente"
        />
        <StatCard
          label="Accès actifs"
          value={data.activeGrants}
          color="emerald"
          subtitle="organisations"
        />
        <StatCard
          label="Dossiers générés"
          value={data.docsCount}
          color="neutral"
          subtitle="par les recruteurs"
        />
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Actions rapides
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickActionCard
            icon={User}
            label="Compléter mon profil"
            description={`${data.completionPct}% complété`}
            href="/candidate/profile"
          />
          <QuickActionCard
            icon={Mail}
            label="Mes invitations"
            description={`${data.pendingInvitations} en attente`}
            href="/candidate/requests"
            badge={data.pendingInvitations}
          />
          <QuickActionCard
            icon={Shield}
            label="Gérer mes accès"
            description={`${data.activeGrants} organisation${data.activeGrants !== 1 ? "s" : ""} autorisée${data.activeGrants !== 1 ? "s" : ""}`}
            href="/candidate/access"
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Activité récente
        </p>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune activité pour l'instant.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {data.recentActivity.map((event, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <Clock className="size-4 shrink-0 text-muted-foreground/50" />
                <span className="flex-1">
                  <strong>{event.org}</strong> —{" "}
                  {EVENT_LABELS[event.type] ?? event.type}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.occurred_at).toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

With the dev server running, log in as a candidate. Navigate to `/candidate/dashboard`. Verify:

- Stats load (skeleton first, then numbers)
- Logo click redirects to `/candidate/dashboard` (not `/login`)
- "Tableau de bord" appears as first nav item with `LayoutDashboard` icon
- Clicking a QuickActionCard navigates to the correct page

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(candidate)/candidate/dashboard/page.tsx"
git commit -m "feat(frontend): add candidate dashboard page"
```

---

## Task 8: Frontend — Recruiter dashboard page

**Files:**

- Create: `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`

- [ ] **Step 1: Create the recruiter dashboard page**

Create `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Mail, Sparkles, Users, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { QuickActionCard } from "@/components/ui/QuickActionCard";
import { useRecruiterOrg } from "@/lib/hooks";
import type {
  AccessibleCandidateRead,
  OpportunityRead,
  Invitation,
  GeneratedDocument,
  RecruiterProfile,
} from "@/types/api";

interface DashboardData {
  firstName: string | null;
  candidateCount: number;
  openOpportunities: number;
  pendingInvitations: number;
  totalDocs: number;
  recentDocs: GeneratedDocument[];
}

export default function RecruiterDashboardPage() {
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([
      api.get<RecruiterProfile>("/recruiters/me/profile"),
      api.get<AccessibleCandidateRead[]>(`/organizations/${orgId}/candidates`),
      api.get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`),
      api.get<Invitation[]>(`/organizations/${orgId}/invitations`),
      api.get<GeneratedDocument[]>(`/organizations/${orgId}/documents`),
    ])
      .then(([profile, candidates, opps, invitations, docs]) => {
        const sorted = [...docs].sort(
          (a, b) =>
            new Date(b.generated_at).getTime() -
            new Date(a.generated_at).getTime(),
        );
        setData({
          firstName: profile.first_name,
          candidateCount: candidates.length,
          openOpportunities: opps.filter((o) => o.status === "open").length,
          pendingInvitations: invitations.filter((i) => i.status === "pending")
            .length,
          totalDocs: docs.length,
          recentDocs: sorted.slice(0, 3),
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  if (orgLoading || loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Bonjour 👋
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Associez votre compte à une organisation pour accéder au tableau de
          bord.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const greeting = data.firstName
    ? `Bonjour, ${data.firstName} 👋`
    : "Bonjour 👋";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aperçu de votre activité recrutement.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Candidats"
          value={data.candidateCount}
          color="primary"
          subtitle="accessibles"
        />
        <StatCard
          label="Opportunités"
          value={data.openOpportunities}
          color="emerald"
          subtitle="ouvertes"
        />
        <StatCard
          label="Invitations"
          value={data.pendingInvitations}
          color="amber"
          subtitle="en attente"
        />
        <StatCard
          label="Dossiers générés"
          value={data.totalDocs}
          color="neutral"
          subtitle="au total"
        />
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Actions rapides
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickActionCard
            icon={Mail}
            label="Inviter un candidat"
            description="Envoyer une invitation par email"
            href="/recruiter/invitations"
          />
          <QuickActionCard
            icon={Sparkles}
            label="Générer un dossier"
            description="Créer un dossier candidat"
            href="/recruiter/generate"
          />
          <QuickActionCard
            icon={Users}
            label="Voir les candidats"
            description={`${data.candidateCount} profil${data.candidateCount !== 1 ? "s" : ""} accessible${data.candidateCount !== 1 ? "s" : ""}`}
            href="/recruiter/candidates"
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Dossiers récents
        </p>
        {data.recentDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun dossier généré pour l'instant.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {data.recentDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <Clock className="size-4 shrink-0 text-muted-foreground/50" />
                <span className="flex-1">
                  Dossier{" "}
                  <span className="font-medium uppercase">
                    {doc.file_format}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(doc.generated_at).toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

With the dev server running, log in as a recruiter. Navigate to `/recruiter/dashboard`. Verify:

- Stats load correctly (skeleton, then numbers)
- Logo click redirects to `/recruiter/dashboard`
- "Tableau de bord" appears as first nav item
- If no org linked: shows the "Associez votre compte" message instead of crashing
- QuickActionCards navigate to correct pages

- [ ] **Step 3: Final commit**

```bash
git add "frontend/app/(recruiter)/recruiter/dashboard/page.tsx"
git commit -m "feat(frontend): add recruiter dashboard page"
```
