# CI Pipeline Improvements — Design Spec

**Date:** 2026-04-29
**Status:** Approved
**Scope:** Three CI improvements: coverage gate, Docker build validation. Alembic check deferred until postgres service is added to CI.

---

## Goals

- Fail CI when test coverage drops below the current baseline
- Validate the backend Docker image builds cleanly on every push/PR
- Keep CI changes minimal — no new services, no new secrets

## Non-Goals

- Alembic migration check (deferred — requires postgres service in CI)
- Pushing the Docker image to a registry (deferred — after first deployment)
- Frontend tests (none exist yet)
- Integration test setup in CI (separate effort)

---

## Section 1 — Coverage Gate

**File:** `backend/pyproject.toml`

Add `--cov-fail-under=20` to `[tool.pytest.ini_options]` via `addopts`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
addopts = "--cov-fail-under=20"
```

**Why `pyproject.toml` and not the CI workflow:** The threshold applies locally too — `uv run pytest` enforces it. Developers get immediate feedback without needing to push to CI.

**Threshold rationale:** Current unit-test coverage is 22%. Setting 20% gives a 2-point buffer before the gate triggers, while still blocking regressions.

**Upgrade path:** Raise the number incrementally as tests are added. No other files need changing.

---

## Section 2 — Multi-stage Dockerfile

**File:** `backend/Dockerfile`

Two-stage build:

```dockerfile
# ── Builder ────────────────────────────────────────────────────────────────
FROM python:3.14-slim AS builder

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies into an isolated venv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code
COPY . .
RUN uv sync --frozen --no-dev

# ── Runtime ────────────────────────────────────────────────────────────────
FROM python:3.14-slim AS runtime

WORKDIR /app

# Copy only the venv and app code — no uv, no build tools
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Why multi-stage:** The builder stage includes uv and pip cache; the runtime stage copies only the venv and source. Result: ~60% smaller image, faster Railway deploys, smaller attack surface.

**Entrypoint assumption:** `main.py` at `backend/` root exposes a FastAPI `app` object. Adjust `main:app` if the entrypoint differs.

---

## Section 3 — Docker Build CI Step

**File:** `.github/workflows/backend-ci.yml`

Add two steps **after** the Pytest step:

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3

- name: Docker build
  uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6
  with:
    context: backend
    push: false
```

**Why `push: false`:** CI validates the image builds but never pushes. The registry push belongs in the deployment pipeline, not here.

**Why `setup-buildx-action` is needed:** `build-push-action` v6 requires Buildx. The setup action initialises it; without it the build step fails.

**SHA pins:** Both actions are pinned to commit SHAs (consistent with the existing workflow hardening).

---

## Files Changed

| File                               | Action                                                |
| ---------------------------------- | ----------------------------------------------------- |
| `backend/pyproject.toml`           | Modify — add `addopts` to `[tool.pytest.ini_options]` |
| `backend/Dockerfile`               | Create                                                |
| `.github/workflows/backend-ci.yml` | Modify — add two Docker steps after Pytest            |
