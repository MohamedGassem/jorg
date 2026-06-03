# Alpha Preparation — Onboarding Addendum

> **For agentic workers:** This is Part 2 of the alpha preparation plan. Complete `2026-06-03-alpha-preparation.md` (Tasks 1–14) first.
>
> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add step-by-step onboarding for candidates (2 post-registration pages) and recruiters (2 post-registration pages), enriched registration form (first_name/last_name), and first-login redirect logic.

---

## Dependency map

```
Track I (Backend — Onboarding flag + enriched registration, Task 15) → independent
Track J (Frontend — Onboarding pages, Tasks 16–19)                   → needs Track I
```

---

## File map

**Backend — modify:**

- `backend/models/candidate_profile.py` — add `onboarding_completed`
- `backend/models/recruiter.py` — add `onboarding_completed`
- `backend/alembic/versions/<hash>_add_onboarding_completed.py`
- `backend/schemas/candidate.py` — expose `onboarding_completed` in read + update schemas
- `backend/schemas/recruiter.py` — expose `onboarding_completed` in read + update schemas
- `backend/schemas/auth.py` — add `first_name`, `last_name` to `RegisterRequest`
- `backend/api/routes/auth.py` — save name to profile post-registration

**Frontend — create:**

- `frontend/app/onboarding/layout.tsx`
- `frontend/app/onboarding/candidate/profile/page.tsx`
- `frontend/app/onboarding/candidate/skills/page.tsx`
- `frontend/app/onboarding/recruiter/organization/page.tsx`
- `frontend/app/onboarding/recruiter/template/page.tsx`

**Frontend — modify:**

- `frontend/app/(public)/register/page.tsx` — first_name, last_name fields
- `frontend/app/(candidate)/candidate/dashboard/page.tsx` — onboarding redirect
- `frontend/app/(recruiter)/recruiter/dashboard/page.tsx` — onboarding redirect

---

## TRACK I — Backend: Onboarding flag + enriched registration

---

### Task 15: Add `onboarding_completed` to profiles + enriched registration

**Files:**

- Modify: `backend/models/candidate_profile.py`
- Modify: `backend/models/recruiter.py`
- Create: `backend/alembic/versions/<hash>_add_onboarding_completed.py`
- Modify: `backend/schemas/candidate.py`
- Modify: `backend/schemas/recruiter.py`
- Modify: `backend/schemas/auth.py`
- Modify: `backend/api/routes/auth.py`

- [ ] **Step 1: Add `onboarding_completed` to `CandidateProfile` model**

In `backend/models/candidate_profile.py`, inside the `CandidateProfile` class, add after `last_name`:

```python
onboarding_completed: Mapped[bool] = mapped_column(
    default=False, nullable=False, server_default="false"
)
```

- [ ] **Step 2: Add `onboarding_completed` to `RecruiterProfile` model**

In `backend/models/recruiter.py`, inside the `RecruiterProfile` class, add after `job_title`:

```python
onboarding_completed: Mapped[bool] = mapped_column(
    default=False, nullable=False, server_default="false"
)
```

- [ ] **Step 3: Generate and apply Alembic migration**

```bash
cd backend
uv run alembic revision --autogenerate -m "add_onboarding_completed"
```

Open the generated file. Verify it adds `onboarding_completed` boolean column (server_default 'false') to both `candidate_profiles` and `recruiter_profiles`.

```bash
uv run alembic upgrade head
```

Expected: no error, columns added.

- [ ] **Step 4: Expose `onboarding_completed` in candidate schemas**

In `backend/schemas/candidate.py`, add to `CandidateProfileRead`:

```python
onboarding_completed: bool = False
```

Add to `CandidateProfileUpdate` (the PATCH-via-PUT schema):

```python
onboarding_completed: bool | None = None
```

- [ ] **Step 5: Expose `onboarding_completed` in recruiter schemas**

In `backend/schemas/recruiter.py`, add to `RecruiterProfileRead`:

```python
onboarding_completed: bool = False
```

Add to `RecruiterProfileUpdate`:

