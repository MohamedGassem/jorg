# Jorg Backend

FastAPI backend for Jorg. Python 3.14 + SQLAlchemy 2.x async + PostgreSQL 18.3.

## Setup

```bash
# Depuis la racine du repo :
cp .env.example .env
docker compose up -d postgres

# Puis :
cd backend
uv sync
uv run alembic upgrade head
```

## Run dev server

```bash
uv run uvicorn main:app --reload --port 8000
```

API : http://localhost:8000
Docs interactives : http://localhost:8000/docs

## Tests

```bash
uv run pytest -v
```

## Migrations

```bash
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
```

## Lint & format

```bash
uv run ruff check .
uv run ruff format .
uv run mypy .
```

## Auth endpoints disponibles (Plan 1)

- `POST /auth/register` — email/password
- `POST /auth/login` — retourne access + refresh
- `POST /auth/refresh`
- `POST /auth/verify-email`
- `POST /auth/request-password-reset`
- `POST /auth/reset-password`
- `GET /auth/me` — profil de l'utilisateur courant
- `GET /auth/oauth/{google,linkedin}/login?role=candidate|recruiter`
- `GET /auth/oauth/{google,linkedin}/callback`
