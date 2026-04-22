# Jorg MVP — Analyse & Roadmap d'implémentation

> **For agentic workers:** Ce document est un **plan d'analyse**, pas un plan bite-sized TDD. Les plans d'implémentation détaillés par sous-système existent déjà sous `docs/superpowers/plans/2026-04-14-plan-1-*.md` → `2026-04-19-plan-p2-2-*.md`. Utiliser ce document comme **roadmap / index** pour comprendre la couverture actuelle du spec et identifier les trous restants.

**Goal:** Fournir une analyse consolidée du spec `2026-04-14-jorg-mvp-design.md`, mapper chaque exigence à son plan d'implémentation existant, expliciter les hypothèses, et identifier les zones qui ne sont pas (encore) couvertes par un plan.

**Date:** 2026-04-22
**Auteur:** Senior Tech Lead review

---

## 1. Résumé des fonctionnalités

### 1.1 Objectif central

Jorg est une **plateforme deux faces** qui élimine la rédaction répétée de dossiers de compétences. Le candidat saisit **une** fois son profil canonique ; les sociétés de conseil génèrent leur dossier au format maison **sans intervention manuelle du candidat**.

### 1.2 Fonctionnalités clés

- **F1 — Auth multi-rôle** : email/password + OAuth Google/LinkedIn, rôle figé (`candidate` | `recruiter`) à la création, JWT access (15 min) + refresh (30 jours) en cookies `httpOnly`.
- **F2 — Profil candidat unique** : identité, expériences, compétences, formations, certifications, langues + champs libres (`extra_fields` JSON).
- **F3 — Organisations & profils recruteurs** : un recruteur appartient à une `Organization`. Les templates appartiennent à l'**organization** (partagés entre collègues).
- **F4 — Templates Word paramétrables** : upload `.docx` avec placeholders `{{XXX}}` et marqueurs de bloc `{{#…}}` / `{{/…}}` pour listes. Mapping manuel placeholder → champ profil. `is_valid=true` si 100 % mappé.
- **F5 — Invitations & AccessGrant** : invitation par email (token, expire 30 j). L'acceptation crée un `AccessGrant` `candidate → organization` (pas recruteur). Révocable par le candidat.
- **F6 — Génération de documents** : moteur de substitution `.docx` (placeholders simples + clones de blocs), conversion PDF optionnelle via LibreOffice headless, historique dans `GeneratedDocument`.
- **F7 — RGPD & transparence** : export des données candidat, suppression de compte avec cascade, historique `GeneratedDocument` consultable côté candidat.

### 1.3 Contraintes structurantes

- **Stack imposée** : FastAPI / Python 3.14 ; Next.js 15 App Router / TS 5.x ; PostgreSQL 18 ; SQLAlchemy 2 async ; Alembic ; shadcn/ui + Tailwind 4 ; pytest + testcontainers ; Vitest + Playwright.
- **Séparation stricte** des deux portails via groupes de routes Next.js (`/(candidate)`, `/(recruiter)`) + middleware basé sur le rôle JWT.
- **Fichiers** servis exclusivement par endpoints authentifiés (streaming) — **pas de liens publics** vers le storage.
- **Tests d'intégration obligatoirement sur PostgreSQL réel** (SQLite écarté — divergence de comportement).
- **Stockage fichiers** : local en dev, S3 en prod (non implémenté au MVP, spec hors-scope).
- **Français uniquement** pour l'UI au MVP.
- **Un email = un seul rôle** (contrainte levable plus tard).

### 1.4 Hors scope explicite (ne pas planifier)

Partage de profil par lien public, marketplace searchable, multi-profils par User, versioning des templates, éditeur drag-and-drop, détection IA des zones Word, multi-langue, notifications temps réel, Sentry/APM, S3.

---

## 2. Incertitudes & hypothèses

### 2.1 Ambiguïtés du spec

