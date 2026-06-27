# Smoke test E2E alpha (P0-2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à jorg un smoke test E2E navigateur, rejouable en local, qui couvre le parcours critique recruteur→candidat→génération de dossier (DOCX) plus le nouvel éditeur de dossier adapté L3 (drag&drop, dirty, versions).

**Architecture:** Playwright (`@playwright/test`) pilote un Chromium réel contre la stack locale (postgres+gotenberg via docker-compose.dev, backend `uv`, frontend `next dev`). L'étape email d'invitation est franchie via une route de test backend gardée par un flag `e2e_test_mode`, qui rend le token d'une invitation. Le profil candidat est seedé via appels API authentifiés depuis le test (cookie jar du contexte Playwright), pour ne pas coupler le test au gros formulaire profil.

**Tech Stack:** Playwright/TypeScript (frontend), FastAPI/SQLAlchemy/pytest (backend), Next.js rewrite `/api/:path*` → backend.

## Global Constraints

- Backend lint/type: `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .` doivent passer (depuis `backend/`).
- Backend tests: `uv run pytest` (depuis `backend/`). Les tests d'intégration utilisent un PostgreSQL via `testcontainers` (fixtures dans `backend/tests/integration/conftest.py`).
- Frontend lint/type: `npm run lint`, `npx tsc --noEmit` doivent passer (depuis `frontend/`).
- Le proxy Next réécrit `/api/:path*` → `${NEXT_PRIVATE_API_URL ?? http://localhost:8000}/:path*`. Donc une route backend `/test/x` est appelée par le navigateur via `/api/test/x`.
- Ne jamais commit sur `master` (hook). Travailler sur la branche courante `dev` ou une branche dédiée.
- Windows : messages de commit via fichier temp + `git commit -F`, pas de chaînes multi-lignes inline.
- Pas d'em dash dans le code, les commentaires ou la doc.
- Le flag `e2e_test_mode` est `False` par défaut : la route de test doit rendre 404 quand il est désactivé.

---

### Task 1: Backend — flag `e2e_test_mode` + route de test du token d'invitation

**Files:**

- Modify: `backend/core/config.py` (ajout d'un champ à `Settings`)
- Create: `backend/api/routes/test_support.py`
- Modify: `backend/main.py:124` (montage du routeur, après `templates_router`)
- Create: `backend/tests/integration/test_test_support_api.py`

**Interfaces:**

- Produces: route HTTP `GET /test/last-invitation-token?email=<str>` rendant `{"token": str, "public_url": str}` (200) quand `e2e_test_mode` est vrai, 404 quand il est faux, 404 si aucune invitation pour cet email. `public_url` = `f"{settings.frontend_url}/invitation/{token}"`.
- Produces: `Settings.e2e_test_mode: bool = False`.
- Consumes (test seam) : le test E2E (Task 4) lit cette route via `/api/test/last-invitation-token`.

**Note de conception (déviation assumée vs spec) :** le routeur est monté **inconditionnellement** mais chaque endpoint vérifie `settings.e2e_test_mode` via une dépendance injectée et lève 404 si désactivé. Résultat identique côté sécurité (404, aucune donnée exposée en prod) et testable par override de dépendance sans gymnastique d'import. La dépendance settings permet de tester les deux états (on/off) dans la même app.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/tests/integration/test_test_support_api.py` :

```python
import pytest
from httpx import AsyncClient

from core.config import Settings, get_settings
from main import app


def _settings_with_e2e(enabled: bool) -> Settings:
    base = get_settings()
    return base.model_copy(update={"e2e_test_mode": enabled})


async def _make_invitation(client: AsyncClient, recruiter_headers: dict[str, str]) -> str:
    org = await client.post(
        "/organizations", json={"name": "E2E Org"}, headers=recruiter_headers
    )
    org_id = org.json()["id"]
    await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "invitee@e2e.test"},
        headers=recruiter_headers,
    )
    return "invitee@e2e.test"


@pytest.mark.asyncio
async def test_last_invitation_token_returns_token_when_enabled(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    from api.routes.test_support import get_settings_dep

    email = await _make_invitation(client, recruiter_headers)
    app.dependency_overrides[get_settings_dep] = lambda: _settings_with_e2e(True)
    try:
        res = await client.get(f"/test/last-invitation-token?email={email}")
    finally:
        app.dependency_overrides.pop(get_settings_dep, None)

    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["token"], str) and len(body["token"]) > 0
    assert body["public_url"].endswith(f"/invitation/{body['token']}")


@pytest.mark.asyncio
async def test_last_invitation_token_404_when_disabled(client: AsyncClient) -> None:
    from api.routes.test_support import get_settings_dep

    app.dependency_overrides[get_settings_dep] = lambda: _settings_with_e2e(False)
    try:
        res = await client.get("/test/last-invitation-token?email=whoever@e2e.test")
    finally:
        app.dependency_overrides.pop(get_settings_dep, None)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_last_invitation_token_404_when_no_invitation(client: AsyncClient) -> None:
    from api.routes.test_support import get_settings_dep

    app.dependency_overrides[get_settings_dep] = lambda: _settings_with_e2e(True)
    try:
        res = await client.get("/test/last-invitation-token?email=nobody@e2e.test")
    finally:
        app.dependency_overrides.pop(get_settings_dep, None)
    assert res.status_code == 404
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd backend && uv run pytest tests/integration/test_test_support_api.py -v`
Expected: FAIL à l'import (`api.routes.test_support` n'existe pas).

