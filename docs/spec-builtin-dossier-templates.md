# Spec - Templates de dossier integres

## Objectif

Permettre aux candidats et recruteurs de generer un dossier Word/PDF a partir de trois templates Jorg integres :

- Compact ESN
- Dossier technique
- Profil premium

Les templates doivent etre compatibles avec la syntaxe `docxtpl/Jinja2` actuelle et disponibles sans upload utilisateur.

## Parcours cible

### Candidat

- Depuis la page profil / mon dossier, un bouton permet d'ouvrir un choix de template.
- Le candidat peut telecharger un apercu rempli avec des donnees mockup.
- Le candidat peut generer son propre dossier depuis son profil.
- Les templates candidats sont uniquement les templates integres Jorg.

### Recruteur

- Les ecrans de generation existants proposent les templates integres en plus des templates d'organisation valides.
- La page `Dossiers > Templates` affiche les templates Jorg.
- L'upload de template personnel est grise en alpha avec une explication claire.
- Le recruteur peut telecharger un apercu mockup de chaque template Jorg.

## Backend

- Ajouter un catalogue statique de templates systeme avec `key`, `name`, `description`, `word_file_path`.
- Ajouter une route de listing accessible aux candidats et recruteurs.
- Ajouter une route d'apercu mockup par template systeme.
- Etendre la generation recruteur pour accepter soit `template_id`, soit `system_template_key`.
- Ajouter une generation candidat `POST /candidates/me/generate` limitee aux templates systeme.
- Conserver l'historique des documents generes, y compris les documents sans access grant recruteur.

## Donnees

- Les trois `.docx` sont copies dans `backend/static/builtin_templates/`.
- Les vieux alias de template sont nettoyes :
  - `exp.technologies` est remplace par une boucle `skills_tool` ou une section neutre.
  - `sk.category` devient `sk.kind`.
  - `sk.years_of_experience` est retire.

## Auto-review

- Risque : casser les templates recruteurs existants.
  - Mitigation : garder `template_id` et le flux DB inchanges, ajouter `system_template_key` en option.
- Risque : rendre les documents candidats invisibles dans l'historique.
  - Mitigation : rendre `access_grant_id` nullable et adapter les listes avec `outerjoin`.
- Risque : promettre l'upload custom alors qu'il n'est pas alpha-ready.
  - Mitigation : UI disabled + message explicite.
- Risque : apercu mock trop vague.
  - Mitigation : mock profile complet, nom publicitaire discret, experiences et skills realistes.
