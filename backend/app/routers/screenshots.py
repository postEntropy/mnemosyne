import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.models.screenshot import Screenshot
from app.services.archive_qa import ask_archive

logger = logging.getLogger("mnemosyne.router.screenshots")

router = APIRouter(prefix="/api/screenshots", tags=["screenshots"])


class AskArchiveRequest(BaseModel):
    question: str
    limit: int = 8


def _list_supported_files(watch_dir, extensions):
    try:
        return [f for f in watch_dir.iterdir() if f.suffix.lower() in extensions and f.is_file()]
    except OSError as e:
        logger.error(f"Failed to enumerate screenshots directory {watch_dir}: {e}")
        raise HTTPException(status_code=500, detail="Failed to read screenshots folder")


@router.get("")
async def list_screenshots(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    base_query = select(Screenshot)
    if status:
        base_query = base_query.where(Screenshot.status == status)
    else:
        base_query = base_query.where(Screenshot.status != "ignored")
    if date_from:
        try:
            df = datetime.fromisoformat(date_from)
            base_query = base_query.where(Screenshot.timestamp >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            if len(date_to) == 10:
                dt = dt.replace(hour=23, minute=59, second=59)
            base_query = base_query.where(Screenshot.timestamp <= dt)
        except ValueError:
            pass

    # Count total for this specific filter
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    query = base_query.order_by(Screenshot.timestamp.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    screenshots = result.scalars().all()
    
    return {
        "screenshots": [s.to_dict() for s in screenshots],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total > 0 else 0,
    }


@router.get("/count")
async def count_screenshots(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(func.count(Screenshot.id))
    if status:
        query = query.where(Screenshot.status == status)
    else:
        query = query.where(Screenshot.status != "ignored")
    result = await db.execute(query)
    return {"count": result.scalar_one()}


@router.get("/search")
async def search_screenshots(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    pattern = f"%{q}%"
    base_query = (
        select(Screenshot)
        .where(
            or_(
                Screenshot.description.ilike(pattern),
                Screenshot.application.ilike(pattern),
                Screenshot.summary.ilike(pattern),
                Screenshot.tags.ilike(pattern),
            )
        )
        .where(Screenshot.status != "ignored")
        .order_by(Screenshot.timestamp.desc())
    )

    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    query = base_query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    screenshots = result.scalars().all()

    return {
        "screenshots": [s.to_dict() for s in screenshots],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total > 0 else 0,
    }


@router.get("/tags")
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Screenshot.tags).where(
            Screenshot.tags != "[]", Screenshot.status != "ignored"
        )
    )
    all_tags = set()
    for row in result.scalars().all():
        try:
            all_tags.update(json.loads(row))
        except (json.JSONDecodeError, TypeError):
            pass
    return {"tags": sorted(all_tags)}


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    total = (
        await db.execute(
            select(func.count(Screenshot.id)).where(Screenshot.status != "ignored")
        )
    ).scalar_one()
    processed = (
        await db.execute(
            select(func.count(Screenshot.id)).where(
                Screenshot.status == "processed", Screenshot.status != "ignored"
            )
        )
    ).scalar_one()
    pending = (
        await db.execute(
            select(func.count(Screenshot.id)).where(
                Screenshot.status == "pending", Screenshot.status != "ignored"
            )
        )
    ).scalar_one()
    processing = (
        await db.execute(
            select(func.count(Screenshot.id)).where(
                Screenshot.status == "processing", Screenshot.status != "ignored"
            )
        )
    ).scalar_one()
    errors = (
        await db.execute(
            select(func.count(Screenshot.id)).where(
                Screenshot.status == "error", Screenshot.status != "ignored"
            )
        )
    ).scalar_one()

    apps_result = await db.execute(
        select(Screenshot.application, func.count(Screenshot.id))
        .where(Screenshot.application != "", Screenshot.status != "ignored")
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


@router.get("/scan-progress")
async def scan_progress(request: Request, db: AsyncSession = Depends(get_db)):
    total = (
        await db.execute(
            select(func.count(Screenshot.id)).where(Screenshot.status != "ignored")
        )
    ).scalar_one()
    processed = (
        await db.execute(
            select(func.count(Screenshot.id)).where(
                Screenshot.status == "processed", Screenshot.status != "ignored"
            )
        )
    ).scalar_one()
    pending = (
        await db.execute(
            select(func.count(Screenshot.id)).where(
                Screenshot.status == "pending", Screenshot.status != "ignored"
            )
        )
    ).scalar_one()
    errors = (
        await db.execute(
            select(func.count(Screenshot.id)).where(
                Screenshot.status == "error", Screenshot.status != "ignored"
            )
        )
    ).scalar_one()

    worker = request.app.state.worker
    import os

    current_filename = (
        os.path.basename(worker.current_file) if worker.current_file else None
    )

    return {
        "total": total,
        "processed": processed,
        "pending": pending,
        "errors": errors,
        "current_file": current_filename,
    }


@router.get("/onboarding")
async def onboarding_info(db: AsyncSession = Depends(get_db)):
    from pathlib import Path
    from app.config import settings as app_settings

    watch_dir = Path(app_settings.screenshots_dir)
    if not watch_dir.exists():
        return {
            "folder_exists": False,
            "total_in_folder": 0,
            "total_in_db": 0,
            "unregistered": 0,
        }

    extensions = {".png", ".jpg", ".jpeg", ".webp"}
    files_on_disk = _list_supported_files(watch_dir, extensions)
    total_in_folder = len(files_on_disk)

    registered_paths = {
        row[0] for row in (await db.execute(select(Screenshot.file_path))).all()
    }

    unregistered_or_pending = 0
    for f in files_on_disk:
        f_str = str(f)
        if f_str not in registered_paths:
            unregistered_or_pending += 1
        else:
            stmt = select(Screenshot).where(Screenshot.file_path == f_str)
            res = await db.execute(stmt)
            ss = res.scalar_one_or_none()
            if ss and ss.status not in ("processed", "ignored"):
                unregistered_or_pending += 1

    return {
        "folder_exists": True,
        "total_in_folder": total_in_folder,
        "unregistered": unregistered_or_pending,
    }


@router.post("/onboarding/ignore-pending")
async def ignore_onboarding_pending(db: AsyncSession = Depends(get_db)):
    from pathlib import Path
    from app.config import settings as app_settings

    watch_dir = Path(app_settings.screenshots_dir)
    if not watch_dir.exists():
        return {"ignored": 0}

    extensions = {".png", ".jpg", ".jpeg", ".webp"}
    files_on_disk = _list_supported_files(watch_dir, extensions)
    file_paths = [str(f) for f in files_on_disk]

    if not file_paths:
        return {"ignored": 0}

    result = await db.execute(
        select(Screenshot).where(Screenshot.file_path.in_(file_paths))
    )
    screenshots = result.scalars().all()

    ignored = 0
    for ss in screenshots:
        if ss.status != "processed":
            ss.status = "ignored"
            ss.error_message = None
            ignored += 1

    if ignored:
        await db.commit()

    return {"ignored": ignored}


@router.get("/{screenshot_id}")
async def get_screenshot(screenshot_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Screenshot).where(Screenshot.id == screenshot_id))
    screenshot = result.scalar_one_or_none()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return screenshot.to_dict()


@router.post("/{screenshot_id}/rescan")
async def rescan_screenshot(
    screenshot_id: int, request: Request, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Screenshot).where(Screenshot.id == screenshot_id))
    screenshot = result.scalar_one_or_none()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    screenshot.status = "pending"
    screenshot.error_message = None
    screenshot.processed_at = None
    await db.commit()
    worker = request.app.state.worker
    await worker.enqueue(screenshot.file_path)
    return {"message": "Screenshot queued for rescanning"}


@router.delete("/{screenshot_id}")
async def delete_screenshot(
    screenshot_id: int, request: Request, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Screenshot).where(Screenshot.id == screenshot_id))
    screenshot = result.scalar_one_or_none()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    from pathlib import Path

    thumbnail_deleted = False
    if screenshot.thumbnail_path:
        thumb_path = Path(screenshot.thumbnail_path)
        if thumb_path.exists():
            thumb_path.unlink()
            thumbnail_deleted = True

    await db.delete(screenshot)
    await db.commit()

    return {"message": "Screenshot deleted", "thumbnail_deleted": thumbnail_deleted}


@router.post("/scan-folder")
async def scan_folder(
    request: Request,
    db: AsyncSession = Depends(get_db),
    batch_size: int = Query(50, ge=1, le=500),
    batch_index: int = Query(0, ge=0),
):
    from pathlib import Path
    from app.config import settings as app_settings

    watch_dir = Path(app_settings.screenshots_dir)
    if not watch_dir.exists():
        raise HTTPException(status_code=404, detail="Screenshots folder not found")

    extensions = {".png", ".jpg", ".jpeg", ".webp"}

    files_on_disk = _list_supported_files(watch_dir, extensions)
    all_files_on_disk = sorted([str(f) for f in files_on_disk])

    query = select(Screenshot.file_path).where(Screenshot.status == "processed")
    processed_in_db = {row[0] for row in (await db.execute(query)).all()}

    to_process = [f for f in all_files_on_disk if f not in processed_in_db]
    total_to_process = len(to_process)

    start = batch_index * batch_size
    end = start + batch_size
    batch = to_process[start:end]

    queued_paths = []

    for fp in batch:
        path = Path(fp)
        if not path.exists():
            logger.warning(f"File no longer exists on disk, skipping: {fp}")
            continue

        stmt = select(Screenshot).where(Screenshot.file_path == fp)
        res = await db.execute(stmt)
        screenshot = res.scalar_one_or_none()

        if not screenshot:
            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime)
            except FileNotFoundError:
                logger.warning(f"File disappeared before metadata read, skipping: {fp}")
                continue
            screenshot = Screenshot(
                file_path=fp,
                filename=path.name,
                timestamp=mtime,
                status="pending",
            )
            db.add(screenshot)
        else:
            screenshot.status = "pending"
            screenshot.error_message = None

        queued_paths.append(fp)

    await db.commit()

    worker = request.app.state.worker
    for fp in queued_paths:
        await worker.enqueue(fp)

    return {
        "queued": len(queued_paths),
        "total_new": total_to_process,
        "batch_index": batch_index,
        "batch_size": batch_size,
        "remaining": max(0, total_to_process - end),
        "has_more": end < total_to_process,
    }


@router.post("/ask-archive")
async def ask_archive_endpoint(
    payload: AskArchiveRequest, db: AsyncSession = Depends(get_db)
):
    question = (payload.question or "").strip()
    if len(question) < 3:
        raise HTTPException(status_code=400, detail="Question is too short")

    limit = max(1, min(payload.limit, 15))
    result = await ask_archive(db, question=question, limit=limit)
    return result