```python
onboarding_completed: bool | None = None
```

- [ ] **Step 6: Add `first_name`, `last_name` to `RegisterRequest`**

In `backend/schemas/auth.py`, update `RegisterRequest`:

```python
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    first_name: str | None = None
    last_name: str | None = None
    alpha_invite_code: str | None = None
```

- [ ] **Step 7: Save name to profile in register endpoint**

In `backend/api/routes/auth.py`, after the `register_user` call succeeds and before `send_verification_email`, add:

```python
# Persist first_name / last_name to profile immediately after account creation
if payload.first_name or payload.last_name:
    if user.role == UserRole.CANDIDATE:
        from services.candidate_service import get_or_create_candidate_profile
        profile = await get_or_create_candidate_profile(db, user.id)
        if payload.first_name:
            profile.first_name = payload.first_name
        if payload.last_name:
            profile.last_name = payload.last_name
        await db.commit()
    elif user.role == UserRole.RECRUITER:
        profile = await get_or_create_recruiter_profile(db, user.id)
        if payload.first_name:
            profile.first_name = payload.first_name
        if payload.last_name:
            profile.last_name = payload.last_name
        await db.commit()
```

> Verify the correct import for `get_or_create_candidate_profile` by checking `backend/services/` for a function that lazily creates candidate profiles (grep for `get_or_create` in `backend/services/`). `get_or_create_recruiter_profile` is already imported in the file.

- [ ] **Step 8: Write tests**

```python
# backend/tests/test_onboarding_flag.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_candidate_profile_has_onboarding_completed_false_by_default(
    client: AsyncClient,
):
    await client.post(
        "/auth/register",
        json={"email": "onboard@test.com", "password": "password123", "role": "candidate"},
    )
    await client.post("/auth/login", json={"email": "onboard@test.com", "password": "password123"})
    profile_resp = await client.get("/candidates/me/profile")
    assert profile_resp.status_code == 200
    assert profile_resp.json()["onboarding_completed"] is False


@pytest.mark.asyncio
async def test_registration_saves_first_and_last_name(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={
            "email": "named@test.com",
            "password": "password123",
            "role": "candidate",
            "first_name": "Alice",
            "last_name": "Martin",
        },
    )
    await client.post("/auth/login", json={"email": "named@test.com", "password": "password123"})
    profile_resp = await client.get("/candidates/me/profile")
    data = profile_resp.json()
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Martin"


@pytest.mark.asyncio
async def test_onboarding_completed_can_be_set_via_profile_update(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "complete@test.com", "password": "password123", "role": "candidate"},
    )
    await client.post("/auth/login", json={"email": "complete@test.com", "password": "password123"})
    resp = await client.put("/candidates/me/profile", json={"onboarding_completed": True})
    assert resp.status_code == 200
    assert resp.json()["onboarding_completed"] is True
```

- [ ] **Step 9: Run tests**

```bash
cd backend
uv run pytest tests/test_onboarding_flag.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/models/ backend/schemas/ backend/api/routes/auth.py backend/alembic/versions/ backend/tests/test_onboarding_flag.py
git commit -m "feat(onboarding): onboarding_completed flag, first_name/last_name in registration"
```

---

## TRACK J — Frontend: Onboarding pages

---

### Task 16: Enriched registration form (first_name, last_name)

**Files:**

- Modify: `frontend/app/(public)/register/page.tsx`

- [ ] **Step 1: Add name fields to form state**

```typescript
const [firstName, setFirstName] = useState("");
const [lastName, setLastName] = useState("");
```

- [ ] **Step 2: Add fields to the JSX after the role selector, before email**

```typescript
<div className="grid grid-cols-2 gap-3">
  <div className="space-y-1">
    <Label htmlFor="first-name">Prénom</Label>
    <Input
      id="first-name"
      value={firstName}
      onChange={(e) => setFirstName(e.target.value)}
      required
    />
  </div>
  <div className="space-y-1">
    <Label htmlFor="last-name">Nom</Label>
    <Input
      id="last-name"
      value={lastName}
      onChange={(e) => setLastName(e.target.value)}
      required
    />
  </div>
</div>
```

