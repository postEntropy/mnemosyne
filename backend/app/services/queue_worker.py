import asyncio
import logging
from pathlib import Path
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import async_session
from app.models.screenshot import Screenshot
from app.models.settings import Setting
from app.services.storage import (
    process_screenshot,
    get_active_provider,
    validate_provider,
)
from app.services.thumbnailer import generate_thumbnail

logger = logging.getLogger("mnemosyne.worker")

MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5


class QueueWorker:
    def __init__(self):
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self.running = False
        self.paused = False
        self.current_file: str | None = None

    async def start(self):
        if self.running:
            return
        self.running = True
        self._task = asyncio.create_task(self._worker_loop())

        # Disabled: re-enqueue pending only via explicit API call (scan-folder)
        # asyncio.create_task(self._rehydrate_pending())

        logger.info(
            "QueueWorker started. Pending screenshots will be processed via scan-folder."
        )

    async def _rehydrate_pending(self):
        """Re-hydrate the queue with pending screenshots from database on startup."""
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(Screenshot).where(
                        Screenshot.status.in_(["pending", "processing"])
                    )
                )
                pending_screenshots = result.scalars().all()

                if pending_screenshots:
                    logger.info(
                        f"Re-hydrating {len(pending_screenshots)} pending screenshots"
                    )
                    for ss in pending_screenshots:
                        if ss.status == "processing":
                            ss.status = "pending"
                            ss.error_message = "Interrupted on restart"

                        await self.queue.put(ss.file_path)

                    await db.commit()
                    logger.info(
                        f"Enqueued {len(pending_screenshots)} screenshots after restart."
                    )
        except Exception as e:
            logger.error(f"Failed to rehydrate pending screenshots: {e}")

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("QueueWorker stopped.")

    async def toggle_pause(self):
        self.paused = not self.paused
        state = "paused" if self.paused else "resumed"
        logger.info(f"QueueWorker {state}.")
        return self.paused

    async def enqueue(self, file_path: str):
        await self.queue.put(file_path)
        logger.debug(f"Enqueued: {file_path}")

    async def _worker_loop(self):
        logger.info("=== WORKER LOOP STARTED ===")
        while self.running:
            if self.paused:
                logger.debug("Worker paused, sleeping...")
                await asyncio.sleep(1)
                continue

            logger.debug(f"Queue size: {self.queue.qsize()}, waiting for item...")
            file_path = await self.queue.get()
            logger.info(f"Got item from queue: {file_path}")
            try:
                await self._process_with_retry(file_path)
            except Exception as e:
                logger.error(f"Error processing {file_path}: {str(e)}")
            finally:
                self.current_file = None
                self.queue.task_done()

    async def _process_with_retry(self, file_path: str):
        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                await self._process_single(file_path)
                return
            except Exception as e:
                last_error = e
                logger.warning(
                    f"Attempt {attempt}/{MAX_RETRIES} failed for {file_path}: {e}"
                )
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY_SECONDS * attempt
                    logger.info(f"Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    await self._mark_error(file_path, str(last_error))
                    raise

    async def _process_single(self, file_path: str):
        async with async_session() as db:
            stmt = select(Screenshot).where(Screenshot.file_path == file_path)
            result = await db.execute(stmt)
            screenshot = result.scalar_one_or_none()

            if not screenshot:
                logger.warning(f"File not found in DB: {file_path}")
                return

            if screenshot.status == "processed":
                logger.info(f"Skipping already processed: {file_path}")
                return

            ai_provider = await get_active_provider(db)
            logger.info(f"Using AI provider: {ai_provider}")

            valid, error_msg = await validate_provider(db, ai_provider)
            if not valid:
                raise ValueError(error_msg)

            screenshot.status = "processing"
            await db.commit()

            try:
                thumbnail_path = await generate_thumbnail(Path(file_path))
                screenshot.thumbnail_path = thumbnail_path
                await db.commit()
            except Exception as e:
                logger.error(f"Thumbnail generation failed for {file_path}: {e}")
                screenshot.thumbnail_path = None
                await db.commit()

            await process_screenshot(db, screenshot, ai_provider)
            logger.info(f"Finished: {file_path}")

    async def _mark_error(self, file_path: str, error_message: str):
        try:
            async with async_session() as db:
                stmt = select(Screenshot).where(Screenshot.file_path == file_path)
                result = await db.execute(stmt)
                screenshot = result.scalar_one_or_none()
                if screenshot:
                    screenshot.status = "error"
                    screenshot.error_message = error_message
                    await db.commit()
                    logger.error(
                        f"Marked {file_path} as error after retries: {error_message}"
                    )
        except Exception as e:
            logger.error(f"Failed to mark {file_path} as error: {e}")
