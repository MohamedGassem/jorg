# Syntaxe des templates Word (docxtpl / Jinja2)

Le moteur de génération de DC utilise [docxtpl](https://docxtpl.readthedocs.io/),
une extension de python-docx basée sur Jinja2. Les templates sont des fichiers `.docx`
normaux édités dans Word, avec des balises Jinja2 intégrées dans le texte.

---

## Champs simples

Syntaxe : `{{nom_du_champ}}`

Les champs disponibles correspondent directement aux données du profil candidat.

### Champs profil

| Balise                       | Contenu                                      |
| ---------------------------- | -------------------------------------------- |
| `{{first_name}}`             | Prénom                                       |
| `{{last_name}}`              | Nom                                          |
| `{{title}}`                  | Titre / intitulé de poste                    |
| `{{summary}}`                | Résumé / pitch                               |
| `{{phone}}`                  | Téléphone                                    |
| `{{email_contact}}`          | Email de contact                             |
| `{{linkedin_url}}`           | URL LinkedIn                                 |
| `{{location}}`               | Localisation                                 |
| `{{years_of_experience}}`    | Années d'expérience (entier)                 |
| `{{daily_rate}}`             | TJM en € (entier)                            |
| `{{annual_salary}}`          | Salaire annuel en € (entier)                 |
| `{{availability_status}}`    | Statut de disponibilité                      |
| `{{availability_label}}`     | Libellé lisible de disponibilité             |
| `{{availability_date}}`      | Date de disponibilité (MM/AAAA)              |
| `{{work_mode}}`              | Mode de travail (remote, hybrid, onsite)     |
| `{{work_mode_label}}`        | Libellé lisible du mode de travail           |
| `{{location_preference}}`    | Préférence géographique                      |
| `{{mission_duration}}`       | Durée de mission souhaitée                   |
| `{{mission_duration_label}}` | Libellé lisible de durée souhaitée           |
| `{{contract_type}}`          | Type de contrat (freelance, CDI…)            |
| `{{contract_type_label}}`    | Libellé lisible du type de contrat           |
| `{{preferred_domains}}`      | Domaines préférés (liste jointe par virgule) |

**Exemple dans le template :**

```
{{first_name}} {{last_name}}
{{title}}
Disponibilité : {{availability_status}}
TJM : {{daily_rate}} €
```

---

## Blocs répétés — paragraphes

Pour répéter du contenu pour chaque expérience ou compétence **en paragraphes libres**,
utilisez les balises de bloc de paragraphe : `{%p for … %}` et `{%p endfor %}`.

Chaque balise doit être **seule dans son propre paragraphe Word**.

### Bloc expériences

```
{%p for exp in experiences %}
{{exp.role}} chez {{exp.client_name}}
Du {{exp.start_date}} au {{exp.end_date}}
{{exp.description}}
{%p endfor %}
```

#### Champs disponibles dans la boucle `exp`

| Balise                                          | Contenu                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `{{exp.client_name}}`                           | Nom du client                                                                                               |
| `{{exp.role}}`                                  | Intitulé du poste                                                                                           |
| `{{exp.start_date}}`                            | Date de début (MM/AAAA)                                                                                     |
| `{{exp.end_date}}`                              | Date de fin (MM/AAAA) ou `présent` si mission en cours                                                      |
| `{{exp.description}}`                           | Description de la mission                                                                                   |
| `{{exp.context}}`                               | Contexte                                                                                                    |
| `{{exp.achievements}}`                          | Réalisations / résultats (alias de `achievements_summary`)                                                  |
| `{{exp.achievements_summary}}`                  | Réalisations / résultats                                                                                    |
| `exp.achievement_items`                         | Liste de réalisations détaillées : `description`, `impact`, `skills`                                        |
| `exp.skills` / `exp.skill_usages`               | Liste des compétences explicitement associées à cette expérience                                            |
| `exp.skills_tool`, `exp.skills_technical`, etc. | Compétences de cette expérience filtrées par type                                                           |
| ~~`{{exp.technologies}}`~~                      | **Supprimé** — renvoie toujours une chaîne vide. Remplacer par les skills de type `tool` via `skills_tool`. |

### Bloc compétences

```
{%p for sk in skills_technical %}
{{sk.name}} — {{sk.kind}} — Niveau : {{sk.level}}
{%p endfor %}
```

> **Variables disponibles :** `skills` (toutes), `skills_technical`, `skills_tool`, `skills_functional`, `skills_methodology`, `skills_sectoral`, `skills_soft`, `skills_featured`.

#### Champs disponibles dans la boucle `sk`

| Balise                           | Contenu                                             |
| -------------------------------- | --------------------------------------------------- |
| `{{sk.name}}`                    | Nom de la compétence                                |
| `{{sk.kind}}`                    | Type brut (`technical`, `tool`, `functional`, etc.) |
| `{{sk.kind_label}}`              | Libellé lisible du type                             |
| `{{sk.level}}`                   | Niveau auto-évalué (texte)                          |
| `{{sk.self_assessed_level}}`     | Alias de `level`                                    |
| `{{sk.featured}}`                | `"true"` ou `"false"`                               |
| `{{sk.featured_label}}`          | `Clé` si la compétence est mise en avant            |
| ~~`{{sk.category}}`~~            | **Supprimé** — renvoie `kind` pour compatibilité    |
| ~~`{{sk.level_rating}}`~~        | **Supprimé** — renvoie toujours une chaîne vide     |
| ~~`{{sk.years_of_experience}}`~~ | **Supprimé** — renvoie toujours une chaîne vide     |

---

## Formation, certifications et langues

Les sections suivantes sont disponibles en listes dédiées. Utilisez des blocs
conditionnels pour ne pas afficher une section vide dans un dossier final.

```
{%p if educations %}
Formation
{%p for edu in educations %}
{{edu.degree}} {{edu.field_of_study}} - {{edu.school}}{% if edu.period %} ({{edu.period}}){% endif %}
{%p endfor %}
{%p endif %}

{%p if certifications %}
Certifications
{%p for cert in certifications %}
{{cert.name}} - {{cert.issuer}}{% if cert.issue_date %} ({{cert.issue_date}}){% endif %}
{%p endfor %}
{%p endif %}

{%p if languages %}
Langues
{%p for lang in languages %}
{{lang.name}} - {{lang.level}} {{lang.level_label}}
{%p endfor %}
{%p endif %}
```

`educations` et `education` contiennent les mêmes données. Les champs principaux
sont `school`, `degree`, `field_of_study`, `start_date`, `end_date`, `period`,
`description`; pour les certifications : `name`, `issuer`, `issue_date`,
`expiry_date`, `period`, `credential_url`; pour les langues : `name`, `level`,
`level_label`.

---

## Blocs répétés — lignes de tableau

Pour générer **une ligne de tableau par expérience ou compétence**, utilisez les
balises de ligne `{%tr for … %}` et `{%tr endfor %}`.

La balise `{%tr for … %}` doit être placée dans une cellule d'une ligne dédiée
(la ligne entière devient le marqueur d'ouverture). Idem pour `{%tr endfor %}`.
Les lignes **entre** les deux marqueurs sont clonées une fois par élément.

### Exemple — tableau des expériences

Dans Word, créer un tableau avec 3 lignes :

| Ligne | Cellule 1                        | Cellule 2      | Cellule 3                               |
| ----- | -------------------------------- | -------------- | --------------------------------------- |
| 1     | `{%tr for exp in experiences %}` | _(vide)_       | _(vide)_                                |
| 2     | `{{exp.client_name}}`            | `{{exp.role}}` | `{{exp.start_date}} – {{exp.end_date}}` |
| 3     | `{%tr endfor %}`                 | _(vide)_       | _(vide)_                                |

Résultat : la ligne 1 et la ligne 3 disparaissent, la ligne 2 est dupliquée
autant de fois qu'il y a d'expériences.

### Exemple — grille de compétences

| Ligne | Cellule 1                  | Cellule 2         | Cellule 3      |
| ----- | -------------------------- | ----------------- | -------------- |
| 1     | `{%tr for sk in skills %}` |                   |                |
| 2     | `{{sk.name}}`              | `{{sk.category}}` | `{{sk.level}}` |
| 3     | `{%tr endfor %}`           |                   |                |

---

## Conditions

```
{%p if annual_salary %}
Salaire annuel : {{annual_salary}} €
{%p endif %}
```

La balise `{%p if … %}` et `{%p endif %}` doivent chacune être dans un paragraphe dédié.
La condition peut porter sur n'importe quelle variable du contexte (valeur vide = falsy).

---

## Valeurs manquantes

Les variables non définies ou dont la valeur est `None` / vide sont rendues
comme **chaîne vide** — aucune erreur n'est levée. Un champ manquant n'interrompt
pas la génération.

---

## Migration depuis l'ancienne syntaxe (avant mai 2026)

| Ancienne syntaxe                    | Nouvelle syntaxe                              |
| ----------------------------------- | --------------------------------------------- |
| `{{NOM}}` (via mappings)            | `{{last_name}}` (nom de champ direct)         |
| `{{#EXPERIENCES}}…{{/EXPERIENCES}}` | `{%p for exp in experiences %}…{%p endfor %}` |
| `{{#SKILLS}}…{{/SKILLS}}`           | `{%p for sk in skills %}…{%p endfor %}`       |
| `{{EXP_CLIENT}}` (via mappings)     | `{{exp.client_name}}`                         |
| `{{SKILL_NAME}}` (via mappings)     | `{{sk.name}}`                                 |

Les templates créés avant mai 2026 avec l'ancienne syntaxe ne sont pas compatibles
et doivent être recréés ou migrés manuellement.

---

## Conseils de mise en forme

- **Conserver le formatage** : lorsqu'un placeholder `{{first_name}}` est mis en
  gras dans Word, la valeur remplacée sera également en gras.
- **Fragmentation de runs** : Word peut parfois fragmenter un placeholder en plusieurs
  morceaux lors de l'édition (ex : `{{` dans un run, `first_name}}` dans un autre).
  docxtpl gère ce cas nativement — les placeholders fonctionnent même fragmentés.
- **Tester un template** : utiliser la route API `POST /api/generation/preview` ou
  générer un document de test depuis l'interface.
