import json
from datetime import datetime
from typing import Sequence
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.screenshot import Screenshot
from app.repositories.base import BaseRepository


class ScreenshotRepository(BaseRepository[Screenshot]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, Screenshot)

    async def list(
        self,
        page: int = 1,
        limit: int = 20,
        status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[Sequence[Screenshot], int]:
        filters = []
        if status:
            filters.append(Screenshot.status == status)
        if date_from:
            filters.append(Screenshot.timestamp >= date_from)
        if date_to:
            filters.append(Screenshot.timestamp <= date_to)

        offset = (page - 1) * limit
        items, total = await self.get_all(
            offset=offset,
            limit=limit,
            order_by=Screenshot.timestamp.desc(),
            filters=filters if filters else None,
        )
        return items, total

    async def search(
        self,
        q: str,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[Sequence[Screenshot], int]:
        pattern = f"%{q}%"
        filters = [
            or_(
                Screenshot.description.ilike(pattern),
                Screenshot.application.ilike(pattern),
                Screenshot.summary.ilike(pattern),
                Screenshot.tags.ilike(pattern),
            )
        ]
        offset = (page - 1) * limit
        items, total = await self.get_all(
            offset=offset,
            limit=limit,
            order_by=Screenshot.timestamp.desc(),
            filters=filters,
        )
        return items, total

    async def get_all_tags(self) -> list[str]:
        result = await self.session.execute(
            select(Screenshot.tags).where(Screenshot.tags != "[]")
        )
        all_tags = set()
        for row in result.scalars().all():
            try:
                all_tags.update(json.loads(row))
            except (json.JSONDecodeError, TypeError):
                pass
        return sorted(all_tags)

    async def get_stats(self) -> dict:
        total = await self.count()
        processed = await self.count([Screenshot.status == "processed"])
        pending = await self.count([Screenshot.status == "pending"])
        processing = await self.count([Screenshot.status == "processing"])
        errors = await self.count([Screenshot.status == "error"])

        apps_result = await self.session.execute(
            select(Screenshot.application, func.count(Screenshot.id))
            .where(Screenshot.application != "")
            .group_by(Screenshot.application)
            .order_by(func.count(Screenshot.id).desc())
            .limit(10)
        )
        top_apps = [{"app": row[0], "count": row[1]} for row in apps_result.all()]

        return {
            "total": total,
            "processed": processed,
            "pending": pending,
            "processing": processing,
            "errors": errors,
            "top_apps": top_apps,
        }

    async def get_by_file_path(self, file_path: str) -> Screenshot | None:
        result = await self.session.execute(
            select(Screenshot).where(Screenshot.file_path == file_path)
        )
        return result.scalar_one_or_none()

    async def get_unregistered_files(self, file_paths: set[str]) -> list[str]:
        result = await self.session.execute(
            select(Screenshot.file_path).where(Screenshot.file_path.in_(file_paths))
        )
        registered = set(result.scalars().all())
        return [fp for fp in file_paths if fp not in registered]
