# Evolutions produit - Accueil candidat

## Objectif

Faire du bloc `A faire maintenant` une vraie recommandation contextuelle :
l'utilisateur doit comprendre l'action la plus utile selon son etat courant.

## Scenarios cibles

### Nouveau candidat

Titre : `Importez votre CV`

Texte : `Jorg peut analyser votre CV et pre-remplir votre profil structure. Vous pourrez ensuite verifier les informations avant validation.`

CTA : `Importer mon CV`

Statut : fonctionnalite future, a ne pas afficher comme bouton actif tant que l'import CV n'est pas implemente.

### CV importe mais non valide

Titre : `Verifiez les informations extraites`

Texte : `Nous avons detecte 4 experiences, 28 competences et 2 formations. Validez les elements avant de rendre votre profil exploitable.`

CTA : `Verifier l'extraction`

Statut : depend de l'existence d'un etat d'extraction et d'un parcours de validation.

### Profil complet

Titre : `Previsualisez votre dossier`

Texte : `Votre profil est complet. Verifiez comment vos informations peuvent etre presentees dans un dossier genere.`

CTA : `Previsualiser mon dossier`

Statut : peut etre rapproche du parcours de generation/preview de dossier.

### Acces actifs

Titre : `Gardez le controle sur vos acces`

Texte : `2 organisations peuvent consulter votre profil et generer des documents. Vous pouvez revoquer un acces a tout moment.`

CTA : `Gerer les acces`

Statut : action deja realisable via la page acces.

### Offre a preparer

Titre : `Preparez une candidature`

Texte : `Collez une offre ou une mission pour identifier les experiences et competences a mettre en avant.`

CTA : `Analyser une offre`

Statut : fonctionnalite future, a cadrer separement avant affichage actif.

## Regle UX

Ne pas afficher de CTA actif vers une fonctionnalite non implementee.

Pour l'alpha, conserver en priorite les actions disponibles :

- repondre aux invitations ;
- completer le profil ;
- gerer les acces ;
- previsualiser ou generer un dossier si le parcours est pret.

Les actions futures comme `Importer mon CV` et `Analyser une offre` peuvent etre notees en ressource produit, mais ne doivent pas concurrencer l'action principale avant implementation.