- [ ] **Step 3: Ajouter le flag à Settings**

Dans `backend/core/config.py`, à côté de `alpha_invite_required: bool = True` (ligne 65) :

```python
    # E2E smoke test seam: when true, mounts a read-only test-support route
    # exposing the latest invitation token so the browser test can skip email.
    # MUST stay false in production.
    e2e_test_mode: bool = False
```

- [ ] **Step 4: Créer le routeur de test**

Créer `backend/api/routes/test_support.py` :

```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from api.deps import DB
from core.config import Settings, get_settings
from models.invitation import Invitation

router = APIRouter(prefix="/test", tags=["test-support"])


def get_settings_dep() -> Settings:
    return get_settings()


@router.get("/last-invitation-token")
async def last_invitation_token(
    email: str,
    db: DB,
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> dict[str, str]:
    if not settings.e2e_test_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    result = await db.execute(
        select(Invitation)
        .where(Invitation.candidate_email == email)
        .order_by(Invitation.created_at.desc())
    )
    invitation = result.scalars().first()
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no invitation")
    return {
        "token": invitation.token,
        "public_url": f"{settings.frontend_url}/invitation/{invitation.token}",
    }
```

Note : vérifier que `DB` est bien le type de dépendance session exporté par `backend/api/deps.py` (utilisé par les autres routeurs). Si le nom diffère, reprendre l'import exact d'un routeur existant comme `backend/api/routes/candidates.py`.

- [ ] **Step 5: Monter le routeur dans main.py**

Dans `backend/main.py`, ajouter l'import à côté des autres (zone lignes 16-27) :

```python
from api.routes.test_support import router as test_support_router
```

et la ligne de montage après `app.include_router(templates_router)` (ligne 124) :

```python
app.include_router(test_support_router)
```

- [ ] **Step 6: Activer le flag dans l'environnement de test d'intégration**

Le routeur est monté inconditionnellement, mais l'endpoint lit `e2e_test_mode`. Les tests overrident la dépendance par test (déjà fait au Step 1), donc aucune modif de conftest n'est nécessaire. Ne pas modifier `backend/tests/conftest.py`.

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && uv run pytest tests/integration/test_test_support_api.py -v`
Expected: 3 PASS.

- [ ] **Step 8: Lint + types**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy .`
Expected: succès. Corriger si besoin (ex. annotations).

- [ ] **Step 9: Commit**

```bash
git add backend/core/config.py backend/api/routes/test_support.py backend/main.py backend/tests/integration/test_test_support_api.py
git commit -F <fichier-message>
```

