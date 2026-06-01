# Achievement Skill Tags — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Objectif

Permettre aux candidats de taguer des skills sur chaque réalisation (achievement) de leurs expériences, afin que les recruteurs puissent cliquer sur un skill et voir concrètement dans quelles réalisations il a été mobilisé.

## Modèle mental

Chaque expérience a un **bouquet de skills** (ce qui a été utilisé dans cette expérience, avec rôle et intensité). Chaque réalisation **revendique** des skills depuis ce bouquet. Un même skill peut être revendiqué par plusieurs réalisations d'une même expérience.

---

## 1. Modèle de données

### Nouvelle table `achievement_skill_tags`

| Colonne          | Type     | Contrainte                                 |
| ---------------- | -------- | ------------------------------------------ |
| `achievement_id` | UUID FK  | → `achievements.id` ON DELETE CASCADE      |
| `skill_ref_id`   | UUID FK  | → `skill_references.id` ON DELETE RESTRICT |
| `created_at`     | datetime | server default now()                       |

Contrainte: `UNIQUE(achievement_id, skill_ref_id)`

**Règle d'intégrité applicative :** le `skill_ref_id` taggé sur un achievement doit exister dans les `ExperienceSkillUsage` de l'expérience parente. Appliqué en Python à la création, pas en DB constraint.

### Migration `ExperienceSkillUsage`

Supprimer la colonne `achievement_id` (nullable → migration safe). Le concept de lien achievement↔skill est maintenant porté par `achievement_skill_tags`.

### Résultat

- `ExperienceSkillUsage` = bouquet de l'expérience (skill + usage_role + intensity)
- `AchievementSkillTag` = lien many-to-many achievement ↔ skill_ref

---

## 2. API backend

### Nouveaux endpoints

```
POST   /candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags
       Body: { skill_ref_id: UUID }
       → 201 AchievementSkillTagRead
       → 409 si déjà tagué
       → 422 si skill_ref_id absent du bouquet de l'expérience
       → 404 si achievement n'appartient pas à l'expérience

DELETE /candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags/{skill_ref_id}
       → 204
       → 404 si le tag n'existe pas
```

### Schemas mis à jour

**`AchievementSkillTagRead`** (nouveau)

```python
class AchievementSkillTagRead(BaseModel):
    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    created_at: datetime
```

**`AchievementRead`** — gagne `skill_tags: list[AchievementSkillTagRead]`

**`ExperienceSkillUsageRead`** — perd le champ `achievement_id`

**`ExperienceRead`** — inchangé (retourne déjà `achievements` et `skill_usages` imbriqués)

### Pas de nouvel endpoint GET

Les skill_tags arrivent imbriqués dans `GET /candidates/me/experiences` via `achievements[].skill_tags`. Pas de requête supplémentaire nécessaire.

---

## 3. Types frontend (`types/api.ts`)

### Nouveaux types

```typescript
export type UsageRole =
  | "lead"
  | "implementer"
  | "contributor"
  | "user"
  | "exposed_to";
export type UsageIntensity = "primary" | "secondary" | "incidental";

export interface AchievementSkillTag {
  skill_ref_id: string;
  skill_ref: SkillReference;
  created_at: string;
}

export interface Achievement {
  id: string;
  experience_id: string;
  description: string;
  impact: string | null;
  order: number;
  skill_tags: AchievementSkillTag[];
  created_at: string;
  updated_at: string;
}

export interface ExperienceSkillUsage {
  id: string;
  experience_id: string;
  skill_ref_id: string;
  skill_ref: SkillReference;
  usage_role: UsageRole;
  intensity: UsageIntensity;
  created_at: string;
}
```

### `Experience` mis à jour

```typescript
export interface Experience {
  id: string;
  profile_id: string;
  client_name: string;
  role: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  context: string | null;
  achievements_summary: string | null; // champ texte libre conservé
  achievements: Achievement[];
  skill_usages: ExperienceSkillUsage[];
  created_at: string;
  updated_at: string;
}
```

**Supprimés :** `achievements: string | null` et `technologies: string[]`

---

## 4. UI candidat — Section Expériences

La section expériences reste dans la page `/candidate/skills`. Refonte de `ExperienceSection`.

### Carte expérience

