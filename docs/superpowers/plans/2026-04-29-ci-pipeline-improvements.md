# CI Pipeline Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coverage gate at 20%, a multi-stage Dockerfile for the backend, and a Docker build validation step in CI.

**Architecture:** Three independent tasks in order — each touches one file and produces one commit. No application code changes. Task 1 enforces the coverage floor locally and in CI. Task 2 creates the Dockerfile. Task 3 wires the Docker build into GitHub Actions.

**Tech Stack:** Python 3.14, uv, pytest-cov, Docker multi-stage build, `docker/setup-buildx-action`, `docker/build-push-action`

---

## File Structure

| File                               | Action             | Purpose                                            |
| ---------------------------------- | ------------------ | -------------------------------------------------- |
| `backend/pyproject.toml`           | Modify line 63     | Add `addopts` with `--cov-fail-under=20`           |
| `backend/Dockerfile`               | Create             | Multi-stage image: builder + runtime               |
| `backend/.dockerignore`            | Create             | Exclude tests, cache, venv from image              |
| `.github/workflows/backend-ci.yml` | Modify lines 45-46 | Add Buildx setup + Docker build steps after Pytest |

---

## Task 1: Coverage Gate

**Files:**

- Modify: `backend/pyproject.toml:60-63`

- [ ] **Step 1: Verify the gate does not exist yet**

From `backend/`:

```bash
uv run pytest tests/unit/ -q 2>&1 | tail -5
```

Expected: tests pass with no "failed: coverage" line — the gate is not active yet.

- [ ] **Step 2: Add `addopts` to `pyproject.toml`**

Open `backend/pyproject.toml`. The current `[tool.pytest.ini_options]` section at line 60 looks like:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
```

Replace it with:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
addopts = "--cov-fail-under=20"
```

- [ ] **Step 3: Verify the gate is active and passes**

```bash
uv run pytest tests/unit/ -q 2>&1 | tail -5
```

Expected: all tests pass and the last line shows something like:

```
Required test coverage of 20% reached. Total coverage: 22.XX%
25 passed in X.XXs
```

If coverage is below 20%, the run exits with code 1 and shows:

```
FAIL Required test coverage of 20% not reached. Total coverage: XX%
```

In that case, do not lower the threshold — investigate which test file lost coverage.

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "ci: enforce 20% coverage floor via pytest addopts"
```

---

## Task 2: Multi-stage Dockerfile

**Files:**

- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create `backend/.dockerignore`**

Create `backend/.dockerignore` with this exact content:

```
.venv
__pycache__
*.pyc
*.pyo
.pytest_cache
.mypy_cache
.ruff_cache
tests/
alembic/
*.md
.env
.env.*
```

This prevents test files, caches, and local env files from being copied into the image.

- [ ] **Step 2: Create `backend/Dockerfile`**

Create `backend/Dockerfile` with this exact content:

```dockerfile
# ── Builder ────────────────────────────────────────────────────────────────
FROM python:3.14-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

# ── Runtime ────────────────────────────────────────────────────────────────
FROM python:3.14-slim AS runtime

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Verify the image builds locally**

From the repo root (not `backend/`):

```bash
docker build -t jorg-backend:test backend/
```

Expected: build completes successfully. Final line:

```
=> => naming to docker.io/library/jorg-backend:test
```

If `docker` is not installed locally, skip this step — CI will be the first build validator.

- [ ] **Step 4: Verify the runtime image size is reasonable**

```bash
docker images jorg-backend:test --format "{{.Size}}"
```

Expected: under 500MB. A typical Python 3.14-slim image with FastAPI deps is ~250-350MB. If it's over 1GB, the multi-stage copy likely picked up an unexpected directory.

- [ ] **Step 5: Verify the container starts**

```bash
docker run --rm -e SECRET_KEY=test-only -e DATABASE_URL=postgresql+asyncpg://x:x@localhost/x \
  jorg-backend:test uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s http://localhost:8000/docs | head -5
docker stop $(docker ps -q --filter ancestor=jorg-backend:test) 2>/dev/null || true
```

Expected: first few lines of the Swagger HTML — confirms the app starts. Connection errors to the DB are fine at this stage.

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat: add multi-stage Dockerfile for backend"
```

---

## Task 3: Docker Build CI Step

**Files:**

- Modify: `.github/workflows/backend-ci.yml:45-46`

- [ ] **Step 1: Add Buildx setup and Docker build steps to `backend-ci.yml`**

Open `.github/workflows/backend-ci.yml`. The current last two lines of the `steps:` block are:

```yaml
- name: Pytest
  run: uv run pytest -v --cov=. --cov-report=term-missing
```

Add two new steps **after** the Pytest step. The complete updated file must be:

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

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3

      - name: Docker build
        uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6
        with:
          context: backend
          push: false
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/backend-ci.yml
git commit -m "ci: add Docker build validation step to backend CI"
```

- [ ] **Step 3: Push and verify CI passes**

```bash
git push origin master
```

Open `https://github.com/MohamedGassem/jorg/actions` and wait for the `Backend CI` run to complete.

Expected: all steps green including the new `Set up Docker Buildx` and `Docker build` steps. The `Pytest` step should show `Required test coverage of 20% reached`.

If `Docker build` fails with a build error, check the Dockerfile syntax — the most common cause is a COPY path that doesn't exist relative to the `backend/` context.
