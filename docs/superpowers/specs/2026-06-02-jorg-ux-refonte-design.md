# Jorg — Refonte UX / Architecture d'Information — Design

> **Pour les workers agentiques :** ce document est la **spec de design** validée. Le plan d'implémentation
> task-by-task sera produit séparément via `superpowers:writing-plans`. Ne pas implémenter à partir de
> cette spec seule.

**Date :** 2026-06-02
**Statut :** validé (design) — en attente de relecture utilisateur avant plan d'implémentation
**Origine :** audit UX/Produit de Jorg (plateforme de recrutement à deux faces Candidat/Recruteur).

---

## 1. Objectif

Refondre l'architecture d'information et les parcours de Jorg pour corriger les faiblesses produit
identifiées à l'audit, **sans réécrire la logique métier** (modèle d'accès, génération par templates,
taxonomie de compétences restent inchangés). Toute la valeur est dans la couche IA + parcours.

Trois résultats visés :

1. **Navigation** : 14 → 9 entrées (recruteur 7→5, candidat 7→4), poids visuel réaligné sur la valeur.
2. **Parcours critiques** débloqués : génération recruteur sans perte de contexte ; onboarding recruteur
   (créer **ou** rejoindre une orga) ; CV candidat découvrable.
3. **Cohérence** : un artefact = un nom (**Dossier**), une relation = un lieu (**Accès**), un profil = un espace.

## 2. Décisions cadrantes (prises au brainstorming)

- **Périmètre = tout en un sprint**, y compris les 3 surfaces net-new — mais chacune cadrée à sa **version MVP**
  (voir §6).
