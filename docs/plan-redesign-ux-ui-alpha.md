# Plan d'implementation - Redesign UX/UI avant alpha publique

## Objectif

Preparer une refonte progressive de Jorg avant alpha publique, sans modifier la logique metier, les routes existantes, le modele de donnees ou les contrats API.

La refonte doit renforcer l'identite de Jorg autour de quatre piliers :

- profil structure ;
- acces controle ;
- dossier genere ;
- confiance candidat / recruteur.

Direction retenue : **Workspace RH sobre, document-first, avec signature violet encre**.

Regle produit non negociable : **aucun changement purement cosmetique ne doit etre implemente s'il ne renforce pas au moins un pilier produit.**

---

## 0. Lot 0 - Design tokens et theming

Ce lot doit etre traite avant les modifications d'ecrans. Il stabilise la base visuelle et evite les corrections couleur eparpillees.

### 0.1 Architecture light / dark / system

| Champ                  | Detail                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | `frontend/app/globals.css`, `frontend/app/layout.tsx`, eventuellement providers theme si existants                                                                                    |
| Composants concernes   | Theme global, variables CSS, racine app                                                                                                                                               |
| Changement attendu     | Mettre en place une architecture compatible light / dark / system. Verifier si un mecanisme dark mode existe deja avant d'ajouter quoi que ce soit.                                   |
| Impact utilisateur     | Interface plus credible, stable et coherentement lisible selon le theme.                                                                                                              |
| Risque technique       | Moyen                                                                                                                                                                                 |
| Dependances            | Inspection prealable du theme existant.                                                                                                                                               |
| Criteres d'acceptation | Les tokens existent en light et dark ; le systeme peut evoluer vers un theme system sans hardcode dans les composants metier ; le dark mode ne reutilise pas un primaire trop sombre. |

### 0.2 Variables CSS semantiques

