# backend/tests/integration/conftest.py
import csv
from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

from api.deps import get_db
from core.email import ConsoleEmailBackend, override_email_backend
from core.limiter import limiter
from main import app
from models import Base
from models.skill import SkillKind, SkillReference

DATA_FILE = Path(__file__).resolve().parent.parent.parent.parent / "data" / "esco_seed.csv"


def _parse_aliases(raw: str) -> list[str]:
    raw = raw.strip().strip('"')
    if not raw:
        return []
    return [a.strip() for a in raw.split(";") if a.strip()]


@pytest.fixture(scope="session")
def postgres_container() -> Generator[PostgresContainer]:
    with PostgresContainer("postgres:18.3", driver="asyncpg") as pg:
        yield pg


@pytest_asyncio.fixture
async def db_engine(postgres_container: PostgresContainer) -> AsyncGenerator[Any]:
    url = postgres_container.get_connection_url()
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def seed_skill_references(db_engine: Any) -> None:
    """Seed SkillReference rows for every test."""
    if not DATA_FILE.exists():
        return
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        with open(DATA_FILE, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                esco_uri = row["esco_uri"].strip() or None
                slug = row["slug"].strip()
                source = row.get("source", "").strip() or "esco"
                if source == "esco" and esco_uri:
                    result = await session.execute(
                        select(SkillReference).where(SkillReference.esco_uri == esco_uri)
                    )
                else:
                    result = await session.execute(
                        select(SkillReference).where(SkillReference.slug == slug)
                    )
                if result.scalar_one_or_none() is None:
                    try:
                        kind = SkillKind(row["kind"].strip())
                    except ValueError:
                        continue
                    session.add(
                        SkillReference(
                            name=row["name"].strip(),
                            slug=slug,
                            kind=kind,
                            aliases=_parse_aliases(row.get("aliases", "")),
                            esco_uri=esco_uri,
                            esco_skill_type=row.get("esco_skill_type", "").strip() or None,
                            source=source,
                            description=row.get("description", "").strip() or None,
                            is_custom=False,
                        )
                    )
        await session.commit()


@pytest_asyncio.fixture
async def db_session(db_engine: Any) -> AsyncGenerator[AsyncSession]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def override_get_db() -> AsyncGenerator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    email_backend = ConsoleEmailBackend()
    override_email_backend(email_backend)

    # Reset rate limit counters so each test starts with a clean slate.
    # The limiter uses in-memory storage which persists across tests otherwise.
    limiter.reset()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.email_backend = email_backend  # type: ignore[attr-defined]
        yield ac

    app.dependency_overrides.clear()
    override_email_backend(None)


@pytest_asyncio.fixture
async def candidate_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/auth/register",
        json={
            "email": "candidate@test.com",
            "password": "testpass123",
            "role": "candidate",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": "candidate@test.com", "password": "testpass123"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def second_candidate_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/auth/register",
        json={
            "email": "second_candidate@example.com",
            "password": "SecondPass123!",
            "role": "candidate",
        },
    )
    r = await client.post(
        "/auth/login",
        json={"email": "second_candidate@example.com", "password": "SecondPass123!"},
    )
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def recruiter_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/auth/register",
        json={
            "email": "recruiter@test.com",
            "password": "testpass123",
            "role": "recruiter",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": "recruiter@test.com", "password": "testpass123"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def second_recruiter_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/auth/register",
        json={
            "email": "recruiter2@test.com",
            "password": "password123",
            "role": "recruiter",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": "recruiter2@test.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