| Sujet | Ambiguïté | Hypothèse retenue |
|---|---|---|
| **Expiration invitation** | « défaut 30 jours » — côté DB, côté service, ou configurable ? | **Constante applicative** dans `core/config.py`, `expires_at = now + timedelta(days=30)` calculé au `create_invitation`. Pas de job de purge automatique au MVP — statut `expired` calculé à la lecture. |
| **Format date FR** | « `MM/YYYY` par défaut » — pour tous les champs date ou juste les périodes d'expérience ? | S'applique aux dates d'expérience, formation, certification. Pour les dates ponctuelles (issue_date certif), format identique `MM/YYYY`. Ne s'applique pas à `created_at` système. |
| **Liste `Skill` catégories** | « language / framework / database / tool / methodology / other » — enum DB ou texte libre contraint ? | **Enum PostgreSQL** via `SQLAlchemy Enum` — validation stricte côté schéma Pydantic. |
| **`extra_fields` JSON** | Aucune règle de schéma. Exploitable par quel placeholder ? | Au MVP : saisissable par le candidat mais **non mappable** dans les templates (ne figure pas dans `PROFILE_FIELDS`). Couvert plus tard si besoin. |
| **Refresh token DB** | « stocké en DB (révocable) » — une table dédiée ? | Table `RefreshToken(user_id, token_hash, expires_at, revoked_at)`. Rotation à chaque `/auth/refresh`. |
| **Vérification email** | Obligatoire pour login ? | **Non bloquant** au MVP — `email_verified=false` permet le login mais affiche un bandeau. Recruteur avec email non vérifié ne peut pas générer (protection métier). Cette décision est à confirmer — alternative : blocage total. |
| **OAuth LinkedIn** | LinkedIn a durci son API (retrait r_liteprofile, scope `openid profile email` via OpenID Connect). | Utiliser **OpenID Connect** (authlib) avec scope `openid profile email`. Si adoption ralentie, LinkedIn peut être livré en Phase 2. |
| **Cascade RGPD** | « suppression compte cascade Experiences, Skills… » — et `GeneratedDocument` ? | `GeneratedDocument` **anonymisé** (nullage de `access_grant_id`, conservation du `file_path` et `generated_at`) — pas supprimé (audit recruteur conservé). `AccessGrant` passe en `revoked`. |
| **PDF optionnel** | Qui déclenche la conversion ? | Paramètre `format=docx\|pdf` en query string sur `/generate`. Si `pdf` et conversion échoue : livrer le `.docx` avec un header `X-PDF-Conversion-Failed: true`. |
| **Taille max upload Word** | Non défini | **10 MB** hard cap côté FastAPI (`UploadFile` stream + validation). |

### 2.2 Hypothèses explicites à valider

