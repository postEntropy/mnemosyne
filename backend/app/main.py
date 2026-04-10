import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select, func

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)

logger = logging.getLogger("mnemosyne")

from app.services.queue_worker import QueueWorker
from app.services.watcher import start_watcher
from app.routers import screenshots, settings
from app.config import settings as app_settings

worker = QueueWorker()
watcher_handler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.models.database import run_migrations

    await run_migrations()
    await worker.start()
    observer, handler = start_watcher(worker)
    app.state.worker = worker
    app.state.watcher_handler = handler
    app.state.watcher_observer = observer
    yield
    observer.stop()
    observer.join(timeout=5)
    await worker.stop()


app = FastAPI(title="Mnemosyne", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Simplified for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

thumbnails_dir = Path(app_settings.thumbnails_dir)
thumbnails_dir.mkdir(parents=True, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=str(thumbnails_dir)), name="thumbnails")


@app.get("/screenshots-file/{file_path:path}")
async def serve_screenshot(file_path: str):
    import urllib.parse
    from fastapi.responses import JSONResponse

    original = urllib.parse.unquote(file_path)
    base_dir = Path(app_settings.screenshots_dir).resolve()
    requested = Path(original).expanduser()

    try:
        path = requested.resolve() if requested.is_absolute() else (base_dir / requested).resolve()
        path.relative_to(base_dir)
    except (OSError, ValueError):
        return JSONResponse(
            status_code=403,
            content={"error": "Access denied: file is outside screenshots folder"},
        )

    if not path.exists() or not path.is_file():
        return JSONResponse(
            status_code=404,
            content={"error": "Screenshot file not found", "path": original},
        )
    return FileResponse(str(path))


app.include_router(screenshots.router)
app.include_router(settings.router)


@app.get("/api/status")
async def status():
    from app.models.database import async_session
    from app.models.dead_letter import DeadLetterItem

    handler = getattr(app.state, "watcher_handler", None)
    observer = getattr(app.state, "watcher_observer", None)
    watcher_paused = handler.paused if handler is not None else False
    watcher_alive = observer.is_alive() if observer is not None else False

    async with async_session() as db:
        dlq_open = (
            await db.execute(
                select(func.count(DeadLetterItem.id)).where(DeadLetterItem.resolved.is_(False))
            )
        ).scalar_one()

    return {
        "worker_running": worker.running,
        "is_paused": worker.paused,
        "watcher_paused": watcher_paused,
        "watcher_alive": watcher_alive,
        "queue_size": worker.queue.qsize(),
        "dlq_open": dlq_open,
        "metrics": worker.get_metrics(),
    }


@app.post("/api/status/toggle-pause")
async def toggle_pause():
    new_state = await worker.toggle_pause()
    return {"is_paused": new_state}


@app.post("/api/status/toggle-watcher")
async def toggle_watcher_pause():
    handler = getattr(app.state, "watcher_handler", None)
    if handler is None:
        return {"watcher_paused": False}
    new_state = handler.toggle_pause()
    return {"watcher_paused": new_state}


@app.get("/api/health")
async def health_check():
    from app.models.database import engine
    from pathlib import Path

    checks = {
        "database": "unknown",
        "watcher_dir": "unknown",
        "thumbnails_dir": "unknown",
    }

    try:
        async with engine.connect() as conn:
            await conn.execute(select(1))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    watch_dir = Path(app_settings.screenshots_dir)
    checks["watcher_dir"] = "exists" if watch_dir.exists() else "missing"

    thumb_dir = Path(app_settings.thumbnails_dir)
    checks["thumbnails_dir"] = "exists" if thumb_dir.exists() else "missing"

    all_ok = all(v == "ok" or v == "exists" for v in checks.values())

    return {
        "status": "healthy" if all_ok else "degraded",
        "checks": checks,
    }
