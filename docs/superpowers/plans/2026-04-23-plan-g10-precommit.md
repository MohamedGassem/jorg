# G10 — Pre-commit hooks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurer les pre-commit hooks pour le repo : ruff (Python), prettier (JS/TS/JSON/MD), et vérifications génériques (trailing whitespace, merge conflicts).

**Architecture:** Fichier `.pre-commit-config.yaml` à la racine. `tsc --noEmit` en stage `manual` (trop lent pour chaque commit). `pre-commit install` documenté dans le README.

**Tech Stack:** pre-commit, ruff, prettier, standard hooks.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section G10)

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `.pre-commit-config.yaml` | CREATE | Configuration des hooks |
| `README.md` | MODIFY | Documenter `pre-commit install` |

---

### Task 1 : Créer `.pre-commit-config.yaml`

**Files:**
- Create: `.pre-commit-config.yaml`

- [ ] **Step 1 : Créer le fichier à la racine du repo**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-merge-conflict
      - id: check-yaml
      - id: check-toml

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.11.0
    hooks:
      - id: ruff
        args: [--fix]
        types_or: [python, pyi]
      - id: ruff-format
        types_or: [python, pyi]

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0-alpha.8
    hooks:
      - id: prettier
        types_or: [javascript, jsx, ts, tsx, json, markdown]
        exclude: "^frontend/.next/"

  - repo: local
    hooks:
      - id: tsc
        name: TypeScript typecheck
        language: system
        entry: bash -c "cd frontend && npx tsc --noEmit"
        types_or: [ts, tsx]
        pass_filenames: false
        stages: [manual]
```

- [ ] **Step 2 : Installer pre-commit (si pas déjà installé globalement)**

```bash
pip install pre-commit
# ou via uv :
uv tool install pre-commit
```

- [ ] **Step 3 : Installer les hooks dans le repo**

```bash
pre-commit install
```

Résultat attendu :
```
pre-commit installed at .git/hooks/pre-commit
```

- [ ] **Step 4 : Vérifier que les hooks passent sur les fichiers existants**

```bash
pre-commit run --all-files
```

Résultat attendu : tous les hooks passent (ou auto-fixent sans erreur résiduelle). Si des fichiers sont modifiés par ruff/prettier, les ré-ajouter et relancer.

- [ ] **Step 5 : Documenter dans `README.md`**

Ouvrir `README.md`. Repérer la section "Getting Started" ou "Development Setup" et ajouter :

```markdown
### Pre-commit hooks

Install [pre-commit](https://pre-commit.com/) then run:

```bash
pre-commit install
```

Hooks run automatically on `git commit`. To run manually on all files:

```bash
pre-commit run --all-files
```

TypeScript typecheck (slow) runs only manually:

```bash
pre-commit run tsc --hook-stage manual
```
```

- [ ] **Step 6 : Commit**

```bash
git add .pre-commit-config.yaml README.md
git commit -m "chore(g10): add pre-commit hooks (ruff, prettier, standard checks)"
```
