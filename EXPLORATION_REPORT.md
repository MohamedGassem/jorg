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

| Commit                        | Description                                                                                                                                   | Mapping        | Verification                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `6d32641` fix(access)         | Revocation d'acces candidat reparee : GET /access/me puis DELETE /access/me/{grant_id} au lieu de la route fantome POST /access-grants/revoke | EXPLORATION#1  | tsc + eslint OK (pas de tests frontend dans le repo)                         |
| `b774152` feat(invitations)   | Email envoye au candidat invite (lien acces si compte existant, inscription sinon) ; echec d'envoi loggue sans bloquer                        | EXPLORATION#2  | 2 tests d'integration ajoutes (`test_invitation_api.py`), passes             |
| `7fb48ad` feat(opportunities) | Generation groupee acceptant les modeles Jorg builtin (`system_template_key`) ; la page mission les propose desormais                         | EXPLORATION#4  | 2 tests d'integration ajoutes (`test_opportunities_api.py`), passes ; tsc OK |
| `4b73281` fix(recruteur)      | Filtre contrat freelance/cdi incluant les profils `both`                                                                                      | EXPLORATION#9  | 1 test d'integration ajoute (`test_recruiter_api.py`), passe                 |
| `7a64d4b` fix(recruteur)      | Periodes d'experience au format mm/yyyy dans les vues recruteur (`frMonthYear`)                                                               | EXPLORATION#10 | tsc + eslint OK                                                              |

Suite backend complete apres modifications : **506 passed, 1 skipped**.
Limite : la verification visuelle navigateur n'a pas ete faite (environnement non lance pendant la session) ;
les changements frontend sont couverts par typecheck + lint, les changements backend par les tests d'integration.

### Vague 1 architecture (plan `2026-06-12-vague1-quickwins.md`, livree)

| Commit                         | Description                                                                                                                                  | Mapping         | Verification                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| merge dev                      | Synchronisation avec dev (920d42c) avant la vague                                                                                            | process         | suite backend 506 passed                                                        |
| `41678a3` refactor(frontend)   | `SkillPicker` construit sur `useSearchableSelect`, remplace les 2 reimplementations inline des pages missions (-45 lignes nettes)            | ARCH#5          | tsc + eslint OK                                                                 |
| `cb36351` refactor(generation) | Seam `resolve_template` (ResolvedTemplate) + pipeline unique `_render_and_store` ; les 2 points d'entree deviennent des orchestrations fines | ARCH#2          | 3 tests unitaires ajoutes + 30 tests integration generation/opportunites passes |
| `338d5be` refactor(candidat)   | `assemble_timeline` pure extraite de `list_organization_interactions`                                                                        | C3 (spec wave4) | 6 tests unitaires ajoutes + 48 tests integration candidat/access passes         |

Fin de vague 1 : suite backend complete **515 passed, 1 skipped** ; tsc sans erreur ; eslint 0 erreur
(1 warning preexistant dans `useAsyncData.ts`, herite de dev, non touche).

### Vague 2 UX (plan `2026-06-12-vague2-ux.md`, livree)

| Commit                       | Description                                                                                                                                             | Mapping        | Verification                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------- |
| `369b0ac` feat(invitations)  | Dedup (409 si invitation pendante ou acces actif), annulation (DELETE, pending only) et renvoi d'email (POST .../resend)                                | EXPLORATION#3  | 5 tests d'integration ajoutes         |
| `12c29eb` feat(recruteur)    | Boutons Renvoyer / Annuler sur les invitations pendantes (page Candidats)                                                                               | EXPLORATION#3  | tsc + eslint                          |
| `4fb9d0a` feat(recruteur)    | Cloche de notifications recruteur : invitations acceptees/refusees + dossiers generes (InvitationRead expose updated_at, additif)                       | EXPLORATION#2  | tsc + eslint, tests invitations verts |
| `5a59622` refactor(candidat) | lib/completion.ts : source unique de completude (criteres du dashboard) consommee par dashboard et hero du profil                                       | EXPLORATION#11 | tsc + eslint                          |
| `8957736` refactor(frontend) | DossierGenerationDialog unifie (cible recruteur/self) + type TemplateChoice ; -176 lignes nettes, les pages ne fetchent plus les modeles pour le dialog | ARCH#3         | tsc + eslint                          |
| `79bbed2` test(invitations)  | test_accept_is_idempotent adapte a la dedup (2e invitation injectee en base)                                                                            | EXPLORATION#3  | suite complete verte                  |

