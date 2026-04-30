# backend/services/base_crud.py
"""Generic async CRUD service for SQLAlchemy models owned by a parent UUID."""

from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.base import Base

T = TypeVar("T", bound=Base)


class CRUDService(Generic[T]):
    """Five-operation async CRUD helper parameterised over a SQLAlchemy model.

    owner_field: the column name on T that holds the parent/owner UUID
                 (e.g. "profile_id" for Experience, Skill, etc.)
    """

    def __init__(self, model: type[T], owner_field: str) -> None:
        self.model = model
        self.owner_field = owner_field

    async def list(self, db: AsyncSession, owner_id: UUID) -> list[T]:
        result = await db.execute(
            select(self.model).where(getattr(self.model, self.owner_field) == owner_id)
        )
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, owner_id: UUID, data: Any) -> T:
        fields = data.model_dump()
        fields[self.owner_field] = owner_id
        obj = self.model(**fields)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def get(self, db: AsyncSession, item_id: UUID, owner_id: UUID) -> T | None:
        result = await db.execute(
            select(self.model).where(
                self.model.id == item_id,
                getattr(self.model, self.owner_field) == owner_id,
            )
        )
        return result.scalar_one_or_none()

    async def update(self, db: AsyncSession, obj: T, data: Any) -> T:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def delete(self, db: AsyncSession, obj: T) -> None:
        await db.delete(obj)
        await db.commit()
