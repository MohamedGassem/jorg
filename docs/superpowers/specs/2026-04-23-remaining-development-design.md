# Jorg — Remaining Development Design

**Date:** 2026-04-23
**Statut:** Validé — prêt pour plans d'implémentation

---

## Contexte

Le MVP de base est entièrement livré (Plans 1–6 + P0/P1/P2 + G1+G2 RGPD, tous mergés sur `master`). Ce document couvre les **gaps MVP restants** (G4, G5, G6, G7, G10) et les **features post-MVP** (C1–C4) selon la roadmap `2026-04-22-plan-mvp-analysis-roadmap.md`.

**Gaps déjà couverts (pas de plan à rédiger) :**
- G3 — Email service : `core/email.py` Console + SMTP déjà implémentés
- G8 — CI GitHub Actions : `.github/workflows/backend-ci.yml` + `frontend-ci.yml` déjà présents
- G9 — Docker Compose dev : `docker-compose.yml` avec Postgres déjà présent

---

## Partie 1 — Gaps MVP restants

### G4 — Observabilité : structlog + request_id + événements métier

**Scope :** middleware FastAPI + logging des événements clés. Aucun changement de modèle DB.

**Middleware :**
- Middleware FastAPI qui génère `request_id = uuid4()` à chaque requête entrante
- Injection dans `structlog.contextvars` pour propagation automatique dans tous les logs de la requête
- Header `X-Request-ID` retourné dans chaque réponse

**Événements métier à logger (niveau INFO) dans les services existants :**
- `auth.login` — `user_id`, `role`
- `invitation.sent` — `recruiter_id`, `candidate_email`, `organization_id`
- `access.granted` — `candidate_id`, `organization_id`
- `access.revoked` — `candidate_id`, `organization_id`
- `document.generated` — `template_id`, `candidate_id`, `format`, `access_grant_id`
- `template.uploaded` — `organization_id`, `template_id`, `placeholder_count`

**Configuration :** `LOG_LEVEL` env var (défaut `INFO`). Sortie JSON structurée via `structlog.configure()` dans `main.py`.

**Tests :** vérifier que `request_id` est présent dans les logs pour une requête HTTP de test, vérifier chaque événement métier loggé.

---

### G6 — Historique candidat : endpoint `GET /candidates/me/documents`

**Scope :** un seul endpoint backend. Le frontend `/candidate/history` existe déjà et consomme exactement cette URL.

**Endpoint :** `GET /candidates/me/documents` (auth candidat)

**Requête SQL :** `GeneratedDocument JOIN AccessGrant ON access_grant_id JOIN Organization ON organization_id JOIN Template ON template_id` — filtre `AccessGrant.candidate_id = current_user.id`.

**Réponse :**
```json
[{
  "id": "uuid",
  "generated_at": "2026-04-20T14:32:00",
  "file_format": "docx",
  "organization_name": "Acme Consulting",
  "template_name": "Dossier Senior"
}]
```

Trié `generated_at DESC`. Pas de téléchargement depuis le candidat — métadonnées uniquement (transparence RGPD).

**Tests :** candidat sans documents (liste vide), candidat multi-orgas, documents d'un autre candidat non exposés.

---

### G7 — Téléchargement authentifié du fichier template

**Scope :** un seul endpoint backend. Aucun changement frontend.

**Endpoint :** `GET /organizations/{org_id}/templates/{template_id}/file` (auth recruteur)

**Autorisation :** vérifier que le `RecruiterProfile.organization_id` correspond à `org_id` (pattern identique aux endpoints existants dans `organizations.py`).

**Réponse :** `FileResponse` ou `StreamingResponse` sur `template.word_file_path`. `Content-Disposition: attachment; filename=<template.name>.docx`. Retourne 404 si le fichier n'existe plus sur le disque.

**Tests :** téléchargement OK, recruteur d'une autre orga → 403, template inexistant → 404, fichier manquant → 410.

---

### G5 — Template d'exemple téléchargeable (P2)

**Scope :** fichier statique + endpoint backend + bouton UI frontend.

**Fichier :** `backend/static/sample_template.docx` versionné en git. Contenu : document Word illustrant la syntaxe complète — placeholders simples (`{{NOM}}`, `{{TITRE}}`, `{{TJM}}`), bloc liste (`{{#EXPERIENCES}}…{{/EXPERIENCES}}`), bloc compétences (`{{#COMPETENCES}}…{{/COMPETENCES}}`). Le fichier doit être utilisable tel quel pour créer un vrai template mappable.