| Champ                  | Detail                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/globals.css`                                                                                                                                                                                 |
| Composants concernes   | Tokens Tailwind/shadcn, variables CSS                                                                                                                                                                      |
| Changement attendu     | Definir des variables semantiques : `background`, `surface`, `surface-muted`, `foreground`, `muted-foreground`, `border`, `primary`, `primary-foreground`, `primary-soft`, `success`, `warning`, `danger`. |
| Impact utilisateur     | La palette Jorg devient systematique au lieu d'etre dispersee.                                                                                                                                             |
| Risque technique       | Moyen                                                                                                                                                                                                      |
| Dependances            | Audit des tokens shadcn existants.                                                                                                                                                                         |
| Criteres d'acceptation | Les composants UI shared peuvent consommer les tokens sans couleur hardcodee ; violet encre est le primaire ; amber/orange est reserve a `warning`.                                                        |

### 0.3 Interdire le hardcode couleur dans les composants metier

| Champ                  | Detail                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Fichiers concernes     | Pages app, `frontend/components/*`, surtout dashboards, access, documents, profile sections                                                |
| Composants concernes   | Tous les composants metier affichant couleurs, badges, alertes ou etats                                                                    |
| Changement attendu     | Identifier puis eviter les classes couleur hardcodees dans les composants metier. Utiliser des variantes ou tokens semantiques.            |
| Impact utilisateur     | Cohesion visuelle et semantique : la couleur exprime un statut, pas une decoration.                                                        |
| Risque technique       | Moyen                                                                                                                                      |
| Dependances            | Lot 0.2                                                                                                                                    |
| Criteres d'acceptation | Pas de nouvelle couleur hardcodee dans les composants metier ; `amber/orange` uniquement pour warning/attention ; pas de gradient ni glow. |

### 0.4 Verifier les composants UI de base

| Champ                  | Detail                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | `frontend/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `dialog.tsx`, `select.tsx`, `frontend/components/nav-sidebar.tsx`                    |
| Composants concernes   | `Button`, `Card`, `Badge`, `Input`, `Dialog`, `Select`, `NavSidebar`                                                                                            |
| Changement attendu     | Verifier que les composants de base utilisent des tokens semantiques, supportent light/dark, et ne forcent pas un style shadcn brut trop visible.               |
| Impact utilisateur     | Base UI plus professionnelle et coherentement Jorg.                                                                                                             |
| Risque technique       | Moyen                                                                                                                                                           |
| Dependances            | Lots 0.1 et 0.2                                                                                                                                                 |
| Criteres d'acceptation | Boutons, cards, badges, inputs, dialogs et sidebar restent fonctionnels ; leurs couleurs viennent des tokens ; les etats hover/focus/disabled restent lisibles. |

---

## Inspection obligatoire avant toute PR

Avant chaque PR, inspecter les fichiers concernes et noter :

- les composants reellement utilises ;
- les textes visibles ;
- les classes couleur hardcodees ;
- les dependances entre composants shared et pages ;
- les usages de `StatCard`, `QuickActionCard`, `EmptyState` ;
- l'existence ou non d'un mecanisme dark mode ;
- les risques de casser une route, un payload API ou une interaction existante.

Cette inspection doit preceder toute modification de code. Elle peut etre documentee dans la description de PR.

---

## 1. Quick wins obligatoires avant alpha

Ces actions ont un impact fort sur la perception produit et un risque technique faible a moyen. Elles doivent rester liees aux piliers produit.

### 1.1 Renommer la navigation candidat

| Champ                  | Detail                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fichier concerne       | `frontend/app/(candidate)/layout.tsx`                                                                                                                                    |
| Composant concerne     | `candidateNav`, `NavSidebar`                                                                                                                                             |
| Changement attendu     | Remplacer les labels par des termes metier : `Tableau de bord` -> `Accueil`, `Acces` -> `Qui a acces`, `Parametres` -> `Compte & donnees`. Garder les routes existantes. |
| Impact utilisateur     | Le candidat comprend immediatement que Jorg sert a controler son dossier et ses acces.                                                                                   |
| Effort estime          | Faible                                                                                                                                                                   |
| Risque technique       | Faible                                                                                                                                                                   |
| Dependances            | PR 1 si labels doivent utiliser les nouveaux styles sidebar.                                                                                                             |
| Criteres d'acceptation | Les routes restent identiques ; la sidebar candidat affiche les nouveaux labels ; aucun parcours existant n'est casse.                                                   |

### 1.2 Renommer la navigation recruteur

| Champ                  | Detail                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/(recruiter)/layout.tsx`                                                                                                                 |
| Composant concerne     | `recruiterNav`, `NavSidebar`                                                                                                                          |
| Changement attendu     | Remplacer les labels par : `Accueil`, `Candidats autorises`, `Missions`, `Dossiers & modeles`, `Equipe & organisation`. Garder les routes existantes. |
| Impact utilisateur     | Le recruteur percoit un workspace metier plutot qu'un dashboard admin generique.                                                                      |
| Effort estime          | Faible                                                                                                                                                |
| Risque technique       | Faible                                                                                                                                                |
| Dependances            | PR 1 si labels doivent utiliser les nouveaux styles sidebar.                                                                                          |
| Criteres d'acceptation | Les routes restent identiques ; la navigation recruteur exprime clairement le workflow candidat -> mission -> dossier.                                |

### 1.3 Reduire les icones decoratives de la sidebar

| Champ                  | Detail                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/components/nav-sidebar.tsx`                                                                                                             |
| Composant concerne     | `NavSidebar`, `ICON_MAP`                                                                                                                          |
| Changement attendu     | Garder les icones uniquement si elles aident la lisibilite. Retirer les icones trop generiques ou decoratives, notamment `Zap` pour les missions. |
| Impact utilisateur     | Interface plus mature, moins kit UI assemble rapidement.                                                                                          |
| Effort estime          | Faible                                                                                                                                            |
| Risque technique       | Faible                                                                                                                                            |
| Dependances            | PR 2 navigation.                                                                                                                                  |
| Criteres d'acceptation | La sidebar reste lisible sans surcharge ; aucune icone ne sert uniquement de decoration.                                                          |

### 1.4 Remplacer le wording "Templates"

| Champ                  | Detail                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fichiers concernes     | `frontend/app/(recruiter)/recruiter/documents/page.tsx`, `frontend/components/generate-dossier-dialog.tsx`, `frontend/components/candidate-generate-dossier-dialog.tsx`, `frontend/app/onboarding/recruiter/template/page.tsx` |
| Composants concernes   | Onglets, labels de formulaire, titres de dialog, textes alpha                                                                                                                                                                  |
| Changement attendu     | Remplacer le wording utilisateur `template(s)` par `modele(s) de dossier`. Garder les noms internes et types API inchanges.                                                                                                    |
| Impact utilisateur     | Le produit parle le langage recruteur/candidat, pas un langage technique.                                                                                                                                                      |
| Effort estime          | Faible                                                                                                                                                                                                                         |
| Risque technique       | Faible                                                                                                                                                                                                                         |
| Dependances            | Aucune, hors coherence avec PR 8/9.                                                                                                                                                                                            |
| Criteres d'acceptation | Aucun `Template(s)` visible dans l'UI utilisateur principale ; les contrats API restent inchanges.                                                                                                                             |

### 1.5 Revoir les empty states prioritaires

| Champ                  | Detail                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | `frontend/components/ui/EmptyState.tsx`, `frontend/app/(candidate)/candidate/access/page.tsx`, `frontend/app/(recruiter)/recruiter/candidates/page.tsx`, `frontend/app/(recruiter)/recruiter/documents/page.tsx`, `frontend/app/(recruiter)/recruiter/opportunities/page.tsx`, `frontend/components/candidate/profile-sections.tsx` |
| Composant concerne     | `EmptyState` et messages inline `Aucun...`                                                                                                                                                                                                                                                                                          |
| Changement attendu     | Ajouter des empty states contextualises avec titre, explication et action quand possible. Eviter les messages seuls comme `Aucun dossier`.                                                                                                                                                                                          |
| Impact utilisateur     | Les pages vides deviennent des etapes guidees, pas des zones mortes.                                                                                                                                                                                                                                                                |
| Effort estime          | Moyen                                                                                                                                                                                                                                                                                                                               |
| Risque technique       | Faible a moyen                                                                                                                                                                                                                                                                                                                      |
| Dependances            | PR 1 pour tokens, PR 3 pour wording global.                                                                                                                                                                                                                                                                                         |
| Criteres d'acceptation | Chaque empty state critique explique pourquoi l'etat est vide et quelle est la prochaine action utile.                                                                                                                                                                                                                              |

### 1.6 Corriger les titres et sous-titres generiques

| Champ                  | Detail                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | `frontend/app/(candidate)/candidate/dashboard/page.tsx`, `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`, `frontend/app/(candidate)/candidate/access/page.tsx`, `frontend/app/(recruiter)/recruiter/documents/page.tsx`, `frontend/app/(recruiter)/recruiter/candidates/page.tsx` |
| Composants concernes   | Titres de page, sous-titres, sections `Actions rapides`                                                                                                                                                                                                                                   |
| Changement attendu     | Remplacer les titres neutres par des titres document-first : `Votre dossier Jorg`, `Votre activite dossiers`, `Qui a acces a votre dossier`, `Dossiers & modeles`.                                                                                                                        |
| Impact utilisateur     | Jorg devient plus immediatement comprehensible et specifique.                                                                                                                                                                                                                             |
| Effort estime          | Faible                                                                                                                                                                                                                                                                                    |
| Risque technique       | Faible                                                                                                                                                                                                                                                                                    |
| Dependances            | PR 3 wording global.                                                                                                                                                                                                                                                                      |
| Criteres d'acceptation | Les titres des pages critiques mentionnent ou suggerent clairement dossier, acces, profil structure ou generation.                                                                                                                                                                        |

### 1.7 Verifier l'encodage visible

| Champ                  | Detail                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | Tous les fichiers UI contenant du texte francais                                                                                                    |
| Composants concernes   | Pages auth, dashboards, profil, dossiers, settings                                                                                                  |
| Changement attendu     | Verifier dans le navigateur que les accents ne s'affichent pas sous forme `Ã©`, `Ã¨`, `â€¦`. Corriger uniquement les textes visibles si necessaire. |
| Impact utilisateur     | Evite un signal de finition amateur tres fort.                                                                                                      |
| Effort estime          | Moyen                                                                                                                                               |
| Risque technique       | Faible                                                                                                                                              |
| Dependances            | Verification navigateur apres PR de wording.                                                                                                        |
| Criteres d'acceptation | Aucun caractere d'encodage casse visible dans les ecrans critiques.                                                                                 |

---

## 2. Refontes d'ecrans critiques avant alpha

Ces actions changent la structure UX des ecrans prioritaires, sans changer les routes ni la logique metier.

### 2.1 Refonte login

| Champ                  | Detail                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/(public)/login/page.tsx`                                                                                                                                                                                                                              |
| Composant concerne     | `LoginForm`                                                                                                                                                                                                                                                         |
| Changement attendu     | Remplacer le layout `wordmark + card Connexion` par un ecran document-first : formulaire clair + panneau de confiance. Nouveau titre : `Acceder a mon espace Jorg`. Sous-texte : `Retrouvez votre dossier, vos acces et les documents generes depuis votre profil.` |
| Impact utilisateur     | Premiere impression plus professionnelle, moins formulaire SaaS generique.                                                                                                                                                                                          |
| Effort estime          | Moyen                                                                                                                                                                                                                                                               |
| Risque technique       | Faible a moyen                                                                                                                                                                                                                                                      |
| Dependances            | PR 1 tokens/theme.                                                                                                                                                                                                                                                  |
| Criteres d'acceptation | Le login explique les trois piliers : profil structure, acces controle, dossiers generes ; un seul CTA principal ; aucun wording redondant.                                                                                                                         |

### 2.2 Refonte register

| Champ                  | Detail                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fichier concerne       | `frontend/app/(public)/register/page.tsx`                                                                                                                                                  |
| Composant concerne     | `RegisterForm`, role picker                                                                                                                                                                |
| Changement attendu     | Clarifier les deux parcours : candidat = `Je construis mon dossier de competences`, recruteur = `Je genere des dossiers candidats`. Rendre le code alpha recruteur explicite et rassurant. |
| Impact utilisateur     | Meilleure comprehension des roles ; moins d'impression formulaire alpha improvise.                                                                                                         |
| Effort estime          | Moyen                                                                                                                                                                                      |
| Risque technique       | Faible a moyen                                                                                                                                                                             |
| Dependances            | PR 1 tokens/theme, PR 5 login/register.                                                                                                                                                    |
| Criteres d'acceptation | Un utilisateur comprend la difference candidat/recruteur avant de remplir le formulaire ; le role picker ne ressemble pas a deux cards decoratives generiques.                             |

### 2.3 Refonte dashboard candidat

| Champ                  | Detail                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/(candidate)/candidate/dashboard/page.tsx`                                                                                                                                      |
| Composants concernes   | `CandidateDashboardPage`, `StatCard`, `QuickActionCard` usages                                                                                                                               |
| Changement attendu     | Remplacer le modele `4 KPI + Actions rapides` par une structure : `Votre dossier Jorg`, bloc `Etat du dossier`, bloc `A completer en priorite`, bloc `Qui a acces`, bloc `Dossiers recents`. |
| Impact utilisateur     | Le candidat voit ce qui rend son dossier exploitable et ce qui reste a completer.                                                                                                            |
| Effort estime          | Moyen                                                                                                                                                                                        |
| Risque technique       | Moyen                                                                                                                                                                                        |
| Dependances            | PR 1 tokens/theme, PR 3 wording, PR 4 empty states.                                                                                                                                          |
| Criteres d'acceptation | Les 4 KPI ne dominent plus l'ecran ; l'action principale est claire ; l'ecran relie profil, acces et dossiers generes.                                                                       |

### 2.4 Refonte dashboard recruteur

| Champ                  | Detail                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`                                                                                                              |
| Composants concernes   | `RecruiterDashboardPage`, `StatCard`, `QuickActionCard` usages                                                                                                       |
| Changement attendu     | Remplacer `Apercu de votre activite recrutement` et les KPI par un resume operationnel : candidats autorises, missions ouvertes, dossiers recents, prochaine action. |
| Impact utilisateur     | Le recruteur comprend que Jorg sert a transformer des profils autorises en dossiers clients.                                                                         |
| Effort estime          | Moyen                                                                                                                                                                |
| Risque technique       | Moyen                                                                                                                                                                |
| Dependances            | PR 1 tokens/theme, PR 2 navigation, PR 3 wording, PR 4 empty states.                                                                                                 |
| Criteres d'acceptation | Une action principale est visible ; les donnees affichent le flux candidat autorise -> mission -> dossier genere.                                                    |

### 2.5 Refonte page Dossiers & modeles

| Champ                  | Detail                                                                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/(recruiter)/recruiter/documents/page.tsx`                                                                                                                                                                                                                                               |
| Composants concernes   | `DocumentsPage`, `DocumentCard`, zone templates                                                                                                                                                                                                                                                       |
| Changement attendu     | Renommer l'ecran `Dossiers & modeles`. Presenter les modeles Jorg integres comme des objets produit : `Compact ESN`, `Dossier technique`, `Profil premium`, avec usage recommande et bouton apercu. Presenter l'upload personnalise comme indisponible alpha, sans formulaire disabled trop dominant. |
| Impact utilisateur     | Les modeles Jorg deviennent une partie centrale du produit, pas une liste technique.                                                                                                                                                                                                                  |
| Effort estime          | Moyen                                                                                                                                                                                                                                                                                                 |
| Risque technique       | Moyen                                                                                                                                                                                                                                                                                                 |
| Dependances            | PR 1 tokens/theme, PR 3 wording, PR 4 empty states.                                                                                                                                                                                                                                                   |
| Criteres d'acceptation | Les modeles Jorg sont visibles et comprehensibles ; le formulaire upload disabled ne donne pas une impression de fonctionnalite cassee.                                                                                                                                                               |

### 2.6 Refonte des dialogs de generation

| Champ                  | Detail                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | `frontend/components/candidate-generate-dossier-dialog.tsx`, `frontend/components/generate-dossier-dialog.tsx`                                                                                            |
| Composants concernes   | Dialogs de generation candidat et recruteur                                                                                                                                                               |
| Changement attendu     | Remplacer le simple select `Template` par une selection plus explicite de modele, idealement sous forme de liste/cards compactes avec description. Garder le format docx/pdf et les appels API existants. |
| Impact utilisateur     | Generer un dossier parait etre le coeur de Jorg, pas une operation technique.                                                                                                                             |
| Effort estime          | Moyen                                                                                                                                                                                                     |
| Risque technique       | Moyen                                                                                                                                                                                                     |
| Dependances            | PR 1 tokens/theme, PR 8 dossiers & modeles, descriptions disponibles via API.                                                                                                                             |
| Criteres d'acceptation | L'utilisateur comprend quel modele choisir ; le CTA dit clairement ce qui sera genere ; les payloads API restent identiques.                                                                              |

---

## 3. Ameliorations post-alpha

Ces actions sont utiles, mais ne doivent pas bloquer la publication alpha si les quick wins et ecrans critiques sont traites.

### 3.1 Refonte complete du profil candidat

| Champ                  | Detail                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | `frontend/app/(candidate)/candidate/profile/page.tsx`, `frontend/components/candidate/profile-sections.tsx`                               |
| Composants concernes   | `ProfileHero`, `ProfileTabs`, `ExperienceSection`, `SkillSection`, `EducationSection`, `CertificationSection`, `LanguageSection`          |
| Changement attendu     | Passer d'une logique CRUD visible a une logique construction de dossier : missions prouvees, competences utilisees, preuves, langues.     |
| Impact utilisateur     | Le candidat comprend mieux pourquoi il renseigne chaque section.                                                                          |
| Effort estime          | Eleve                                                                                                                                     |
| Risque technique       | Moyen a eleve                                                                                                                             |
| Dependances            | Refonte dashboard candidat et wording global.                                                                                             |
| Criteres d'acceptation | Les sections profil ne ressemblent plus a une succession de cards identiques ; chaque section explique sa contribution au dossier genere. |

### 3.2 Preview recruteur avancee

| Champ                  | Detail                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/(candidate)/candidate/profile/page.tsx`                                                                   |
| Composant concerne     | Dialog `Apercu recruteur`                                                                                               |
| Changement attendu     | Transformer l'apercu en vraie vue `ce qu'un recruteur verra`, sans modifier les permissions.                            |
| Impact utilisateur     | Renforce la confiance candidat et le sentiment de controle.                                                             |
| Effort estime          | Moyen                                                                                                                   |
| Risque technique       | Moyen                                                                                                                   |
| Dependances            | Stabilisation du profil candidat.                                                                                       |
| Criteres d'acceptation | Le candidat peut comprendre clairement quelles donnees alimentent les dossiers et lesquelles restent sous son controle. |

### 3.3 Historique enrichi des dossiers par organisation

| Champ                  | Detail                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/app/(candidate)/candidate/access/page.tsx`                                               |
| Composants concernes   | `DocCard`, cartes organisation                                                                     |
| Changement attendu     | Clarifier les dossiers generes par organisation : modele utilise, date, recruteur, telechargement. |
| Impact utilisateur     | Renforce la transparence et la confiance.                                                          |
| Effort estime          | Moyen                                                                                              |
| Risque technique       | Moyen                                                                                              |
| Dependances            | Donnees existantes suffisantes.                                                                    |
| Criteres d'acceptation | Un candidat peut repondre facilement a : qui a genere quoi, quand, avec quel modele.               |

### 3.4 Identite Jorg / wordmark

| Champ                  | Detail                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier concerne       | `frontend/components/ui/JorgWordmark.tsx`                                                                                                                                     |
| Composant concerne     | `JorgWordmark`                                                                                                                                                                |
| Changement attendu     | Decision de marque separee : pour alpha, preferer un wordmark typographique sobre plutot qu'un carre `J` placeholder. Reporter un symbole proprietaire complet si necessaire. |
| Impact utilisateur     | Moins d'impression de logo temporaire.                                                                                                                                        |
| Effort estime          | Faible a moyen                                                                                                                                                                |
| Risque technique       | Faible                                                                                                                                                                        |
| Dependances            | Decision marque.                                                                                                                                                              |
| Criteres d'acceptation | Le wordmark ne ressemble plus a un placeholder genere ; il reste sobre et lisible.                                                                                            |

### 3.5 Refonte mobile approfondie

| Champ                  | Detail                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers concernes     | Layouts candidat/recruteur, pages dashboard, candidats, profil                                                                          |
| Composants concernes   | `NavSidebar`, layouts app, pages metier                                                                                                 |
| Changement attendu     | Adapter sidebar en drawer ou navigation mobile compacte ; rendre les filtres recruteur repliables ; garder l'action principale visible. |
| Impact utilisateur     | Meilleure experience mobile.                                                                                                            |
| Effort estime          | Eleve                                                                                                                                   |
| Risque technique       | Moyen a eleve                                                                                                                           |
| Dependances            | Refonte desktop stabilisee.                                                                                                             |
| Criteres d'acceptation | Les ecrans critiques sont utilisables sans clipping ni navigation inaccessible sur mobile.                                              |

---

## 4. Decoupage en PR independantes

Chaque PR doit etre petite, testable et reversible. Elle ne doit pas melanger refonte visuelle, wording et logique metier.

Regle de granularite Git : faire un commit distinct pour chaque page utilisateur touchee. Si un composant partage est modifie pour servir plusieurs pages, le commiter separement ou avec la premiere page qui l'introduit clairement, puis garder les commits de pages isoles.

### PR 1 - Design tokens + theme

| Champ                         | Detail                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectif                      | Stabiliser light/dark/system et les tokens semantiques Jorg.                                                                                                                                                                    |
| Fichiers a inspecter avant PR | `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `dialog.tsx`, `select.tsx`, `frontend/components/nav-sidebar.tsx`, `frontend/components.json` |
| Changements attendus          | Tokens semantiques, violet encre primaire, warning separe, verification UI shared.                                                                                                                                              |
| Effort estime                 | Moyen                                                                                                                                                                                                                           |
| Risque technique              | Moyen                                                                                                                                                                                                                           |
| Dependances                   | Aucune.                                                                                                                                                                                                                         |
| Criteres d'acceptation        | Light/dark tokens presents ; pas de couleur metier hardcodee ajoutee ; Button/Card/Badge/Input/Dialog/Sidebar restent lisibles ; amber/orange reserve au warning.                                                               |

### PR 2 - Navigation + labels

| Champ                         | Detail                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectif                      | Rendre la navigation plus metier sans changer les routes.                                                                                                              |
| Fichiers a inspecter avant PR | `frontend/app/(candidate)/layout.tsx`, `frontend/app/(recruiter)/layout.tsx`, `frontend/components/nav-sidebar.tsx`, `frontend/components/landing/LandingUserMenu.tsx` |
| Changements attendus          | Labels candidat/recruteur, reduction icones decoratives, coherence active states.                                                                                      |
| Effort estime                 | Faible                                                                                                                                                                 |
| Risque technique              | Faible                                                                                                                                                                 |
| Dependances                   | PR 1 recommandee.                                                                                                                                                      |
| Criteres d'acceptation        | Routes inchangees ; navigation lisible ; labels renforcent acces controle, candidats autorises, dossiers et modeles.                                                   |

### PR 3 - Wording global

| Champ                         | Detail                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Objectif                      | Remplacer le wording generique par le langage produit Jorg.                                                                    |
| Fichiers a inspecter avant PR | Pages auth, dashboards, access, documents, candidates, opportunities, onboarding recruiter template, dialogs generation        |
| Changements attendus          | `Templates` -> `Modeles de dossier`, `Actions rapides` -> wording actionnable, titres document-first.                          |
| Effort estime                 | Moyen                                                                                                                          |
| Risque technique              | Faible                                                                                                                         |
| Dependances                   | PR 2 pour labels nav.                                                                                                          |
| Criteres d'acceptation        | Aucun wording utilisateur critique ne sonne technique/interne ; les piliers produit sont visibles dans les titres/sous-titres. |

### PR 4 - Empty states

| Champ                         | Detail                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectif                      | Transformer les etats vides en guidance produit.                                                                                                                                                                                                                                                                                    |
| Fichiers a inspecter avant PR | `frontend/components/ui/EmptyState.tsx`, `frontend/app/(candidate)/candidate/access/page.tsx`, `frontend/app/(recruiter)/recruiter/candidates/page.tsx`, `frontend/app/(recruiter)/recruiter/documents/page.tsx`, `frontend/app/(recruiter)/recruiter/opportunities/page.tsx`, `frontend/components/candidate/profile-sections.tsx` |
| Changements attendus          | Empty states avec titre, description, action quand utile, sans icone decorative par defaut.                                                                                                                                                                                                                                         |
| Effort estime                 | Moyen                                                                                                                                                                                                                                                                                                                               |
| Risque technique              | Faible a moyen                                                                                                                                                                                                                                                                                                                      |
| Dependances                   | PR 1 tokens, PR 3 wording.                                                                                                                                                                                                                                                                                                          |
| Criteres d'acceptation        | Chaque page vide critique explique la situation et la prochaine action ; aucun message `Aucun...` isole sur les ecrans prioritaires.                                                                                                                                                                                                |

### PR 5 - Login / register

| Champ                         | Detail                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectif                      | Ameliorer la premiere impression et clarifier les roles.                                                                                                                                                                           |
| Fichiers a inspecter avant PR | `frontend/app/(public)/login/page.tsx`, `frontend/app/(public)/register/page.tsx`, `frontend/app/(public)/forgot-password/page.tsx`, `reset-password/page.tsx`, `verify-email/page.tsx`, `frontend/components/ui/JorgWordmark.tsx` |
| Changements attendus          | Layout document-first, panneau de confiance, role picker plus explicite, CTA unique par ecran.                                                                                                                                     |
| Effort estime                 | Moyen                                                                                                                                                                                                                              |
| Risque technique              | Moyen                                                                                                                                                                                                                              |
| Dependances                   | PR 1 tokens, PR 3 wording.                                                                                                                                                                                                         |
| Criteres d'acceptation        | Login/register expliquent profil structure, acces controle, dossiers generes ; logique auth inchangee ; params `role` inchanges ; un seul CTA principal.                                                                           |

### PR 6 - Dashboard candidat

| Champ                         | Detail                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectif                      | Remplacer le dashboard generique par un accueil centre sur le dossier.                                                                                                                                              |
| Fichiers a inspecter avant PR | `frontend/app/(candidate)/candidate/dashboard/page.tsx`, `frontend/components/ui/StatCard.tsx`, `frontend/components/ui/QuickActionCard.tsx`, `frontend/components/notification-bell.tsx`, `frontend/lib/labels.ts` |
| Changements attendus          | Bloc `Votre dossier Jorg`, sections a completer, acces, dossiers recents, action principale claire.                                                                                                                 |
| Effort estime                 | Moyen                                                                                                                                                                                                               |
| Risque technique              | Moyen                                                                                                                                                                                                               |
| Dependances                   | PR 1, PR 3, PR 4.                                                                                                                                                                                                   |
| Criteres d'acceptation        | Les KPI ne dominent plus ; l'ecran connecte profil structure, acces controle et dossiers generes ; donnees/API existantes uniquement.                                                                               |

### PR 7 - Dashboard recruteur

| Champ                         | Detail                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectif                      | Centrer l'accueil recruteur sur le flux candidat autorise -> dossier genere.                                                                                                                                                    |
| Fichiers a inspecter avant PR | `frontend/app/(recruiter)/recruiter/dashboard/page.tsx`, `frontend/components/ui/StatCard.tsx`, `frontend/components/ui/QuickActionCard.tsx`, `frontend/components/onboarding-org.tsx`, `frontend/lib/hooks/useRecruiterOrg.ts` |
| Changements attendus          | Resume operationnel, prochaine action, dossiers recents, missions ouvertes, candidats autorises.                                                                                                                                |
| Effort estime                 | Moyen                                                                                                                                                                                                                           |
| Risque technique              | Moyen                                                                                                                                                                                                                           |
| Dependances                   | PR 1, PR 2, PR 3, PR 4.                                                                                                                                                                                                         |
| Criteres d'acceptation        | Le recruteur comprend quoi faire ensuite ; l'ecran valorise dossiers generes et candidats autorises ; aucune route/API modifiee.                                                                                                |

### PR 8 - Dossiers & modeles

| Champ                         | Detail                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Objectif                      | Faire des modeles Jorg une fonctionnalite produit centrale.                                                                                                                                                        |
| Fichiers a inspecter avant PR | `frontend/app/(recruiter)/recruiter/documents/page.tsx`, `frontend/components/ui/TabBar.tsx`, `frontend/components/ui/Badge.tsx` ou `badge.tsx`, `frontend/types/api.ts`, `docs/spec-builtin-dossier-templates.md` |
| Changements attendus          | Page `Dossiers & modeles`, cards de modeles Jorg, upload personnalise alpha presente proprement, documents generes plus lisibles.                                                                                  |
| Effort estime                 | Moyen                                                                                                                                                                                                              |
| Risque technique              | Moyen                                                                                                                                                                                                              |
| Dependances                   | PR 1, PR 3, PR 4.                                                                                                                                                                                                  |
| Criteres d'acceptation        | Les modeles integres sont visibles, differencies et relies aux usages recruteur ; upload disabled ne semble pas casse ; API inchangee.                                                                             |

### PR 9 - Dialogs generation

| Champ                         | Detail                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectif                      | Rendre la generation de dossier claire et proprietaire.                                                                                                                                                           |
| Fichiers a inspecter avant PR | `frontend/components/candidate-generate-dossier-dialog.tsx`, `frontend/components/generate-dossier-dialog.tsx`, `frontend/components/ui/dialog.tsx`, `frontend/components/ui/select.tsx`, `frontend/types/api.ts` |
| Changements attendus          | Selection explicite de modele de dossier, descriptions visibles, CTA clair, format docx/pdf conserve.                                                                                                             |
| Effort estime                 | Moyen                                                                                                                                                                                                             |
| Risque technique              | Moyen                                                                                                                                                                                                             |
| Dependances                   | PR 1, PR 3, PR 8.                                                                                                                                                                                                 |
| Criteres d'acceptation        | L'utilisateur comprend quel modele choisir ; payloads `system_template_key`, `template_id`, `format` inchanges ; generation et telechargement fonctionnent comme avant.                                           |

---

## 5. Composants partages a creer ou adapter

### A adapter

- `NavSidebar` : labels, densite, icones, tokens.
- `EmptyState` : titre, description, action, variantes.
- `StatCard` : usage a reduire ou transformer.
- `QuickActionCard` : usage a remplacer par blocs d'action plus hierarchises.
- `Button` : coherence primary / outline / ghost / destructive, light/dark.
- `Card` : limiter l'usage aux objets metier.
- `Badge` : statuts semantiques `success`, `warning`, `danger`, `primary-soft`.
- `Input` : focus, disabled, light/dark.
- `Dialog` : surfaces documentaires, hierarchy titres/actions.
- `TabBar` : conserver mais reduire l'effet generique si necessaire.

### A creer si utile

- `NextActionPanel` : bloc principal d'action par dashboard.
- `DocumentModelCard` : representation d'un modele de dossier Jorg.
- `TrustPanel` : panneau lateral auth, reutilisable login/register.
- `SectionHeader` : titre + description + action principale, pour eviter les cards inutiles.

Ces nouveaux composants ne doivent contenir aucune logique metier lourde. Ils doivent recevoir les donnees deja disponibles en props.

---

## 6. Criteres d'acceptation globaux

La refonte alpha est acceptable si :

- un utilisateur comprend en moins de 5 secondes que Jorg sert a structurer un profil, controler les acces et generer des dossiers ;
- login/register ne ressemblent plus a un formulaire SaaS generique ;
- la navigation utilise un vocabulaire metier clair ;
- les dashboards ne sont plus domines par `4 KPI + actions rapides` ;
- les modeles Jorg sont presentes comme une fonctionnalite produit centrale ;
- les empty states indiquent une prochaine action utile ;
- les cards ne sont pas utilisees comme layout par defaut ;
- le violet encre est utilise comme signature sobre, sans gradient ni glow ;
- amber/orange est reserve aux etats warning/attention ;
- aucun contrat API, route ou modele de donnees n'est modifie ;
- les parcours existants restent fonctionnels pour candidat et recruteur ;
- aucun texte visible critique ne presente de probleme d'encodage.

---

## 7. Hors scope avant alpha

Ne pas inclure dans la refonte alpha obligatoire :

- refonte complete de l'identite de marque ;
- creation d'un logo proprietaire complexe ;
- animations ou illustrations avancees ;
- mode preview recruteur complet ;
- refonte profonde mobile ;
- changement des workflows API ;
- modification du modele de donnees ;
- changement des routes existantes ;
- changement cosmetique isole sans lien avec profil structure, acces controle, dossier genere ou confiance.
