import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.models.database import run_migrations

    await run_migrations()
    await worker.start()
    observer = start_watcher(worker)
    app.state.worker = worker
    yield
    observer.stop()
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

    original = urllib.parse.unquote(file_path)
    path = Path(original)
    if not path.exists():
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=404,
            content={"error": "Screenshot file not found", "path": original},
        )
    return FileResponse(str(path))


app.include_router(screenshots.router)
app.include_router(settings.router)


@app.get("/api/status")
async def status():
    return {
        "worker_running": worker.running,
        "is_paused": worker.paused,
        "queue_size": worker.queue.qsize(),
    }


@app.post("/api/status/toggle-pause")
async def toggle_pause():
    new_state = await worker.toggle_pause()
    return {"is_paused": new_state}


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
