# Nav, UX fixes & Landing page -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 UX bugs in the authenticated app and add a public landing page at `/`.

**Architecture:** Pure frontend changes. Tasks 1-3 must run in sequence (extract → update import → delete). Tasks 4, 5, 6 are independent and can run in parallel with each other and with 7-8. Tasks 7 and 8 must run in that order.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, lucide-react.

---

## File map

**Create:**

- `frontend/components/candidate/profile-sections.tsx` — extracted section components from skills page
- `frontend/components/landing/LandingNav.tsx`
- `frontend/components/landing/LandingHero.tsx`
- `frontend/components/landing/LandingBridge.tsx`
- `frontend/components/landing/LandingFeatures.tsx`
- `frontend/components/landing/LandingAlpha.tsx`
- `frontend/components/landing/LandingFooter.tsx`

**Modify:**

- `frontend/app/(candidate)/candidate/profile/page.tsx` — update import path
- `frontend/components/nav-sidebar.tsx` — Clock → FileText
- `frontend/app/(recruiter)/recruiter/dashboard/page.tsx` — fix quick actions
- `frontend/app/(public)/register/page.tsx` — role pre-selection via query param
- `frontend/app/page.tsx` — landing for unauthenticated users

**Delete:**

- `frontend/app/(candidate)/candidate/history/page.tsx`
- `frontend/app/(candidate)/candidate/requests/page.tsx`
- `frontend/app/(candidate)/candidate/skills/page.tsx`
- `frontend/app/(recruiter)/recruiter/generate/page.tsx`
- `frontend/app/(recruiter)/recruiter/history/page.tsx`
- `frontend/app/(recruiter)/recruiter/invitations/page.tsx`
- `frontend/app/(recruiter)/recruiter/templates/page.tsx`
- `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx`

---

## Task 1: Extract profile section components

**Files:**

- Create: `frontend/components/candidate/profile-sections.tsx`

- [ ] **Step 1: Create the file**

Copy the entire content of `frontend/app/(candidate)/candidate/skills/page.tsx` into the new file, **removing only the default export** at the bottom (lines 2454-2460). Keep everything else unchanged: the `"use client"` directive, all imports, all helper types/constants/functions, and all named exports (`ExperienceSection`, `SkillSection`, `EducationSection`, `CertificationSection`, `LanguageSection`).

```tsx
// frontend/components/candidate/profile-sections.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Plus, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type {
  Achievement,
  AchievementSkillTag,
  Experience,
  ExperienceSkillUsage,
  Skill,
  SkillReference,
  SkillKind,
  Education,
  Certification,
  Language,
  LanguageLevel,
} from "@/types/api";

// ---- shared helpers ----------------------------------------------------------

const LANGUAGE_LEVELS: { value: LanguageLevel; label: string }[] = [
  { value: "A1", label: "A1 — Débutant" },
  { value: "A2", label: "A2 — Élémentaire" },
  { value: "B1", label: "B1 — Intermédiaire" },
  { value: "B2", label: "B2 — Indépendant" },
  { value: "C1", label: "C1 — Avancé" },
  { value: "C2", label: "C2 — Maîtrise" },
  { value: "native", label: "Langue maternelle" },
];

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? url
      : null;
  } catch {
    return null;
  }
}

function Textarea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  );
}

function SectionAddButton({
  adding,
  onToggle,
}: {
  adding: boolean;
  onToggle: () => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onToggle} className="gap-1.5">
      {adding ? (
        <>
          <X className="size-3.5" />
          Annuler
        </>
      ) : (
        <>
          <Plus className="size-3.5" />
          Ajouter
        </>
      )}
    </Button>
  );
}

function ItemActions({
  deleteLabel,
  onEdit,
  onDelete,
}: {
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label="Modifier"
        onClick={onEdit}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={deleteLabel}
        onClick={onDelete}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
```

