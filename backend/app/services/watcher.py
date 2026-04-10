import time
import asyncio
import logging
import threading
from pathlib import Path
from datetime import datetime
from sqlalchemy import select
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from app.models.database import async_session
from app.models.screenshot import Screenshot
from app.services.queue_worker import QueueWorker
from app.config import settings

logger = logging.getLogger("mnemosyne.watcher")


class ScreenshotHandler(FileSystemEventHandler):
    def __init__(self, worker: QueueWorker, loop: asyncio.AbstractEventLoop):
        self.worker = worker
        self._loop = loop
        self.paused = False
        self._seen: dict[str, float] = {}
        self._seen_lock = threading.Lock()
        self._seen_ttl_seconds = 30

    def set_paused(self, paused: bool):
        self.paused = paused

    def toggle_pause(self) -> bool:
        self.paused = not self.paused
        state = "paused" if self.paused else "resumed"
        logger.info(f"Watcher {state}.")
        return self.paused

    def _should_process(self, file_path: str) -> bool:
        now = time.time()
        with self._seen_lock:
            # Cleanup old dedupe entries to avoid unbounded growth.
            expired = [p for p, ts in self._seen.items() if (now - ts) > self._seen_ttl_seconds]
            for p in expired:
                self._seen.pop(p, None)

            last_seen = self._seen.get(file_path)
            if last_seen and (now - last_seen) < self._seen_ttl_seconds:
                return False

            self._seen[file_path] = now
            return True

    def _is_supported_file(self, file_path: str) -> bool:
        return file_path.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))

    def _accept_event(self, event, file_path: str | None = None) -> str | None:
        if self.paused:
            return None
        if event.is_directory:
            return None

        candidate = file_path or getattr(event, "src_path", None)
        if not candidate or not self._is_supported_file(candidate):
            return None
        if not self._should_process(candidate):
            return None
        return candidate

    def on_closed(self, event):
        file_path = self._accept_event(event)
        if file_path:
            self._handle_file(file_path)

    def on_created(self, event):
        file_path = self._accept_event(event)
        if file_path:
            self._handle_file(file_path)

    def on_moved(self, event):
        dest_path = getattr(event, "dest_path", None)
        file_path = self._accept_event(event, dest_path)
        if file_path:
            self._handle_file(file_path)

    def on_modified(self, event):
        file_path = self._accept_event(event)
        if file_path:
            self._handle_file(file_path)

    def _handle_file(self, file_path: str):
        try:
            future = asyncio.run_coroutine_threadsafe(
                self._register_and_enqueue(file_path), self._loop
            )
        except Exception:
            logger.exception("Failed to schedule watcher task for %s", file_path)
            return

        def _log_future_exception(done_future):
            try:
                done_future.result()
            except Exception:
                logger.exception("Watcher task failed for %s", file_path)

        future.add_done_callback(_log_future_exception)

    async def _wait_until_stable(self, path: Path, attempts: int = 6, delay: float = 0.2):
        previous_size: int | None = None
        for _ in range(attempts):
            if not path.exists():
                return
            try:
                size = path.stat().st_size
            except FileNotFoundError:
                return

            if size > 0 and previous_size == size:
                return

            previous_size = size
            await asyncio.sleep(delay)

    async def _register_and_enqueue(self, file_path: str):
        async with async_session() as db:
            existing = (
                await db.execute(
                    select(Screenshot).where(Screenshot.file_path == file_path)
                )
            ).scalar_one_or_none()

            if existing:
                if existing.status in ("processed", "error"):
                    existing.status = "pending"
                    existing.error_message = None
                    existing.processed_at = None
                    await db.commit()
                await self.worker.enqueue(file_path)
                return

            path = Path(file_path)
            if not path.exists():
                logger.warning(f"Watcher received file that no longer exists: {file_path}")
                return

            await self._wait_until_stable(path)

            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime)
            except FileNotFoundError:
                logger.warning(f"File disappeared before metadata read: {file_path}")
                return

            screenshot = Screenshot(
                file_path=file_path,
                filename=path.name,
                timestamp=mtime,
                status="pending",
            )
            db.add(screenshot)
            await db.commit()

        await self.worker.enqueue(file_path)


def start_watcher(worker: QueueWorker) -> tuple[Observer, ScreenshotHandler]:
    watch_dir = Path(settings.screenshots_dir)
    watch_dir.mkdir(parents=True, exist_ok=True)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    handler = ScreenshotHandler(worker, loop)
    observer = Observer()
    observer.schedule(handler, str(watch_dir), recursive=False)
    observer.start()
    return observer, handler