Fin de vague 2 : suite backend complete **520 passed, 1 skipped** ; tsc sans erreur ; eslint 0 erreur.
Choix a valider : les criteres canoniques de completude sont ceux du dashboard (identite+titre,
resume, experience, competence, contact+dispo) ; l'avatar et LinkedIn ne comptent plus.

Non implemente volontairement (regles d'autonomie) : onglet Organisation des parametres recruteur
(verrou "administrateurs" possiblement intentionnel), verification d'email a l'acceptation
(touche aux permissions), MOH-18 (ambigu), fiche candidat complete (contrat API multi-ecrans).

## 5. ISSUES LINEAR A METTRE A JOUR

- **MOH-19** (Bug - manques docx) : commentaire a ajouter -
  "Le moteur (`docx_engine.py`) expose ecole, annees d'experience (avec derivation auto depuis les
  experiences) et langues ; les 3 templates builtin contiennent les placeholders `edu.school`,
  `years_of_experience` et la boucle `languages` (verifie par extraction du XML des .docx).
  Reste a verifier un docx genere sur un profil reel puis fermer."
- **MOH-18** (Improvement - type de skill en en-tete) : commentaire a ajouter -
  "Deux surfaces candidates : (a) la colonne `kind_label` du tableau competences de
  `dossier_technique.docx`, (b) les en-tetes de familles de la grille competences du profil
  (`skill-section.tsx`). Preciser laquelle est visee avant d'agir."
- **MOH-9** (Improvement - personnalisation opportunites) : commentaire a ajouter -
  "L'edition (titre, description, skills requis) est entierement codee mais verrouillee par
  `OPPORTUNITY_EDIT_ENABLED = !ALPHA` (`frontend/lib/feature-flags.ts`). Lever le flag suffit.
  Par ailleurs la generation groupee accepte desormais les modeles Jorg (commit 7fb48ad)."

## 6. NOUVELLES ISSUES PRETES A CREER