```
┌─────────────────────────────────────────────────────────┐
│  Accenture — Tech Lead              Jan 2022 → Déc 2024 │  ✏ 🗑
│  Description courte de l'expérience...                   │
│  ─────────────────────────────────────────────────────  │
│  SKILLS  [Python] [CI/CD] [Docker] [Kubernetes] [+ Add] │
│  ─────────────────────────────────────────────────────  │
│  RÉALISATIONS                                            │
│  • Réduit le déploiement de 40%          [Python][CI/CD] │  ✏ 🗑
│    Pipeline CI/CD unifié sur 12 microservices            │
│  • Mis en place l'archi microservices    [Docker]        │  ✏ 🗑
│  • Formé 6 développeurs juniors          [Leadership]    │  ✏ 🗑
│                                                          │
│  [+ Ajouter une réalisation]                             │
└─────────────────────────────────────────────────────────┘
```

### Bouquet de skills

- Affiché en permanence sous l'en-tête de la carte
- Pills gris cliquables + bouton `+ Ajouter` (combobox existant)
- Supprimer un skill du bouquet retire automatiquement ses tags sur les achievements (cascade DB)

### Inline expand (Option A) pour l'édition d'un achievement

Cliquer ✏ sur une ligne de réalisation déroule un formulaire inline sous cette ligne :

```
┌──────────────────────────────────────────────────────┐
│  Réalisation                                          │
│  [textarea : texte de la réalisation]                 │
│                                                       │
│  Impact (optionnel)                                   │
│  [input : description de l'impact mesurable]          │
│                                                       │
│  Skills associés à cette réalisation                  │
│  [Python ✓] [CI/CD ✓] [Docker] [Kubernetes] ...      │
│  (chips à cocher depuis le bouquet de l'expérience)   │
│                                                       │
│  [Supprimer]          [Annuler] [Sauvegarder]         │
└──────────────────────────────────────────────────────┘
```

- Un seul inline form ouvert à la fois (ferme le précédent si on en ouvre un autre)
- Sauvegarder : PATCH achievement (description + impact) puis sync des skill-tags : DELETE tous les tags existants de cet achievement, POST les tags cochés. Opération séquentielle côté frontend, pas de transaction exposée.
- Chips affichées = skill_usages de l'expérience parente

### Ajout d'une nouvelle réalisation

Bouton `+ Ajouter une réalisation` en bas de la liste → ouvre le même inline form vide, pré-focusé sur le textarea.

---

## 5. UI recruteur — Highlight inline avec résumé (Option A+)

Pas de nouvelle page. Enrichissement de la carte candidat dans `/recruiter/candidates`.

### Comportement au clic sur un skill

1. Le skill pill passe en état actif (fond bleu)
2. Un **bandeau résumé** apparaît sous les skills : `Python · 3 réalisations dans 2 expériences`
3. La carte expand et affiche les expériences avec :
   - Les achievements utilisant ce skill **mis en évidence** (fond bleu clair, texte blanc)
   - Les autres achievements **atténués** (opacity réduite)
4. Un **toggle "Réalisations liées uniquement"** (coché par défaut) masque les achievements atténués

### Cliquer à nouveau sur le même skill (ou sur un autre)

- Même skill : désactive le filtre, retour à l'état normal
- Autre skill : filtre bascule sur le nouveau skill

### Données nécessaires côté recruteur

`AccessibleCandidateRead` doit inclure `experiences` avec `achievements[].skill_tags` imbriqués. Le endpoint recruteur (`GET /organizations/{org_id}/candidates`) doit étendre ses `selectinload` pour charger `Achievement.skill_tags` → `AchievementSkillTag.skill_ref`. À vérifier dans `backend/api/routes/recruiters.py`.

---

## 6. Hors scope

- Refonte de la navigation candidat (page expériences dédiée vs. page skills) — sujet distinct
- Vue recruteur en page profil dédiée (`/recruiter/candidates/{id}`) — phase 2
- Tri/filtrage des candidats par profondeur d'usage d'un skill

---

## 7. Ordre d'implémentation suggéré

1. Migration DB (`achievement_skill_tags`, drop `achievement_id` sur `experience_skill_usages`)
2. Modèle SQLAlchemy `AchievementSkillTag` + relation sur `Achievement`
3. Schemas Pydantic (`AchievementSkillTagRead`, mise à jour `AchievementRead`, `ExperienceSkillUsageRead`)
4. Endpoints POST/DELETE skill-tags + tests d'intégration
5. Types frontend (`api.ts`)
6. Refonte `ExperienceSection` côté candidat (bouquet visible + achievements avec tags)
7. UI recruteur — highlight inline + bandeau résumé + toggle
