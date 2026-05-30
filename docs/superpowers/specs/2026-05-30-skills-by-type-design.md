# Skills par type — Design

**Date :** 2026-05-30
**Statut :** Validé, prêt pour implémentation

## Contexte & objectif

Les compétences dans Jorg suivent la classification ESCO (technical, functional, sectoral, methodology, tool + soft ajouté). Aujourd'hui, les skills sont affichées à plat côté candidat, et le moteur de génération n'expose qu'une seule variable `skills` sans groupement par type.

L'objectif est de rendre le type ESCO utile sur les deux surfaces :

1. **UI candidat** : navigation et saisie structurées par type, avec mise en avant des compétences clés cross-types
2. **Dossier généré** : variables pré-groupées par type que le recruteur peut exploiter dans son template Word

## Décisions de design

### Custom skills toujours privées

Les skills ESCO-ancrées (`is_custom=false`) sont partagées entre tous les candidats. Les skills custom (`is_custom=true`) sont privées : elles appartiennent au candidat qui les a créées et ne sont pas visibles ni réutilisables par d'autres.

Implémentation : ajout d'un champ `creator_candidate_id` (UUID nullable) sur `SkillReference`. NULL = skill ESCO partagée. Non-null = skill custom privée.

### Type modifiable uniquement sur skills custom

Le type (`kind`) d'une skill ESCO-ancrée est verrouillé — c'est la classification canonique ESCO. Le type d'une skill custom est modifiable après création par son propriétaire. L'API retourne `400` si un candidat tente de modifier le `kind` d'une skill ESCO.

---

## Modèle de données

### Changement : `SkillReference`

Ajout d'une colonne :

```python
creator_candidate_id: Mapped[UUID | None] = mapped_column(
    ForeignKey("candidate_profiles.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
)
```

Aucun autre changement sur les modèles existants. `CandidateSkill.featured` et `SkillReference.kind` sont déjà en place.

### Migration Alembic

```python
op.add_column(
    "skill_references",
    sa.Column("creator_candidate_id", sa.Uuid(), nullable=True),
)
op.create_foreign_key(
    "fk_skill_references_creator",
    "skill_references", "candidate_profiles",
    ["creator_candidate_id"], ["id"],
    ondelete="SET NULL",
)
op.create_index("ix_skill_references_creator", "skill_references", ["creator_candidate_id"])
```

---

## UI candidat

### Structure de la page `/candidate/skills`

**Bloc "Compétences clés"** (en haut, masqué si 0 featured)

- Affiche jusqu'à 6 skills avec `featured=true`, toutes catégories confondues
- Badge étoile ou couleur distinctive
- Toggle featured accessible directement depuis ce bloc

**Sections par type** (en dessous)

Ordre d'affichage fixe :

1. Technical
2. Tool
3. Functional
4. Methodology
5. Sectoral
6. Soft

Règles :

- Une section s'affiche uniquement si elle contient ≥1 compétence
- Dans chaque section, les skills avec `featured=true` remontent en tête avec un marqueur visuel subtil
- L'ajout d'une skill passe par un autocomplete vers `SkillReference` (ESCO + custom privées du candidat)

### Édition du type (skills custom uniquement)

Dans la fiche d'édition d'une skill custom, le champ `kind` est un select modifiable. Pour une skill ESCO, le champ affiche le type avec un label "Classification ESCO" et est en lecture seule.

---

## API backend

### `skill_reference_service.search()`

Filtre étendu :

```python
stmt = (
    select(SkillReference)
    .where(SkillReference.name.ilike(f"%{query}%"))
    .where(
        (SkillReference.creator_candidate_id == None) |
        (SkillReference.creator_candidate_id == candidate_id)
    )
)
```

### `skill_reference_service.get_or_create_by_name()`

Ajout du paramètre `creator_candidate_id` :

```python
async def get_or_create_by_name(
    name: str,
    kind: SkillKind,
    creator_candidate_id: UUID,
    db: AsyncSession,
) -> SkillReference:
    slug = slugify(name)
    result = await db.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id == creator_candidate_id,
        )
    )
    ref = result.scalar_one_or_none()
    if ref is None:
        ref = SkillReference(
            name=name,
            slug=slug,
            kind=kind,
            is_custom=True,
            source="manual",
            aliases=[],
            creator_candidate_id=creator_candidate_id,
        )
        db.add(ref)
        await db.commit()
        await db.refresh(ref)
    return ref
```

### `PUT /candidates/me/skills/{skill_id}`

Extension de `CandidateSkillUpdate` :

```python
class CandidateSkillUpdate(BaseModel):
    self_assessed_level: str | None = None
    featured: bool | None = None
    notes: str | None = None
    kind: SkillKind | None = None  # nouveau — ignoré si skill ESCO
```

Logique dans le handler :

```python
if data.kind is not None:
    if not skill.skill_ref.is_custom:
        raise HTTPException(400, "Cannot change kind of an ESCO skill")
    skill.skill_ref.kind = data.kind
    await db.commit()
```

---

## Moteur de génération

### Variables exposées au template

`generation_service.py` construit le contexte du template avec les variables suivantes :

| Variable             | Contenu                                               |
| -------------------- | ----------------------------------------------------- |
| `skills`             | Toutes les skills (backward compat — inchangé)        |
| `skills_featured`    | Skills avec `featured=true`, triées par ordre d'ajout |
| `skills_technical`   | Skills avec `kind="technical"`                        |
| `skills_tool`        | Skills avec `kind="tool"`                             |
| `skills_functional`  | Skills avec `kind="functional"`                       |
| `skills_methodology` | Skills avec `kind="methodology"`                      |
| `skills_sectoral`    | Skills avec `kind="sectoral"`                         |
| `skills_soft`        | Skills avec `kind="soft"`                             |

Dans chaque liste par type, les skills `featured=true` remontent en tête.

### Implémentation dans `generation_service.py`

```python
def _group_skills_by_kind(skills: list[CandidateSkill]) -> dict[str, list[CandidateSkill]]:
    def sort_key(s: CandidateSkill) -> int:
        return 0 if s.featured else 1

    by_kind: dict[str, list[CandidateSkill]] = {}
    for kind in SkillKind:
        filtered = [s for s in skills if s.skill_ref.kind == kind]
        by_kind[f"skills_{kind.value}"] = sorted(filtered, key=sort_key)

    featured = [s for s in skills if s.featured]
    by_kind["skills_featured"] = sorted(featured, key=lambda s: s.created_at)
    return by_kind

# Dans le contexte du template :
context = {
    ...existing fields...,
    "skills": skills,
    **_group_skills_by_kind(skills),
}
```

### Usage dans un template Word

```
{{#each skills_technical}}
  {{#if featured}}★ {{/if}}{{skill_ref.name}} — {{self_assessed_level}}
{{/each}}
```

---

## Ce qui ne change pas

- Le modèle `CandidateSkill` et `ExperienceSkillUsage` : aucun changement
- Les endpoints CRUD existants sur `/candidates/me/skills` : on étend uniquement le PUT
- Les templates existants utilisant `skills` : entièrement backward-compatible

---

## Scope de l'implémentation

1. **Migration** : ajout `creator_candidate_id` sur `skill_references`
2. **Backend** : mise à jour `skill_reference_service` (search + get_or_create), extension `CandidateSkillUpdate` + handler PUT, `_group_skills_by_kind` dans `generation_service`
3. **Frontend** : restructuration de la page skills avec bloc featured + sections par type + édition du kind sur skills custom