Message : `feat(e2e): backend test-support route for invitation token behind e2e_test_mode`

---

### Task 2: Frontend — installer Playwright + config + smoke "l'app répond"

**Files:**

- Modify: `frontend/package.json` (devDependency + script `test:e2e`)
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/smoke.spec.ts` (test trivial de démarrage, remplacé/complété en Task 4)
- Modify: `frontend/.gitignore` (ou racine) pour ignorer les artefacts Playwright
- Modify: `frontend/eslint.config.*` si l'E2E doit être exclu du lint strict (voir Step 5)

**Interfaces:**

- Produces: commande `npm run test:e2e` exécutant Playwright contre `http://localhost:3000`.
- Produces: `playwright.config.ts` avec `baseURL: http://localhost:3000`, projet Chromium, pas de `webServer` (stack lancée à la main).

- [ ] **Step 1: Installer Playwright**

Run (depuis `frontend/`) :

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Ajouter le script test:e2e**

Dans `frontend/package.json`, section `scripts`, ajouter :

```json
    "test:e2e": "playwright test"
```

- [ ] **Step 3: Créer la config Playwright**

Créer `frontend/playwright.config.ts` :

```typescript
import { defineConfig, devices } from "@playwright/test";

// Smoke E2E local : la stack (docker-compose.dev + backend uv + next dev)
// est lancee a la main. Voir frontend/e2e/README.md.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 4: Créer un smoke test trivial**

Créer `frontend/e2e/smoke.spec.ts` :

```typescript
import { test, expect } from "@playwright/test";

test("la page de connexion repond", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
});
```

- [ ] **Step 5: Exclure l'E2E du build/lint si nécessaire**

Vérifier que `frontend/e2e/**` n'est pas avalé par `tsc --noEmit` du build app ni par eslint d'une façon qui casse la CI. Le `tsconfig.json` app couvre `**/*.ts` ; comme Playwright fournit ses propres types via l'import, `npx tsc --noEmit` devrait passer. Si une erreur survient (ex. types Playwright non résolus dans le projet app), ajouter `"e2e"` à `exclude` du `frontend/tsconfig.json`. Ne modifier que si une commande échoue effectivement.

- [ ] **Step 6: Ignorer les artefacts**

Ajouter à `frontend/.gitignore` (créer la section si absente) :

```
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 7: Lancer le smoke (stack lancée)**

Prérequis : démarrer la stack

```bash
docker compose -f docker-compose.dev.yml up -d
cd backend && E2E_TEST_MODE=true ALPHA_INVITE_REQUIRED=false uv run uvicorn main:app --port 8000 &
cd frontend && npm run dev &
```

