# Jorg — Design MVP

**Date** : 2026-04-14
**Statut** : Design validé, prêt pour plan d'implémentation

## Contexte & objectif

Jorg simplifie la relation entre candidats (freelances, consultants) et recruteurs des sociétés de conseil. Aujourd'hui, un consultant doit remplir son dossier de compétences dans un format différent pour chaque société de conseil avec qui il travaille. Jorg permet au candidat de remplir son profil **une seule fois** et de générer automatiquement un dossier de compétences dans le format attendu par chaque recruteur.

**Deux portails :**
- **Portail candidat** : création et maintenance d'un profil unique, gestion des accès accordés, historique des dossiers générés.
- **Portail recruteur** : création de templates de dossier de compétences (à partir d'un Word uploadé), invitation de candidats, génération des dossiers au format de la société.

---

## Stack technique

| Couche | Choix |
|--------|-------|
| Backend | FastAPI (Python 3.14) |
| ORM | SQLAlchemy 2.x |
| DB | PostgreSQL 18.3 |
| Migrations | Alembic |
| Frontend | Next.js 15 (App Router) + TypeScript 5.x |
| Runtime frontend | Node.js 22 LTS |
| UI | shadcn/ui + Tailwind CSS 4 |
| Auth | JWT (access + refresh) + OAuth Google/LinkedIn |
| Génération Word | `python-docx` |
| Conversion PDF | LibreOffice headless |
| Tests backend | pytest + testcontainers (Postgres) |
| Tests frontend | Vitest + Playwright |
| Lint/Format | ruff + mypy (backend), eslint + prettier + tsc (frontend) |

---

## Architecture générale

```
┌─────────────────────────────────────────────┐
│               Next.js App                   │
│  /candidate/*    │    /recruiter/*           │
│  (portail cand.) │    (portail recruteur)    │
└──────────────────┬──────────────────────────┘
                   │ REST API (JSON + JWT)
┌──────────────────▼──────────────────────────┐
│              FastAPI Backend                 │
│  /auth  /candidates  /recruiters             │
│  /templates  /invitations  /access           │
│  /generate                                   │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   PostgreSQL            Stockage fichiers
   (SQLAlchemy)         (local en dev, S3 en prod)
```

Les deux portails cohabitent dans une seule application Next.js, séparés par groupes de routes (`/(candidate)`, `/(recruiter)`) et protégés par middleware basé sur le rôle du JWT. Un seul backend FastAPI expose une API REST consommée par les deux portails.

---

## Modèle de données

### Entités d'authentification et d'organisation

```
User
├── id, email, hashed_password (nullable si OAuth seul)
├── oauth_provider (nullable), email_verified
├── role: "candidate" | "recruiter"
└── created_at, updated_at

Organization              ← société de conseil
├── id, name, logo_url, slug
└── created_at
```

### Profil candidat

```
CandidateProfile (1-1 avec User role=candidate)
├── user_id
├── first_name, last_name, title, summary
├── phone, email_contact, linkedin_url, location
├── avatar_url
├── years_of_experience, daily_rate (optionnels)
└── extra_fields: JSON              ← champs libres

Experience (N-1 CandidateProfile)
├── client_name, role, start_date, end_date, is_current
├── description, context, achievements
└── technologies: string[]

Skill (N-1 CandidateProfile)
├── name, category ("language"|"framework"|"database"|"tool"|"methodology"|"other")
├── level (optionnel), years_of_experience (optionnel)

Education (N-1 CandidateProfile)
├── school, degree, field_of_study, start_date, end_date, description

Certification (N-1 CandidateProfile)
├── name, issuer, issue_date, expiry_date (nullable), credential_url

Language (N-1 CandidateProfile)
├── name, level: "A1"|"A2"|"B1"|"B2"|"C1"|"C2"|"native"
```

### Profil recruteur

```
RecruiterProfile (1-1 avec User role=recruiter)
├── organization_id      ← rattaché à une société
├── first_name, last_name, job_title
```

### Templates

Les templates appartiennent à l'Organization, pas au recruteur individuel : tous les recruteurs d'une même société partagent les mêmes templates.

```
Template
├── organization_id, created_by_user_id
├── name, description
├── word_file_path
├── detected_placeholders: string[]   ← parsés du Word à l'upload
├── mappings: JSON                     ← { "{{NOM}}": "first_name", ... }
└── is_valid: bool                     ← true si tous les placeholders sont mappés
```

### Flux d'accès et génération

Trois entités distinctes : **Invitation** (demande envoyée), **AccessGrant** (autorisation active du candidat), **GeneratedDocument** (historique).

```
Invitation
├── recruiter_id, organization_id
├── candidate_email, candidate_id (nullable si pas encore inscrit)
├── token, status: "pending"|"accepted"|"rejected"|"expired"
├── expires_at (défaut : 30 jours), created_at

AccessGrant                   ← candidat autorise une organization (pas un recruteur)
├── candidate_id, organization_id
├── status: "active" | "revoked"
├── granted_at, revoked_at (nullable)

GeneratedDocument             ← historique de chaque génération
├── access_grant_id, template_id, generated_by_user_id
├── file_path, file_format: "docx" | "pdf"
├── generated_at
```

**Conséquences importantes du modèle :**
- Un candidat donne accès à **une société entière**, pas à un recruteur individuel.
- Les templates sont **partagés au sein d'une organization**.
- L'historique des `GeneratedDocument` permet au candidat de voir qui a généré quoi et quand (transparence RGPD).

---

## Flux template & génération

### Côté recruteur : créer un template (3 étapes)

1. **Upload** — le recruteur uploade un `.docx` contenant ses propres placeholders libres au format `{{XXX}}`. Exemple : `{{NOM}}`, `{{PRENOM}}`, `{{TITRE}}`, `{{EXPERIENCES}}`, `{{COMPETENCES}}`.
2. **Détection** — `python-docx` parcourt le document et extrait tous les placeholders `{{...}}` uniques. Stockés dans `detected_placeholders`.
3. **Mapping** — dans l'interface, le recruteur associe chaque placeholder détecté à un champ du profil candidat via des dropdowns. Une fois 100 % des placeholders mappés, `is_valid=true` et le template est utilisable.

### Gestion des listes (expériences, compétences)

Pour les placeholders de type liste, on utilise une **convention de marqueurs de bloc** (style Mustache) :

```
{{#EXPERIENCES}}
  {{EXP_CLIENT}} — {{EXP_ROLE}} ({{EXP_DATES}})
  {{EXP_DESCRIPTION}}
{{/EXPERIENCES}}
```

Le bloc entre `{{#EXPERIENCES}}` et `{{/EXPERIENCES}}` est cloné pour chaque expérience. Un template `.docx` d'exemple sera téléchargeable depuis l'UI recruteur pour illustrer la syntaxe.

### Côté génération

Quand un recruteur clique "générer le dossier pour ce candidat" :

1. Vérifier qu'un `AccessGrant` actif existe entre le candidat et l'organization du recruteur.
2. Charger le `CandidateProfile` complet avec toutes ses relations.
3. Charger le `Template` `.docx` + `mappings`.
4. Appliquer les mappings :
   - Placeholders simples → remplacement direct.
   - Blocs listes → clone et remplacement par item.
   - Dates → format français par défaut (`MM/YYYY`).
5. Sauvegarder le `.docx` généré et créer un enregistrement `GeneratedDocument`.
6. (Optionnel) Conversion PDF via LibreOffice headless (`libreoffice --convert-to pdf`).
7. Retourner l'URL de téléchargement authentifiée.

### Cas d'erreur

- **Template invalide** (`is_valid=false`) → refus de génération avec message clair.
- **AccessGrant révoqué** entre temps → 403 avec message explicite.
- **Champ profil vide** → placeholder remplacé par chaîne vide, pas d'erreur.
- **Échec conversion PDF** → on livre au moins le Word, l'erreur PDF est loggée sans bloquer.

---

## Authentification & portails

### Endpoints d'auth

```
Email/password
├── POST /auth/register      → crée User + envoie email de vérification
├── POST /auth/login         → retourne JWT access + refresh
├── POST /auth/refresh       → renouvelle access token
├── POST /auth/verify-email  → valide le compte via token
└── POST /auth/reset-password

OAuth (Google + LinkedIn)
├── GET /auth/oauth/{provider}/login     → redirige vers le provider
├── GET /auth/oauth/{provider}/callback  → crée/lie le User, renvoie JWT
```

**Implémentation :** maison légère avec `python-jose` (JWT) + `passlib[bcrypt]` + `authlib` (OAuth). `fastapi-users` écarté (trop verbeux pour nos besoins simples).

**Tokens :**
- Access : 15 min, contient `user_id` + `role`.
- Refresh : 30 jours, stocké en DB (révocable).
- Stockage frontend : cookies `httpOnly` (plus sûr que localStorage).

### Rôles et séparation des portails

Le rôle (`candidate` ou `recruiter`) est fixé à la création du compte. Un même email ne peut pas avoir deux rôles — cette contrainte sera levée ultérieurement si besoin.

```
Next.js App Router
├── /(public)         ← landing, login, register
├── /(candidate)/...  ← middleware role=candidate
├── /(recruiter)/...  ← middleware role=recruiter
└── /api/...          ← proxy vers FastAPI si BFF nécessaire
```

Le middleware Next.js vérifie à chaque requête : JWT valide (sinon redirect `/login`) + rôle cohérent avec le groupe de routes (sinon 403).

### Pages principales

**Portail candidat**
```
/candidate/profile      ← édition du profil complet
/candidate/requests     ← invitations reçues (accepter/refuser)
/candidate/access       ← liste des orgas ayant accès (révoquer)
/candidate/history      ← dossiers générés me concernant
```

**Portail recruteur**
```
/recruiter/candidates   ← candidats ayant donné accès à mon orga
/recruiter/templates    ← CRUD templates (upload + mapping)
/recruiter/invitations  ← inviter des candidats (email)
/recruiter/generate     ← sélection candidat + template → génération
/recruiter/history      ← documents générés par mon orga
```

### Sécurité

- Les endpoints backend vérifient **à la fois le JWT et l'autorisation métier** (un recruteur ne peut générer que pour les candidats de son organization avec AccessGrant actif).
- Les fichiers (templates, documents générés) sont servis par des **endpoints authentifiés** qui streament le fichier — pas de liens publics directs au storage.
- **RGPD** : un candidat peut exporter toutes ses données, supprimer son compte (cascade sur Experiences, Skills, etc.). Les `GeneratedDocument` passés sont anonymisés mais conservés pour audit recruteur.

---

## Tests & qualité

### Stratégie backend (pytest)

```
backend/tests/
├── unit/
│   ├── test_template_parser.py    ← extraction placeholders d'un .docx
│   ├── test_docx_generator.py     ← génération .docx à partir de mappings
│   ├── test_pdf_converter.py      ← conversion docx→pdf
│   └── test_auth.py               ← hashing, JWT, OAuth callback
├── integration/
│   ├── test_candidate_api.py      ← CRUD profil candidat
│   ├── test_recruiter_api.py      ← CRUD templates, invitations
│   ├── test_access_flow.py        ← invitation → acceptation → grant → génération
│   └── test_generation_api.py     ← end-to-end : mapping → docx généré
└── fixtures/
    ├── sample_templates/          ← .docx de test avec placeholders
    └── sample_profiles.json       ← profils candidats de test
```

**Principes :**
- DB réelle en tests d'intégration (PostgreSQL via `testcontainers` ou base dédiée). SQLite écarté : diverge du comportement Postgres.
- Fixtures `.docx` réelles pour tester parsing et génération.
- Snapshots des documents générés : comparaison au fichier de référence versionné.

### Stratégie frontend

```
frontend/tests/
├── unit/            ← composants isolés (Vitest + React Testing Library)
└── e2e/             ← parcours utilisateurs (Playwright)
    ├── candidate-signup-to-profile.spec.ts
    ├── recruiter-upload-template-and-map.spec.ts
    └── full-generation-flow.spec.ts
```

### Observabilité

- Logs JSON structurés (`structlog`) avec `request_id` propagé.
- INFO par défaut, DEBUG via variable d'env.
- Événements métier importants loggés : génération, invitation, révocation d'accès.
- Pas de Sentry/APM pour le MVP — à ajouter en prod.

### Qualité

- Backend : `ruff` (lint + format) + `mypy` strict.
- Frontend : `eslint` + `prettier` + `tsc --noEmit`.
- Pre-commit hooks.
- CI GitHub Actions : tests + lint sur chaque PR.

---

## Structure du repo

```
jorg/
├── backend/
│   ├── api/            ← routes FastAPI (auth, candidates, recruiters, templates...)
│   ├── core/           ← config, sécurité, DB, dépendances
│   ├── models/         ← SQLAlchemy models
│   ├── schemas/        ← Pydantic schemas (I/O validation)
│   ├── services/       ← logique métier (template_service, generation_service...)
│   ├── tests/
│   ├── alembic/        ← migrations DB
│   └── pyproject.toml
├── frontend/
│   ├── app/            ← Next.js App Router
│   ├── components/     ← composants réutilisables (shadcn/ui)
│   ├── lib/            ← client API, hooks, utils
│   ├── types/          ← types partagés
│   ├── tests/
│   └── package.json
├── docs/
│   └── superpowers/specs/
├── docker-compose.yml  ← Postgres + LibreOffice pour dev local
└── README.md
```

Le dossier `services/` (logique métier) s'ajoute au backend existant pour garder les routes fines et la logique testable en isolation.

---

## Hors scope du MVP

Pour éviter la dérive de scope, les éléments suivants sont **explicitement exclus** du MVP :

- Partage de profil par lien public du candidat (uniquement invitation recruteur).
- Marketplace / annuaire searchable de candidats.
- Multi-profils par User (un User = un rôle).
- Versioning des templates.
- Éditeur in-app de template (drag & drop).
- Détection automatique de zones par IA dans le Word.
- Multi-langue de l'interface (français uniquement au MVP).
- Notifications temps réel (emails transactionnels suffisent).
- Sentry / APM / monitoring avancé.
- Stockage S3 (local en dev, migrable en prod).