- **Mécanisme « rejoindre une organisation » = code / lien partageable**, jonction **instantanée, sans
  approbation** (cohérent avec l'absence de modèle de rôle/admin).

## 3. Contraintes & faits backend (vérifiés)

- `RecruiterProfile.organization_id` : FK **nullable, non-unique** → plusieurs recruteurs par organisation
  déjà supportés. « Rejoindre » = mettre à jour ce champ. **Aucune migration de modèle pour le multi-membres.**
- **Aucun concept de rôle/admin** (pas de propriétaire vs membre). Tout membre peut inviter ; pas d'approbation.
- `_require_org_membership` ([`backend/api/routes/organizations.py:38`](../../../backend/api/routes/organizations.py)) =
  simple égalité `profile.organization_id == org_id`.
- `Organization.slug` est **dérivé du nom** (`_slugify` → `acme-consulting`) donc **devinable** :
  **ne pas** l'utiliser comme code de jonction. → champ `join_code` aléatoire dédié.
- `create_organization` **ne rattache pas** le créateur (le frontend fait 2 appels :
  `POST /organizations` puis `PUT /recruiters/me/profile`). → à rendre atomique.
- Endpoints déjà présents et réutilisés tels quels : `/candidates/me/organizations`
  (cartes orga + `events`), `/invitations/me`, `POST …/invitations`, `POST …/generate`,
  `POST …/opportunities/{id}/generate`.
- ⚠️ **Plan de sécurité en attente** ([`docs/superpowers/plans/2026-05-04-audit-remediation.md`](../plans/2026-05-04-audit-remediation.md),
  non implémenté) : il réécrit `login`, `lib/api.ts`, `lib/auth.ts`, ajoute un middleware, et redirige l'OAuth
  recruteur vers `/recruiter/templates`. Chevauchement à coordonner (voir §10).
- ⚠️ `frontend/AGENTS.md` : « This is NOT the Next.js you know — lire `node_modules/next/dist/docs/` avant
  d'écrire du code ». Obligatoire avant tout changement de routing/redirection/middleware.

## 4. Nouvelle architecture de navigation

### 4.1 Recruteur — 7 → 5 entrées

```
Tableau de bord   /recruiter/dashboard      + CTA onboarding si organization_id == null
Candidats         /recruiter/candidates     ← HUB
  • [Inviter un candidat] (modale)
  • par candidat : [Générer un dossier] (drawer) · [+ Opportunité] · [Voir le profil]
  └ /recruiter/candidates/[id]              ← NOUVELLE route détail (réutilise CandidateExperiencePanel)
Opportunités      /recruiter/opportunities
  └ /recruiter/opportunities/[id]           shortlist · génération en masse · clôture
Dossiers          /recruiter/documents      ← ex-« Historique »
Configuration     /recruiter/settings       Organisation · Membres ([Copier le lien]) · Templates
```

Retirés du nav : **Invitations** (→ modale), **Générer** (→ drawer), **Templates** (→ sous Configuration ;
routes existantes conservées).

### 4.2 Candidat — 7 → 4 entrées

```
Tableau de bord   /candidate/dashboard      + checklist de complétion + notifications
Mon profil        /candidate/profile        ← FUSION profil + CV, onglets in-page :
                                              Informations · Expériences · Compétences · Formation · Langues
                                              • [Aperçu recruteur]
Accès             /candidate/access          ← FUSION invitations + accès (+ dossiers générés repliés)
Paramètres        /candidate/settings        export RGPD · suppression
```

Retirés du nav : **Compétences** (→ onglet de Profil), **Invitations** + **Historique** (→ dans Accès).

### 4.3 Shell (les deux portails)

- **Cloche de notifications** dans l'en-tête de `frontend/components/nav-sidebar.tsx` → dropdown alimenté par
  des données **déjà disponibles**, distinctes par portail : **candidat** = `events` de
  `/candidates/me/organizations` (la « Activité récente » du dashboard) ; **recruteur** = dossiers récents +
  candidats nouvellement accessibles (données déjà chargées au dashboard). MVP : lecture + lien vers la page
  concernée, **pas de persistance ni d'état lu/non-lu**.
- **Fils d'Ariane** in-page sur `candidates/[id]`, `opportunities/[id]`, et la zone Templates de Configuration.

## 5. Portail Recruteur — détail

### 5.1 Onboarding (créer OU rejoindre)

Écran post-inscription + CTA sur le dashboard quand `organization_id` est nul (remplace le `CreateOrgPrompt`
caché dans Templates).

```
● Créer une organisation        Nom: [ Acme Consulting ]  [Créer]   → crée + rattache (1 transaction)
○ Rejoindre une organisation    Code: [ 7F3K-9Q2X ]       [Rejoindre] → POST /organizations/join {code}
```

### 5.2 Candidats — le HUB

La page riche existante (`recruiter/candidates/page.tsx`) enrichie d'actions :

- **[Inviter un candidat]** (bouton primaire) → **modale** réutilisant `POST /organizations/{org}/invitations`.
- Par carte : **[Générer un dossier]** → **drawer** pré-rempli réutilisant `POST /organizations/{org}/generate` ;
  **[+ Opportunité]** (existant) ; **[Voir le profil]** → `/recruiter/candidates/[id]`.
- Filtre « statut d'accès » (actif / invité) alimenté par la liste d'invitations de l'orga.

### 5.3 Détail candidat `/recruiter/candidates/[id]` _(net-new, MVP)_

Réutilise `CandidateExperiencePanel` déjà écrit + fil d'Ariane + mêmes actions (Générer, +Opportunité).
Deep-linkable. **MVP : données via l'endpoint existant `/organizations/{org}/candidates` filtré par `id`
côté client** (aucun nouveau backend) ; un `GET /organizations/{org}/candidates/{id}` dédié est une
optimisation ultérieure (hors-périmètre).

### 5.4 Opportunités

Inchangé fonctionnellement. Ajouts : fil d'Ariane sur `[id]` ; remplacement de l'`alert()` de génération
en masse ([`opportunities/[id]/page.tsx:92`](<../../../frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx>))
par `ErrorAlert`/toast.

### 5.5 Dossiers `/recruiter/documents`

L'actuelle page « Historique » renommée (nav + h1 « Dossiers »). Route déplacée
`recruiter/history` → `recruiter/documents`.

### 5.6 Configuration `/recruiter/settings` (onglets in-page)

- **Organisation** : nom, logo.
- **Membres** : liste (nouveau `GET /organizations/{id}/members`) + **[Copier le lien d'invitation]**
  (`…/join/<join_code>`) + **[Régénérer le code]**.
- **Templates** : pages Templates existantes atteintes ici (routes inchangées, dé-promues du nav).

## 6. Portail Candidat — détail

### 6.1 Mon profil `/candidate/profile` (fusion via onglets)

Coquille à onglets ; **composants existants réutilisés sans réécriture** :

- **Informations** = le formulaire actuel de `candidate/profile/page.tsx`.
- **Expériences / Compétences / Formation / Langues** = les sections déjà écrites dans
  `candidate/skills/page.tsx` (`ExperienceSection`, `SkillSection`, `EducationSection`, `CertificationSection`,
  `LanguageSection`).
- `/candidate/skills` → **redirige** vers `/candidate/profile?tab=competences`. Deep-link via `?tab=`.
- **Montage paresseux par onglet actif** (la page combinée est lourde — l'éditeur CV fait ~2 500 lignes).

### 6.2 Aperçu recruteur _(net-new, MVP)_

Bouton **[Aperçu recruteur]** → **modale/drawer** rendant le profil « tel qu'un recruteur le voit ».
**Composé côté client** depuis les endpoints existants (`/candidates/me/profile`, `/skills`, `/experiences`,
`/languages`, …). **Aucun nouveau backend, pas de template Word.**

### 6.3 Accès `/candidate/access` (fusion)

```
⚠ Invitations en attente            (source: /invitations/me — accepter/refuser)
   Acme Consulting · expire le 30/06 · [Accepter] [Refuser]    ← NOM RÉEL (fix UUID)
Organisations                       (source: /candidates/me/organizations)
   Acme Consulting · ● Accès actif
   ▸ Historique (N événements)      ← events existants
   ▸ Dossiers générés (N) [Télécharger]   ← repliés ici (supprime l'onglet « Historique »)
   [Révoquer l'accès]
```

### 6.4 Paramètres `/candidate/settings`

Inchangé (export RGPD, suppression de compte), libellé « Compte ».

## 7. Deltas backend (consolidés)

| #   | Delta                                                                     | Endpoint / fichier                                                                                            | Type                                                                        |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| B1  | `Organization.join_code` aléatoire, unique, rotatable                     | `backend/models/recruiter.py` + migration Alembic (backfill des orgs existantes)                              | nouveau                                                                     |
| B2  | Rejoindre par code                                                        | `POST /organizations/join { code }` → set `organization_id` (idempotent si déjà membre ; 404 si code inconnu) | nouveau                                                                     |
| B3  | Régénérer le code                                                         | `POST /organizations/{id}/regenerate-join-code` (membre)                                                      | nouveau                                                                     |
| B4  | Lister les membres                                                        | `GET /organizations/{id}/members` → recruteurs (nom, job_title, email)                                        | nouveau                                                                     |
| B5  | Création atomique                                                         | `recruiter_service.create_organization` rattache le créateur (1 transaction)                                  | modif                                                                       |
| B6  | Nom d'orga sur invitations                                                | `/invitations/me` → ajouter `organization_name` (corrige l'UUID tronqué)                                      | modif                                                                       |
| B7  | Dossiers candidat enrichis (nom orga + template) pour le repli dans Accès | `schemas/generation.py` + `services/generation_service.py` + `api/routes/generation.py`                       | modif — ⚠️ **chevauche Task 9 du plan sécurité** : une seule implémentation |

Réutilisés sans changement : génération (single + bulk), invitation candidat, templates, accès/révocation,
listing candidats accessibles.

## 8. Vocabulaire & centralisation

Glossaire centralisé dans **`frontend/lib/labels.ts`** (supprime aussi les `STATUS_LABELS` dupliqués dans
`requests`, `access`, `invitations`) :

| Concept                     | Terme unique                | Remplace                                                         |
| --------------------------- | --------------------------- | ---------------------------------------------------------------- |
| Document généré             | **Dossier**                 | « CV », « profil généré », « Historique »                        |
| Relation orga↔candidat      | **Accès**                   | « Invitations » (candidat), « Accès accordés », « interactions » |
| Espace CV candidat          | **Mon profil** (onglets)    | « Compétences » comme conteneur global                           |
| Demande d'accès (recruteur) | action **Inviter** (modale) | onglet « Invitations »                                           |

## 9. Gestion d'erreurs & composants partagés

- Surfaces d'erreur standardisées : `ErrorAlert` + toasts `sonner` (déjà présent dans `components/ui/sonner.tsx`).
- Suppression de l'`alert()` natif (`opportunities/[id]`).
- Nouveaux composants partagés attendus : `NotificationBell` (+ dropdown), `Breadcrumb`, `Drawer`
  (génération), shell d'onglets de profil. Chaque unité : une responsabilité, testable isolément.

## 10. Séquençage, risques & hors-périmètre

**Séquençage vs plan de sécurité**

- Ne **pas** toucher à l'auth dans ce sprint (changements additifs uniquement : nouveaux endpoints, nouvelles
  routes, déplacements de composants).
- Coordination : (a) la redirection OAuth recruteur du plan sécurité (`→ /recruiter/templates`) devra cibler
  le nouveau dashboard/onboarding ; (b) le delta **B7** ne doit être implémenté qu'**une fois** (ici **ou** Task 9
  — celui qui atterrit en premier ; l'autre s'aligne).