**Endpoint :** `GET /templates/sample` (auth recruteur). `FileResponse` sur `backend/static/sample_template.docx`.

**Frontend :** bouton "Télécharger un exemple" sur `/recruiter/templates` (à côté du bouton "Nouveau template"). Appel `GET /templates/sample` avec download déclenché côté client.

**Tests :** endpoint retourne bien un `.docx` avec `Content-Type: application/vnd.openxmlformats...`, auth requise.

---

### G10 — Pre-commit hooks (P2)

**Scope :** fichier config uniquement. Aucun changement de code.

**Fichier :** `.pre-commit-config.yaml` à la racine du repo.

**Hooks :**
```yaml
- ruff check --fix          # lint Python
- ruff format               # format Python
- prettier --write          # format JS/TS/JSON/MD
- tsc --noEmit              # typecheck TypeScript (manual stage)
- trailing-whitespace
- end-of-file-fixer
- check-merge-conflict
```

**Installation :** `pre-commit install` documenté dans le README racine.

---

## Partie 2 — Features post-MVP

### C1 — Disponibilité & préférences mission

**Priorité :** P1 post-MVP (la plus haute des 4 features)

#### Modèle de données

Migration Alembic sur `candidate_profiles` — ajout de 6 colonnes :

| Colonne | Type | Contrainte |
|---|---|---|
| `availability_status` | `enum('available_now','available_from','not_available')` | NOT NULL, default `'not_available'` |
| `availability_date` | `DATE` | nullable — requis si `status='available_from'` |
| `work_mode` | `enum('remote','onsite','hybrid')` | nullable |
| `location_preference` | `VARCHAR` | nullable — texte libre (ex: "Paris, Lyon") |
| `preferred_domains` | `VARCHAR[]` (ARRAY) | nullable — valeurs : `finance`, `retail`, `industry`, `public`, `health`, `tech`, `telecom`, `energy`, `other` |
| `mission_duration` | `enum('short','medium','long','permanent')` | nullable — `short`=<3m, `medium`=3-6m, `long`=6m+, `permanent`=CDI |

**Validation Pydantic :** `availability_date` requis (non null) si `availability_status = 'available_from'`, sinon ignoré.

#### Backend

- Ajout dans `CandidateProfileRead` et `CandidateProfileUpdate` (schémas existants)
- Validation dans `candidate_service.update_profile()`
- Exposition dans `GET /candidates/me` (déjà existant)
- Mise à jour dans `PATCH /candidates/me` (déjà existant)

#### Frontend

Section "Disponibilité & préférences mission" ajoutée en bas du formulaire `/candidate/profile` :

- `availability_status` : RadioGroup (3 options)
- `availability_date` : DatePicker, visible uniquement si `status = 'available_from'`
- `work_mode` : Select (remote / présentiel / hybride)
- `location_preference` : Input texte libre
- `preferred_domains` : groupe de Checkboxes (9 options)
- `mission_duration` : Select (4 options)

#### Nouveaux champs mappables dans les templates

4 entrées ajoutées à `PROFILE_FIELDS` dans la page template recruteur :
- `availability_status` → "Disponibilité"
- `work_mode` → "Mode de travail"
- `location_preference` → "Localisation préférée"
- `mission_duration` → "Durée de mission souhaitée"

#### Tests

- Migration + CRUD profil avec nouveaux champs
- Validation : `availability_date` requis si `status='available_from'`
- `preferred_domains` : valeurs invalides rejetées
- Nouveaux champs présents dans `PROFILE_FIELDS` frontend

---

### C2 — Timeline des interactions candidat ↔ organisations

**Priorité :** P2 post-MVP

#### Architecture

Pas de nouvelle table DB. La timeline est **reconstruite à la lecture** depuis les données existantes :
- `Invitation` → événements `invitation_sent`, `invitation_accepted`, `invitation_rejected`, `invitation_expired`
- `AccessGrant` → événements `access_granted`, `access_revoked`
- `GeneratedDocument` → événement `document_generated`

#### Endpoint

`GET /candidates/me/organizations` (auth candidat)

**Logique :**
1. Récupérer toutes les `Invitation` où `candidate_id = me` OU `candidate_email = me.email`
2. Récupérer tous les `AccessGrant` où `candidate_id = me`
3. Récupérer tous les `GeneratedDocument` liés à ces grants
4. Grouper par `organization_id`, dédupliquer
5. Calculer `current_status` : `active` si grant actif existe, `revoked` si grant révoqué, `invited` si invitation pending, `expired` si invitation expired/rejected sans grant

