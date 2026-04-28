# GitHub Repository Security Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the `MohamedGassem/jorg` GitHub repository with branch protection, secrets scanning (pre-commit + GitHub), Dependabot dependency alerts, and CI workflow hardening.

**Architecture:** Five independent tasks applied in order — each either calls the GitHub API once, creates/modifies one config file, or updates workflow files. No application code is touched. All changes are observable and reversible.

**Tech Stack:** GitHub CLI (`gh`), gitleaks v8.30.1, GitHub Actions, pre-commit, `.github/dependabot.yml`

---

## File Structure

| File                                | Action          | Purpose                                                              |
| ----------------------------------- | --------------- | -------------------------------------------------------------------- |
| `.github/dependabot.yml`            | Create          | Dependabot config for pip, npm, and GitHub Actions                   |
| `.pre-commit-config.yaml`           | Modify          | Add gitleaks hook                                                    |
| `.gitleaks.toml`                    | Create          | Allowlist for known CI test credentials                              |
| `.github/workflows/backend-ci.yml`  | Modify          | Replace inline secrets with `${{ secrets.* }}` refs + pin action SHA |
| `.github/workflows/frontend-ci.yml` | Modify          | Pin action SHAs                                                      |
| GitHub branch protection (server)   | `gh api`        | Enforce CI-pass-before-merge on `master`                             |
| GitHub secret scanning (server)     | `gh api`        | Enable secret scanning + push protection                             |
| GitHub Actions Secrets (server)     | `gh secret set` | Store CI test credentials                                            |

---

## Task 1: Branch Protection Rules

**Files:**

- No repo file changes — one `gh api` call updates GitHub server settings

- [ ] **Step 1: Apply branch protection via GitHub CLI**

Run from the repo root:

```bash
gh api --method PUT repos/MohamedGassem/jorg/branches/master/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint-and-test", "lint-and-build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

Expected: HTTP 200 response with a JSON body that includes `"url": "https://api.github.com/repos/MohamedGassem/jorg/branches/master/protection"`.

> **Note on status check names:** `lint-and-test` and `lint-and-build` are the job IDs defined in `backend-ci.yml` and `frontend-ci.yml`. If a PR has ever run CI, verify the exact check names by opening any recent PR on GitHub → clicking "Checks" → copying the check name exactly as shown. If they differ, update the `contexts` array accordingly.

- [ ] **Step 2: Verify branch protection is active**

```bash
gh api repos/MohamedGassem/jorg/branches/master/protection \
  --jq '{force_push_blocked: .allow_force_pushes.enabled, deletion_blocked: .allow_deletions.enabled, required_checks: .required_status_checks.contexts}'
```

Expected output:

```json
{
  "force_push_blocked": false,
  "deletion_blocked": false,
  "required_checks": ["lint-and-test", "lint-and-build"]
}
```

(`false` on the first two means they are blocked — the API returns whether these are _allowed_.)

---

## Task 2: Dependabot Configuration

**Files:**

- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create `.github/dependabot.yml`**

Create the file with this exact content:

```yaml
version: 2
updates:
  - package-ecosystem: pip
    directory: /backend
    schedule:
      interval: weekly
    groups:
      security-patches:
        applies-to: security-updates
        patterns:
          - "*"
      weekly-updates:
        applies-to: version-updates
        patterns:
          - "*"

  - package-ecosystem: npm
    directory: /frontend
    schedule:
      interval: weekly
    groups:
      security-patches:
        applies-to: security-updates
        patterns:
          - "*"
      weekly-updates:
        applies-to: version-updates
        patterns:
          - "*"

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add Dependabot for pip, npm, and GitHub Actions"
```

- [ ] **Step 4: Verify Dependabot is active on GitHub**

Open `https://github.com/MohamedGassem/jorg/network/updates` in a browser.

Expected: Three Dependabot entries visible — "pip (backend/)", "npm (frontend/)", "github-actions (/)".

---

## Task 3: Gitleaks Pre-commit Hook

**Files:**

- Modify: `.pre-commit-config.yaml`
- Create: `.gitleaks.toml`

- [ ] **Step 1: Install gitleaks locally**

```bash
winget install gitleaks.gitleaks
```

Then open a new terminal and verify:

```bash
gitleaks version
```

Expected: `v8.30.1` (or newer).

- [ ] **Step 2: Create `.gitleaks.toml` allowlist**

The backend CI workflow has intentional test-only credentials that would otherwise trigger false positives. Create `.gitleaks.toml` at the repo root:

```toml
title = "jorg gitleaks config"

[allowlist]
  description = "CI test credentials — not real secrets"
  paths = [
    '''.github/workflows/backend-ci.yml''',
  ]
```

- [ ] **Step 3: Add gitleaks to `.pre-commit-config.yaml`**

Open `.pre-commit-config.yaml` and add the following block **after** the `pre-commit/pre-commit-hooks` repo entry and **before** the `astral-sh/ruff-pre-commit` entry:

```yaml
- repo: https://github.com/gitleaks/gitleaks
  rev: v8.30.1
  hooks:
    - id: gitleaks
```

The updated file should look like:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-merge-conflict
      - id: check-yaml
      - id: check-toml

  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.30.1
    hooks:
      - id: gitleaks

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

- [ ] **Step 4: Install the new hook**

```bash
pre-commit install
pre-commit autoupdate --freeze --repo https://github.com/gitleaks/gitleaks
```

The `--freeze` flag pins the hook to a commit SHA for supply-chain safety. The `rev` in `.pre-commit-config.yaml` will be updated to a SHA automatically.

Expected: output like `updating https://github.com/gitleaks/gitleaks ... updating v8.30.1 -> <sha>`.

- [ ] **Step 5: Run gitleaks against the full repo to check for existing leaks**

