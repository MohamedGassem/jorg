# Jorg — Preparation Alpha LinkedIn

> **Pour les workers agentiques :** ce document est la **spec de design** validée. Le plan d'implémentation
> task-by-task sera produit séparément via `superpowers:writing-plans`. Ne pas implémenter à partir de
> cette spec seule.

**Date :** 2026-06-03
**Statut :** validé (design) — en attente de relecture utilisateur avant plan d'implémentation
**Origine :** préparation au lancement alpha LinkedIn de Jorg.
**Dépendance :** complète et amende [`2026-06-02-jorg-ux-refonte-design.md`](./2026-06-02-jorg-ux-refonte-design.md).

---

## 1. Objectif

Préparer Jorg pour un lancement alpha sur LinkedIn avec deux ajustements par rapport à la spec UX refonte :

1. **Mon dossier** : remplacer la structure à onglets "Mon profil" (avec onglet Informations) par une page hero + tabs sticky, centrée sur l'artefact "dossier candidat".
2. **Contrôle d'accès recruteur** : verrouiller le signup recruteur derrière un code d'invitation alpha pendant la phase de test.

---

## 2. Contexte et contraintes

- La spec UX refonte (`2026-06-02`) reste la référence pour tout le reste (navigation, Accès, onboarding recruteur, vocabulaire).
- Ce document **amende** la section §4.2 (candidat) et §6.1 (Mon profil) de cette spec.
- L'objectif alpha est de valider l'expérience **candidat** en priorité. Le côté recruteur est secondaire et contrôlé.
- Risques alpha identifiés : données RGPD de candidats dans un contexte non-maîtrisé ; cabinets de conseil qui fausseraient le signal produit.

---

## 3. Mon dossier — hero + tabs sticky

### 3.1 Navigation candidat (amendement §4.2)

Inchangé dans sa structure à 4 entrées, mais renommage :

```
Tableau de bord   /candidate/dashboard
Mon dossier       /candidate/profile      ← était "Mon profil"
Accès             /candidate/access
Paramètres        /candidate/settings
```

### 3.2 Structure de la page `/candidate/profile`

**Hero (haut de page, lecture) :**

```
┌─────────────────────────────────────────────┐
│  [Photo]  Prénom Nom                        │
│           Titre / poste actuel              │
│           ████████░░  80% complété          │
│                         [Aperçu recruteur]  │
│                              [✏ Modifier]   │
└─────────────────────────────────────────────┘
```

| Champ                | Source                  | Éditable                                                                |
| -------------------- | ----------------------- | ----------------------------------------------------------------------- |
| Photo                | `candidates/me/profile` | Oui — clic sur la photo → upload                                        |
| Prénom + Nom         | Saisis à l'inscription  | Non dans le hero — éditable dans Paramètres > Informations personnelles |
| Titre / poste actuel | `candidates/me/profile` | Via drawer `[✏ Modifier]`                                               |
| Taux de complétion   | Calculé côté client     | Non — affiché en lecture                                                |
| CTA Aperçu recruteur | —                       | Ouvre modale/drawer existant                                            |

