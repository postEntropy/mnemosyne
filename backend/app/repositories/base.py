from typing import TypeVar, Generic, Type, Sequence
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    def __init__(self, session: AsyncSession, model: Type[T]):
        self.session = session
        self.model = model

    async def get_by_id(self, id: int) -> T | None:
        return await self.session.get(self.model, id)

    async def get_all(
        self,
        offset: int = 0,
        limit: int = 20,
        order_by=None,
        filters=None,
    ) -> tuple[Sequence[T], int]:
        query = select(self.model)
        if filters:
            for f in filters:
                query = query.where(f)
        if order_by is not None:
            query = query.order_by(order_by)

        count_query = select(func.count()).select_from(
            select(self.model).where(*filters).subquery() if filters else self.model
        )
        count_result = await self.session.execute(count_query)
        total = count_result.scalar_one()

        query = query.offset(offset).limit(limit)
        result = await self.session.execute(query)
        items = result.scalars().all()
        return items, total

    async def create(self, **kwargs) -> T:
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def update(self, instance: T, **kwargs) -> T:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete(self, instance: T) -> None:
        await self.session.delete(instance)
        await self.session.commit()

    async def count(self, filters=None) -> int:
        query = select(func.count(self.model.id))
        if filters:
            for f in filters:
                query = query.where(f)
        result = await self.session.execute(query)
        return result.scalar_one()