1. **Rendre le code d'equipe accessible aux recruteurs**
   - Label : Bug Â· Priorite : High
   - Contexte : l'onglet Organisation des parametres recruteur est desactive ("Reserve aux
     administrateurs") alors qu'aucun concept d'admin n'existe ; le join code et la liste des
     membres sont implementes mais inaccessibles, donc personne ne peut rejoindre une org existante.
   - Criteres d'acceptation : un membre d'org peut afficher/copier/regenerer le code et voir les
     membres ; le parcours "Rejoindre" de l'onboarding est praticable de bout en bout.
   - Fichiers : `frontend/app/(recruiter)/recruiter/settings/page.tsx` (lever `disabled: true`).
   - Dependance : decision n.1 (roles d'org) - si on introduit des roles, cette issue devient le
     lot 1 du chantier E.

2. **Notifications recruteur (acceptation/refus d'invitation)**
   - Label : Improvement Â· Priorite : Medium
   - Contexte : `notification-bell.tsx` est un no-op cote recruteur ; le recruteur ne sait pas
     qu'un candidat a accepte sans aller deplier la liste des invitations.
   - Criteres : la cloche recruteur affiche les N derniers evenements (invitation acceptee/refusee,
     dossier genere par un collegue), avec etat lu/non-lu comme cote candidat.
   - Fichiers : `frontend/components/notification-bell.tsx`, potentiellement un endpoint
     `GET /organizations/{org_id}/activity` (a defaut, composer invitations + documents existants).

3. **Renvoyer, annuler et dedupliquer les invitations**
   - Label : Improvement Â· Priorite : Medium
   - Contexte : pas de DELETE ni de renvoi d'invitation ; `create_invitation` ne verifie ni
     invitation pendante existante ni grant actif (doublons possibles, invitation zombie 30 jours
     en cas de faute de frappe).
   - Criteres : 409 explicite si invitation pendante ou acces deja actif pour le meme email/org ;
     action "Renvoyer l'email" et "Annuler" sur chaque invitation pendante cote recruteur.
   - Fichiers : `backend/services/invitation_service.py`, `backend/api/routes/invitations.py`,
     `frontend/app/(recruiter)/recruiter/candidates/page.tsx`.

4. **Unifier le calcul de completude du dossier candidat**
   - Label : Improvement Â· Priorite : Low
   - Contexte : le dashboard (5 criteres) et le hero du profil (6 criteres differents) affichent
     deux pourcentages differents pour le meme dossier.
   - Criteres : une seule fonction partagee (ex. `lib/completion.ts`) consommee par les deux ecrans.
   - Fichiers : `frontend/app/(candidate)/candidate/dashboard/page.tsx:208`,
     `frontend/app/(candidate)/candidate/profile/page.tsx:73`.

5. **Tracabilite des consultations : tracer ou reformuler**
   - Label : Bug Â· Priorite : Medium
   - Contexte : l'UI promet "chaque consultation est tracee cote candidat" mais aucun evenement de
     consultation n'existe (seuls invitations/grants/generations sont jouralises). Promesse RGPD/confiance.
   - Criteres : soit un evenement `profile_viewed` est enregistre quand un recruteur ouvre la fiche
     (avec anti-spam type 1 evenement/jour/recruteur), soit le wording est corrige partout.
   - Fichiers : `recruiter/dashboard/page.tsx:412`, `recruiter/candidates/[id]/page.tsx:204`,
     backend `candidate_service.list_organization_interactions` si on trace.
   - Dependance : decision n.3.

6. **Verifier l'email a l'acceptation d'une invitation**
   - Label : Improvement Â· Priorite : Low
   - Contexte : `POST /invitations/{token}/accept` accepte tout candidat connecte porteur du token.
     Acceptable tant que le token ne circule que dans l'app ; a re-evaluer maintenant que l'email
     d'invitation existe (commit b774152, le lien n'inclut volontairement pas le token).
   - Criteres : decision documentee (verification stricte vs porteur-du-lien) + test correspondant.
   - Fichiers : `backend/api/routes/invitations.py:67`.

7. **Vue candidats en cartes (MOH-6, complement)**
   - Label : Improvement Â· Priorite : Medium
   - Contexte : la liste est une table dense ; MOH-6 demande des cartes. Proposition : toggle
     table/cartes persiste en localStorage, cartes reprenant identite, dispo, TJM, top skills, CTA.
   - Fichiers : `frontend/app/(recruiter)/recruiter/candidates/page.tsx`.

## 7. GROS CHANTIERS - decoupage propose

### Chantier A - Fiche candidat recruteur complete

1. **A1. Endpoint detail candidat** - Feature, High.
   `GET /organizations/{org_id}/candidates/{candidate_id}` (schema `AccessibleCandidateDetail` :
   profil etendu + education + certifications + langues + CandidateSkill), garde par
   `require_live_access`. Tests d'integration (acces refuse sans grant actif).
   Fichiers : `api/routes/organizations.py`, `services/recruiter_service.py`, `schemas/recruiter.py`.
2. **A2. Fiche recruteur enrichie** - Feature, High. Depend de A1.
   La page `[id]` consomme A1 et affiche resume, formation, certifs, langues, infos pratiques.
   Fichiers : `frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx`, `types/api.ts`.
3. **A3. Apercu candidat aligne** - Improvement, Medium. Depend de A2.
   Le dialog "ce qu'un recruteur verra" reprend exactement les sections de A2.
   Fichiers : `frontend/app/(candidate)/candidate/profile/page.tsx`.

### Chantier B - Cycle de vie des invitations

1. **B1. Lien d'invitation porteur de token** - Feature, High.
   Page publique `/invitation/{token}` (nom de l'org, CTA inscription/connexion), pre-rattachement
   de l'invitation au compte cree meme si l'email differe. Decision n.2 prealable.
2. **B2. Renvoi / annulation / dedup** - issue n.3 ci-dessus, integrable ici.
3. **B3. Notifications recruteur** - issue n.2 ci-dessus, integrable ici.

### Chantier C - Suggestion de formulation de realisation (MOH-8)

1. **C1. Service LLM minimal** - Feature, Medium. Config fournisseur + endpoint suggestion
   (entree : description brute + contexte experience ; sortie : 2-3 formulations orientees impact).
2. **C2. UI suggestion** - Feature, Medium. Depend de C1. Bouton dans le formulaire achievement,
   choix/edition par le candidat, jamais d'ecriture automatique.
3. **C3. Mention RGPD** - Improvement, Medium. Depend de C1. Politique de confidentialite mise a jour
   (envoi de donnees profil a un sous-traitant LLM).

### Chantier D - Parsing CV par LLM (MOH-7)

1. **D1. Extraction structuree LLM** - Feature, High. Depend de C1 (meme infra fournisseur).
   `llm_extraction.py` produit le json `proposed_profile` ; fallback heuristique conserve.
2. **D2. Scoring et A/B interne** - Improvement, Medium. Depend de D1. Le score qualite existant
   s'applique aux sorties LLM ; comparaison heuristique vs LLM sur un corpus de CV de test.

### Chantier E - Roles d'organisation

1. **E1. (court terme) Ouvrir l'onglet Organisation** - issue n.1 ci-dessus.
2. **E2. Role admin/member** - Feature, Low (post-alpha). Migration Alembic (`RecruiterProfile.role`),
   garde sur regenerate-join-code, UI conditionnee. Depend de la decision n.1.

## 8. POINTS DE DECISION

1. **Roles d'organisation** : ouvrir l'onglet Organisation a tous les membres (10 minutes, aligne
   sur le backend actuel) ou introduire admin/member (migration + gardes) ?
   **Recommandation : ouvrir a tous maintenant** (une org alpha = une petite equipe de confiance),
   roles en post-alpha.
2. **Politique du lien d'invitation** : verification stricte de l'email a l'acceptation, ou
   "porteur du lien = invite" (pattern dominant chez les ATS) ?
   **Recommandation : porteur du lien**, avec expiration 30 jours deja en place et usage unique du token.
3. **Tracabilite des consultations** : tracer reellement les consultations de fiche (evenement
   `profile_viewed`, valeur differenciante du produit) ou corriger le wording ?
   **Recommandation : tracer** - c'est l'argument de confiance central du produit ; en attendant,
   corriger le wording est un quick win honnete.
4. **Perimetre des donnees exposees au recruteur** (chantier A) : le docx expose deja phone/email
   de contact, l'app non. Aligner l'app sur le docx, ou restreindre le docx ?
   **Recommandation : aligner l'app sur le docx** (le candidat a deja consenti via le grant),
   en affichant clairement au candidat la liste des champs partages.
5. **MOH-18 et MOH-5** : les deux issues sont ambigues vues du code (cf section 5) ; une ligne de
   clarification dans chaque issue debloquerait l'implementation.

## 9. ARCHITECTURE - opportunites de deepening (revue /improve-codebase-architecture)

Vocabulaire : module (interface + implementation), shallow (interface presque aussi complexe que
l'implementation), seam (emplacement d'une interface), adapter, locality, leverage. Rapport visuel
complet (avant/apres) : architecture-review-20260612-jorg.html (dossier temp, hors repo).

### Deja decide, pas encore implemente (specs docs/superpowers/specs/, ne pas re-debattre)

- **D2 - Transaction par requete** (spec 2026-06-04-wave5, DECIDED) : `get_db()` n'ouvre toujours pas
  de transaction request-scoped ; 43 `commit()` repartis dans 17 fichiers services,
  `accept_invitation` committe 3 fois (non atomique). Blast radius maximal, a faire en dernier comme prevu.
- **C3 - Timeline pure** (spec 2026-06-04-wave4) : `candidate_service.list_organization_interactions`
  (lignes 82-194) fusionne toujours 3 requetes + assemblage ; la fonction pure `assemble_timeline()`
  prevue n'existe pas. Effort faible, deja designe, debloque les tests unitaires du journal.
- **C5 - useMutation** (meme spec) : non code.

### Candidats nouveaux

1. **Espace de travail recruteur (frontend)** - Strong.
   4 pages recruteur + l'app bar re-fetchent independamment profil/org/templates org/modeles Jorg
   (8+ requetes redondantes par session), et chaque page reecrit ses etats chargement/org absente/erreur.
   Deepening : provider `RecruiterWorkspaceProvider` au seam du layout `(recruiter)/layout.tsx`,
   hook `useRecruiterWorkspace()`. Locality : etats vides/erreur ecrits une fois ; leverage : toute
   nouvelle page recruteur obtient le contexte gratuitement.
   Fichiers : frontend/app/(recruiter)/\*\*, components/app-bar.tsx, lib/hooks/useRecruiterOrg.ts.

2. **Pipeline de generation unique + seam "source de template" (backend)** - Strong.
   `generate_for_candidate` (100 l.) et `generate_for_self` (69 l.) dupliquent ~60 % du pipeline
   (chargements, rendu, conversion PDF + fallback, stockage, enregistrement) ; la resolution
   modele Jorg vs template org est un seam reel a deux adapters mais reste un if/elif inline.
   Deepening : `resolve_template(...) -> ResolvedTemplate` + `render_and_store(profile_id, resolved, fmt)`,
   les trois entrees (recruteur, self, bulk) devenant de fines orchestrations.
   Fichiers : backend/services/documents/generation_service.py.

3. **Dialog de generation unifie (frontend)** - Worth exploring.
   538 lignes pour deux dialogs identiques a ~85 % (generate-dossier-dialog 301 l.,
   candidate-generate-dossier-dialog 237 l.) ; l'encodage stringly-typed "system:key"/"org:id" vit
   desormais dans 2 modules. Deepening : un `DossierGenerationDialog` dont l'interface est la cible
   (`{kind:"recruiter",...} | {kind:"self"}`) + type partage `TemplateChoice`.

4. **Read-model "dossier accessible" (backend)** - Worth exploring.
   `recruiter_service.list_accessible_candidates` (lignes 171-336) soude builder de filtres,
   batch-load des experiences et assemblage de dicts ; zero test unitaire (le bug du filtre "both"
   corrige cette semaine n'etait testable qu'en integration). Le chantier A (fiche candidat complete)
   va re-batcher formations/certifs/langues : test de suppression positif, approfondir avant.
   Deepening : module "dossier accessible" (`list_views(org, filters)` / futur `get_view(org, candidate)`)
   avec assembleur pur testable sans DB. Dependance : decision produit n.4 (perimetre des champs).

5. **SkillPicker (frontend)** - Strong, tres faible effort.
   Le hook `useSearchableSelect` existe (4 usages cote candidat) mais les 2 pages missions
   re-implementent debounce + dropdown inline (~25 l. x2 + JSX duplique).
   Deepening : composant `SkillPicker` (input + dropdown + chips) construit sur le hook.
   Fichiers : recruiter/opportunities/page.tsx:43-66, opportunities/[id]/page.tsx.

### Recommandation prioritaire

Candidat 2 (pipeline de generation) d'abord : effort et risque faibles (couverts par les tests
d'integration generation existants), et trois features du backlog (generation groupee enrichie,
watermark, nouveaux modeles) passeront par ce seam. Le candidat 5 (SkillPicker) est une heure de
travail a faire dans la foulee. Le candidat 1 (workspace recruteur) a le plus de leverage UX mais
merite une session dediee. En parallele, planifier C3 (timeline pure), deja designe.

### Tests : zones aveugles relevees

Services sans tests unitaires (logique pure soudee aux requetes SQLAlchemy, testables uniquement
en integration Postgres) : `candidate_service.list_organization_interactions`,
`recruiter_service.list_accessible_candidates`, `invitation_service.accept_invitation`,
`opportunity_service.get_opportunity_detail`, `rgpd_service`. Les candidats 2 et 4 et le C3
deja decide reduisent directement cette liste.

### Vague 3 architecture (plan `2026-06-12-vague3-architecture.md`, livree)

Base : dev apres merge de la PR #47, branche `exploration/vague3-architecture`.

| Commit                        | Description                                                                                                                                                                                                                                                | Mapping | Verification                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| `a87aa97` refactor(recruteur) | Assembleur pur `assemble_accessible_candidates` + batch-loader nomme ; terme Accessible dossier et Recruiter workspace dans CONTEXT.md                                                                                                                     | ARCH#4  | 2 tests unitaires ajoutes + 36 integration recruteur verts |
| `c5fabce` refactor(frontend)  | `RecruiterWorkspaceProvider` au seam du layout (profil, email, org, templates, modeles Jorg charges une fois) ; `useRecruiterOrg` devient une vue restreinte ; app bar, dashboard, documents, mission detail et settings purges de leurs fetchs redondants | ARCH#1  | tsc + eslint                                               |
| `15b19e0` refactor(frontend)  | invite-candidate-dialog sur useAsyncOp ; spec C5 (useMutation) consideree couverte par useAsyncOp, pas de hook doublon                                                                                                                                     | C5      | tsc + eslint                                               |

Fin de vague 3 : suite backend complete **522 passed, 1 skipped** ; tsc sans erreur ; eslint 0 erreur.
Les 5 candidats de la revue d architecture (section 9) et les specs C3/C5 sont soldes ;
reste D2 (transaction par requete), a planifier seule en derniere position comme prevu.
Decision validee par Mohamed (2026-06-12) : criteres de completude = ceux du dashboard,
photo et LinkedIn ne comptent pas.

## 10. ARBITRAGES DU 2026-06-12 (Mohamed)

| Decision                          | Arbitrage                                                                                                                                                                                                   | Consequence                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| n.1 Roles d org / code d equipe   | Pas besoin d ouvrir l onglet : l org de test accueille les recruteurs par defaut (code alpha). A rediscuter plus tard. La vraie priorite est ailleurs : **gestion des templates personnalises + tutoriel**. | Issue onglet Organisation abandonnee ; nouveau chantier F ci-dessous.                                |
| n.2 Lien d invitation             | **Page publique d invitation validee** (porteur du lien).                                                                                                                                                   | Chantier B1 debloque, issue a creer.                                                                 |
| n.3 Tracage des consultations     | **On ne trace pas** (risque de FOMO cote candidat).                                                                                                                                                         | Wording corrige partout (commit ac0a4b9, 6 ecrans + privacy + landing). Issue tracage abandonnee.    |
| n.4 Donnees exposees au recruteur | Vision : **consentement granulaire du candidat** - cases a cocher par perimetre (dossier seul / + TJM-salaire / + coordonnees), et moyen de contact alternatif si les coordonnees ne sont pas partagees.    | Le chantier A est redefini : il depend du chantier G ci-dessous (scopes sur AccessGrant, migration). |
| n.5 MOH-18 / MOH-5                | MOH-18 **obsolete** (a fermer). MOH-5 = ordre des onglets de la page Documents, pertinence douteuse (proposer fermeture).                                                                                   | Commentaires Linear prepares.                                                                        |

Verification MOH-19 (2026-06-12) : rendu reel des 3 modeles builtin via le moteur -
ecole, diplome, annees d experience, langues + niveaux tous presents. A fermer.

### Chantier F - Templates personnalises ouverts + tutoriel (nouvelle priorite)

- Constat : le backend est deja pret (upload POST /organizations/{org}/templates avec extraction
  des placeholders, telechargement, suppression, flag is_valid, doc docs/template-syntax.md,
  template d exemple GET /templates/sample). Le frontend verrouille tout (page Documents, encart
  Post-alpha).
- Spec courte : (F1) UI d upload sur la page Documents avec affichage des placeholders detectes
  et de l etat de validation ; (F2) parcours de validation du mapping (quels placeholders requis,
  message clair si is_valid=false, lien de telechargement du template pour correction) ;
  (F3) tutoriel guide : page ou section "Creer votre modele" basee sur template-syntax.md +
  bouton de telechargement du template d exemple ; (F4) prevoir la preview mock sur template org
  (le moteur sait deja rendre, il manque la route preview pour un template org).
- Prerequis de decision : critere exact de is_valid (quels placeholders minimum ?).

### Chantier G - Consentement granulaire du candidat (redefinit le chantier A)

- Spec courte : perimetres de partage portes par l AccessGrant (ex. scope_profile toujours,
  scope_finances TJM/salaire, scope_contact coordonnees) ; cases a cocher cote candidat au moment
  d accepter l invitation (et modifiables ensuite depuis Acces & partages) ; la fiche recruteur
  (chantier A) et le docx genere respectent les scopes ; si scope_contact refuse, proposer un
  moyen de contact alternatif (mise en relation via la plateforme, a specifier).
- Impact : migration Alembic sur AccessGrant + filtrage dans le read-model "Accessible dossier"
  (module deja prepare, ARCH#4) et dans le contexte du docx_engine.
- Sequencement propose : G1 modele + migration + defaults retrocompatibles, G2 UI candidat
  (acceptation + edition), G3 application des scopes au read-model et au docx, G4 contact alternatif.
