# Modèle de confiance du Dossier L3

Statut : accepté (2026-06-21)

Le Dossier (L3) est le livrable de présentation par lequel un recruteur présente un candidat à un client.
Son modèle de confiance, qui contraint le schéma autant que l'UX :

- **Consentement grant-level.** Le candidat accorde l'accès à son profil à l'ESN une fois
  (`AccessGrant` + enveloppe d'exclusions opposables), pas dossier par dossier. Le recruteur compose et
  envoie de façon autonome à l'intérieur de l'enveloppe.
- **Le recruteur arrange, il ne réécrit pas les faits.** Il sélectionne, ordonne, masque, et rédige une
  accroche (texte de cadrage natif L3, sans équivalent L2). Il ne réécrit pas les libellés de mission ni
  le texte des réalisations, qui sont des faits validés par le candidat en L2. L'override de présentation
  par-item (`display_text` veto-gated) est différé, additif si un cas réel l'exige.
- **Validation par dossier optionnelle**, à l'initiative du recruteur : un outil de réassurance pour
  vérifier l'exactitude avant envoi, pas le mécanisme de consentement ni un gate obligatoire.
- **Protection candidat par défaut : visibilité post-hoc + veto.** Le candidat voit le corpus de
  `GeneratedDossierSnapshot` produit à son sujet, et peut bloquer les envois futurs (veto promouvable en
  exclusion opposable). Le veto ne défait pas ce qui est déjà parti : le snapshot reste, preuve d'un
  envoi légitime sous les règles d'alors.
- **Composition LLM L3b différée.** En V1 la composition est manuelle (sélection / ordre / masquage /
  accroche) ; l'assistant LLM est un upgrade ultérieur, comme l'inférence CV (voir ADR-0001).

Pourquoi : la confiance candidat est la fondation du produit (un candidat ne rejoint pas un outil qui
envoie son profil à des clients sans cadre), et il faut maîtriser le risque juridique et commercial, sans
imposer la latence d'une validation obligatoire par dossier.
