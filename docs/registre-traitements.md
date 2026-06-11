# Registre des activités de traitement — Jorg

Registre tenu au titre de l'article 30 du RGPD. Ce document peut être demandé
par la CNIL.

- **Responsable du traitement :** Mohamed Gassem — contact@mohamed-gassem.fr
- **Statut :** projet personnel (particulier), alpha privée
- **Dernière mise à jour :** 2026-06-11
- **Version des mentions d'information :** 2026-06 (cf. `CURRENT_CONSENT_VERSION`)

## Sous-traitants et hébergement

| Sous-traitant       | Rôle                                                             | Localisation                               | Transfert hors UE                                                                                          |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Railway Corporation | Hébergement applicatif et base de données                        | États-Unis                                 | Oui — encadré par des garanties appropriées (clauses contractuelles types à confirmer dans le DPA Railway) |
| Google / LinkedIn   | Authentification OAuth (si l'utilisateur la choisit)             | États-Unis                                 | Oui — limité à l'identification au login                                                                   |
| Fournisseur SMTP    | Envoi d'e-mails transactionnels (vérification, réinitialisation) | À confirmer selon le fournisseur configuré | À confirmer                                                                                                |

> À confirmer par le responsable : signature/activation du DPA Railway et du
> fournisseur SMTP retenu en production. Aucun fournisseur d'IA externe n'est
> actuellement câblé (le client d'extraction CV est désactivé par défaut).

## Mesures de sécurité transverses

- Mots de passe stockés sous forme de hash (jamais en clair).
- Authentification par jetons JWT à durée de vie courte + refresh tokens.
- Accès aux dossiers candidats conditionné à un consentement explicite
  (`AccessGrant`), révocable, avec historique conservé.
- Suppression de compte : anonymisation des accès et expiration des invitations
  en cours.

---

## Fiche 1 — Comptes et authentification

- **Finalité :** créer et gérer les comptes utilisateurs, authentifier les
  accès, sécuriser les sessions.
- **Base légale :** exécution du service (mesures précontractuelles /
  contractuelles) + consentement horodaté à l'inscription.
- **Personnes concernées :** candidats et recruteurs.
- **Catégories de données :** e-mail, mot de passe haché, identifiant OAuth
  éventuel, rôle, statut de vérification, horodatage et version du
  consentement.
- **Destinataires :** responsable du traitement, hébergeur.
- **Durée de conservation :** jusqu'à la suppression du compte.
- **Tables :** `users`, `refresh_tokens`, `oauth_states`.

## Fiche 2 — Dossiers candidats

- **Finalité :** permettre au candidat de construire et maintenir son dossier
  professionnel.
- **Base légale :** consentement de la personne concernée.
- **Personnes concernées :** candidats.
- **Catégories de données :** identité (prénom, nom), expériences, compétences,
  formations, certifications, langues, disponibilité.
- **Destinataires :** le candidat lui-même ; les recruteurs uniquement via un
  accès explicitement accordé.
- **Durée de conservation :** jusqu'à la suppression du compte.
- **Tables :** `candidate_profiles`, `experiences`, `candidate_skills`,
  `education`, `certifications`, `languages`.

## Fiche 3 — Invitations et accès recruteurs

- **Finalité :** gérer les invitations de recruteurs et tracer les accès aux
  dossiers candidats.
- **Base légale :** consentement du candidat (octroi d'accès) + intérêt
  légitime du recruteur (relation de recrutement).
- **Personnes concernées :** candidats, recruteurs.
- **Catégories de données :** e-mail invité, statut, organisation, horodatages
  d'octroi et de révocation.
- **Destinataires :** candidat concerné, recruteur, organisation.
- **Durée de conservation :** historique des accès (y compris révoqués) conservé
  pour la traçabilité ; les accès sont anonymisés (`candidate_id = NULL`) à la
  suppression du compte candidat.
- **Tables :** `invitations`, `access_grants`.

## Fiche 4 — Génération de documents

- **Finalité :** générer des documents (ex. dossiers de compétences) à partir
  des données candidat et des modèles recruteurs.
- **Base légale :** consentement du candidat (via l'accès accordé).
- **Personnes concernées :** candidats.
- **Catégories de données :** contenu du dossier candidat mis en forme dans le
  document généré.
- **Destinataires :** recruteur titulaire de l'accès.
- **Durée de conservation :** rattachés à l'accès ; conservés après suppression
  du compte mais dissociés de l'identité candidat (accès anonymisé).
- **Tables :** `generated_documents`.

## Fiche 5 — Extraction de CV (si activée)

- **Finalité :** pré-remplir le dossier candidat à partir d'un CV importé.
- **Base légale :** consentement du candidat (action volontaire d'import).
- **Personnes concernées :** candidats.
- **Catégories de données :** contenu du CV importé et propositions
  d'extraction structurées.
- **Destinataires :** le candidat lui-même.
- **Durée de conservation :** le temps de la validation de la proposition.
- **Tables :** `cv_extraction_proposals`.
- **Note :** l'extraction par IA externe n'est pas active par défaut. Si un
  fournisseur LLM est branché ultérieurement, l'ajouter à la liste des
  sous-traitants et mettre à jour les mentions d'information.