**Risques & mitigations**

- Page Profil fusionnée lourde → **montage paresseux par onglet actif**.
- Churn de route `skills` → `profile` et `history` → `documents` → redirections + recherche des liens internes
  (`QuickActionCard` du dashboard, liens en dur).
- Sécurité du join → `join_code` **aléatoire** (jamais le slug) ; régénérable.
- Migration `join_code` → **backfill** des organisations existantes avec un code généré.

**Hors-périmètre (explicite)**

- Hiérarchie de rôles/admin, approbation d'adhésion, invitations d'orga par **email**.
- Persistance des notifications / état lu-non-lu / temps réel.
- Réécriture de l'authentification (plan de sécurité séparé).

## 11. Critères d'acceptation (haut niveau)

1. Recruteur sans orga : peut **créer** (rattachement atomique) **ou rejoindre par code** depuis l'onboarding/dashboard.
2. Recruteur : peut **inviter** (modale) et **générer un dossier** (drawer) **depuis la page Candidats**, sans
   ressaisir le candidat ; peut ouvrir `/recruiter/candidates/[id]`.
3. Nav recruteur = 5 entrées ; Invitations/Générer ne sont plus des onglets ; Templates sous Configuration.
4. Candidat : « Mon profil » regroupe identité + expériences + compétences + formation + langues (onglets) ;
   `/candidate/skills` redirige.
5. Candidat : « Accès » liste les invitations en attente **actionnables avec le nom réel de l'orga** + les accès
   par orga (events + dossiers + révocation) ; plus d'onglets Invitations/Historique.
6. Vocabulaire unifié (Dossier / Accès / Mon profil) via `lib/labels.ts`.
7. Cloche de notifications fonctionnelle (lecture des events) sur les deux portails.
8. Aucun `alert()` natif ; aucune fuite d'UUID tronqué en guise de nom.
