# Bug tracker alpha

Objectif : centraliser les bugs, typos et frictions produit detectes pendant la passe alpha.

## Priorite haute

### CV importe : experiences a relire non actionnables

- Statut : a corriger
- Surface : profil candidat, import CV
- Fichiers reperes : `frontend/components/cv-import.tsx`, `backend/schemas/candidate.py`
- Probleme : les experiences extraites sont affichees comme de simples lignes "a completer avant ajout". Elles ne sont ni cliquables, ni editables, ni ajoutables.
- Impact : le candidat pense pouvoir completer avant ajout, mais aucun parcours ne permet de le faire.
- Piste : ajouter une revue editable des experiences extraites, puis creer les experiences via `POST /candidates/me/experiences`.

### CV importe : dates extraites mais non renseignees

- Statut : a corriger
- Surface : import CV et ajout des propositions
- Fichiers reperes : `frontend/components/cv-import.tsx`, `backend/services/cv_parser_service.py`
- Probleme : le parser normalise souvent les dates en `YYYY` ou `YYYY-MM`, alors que le front ne conserve que les valeurs strictement `YYYY-MM-DD`.
- Impact : les dates presentes dans l'extraction sont ignorees lors de l'ajout.
- Piste : accepter les granularites mois/annee cote front, ou normaliser explicitement avant envoi selon la regle produit.

### CV importe : realisations absentes

- Statut : a cadrer puis corriger
- Surface : import CV, experiences, dossier candidat
- Fichiers reperes : `backend/services/cv_parser_service.py`, `frontend/components/cv-import.tsx`, `frontend/components/candidate/profile-sections.tsx`
- Probleme : la proposition CV ne modele pas les realisations comme une liste exploitable. Le front n'affiche que `description`.
- Impact : les elements les plus valorisants du CV ne sont pas recuperables avant ajout.
- Piste : etendre `ExperienceProposal` avec `achievements` ou `achievements_summary`, afficher les realisations proposees, puis creer les achievements apres creation de l'experience.

## Priorite moyenne

### Portail recruteur : enums affichees brutes sur les cartes candidat

- Statut : a corriger
- Surface : recruteur, onglet candidats
- Fichiers reperes : `frontend/app/(recruiter)/recruiter/candidates/page.tsx`, `frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx`, `frontend/lib/labels.ts`
- Probleme : `available_now` et `remote` sont affiches tels quels dans les cartes et la fiche candidat.
- Impact : interface percue comme technique/non terminee.
- Piste : ajouter des dictionnaires `AVAILABILITY_LABELS`, `WORK_MODE_LABELS`, `CONTRACT_TYPE_LABELS`, `DOMAIN_LABELS` et les utiliser partout.

### Ajout a une mission : erreur `already_in_shortlist`

- Statut : a corriger
- Surface : recruteur, candidats vers missions
- Fichiers reperes : `frontend/app/(recruiter)/recruiter/candidates/page.tsx`, `frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx`, `backend/services/opportunity_service.py`
- Probleme : l'erreur backend `already_in_shortlist` remonte brute dans le front.
- Impact : feedback incomprehensible pour l'utilisateur.
- Piste : mapper cette erreur en "Ce candidat est deja dans la shortlist de cette mission." ou renvoyer un message metier cote backend.

### Organisation : affichage du slug technique

- Statut : a corriger
- Surface : recruteur, organisation
- Fichiers reperes : `frontend/app/(recruiter)/recruiter/settings/page.tsx`
- Probleme : la carte organisation affiche `Slug : ...`, qui est un identifiant technique.
- Impact : contenu inutile et potentiellement confus.
- Piste : remplacer par une phrase fonctionnelle, par exemple "Espace organisation configure" ou afficher le code equipe/nom public selon le besoin.

### Dossiers & modeles : ordre des onglets a challenger

- Statut : decision produit
- Surface : recruteur, dossiers & modeles
- Fichiers reperes : `frontend/app/(recruiter)/recruiter/documents/page.tsx`
- Probleme : l'onglet par defaut est "Dossiers generes", alors que le choix du modele est probablement l'action initiale la plus coherente.
- Impact : les recruteurs sans dossier arrivent sur un etat vide avant de voir les modeles.
- Piste : mettre "Modeles de dossier" en premier/par defaut, ou garder "Dossiers generes" si la page est pensee comme historique documentaire.

## Typos et finition

### Accueil recruteur : typo "demandesd'acces"

- Statut : a corriger
- Surface : accueil recruteur, carte invitations en attente
- Fichier repere : `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`
- Probleme : l'apostrophe HTML colle visuellement dans "demande(s) d'acces".
- Piste : reformuler pour eviter la concat, par exemple "invitation(s) en attente d'acceptation".

### Libelles avec accents mal encodes dans plusieurs fichiers

- Statut : a verifier dans le navigateur
- Surface : plusieurs pages front
- Fichiers reperes : `frontend/components/cv-import.tsx`, pages recruteur, pages candidat
- Probleme : les sources contiennent des textes accentues qui apparaissent mal dans certaines sorties terminal.
- Impact : si reproduit dans le navigateur, typos generalisees.
- Piste : verifier l'encodage effectif en UI ; si l'UI est correcte, ne pas traiter comme bug.

## Autres frictions trouvees

### Domaine candidat affiche en anglais dans les filtres

- Statut : a corriger
- Surface : recruteur, filtres candidats
- Fichier repere : `frontend/app/(recruiter)/recruiter/candidates/page.tsx`
- Probleme : les domaines viennent de `VALID_DOMAINS` et sont seulement capitalises (`finance`, `retail`, `industry`, etc.).
- Impact : incoherence avec le reste des libelles francais.
- Piste : ajouter un mapping de labels domaine.

### Detail candidat recruteur : meme fuite de labels techniques

- Statut : a corriger avec la page liste
- Surface : recruteur, fiche candidat
- Fichier repere : `frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx`
- Probleme : disponibilite et mode sont affiches bruts comme dans la liste.
- Impact : correction a mutualiser pour eviter un fix incomplet.

### Generation de masse : resultats peu lisibles

- Statut : amelioration
- Surface : recruteur, detail mission
- Fichier repere : `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx`
- Probleme : les resultats affichent un prefixe d'UUID candidat et peuvent afficher `r.error` brut.
- Impact : difficile de savoir quel candidat a echoue.
- Piste : afficher le nom/email du candidat et mapper les erreurs techniques.

### Import CV : certifications affichees mais pas ajoutables

- Statut : a corriger ou clarifier
- Surface : import CV
- Fichier repere : `frontend/components/cv-import.tsx`
- Probleme : les certifications extraites sont affichees comme "a completer avant ajout", mais le bouton d'ajout ne traite que formations et langues.
- Impact : meme incoherence que les experiences.
- Piste : ajouter une revue editable pour certifications ou changer le texte pour ne pas promettre l'ajout.

## Proposition de prochain lot

1. Centraliser les labels front : disponibilite, mode de travail, contrat, domaines, erreurs metier courantes.
2. Corriger les fuites visibles recruteur : cartes candidat, fiche candidat, ajout shortlist, slug organisation, typo invitations.
3. Reprendre le flux CV comme un chantier separe : schema de proposition, granularite des dates, edition/validation, creation des experiences et realisations.
4. Challenger l'ordre des onglets "Dossiers & modeles" avec un test rapide sur le parcours recruteur alpha.