```bash
pre-commit run gitleaks --all-files
```

Expected: `Passed` — no secrets detected. If it fails, check the finding: if it's a false positive from `.github/workflows/backend-ci.yml`, the allowlist in Step 2 should suppress it. If a real secret is found, remove it from history before continuing.

- [ ] **Step 6: Commit**

```bash
git add .pre-commit-config.yaml .gitleaks.toml
git commit -m "ci: add gitleaks pre-commit hook for secrets detection"
```

---

## Task 4: GitHub Advanced Security — Secret Scanning

**Files:**

- No repo file changes — two `gh api` calls update GitHub server settings

> **Prerequisite:** The repo is public (`visibility: public`), so GitHub Advanced Security is free and available.

- [ ] **Step 1: Enable secret scanning and push protection**

```bash
gh api --method PATCH repos/MohamedGassem/jorg \
  -f "security_and_analysis[secret_scanning][status]=enabled" \
  -f "security_and_analysis[secret_scanning_push_protection][status]=enabled"
```

Expected: HTTP 204 No Content (no response body — that's correct).

- [ ] **Step 2: Verify both features are enabled**

```bash
gh api repos/MohamedGassem/jorg \
  --jq '.security_and_analysis | {secret_scanning: .secret_scanning.status, push_protection: .secret_scanning_push_protection.status}'
```

Expected:

```json
{
  "secret_scanning": "enabled",
  "push_protection": "enabled"
}
```

- [ ] **Step 3: Verify in GitHub UI**

Open `https://github.com/MohamedGassem/jorg/settings/security_analysis`.

Expected: "Secret scanning" and "Push protection" both show as enabled with a green checkmark.

---

## Task 5: CI Workflow Hardening

**Files:**

- Modify: `.github/workflows/backend-ci.yml`
- Modify: `.github/workflows/frontend-ci.yml`
- GitHub Actions Secrets (server): `CI_DATABASE_URL`, `CI_SECRET_KEY`

### 5a — Create GitHub Actions Secrets

- [ ] **Step 1: Store CI test credentials as GitHub Secrets**

```bash
gh secret set CI_DATABASE_URL --body "postgresql+asyncpg://postgres:postgres@localhost:5432/test"
gh secret set CI_SECRET_KEY --body "ci-secret-key-must-be-at-least-32-characters-long"
```

Expected: `✓ Set Actions secret CI_DATABASE_URL for MohamedGassem/jorg` (same for CI_SECRET_KEY).

- [ ] **Step 2: Verify secrets exist (names only — values are never shown)**

```bash
gh secret list
```

Expected: both `CI_DATABASE_URL` and `CI_SECRET_KEY` appear in the list.

### 5b — Harden `backend-ci.yml`

- [ ] **Step 3: Replace hardcoded credentials with secret references and pin action SHAs**

Open `.github/workflows/backend-ci.yml` and replace the entire file content with:

```yaml
name: Backend CI

on:
  push:
    branches: [master]
    paths:
      - "backend/**"
      - ".github/workflows/backend-ci.yml"
  pull_request:
    paths:
      - "backend/**"
      - ".github/workflows/backend-ci.yml"

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.CI_DATABASE_URL }}
      SECRET_KEY: ${{ secrets.CI_SECRET_KEY }}
    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Install uv
        uses: astral-sh/setup-uv@caf0cab7a618c569241d31dcd442f54681755d39 # v3

      - name: Set up Python 3.14
        run: uv python install 3.14

      - name: Install dependencies
        run: uv sync --all-extras

      - name: Ruff
        run: uv run ruff check .

      - name: Ruff format check
        run: uv run ruff format --check .

      - name: Mypy
        run: uv run mypy .

      - name: Pytest
        run: uv run pytest -v --cov=. --cov-report=term-missing
```

### 5c — Harden `frontend-ci.yml`

- [ ] **Step 4: Pin action SHAs in `frontend-ci.yml`**

Open `.github/workflows/frontend-ci.yml` and replace the entire file content with:

```yaml
name: Frontend CI

on:
  push:
    branches: [master]
    paths:
      - "frontend/**"
      - ".github/workflows/frontend-ci.yml"
  pull_request:
    paths:
      - "frontend/**"
      - ".github/workflows/frontend-ci.yml"

jobs:
  lint-and-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Set up Node.js 20
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: ESLint
        run: npm run lint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_API_URL: http://localhost:8000
```

- [ ] **Step 5: Commit both workflow changes**

```bash
git add .github/workflows/backend-ci.yml .github/workflows/frontend-ci.yml
git commit -m "ci: move secrets to GitHub Secrets and pin action SHAs"
```

- [ ] **Step 6: Push and verify CI passes**

```bash
git push origin master
```

Then open `https://github.com/MohamedGassem/jorg/actions` and confirm both `Backend CI` and `Frontend CI` workflow runs complete with green status.

> If either workflow fails with a secret not found error, verify the secret names match exactly (`CI_DATABASE_URL`, `CI_SECRET_KEY`) by running `gh secret list`.

---

## Final Verification Checklist

After all tasks complete, verify each protection layer is active:

- [ ] **Branch protection:** Open `https://github.com/MohamedGassem/jorg/settings/branches` — `master` row shows protection rules with required status checks listed.
- [ ] **Dependabot:** Open `https://github.com/MohamedGassem/jorg/network/updates` — three ecosystems visible.
- [ ] **Gitleaks:** Run `pre-commit run gitleaks --all-files` — passes with no findings.
- [ ] **Secret scanning:** Open `https://github.com/MohamedGassem/jorg/settings/security_analysis` — both secret scanning features show enabled.
- [ ] **CI hardening:** Open any recent Actions run — no plaintext secrets visible in logs, action steps show SHA-pinned refs.
