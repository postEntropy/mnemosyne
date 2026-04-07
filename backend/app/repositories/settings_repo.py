from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import Setting
from app.repositories.base import BaseRepository


class SettingsRepository(BaseRepository[Setting]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, Setting)

    async def get_all_as_dict(self) -> dict[str, str]:
        result = await self.session.execute(select(Setting))
        return {s.key: s.value for s in result.scalars().all()}

    async def get_by_key(self, key: str) -> Setting | None:
        result = await self.session.execute(select(Setting).where(Setting.key == key))
        return result.scalar_one_or_none()

    async def set(self, key: str, value: str) -> Setting:
        existing = await self.get_by_key(key)
        if existing:
            existing.value = value
            await self.session.commit()
            await self.session.refresh(existing)
            return existing
        else:
            setting = Setting(key=key, value=value)
            self.session.add(setting)
            await self.session.commit()
            await self.session.refresh(setting)
            return setting

    async def bulk_set(self, settings: dict[str, str]) -> None:
        for key, value in settings.items():
            if value is not None:
                await self.set(key, value)
