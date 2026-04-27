# P1.2 — Champs de mapping manquants (experience.context / experience.achievements)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer les deux champs `experience.context` et `experience.achievements` dans l'UI de mapping des templates afin que les recruteurs puissent les utiliser dans leurs dossiers Word.

**Architecture:** Seul changement requis côté frontend — les deux champs existent déjà dans la DB, le schéma Pydantic `ExperienceRead`, et la fonction `_exp_flat` de [backend/services/generation_service.py:49-60](backend/services/generation_service.py#L49-L60). Il s'agit uniquement d'ajouter deux entrées à la constante `PROFILE_FIELDS` dans la page de mapping côté recruteur. Pas de migration, pas d'endpoint nouveau.

**Tech Stack:** Next.js 15 (App Router), TypeScript, shadcn/ui `Select`.

**Prerequisite:** Plan 5 (document generation) et Plan 6 (frontend) mergés — ce qui est le cas sur `master`.

---

## File Structure

| File                                                         | Action | Purpose                                                   |
| ------------------------------------------------------------ | ------ | --------------------------------------------------------- |
| `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx` | Modify | Ajouter les deux entrées manquantes dans `PROFILE_FIELDS` |

---

## Task 1: Ajouter les deux champs à PROFILE_FIELDS

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx:19-35`

- [ ] **Step 1: Repérer la constante actuelle**

Ouvrir [frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx](<frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx>) et lire les lignes 19-35. Le bloc actuel est :

```tsx
const PROFILE_FIELDS = [
  { value: "first_name", label: "Prénom" },
  { value: "last_name", label: "Nom" },
  { value: "title", label: "Titre" },
  { value: "summary", label: "Résumé" },
  { value: "phone", label: "Téléphone" },
  { value: "email_contact", label: "Email contact" },
  { value: "location", label: "Localisation" },
  { value: "years_of_experience", label: "Années d'expérience" },
  { value: "daily_rate", label: "TJM" },
  { value: "experience.client_name", label: "Expérience — Client" },
  { value: "experience.role", label: "Expérience — Rôle" },
  { value: "experience.start_date", label: "Expérience — Début" },
  { value: "experience.end_date", label: "Expérience — Fin" },
  { value: "experience.description", label: "Expérience — Description" },
  { value: "experience.technologies", label: "Expérience — Technologies" },
];
```

- [ ] **Step 2: Ajouter les deux lignes manquantes**

Remplacer le bloc par :

```tsx
const PROFILE_FIELDS = [
  { value: "first_name", label: "Prénom" },
  { value: "last_name", label: "Nom" },
  { value: "title", label: "Titre" },
  { value: "summary", label: "Résumé" },
  { value: "phone", label: "Téléphone" },
  { value: "email_contact", label: "Email contact" },
  { value: "location", label: "Localisation" },
  { value: "years_of_experience", label: "Années d'expérience" },
  { value: "daily_rate", label: "TJM" },
  { value: "experience.client_name", label: "Expérience — Client" },
  { value: "experience.role", label: "Expérience — Rôle" },
  { value: "experience.start_date", label: "Expérience — Début" },
  { value: "experience.end_date", label: "Expérience — Fin" },
  { value: "experience.description", label: "Expérience — Description" },
  { value: "experience.context", label: "Expérience — Contexte" },
  { value: "experience.achievements", label: "Expérience — Réalisations" },
  { value: "experience.technologies", label: "Expérience — Technologies" },
];
```

**Why `context` et `achievements` et pas autre chose :** ces deux champs sont déjà :

- déclarés sur le modèle [Experience](backend/models/candidate_profile.py#L71-L72) (DB),
- exposés par [ExperienceRead](backend/schemas/candidate.py#L90-L93),
- remplacés par le moteur de génération dans [\_exp_flat](backend/services/generation_service.py#L49-L60),
- saisis par le candidat dans le formulaire d'expérience ([frontend/app/(candidate)/candidate/skills/page.tsx:249-256](<frontend/app/(candidate)/candidate/skills/page.tsx#L249-L256>)).

Ils étaient donc opérationnels côté backend mais invisibles dans le dropdown de mapping.

- [ ] **Step 3: Vérifier que le type-check passe**

Depuis `frontend/` :

```bash
npx tsc --noEmit
```

Expected: pas d'erreur.

- [ ] **Step 4: Vérification manuelle en navigateur**

Depuis `frontend/` dans un shell séparé :

```bash
npm run dev
```

1. Se connecter comme recruteur lié à une organisation ayant au moins un template uploadé.
2. Ouvrir `/recruiter/templates/<template_id>`.
3. Pour chaque placeholder détecté, ouvrir le `Select` et vérifier que les deux nouvelles entrées apparaissent :
   - **Expérience — Contexte**
   - **Expérience — Réalisations**
4. Mapper un placeholder sur **Expérience — Contexte**, sauvegarder, recharger la page : la valeur doit persister.
5. Aller sur `/recruiter/generate`, générer un dossier pour un candidat qui a rempli `context` sur au moins une expérience et vérifier que le contenu apparaît dans le `.docx` téléchargé.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/templates/\[id\]/page.tsx
git commit -m "feat(frontend): expose experience.context and experience.achievements in template mapping UI"
```

---

## Notes de review (à destination de Codex)

- Pas de nouveau test unitaire nécessaire : les champs sont déjà couverts par les tests de génération existants dans [backend/tests/integration/test_generation_api.py](backend/tests/integration/test_generation_api.py). Un test Playwright e2e spécifique à cette sélection est inutile — un snapshot de la constante est sur-ingéniérie pour 2 lignes de données.
- Pas de migration — les colonnes existent depuis la migration [cbc80ec8dcc0](backend/alembic/versions/cbc80ec8dcc0_create_candidate_profile_tables.py#L122-L123).
- Ordre dans le dropdown : `context` et `achievements` insérés **après** `description` et **avant** `technologies` pour matcher l'ordre de saisie dans le formulaire candidat.
