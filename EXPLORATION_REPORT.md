# EXPLORATION_REPORT - Audit UX Jorg (branche exploration/goal-audit-ux)

Date : 2026-06-12. Base : dev @ 093b6b9.
Convention : chaque trouvaille est marquee **[CONSTAT]** (verifie dans le code, reference donnee)
ou **[HYPOTHESE]** (deduit, non verifie en execution). Mapping backlog entre parentheses (MOH-XX ou NOUVEAU).

---

## 1. Carte de l'application

### Backend (FastAPI, backend/)

| Module                                     | Role                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `api/routes/auth.py`                       | register (role + code alpha recruteur), login, refresh, verify-email, reset password                                                 |
| `api/routes/candidates.py`                 | profil candidat, CRUD experiences/education/certifications/langues, parse CV, export RGPD, timeline orgas                            |
| `api/routes/skills.py`                     | referentiel skills (ESCO + customs), CandidateSkill, ExperienceSkillUsage, achievements + tags                                       |
| `api/routes/invitations.py`                | invitations recruteur->candidat, accept/reject par token, grants candidat (`/access/me`)                                             |
| `api/routes/organizations.py`              | CRUD orga, join par code, membres, candidats accessibles (filtres), templates org (upload/download)                                  |
| `api/routes/opportunities.py`              | missions : CRUD, shortlist, generation groupee                                                                                       |
| `api/routes/generation.py`                 | generation dossier (recruteur + self candidat), listing, download                                                                    |
| `api/routes/templates.py`                  | template d'exemple + 3 modeles builtin (listing, preview mock)                                                                       |
| `services/documents/docx_engine.py`        | moteur Jinja2/docxtpl pur ; contexte : profil plat, experiences, skills groupes, education, certifications, langues, faits marquants |
| `services/documents/generation_service.py` | orchestration : grant -> chargement -> rendu -> stockage -> trace ; conversion PDF Gotenberg avec fallback docx                      |
| `services/cv/*`                            | parsing CV heuristique (PDF/DOCX) -> proposition validee par le candidat ; `llm_extraction.py` est un stub (19 lignes)               |
| `core/email.py`                            | backends email console/SMTP, utilises par verif email + reset password uniquement                                                    |

Modeles cles : `User` (role), `CandidateProfile` (+ Experience/Education/Certification/Language),
`SkillReference`/`CandidateSkill`/`ExperienceSkillUsage`/`Achievement(+SkillTag)`,
`Organization`/`RecruiterProfile` (pas de notion d'admin d'org), `Invitation`/`AccessGrant`,
`Opportunity`/`ShortlistEntry`, `Template`, `GeneratedDocument`.

### Frontend (Next.js app router, frontend/app/)

```
(public)        login, register (choix role + code alpha), forgot/reset-password, verify-email, mentions, privacy
onboarding/     candidate: profile (CV import) -> skills (1re experience)
                recruiter: organization (creer/rejoindre) -> template (renvoi vers modeles)
(candidate)     dashboard, profile (hero + onglets Exp/Skills/Formation/Langues + import CV),
                access (invitations, registre, dossiers, journal), settings
(recruiter)     dashboard, candidates (filtres + table + panneau exp), candidates/[id] (fiche),
                opportunities (+[id] : shortlist, bulk generate, edition verrouillee alpha), documents, settings
```

### Flow candidat (reconstitue)

1. Invitation creee par le recruteur -> **aucun email n'est envoye** (voir friction n.2).
2. Inscription `/register?role=candidate` -> onboarding 2/3 (titre, localisation, contrat, import CV)
   -> 3/3 (1re experience, skippable) -> dashboard.
3. L'invitation apparait dans `/candidate/access` et le dashboard **si l'email du compte == email invite**
   (matching `invitation_service.list_candidate_invitations`).
4. Accept -> AccessGrant actif ; le candidat suit le journal (consultations non tracees en evenement,
   seulement invitations/grants/generations - le wording UI "chaque consultation est tracee" sur-promet, voir n.13).
5. Construction du profil dans `/candidate/profile` (4 onglets), generation self-service de son dossier
   (3 modeles builtin), revocation depuis `/candidate/access` (**cassee**, voir n.1).

