import asyncio
import logging
from pathlib import Path
from datetime import datetime
from sqlalchemy import select

from app.models.database import async_session
from app.models.dead_letter import DeadLetterItem
from app.models.screenshot import Screenshot
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
        self.metrics = {
            "processed_total": 0,
            "failed_total": 0,
            "retry_total": 0,
            "total_processing_seconds": 0.0,
            "last_started_at": None,
            "last_finished_at": None,
            "last_error": None,
        }

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
        started_at = datetime.utcnow()
        self.metrics["last_started_at"] = started_at
        last_error = None
        provider_name = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                provider_name = await self._process_single(file_path)
                finished_at = datetime.utcnow()
                self.metrics["processed_total"] += 1
                self.metrics["total_processing_seconds"] += (
                    finished_at - started_at
                ).total_seconds()
                self.metrics["last_finished_at"] = finished_at
                return
            except Exception as e:
                last_error = e
                logger.warning(
                    f"Attempt {attempt}/{MAX_RETRIES} failed for {file_path}: {e}"
                )
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY_SECONDS * attempt
                    logger.info(f"Retrying in {delay}s...")
                    self.metrics["retry_total"] += 1
                    await asyncio.sleep(delay)
                else:
                    finished_at = datetime.utcnow()
                    self.metrics["failed_total"] += 1
                    self.metrics["total_processing_seconds"] += (
                        finished_at - started_at
                    ).total_seconds()
                    self.metrics["last_finished_at"] = finished_at
                    self.metrics["last_error"] = str(last_error)
                    await self._mark_error(
                        file_path,
                        str(last_error),
                        attempts=MAX_RETRIES,
                        provider_name=provider_name,
                    )
                    raise

    async def _process_single(self, file_path: str) -> str | None:
        async with async_session() as db:
            stmt = select(Screenshot).where(Screenshot.file_path == file_path)
            result = await db.execute(stmt)
            screenshot = result.scalar_one_or_none()

            if not screenshot:
                logger.warning(f"File not found in DB: {file_path}")
                return None

            if screenshot.status == "processed":
                logger.info(f"Skipping already processed: {file_path}")
                return None

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
            return ai_provider

    async def _mark_error(
        self,
        file_path: str,
        error_message: str,
        attempts: int,
        provider_name: str | None = None,
    ):
        try:
            async with async_session() as db:
                stmt = select(Screenshot).where(Screenshot.file_path == file_path)
                result = await db.execute(stmt)
                screenshot = result.scalar_one_or_none()
                screenshot_id = None
                if screenshot:
                    screenshot.status = "error"
                    screenshot.error_message = error_message
                    screenshot_id = screenshot.id

                existing_dlq = (
                    await db.execute(
                        select(DeadLetterItem).where(
                            DeadLetterItem.file_path == file_path,
                            DeadLetterItem.resolved.is_(False),
                        )
                    )
                ).scalar_one_or_none()

                if existing_dlq:
                    existing_dlq.error_message = error_message
                    existing_dlq.attempts = max(existing_dlq.attempts, attempts)
                    existing_dlq.provider = provider_name or existing_dlq.provider
                    existing_dlq.failed_at = datetime.utcnow()
                    existing_dlq.screenshot_id = screenshot_id
                else:
                    db.add(
                        DeadLetterItem(
                            screenshot_id=screenshot_id,
                            file_path=file_path,
                            error_message=error_message,
                            attempts=attempts,
                            provider=provider_name,
                            failed_at=datetime.utcnow(),
                            resolved=False,
                        )
                    )

                await db.commit()

                if screenshot:
                    logger.error(
                        f"Marked {file_path} as error after retries: {error_message}"
                    )
        except Exception as e:
            logger.error(f"Failed to mark {file_path} as error: {e}")

    def get_metrics(self) -> dict:
        processed_total = int(self.metrics["processed_total"])
        failed_total = int(self.metrics["failed_total"])
        handled = processed_total + failed_total
        avg_seconds = (
            self.metrics["total_processing_seconds"] / handled if handled > 0 else 0.0
        )

        return {
            "processed_total": processed_total,
            "failed_total": failed_total,
            "retry_total": int(self.metrics["retry_total"]),
            "avg_processing_seconds": round(avg_seconds, 3),
            "last_started_at": self.metrics["last_started_at"].isoformat()
            if self.metrics["last_started_at"]
            else None,
            "last_finished_at": self.metrics["last_finished_at"].isoformat()
            if self.metrics["last_finished_at"]
            else None,
            "last_error": self.metrics["last_error"],
        }
