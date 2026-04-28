# GitHub Repository Security Hardening — Design Spec

**Date:** 2026-04-28
**Status:** Approved
**Scope:** Full hardening of the `jorg` GitHub repository — branch protection, secrets scanning, Dependabot, and CI hardening.

---

## Goals

- Prevent broken code from merging to `master` (CI as gatekeeper)
- Prevent secrets from entering the repository history
- Keep dependencies patched against known CVEs automatically
- Harden CI workflows against supply-chain attacks

## Non-Goals

- Commit signing (GPG/SSH not currently configured — deferred)
- Auto-merge of Dependabot PRs
- Adding required human reviewers (solo project — not needed)

---

## Section 1 — Branch Protection Rules

**Target branch:** `master`

**Rules to enable via `gh api`:**

| Rule                                | Value                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| Require status checks to pass       | `backend-ci / lint-and-test`, `frontend-ci / lint-and-build` |
| Require branches to be up to date   | `true`                                                       |
| Block force pushes                  | `true`                                                       |
| Block branch deletion               | `true`                                                       |
| Require pull request before merging | `false` (solo — CI pass is sufficient)                       |
| Include administrators              | opt-in toggle (off by default)                               |

**Implementation:** A one-time `gh api` call using the REST branch protection endpoint. No file committed to the repo — lives in GitHub settings.

---

## Section 2 — Secrets Scanning

### Layer 1 — Pre-commit (local)

Add `gitleaks` to `.pre-commit-config.yaml`:

```yaml
- repo: https://github.com/gitleaks/gitleaks
  rev: v8.21.2
  hooks:
    - id: gitleaks
```

**False positive allowlist** (`.gitleaks.toml` at repo root):

The following values in `backend-ci.yml` are intentional test-only credentials and must be allowlisted:

- `SECRET_KEY: ci-secret-key-must-be-at-least-32-characters-long` — explicit CI test key, not a real secret
- `DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/test` — default local test DB credentials

```toml
[allowlist]
  description = "CI test credentials — not real secrets"
  paths = ['''.github/workflows/backend-ci.yml''']
```

### Layer 2 — GitHub Advanced Security (server-side)

Enable via `gh api` / GitHub Settings:

- **Secret scanning** — scans all pushes for 200+ known secret formats
- **Push protection** — blocks pushes containing known secrets before they enter history

---

## Section 3 — Dependabot

Add `.github/dependabot.yml` with three ecosystems:

### Python (`backend/`)

```yaml
- package-ecosystem: pip
  directory: /backend
  schedule:
    interval: weekly
  groups:
    security-patches:
      applies-to: security-updates
      patterns: ["*"]
    weekly-updates:
      applies-to: version-updates
      patterns: ["*"]
```

### npm (`frontend/`)

```yaml
- package-ecosystem: npm
  directory: /frontend
  schedule:
    interval: weekly
  groups:
    security-patches:
      applies-to: security-updates
      patterns: ["*"]
    weekly-updates:
      applies-to: version-updates
      patterns: ["*"]
```

### GitHub Actions (`.github/workflows/`)

```yaml
- package-ecosystem: github-actions
  directory: /
  schedule:
    interval: weekly
```

**Merge strategy:** Manual review required for all Dependabot PRs. Security patches open immediately (outside weekly schedule). Regular bumps grouped into one PR per ecosystem per week.

---

## Section 4 — CI Workflow Hardening

### 4a — Move hardcoded test credentials to GitHub Secrets

**File:** `.github/workflows/backend-ci.yml`

Current state:

```yaml
env:
  DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/test
  SECRET_KEY: ci-secret-key-must-be-at-least-32-characters-long
```

Target state:

```yaml
env:
  DATABASE_URL: ${{ secrets.CI_DATABASE_URL }}
  SECRET_KEY: ${{ secrets.CI_SECRET_KEY }}
```

**GitHub Secrets to create:**

- `CI_DATABASE_URL` = `postgresql+asyncpg://postgres:postgres@localhost:5432/test`
- `CI_SECRET_KEY` = `ci-secret-key-must-be-at-least-32-characters-long`

Note: `NEXT_PUBLIC_API_URL: http://localhost:8000` in `frontend-ci.yml` is a public config value, not a secret — leave as-is.

### 4b — Pin third-party Actions to commit SHAs

**Why:** Action tags (e.g., `@v4`) are mutable. Pinning to a SHA prevents a compromised upstream from silently injecting malicious code into your CI.

**Actions to pin:**

| Action               | Current | SHA to pin              |
| -------------------- | ------- | ----------------------- |
| `actions/checkout`   | `@v4`   | fetch latest SHA for v4 |
| `astral-sh/setup-uv` | `@v3`   | fetch latest SHA for v3 |
| `actions/setup-node` | `@v4`   | fetch latest SHA for v4 |

Each pinned line gets an inline comment with the human-readable tag:

```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

---

## Implementation Order

1. **Branch protection** — `gh api` call (no repo file changes)
2. **Dependabot** — add `.github/dependabot.yml`
3. **Gitleaks pre-commit** — add to `.pre-commit-config.yaml` + `.gitleaks.toml`
4. **GitHub Advanced Security** — enable via `gh` CLI
5. **CI hardening** — add GitHub Secrets + update workflow files + pin action SHAs

---

## Files Changed

| File                                                 | Action                           |
| ---------------------------------------------------- | -------------------------------- |
| `.github/dependabot.yml`                             | Create                           |
| `.pre-commit-config.yaml`                            | Modify (add gitleaks hook)       |
| `.gitleaks.toml`                                     | Create                           |
| `.github/workflows/backend-ci.yml`                   | Modify (secrets refs + SHA pins) |
| `.github/workflows/frontend-ci.yml`                  | Modify (SHA pins)                |
| GitHub Settings (branch protection, secret scanning) | One-time `gh api` calls          |
| GitHub Secrets (CI_DATABASE_URL, CI_SECRET_KEY)      | One-time `gh secret set` calls   |