**Drawer `[✏ Modifier]` :** titre, localisation, disponibilité, résumé/bio. Champs légers uniquement — pas nom/prénom (déjà à l'inscription).

**Calcul du taux de complétion :** pourcentage de sections non vides parmi {photo, titre, expériences ≥ 1, compétences ≥ 1, formation ≥ 1, langues ≥ 1}. Calculé côté client depuis les données déjà chargées.

**Barre d'onglets sticky (sous le hero) :**

```
Expériences | Compétences | Formation | Langues
```

- Devient sticky au scroll (position top: 0 ou juste sous le header shell)
- Montage paresseux par onglet actif (page potentiellement lourde)
- Composants réutilisés sans réécriture depuis `candidate/skills/page.tsx` :
  `ExperienceSection`, `SkillSection`, `EducationSection`, `CertificationSection`, `LanguageSection`

**Redirections :**

- `/candidate/skills` → `/candidate/profile?tab=competences` (deep-link via `?tab=`, déjà prévu dans spec UX)

### 3.3 Paramètres `/candidate/settings` (amendement §6.4)

La page paramètres passe à **3 onglets in-page** :

| Onglet                    | Contenu                                           |
| ------------------------- | ------------------------------------------------- |
| Informations personnelles | Prénom, Nom, Email (champs d'identité du compte)  |
| Compte                    | Changement de mot de passe, suppression du compte |
| RGPD                      | Export des données                                |

La page actuelle de settings contenait déjà Compte + RGPD. L'ajout est l'onglet "Informations personnelles" qui accueille les champs nom/prénom/email sortis du hero.

---

## 4. Contrôle d'accès recruteur alpha

### 4.1 Principe

- Signup **candidat** : entièrement libre, pas de changement.
- Signup **recruteur** : nécessite un code d'invitation alpha valide. Un recruteur sans code ne peut pas créer de compte.
- Le lien vers le signup recruteur **n'est pas promu** sur la landing page pendant l'alpha. Il est distribué manuellement.

### 4.2 Backend

**Nouveau modèle `AlphaInviteCode` :**

```python
# backend/models/alpha.py
class AlphaInviteCode(Base):
    __tablename__ = "alpha_invite_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    used_by: Mapped[int | None] = mapped_column(ForeignKey("recruiter_profiles.id"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

Format des codes : `JORG-XXXX-YYYY` (8 caractères aléatoires, insensible à la casse).

**Logique de validation dans `POST /auth/recruiter/register` :**

1. Vérifier `ALPHA_INVITE_REQUIRED` (env var, défaut `true` en prod).
2. Si activé : récupérer le code, vérifier qu'il existe et que `used_by` est null.
3. Si invalide : retourner `400 { "detail": "Code d'invitation invalide ou déjà utilisé." }`.
4. Si valide : créer le compte, marquer `used_by` + `used_at` dans la même transaction.

**Endpoint de génération de codes (admin) :**

```
POST /admin/alpha-codes
Header: X-Admin-Secret: <ADMIN_SECRET env var>
Body: { "count": 10 }
Response: { "codes": ["JORG-A1B2-C3D4", ...] }
```

Protégé par header statique, pas d'interface. Usage via curl uniquement.

**Migration Alembic :** nouvelle table `alpha_invite_codes`, pas de changement sur les tables existantes.

### 4.3 Frontend

Champ `Code d'accès alpha` ajouté au formulaire d'inscription recruteur existant :

- Requis si `ALPHA_INVITE_REQUIRED` est activé (la réponse 400 du backend déclenche l'erreur inline)
- Message d'erreur : "Code invalide ou déjà utilisé."
- Placeholder : `JORG-XXXX-YYYY`

### 4.4 Retrait pour l'ouverture générale

Passer `ALPHA_INVITE_REQUIRED=false` dans l'env. Aucune migration nécessaire, la table `alpha_invite_codes` reste inerte. Le champ frontend peut être masqué conditionnellement ou retiré.

---

## 5. Deltas techniques consolidés

| #   | Delta                                                              | Fichier(s)                                                                               | Type             |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------- |
| A1  | Modèle `AlphaInviteCode` + migration                               | `backend/models/alpha.py` + Alembic                                                      | nouveau          |
| A2  | Validation code à l'inscription recruteur                          | `backend/api/routes/auth.py` (route) + `backend/services/recruiter_service.py` (logique) | modif            |
| A3  | Endpoint admin génération de codes                                 | `backend/api/routes/admin.py`                                                            | nouveau          |
| F1  | Renommage nav "Mon profil" → "Mon dossier"                         | `frontend/app/(candidate)/layout.tsx`                                                    | modif            |
| F2  | Hero + drawer `[✏ Modifier]` sur `/candidate/profile`              | `frontend/app/(candidate)/candidate/profile/page.tsx`                                    | modif            |
| F3  | Barre d'onglets sticky (Expériences/Compétences/Formation/Langues) | `frontend/app/(candidate)/candidate/profile/page.tsx`                                    | modif            |
| F4  | Taux de complétion calculé côté client                             | Composant dans `profile/page.tsx`                                                        | nouveau (inline) |
| F5  | Paramètres 3 onglets (Infos perso / Compte / RGPD)                 | `frontend/app/(candidate)/candidate/settings/page.tsx`                                   | modif            |
| F6  | Champ code alpha sur signup recruteur                              | `frontend/app/(recruiter)/auth/signup/page.tsx` (ou équivalent)                          | modif            |

---

## 6. Hors-périmètre

- Système de notifications ou d'état lu/non-lu pour les codes utilisés.
- Interface admin graphique pour gérer les codes.
- Expiration temporelle des codes (codes à usage unique suffisent pour l'alpha).
- Rôles/permissions dans les organisations (hors-périmètre de la spec UX refonte, maintenu ici).
- Landing page LinkedIn (contenu marketing, hors scope technique).

---

## 7. Critères d'acceptation

1. La nav candidat affiche "Mon dossier" (pas "Mon profil").
2. `/candidate/profile` : hero visible avec photo, nom, titre, barre de complétion et CTA aperçu recruteur ; drawer `[✏ Modifier]` fonctionnel.
3. Onglets sticky Expériences | Compétences | Formation | Langues fonctionnels avec lazy loading par onglet.
4. `/candidate/settings` : 3 onglets (Informations personnelles | Compte | RGPD) fonctionnels.
5. Un recruteur sans code alpha valide ne peut pas créer de compte (retour 400 explicite).
6. Un code alpha ne peut être utilisé qu'une seule fois.
7. `POST /admin/alpha-codes` génère des codes en lot et les retourne (header secret requis).
8. `ALPHA_INVITE_REQUIRED=false` désactive la validation sans migration.
