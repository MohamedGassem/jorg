# backend/tests/unit/test_base_crud.py
"""Unit tests for the generic CRUDService in services/base_crud.py."""

from typing import Any
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel
from sqlalchemy import String
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from services.base_crud import CRUDService

# ---------------------------------------------------------------------------
# Isolated declarative base for the test model only.
# We do NOT use models.base.Base so that Base.metadata.create_all does not
# attempt to create production tables that rely on PostgreSQL-only types (ARRAY).
# ---------------------------------------------------------------------------


class _TestBase(DeclarativeBase):
    pass


class SampleItem(_TestBase):
    __tablename__ = "test_items"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)


# ---------------------------------------------------------------------------
# Pydantic schemas used as "data" objects
# ---------------------------------------------------------------------------


class ItemCreate(BaseModel):
    name: str


class ItemUpdate(BaseModel):
    name: str | None = None


# ---------------------------------------------------------------------------
# Async SQLite in-memory fixture
# ---------------------------------------------------------------------------


@pytest.fixture
async def db():  # type: ignore[misc]
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(_TestBase.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(_TestBase.metadata.drop_all)
    await engine.dispose()


# ---------------------------------------------------------------------------
# CRUDService fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def service() -> CRUDService[SampleItem]:
    return CRUDService(SampleItem, "profile_id")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_create_injects_owner_field(db: AsyncSession, service: CRUDService[Any]) -> None:
    """create() must inject the owner_field (profile_id) into the persisted row."""
    owner_id = uuid4()
    payload = ItemCreate(name="My Skill")

    item = await service.create(db, owner_id=owner_id, data=payload)

    assert item.id is not None
    assert item.profile_id == owner_id
    assert item.name == "My Skill"


async def test_get_returns_item_for_correct_owner(
    db: AsyncSession, service: CRUDService[Any]
) -> None:
    """get() should return the item when both item_id AND owner_id match."""
    owner_id = uuid4()
    payload = ItemCreate(name="Experience")

    created = await service.create(db, owner_id=owner_id, data=payload)
    fetched = await service.get(db, item_id=created.id, owner_id=owner_id)

    assert fetched is not None
    assert fetched.id == created.id


async def test_get_returns_none_for_wrong_owner(
    db: AsyncSession, service: CRUDService[Any]
) -> None:
    """get() must enforce ownership — a different owner_id must yield None."""
    real_owner = uuid4()
    other_owner = uuid4()
    payload = ItemCreate(name="Secret Skill")

    created = await service.create(db, owner_id=real_owner, data=payload)
    result = await service.get(db, item_id=created.id, owner_id=other_owner)

    assert result is None


async def test_get_returns_none_for_nonexistent_item(
    db: AsyncSession, service: CRUDService[Any]
) -> None:
    """get() should return None when the item_id does not exist at all."""
    result = await service.get(db, item_id=uuid4(), owner_id=uuid4())
    assert result is None


async def test_update_respects_exclude_unset(db: AsyncSession, service: CRUDService[Any]) -> None:
    """update() must not overwrite fields that are absent from the update payload."""
    owner_id = uuid4()
    original_name = "Original Name"
    created = await service.create(db, owner_id=owner_id, data=ItemCreate(name=original_name))

    # Send an ItemUpdate with NO fields set (all are unset / default None)
    empty_update = ItemUpdate()  # name not provided → excluded by exclude_unset=True
    updated = await service.update(db, obj=created, data=empty_update)

    # The name must remain unchanged because exclude_unset=True skips absent fields
    assert updated.name == original_name


async def test_update_applies_provided_fields(db: AsyncSession, service: CRUDService[Any]) -> None:
    """update() must apply fields that are explicitly present in the payload."""
    owner_id = uuid4()
    created = await service.create(db, owner_id=owner_id, data=ItemCreate(name="Old Name"))

    update_payload = ItemUpdate(name="New Name")
    updated = await service.update(db, obj=created, data=update_payload)

    assert updated.name == "New Name"


async def test_list_returns_only_owner_items(db: AsyncSession, service: CRUDService[Any]) -> None:
    """list() should only return items belonging to the specified owner."""
    owner_a = uuid4()
    owner_b = uuid4()

    await service.create(db, owner_id=owner_a, data=ItemCreate(name="A1"))
    await service.create(db, owner_id=owner_a, data=ItemCreate(name="A2"))
    await service.create(db, owner_id=owner_b, data=ItemCreate(name="B1"))

    items_a = await service.list(db, owner_id=owner_a)
    items_b = await service.list(db, owner_id=owner_b)

    assert len(items_a) == 2
    assert len(items_b) == 1
    assert all(i.profile_id == owner_a for i in items_a)


async def test_delete_removes_item(db: AsyncSession, service: CRUDService[Any]) -> None:
    """delete() must remove the item so it is no longer retrievable."""
    owner_id = uuid4()
    created = await service.create(db, owner_id=owner_id, data=ItemCreate(name="To Delete"))

    await service.delete(db, obj=created)

    result = await service.get(db, item_id=created.id, owner_id=owner_id)
    assert result is None