**Réponse :**
```json
[{
  "organization_id": "uuid",
  "organization_name": "Acme Consulting",
  "logo_url": null,
  "current_status": "active",
  "events": [
    {
      "type": "invitation_sent",
      "occurred_at": "2026-04-01T10:00:00",
      "metadata": {}
    },
    {
      "type": "access_granted",
      "occurred_at": "2026-04-02T09:15:00",
      "metadata": {}
    },
    {
      "type": "document_generated",
      "occurred_at": "2026-04-10T14:30:00",
      "metadata": { "template_name": "Dossier Senior", "file_format": "docx" }
    }
  ]
}]
```

Événements triés `occurred_at ASC` par organisation. Organisations triées par dernier événement `DESC`.

#### Frontend

Page `/candidate/access` enrichie (existante, liste actuellement les orgas avec accès actif) :

- Affiche désormais **toutes** les organisations ayant interagi (pas seulement celles avec accès actif)
- Chaque orga = `Card` avec badge statut coloré (`active`=vert, `invited`=jaune, `revoked`=rouge, `expired`=gris)
- Accordéon shadcn `<Accordion>` déplié sur chaque card : liste des événements avec icône type + date formatée FR
- Bouton "Révoquer l'accès" conservé, visible uniquement si `current_status = 'active'`

#### Tests

- Candidat sans interaction → liste vide
- Candidat avec orga en statut `invited` (pas de grant)
- Candidat avec orga `active` + événements mix
- Candidat avec orga `revoked` — statut correct
- `document_generated` metadata correcte (template_name présent)

---

### C3 — Recherche & filtrage candidats côté recruteur

**Priorité :** P3 post-MVP

#### Architecture

Extension de l'endpoint existant `GET /organizations/{org_id}/candidates` (créé en P1.1) avec query params optionnels. Filtrage 100% SQL côté backend. Pas d'index full-text au MVP — `ILIKE` suffisant pour les volumes attendus.

#### Query params

| Param | Type | Filtrage SQL |
|---|---|---|
| `availability_status` | enum | `CandidateProfile.availability_status = ?` |
| `work_mode` | enum | `CandidateProfile.work_mode = ?` |
| `contract_type` | enum | `CandidateProfile.contract_type = ?` |
| `max_daily_rate` | int | `CandidateProfile.daily_rate <= ?` (ignoré si `daily_rate IS NULL`) |
| `skill` | str | `EXISTS (SELECT 1 FROM skills WHERE candidate_profile_id = ... AND name ILIKE ?)` |
| `location` | str | `CandidateProfile.location_preference ILIKE ?` |
| `domain` | str | `? = ANY(CandidateProfile.preferred_domains)` |
| `q` | str | `CandidateProfile.title ILIKE ? OR CandidateProfile.summary ILIKE ?` |

Tous optionnels, combinables (conditions `AND`).

#### Frontend

Page `/recruiter/candidates` enrichie :

- Barre de filtres en haut de la liste (layout existant préservé)
- Filtres dropdowns : `availability_status`, `work_mode`, `contract_type`
- Filtres inputs : `max_daily_rate` (number), `skill` (texte), `location` (texte), `q` (texte)
- Filtre `domain` : Select simple
- Debounce 300ms sur les champs texte (`skill`, `location`, `q`) avant appel API
- Bouton "Réinitialiser les filtres"
- Badge compteur "N candidats" mis à jour dynamiquement

#### Tests

- Chaque filtre isolé retourne les bons résultats
- Combinaison de filtres (AND)
- `max_daily_rate` : candidat avec `daily_rate = null` non exclu (filtre ignoré pour ce candidat)
- `skill` ILIKE : insensible à la casse
- Filtre `domain` : candidat avec `preferred_domains = ['finance', 'tech']` matche `domain=finance`

---

### C4 — Shortlist de staffing

**Priorité :** P4 post-MVP

#### Modèle de données

Deux nouvelles tables (migration Alembic) :