- [ ] **Step 3: Include in the submit payload**

Update the `api.post` call in `handleSubmit`:

```typescript
await api.post("/auth/register", {
  email,
  password,
  role,
  first_name: firstName || null,
  last_name: lastName || null,
});
```

> If the alpha invite code field (Task 13 from main plan) is also in this file, consolidate: add `alpha_invite_code: role === "recruiter" ? alphaCode || null : undefined` to the payload.

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep "register/page"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(public\)/register/page.tsx
git commit -m "feat(register): add first_name and last_name fields to registration form"
```

---

### Task 17: Onboarding layout + candidate pages (step 2 + step 3)

**Files:**

- Create: `frontend/app/onboarding/layout.tsx`
- Create: `frontend/app/onboarding/candidate/profile/page.tsx`
- Create: `frontend/app/onboarding/candidate/skills/page.tsx`

- [ ] **Step 1: Create the onboarding layout**

```typescript
// frontend/app/onboarding/layout.tsx
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create candidate onboarding step 2 — profile details**

```typescript
// frontend/app/onboarding/candidate/profile/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { ContractType } from "@/types/api";

export default function CandidateOnboardingProfilePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState<ContractType>("freelance");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put("/candidates/me/profile", {
        title: title || null,
        location: location || null,
        contract_type: contractType,
      });
      router.push("/onboarding/candidate/skills");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde");
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground">Étape 2 / 3</p>
        <CardTitle>Parlez-nous de vous</CardTitle>
        <CardDescription>
          Ces informations enrichissent votre dossier candidat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleContinue} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="title">Titre / poste actuel</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Développeur Full-Stack"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="location">Localisation</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="ex: Paris, France"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contract">Type de contrat recherché</Label>
            <Select
              value={contractType}
              onValueChange={(v) => setContractType(v as ContractType)}
            >
              <SelectTrigger id="contract">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="freelance">Freelance (TJM)</SelectItem>
                <SelectItem value="cdi">CDI (salaire annuel)</SelectItem>
                <SelectItem value="both">Les deux</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Enregistrement…" : "Continuer →"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create candidate onboarding step 3 — first experience (skippable)**

```typescript
// frontend/app/onboarding/candidate/skills/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

async function markOnboardingComplete() {
  await api.put("/candidates/me/profile", { onboarding_completed: true }).catch(() => {});
}

export default function CandidateOnboardingSkillsPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [role, setRole] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName || !role || !startDate) {
      setError("Tous les champs sont requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/candidates/me/experiences", {
        client_name: clientName,
        role,
        start_date: startDate,
        is_current: true,
      });
      await markOnboardingComplete();
      router.push("/candidate/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur lors de l'enregistrement");
      setSaving(false);
    }
  }

  async function handleSkip() {
    await markOnboardingComplete();
    router.push("/candidate/dashboard");
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground">Étape 3 / 3</p>
        <CardTitle>Votre première expérience</CardTitle>
        <CardDescription>
          Ajoutez votre expérience la plus récente pour enrichir votre dossier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleFinish} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="client">Nom du client / entreprise</Label>
            <Input
              id="client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-role">Votre rôle</Label>
            <Input
              id="exp-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="start">Date de début</Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Terminer"}
            </Button>
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Passer cette étape →
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep "onboarding/candidate"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/onboarding/
git commit -m "feat(onboarding): candidate onboarding layout + profile + skills pages"
```

---

### Task 18: Recruiter onboarding pages (step 2 + step 3)

**Files:**

- Create: `frontend/app/onboarding/recruiter/organization/page.tsx`
- Create: `frontend/app/onboarding/recruiter/template/page.tsx`

- [ ] **Step 1: Create recruiter onboarding step 2 — organization**

```typescript
// frontend/app/onboarding/recruiter/organization/page.tsx
"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OnboardingOrg } from "@/components/onboarding-org";