Then continue copying everything from the source file up to (but not including) the `// ---- Page -------------------------------------------------------------------` section at line 2452. The file ends after `LanguageSection`'s closing brace.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors related to `profile-sections.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/candidate/profile-sections.tsx
git commit -m "refactor: extract profile section components to shared file"
```

---

## Task 2: Update import in profile/page.tsx

**Files:**

- Modify: `frontend/app/(candidate)/candidate/profile/page.tsx:19`

- [ ] **Step 1: Update the import**

In `frontend/app/(candidate)/candidate/profile/page.tsx`, find the import at line 19:

```tsx
// Before
import {
  ExperienceSection,
  SkillSection,
  EducationSection,
  CertificationSection,
  LanguageSection,
} from "@/app/(candidate)/candidate/skills/page";
```

Replace with:

```tsx
// After
import {
  ExperienceSection,
  SkillSection,
  EducationSection,
  CertificationSection,
  LanguageSection,
} from "@/components/candidate/profile-sections";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/profile/page.tsx
git commit -m "refactor: update import to shared profile-sections component"
```

---

## Task 3: Delete orphaned pages

**Files:** 8 files to delete (see list below).

- [ ] **Step 1: Delete the files**

```bash
rm frontend/app/\(candidate\)/candidate/history/page.tsx
rm frontend/app/\(candidate\)/candidate/requests/page.tsx
rm frontend/app/\(candidate\)/candidate/skills/page.tsx
rm frontend/app/\(recruiter\)/recruiter/generate/page.tsx
rm frontend/app/\(recruiter\)/recruiter/history/page.tsx
rm frontend/app/\(recruiter\)/recruiter/invitations/page.tsx
rm frontend/app/\(recruiter\)/recruiter/templates/page.tsx
rm -rf frontend/app/\(recruiter\)/recruiter/templates/\[id\]
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. If there are "cannot find module" errors, it means something else still imports from one of the deleted paths -- fix the import before continuing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete orphaned pages (old layout relics)"
```

---

## Task 4: Fix nav icon for Dossiers

**Files:**

- Modify: `frontend/components/nav-sidebar.tsx`

- [ ] **Step 1: Update ICON_MAP and imports**

In `frontend/components/nav-sidebar.tsx`, line 7, the import currently includes `Clock`. Replace it with `FileText`:

```tsx
// Before (line 7)
import {
  User,
  Shield,
  Clock,
  Settings,
  Users,
  Zap,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

// After
import {
  User,
  Shield,
  FileText,
  Settings,
  Users,
  Zap,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
```

Then in `ICON_MAP` (line 38):

```tsx
// Before
"/recruiter/documents": Clock,

// After
"/recruiter/documents": FileText,
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/nav-sidebar.tsx
git commit -m "fix(nav): replace Clock icon with FileText for Dossiers"
```

---

## Task 5: Fix recruiter dashboard quick actions

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`

- [ ] **Step 1: Update imports**

At the top of `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`, the current import from lucide-react is:

```tsx
import { FileText, Mail, Sparkles, Users } from "lucide-react";
```

Replace with (swap `Sparkles` for `Zap`, drop `FileText` since it's no longer used):

```tsx
import { Mail, Users, Zap } from "lucide-react";
```

- [ ] **Step 2: Replace the quick actions section**

Find the `<section>` block that starts with `<h2 className="mb-4 text-base font-semibold">Actions rapides</h2>` (around line 175). Replace the entire section:

```tsx
// Before
<section>
  <h2 className="mb-4 text-base font-semibold">Actions rapides</h2>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <QuickActionCard
      icon={Mail}
      label="Inviter un candidat"
      description="Envoyer une invitation par email"
      href="/recruiter/candidates"
    />
    <QuickActionCard
      icon={Sparkles}
      label="Générer un dossier"
      description="Créer un dossier candidat"
      href="/recruiter/candidates"
    />
    <QuickActionCard
      icon={Users}
      label="Voir les candidats"
      description={
        candidateCount !== null
          ? `${candidateCount} profil${candidateCount > 1 ? "s" : ""} accessible${candidateCount > 1 ? "s" : ""}`
          : "Voir les profils accessibles"
      }
      href="/recruiter/candidates"
    />
  </div>
</section>

// After
<section>
  <h2 className="mb-4 text-base font-semibold">Actions rapides</h2>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <QuickActionCard
      icon={Mail}
      label="Inviter un candidat"
      description="Envoyer une invitation par email"
      href="/recruiter/candidates"
    />
    <QuickActionCard
      icon={Zap}
      label="Créer une opportunité"
      description="Ouvrir un nouveau poste"
      href="/recruiter/opportunities"
    />
    <QuickActionCard
      icon={Users}
      label="Voir les candidats"
      description={
        candidateCount !== null
          ? `${candidateCount} profil${candidateCount > 1 ? "s" : ""} accessible${candidateCount > 1 ? "s" : ""}`
          : "Voir les profils accessibles"
      }
      href="/recruiter/candidates"
    />
  </div>
</section>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/dashboard/page.tsx
git commit -m "fix(dashboard): quick actions cover 3 distinct sections"
```

---

## Task 6: Register page -- role pre-selection via query param

**Files:**

- Modify: `frontend/app/(public)/register/page.tsx`

- [ ] **Step 1: Add useEffect import**

In `frontend/app/(public)/register/page.tsx`, line 1:

```tsx
// Before
import { useState } from "react";

// After
import { useEffect, useState } from "react";
```

- [ ] **Step 2: Add role pre-selection effect**

Find the `const [role, setRole] = useState<Role>("candidate");` line (around line 50). Immediately after it, add:

```tsx
const [role, setRole] = useState<Role>("candidate");

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const r = params.get("role");
  if (r === "candidate" || r === "recruiter") setRole(r);
}, []);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(public\)/register/page.tsx
git commit -m "feat(register): pre-select role from ?role= query param"
```

---

## Task 7: Create landing page components

**Files:**

- Create: `frontend/components/landing/LandingNav.tsx`
- Create: `frontend/components/landing/LandingHero.tsx`
- Create: `frontend/components/landing/LandingBridge.tsx`
- Create: `frontend/components/landing/LandingFeatures.tsx`
- Create: `frontend/components/landing/LandingAlpha.tsx`
- Create: `frontend/components/landing/LandingFooter.tsx`

- [ ] **Step 1: Create LandingNav**

```tsx
// frontend/components/landing/LandingNav.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            J
          </span>
          <span className="font-heading text-base font-semibold tracking-tight text-foreground">
            Jorg
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Se connecter
            </Button>
          </Link>
          <Link href="/register?role=recruiter">
            <Button size="sm">Request recruiter access</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create LandingHero**

```tsx
// frontend/components/landing/LandingHero.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
        The skill profile platform
      </p>
      <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Build your profile once.
        <br />
        Share it securely.
        <br />
        Generate tailored dossiers in seconds.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
        Candidates constantly rewrite the same information across CVs and skill
        dossiers. Jorg fixes that&nbsp;&mdash; for everyone in the loop.
      </p>
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link href="/register?role=recruiter">
          <Button size="lg" className="w-full sm:w-auto">
            Request recruiter access
          </Button>
        </Link>
        <Link href="/register?role=candidate">
          <Button size="lg" variant="outline" className="w-full sm:w-auto">
            Create your candidate profile
          </Button>
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create LandingBridge**

```tsx
// frontend/components/landing/LandingBridge.tsx
export function LandingBridge() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto grid max-w-5xl grid-cols-1 sm:grid-cols-2">
        <div className="border-b border-border px-8 py-12 sm:border-b-0 sm:border-r">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-600">
            Pour les candidats
          </p>
          <p className="text-base text-foreground">
            Maintenez un seul profil structuré. Contrôlez précisément qui peut y
            accéder et pendant combien de temps.
          </p>
        </div>
        <div className="px-8 py-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
            Pour les recruteurs
          </p>
          <p className="text-base text-foreground">
            Générez des dossiers candidats sur mesure en quelques secondes. Fini
            le copier-coller entre outils.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create LandingFeatures**

```tsx
// frontend/components/landing/LandingFeatures.tsx
const FEATURES = [
  {
    title: "Profil structuré",
    description:
      "Expériences, compétences, formations. Tout au même endroit, maintenu par le candidat lui-même.",
  },
  {
    title: "Accès contrôlé",
    description:
      "Le candidat décide qui peut consulter son profil. Les accès sont révocables à tout moment.",
  },
  {
    title: "Génération IA",
    description:
      "Transformez un profil en dossier client-ready en 30 secondes, adapté au poste et au format voulu.",
  },
] as const;

export function LandingFeatures() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create LandingAlpha**

```tsx
// frontend/components/landing/LandingAlpha.tsx
export function LandingAlpha() {
  return (
    <div className="bg-muted/50 py-4 text-center">
      <p className="text-sm text-muted-foreground">
        Produit en accès privé alpha&nbsp;&mdash; les recruteurs rejoignent sur
        invitation.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Create LandingFooter**

```tsx
// frontend/components/landing/LandingFooter.tsx
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Jorg
        </p>
        <div className="flex gap-6">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Créer un compte
          </Link>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/landing/
git commit -m "feat(landing): add landing page components"
```

---

## Task 8: Update root page to show landing for unauthenticated users

**Files:**

- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Replace page.tsx**

```tsx
// frontend/app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingBridge } from "@/components/landing/LandingBridge";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingAlpha } from "@/components/landing/LandingAlpha";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (token) {
    try {
      const apiUrl =
        process.env.NEXT_PRIVATE_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${apiUrl}/auth/me`, {
        headers: { Cookie: `access_token=${token}` },
        cache: "no-store",
      });

      if (res.ok) {
        const user = (await res.json()) as { role: string };
        if (user.role === "candidate") redirect("/candidate/dashboard");
        if (user.role === "recruiter") redirect("/recruiter/dashboard");
      }
    } catch {
      // network error -- fall through to landing
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />
      <LandingHero />
      <LandingBridge />
      <LandingFeatures />
      <LandingAlpha />
      <LandingFooter />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Spot-check unauthenticated visit**

Start the dev server (`npm run dev` inside `frontend/`) and open `http://localhost:3000` in a private/incognito window (no cookies). Expected: the landing page renders with navbar, hero, bridge, features, alpha banner, footer. No redirect to `/login`.

- [ ] **Step 4: Spot-check authenticated redirect**

Log in as a candidate or recruiter, then navigate to `http://localhost:3000`. Expected: immediate redirect to `/candidate/dashboard` or `/recruiter/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(landing): show landing page for unauthenticated visitors"
```
