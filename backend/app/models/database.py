from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def run_migrations():
    import logging

    logger = logging.getLogger("mnemosyne.db")
    try:
        from alembic.config import Config
        from alembic import command
        import os

        alembic_cfg = Config(
            os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
        )
        command.upgrade(alembic_cfg, "head")
        logger.info("Database schema up to date (alembic).")
    except Exception as e:
        logger.warning(f"Alembic migration failed ({e}), falling back to create_all.")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with async_session() as session:
        yield session
