# Dashboards Candidat & Recruteur — Design Spec

**Date :** 2026-05-07
**Statut :** Approuvé

---

## Contexte

L'application Jorg n'a pas de page d'accueil après la connexion. La page racine `/` redirige vers `/login`, et le logo de la sidebar pointe vers `/` — ce qui renvoie l'utilisateur connecté vers l'écran de login. Les deux espaces (candidat et recruteur) démarrent directement sur leur premier item de navigation.

L'objectif est d'ajouter une vraie page d'accueil par rôle : un dashboard combo stats + actions rapides + activité récente, qui donne une vue d'ensemble de l'état de l'espace au premier coup d'œil.

---

## Architecture & Routing

### Nouvelles pages

| Route                  | Fichier                                                 |
| ---------------------- | ------------------------------------------------------- |
| `/candidate/dashboard` | `frontend/app/(candidate)/candidate/dashboard/page.tsx` |
| `/recruiter/dashboard` | `frontend/app/(recruiter)/recruiter/dashboard/page.tsx` |

### Page racine intelligente

`frontend/app/page.tsx` devient un redirect conditionnel côté serveur :

1. Appelle `GET /users/me` (avec le cookie de session)
2. Si la réponse est 401 → redirect vers `/login`
3. Si `role === "candidate"` → redirect vers `/candidate/dashboard`
4. Si `role === "recruiter"` → redirect vers `/recruiter/dashboard`

### Correction du logo

Dans `frontend/components/nav-sidebar.tsx`, le `href="/"` du logo devient dynamique selon le rôle :

- Le composant `NavSidebar` reçoit un nouveau prop optionnel `homeHref: string`
- Le layout candidat passe `homeHref="/candidate/dashboard"`
- Le layout recruteur passe `homeHref="/recruiter/dashboard"`

### Navigation sidebar

Le dashboard est ajouté comme **premier item** de chaque nav, avec une icône `LayoutDashboard` (lucide-react) :

**Candidat :**

```
/candidate/dashboard  — Tableau de bord  (nouveau, en premier)
/candidate/profile
/candidate/skills
/candidate/requests
/candidate/access
/candidate/history
/candidate/settings
```

**Recruteur :**

```
/recruiter/dashboard  — Tableau de bord  (nouveau, en premier)
/recruiter/templates
/recruiter/invitations
/recruiter/candidates
/recruiter/opportunities
/recruiter/generate
/recruiter/history
```

---

## Dashboard Candidat

**Route :** `/candidate/dashboard`
**Composant :** `"use client"` — fetch des données au montage

### Données à charger (en parallèle)

| Donnée      | Endpoint                           | Utilisation                  |
| ----------- | ---------------------------------- | ---------------------------- |
| Profil      | `GET /candidates/me/profile`       | Calcul % complétion + prénom |
| Invitations | `GET /candidates/me/invitations`   | Count `status === "pending"` |
| Accès       | `GET /candidates/me/access-grants` | Count `status === "active"`  |
| Historique  | `GET /candidates/me/history`       | 3 derniers événements        |

### Calcul de la complétion du profil

Champs considérés (10 champs) : `first_name`, `last_name`, `title`, `summary`, `phone`, `location`, `availability_status` (non `null`), `work_mode`, au moins une compétence (chargée depuis `/candidates/me/skills`), au moins une expérience (chargée depuis `/candidates/me/experiences`).

Pourcentage = champs remplis / 10 × 100, arrondi à l'entier.

### Structure de la page

```
[Bonjour, {prénom} 👋]
[Sous-titre contextuel]

[KPI: Profil %] [KPI: Invitations en attente] [KPI: Accès actifs] [KPI: Dossiers générés]

[Actions rapides]
  → Compléter mon profil   (/candidate/profile)
  → Mes invitations        (/candidate/requests)  [badge si pending > 0]
  → Gérer mes accès        (/candidate/access)

[Activité récente — 3 derniers événements de l'historique]
```

### Couleurs des KPIs

| KPI                    | Couleur            |
| ---------------------- | ------------------ |
| Profil %               | `text-primary`     |
| Invitations en attente | `text-amber-500`   |
| Accès actifs           | `text-emerald-500` |
| Dossiers générés       | `text-foreground`  |

---

## Dashboard Recruteur

**Route :** `/recruiter/dashboard`
**Composant :** `"use client"` — dépend de `useRecruiterOrg` pour l'`orgId`

### Données à charger (en parallèle, après résolution de `orgId`)

| Donnée           | Endpoint                                   | Utilisation                  |
| ---------------- | ------------------------------------------ | ---------------------------- |
| Candidats        | `GET /organizations/{orgId}/candidates`    | Count total                  |
| Opportunités     | `GET /organizations/{orgId}/opportunities` | Count `status === "open"`    |
| Invitations      | `GET /organizations/{orgId}/invitations`   | Count `status === "pending"` |
| Documents        | `GET /organizations/{orgId}/documents`     | Count total + 3 derniers     |
| Profil recruteur | `GET /recruiters/me/profile`               | Prénom pour le greeting      |

### Structure de la page

```
[Bonjour, {prénom} 👋]
[Sous-titre contextuel]

[KPI: Candidats accessibles] [KPI: Opportunités ouvertes] [KPI: Invitations en attente] [KPI: Dossiers générés]

[Actions rapides]
  → Inviter un candidat  (/recruiter/invitations)
  → Générer un dossier   (/recruiter/generate)
  → Voir les candidats   (/recruiter/candidates)

[Dossiers récents — 3 derniers documents générés]
```

### Couleurs des KPIs

| KPI                    | Couleur            |
| ---------------------- | ------------------ |
| Candidats accessibles  | `text-primary`     |
| Opportunités ouvertes  | `text-emerald-500` |
| Invitations en attente | `text-amber-500`   |
| Dossiers générés       | `text-foreground`  |

### État sans organisation

Si `orgId` est null (recruteur sans organisation), afficher un état vide avec un message d'invitation à rejoindre une organisation — pas d'erreur bloquante.

---

## Composants réutilisables

### `StatCard`

```tsx
<StatCard label="Candidats accessibles" value={12} color="primary" />
```

Props : `label: string`, `value: number | string`, `color: "primary" | "amber" | "emerald" | "neutral"`, `subtitle?: string`

### `QuickActionCard`

```tsx
<QuickActionCard
  icon={Mail}
  label="Mes invitations"
  description="2 en attente"
  href="/candidate/requests"
  badge={2}
/>
```

Props : `icon: LucideIcon`, `label: string`, `description: string`, `href: string`, `badge?: number`

Ces deux composants vivent dans `frontend/components/ui/` et sont partagés entre les deux dashboards.

---

## États de chargement & erreurs

- Skeleton animé (3 blocs `animate-pulse`) pendant le chargement initial
- Si une requête échoue, les KPIs concernés affichent `—` sans bloquer l'affichage des autres
- Pas d'erreur fatale sauf si le profil de base est inaccessible

---

## Backend — endpoint `/users/me`

Si `GET /users/me` n'existe pas encore, il doit être créé. Réponse attendue :

```json
{ "id": "...", "email": "...", "role": "candidate" | "recruiter" }
```

Cet endpoint est utilisé uniquement par la page racine pour le redirect. Les dashboards eux-mêmes n'en ont pas besoin (ils sont déjà dans le bon layout/groupe de route).

---

## Hors scope

- Notifications temps réel (websockets)
- Graphiques d'activité sur plusieurs semaines
- Personnalisation du dashboard par l'utilisateur
