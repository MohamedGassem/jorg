# P0 — Exclure les marqueurs de bloc `{{#…}}` / `{{/…}}` des placeholders à mapper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrêter de traiter les marqueurs de bloc mustache (`{{#EXPERIENCES}}`, `{{/EXPERIENCES}}`) comme des placeholders à mapper, afin qu'un template uploadé puisse atteindre `is_valid=true` et apparaître dans le dropdown de génération.

**Architecture:** Les marqueurs de bloc sont de la _syntaxe de contrôle de flux_ (gérée par `_apply_block` dans [generation_service.py:85-120](backend/services/generation_service.py#L85-L120)), pas des données. On les filtre à la source dans `extract_placeholders`, on met à jour le test unitaire qui assertait le contraire, et on écrit une migration de données qui nettoie les `detected_placeholders` existants + recalcule `is_valid` pour les templates déjà en base.

**Tech Stack:** Python 3.14, pytest, Alembic, SQLAlchemy 2.x async, docx-parser interne.

**Prerequisite:** Plan 5 (génération) et Plan 6 (frontend) mergés — OK sur `master`.

**Risque fonctionnel actuel (P0) :** un recruteur ne peut valider aucun template qui utilise la syntaxe de bloc — c'est-à-dire le seul mécanisme documenté pour lister plusieurs expériences. L'app est partiellement bloquée en production.

---

## File Structure

| File                                                                         | Action | Purpose                                                                                                                    |
| ---------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `backend/services/docx_parser.py`                                            | Modify | Filtrer les marqueurs de bloc `{{#…}}` / `{{/…}}` hors du résultat                                                         |
| `backend/tests/unit/test_docx_parser.py`                                     | Modify | Inverser `test_extract_block_markers` (assertion opposée) + ajouter cas mixte                                              |
| `backend/alembic/versions/<nouvel_id>_clean_block_markers_from_templates.py` | Create | Migration de données : retirer les marqueurs des `detected_placeholders` existants + recalculer `is_valid`                 |
| `backend/tests/integration/test_recruiter_api.py`                            | Modify | Ajouter un test d'intégration : upload d'un template avec `{{#EXPERIENCES}}` → `detected_placeholders` ne les contient pas |
| `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx`                 | Modify | Défense en profondeur : masquer les marqueurs de bloc si jamais ils transitent encore dans l'API                           |

---

## Task 1: Filtrer les marqueurs de bloc dans `extract_placeholders`

**Files:**

- Modify: `backend/services/docx_parser.py:11-35`
- Test: `backend/tests/unit/test_docx_parser.py:34-39`

- [ ] **Step 1: Inverser le test existant `test_extract_block_markers`**

Ouvrir [backend/tests/unit/test_docx_parser.py](backend/tests/unit/test_docx_parser.py) et remplacer **entièrement** la fonction `test_extract_block_markers` (lignes 34-39) par :

```python
def test_extract_block_markers_are_excluded() -> None:
    """Block markers like {{#EXPERIENCES}} / {{/EXPERIENCES}} are mustache
    control syntax, not data placeholders — they must not be returned."""
    path = _make_docx(["{{#EXPERIENCES}}", "{{EXP_CLIENT}}", "{{/EXPERIENCES}}"])
    result = extract_placeholders(path)
    assert "{{#EXPERIENCES}}" not in result
    assert "{{/EXPERIENCES}}" not in result
    assert "{{EXP_CLIENT}}" in result
    assert result == ["{{EXP_CLIENT}}"]
```

- [ ] **Step 2: Ajouter un test couvrant un nom de bloc alternatif**

Ajouter **à la suite** de la fonction ci-dessus, dans le même fichier :

```python
def test_extract_block_markers_excluded_for_any_block_name() -> None:
    """The filter must apply to any {{#NAME}} / {{/NAME}} pair, not just EXPERIENCES."""
    path = _make_docx(["{{#SKILLS}}", "{{SKILL_NAME}}", "{{/SKILLS}}"])
    result = extract_placeholders(path)
    assert result == ["{{SKILL_NAME}}"]
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Depuis `backend/` :

```bash
pytest tests/unit/test_docx_parser.py -v
```

Expected:

- `test_extract_block_markers_are_excluded` **FAIL** (le parser actuel renvoie encore les marqueurs)
- `test_extract_block_markers_excluded_for_any_block_name` **FAIL** (même raison)
- Les 4 autres tests **PASS**

- [ ] **Step 4: Implémenter le filtre dans `extract_placeholders`**

Ouvrir [backend/services/docx_parser.py](backend/services/docx_parser.py) et remplacer **tout le fichier** par :

```python
# backend/services/docx_parser.py
"""Extract {{...}} placeholders from a Word .docx file."""

from __future__ import annotations

import re
from typing import Any

from docx import Document  # type: ignore[import-untyped,unused-ignore]

_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")
# Block markers start with `#` (opening) or `/` (closing), e.g. {{#EXPERIENCES}}, {{/EXPERIENCES}}
_BLOCK_MARKER_RE = re.compile(r"^\{\{[#/]")


def _iter_paragraphs(doc: Any) -> list[str]:
    """Collect all text blocks from paragraphs and table cells."""
    texts: list[str] = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                texts.append(cell.text)
    return texts


def is_block_marker(placeholder: str) -> bool:
    """Return True if the placeholder is a mustache block start/end marker.

    Block markers are control syntax handled by the generator's block expansion
    logic — they must not be presented to recruiters as fields to map.
    """
    return bool(_BLOCK_MARKER_RE.match(placeholder))


def extract_placeholders(file_path: str) -> list[str]:
    """Return deduplicated list of mappable {{...}} placeholders found in the document.

    Preserves first-occurrence order. Excludes block markers such as
    {{#EXPERIENCES}} and {{/EXPERIENCES}} — those are control syntax handled
    by the generator, not data fields.
    """
    doc = Document(file_path)
    seen: dict[str, None] = {}
    for text in _iter_paragraphs(doc):
        for match in _PLACEHOLDER_RE.finditer(text):
            ph = match.group()
            if is_block_marker(ph):
                continue
            seen.setdefault(ph, None)
    return list(seen.keys())
```

Note : `is_block_marker` est exporté (nom public) car il sera réutilisé dans la migration de données (Task 2).

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Depuis `backend/` :

```bash
pytest tests/unit/test_docx_parser.py -v
```

Expected: les 6 tests **PASS**.

- [ ] **Step 6: Commit**

```bash
git add backend/services/docx_parser.py backend/tests/unit/test_docx_parser.py
git commit -m "fix(backend): exclude mustache block markers from extracted placeholders"
```

---

## Task 2: Migration Alembic — nettoyer les templates existants

**Files:**

- Create: `backend/alembic/versions/<auto>_clean_block_markers_from_templates.py`

Contexte : les templates déjà en base ont leur `detected_placeholders` pollué avec `{{#EXPERIENCES}}` / `{{/EXPERIENCES}}`. La correction Task 1 ne prend effet qu'au prochain upload. Il faut donc :

1. Enlever les marqueurs des `detected_placeholders` JSON.
2. Recalculer `is_valid` en appliquant la même règle que [template_service.\_compute_is_valid](backend/services/template_service.py#L11-L13) : tous les placeholders restants doivent avoir une entrée dans `mappings`.

- [ ] **Step 1: Générer le squelette de migration**

Depuis `backend/` :

```bash
alembic revision -m "clean_block_markers_from_templates"
```

Expected: création d'un fichier `backend/alembic/versions/<id>_clean_block_markers_from_templates.py`. Noter l'`<id>` généré.

- [ ] **Step 2: Écrire le `upgrade()`**

Remplacer **entièrement** le contenu du fichier généré par le code suivant (conserver l'`<id>` réel généré à l'étape précédente dans les variables `revision`) :

```python
"""clean_block_markers_from_templates

Revision ID: <AUTO>
Revises: 36e251d219a0
Create Date: 2026-04-19

Removes mustache block markers ({{#NAME}}, {{/NAME}}) from the
`detected_placeholders` column of existing templates and recomputes
`is_valid` accordingly. See backend/services/docx_parser.py for the
definition of "block marker".
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "<AUTO>"  # ← remplacer par l'id généré
down_revision: str | Sequence[str] | None = "36e251d219a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_BLOCK_MARKER_RE = re.compile(r"^\{\{[#/]")


def _is_block_marker(ph: str) -> bool:
    return bool(_BLOCK_MARKER_RE.match(ph))


def _compute_is_valid(detected: list[str], mappings: dict) -> bool:
    return bool(detected) and all(ph in mappings for ph in detected)


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, detected_placeholders, mappings FROM templates")
    ).fetchall()

    for row in rows:
        detected_raw = row.detected_placeholders
        mappings_raw = row.mappings

        # JSON columns may come back as str or already-parsed list/dict
        # depending on driver; normalize here.
        detected = json.loads(detected_raw) if isinstance(detected_raw, str) else detected_raw
        mappings = json.loads(mappings_raw) if isinstance(mappings_raw, str) else mappings_raw
        detected = list(detected or [])
        mappings = dict(mappings or {})

        cleaned = [ph for ph in detected if not _is_block_marker(ph)]
        # Drop any stale mapping entries pointing at block markers
        cleaned_mappings = {k: v for k, v in mappings.items() if not _is_block_marker(k)}

        if cleaned == detected and cleaned_mappings == mappings:
            continue  # nothing to do

        new_is_valid = _compute_is_valid(cleaned, cleaned_mappings)
        conn.execute(
            sa.text(
                "UPDATE templates SET detected_placeholders = :d, "
                "mappings = :m, is_valid = :v WHERE id = :id"
            ),
            {
                "d": json.dumps(cleaned),
                "m": json.dumps(cleaned_mappings),
                "v": new_is_valid,
                "id": row.id,
            },
        )


def downgrade() -> None:
    # Data-only migration: no reliable inverse (we've dropped the markers).
    # Intentional no-op — upgrade is idempotent so re-running is safe.
    pass
```

**Pourquoi `downgrade` est un no-op :** on ne peut pas reconstituer les marqueurs supprimés sans rouvrir chaque `.docx` source. Et la migration est _idempotente_ (ré-exécuter `upgrade` ne modifie rien une 2ᵉ fois car `cleaned == detected` dès la 2ᵉ passe). Donc pas de risque si quelqu'un `downgrade` puis `upgrade` à nouveau.

- [ ] **Step 3: Lancer la migration sur la DB locale**

Lancer Postgres si besoin :

```bash
docker compose up -d db
```

Puis depuis `backend/` :

```bash
alembic upgrade head
```

Expected: sortie `INFO [alembic.runtime.migration] Running upgrade 36e251d219a0 -> <AUTO>, clean_block_markers_from_templates`.

- [ ] **Step 4: Vérifier en DB**

```bash
docker compose exec db psql -U jorg -d jorg -c \
  "SELECT id, name, is_valid, detected_placeholders FROM templates;"
```

Expected : aucune ligne n'a `{{#EXPERIENCES}}` ou `{{/EXPERIENCES}}` dans `detected_placeholders`. Les templates dont tous les placeholders restants sont mappés ont `is_valid = t`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(backend): migrate existing templates to drop block markers from detected_placeholders"
```

---

## Task 3: Test d'intégration — upload de template avec bloc

**Files:**

- Modify: `backend/tests/integration/test_recruiter_api.py`

L'existant assert déjà que les marqueurs sont _détectés_ ([test_recruiter_api.py:170](backend/tests/integration/test_recruiter_api.py#L170)). Il faut un test qui confirme le nouveau comportement à l'échelle du endpoint d'upload, pas juste du parser.

- [ ] **Step 1: Repérer le test d'upload existant**

Ouvrir [backend/tests/integration/test_recruiter_api.py](backend/tests/integration/test_recruiter_api.py) et localiser le test qui upload un template (autour de la ligne 170 — fonction la plus proche qui `POST` vers `.../templates`). Noter le nom de la fonction helper utilisée pour construire un `.docx` en mémoire (généralement un fixture pytest comme `make_docx_upload` ou inline `io.BytesIO` + `python-docx`).

- [ ] **Step 2: Ajouter le test d'intégration**

Ajouter **à la fin** du fichier [backend/tests/integration/test_recruiter_api.py](backend/tests/integration/test_recruiter_api.py) :

```python
async def test_upload_template_excludes_block_markers_from_detected(
    recruiter_client,  # fixture existante : AsyncClient authentifié comme recruteur
    organization,      # fixture existante : Organization liée au recruteur
) -> None:
    """Uploading a template with mustache block markers must not list them
    as mappable placeholders — they are control syntax, not fields."""
    import io
    from docx import Document

    doc = Document()
    doc.add_paragraph("Candidat : {{NOM}}")
    doc.add_paragraph("{{#EXPERIENCES}}")
    doc.add_paragraph("{{EXP_CLIENT}} — {{EXP_ROLE}}")
    doc.add_paragraph("{{/EXPERIENCES}}")
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    response = await recruiter_client.post(
        f"/organizations/{organization.id}/templates",
        files={"file": ("with_block.docx", buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        data={"name": "With block", "description": "test"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert "{{NOM}}" in body["detected_placeholders"]
    assert "{{EXP_CLIENT}}" in body["detected_placeholders"]
    assert "{{EXP_ROLE}}" in body["detected_placeholders"]
    assert "{{#EXPERIENCES}}" not in body["detected_placeholders"]
    assert "{{/EXPERIENCES}}" not in body["detected_placeholders"]
    assert body["is_valid"] is False  # no mappings yet
```

**Remarque importante :** le nom des fixtures `recruiter_client` et `organization` suit la convention de [backend/tests/integration/test_recruiter_api.py](backend/tests/integration/test_recruiter_api.py). Si les fixtures existantes portent des noms différents (ex. `auth_recruiter_client`, `org`), **remplacer** par les noms réels du fichier — **ne pas** inventer une nouvelle fixture. Les fixtures du projet sont définies dans [backend/tests/conftest.py](backend/tests/conftest.py) et [backend/tests/integration/conftest.py](backend/tests/integration/conftest.py) — lire ces fichiers si un doute subsiste.

Également : si le format exact du endpoint d'upload diffère (champ `file` vs `upload`, content-type, `201` vs `200`), calquer sur le test d'upload existant du même fichier (vers la ligne 170). L'objectif du test n'est pas la forme HTTP, c'est l'assertion sur `detected_placeholders`.

- [ ] **Step 3: Lancer le test**

Depuis `backend/` :

```bash
pytest tests/integration/test_recruiter_api.py::test_upload_template_excludes_block_markers_from_detected -v
```

Expected: **PASS**.

- [ ] **Step 4: Lancer toute la suite pour vérifier l'absence de régression**

Depuis `backend/` :

```bash
pytest -x
```

Expected: tous les tests **PASS**. Si un test existant échoue à cause de l'assertion historique sur `{{#EXPERIENCES}} in detected_placeholders`, **le mettre à jour pour refléter le nouveau contrat** (les marqueurs ne sont plus listés). Ne pas réintroduire le bug pour faire passer un vieux test.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/integration/test_recruiter_api.py
git commit -m "test(backend): verify template upload excludes block markers from detected_placeholders"
```

---

## Task 4: Défense en profondeur côté frontend

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx:84`

Le backend est la source de vérité après Tasks 1-2, donc la liste reçue est déjà propre. Mais si un client ouvre la page avant que la migration ne tourne en prod, ou si un template legacy revient d'une sauvegarde, on ne veut pas afficher `{{#EXPERIENCES}}` dans l'UI. Filtrage trivial au rendu.

- [ ] **Step 1: Ajouter un helper et filtrer au render**

Ouvrir [frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx](<frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx>).

**Ajouter** cette fonction **juste au-dessus** de la constante `PROFILE_FIELDS` (i.e. insérer avant la ligne 19) :

```tsx
function isBlockMarker(placeholder: string): boolean {
  // Matches {{#NAME}} or {{/NAME}} — mustache-style control syntax handled
  // by the backend generator, not a user-mappable field.
  return /^\{\{[#/]/.test(placeholder);
}
```

Puis **remplacer** la ligne 84 :

```tsx
{template.detected_placeholders.map((ph) => (
```

par :

```tsx
{template.detected_placeholders.filter((ph) => !isBlockMarker(ph)).map((ph) => (
```

Ne rien modifier d'autre.

- [ ] **Step 2: Vérifier le type-check**

Depuis `frontend/` :

```bash
npx tsc --noEmit
```

Expected: pas d'erreur.

- [ ] **Step 3: Vérification manuelle en navigateur**

Depuis `frontend/` :

```bash
npm run dev
```

1. Se connecter comme recruteur.
2. Uploader un template `.docx` contenant les deux blocs `{{#EXPERIENCES}}` et `{{/EXPERIENCES}}` + au moins un placeholder simple (`{{NOM}}`).
3. Ouvrir `/recruiter/templates/<id>` : seuls les placeholders simples doivent apparaître comme lignes à mapper, **sans** `{{#EXPERIENCES}}` ni `{{/EXPERIENCES}}`.
4. Mapper les placeholders simples, sauvegarder : message "Template valide et prêt !".
5. Aller sur `/recruiter/generate` : le template apparaît dans le `Select`.
6. Générer un dossier pour un candidat ayant au moins une expérience : le `.docx` téléchargé contient une section par expérience (logique de bloc toujours appliquée côté serveur via `_apply_block`).

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx"
git commit -m "fix(frontend): hide mustache block markers from template mapping UI"
```

---

## Task 5: Smoke test end-to-end manuel

**Files:** aucun — vérification manuelle avant merge.

- [ ] **Step 1: Template neuf**

1. Supprimer (UI ou SQL) un template existant qui contenait des blocs.
2. Le ré-uploader tel quel.
3. Ouvrir la page de mapping : constater que les marqueurs n'apparaissent plus.
4. Mapper, sauver, générer, ouvrir le `.docx` : vérifier qu'une section est générée par expérience.

- [ ] **Step 2: Template legacy (pré-migration)**

Pour simuler le cas prod avant migration, depuis une base vierge, downgrade puis upgrade :

```bash
cd backend
alembic downgrade -1
# uploader un template avec blocs via l'UI (il aura les marqueurs en detected_placeholders)
alembic upgrade head
docker compose exec db psql -U jorg -d jorg -c \
  "SELECT name, is_valid, detected_placeholders FROM templates;"
```

Expected : le template legacy a été nettoyé par la migration. `is_valid` reflète l'état réel (probablement `f` si pas de mappings sauvegardés).

- [ ] **Step 3: PR**

```bash
git push -u origin HEAD
gh pr create --title "fix: exclude mustache block markers from mappable placeholders" --body "$(cat <<'EOF'
## Summary
- Templates uploadés avec `{{#EXPERIENCES}}...{{/EXPERIENCES}}` ne pouvaient jamais atteindre `is_valid=true` — les marqueurs étaient traités comme des placeholders à mapper, alors qu'ils sont de la syntaxe de contrôle consommée par `_apply_block`.
- Fix à la source (parser) + migration de données pour les templates existants + filtre défensif côté UI.

## Test plan
- [ ] `pytest` full suite passe
- [ ] Upload d'un template avec blocs → mapping page ne propose que les vrais placeholders
- [ ] Template existant avant migration → migration nettoie `detected_placeholders` et recalcule `is_valid`
- [ ] Génération produit un `.docx` avec une section par expérience

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes de review (à destination de Codex)

- **Pourquoi filtrer au parser plutôt qu'à `_compute_is_valid` :** `detected_placeholders` est la source de vérité présentée au recruteur (liste des champs à mapper). Y conserver des éléments non-mappables pollue l'UI et force chaque consommateur (UI mapping, UI validation, futurs endpoints diagnostic) à refaire le même filtre. Un seul point de vérité au parser = DRY.
- **Pourquoi garder `is_block_marker` comme helper public :** utilisé dans la migration de données (Task 2) — répéter la regex dans deux endroits invite à la divergence. Le fichier `docx_parser.py` est l'emplacement naturel (c'est le module qui sait ce qu'est un marqueur).
- **Régression testée :** aucun test existant ne comptait sur la présence des marqueurs dans `detected_placeholders` autre que `test_extract_block_markers` (Task 1 Step 1 l'inverse). Le générateur (`generation_service._apply_block`) lit les marqueurs **directement depuis le XML du `.docx`**, pas depuis `detected_placeholders` — la correction n'a donc aucun impact sur le rendu final.
- **Migration idempotente :** ré-exécuter `upgrade` sur une DB déjà nettoyée est un no-op (cf. garde `if cleaned == detected and cleaned_mappings == mappings: continue`).
- **Pas de changement de schéma DB** — uniquement des données dans les colonnes JSON existantes. Pas de lock de table prolongé.
- **Portée volontairement étroite :** on ne corrige pas ici les problèmes annexes (UX du dropdown Generate vide, feedback utilisateur quand aucun template valide, download bug). Ces sujets ont des plans dédiés.