export default function RecruiterOnboardingOrgPage() {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground">Étape 2 / 3</p>
        <CardTitle>Votre organisation</CardTitle>
        <CardDescription>
          Créez votre cabinet ou rejoignez-en un existant via un code d'invitation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingOrg onComplete={() => router.push("/onboarding/recruiter/template")} />
      </CardContent>
    </Card>
  );
}
```

> **Note:** `OnboardingOrg` (`frontend/components/onboarding-org.tsx`) was created in the UX refonte plan. Verify it accepts an `onComplete` callback prop. If not, add `onComplete?: () => void` to its props and call it after successful org creation/join.

- [ ] **Step 2: Create recruiter onboarding step 3 — template (skippable)**

```typescript
// frontend/app/onboarding/recruiter/template/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";

async function markOnboardingComplete() {
  await api.put("/recruiters/me/profile", { onboarding_completed: true }).catch(() => {});
}

export default function RecruiterOnboardingTemplatePage() {
  const router = useRouter();

  async function handleSkip() {
    await markOnboardingComplete();
    router.push("/recruiter/dashboard");
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground">Étape 3 / 3</p>
        <CardTitle>Votre premier template</CardTitle>
        <CardDescription>
          Configurez vos templates depuis la page Dossiers. Vous pouvez le faire maintenant ou plus
          tard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Les templates permettent de générer des dossiers personnalisés pour vos clients. Rendez-vous
          dans <strong>Dossiers → Templates</strong> pour en créer ou en importer un.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={async () => {
              await markOnboardingComplete();
              router.push("/recruiter/documents");
            }}
          >
            Configurer mes templates →
          </Button>
          <Button variant="ghost" onClick={handleSkip}>
            Passer cette étape →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

> **Simplification note:** The sample template endpoint (`GET /templates/samples`) doesn't exist yet. This step therefore skips template selection and sends the recruiter to the Dossiers page if they want to set up templates, or to the dashboard if they skip. Add `POST /templates/samples` to the post-alpha backlog.

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep "onboarding/recruiter"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/onboarding/recruiter/
git commit -m "feat(onboarding): recruiter onboarding pages — organization + template"
```

---

### Task 19: Onboarding redirect on first login

**Files:**

- Modify: `frontend/app/(candidate)/candidate/dashboard/page.tsx`
- Modify: `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`

The dashboard pages check `onboarding_completed` on mount and redirect to `/onboarding/...` if false. The onboarding pages are outside the candidate/recruiter layout groups so no redirect loop is possible.

- [ ] **Step 1: Add onboarding redirect to candidate dashboard**

In `frontend/app/(candidate)/candidate/dashboard/page.tsx`, in the main component, add at the top:

```typescript
import { useRouter } from "next/navigation";
// ... existing imports ...

// Inside the default export component, before other useEffect calls:
const router = useRouter();
useEffect(() => {
  api
    .get<{ onboarding_completed: boolean }>("/candidates/me/profile")
    .then((p) => {
      if (!p.onboarding_completed) {
        router.replace("/onboarding/candidate/profile");
      }
    })
    .catch(() => {});
}, [router]);
```

> If the dashboard already has a profile fetch useEffect, merge this check into it rather than adding a second fetch.

- [ ] **Step 2: Add onboarding redirect to recruiter dashboard**

In `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`, add the same pattern:

```typescript
const router = useRouter();
useEffect(() => {
  api
    .get<{ onboarding_completed: boolean }>("/recruiters/me/profile")
    .then((p) => {
      if (!p.onboarding_completed) {
        router.replace("/onboarding/recruiter/organization");
      }
    })
    .catch(() => {});
}, [router]);
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Smoke test manually**

```bash
cd frontend && npm run dev
```

1. Register a new candidate — verify you land on `/onboarding/candidate/profile` after first login.
2. Complete steps 2 and 3 — verify you land on `/candidate/dashboard`.
3. Log out and log back in — verify you land directly on `/candidate/dashboard` (no redirect).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/dashboard/page.tsx frontend/app/\(recruiter\)/recruiter/dashboard/page.tsx
git commit -m "feat(onboarding): redirect to onboarding on first login if onboarding_completed=false"
```