```sql
opportunities
  id               UUID PK
  organization_id  UUID FK organizations.id NOT NULL
  created_by       UUID FK users.id NOT NULL
  title            VARCHAR NOT NULL
  description      TEXT nullable
  status           enum('open','closed') NOT NULL default 'open'
  created_at       TIMESTAMPTZ
  updated_at       TIMESTAMPTZ

shortlist_entries
  id               UUID PK
  opportunity_id   UUID FK opportunities.id CASCADE
  candidate_id     UUID FK users.id CASCADE
  added_at         TIMESTAMPTZ
  UNIQUE(opportunity_id, candidate_id)
```

#### Endpoints backend

```
POST   /organizations/{org_id}/opportunities
       body: { title, description? }
       → crée Opportunity, retourne OpportunityRead

GET    /organizations/{org_id}/opportunities
       → liste des opportunités de l'orga (toutes, open + closed)

GET    /organizations/{org_id}/opportunities/{opp_id}
       → détail + shortlist avec CandidateProfile minimal

PATCH  /organizations/{org_id}/opportunities/{opp_id}
       body: { title?, description?, status? }
       → mise à jour

POST   /organizations/{org_id}/opportunities/{opp_id}/candidates
       body: { candidate_id }
       → ajoute à la shortlist (vérifie AccessGrant actif + unicité)

DELETE /organizations/{org_id}/opportunities/{opp_id}/candidates/{candidate_id}
       → retire de la shortlist

POST   /organizations/{org_id}/opportunities/{opp_id}/generate
       body: { template_id, format: "docx"|"pdf" }
       → génération bulk : itère sur shortlist, appelle generation_service existant
       → retourne [ { candidate_id, status: "ok"|"error", doc_id?, error? } ]
```

**Génération bulk :** synchrone au MVP. Candidats dont le grant a été révoqué → `status: "error"` dans le rapport, pas d'interruption des autres. Même pattern que la génération unitaire existante.

**Autorisation :** toutes les routes vérifient `RecruiterProfile.organization_id = org_id`.

#### Frontend

**Nouvelle section `/recruiter/opportunities`** :
- Liste des opportunités avec statut badge + nombre de candidats en shortlist
- Bouton "Nouvelle opportunité" → modal avec champs `title` + `description`
- Lien vers page détail

**Page `/recruiter/opportunities/{id}`** :
- Header : titre, description, statut, bouton "Fermer l'opportunité"
- Liste des candidats en shortlist : nom, titre, disponibilité, bouton "Retirer"
- Bouton "Générer tous les dossiers" → modal de sélection template + format → POST generate → rapport inline résultats
- Bouton "Ajouter des candidats" → redirect vers `/recruiter/candidates` avec sélection

**Sur `/recruiter/candidates`** :
- Bouton "Ajouter à une opportunité" sur chaque candidat → modal de sélection d'opportunité (liste des opportunités `open` de l'orga)

#### Tests

- CRUD opportunité
- Ajout candidat sans AccessGrant actif → 403
- Unicité `(opportunity_id, candidate_id)` — double ajout → 409
- Génération bulk : mix OK + erreurs (grant révoqué entre-temps)
- Clôture opportunité → status `closed`, génération toujours possible

---

## Récapitulatif des plans à produire

| Plan | Gap/Feature | Priorité | Complexité estimée |
|---|---|---|---|
| `plan-g4-observability.md` | G4 — structlog + request_id | P1 MVP | Faible — 4 tasks |
| `plan-g6-candidate-history.md` | G6 — endpoint historique candidat | P1 MVP | Très faible — 2 tasks |
| `plan-g7-template-file-download.md` | G7 — endpoint fichier template | P1 MVP | Très faible — 2 tasks |
| `plan-g5-sample-template.md` | G5 — template d'exemple | P2 MVP | Très faible — 2 tasks |
| `plan-g10-precommit.md` | G10 — pre-commit hooks | P2 MVP | Très faible — 1 task |
| `plan-c1-availability-preferences.md` | C1 — disponibilité & préférences | P1 post-MVP | Moyen — 8 tasks |
| `plan-c2-interaction-timeline.md` | C2 — timeline interactions | P2 post-MVP | Moyen — 6 tasks |
| `plan-c3-candidate-search.md` | C3 — recherche & filtrage recruteur | P3 post-MVP | Moyen — 6 tasks |
| `plan-c4-staffing-shortlist.md` | C4 — shortlist de staffing | P4 post-MVP | Élevé — 12 tasks |

**Total : 9 plans, ~43 tasks.** G4/G6/G7 sont indépendants et parallélisables. C1 est prérequis de C3 (champs disponibilité + domaine). C2 et C4 sont indépendants des autres.