- **H1** : Un candidat peut donner accès à plusieurs organisations — pas de limite. Validé par le modèle (N-N via `AccessGrant`).
- **H2** : Une invitation ne peut référencer qu'**une** organization (pas multi-orga). OK, unicité naturelle via `recruiter_id → organization_id`.
- **H3** : Re-upload d'un template remplace le fichier Word mais conserve les `mappings` déjà faits **si** les placeholders détectés sont un sur-ensemble. Sinon mapping reset + `is_valid=false`. (À documenter dans le plan 3 s'il ne l'est pas.)
- **H4** : Un candidat qui se désinscrit via l'invitation non-acceptée (`status=rejected`) ne crée pas d'AccessGrant et n'apparaît pas côté recruteur. Re-invitation possible après rejet.
- **H5** : L'ordre des `Experience` dans le document généré suit `start_date DESC` (plus récent en premier) — standard métier.
- **H6** : La conversion PDF via `libreoffice --headless --convert-to pdf` est **synchrone** au MVP (blocage possible jusqu'à 5-10 s). À basculer vers Celery/RQ en prod si trafic.

---

## 3. Impact architectural

### 3.1 Composants

```
┌────────────────────────────────┐          ┌──────────────────────────────┐
│   Next.js 15 App (SSR + CSR)   │          │   FastAPI (Python 3.14)      │
│  ┌─────────┐  ┌─────────────┐ │  REST    │  ┌───────────────────────┐  │
│  │(public) │  │(candidate)  │ │ JSON+JWT │  │ /auth (JWT + OAuth)   │  │
│  │ landing │  │ profile     │ │◀────────▶│  │ /candidates           │  │
│  │ login   │  │ requests    │ │          │  │ /organizations        │  │
│  │ register│  │ access      │ │          │  │ /templates            │  │
│  └─────────┘  │ history     │ │          │  │ /invitations /access  │  │
│               └─────────────┘ │          │  │ /generate             │  │
│               ┌─────────────┐ │          │  └───────────────────────┘  │
│               │(recruiter)  │ │          │         │         │          │
│               │ candidates  │ │          │         │         │          │
│               │ templates   │ │          │         ▼         ▼          │
│               │ invitations │ │          │   ┌──────────┐  ┌────────┐   │
│               │ generate    │ │          │   │Postgres  │  │File    │   │
│               │ history     │ │          │   │18 + SA2  │  │storage │   │
│               └─────────────┘ │          │   └──────────┘  │(local/ │   │
└────────────────────────────────┘          │                │ S3)    │   │
                                            │                └────────┘   │
                                            │  ┌──────────────────────┐  │
                                            │  │ LibreOffice headless │  │
                                            │  │ (docx → pdf)         │  │
                                            │  └──────────────────────┘  │
                                            └──────────────────────────────┘
```

### 3.2 Flux de données critiques

**Flux A — Création d'un template (recruteur) :**
```
UI upload .docx
  → POST /templates (multipart) [auth recruteur]
  → template_service.save_file(org_id) → path local
  → docx_parser.extract_placeholders(path) → list[str]
        (filtre {{#…}} / {{/…}} depuis P0)
  → Template(detected_placeholders=[...], mappings={}, is_valid=false)
UI mapping (dropdowns)
  → PATCH /templates/{id} { mappings: {...} }
  → recompute is_valid = (set(mappings.keys()) >= set(detected_placeholders))
```

**Flux B — Invitation & acceptation :**
```
Recruteur saisit email + envoie
  → POST /invitations → Invitation(token, status=pending, expires_at=+30j)
  → email envoyé avec lien /accept?token=XXX (stub SMTP au MVP, loggé seulement)
Candidat clique
  → GET /invitations/accept?token=XXX
  → si pas inscrit : redirect vers /register?invitation=XXX (pré-rempli)
  → à l'acceptation : Invitation.status=accepted
                   + AccessGrant(candidate, organization, active)
```

**Flux C — Génération :**
```
POST /generate { candidate_id, template_id, format }
  → auth recruteur
  → assert AccessGrant(candidate, recruteur.org, status=active) ∃
  → assert Template.is_valid = true
  → load CandidateProfile + relations (selectinload)
  → generation_service.render_docx(template_path, profile, mappings) → new_path
     • _apply_block  : clone bloc {{#EXPERIENCES}}…{{/EXPERIENCES}}
     • _apply_simple : str.replace pour chaque placeholder mappé
     • format dates FR via _format_date_fr
  → si format=pdf : libreoffice_service.convert(new_path) → pdf_path
  → GeneratedDocument(file_path, format, generated_at, access_grant_id)
  → stream bytes vers client avec Content-Disposition
```

### 3.3 Dépendances externes

- **OAuth providers** : Google OAuth2 + LinkedIn OIDC (credentials en env vars).
- **SMTP** : stub au MVP, à connecter à Postmark/SES en prod.
- **LibreOffice headless** : binaire système (container Docker fournit `libreoffice`).
- **Python libs** : `python-docx`, `python-jose[cryptography]`, `passlib[bcrypt]`, `authlib`, `structlog`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`.
- **Frontend libs** : `next@15`, `react@19`, `tailwindcss@4`, `@radix-ui/*` (via shadcn), `zod`, `react-hook-form`.

---

## 4. Décomposition de l'implémentation

### 4.1 Mapping spec → plans existants

| Spec (section) | Plan de référence | Statut |
|---|---|---|
| Auth (JWT + OAuth) | [Plan 1 — Foundations & Auth](2026-04-14-plan-1-foundations-auth.md) | ✅ Mergé |
| Profil candidat + sous-entités | [Plan 2 — Candidate Profile](2026-04-14-plan-2-candidate-profile.md) | ✅ Mergé |
| Organization + Recruiter + Template + upload Word + parsing | [Plan 3 — Organizations/Recruiter/Templates](2026-04-15-plan-3-organizations-recruiter-templates.md) | ✅ Mergé |
| Invitation + AccessGrant + flow accept/reject/revoke | [Plan 4 — Invitations/Access](2026-04-15-plan-4-invitations-access.md) | ✅ Mergé |
| Génération docx + PDF + blocs mustache + GeneratedDocument | [Plan 5 — Document Generation](2026-04-15-plan-5-document-generation.md) | ✅ Mergé |
| Pages Next.js complètes (candidat + recruteur) | [Plan 6 — Frontend](2026-04-15-plan-6-frontend.md) | ✅ Mergé |
| **Fix P0** : marqueurs de bloc exclus du mapping | [Plan P0](2026-04-19-plan-p0-block-markers-not-mappable.md) | ✅ Mergé |
| **P1.1** : liste candidats accessibles + search | [Plan P1.1](2026-04-19-plan-p1-1-accessible-candidates.md) | ✅ Mergé |
| **P1.2** : champs mapping manquants (context / achievements) | [Plan P1.2](2026-04-19-plan-p1-2-mapping-missing-fields.md) | ✅ Mergé |
| **P2.1** : contract_type + annual_salary | [Plan P2.1](2026-04-19-plan-p2-1-contract-type.md) | ✅ Mergé |
| **P2.2** : skill level_rating 1-5 | [Plan P2.2](2026-04-19-plan-p2-2-skill-rating.md) | ✅ Mergé |

### 4.2 Gaps identifiés (plans manquants à rédiger)

Les zones suivantes sont **dans le spec** mais **non couvertes** par un plan existant dédié (à vérifier dans les plans 1-6 — certains peuvent y être partiellement traités).

#### G1 — RGPD : Export des données candidat (priorité P1)
**Spec §Sécurité** : « un candidat peut exporter toutes ses données, supprimer son compte (cascade…) ».

- `GET /candidates/me/export` → JSON complet (profil + experiences + skills + education + certifications + languages + access_grants + generated_documents list).
- Format : JSON téléchargeable (`Content-Disposition: attachment; filename=jorg-export-{user_id}-{date}.json`).
- Page candidat : `/candidate/settings` avec boutons "Exporter mes données" + "Supprimer mon compte".

#### G2 — RGPD : Suppression de compte avec cascade + anonymisation `GeneratedDocument` (priorité P1)
**Spec §Sécurité** : cascade sur Experiences/Skills, anonymisation des `GeneratedDocument` passés.

- `DELETE /candidates/me` → supprime `CandidateProfile` + cascade SQL sur relations.
- Sur `GeneratedDocument` : passer `access_grant_id=NULL`, `candidate_snapshot=NULL` (si existant), conserver `file_path` et `generated_at`.
- `AccessGrant` : `status=revoked`, `revoked_at=now()`.
- `Invitation` pending liée à cet email : `status=expired`.

#### G3 — Envoi email transactionnel (priorité P1)
**Spec §Tests/Observabilité** implicite : invitations, vérification email, reset password nécessitent un envoi.

- Service `email_service.py` abstrait derrière une interface `EmailSender`.
- Implémentation `ConsoleEmailSender` (log JSON) par défaut pour dev/tests.
- Implémentation `SMTPEmailSender` pilotée par env (ETAPE future, pas au MVP).
- Templates texte + HTML minimalistes pour : invitation, vérif email, reset password.

#### G4 — Observabilité : logs structurés avec `request_id` (priorité P1)
**Spec §Observabilité** : « Logs JSON structurés (structlog) avec request_id propagé ».

- Middleware FastAPI qui injecte `request_id = uuid4()` dans `structlog.contextvars`.
- Logger les événements métier : login, génération, invitation_sent, access_granted, access_revoked, template_uploaded.
- Niveau INFO par défaut, DEBUG via `LOG_LEVEL` env.

#### G5 — Template .docx d'exemple téléchargeable (priorité P2)
**Spec §Flux template** : « Un template .docx d'exemple sera téléchargeable depuis l'UI recruteur pour illustrer la syntaxe ».

- Fichier statique `backend/static/sample_template.docx` versionné dans git.
- Endpoint `GET /templates/sample` (auth recruteur) qui stream le fichier.
- Bouton "Télécharger un exemple" sur `/recruiter/templates`.

#### G6 — Endpoint historique `GeneratedDocument` côté candidat (à vérifier dans Plan 5/6)
**Spec §Conséquences** : « L'historique permet au candidat de voir qui a généré quoi et quand ».

- `GET /candidates/me/documents` → liste des `GeneratedDocument` où `access_grant.candidate_id = me`.
- Page `/candidate/history` avec table : date, organization, template name, recruteur.
- Pas de téléchargement depuis le candidat (le document appartient au recruteur) — juste métadonnées pour transparence RGPD.

#### G7 — Téléchargement authentifié des fichiers (à vérifier dans Plan 3/5)
**Spec §Sécurité** : « Les fichiers sont servis par des endpoints authentifiés qui streament — pas de liens publics ».

- `GET /templates/{id}/file` (auth + check organization_id).
- `GET /generated-documents/{id}/file` (auth + check access_grant.candidate_id = me OU organization).
- Réponse : `StreamingResponse` avec `Content-Disposition`.

#### G8 — CI GitHub Actions (priorité P1)
**Spec §Qualité** : « CI GitHub Actions : tests + lint sur chaque PR ».

- `.github/workflows/ci.yml` : job backend (ruff + mypy + pytest avec testcontainers) + job frontend (eslint + prettier + tsc + vitest + playwright).
- Services Docker dans CI pour Postgres.

#### G9 — Docker Compose dev local (priorité P1)
**Spec §Structure repo** : « docker-compose.yml — Postgres + LibreOffice pour dev local ».

- Services : `postgres:18`, `libreoffice` (optionnel — alternative : installer sur image backend).
- Volumes persistés pour la DB.

#### G10 — Pre-commit hooks (priorité P2)
**Spec §Qualité** : « Pre-commit hooks ».

- `.pre-commit-config.yaml` : ruff, prettier, mypy (manual stage).

### 4.3 Ordre logique d'exécution (pour les gaps)

```
Prerequisites : les 6 plans + P0/P1/P2 sont mergés (état courant).

Priority P1 (avant beta interne) :
  G1 ─┐
  G2 ─┴─(indépendant du reste) ──▶ peut être 1 seul plan combiné "RGPD"
  G3 ─── (indépendant) ──▶ 1 plan "Email transactional"
  G4 ─── (indépendant) ──▶ 1 plan "Observability / logging"
  G6 ─── (dépend de Plan 5) ──▶ 1 plan "Candidate history view"
  G7 ─── (vérifier d'abord si déjà dans Plan 3/5 ; sinon 1 plan)
  G8 ─── (indépendant) ──▶ 1 plan "CI GitHub Actions"
  G9 ─── (indépendant) ──▶ 1 plan "Docker compose dev"

Priority P2 (post-beta) :
  G5 ─── (indépendant) ──▶ 1 plan "Sample template download"
  G10 ── (indépendant) ──▶ micro-plan "Pre-commit hooks"
```

### 4.4 Parallélisables

- **Gaps RGPD (G1+G2), Email (G3), Observabilité (G4), CI (G8), Docker (G9)** sont tous indépendants les uns des autres → **5 workers parallèles** possibles une fois les plans rédigés.
- Vérification G6/G7 : dépend de lecture des plans 3/5 existants, peut se faire en parallèle du reste.

---

## 5. Décisions techniques & trade-offs

### 5.1 Auth : `python-jose` + `passlib` vs `fastapi-users`
**Décision spec** : maison légère (python-jose + passlib + authlib).
**Justification** : `fastapi-users` apporte un framework complet (modèles, schémas, dépendances) qu'il faudrait étendre ou contourner pour supporter notre double rôle + OAuth personnalisé. Le code maison fait <500 LoC et reste lisible.
**Trade-off accepté** : on porte nous-mêmes les bugs sécurité (CVE JWT…). Mitigation : tests exhaustifs + revues.

### 5.2 Tests intégration sur Postgres réel (testcontainers)
**Décision spec** : Postgres via testcontainers, SQLite écarté.
**Justification** : SQLite diverge sur types (ENUM, JSONB, ARRAY), contraintes (CHECK, transactions), et comportements d'isolation. Bug masqué en test = crash en prod.
**Trade-off accepté** : suites plus lentes (~3-5 s de boot container partagé par session pytest). Mitigation : `scope="session"` pour le conteneur, rollback par test.

### 5.3 Mustache-like custom (blocs `{{#…}}{{/…}}`) vs Jinja2 / docxtpl
**Décision spec** : moteur maison simple sur `python-docx`.
**Justification** : `docxtpl` est puissant mais ajoute une dépendance lourde et casse la promesse "placeholders simples visibles dans Word". Un moteur maison (~100 LoC) suffit pour les 2 cas : simple placeholder et bloc liste.
**Trade-off accepté** : ne supporte pas les conditions, boucles imbriquées, filtres. Acceptable au MVP. Si besoin plus tard : migration docxtpl ciblée.

### 5.4 PDF : LibreOffice headless vs services cloud
**Décision spec** : LibreOffice headless local.
**Justification** : zéro coût, zéro data exfiltration, fidélité élevée. Alternatives (Aspose, Gotenberg, Adobe PDF Services) soit coûteuses soit nécessitent network outbound.
**Trade-off accepté** : latence 2-8 s par conversion, process système. Mitigation : pool de process, file d'attente si trafic.

### 5.5 JWT en cookies `httpOnly` vs localStorage
**Décision spec** : `httpOnly` cookies.
**Justification** : XSS ne peut pas lire le token. CSRF géré par `SameSite=Strict` (ou Lax pour OAuth callback) + double-submit token pour les mutations.
**Trade-off accepté** : plus de complexité côté Next.js (cookies lus côté serveur, revalidation côté client via `/auth/me`).

### 5.6 Groupes de routes Next.js `(candidate)` / `(recruiter)` + middleware
**Décision spec** : séparation en groupes + middleware.
**Justification** : code-split naturel, middleware simple par groupe, UX différenciée par portail.
**Trade-off accepté** : un User ne peut pas basculer rapidement de rôle (re-auth nécessaire). Acceptable car spec : 1 email = 1 rôle.

### 5.7 Storage local en dev, S3 en prod (mais S3 non implémenté MVP)
**Justification** : réduire la surface d'infra au MVP. `storage_service.py` abstrait derrière `LocalStorage` et `S3Storage` (interface `save/read/delete`).
**Trade-off accepté** : migration prod nécessite config + test. Prévoir `storage_service` avec interface dès le début (vérifier dans Plan 3/5).

---

## 6. Risques & cas limites

### 6.1 Risques fonctionnels

| # | Risque | Impact | Mitigation |
|---|--------|--------|------------|
| RF1 | Recruteur génère un dossier avec placeholders orphelins (le mapping pointe sur un champ que le candidat a vidé) | Document incomplet, perte de confiance | Spec : remplacer par chaîne vide, pas d'erreur. Logger `WARNING` côté serveur. |
| RF2 | Candidat révoque l'accès pendant qu'un recruteur génère un document | Fuite de données si la génération passe | Check `AccessGrant.status` **dans la transaction** de génération. 403 immédiat si révoqué. |
| RF3 | Recruteur A et recruteur B (même orga) éditent simultanément le même template | Mapping perdu | Verrou optimiste via colonne `version: int` + PATCH conditionnel. (À ajouter si pas dans Plan 3.) |
| RF4 | Candidat inscrit accepte 2 invitations de la même orga | Doublon `AccessGrant` | Contrainte unique `(candidate_id, organization_id)` ; upsert lors de l'acceptation. |
| RF5 | Invitation envoyée à un email déjà inscrit avec rôle `recruiter` | Erreur silencieuse | Validation préalable : refus avec message explicite "cette adresse est déjà un compte recruteur". |
| RF6 | Template uploadé avec `{{` mal formé (ex: `{{NOM`) | Faux positif / faux négatif extraction | Regex stricte `\{\{[A-Z0-9_#/]+\}\}` + tests unitaires sur cas pathologiques. |

### 6.2 Risques techniques

| # | Risque | Impact | Mitigation |
|---|--------|--------|------------|
| RT1 | LibreOffice headless plante sous charge (process partagé) | Conversions PDF ratées | Timeout 15 s + fallback livraison `.docx` + log `ERROR`. Long terme : queue + workers. |
| RT2 | Postgres JSONB `extra_fields` non indexé — recherches lentes | Pas immédiat (recherche non prévue au MVP) | À prévoir si feature search arrive. |
| RT3 | Cookies SameSite=Strict cassent le callback OAuth | Login OAuth impossible | Utiliser `SameSite=Lax` pour cookie auth, Strict pour cookie CSRF. |
| RT4 | Docx upload volumineux (>10 MB) → OOM FastAPI | DoS accidentel | Limite uvicorn + validation en stream. |
| RT5 | `python-docx` ne préserve pas tous les styles à la réécriture | Document final dégradé visuellement | Tests snapshot sur `.docx` de référence + QA visuelle manuelle périodique. |
| RT6 | Migration Alembic en prod avec table volumineuse (cascade delete) | Long lock | Au MVP, pas pertinent. À prévoir avec batch-delete script plus tard. |

### 6.3 Cas limites à couvrir en tests

- Template uploadé **sans aucun placeholder** (doit rester `is_valid=true` trivialement, utilisable tel quel).
- Template avec **placeholder apparaissant 2 fois** (doit être remplacé partout — déduplication au niveau `detected_placeholders`).
- Bloc `{{#EXPERIENCES}}…{{/EXPERIENCES}}` **vide** (0 expérience) → bloc supprimé, pas de marqueurs résiduels.
- Bloc avec texte **avant ET après** les marqueurs dans le même paragraphe Word.
- Génération PDF avec caractères accentués dans le nom (Pérez, François) — vérifier encodage UTF-8.
- Invitation **acceptée puis réinvitée** après révocation (vérifier idempotence de `AccessGrant`).
- Candidat avec profil **totalement vide** génère un document — tous les champs remplacés par chaîne vide, document produit proprement.
- Deux templates de la même orga avec le **même `name`** — contrainte unique ? (si oui, documenter ; si non, OK).
- OAuth callback avec state/nonce expirés — refus + redirect login.
- Upload `.docx` avec nom **contenant `..` ou `/`** — refus (path traversal).
- Refresh token **déjà utilisé** (rotation) — refus + révocation de tous les tokens du user (détection de vol).

---

## 7. Stratégie de tests

### 7.1 Backend (pytest + testcontainers)

**Unit tests (isolés, rapides) :**
- `test_auth.py` : hashing bcrypt, JWT encode/decode, expiration, scopes de rôle, OAuth state.
- `test_docx_parser.py` : extraction placeholders, exclusion des marqueurs de bloc (P0), déduplication, cas pathologiques.
- `test_docx_generator.py` : substitution simple, clone de blocs, format dates FR, champs vides, profil minimal.
- `test_pdf_converter.py` : conversion réussie (sample fixture), échec gracieux si LibreOffice absent.
- `test_services/*` : logique métier isolée (validation mappings, `is_valid`, accès grant).

**Intégration (DB Postgres réelle via testcontainers, scope=session) :**
- `test_auth_api.py` : parcours register → login → refresh → OAuth callback.
- `test_candidate_api.py` : CRUD profil + sous-entités.
- `test_recruiter_api.py` : upload template + détection + mapping.
- `test_invitation_flow.py` : invite → accept → AccessGrant → revoke.
- `test_generation_api.py` : flow end-to-end, vérification du `.docx` produit vs. snapshot.
- `test_rgpd.py` (nouveau — gap G1+G2) : export complet, deletion cascade, anonymisation `GeneratedDocument`.

**Fixtures :**
- `backend/tests/fixtures/sample_templates/` : 3 à 5 `.docx` couvrant les cas (simple, avec blocs, invalide, vide, volumineux).
- `sample_profiles.json` : profils minimaux + complets.
- Snapshots dans `tests/fixtures/snapshots/` — `.docx` attendus binaires (comparer via `docx_to_text(expected) == docx_to_text(actual)` pour robustesse).

### 7.2 Frontend (Vitest + Playwright)

**Unit (Vitest + RTL) :**
- Composants isolés : formulaires profil, mapping dropdowns, upload zone.
- Client API : gestion des erreurs 401/403, renouvellement refresh.
- Middleware role-check (pure function).

**E2E (Playwright) :**
- `candidate-signup-to-profile.spec.ts` : inscription → vérif email → profil complet sauvegardé.
- `recruiter-upload-template-and-map.spec.ts` : inscription recruteur → création org → upload template → mapping → `is_valid=true`.
- `full-generation-flow.spec.ts` : invitation → accept candidat → recruteur génère → téléchargement valide.
- `rgpd-export-and-delete.spec.ts` (G1+G2) : export JSON + suppression cascade.

### 7.3 Couverture cible

- Unit **> 85 %** sur `services/` et `models/` backend.
- Intégration **100 % des endpoints** avec au moins 1 happy path + 1 erreur (401, 403, 404, 422).
- E2E **3 parcours critiques** minimum (ci-dessus).

---

## 8. Livrables

### 8.1 Déjà livrés (mergés sur `master`)

- Backend FastAPI structuré (`api/routes`, `core`, `models`, `schemas`, `services`, `alembic/versions`).
- 9 migrations Alembic (users, candidate_profile, recruiter/template, invitation/access, generated_documents, 2× clean block markers, contract_type, level_rating).
- Frontend Next.js 15 avec groupes `(public)`, `(candidate)`, `(recruiter)`.
- Suites de tests pytest (unit + integration) et Playwright (e2e).
- Spec + 11 plans d'implémentation.

### 8.2 À livrer (plans à rédiger pour combler les gaps G1–G10)

| Plan | Gap(s) couvert(s) | Priorité | Estimation (complexité) |
|---|---|---|---|
| [`plan-g1-g2-rgpd-export-delete.md`](2026-04-22-plan-g1-g2-rgpd-export-delete.md) ✅ rédigé | G1 (export) + G2 (delete cascade + anonymisation) | P1 | Moyen — 9 tasks |
| `plan-g3-email-service.md` | G3 (abstraction email + impl Console + templates) | P1 | Faible — 4-5 tasks |
| `plan-g4-observability.md` | G4 (structlog + request_id + événements métier) | P1 | Faible — 3-4 tasks |
| `plan-g6-candidate-history.md` | G6 (endpoint + page `/candidate/history`) | P1 | Faible — 3-4 tasks (à confirmer après audit Plan 5/6) |
| `plan-g7-authenticated-file-endpoints.md` | G7 (audit + ajout des endpoints manquants) | P1 | Faible — 2-3 tasks (audit d'abord) |
| `plan-g8-ci-github-actions.md` | G8 (CI backend + frontend) | P1 | Moyen — 5-6 tasks |
| `plan-g9-docker-compose-dev.md` | G9 (Postgres + LibreOffice local) | P1 | Faible — 2-3 tasks |
| `plan-g5-sample-template-download.md` | G5 (fichier statique + endpoint + bouton UI) | P2 | Très faible — 2 tasks |
| `plan-g10-precommit-hooks.md` | G10 (pre-commit config) | P2 | Très faible — 1-2 tasks |

**Total estimé** : 9 plans complémentaires, **~30-40 tasks** combinées, exécutables largement en parallèle.

### 8.3 Documentation à maintenir

- `README.md` racine : quickstart dev (`docker compose up`, migrations, seed, test).
- `backend/README.md` : structure backend, comment ajouter un endpoint, conventions.
- `frontend/README.md` : structure Next.js, conventions shadcn, comment ajouter une page.
- `docs/superpowers/specs/` : spec vivant.
- `docs/superpowers/plans/` : plans exécutés + à exécuter.

---

## Self-review

**Couverture spec** : passé chaque section du spec — les 6 plans principaux + 5 patches couvrent l'intégralité du MVP à l'exception des gaps G1–G10 explicitement listés section 4.2.

**Ambiguïtés résolues** : 10 hypothèses explicitées section 2 (expiration, format date, enums, extra_fields, refresh, email verification, OAuth LinkedIn, cascade RGPD, PDF, taille upload).

**Risques identifiés** : 6 fonctionnels + 6 techniques + 11 cas limites de test.

**Prochaines étapes concrètes** :
1. Valider les hypothèses H1–H6 et ambiguïtés 2.1 avec le product owner.
2. Auditer les plans 3/5 pour vérifier si G6 (historique candidat) et G7 (endpoints fichiers authentifiés) sont déjà partiellement couverts.
3. Rédiger les 9 plans bite-sized pour G1–G10 en utilisant `superpowers:writing-plans`.
4. Exécuter en parallèle via `superpowers:dispatching-parallel-agents` (les gaps sont indépendants).

## 9. Évolution produit — Vers un profil intelligent et une plateforme de staffing

### 9.1 Limites du positionnement actuel

Le MVP actuel positionne Jorg comme un outil de génération de dossiers de compétences à partir d’un profil candidat unique.

Ce positionnement présente plusieurs limites :

- Le problème adressé est opérationnel mais non critique pour les sociétés de conseil  
- Le produit est perçu comme une feature intégrable dans un ATS/CRM existant  
- L’adoption nécessite un changement de process côté recruteur sans ROI immédiat  
- La différenciation est faible face à des outils internes ou scripts existants  

En conséquence, ce positionnement expose Jorg à :

- un risque élevé de non-adoption  
- une faible capacité de monétisation  
- un risque de réplication rapide par des acteurs existants  

---

### 9.2 Nouveau positionnement cible

Jorg évolue vers une **source de vérité des profils consultants**, enrichie par un **suivi structuré des interactions avec les recruteurs**.

#### Proposition de valeur cible

> Centraliser, structurer et exploiter les profils consultants tout en offrant une visibilité complète sur leurs interactions avec les recruteurs, afin d’accélérer le staffing et la réponse aux opportunités commerciales.

Le produit repose désormais sur deux piliers :

- **Profil intelligent** : un profil structuré, enrichi et exploitable  
- **Suivi des interactions** : une traçabilité des échanges candidat ↔ organisations  

La génération de dossiers devient une **capacité dérivée** de cette source de données.

---

### 9.3 Nouvelles capacités produit (post-MVP)

#### C1 — Structuration avancée des profils

- Normalisation des expériences, compétences, rôles  
- Ajout de métadonnées exploitables :
  - disponibilité  
  - type de contrat  
  - prétentions / TJM  
  - préférences mission  

---

#### C2 — Suivi des interactions candidat ↔ recruteurs

- Historique des interactions avec chaque organisation :
  - invitations reçues  
  - accès accordés / révoqués  
  - documents générés  
- Statut par organisation :
  - `invited` / `active` / `revoked` / `inactive`  
- Timeline des événements (vue candidat)

Objectif :
- Donner de la visibilité au candidat  
- Structurer une donnée exploitable pour la suite (matching, analytics)

---

#### C3 — Recherche et filtrage

- Recherche multi-critères sur les candidats accessibles :
  - compétences  
  - expérience  
  - disponibilité  
- Préparation au matching automatisé (phase ultérieure)

---

#### C4 — Préparation au staffing

- Vue recruteur orientée “sélection de profils”  
- Shortlist de candidats pour une opportunité  
- Export / génération de dossiers à partir d’une sélection  

---

#### C5 — Intégration aux workflows existants

- Positionnement comme brique complémentaire aux ATS  
- API-first pour intégration future  
- Réduction de la friction d’adoption  

---

### 9.4 Impact sur le MVP existant

Le MVP actuel reste pertinent mais doit être recontextualisé :

- Le **profil candidat** devient le cœur du système (inchangé, mais stratégique)  
- Le **suivi des interactions** devient une brique centrale côté candidat  
- Les **templates et la génération** deviennent une feature secondaire  
- Les **AccessGrant** deviennent une base pour modéliser la relation candidat ↔ organisation  
- Les **GeneratedDocument** deviennent un artefact de sortie, non central  

---

### 9.5 Ajustements roadmap (priorisation)

#### À avancer (priorité renforcée)

- G6 — Historique candidat → devient une feature centrale (timeline des interactions)  
- P1.1 — Liste des candidats accessibles (déjà fait, critique pour pivot)  
- G4 — Logs / événements métier (réutilisables pour construire les interactions)  

---

#### À ajouter (nouveaux blocs post-MVP)

- Suivi des interactions (timeline candidat ↔ organisations)  
- Recherche candidats (full-text + filtres)  
- Champs “disponibilité” et “staffing readiness”  
- API d’exposition des profils (lecture seule dans un premier temps)  

---

#### À déprioriser

- Complexification du moteur de templates  
- Features avancées de génération (PDF avancé, styles, etc.)  
- Optimisation fine du parsing Word  

---

### 9.6 Implications stratégiques

Ce pivot permet :

- d’adresser un pain critique (staffing) plutôt qu’un confort opérationnel  
- d’augmenter la valeur côté candidat via la visibilité sur ses interactions  
- d’augmenter la dépendance produit côté client  
- de créer une base pour :
  - matching automatisé  
  - analytics staffing  
  - recommandations  

Il repositionne Jorg comme :

> un outil métier central basé sur un profil intelligent et une vision unifiée des interactions candidat ↔ recruteurs, plutôt qu’un simple générateur de documents.