Puis :
Run: `cd frontend && npm run test:e2e -- smoke.spec.ts`
Expected: 1 PASS. (Si l'app n'est pas lancée, le test échoue sur timeout — c'est attendu hors stack.)

- [ ] **Step 8: Vérifier lint + types frontend**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: succès.

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e/smoke.spec.ts frontend/.gitignore frontend/tsconfig.json
git commit -F <fichier-message>
```

Message : `chore(e2e): add Playwright runner and startup smoke test`

---

### Task 3: Frontend — helpers E2E (auth, organisation, invitation, seed profil)

**Files:**

- Create: `frontend/e2e/helpers/flows.ts`

**Interfaces:**

- Produces:
  - `uniqueEmail(prefix: string): string` — email unique par run (timestamp + random).
  - `registerAndLogin(page, { email, password, role, firstName, lastName }): Promise<void>` — passe par l'UI `/register` puis `/login`, laisse le cookie de session dans le contexte.
  - `createOrganization(page, name: string): Promise<void>` — via l'UI d'onboarding recruteur.
  - `inviteCandidate(page, candidateEmail: string): Promise<void>` — ouvre le dialogue d'invitation et envoie.
  - `fetchInvitationToken(request, candidateEmail: string): Promise<string>` — lit la route de test backend.
  - `seedCandidateExperiences(request, experiences): Promise<void>` — POST `/api/candidates/me/experiences` via le cookie jar.
- Consumes: route backend de Task 1 ; UI de `/register`, `/login`, `/onboarding/recruiter/organization`, `/recruiter/candidates`.

- [ ] **Step 1: Écrire les helpers**

Créer `frontend/e2e/helpers/flows.ts` :

```typescript
import { expect, type Page, type APIRequestContext } from "@playwright/test";

export function uniqueEmail(prefix: string): string {
  const stamp =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}+${stamp}@e2e.test`;
}

interface RegisterArgs {
  email: string;
  password: string;
  role: "candidate" | "recruiter";
  firstName: string;
  lastName: string;
}

export async function registerAndLogin(
  page: Page,
  args: RegisterArgs,
): Promise<void> {
  await page.goto("/register");
  // Selection du parcours (boutons par libelle).
  await page
    .getByRole("button", {
      name: args.role === "candidate" ? "Candidat" : "Recruteur",
    })
    .click();
  await page.locator("#first-name").fill(args.firstName);
  await page.locator("#last-name").fill(args.lastName);
  await page.locator("#email").fill(args.email);
  await page.locator("#password").fill(args.password);
  if (args.role === "recruiter") {
    // Le champ est requis cote UI ; le backend l'ignore quand alpha_invite_required=false.
    await page.locator("#alpha-code").fill("JORG-E2E-0000");
  }
  await page.getByRole("button", { name: "Créer mon compte Jorg" }).click();
  // Le register redirige vers l'onboarding mais ne connecte pas : on se connecte.
  await page.goto("/login");
  await page.getByLabel("Email").fill(args.email);
  await page.getByLabel("Mot de passe").fill(args.password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function createOrganization(
  page: Page,
  name: string,
): Promise<void> {
  await page.goto("/onboarding/recruiter/organization");
  await page.locator("#org-name").fill(name);
  await page.getByRole("button", { name: /Créer et continuer/ }).click();
  await page.waitForURL(/\/onboarding\/recruiter\/template/);
}

export async function inviteCandidate(
  page: Page,
  candidateEmail: string,
): Promise<void> {
  await page.goto("/recruiter/candidates");
  await page
    .getByRole("button", { name: /inviter/i })
    .first()
    .click();
  await page.locator("#invite-email").fill(candidateEmail);
  await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation envoyée");
}

export async function fetchInvitationToken(
  request: APIRequestContext,
  candidateEmail: string,
): Promise<string> {
  const res = await request.get(
    `/api/test/last-invitation-token?email=${encodeURIComponent(candidateEmail)}`,
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { token: string };
  return body.token;
}

interface SeedExperience {
  client_name: string;
  role: string;
  start_date: string; // YYYY-MM-DD
}

export async function seedCandidateExperiences(
  request: APIRequestContext,
  experiences: SeedExperience[],
): Promise<void> {
  for (const exp of experiences) {
    const res = await request.post("/api/candidates/me/experiences", {
      data: exp,
    });
    expect(res.ok()).toBeTruthy();
  }
}
```

- [ ] **Step 2: Vérifier types**

Run: `cd frontend && npx tsc --noEmit`
Expected: succès (pas d'erreur de type dans `e2e/helpers/flows.ts`).

- [ ] **Step 3: Note sur les sélecteurs à confirmer au premier run**

Deux libellés ne sont pas encore vérifiés dans le code lu et seront confirmés/ajustés quand le test de Task 4 tournera (red→green) :

- le bouton qui ouvre le dialogue d'invitation sur `/recruiter/candidates` (helper `inviteCandidate`, sélecteur `name: /inviter/i`). Si le run échoue, ouvrir `frontend/app/(recruiter)/recruiter/candidates/page.tsx`, repérer le bouton réel et ajuster le sélecteur, ou lui ajouter `data-testid="invite-candidate-trigger"` et cibler ce testid.
- le bouton submit de `/login` (`name: /se connecter/i`). Idem : confirmer dans `frontend/app/(public)/login/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/helpers/flows.ts
git commit -F <fichier-message>
```

Message : `chore(e2e): add reusable journey helpers`

---

### Task 4: E2E — golden path recruteur→candidat→génération DOCX

**Files:**

- Create: `frontend/e2e/golden-path.spec.ts`
- Possible modify: `frontend/app/(recruiter)/recruiter/candidates/page.tsx` (ajout d'un `data-testid` sur le déclencheur d'invitation si le sélecteur texte est ambigu — au choix selon le run)

**Interfaces:**

- Consumes: tous les helpers de Task 3, la route de Task 1.
- Produces: un test `golden-path.spec.ts` qui télécharge un `.docx`.

**Rappel du flux réel (vérifié dans le code) :**

- `/register` : boutons rôle "Candidat"/"Recruteur", inputs `#first-name`, `#last-name`, `#email`, `#password`, `#alpha-code` (recruteur), submit "Créer mon compte Jorg".
- `/onboarding/recruiter/organization` : `#org-name`, "Créer et continuer →" → `/onboarding/recruiter/template`.
- Invitation : dialogue `#invite-email`, "Envoyer l'invitation", succès `role="status"`.
- Page publique : `/invitation/<token>` ; quand connecté en candidat, bouton "Autoriser l'accès".
- Fiche candidat recruteur `/recruiter/candidates/[id]` : bouton "Composer un dossier" ouvre `DossierGenerationDialog`. Dans le dialogue : carte modèle Jorg (toujours présente), boutons format "Word (.docx)" / "PDF", bouton "Générer le dossier DOCX", puis "Télécharger (DOCX)".

- [ ] **Step 1: Écrire le test golden path**

Créer `frontend/e2e/golden-path.spec.ts` :

```typescript
import { test, expect } from "@playwright/test";
import {
  uniqueEmail,
  registerAndLogin,
  createOrganization,
  inviteCandidate,
  fetchInvitationToken,
  seedCandidateExperiences,
} from "./helpers/flows";

const PASSWORD = "E2ePassw0rd!";

test("recruteur invite, candidat accepte, recruteur genere un DOCX", async ({
  page,
  context,
}) => {
  const recruiterEmail = uniqueEmail("recruiter");
  const candidateEmail = uniqueEmail("candidate");

  // 1. Recruteur s'inscrit + cree une organisation.
  await registerAndLogin(page, {
    email: recruiterEmail,
    password: PASSWORD,
    role: "recruiter",
    firstName: "Rae",
    lastName: "Cruteur",
  });
  await createOrganization(page, "E2E Consulting");

  // 2. Recruteur invite le candidat (email unique).
  await inviteCandidate(page, candidateEmail);

  // 3. Lire le token via la route de test (cookie jar du contexte).
  const token = await fetchInvitationToken(context.request, candidateEmail);

  // 4. Candidat s'inscrit + se connecte (remplace la session recruteur).
  await registerAndLogin(page, {
    email: candidateEmail,
    password: PASSWORD,
    role: "candidate",
    firstName: "Cana",
    lastName: "Didat",
  });

  // 5. Seeder un profil minimal (2 experiences pour le bloc L3 plus tard).
  await seedCandidateExperiences(context.request, [
    { client_name: "Acme", role: "Lead Dev", start_date: "2021-01-01" },
    { client_name: "Globex", role: "Architecte", start_date: "2019-03-01" },
  ]);

  // 6. Candidat accepte l'invitation.
  await page.goto(`/invitation/${token}`);
  await page.getByRole("button", { name: "Autoriser l'accès" }).click();
  await expect(
    page.getByText("Cette invitation a déjà été acceptée."),
  ).toBeVisible();

  // 7. Recruteur se reconnecte et ouvre la fiche candidat.
  await registerAndLogin(page, {
    email: recruiterEmail,
    password: PASSWORD,
    role: "recruiter",
    firstName: "Rae",
    lastName: "Cruteur",
  });
  await page.goto("/recruiter/candidates");
  await page.getByRole("link", { name: /Cana Didat/ }).click();
  await page.waitForURL(/\/recruiter\/candidates\/.+/);

  // 8. Generer un dossier DOCX et verifier le telechargement.
  await page.getByRole("button", { name: "Composer un dossier" }).click();
  const dialog = page.getByRole("dialog");
  // Selectionner le premier modele Jorg (carte cliquable).
  await dialog.getByText("Modèle de dossier", { exact: false }).waitFor();
  await dialog
    .locator("button:has-text('Standard'), button:has-text('Jorg')")
    .first()
    .click();
  await dialog.getByRole("button", { name: "Word (.docx)" }).click();
  await dialog.getByRole("button", { name: /Générer le dossier DOCX/ }).click();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Télécharger \(DOCX\)/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
});
```

- [ ] **Step 2: Lancer le test (red), observer le premier point de casse**

Prérequis : stack lancée (voir Task 2 Step 7).
Run: `cd frontend && npm run test:e2e -- golden-path.spec.ts`
Expected au premier run : échec probable sur un sélecteur non confirmé (déclencheur d'invitation, lien candidat, ou nom du modèle Jorg).

- [ ] **Step 3: Confirmer/ajuster les sélecteurs réels**

Pour chaque échec de sélecteur, ouvrir le composant concerné et corriger :

- Déclencheur d'invitation : `frontend/app/(recruiter)/recruiter/candidates/page.tsx`. Si le bouton n'a pas un libellé contenant "inviter", lui ajouter `data-testid="invite-candidate-trigger"` et remplacer dans `inviteCandidate` par `page.getByTestId("invite-candidate-trigger").click()`.
- Lien vers la fiche candidat : confirmer que la liste rend un lien avec le nom ("Cana Didat"). Sinon ajuster le sélecteur (ex. `getByRole("link")` filtré par testid de carte).
- Nom du modèle Jorg dans le dialogue : remplacer `'Standard'`/`'Jorg'` par le vrai nom rendu (les modèles builtin viennent de `useTemplateChoices`). Au besoin cibler la première carte modèle via sa structure : `dialog.locator("button").filter({ hasText: /./ }).first()` n'est pas fiable ; préférer ajouter `data-testid="template-card"` sur la carte builtin dans `frontend/components/dossier-generation-dialog.tsx` et cibler `.first()`.

Itérer Step 2 / Step 3 jusqu'au vert.

- [ ] **Step 4: Vérifier le vert**

Run: `cd frontend && npm run test:e2e -- golden-path.spec.ts`
Expected: 1 PASS, un fichier `.docx` téléchargé.

- [ ] **Step 5: Lint + types**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: succès.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/golden-path.spec.ts frontend/components/dossier-generation-dialog.tsx frontend/app/(recruiter)/recruiter/candidates/page.tsx
git commit -F <fichier-message>
```

Message : `test(e2e): golden path recruiter invite to candidate DOCX generation`

---

### Task 5: E2E — bloc détaillé éditeur de dossier adapté L3

**Files:**

- Modify: `frontend/e2e/golden-path.spec.ts` (ajouter un test L3 réutilisant le même fichier, ou créer `frontend/e2e/dossier-l3.spec.ts` partageant les helpers)
- Possible modify: `frontend/components/dossier-adapted-editor.tsx` (ajout d'un `data-testid` sur l'indicateur dirty uniquement si le sélecteur texte s'avère ambigu)

**Interfaces:**

- Consumes: helpers de Task 3 ; même parcours d'amorçage que Task 4 (recruteur + candidat avec 2 expériences + grant actif).
- Produces: un test L3 qui ouvre l'éditeur adapté, réordonne au clavier, vérifie le passage dirty, sauvegarde, crée une nouvelle version, génère un DOCX.

**Rappel du composant réel (vérifié) — `DossierAdaptedEditor` :**

- Ouvert via le bouton "Créer une version adaptée" sur la fiche candidat recruteur.
- Poignée de drag : `button[aria-label="Déplacer {label}"]` où `{label}` = `"{role} - {client_name}"` (ex. "Lead Dev - Acme"). `KeyboardSensor` actif : focus + Space (lift), ArrowDown (move), Space (drop).
- Indicateur dirty : texte `"● Modifications non enregistrées"` quand dirty, `"✓ Enregistré"` sinon.
- Bouton "Enregistrer".
- Bouton "+ Nouvelle version" ; liste des versions dans la région `aria-label="Versions adaptées"`. La version "Base" porte un badge "Base".
- Champ `#dossier-name`.
- Sélection modèle (mêmes cartes builtin), format "Word (.docx)", bouton "Générer la version DOCX", puis "Télécharger (DOCX)".

- [ ] **Step 1: Écrire le test L3**

Ajouter à `frontend/e2e/golden-path.spec.ts` un second `test(...)`, ou créer `frontend/e2e/dossier-l3.spec.ts`. Pour éviter de dupliquer tout l'amorçage, factoriser une fonction `setupGrantedCandidate(page, context)` dans `helpers/flows.ts` qui exécute les étapes 1 à 7 de Task 4 et retourne `{ recruiterEmail, candidateEmail }`, puis :

```typescript
import { test, expect } from "@playwright/test";
import { setupGrantedCandidate } from "./helpers/flows";

const PASSWORD = "E2ePassw0rd!";

test("editeur de dossier adapte L3 : reorder, dirty, version, generation", async ({
  page,
  context,
}) => {
  await setupGrantedCandidate(page, context);

  // Sur la fiche candidat, ouvrir l'editeur adapte.
  await page.getByRole("button", { name: "Créer une version adaptée" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("✓ Enregistré")).toBeVisible();

  // Reorder clavier de la premiere experience.
  const firstHandle = dialog
    .getByRole("button", { name: /^Déplacer / })
    .first();
  await firstHandle.focus();
  await page.keyboard.press("Space"); // lift
  await page.keyboard.press("ArrowDown"); // move down
  await page.keyboard.press("Space"); // drop
  await expect(
    dialog.getByText("● Modifications non enregistrées"),
  ).toBeVisible();

  // Nommer + enregistrer -> dirty resolu.
  await dialog.locator("#dossier-name").fill("Version E2E");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog.getByText("✓ Enregistré")).toBeVisible();

  // Nouvelle version -> apparait dans la liste.
  await dialog.getByRole("button", { name: "+ Nouvelle version" }).click();
  await dialog.locator("#dossier-name").fill("Version E2E 2");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  const versions = dialog.getByRole("region", { name: "Versions adaptées" });
  await expect(versions.getByText("Version E2E")).toBeVisible();
  await expect(versions.getByText("Version E2E 2")).toBeVisible();

  // Generer un DOCX depuis le dossier adapte.
  await dialog.getByTestId("template-card").first().click();
  await dialog.getByRole("button", { name: "Word (.docx)" }).click();
  await dialog.getByRole("button", { name: /Générer la version DOCX/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Télécharger \(DOCX\)/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
});
```

Note : `getByTestId("template-card")` suppose le `data-testid` ajouté en Task 4 Step 3 sur la carte modèle builtin de `dossier-generation-dialog.tsx`. L'éditeur adapté (`dossier-adapted-editor.tsx`) rend ses propres cartes modèle : ajouter le même `data-testid="template-card"` sur le `<button>` de carte builtin dans `dossier-adapted-editor.tsx` (zone `builtinTemplates.map`, ligne ~485).

- [ ] **Step 2: Factoriser `setupGrantedCandidate`**

Extraire dans `frontend/e2e/helpers/flows.ts` les étapes 1 à 7 de Task 4 (inscription recruteur, org, invitation, lecture token, inscription candidat, seed 2 expériences, acceptation, reconnexion recruteur, ouverture fiche candidat). Signature :

```typescript
export async function setupGrantedCandidate(
  page: Page,
  context: BrowserContext,
): Promise<{ recruiterEmail: string; candidateEmail: string }>;
```

Mettre à jour `golden-path.spec.ts` (Task 4) pour réutiliser cette fonction afin d'éviter la duplication (DRY). Importer `BrowserContext` depuis `@playwright/test`.

- [ ] **Step 3: Ajouter le testid sur la carte modèle de l'éditeur adapté**

Dans `frontend/components/dossier-adapted-editor.tsx`, sur le `<button>` de carte builtin (zone `builtinTemplates.map`, ~ligne 485), ajouter `data-testid="template-card"`.

- [ ] **Step 4: Lancer le test L3 (red→green)**

Run: `cd frontend && npm run test:e2e -- dossier-l3.spec.ts`
Expected : itérer sur les sélecteurs jusqu'au vert, puis 1 PASS avec `.docx` téléchargé. Si le reorder clavier ne déclenche pas dirty, vérifier que la poignée reçoit le focus (sinon cliquer la poignée d'abord) ; en dernier recours, déclencher dirty via le toggle "Mettre {label} en avant" (qui appelle aussi `setDirty(true)`).

- [ ] **Step 5: Relancer toute la suite E2E**

Run: `cd frontend && npm run test:e2e`
Expected : tous les specs PASS (`smoke`, `golden-path`, `dossier-l3`).

- [ ] **Step 6: Lint + types**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: succès.

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/ frontend/components/dossier-adapted-editor.tsx frontend/components/dossier-generation-dialog.tsx
git commit -F <fichier-message>
```

Message : `test(e2e): cover L3 adapted dossier editor reorder, versions, generation`

---

### Task 6: Documentation — README E2E et procédure de lancement

**Files:**

- Create: `frontend/e2e/README.md`

**Interfaces:**

- Produces: doc des prérequis et de la commande, pour rendre le filet rejouable par un humain.

- [ ] **Step 1: Écrire le README**

Créer `frontend/e2e/README.md` :

```markdown
# Smoke E2E alpha

Filet de securite local (P0-2). Couvre le golden path recruteur -> candidat ->
generation DOCX et l'editeur de dossier adapte L3. Lance a la main avant
d'elargir l'alpha. Pas de CI pour l'instant.

## Prerequis (3 terminaux)

1. Services :
   `docker compose -f docker-compose.dev.yml up -d`
2. Backend (avec le seam de test active) :
   `cd backend && E2E_TEST_MODE=true ALPHA_INVITE_REQUIRED=false EMAIL_BACKEND=console uv run uvicorn main:app --port 8000`
3. Frontend :
   `cd frontend && npm run dev`

## Lancer

`cd frontend && npm run test:e2e`

Variantes :

- Un seul fichier : `npm run test:e2e -- golden-path.spec.ts`
- En mode visible : `npm run test:e2e -- --headed`
- Rapport : `npx playwright show-report`

## Notes

- Les emails sont uniques par run (timestamp), aucune remise a zero de la base.
- La route backend `/test/last-invitation-token` n'existe utilement que sous
  `E2E_TEST_MODE=true` ; elle rend 404 sinon. Ne jamais activer ce flag en prod.
- Le PDF n'est pas couvert : seul le DOCX (fallback fiable) est asserte.
```

- [ ] **Step 2: Commit**

```bash
git add frontend/e2e/README.md
git commit -F <fichier-message>
```

Message : `docs(e2e): document local smoke prerequisites and commands`

---

## Notes d'exécution transversales

- Les commits passent par le hook pre-commit (prettier/ruff). Après un commit refusé pour reformat, ré-`git add` puis recommit (cf. Windows notes).
- Si `npx tsc --noEmit` du frontend remonte les fichiers `e2e/`, ajouter `"e2e"` à `exclude` de `frontend/tsconfig.json` (Task 2 Step 5).
- Ordre de dépendance : Task 1 (backend route) avant Task 4 (le test lit la route). Task 2 avant Task 3/4/5. Task 5 dépend de Task 4 (factorisation `setupGrantedCandidate`).
