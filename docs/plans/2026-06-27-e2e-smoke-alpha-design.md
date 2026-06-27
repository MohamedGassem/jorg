# Design — Smoke test E2E alpha (P0-2)

Date : 2026-06-27
Statut : validé en brainstorming, prêt pour plan d'implémentation

## Contexte

P0-2 de la roadmap (`docs/project-state/07_next_roadmap_recommendation.md`,
maj `10_mise_a_jour_2026-06-25.md`) : aucun test E2E navigateur n'existe
aujourd'hui. Le risque « parcours alpha non couverts par E2E » est classé impact
fort, probabilité élevée. Le périmètre inclut désormais le parcours dossier L3
branché via les PR #80 à #85.

État actuel vérifié :

- 0 framework E2E (ni Playwright ni Cypress dans `frontend/package.json`).
- CI frontend = lint + tsc + build uniquement (`.github/workflows/frontend-ci.yml`).
- Stack lançable en local : `docker-compose.dev.yml` (postgres + gotenberg),
  backend `uv run`, frontend `next dev`.
- Token d'invitation = `secrets.token_urlsafe(32)` stocké en base
  (`backend/models/invitation.py`, colonne `token`).
- Gate recruteur piloté par `settings.alpha_invite_required`
  (`backend/core/config.py`, `backend/api/routes/auth.py`).

## Objectif

Produire un **filet de sécurité local pré-partage** : un test rejouable, lancé à
la main avant d'élargir l'alpha, qui couvre le golden path candidat/recruteur et
le nouvel éditeur de dossier L3. Pas de gate CI pour l'instant (mais l'asset doit
rester réutilisable en CI plus tard).

Hors périmètre : couverture exhaustive, déterminisme strict CI, vérification PDF
Gotenberg, tests des chemins d'erreur.

## Approche retenue

Playwright test runner committé (`@playwright/test`) dans le frontend, pilotant
un vrai Chromium contre la stack locale réelle. Le token d'invitation est lu via
une route de test backend gardée par un flag, pour franchir l'étape email sans
SMTP.

Approches écartées :

- Pilotage via Playwright MCP : non versionné, non rejouable, lié à une session.
- Test E2E API-level (pytest HTTP) : ne couvre pas l'UI L3, rate l'objectif.

## 1. Architecture & runtime

Nouveau dossier `frontend/e2e/` piloté par `@playwright/test`.

Prérequis lancés **à la main** (documentés dans `frontend/e2e/README.md`) :

- `docker-compose -f docker-compose.dev.yml up -d` (postgres + gotenberg)
- backend `uv run` avec `e2e_test_mode=true`, `alpha_invite_required=false`,
  `email_backend=console`
- frontend `next dev`

Pas de `webServer` Playwright auto (Windows + `uv` + docker rendent le démarrage
auto fragile ; un prérequis manuel reste simple et débuggable). Exécution via
`npm run test:e2e`. Headed possible pour observer.

Pas d'intégration CI dans cette itération.

## 2. Seam de test backend

Flag ajouté à `Settings` (`backend/core/config.py`) :

```python
e2e_test_mode: bool = False
```

Route montée dans `main.py` **uniquement si** `settings.e2e_test_mode` (le
routeur n'est pas inclus du tout sinon, pas un simple 403) :

```
GET /api/test/last-invitation-token?email=<candidate_email>
  -> { "token": "...", "public_url": "<frontend_url>/invitations/<token>" }
```

- Fichier `backend/api/routes/test_support.py`.
- Lecture : dernière `Invitation` pour cet email, renvoie son `token`.
- Pas d'auth (la route n'existe qu'en mode test local).
- Pas de route `reset` (YAGNI) : on s'appuie sur des emails uniques par run
  (timestamp) pour éviter les collisions de données.

## 3. Scénario couvert

Une spec principale, emails uniques (timestamp) par run.

Golden path chaîné :

1. Recruteur s'inscrit (alpha gate off) + crée/rejoint une organisation.
2. Recruteur invite un candidat (email unique).
3. Test lit le token via `/api/test/last-invitation-token`, ouvre l'URL publique.
4. Candidat s'inscrit, accepte l'invitation avec des scopes.
5. Candidat complète un profil minimal (1 expérience, 1 skill) — assez pour générer.
6. Génération d'un dossier : assertion sur le **téléchargement DOCX**
   (fallback fiable, pas de dépendance Gotenberg). PDF hors périmètre.

Bloc L3 détaillé (dossier adapté, code le plus récent) :

- Ouvrir l'éditeur de dossier adapté.
- Réordonner un élément en drag&drop (`@dnd-kit`).
- Sauvegarder explicitement → l'indicateur dirty se résout.
- Créer une nouvelle version → elle apparaît dans la liste des versions.
- Générer depuis le dossier.

## 4. Robustesse & maintenabilité

- Sélecteurs : priorité aux rôles accessibles et textes visibles
  (`getByRole`, `getByText`). `data-testid` ajoutés **seulement** où le DOM est
  ambigu (items drag&drop, indicateur dirty). Pas de sélecteurs CSS fragiles.
- Helpers : module `frontend/e2e/helpers/` (ex. `registerRecruiter`,
  `inviteCandidate`, `acceptInvitation`) pour que la spec se lise comme le
  parcours. Pas d'abstraction au-delà du scénario.
- Attentes : auto-waiting + assertions web-first
  (`expect(locator).toBeVisible()`), pas de `sleep`.
- Téléchargement : interception via l'event `download` de Playwright, on vérifie
  le suffixe `.docx`.
- Isolation : emails uniques par run ; données laissées en base (pas de reset).

## Critères de sortie

- `npm run test:e2e` (stack locale lancée) passe le golden path complet et le
  bloc L3, en téléchargeant un `.docx`.
- La route de test n'est montée que sous `e2e_test_mode`, inerte par défaut.
- README e2e documente les prérequis et la commande.

## Fichiers impactés (prévision)

- `frontend/package.json` : dépendance `@playwright/test`, script `test:e2e`.
- `frontend/playwright.config.ts` (nouveau).
- `frontend/e2e/` : spec(s) + helpers + README (nouveau).
- `backend/core/config.py` : flag `e2e_test_mode`.
- `backend/api/routes/test_support.py` (nouveau).
- `backend/main.py` : montage conditionnel du routeur de test.
- `data-testid` ciblés dans les composants L3 si nécessaire.