### Flow recruteur (reconstitue)

1. Inscription avec code alpha (place dans une org de demo) ou creation/jonction d'org en onboarding.
2. Dashboard : stats, candidats accessibles, journal d'equipe.
3. `/recruiter/candidates` : filtres (dispo, mode, contrat, domaine, skill, lieu, TJM, texte),
   invitation par email (dialog), expansion des experiences, ajout a une mission, generation dossier (dialog).
4. `/recruiter/candidates/[id]` : fiche limitee (identite + skills d'experience + experiences).
5. `/recruiter/opportunities` : creation mission (titre, contexte, skills requis), detail avec shortlist,
   match score (% de skills requis presents), generation groupee (**inutilisable en alpha**, voir n.4).
6. `/recruiter/documents` : dossiers generes + modeles (upload de templates org ferme pendant l'alpha).

---

## 2. Frictions UX priorisees par impact

### P0 - Bloquant

1. **La revocation d'acces candidat est cassee** (NOUVEAU - bug).
   [CONSTAT] `frontend/app/(candidate)/candidate/access/page.tsx:105` appelle
   `POST /access-grants/revoke` ; cette route n'existe nulle part au backend
   (la seule route est `DELETE /access/me/{grant_id}`, `backend/api/routes/invitations.py:100`).
   Tout clic "Revoquer" -> 404. C'est la promesse centrale du produit ("revocable a tout moment").
   -> Corrige en Phase 2.

2. **Aucun email envoye au candidat invite** (NOUVEAU - friction majeure).
   [CONSTAT] `backend/services/invitation_service.py:27-55` cree l'invitation et logge
   `invitation.sent`, sans appel a `core/email.py` (pourtant utilise pour verif email et reset password).
   Un candidat sans compte n'apprend jamais qu'il est invite ; le recruteur attend indefiniment.
   -> Corrige en Phase 2 (email avec nom de l'org + lien d'inscription/connexion).

3. **Le code d'equipe est inaccessible : impossible d'inviter un collegue recruteur** (NOUVEAU).
   [CONSTAT] L'onglet "Organisation" des parametres recruteur est `disabled: true`
   avec le hint "Reserve aux administrateurs de l'organisation"
   (`frontend/app/(recruiter)/recruiter/settings/page.tsx:226-231`), alors que le contenu
   (join code + membres) est implemente juste en dessous (lignes 288-367) et que le backend
   n'a aucun concept d'administrateur (`RecruiterProfile` n'a pas de role ;
   `regenerate-join-code` n'exige que `RecruiterOrgMember`). Le mode "Rejoindre" de
   l'onboarding demande donc un code que personne ne peut afficher.
   [HYPOTHESE] Verrou alpha volontaire en attendant des roles d'org.
   -> Non implemente (decision produit : activer l'onglet vs. introduire des roles). Voir Points de decision.

### P1 - Fort impact

4. **Generation groupee de mission inutilisable en alpha** (NOUVEAU, lie a MOH-5/MOH-9 par theme).
   [CONSTAT] `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx:479` ne montre la
   section "Generer tous les dossiers" que si `templates.length > 0` avec uniquement les templates
   org (`tmplData.filter(t => t.is_valid)`, ligne 92). Or l'upload de templates org est ferme
   pendant l'alpha (`documents/page.tsx:369-382` "Post-alpha"). Les 3 modeles Jorg builtin ne sont
   pas proposes alors que le backend les supporte deja en generation unitaire
   (`generation_service.generate_for_candidate`, param `system_template_key`).
   `BulkGenerateRequest` n'accepte que `template_id` (`opportunity_service.bulk_generate:244`).
   -> Corrige en Phase 2 (ajout de `system_template_key` optionnel + choix des modeles Jorg dans l'UI).

5. **Fiche candidat recruteur tres incomplete** (NOUVEAU - ecart backend/frontend).
   [CONSTAT] `AccessibleCandidateRead` (`backend/services/recruiter_service.py:320-336`,
   `frontend/types/api.ts:303-316`) n'expose ni `summary`, ni `location`, ni
   `years_of_experience`, ni formations, ni certifications, ni langues, ni les CandidateSkill
   declaratifs. La fiche `/recruiter/candidates/[id]` n'affiche que identite + skills
   d'experience + experiences. Le candidat remplit des sections entieres (Formation, Langues)
   qui ne sont visibles que dans le docx genere - jamais a l'ecran recruteur.
   Un recruteur ESN attend de voir tout le dossier avant de generer (reference BoondManager).
   -> GROS CHANTIER A (changement de contrat API consomme par 3 ecrans) - spec ci-dessous.

6. **La fiche candidat charge la liste entiere** (NOUVEAU).
   [CONSTAT] `candidates/[id]/page.tsx:126-133` fait `GET /organizations/{org}/candidates`
   puis `list.find(...)` ; pas de route detail unitaire. Couplee au chantier A.

7. **Pas de notifications cote recruteur** (NOUVEAU).
   [CONSTAT] `frontend/components/notification-bell.tsx:85` : `// recruiter: no-op for now`.
   Le recruteur n'est pas notifie quand un candidat accepte/refuse une invitation -
   il doit deplier "Invitations envoyees" sur la page Candidats. -> Issue.

8. **Pas de relance ni d'annulation d'une invitation en attente** (NOUVEAU).
   [CONSTAT] Aucune route DELETE/renvoi pour `Invitation` ; l'UI liste seulement
   (`candidates/page.tsx:536-586`). Une faute de frappe dans l'email = invitation
   zombie pendant 30 jours, et `create_invitation` ne deduplique pas
   (`invitation_service.py:27` : pas de verif d'invitation pendante ni de grant actif
   pour le meme email/org -> doublons possibles). -> Issue.

### P2 - Impact moyen

9. **Filtre contrat excluant les profils "both"** (NOUVEAU - semantique).
   [CONSTAT] `recruiter_service.filter_contract_type` (ligne 207-209) filtre par egalite
   stricte : chercher "freelance" exclut les candidats "Freelance ou CDI" (`both`),
   ce qui est contre-intuitif (le label affiche est "Freelance ou CDI").
   -> Corrige en Phase 2 (un filtre freelance/cdi matche aussi `both`).

10. **Dates brutes ISO dans les vues recruteur** (NOUVEAU - cosmetique).
    [CONSTAT] `candidates/page.tsx:149-155` et `candidates/[id]/page.tsx:69-74` affichent
    `2023-01-15 -> present` au lieu d'un format francais (helpers `frDate` existants
    dans `lib/labels.ts`). -> Corrige en Phase 2 (format mm/yyyy, aligne sur le docx).

11. **Deux scores de completude incoherents** (NOUVEAU).
    [CONSTAT] Le dashboard candidat calcule 5 criteres (identite+titre, resume, experience,
    skill, phone+location+work_mode - `dashboard/page.tsx:208-218`) ; le hero du profil en
    calcule 6 autres (avatar, titre, resume, localisation, linkedin, dispo -
    `profile/page.tsx:73-87`). Le meme utilisateur voit deux pourcentages differents. -> Issue.

12. **Apercu "ce qu'un recruteur verra" partiel** (NOUVEAU).
    [CONSTAT] Le dialog d'apercu (`profile/page.tsx:246-316`) montre profil + skills cles +
    experiences, sans formation/certifs/langues. Coherent avec la vue recruteur actuelle
    (friction n.5) mais pas avec le dossier docx genere qui les inclut. A traiter avec le chantier A.

13. **Sur-promesse de tracabilite** (NOUVEAU - wording).
    [CONSTAT] L'UI affirme "Chaque consultation est tracee cote candidat"
    (`recruiter/dashboard/page.tsx:412`, `candidates/[id]/page.tsx:204-208`) mais aucun
    evenement de consultation n'est enregistre : les `InteractionEvent` ne couvrent que
    invitations, grants et generations (`candidate_service.list_organization_interactions`).
    -> Issue (soit tracer les consultations, soit corriger le wording - decision produit).

14. **Invitation liee a l'email exact** (NOUVEAU).
    [CONSTAT] Matching par `candidate_email == user.email` (`invitation_service.py:73`,
    `candidate_service.py:89-93`) : un candidat qui s'inscrit avec un autre email ne voit
    jamais l'invitation. L'email d'invitation (friction n.2) devrait porter le lien/token
    pour raccrocher les wagons. [HYPOTHESE] flux token-dans-le-lien a specifier avec n.2.

15. **Accept d'invitation par token sans verification d'email** (NOUVEAU - durcissement).
    [CONSTAT] `POST /invitations/{token}/accept` accepte n'importe quel candidat connecte
    porteur du token (`api/routes/invitations.py:67-76`), sans verifier que
    `current_user.email == invitation.candidate_email`. Risque faible (token 32 bytes,
    distribue uniquement via `/invitations/me` filtre par email aujourd'hui), mais des que
    le token circulera par email (n.2), la verification deviendra souhaitable, ou au
    contraire on assumera "le porteur du lien est l'invite" (pattern courant).
    -> Touche aux permissions : non implemente, voir Points de decision.

### Mapping backlog existant

| Issue                                             | Etat du constat                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MOH-19 (manques docx : ecole, annees xp, langues) | [CONSTAT] Le moteur (`docx_engine.py:402-430`) et les 3 templates builtin contiennent desormais `edu.school`, `years_of_experience`, `languages` (placeholders verifies par extraction XML des 3 .docx). L'issue semble corrigee cote moteur+templates ; il reste a verifier visuellement un docx genere reel. -> commenter/fermer apres verification. |
| MOH-18 (type de skill en en-tete)                 | [CONSTAT] Deux interpretations possibles : la colonne `{{ sk.kind_label }}` dans le tableau competences de `dossier_technique.docx`, et/ou les en-tetes de familles ("Technique", "Outil"...) de la grille skills du profil candidat (`skill-section.tsx:354-428`). Ambigu -> clarifier l'issue avant d'agir.                                          |
| MOH-9 (personnalisation opportunites)             | [CONSTAT] L'edition de mission est entierement codee mais verrouillee par `OPPORTUNITY_EDIT_ENABLED = !ALPHA` (`lib/feature-flags.ts:10`, `opportunities/[id]/page.tsx:294-307`). Lever le flag suffit pour titre/description/skills. A completer avec la friction n.4 (generation groupee).                                                           |
| MOH-8 (suggestion de formulation de realisation)  | Absent du code. GROS CHANTIER C.                                                                                                                                                                                                                                                                                                                       |
| MOH-7 (parsing CV par LLM)                        | `services/cv/llm_extraction.py` est un stub de 19 lignes ; le parsing actuel est heuristique. GROS CHANTIER D.                                                                                                                                                                                                                                         |
| MOH-6 (candidats en cartes)                       | La liste est une table dense avec lignes expandables (`candidates/page.tsx:644-725`). Spec en issue (option cartes vs table commutable).                                                                                                                                                                                                               |
| MOH-5 (inverser template et dossier genere)       | [HYPOTHESE] Concerne probablement l'ordre des onglets de `/recruiter/documents` (Dossiers d'abord, Modeles ensuite) ou l'ordre des sections du dialog de generation. Sans le corps de l'issue, ambigu - clarifier.                                                                                                                                     |

---

## 3. GROS CHANTIERS

### A. Fiche candidat recruteur complete (frictions n.5, n.6, n.12)

- **Probleme** : le recruteur ne voit qu'une fraction du dossier que le candidat construit
  (pas de resume, formation, certifs, langues, skills declaratifs, contact). Le seul moyen
  de tout voir est de generer un docx.
- **Solution proposee** : nouvelle route `GET /organizations/{org_id}/candidates/{candidate_id}`
  retournant un `AccessibleCandidateDetail` (profil etendu + education + certifications +
  langues + CandidateSkill), protegee par `require_live_access`. La liste garde le schema
  leger actuel. La fiche `[id]` consomme la nouvelle route et affiche les sections
  manquantes ; l'apercu candidat ("ce qu'un recruteur verra") s'aligne dessus.
- **Fichiers impactes** : `backend/api/routes/organizations.py`, `backend/services/recruiter_service.py`,
  `backend/schemas/recruiter.py`, `frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx`,
  `frontend/types/api.ts`, `frontend/app/(candidate)/candidate/profile/page.tsx` (apercu).
- **Risques** : decider quelles donnees sensibles exposer (TJM vs salaire, telephone/email
  de contact) - aujourd'hui le docx expose deja phone/email_contact, l'app non.
- **Prerequis de decision** : perimetre exact des champs visibles recruteur (cf Points de decision).

### B. Notifications et cycle de vie des invitations (frictions n.2, n.7, n.8, n.14)

- **Probleme** : le tunnel invitation -> acceptation est aveugle des deux cotes.
- **Solution proposee** : (1) email d'invitation avec lien porteur de token (fait en Phase 2
  pour la partie notification simple), (2) acceptation via lien `/invitations/accept?token=...`
  qui pre-rattache l'invitation meme si l'email du compte differe, (3) badge/notification
  recruteur sur acceptation/refus, (4) renvoi + annulation d'invitation, dedup a la creation.
- **Fichiers impactes** : `backend/services/invitation_service.py`, `backend/api/routes/invitations.py`,
  `frontend/components/notification-bell.tsx`, `frontend/app/(recruiter)/recruiter/candidates/page.tsx`,
  nouvelle page publique d'atterrissage d'invitation.
- **Risques** : securite du token dans l'URL (expiration, usage unique a decider) ; interaction
  avec la verification d'email (friction n.15).
- **Prerequis de decision** : politique "porteur du lien = invite" vs verification stricte d'email.

### C. Assistance LLM a la redaction (MOH-8)

- **Probleme** : les realisations (achievements) sont l'element le plus valorisant du dossier
  et le plus dur a rediger pour un candidat peu technophile.
- **Solution proposee** : bouton "Suggerer une formulation" dans le formulaire achievement
  (`experience-section.tsx`), endpoint backend `POST /candidates/me/experiences/{id}/achievements/suggest`
  qui appelle un LLM avec le contexte de l'experience (role, client, skills) et retourne 2-3
  formulations orientees impact. Jamais d'ecriture automatique : le candidat choisit/edite.
- **Fichiers impactes** : nouveau service `services/llm/`, route skills.py ou candidates.py,
  `experience-section.tsx`.
- **Risques** : cout/latence, cle API a configurer, RGPD (envoi de donnees profil a un tiers -
  a documenter dans la politique de confidentialite).
- **Prerequis de decision** : fournisseur LLM, budget, mention RGPD.

### D. Parsing CV par LLM (MOH-7)

- **Probleme** : le parsing heuristique (regex/sections) est fragile sur les CV non standards ;
  `llm_extraction.py` n'est qu'un stub.
- **Solution proposee** : pipeline a deux etages - extraction texte existante, puis extraction
  structuree LLM (json schema = `proposed_profile` actuel) avec fallback heuristique si le LLM
  echoue. Conserver le flux "proposition -> revue candidat" intact (`CVExtractionProposal`).
- **Fichiers impactes** : `services/cv/llm_extraction.py`, `cv_parser_service.py`, config.
- **Risques** : memes que C + qualite variable selon langue/format ; le score qualite existant
  (`quality.py`) doit s'appliquer aux sorties LLM.
- **Prerequis de decision** : fournisseur, cout par CV, seuil de fallback.

### E. Roles d'organisation (friction n.3)

- **Probleme** : l'UI reserve la gestion d'org a des "administrateurs" qui n'existent pas.
- **Solution proposee** : soit (court terme) activer l'onglet Organisation pour tout membre
  (aligne sur le backend actuel), soit (moyen terme) ajouter `role: admin|member` sur
  `RecruiterProfile` (migration Alembic) + garde backend sur regenerate-join-code.
- **Fichiers impactes** : `settings/page.tsx` (court terme) ; modeles + migration + deps (moyen terme).
- **Prerequis de decision** : option courte vs longue (cf Points de decision).

---

## 4. IMPLEMENTE (Phase 2)

_Rempli en Phase 3._

## 5. ISSUES LINEAR A METTRE A JOUR / NOUVELLES ISSUES / POINTS DE DECISION

_Rempli en Phase 3._
