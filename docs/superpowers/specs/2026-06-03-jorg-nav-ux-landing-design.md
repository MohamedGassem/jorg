# Jorg -- Nav, UX fixes & Landing page

> **Pour les workers agentiques :** ce document est la **spec de design** validee. Le plan d'implementation
> task-by-task sera produit separement via `superpowers:writing-plans`. Ne pas implementer a partir de
> cette spec seule.

**Date :** 2026-06-03
**Statut :** valide (design) -- en attente de relecture utilisateur avant plan d'implementation
**Origine :** audit UX de la codebase Jorg -- navigation, interfaces, landing page publique.

---

## 1. Contexte

Audit de la codebase revelant trois categories de problemes :

1. **Pages orphelines** -- des fichiers de pages existent dans le filesystem mais sont inaccessibles via la navigation (reliquats d'un ancien layout).
2. **UX fixes mineurs** -- icone incorrecte dans le nav recruteur, quick actions du dashboard toutes redondantes.
3. **Absence de landing page** -- la racine `/` redirige directement vers `/login`. Aucune page publique n'existe pour les visiteurs non authentifies.

---

## 2. Chantier 1 -- Suppression des pages orphelines

### Probleme

8 fichiers existent dans le filesystem mais ne sont references nulle part dans la navigation ni dans aucun autre composant actif. Ce sont des reliquats de l'ancien layout.

### Contrainte critique avant suppression

`frontend/app/(candidate)/candidate/skills/page.tsx` exporte des composants reutilises par `frontend/app/(candidate)/candidate/profile/page.tsx` :

```ts
import {
  ExperienceSection,
  SkillSection,
  EducationSection,
  CertificationSection,
  LanguageSection,
} from "@/app/(candidate)/candidate/skills/page";
```

Ces composants doivent etre **deplaces vers un fichier dedie** avant la suppression de la page source.

**Destination cible :** `frontend/components/candidate/profile-sections.tsx`

### Fichiers a supprimer

Apres extraction des composants partages :

**Espace candidat :**

- `frontend/app/(candidate)/candidate/history/page.tsx`
- `frontend/app/(candidate)/candidate/requests/page.tsx`
- `frontend/app/(candidate)/candidate/skills/page.tsx` (apres extraction)

**Espace recruteur :**

- `frontend/app/(recruiter)/recruiter/generate/page.tsx`
- `frontend/app/(recruiter)/recruiter/history/page.tsx`
- `frontend/app/(recruiter)/recruiter/invitations/page.tsx`
- `frontend/app/(recruiter)/recruiter/templates/page.tsx`
- `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx`

### Mise a jour de l'import dans profile/page.tsx

Apres deplacement :

```ts
// Avant
import { ExperienceSection, ... } from "@/app/(candidate)/candidate/skills/page";

// Apres
import { ExperienceSection, ... } from "@/components/candidate/profile-sections";
```

---

## 3. Chantier 2a -- Icone "Dossiers" dans le nav recruteur

**Fichier :** `frontend/components/nav-sidebar.tsx`

**Probleme :** la cle `/recruiter/documents` utilise l'icone `Clock` (connotation temporelle) alors qu'il s'agit de documents.

```ts
// Avant
"/recruiter/documents": Clock,

// Apres
"/recruiter/documents": FileText,
```

Ajouter `FileText` aux imports lucide-react. Retirer `Clock` si plus utilise ailleurs dans le fichier.

---

## 4. Chantier 2b -- Quick actions du dashboard recruteur

**Fichier :** `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`

**Probleme :** les 3 `QuickActionCard` pointent toutes vers `/recruiter/candidates`, rendant deux d'entre elles redondantes et la section inutile.

**Fix -- Option B (actions metier explicites) :**

| #   | Icone   | Label                 | Description                                                     | Destination                |
| --- | ------- | --------------------- | --------------------------------------------------------------- | -------------------------- |
| 1   | `Mail`  | Inviter un candidat   | Envoyer une invitation email                                    | `/recruiter/candidates`    |
| 2   | `Zap`   | Creer une opportunite | Ouvrir un nouveau poste                                         | `/recruiter/opportunities` |
| 3   | `Users` | Voir les candidats    | `N profil(s) accessible(s)` (dynamique depuis `candidateCount`) | `/recruiter/candidates`    |

La carte 2 remplace "Generer un dossier" qui pointait incorrectement vers `/recruiter/candidates`. La generation de dossier reste une action contextuelle au candidat (dialog depuis la liste candidats) -- elle n'a pas de page standalone.

---

## 5. Chantier 3 -- Landing page publique

### 5.1 Positionnement valide

**Hero de l'histoire :** le candidat (douleur visible, argument de credibilite)
**Client :** le recruteur (monetisation, conversion principale)
**Modele :** plateforme bi-face -- le beneficiaire visible n'est pas celui qui paie

**Headline :** _"Build your profile once. Share it securely. Generate tailored dossiers in seconds."_

**Sous-titre :** _"Candidates constantly rewrite the same information across CVs and skill dossiers. Jorg fixes that -- for everyone in the loop."_

### 5.2 Architecture de la route

`frontend/app/page.tsx` est actuellement un composant serveur qui detecte le token et redirige. Il devient une page hybride :

- **Utilisateur non authentifie** (pas de token ou token invalide) : rend le composant `LandingPage` au lieu de rediriger vers `/login`.
- **Utilisateur authentifie** : comportement inchange -- redirect vers `/candidate/dashboard` ou `/recruiter/dashboard` selon le role.

La detection reste cote serveur (cookies), aucun flash de contenu.

### 5.3 Structure de la page (6 sections)

```
[LandingNav]      Logo Jorg | CTA "Request recruiter access" | "Se connecter" (ghost)
[LandingHero]     H1 headline + sous-titre + 2 CTAs
[LandingBridge]   2 colonnes : douleur candidat (gauche) / solution recruteur (droite)
[LandingFeatures] 3 feature cards
[LandingAlpha]    Bandeau discret alpha
[LandingFooter]   /login | /register
```

### 5.4 Detail des sections

**LandingNav :**

- Logo "J" + wordmark "Jorg" (identique au nav authentifie)
- CTA primaire : "Request recruiter access" → `/register?role=recruiter`
- Lien ghost : "Se connecter" → `/login`

**LandingHero :**

- H1 : _"Build your profile once. Share it securely. Generate tailored dossiers in seconds."_
- Sous-titre : _"Candidates constantly rewrite the same information across CVs and skill dossiers. Jorg fixes that -- for everyone in the loop."_
- CTA primaire : **"Request recruiter access"** → `/register?role=recruiter` (style `Button` primary)
- CTA secondaire : **"Create your candidate profile"** → `/register?role=candidate` (style `Button` outline)

**LandingBridge (2 colonnes) :**

- Gauche -- Pour les candidats : "Maintenez un seul profil structure. Controllez precisement qui peut y acceder et pendant combien de temps."
- Droite -- Pour les recruteurs : "Generez des dossiers candidats sur mesure en quelques secondes. Fini le copier-coller entre outils."

**LandingFeatures (3 cartes) :**

1. Profil structure -- "Experiences, competences, formations. Tout au meme endroit, maintenu par le candidat lui-meme."
2. Acces controle -- "Le candidat decide qui peut consulter son profil. Les acces sont revocables a tout moment."
3. Generation IA -- "Transformez un profil en dossier client-ready en 30 secondes, adapte au poste et au format voulu."

**LandingAlpha :**

- Bandeau discret : "Produit en acces prive alpha -- les recruteurs rejoignent sur invitation."
- Style sobre, pas intrusif.

**LandingFooter :**

- Liens minimalistes : Se connecter | Creer un compte
- Copyright Jorg

### 5.5 Modification de la page register

**Fichier :** `frontend/app/(public)/register/page.tsx`

Lire `searchParams.get('role')` (ou `useSearchParams` cote client) au montage du composant. Si la valeur est `"candidate"` ou `"recruiter"`, initialiser le state `role` avec cette valeur. Sinon, conserver le defaut actuel (`"candidate"`).

Cela permet aux CTAs de la landing de pre-selectionner le bon role dans le formulaire.

### 5.6 Composants a creer

Tous sous `frontend/components/landing/` :

| Composant             | Role                                       |
| --------------------- | ------------------------------------------ |
| `LandingNav.tsx`      | Navbar publique avec les deux CTAs         |
| `LandingHero.tsx`     | Section hero -- headline, sous-titre, CTAs |
| `LandingBridge.tsx`   | 2 colonnes candidat / recruteur            |
| `LandingFeatures.tsx` | 3 feature cards                            |
| `LandingAlpha.tsx`    | Bandeau alpha discret                      |
| `LandingFooter.tsx`   | Footer minimal                             |

---

## 6. Deltas techniques

| #   | Delta                                                                                                         | Fichier(s)                                                     | Type        |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
| C1  | Extraction `ExperienceSection`, `SkillSection`, `EducationSection`, `CertificationSection`, `LanguageSection` | `frontend/components/candidate/profile-sections.tsx` (nouveau) | nouveau     |
| C2  | Mise a jour import dans profile/page.tsx                                                                      | `frontend/app/(candidate)/candidate/profile/page.tsx`          | modif       |
| C3  | Suppression des 8 pages orphelines                                                                            | voir §2                                                        | suppression |
| C4  | Fix icone Clock → FileText pour `/recruiter/documents`                                                        | `frontend/components/nav-sidebar.tsx`                          | modif       |
| C5  | Quick actions dashboard recruteur -- Option B                                                                 | `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`        | modif       |
| C6  | Composants landing (6 fichiers)                                                                               | `frontend/components/landing/*.tsx`                            | nouveau     |
| C7  | Page racine hybride (landing si non authentifie)                                                              | `frontend/app/page.tsx`                                        | modif       |
| C8  | Pre-selection role via query param `?role=`                                                                   | `frontend/app/(public)/register/page.tsx`                      | modif       |

---

## 7. Ordre d'implementation recommande

1. **C1 → C2 → C3** : extraction des composants partages, mise a jour import, puis suppression des pages. A faire en sequence pour ne pas casser le build.
2. **C4** : fix icone (1 ligne, independant).
3. **C5** : fix quick actions dashboard (independant).
4. **C6 → C7 → C8** : landing page -- creer les composants, puis modifier `page.tsx`, puis register.

Les groupes 2, 3 et 4 sont independants entre eux et peuvent etre parallelises.

---

## 8. Criteres d'acceptation

1. Aucune des 8 pages supprimees n'est referencee dans le code restant.
2. `frontend/app/(candidate)/candidate/profile/page.tsx` compile et s'affiche correctement apres la migration des imports.
3. L'icone "Dossiers" dans le nav recruteur est `FileText`.
4. Les 3 quick actions du dashboard recruteur pointent vers des destinations distinctes et non redondantes.
5. Un visiteur non authentifie arrivant sur `/` voit la landing page (pas le formulaire de login).
6. Un utilisateur authentifie arrivant sur `/` est toujours redirige vers son dashboard.
7. Le CTA "Request recruiter access" ouvre `/register` avec le role `recruiter` pre-selectionne.
8. Le CTA "Create your candidate profile" ouvre `/register` avec le role `candidate` pre-selectionne.
9. La landing s'affiche correctement sur mobile (responsive).
