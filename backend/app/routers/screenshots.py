import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.models.dead_letter import DeadLetterItem
from app.models.screenshot import Screenshot
from app.services.archive_qa import ask_archive, suggest_archive_questions

try:
    import tiktoken
except Exception:  # pragma: no cover - optional dependency fallback
    tiktoken = None

logger = logging.getLogger("mnemosyne.router.screenshots")
logger.setLevel(logging.DEBUG)

router = APIRouter(prefix="/api/screenshots", tags=["screenshots"])

ASK_SUGGESTIONS_CACHE = {
    "items": [],
    "updated_at": None,
}
ASK_SUGGESTIONS_TTL_SECONDS = 180

DB_TOKEN_ESTIMATE_CACHE = {
    "payload": None,
    "updated_at": None,
}
DB_TOKEN_ESTIMATE_TTL_SECONDS = 120
DB_TOKENIZER_ENCODING = "cl100k_base"


class AskArchiveRequest(BaseModel):
    question: str
    limit: int = 8
    mode: str | None = None


class UpdateTagsRequest(BaseModel):
    tags: list[str]


def _list_supported_files(watch_dir, extensions):
    try:
        return [f for f in watch_dir.iterdir() if f.suffix.lower() in extensions and f.is_file()]
    except OSError as e:
        logger.error(f"Failed to enumerate screenshots directory {watch_dir}: {e}")
        raise HTTPException(status_code=500, detail="Failed to read screenshots folder")


def _normalize_app_name(value: str | None) -> str | None:
    if not value:
        return None
    app = value.strip()
    if not app:
        return None
    blocked = {
        "unknown",
        "app not detected",
        "capture",
        "unknown app",
    }
    if app.lower() in blocked:
        return None
    return app


def _extract_tags(raw_tags: str | None) -> list[str]:
    if not raw_tags:
        return []
    try:
        parsed = json.loads(raw_tags)
        if not isinstance(parsed, list):
            return []
        return [str(tag).strip() for tag in parsed if str(tag).strip() and str(tag).strip() != "#"]
    except (json.JSONDecodeError, TypeError):
        return []


def _estimate_tokens_from_chars(total_chars: int) -> int:
    # Fast approximation that tracks OpenAI-like tokenization reasonably well for mixed text.
    return max(0, int(round(total_chars / 4.0)))


def _build_tokenizable_text(ss: Screenshot) -> str:
    return "\n".join(
        [
            ss.description or "",
            ss.summary or "",
            ss.application or "",
            ss.filename or "",
            ss.tags or "",
        ]
    )


async def _get_db_token_estimate(db: AsyncSession) -> dict:
    now = datetime.utcnow()
    cached_at = DB_TOKEN_ESTIMATE_CACHE.get("updated_at")
    cached_payload = DB_TOKEN_ESTIMATE_CACHE.get("payload")

    if (
        cached_payload
        and cached_at is not None
        and (now - cached_at).total_seconds() < DB_TOKEN_ESTIMATE_TTL_SECONDS
    ):
        return cached_payload

    rows = (
        await db.execute(
            select(Screenshot)
            .where(Screenshot.status != "ignored")
            .order_by(Screenshot.id.asc())
        )
    ).scalars().all()

    rows_counted = len(rows)
    total_chars = 0
    total_tokens = 0
    tokenizer_name = "heuristic_chars_div_4"

    if tiktoken is not None:
        try:
            encoding = tiktoken.get_encoding(DB_TOKENIZER_ENCODING)
            tokenizer_name = f"tiktoken:{DB_TOKENIZER_ENCODING}"
            for ss in rows:
                text = _build_tokenizable_text(ss)
                total_chars += len(text)
                total_tokens += len(encoding.encode(text))
        except Exception:
            logger.exception("DB token estimate fell back to heuristic")
            total_tokens = 0

    if total_tokens <= 0:
        total_chars = 0
        for ss in rows:
            text = _build_tokenizable_text(ss)
            total_chars += len(text)
        total_tokens = _estimate_tokens_from_chars(total_chars)

    payload = {
        "db_total_tokens_estimate": total_tokens,
        "db_total_chars": total_chars,
        "db_rows_counted": rows_counted,
        "tokenizer_name": tokenizer_name,
        "token_count_updated_at": now.isoformat(),
    }

    DB_TOKEN_ESTIMATE_CACHE["payload"] = payload
    DB_TOKEN_ESTIMATE_CACHE["updated_at"] = now
    return payload


@router.get("")
async def list_screenshots(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    tags: list[str] = Query(default=[]),
    apps: list[str] = Query(default=[]),
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

    normalized_tags = [tag.strip() for tag in tags if tag and tag.strip()]
    for tag in normalized_tags:
        base_query = base_query.where(Screenshot.tags.ilike(f'%"{tag}"%'))

    normalized_apps = [app.strip() for app in apps if app and app.strip()]
    if normalized_apps:
        base_query = base_query.where(Screenshot.application.in_(normalized_apps))

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
                Screenshot.filename.ilike(pattern),
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
    stats_row = (
        await db.execute(
            select(
                func.count(Screenshot.id),
                func.coalesce(
                    func.sum(case((Screenshot.status == "processed", 1), else_=0)), 0
                ),
                func.coalesce(
                    func.sum(case((Screenshot.status == "pending", 1), else_=0)), 0
                ),
                func.coalesce(
                    func.sum(case((Screenshot.status == "processing", 1), else_=0)), 0
                ),
                func.coalesce(
                    func.sum(case((Screenshot.status == "error", 1), else_=0)), 0
                ),
            ).where(Screenshot.status != "ignored")
        )
    ).one()

    total = int(stats_row[0] or 0)
    processed = int(stats_row[1] or 0)
    pending = int(stats_row[2] or 0)
    processing = int(stats_row[3] or 0)
    errors = int(stats_row[4] or 0)

    apps_result = await db.execute(
        select(Screenshot.application, func.count(Screenshot.id))
        .where(Screenshot.application != "", Screenshot.status != "ignored")
        .group_by(Screenshot.application)
        .order_by(func.count(Screenshot.id).desc())
        .limit(10)
    )
    top_apps = [{"app": row[0], "count": row[1]} for row in apps_result.all()]

    token_stats = await _get_db_token_estimate(db)

    return {
        "total": total,
        "processed": processed,
        "pending": pending,
        "processing": processing,
        "errors": errors,
        "top_apps": top_apps,
        **token_stats,
    }


@router.get("/ask-suggestions")
async def get_ask_suggestions(
    refresh: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Ask suggestions requested (refresh=%s)", refresh)
    now = datetime.utcnow()
    cache_time = ASK_SUGGESTIONS_CACHE.get("updated_at")
    cache_items = ASK_SUGGESTIONS_CACHE.get("items") or []

    if (
        not refresh
        and cache_time is not None
        and (now - cache_time).total_seconds() < ASK_SUGGESTIONS_TTL_SECONDS
        and cache_items
    ):
        logger.info("Ask suggestions served from cache (count=%d)", len(cache_items))
        return {"suggestions": cache_items, "cached": True}

    rows = (
        await db.execute(
            select(
                Screenshot.application,
                Screenshot.tags,
                Screenshot.summary,
                Screenshot.filename,
            )
            .where(Screenshot.status == "processed")
            .where(Screenshot.status != "ignored")
            .order_by(Screenshot.timestamp.desc())
            .limit(600)
        )
    ).all()

    app_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}

    for app_raw, tags_raw, _, _ in rows:
        app = _normalize_app_name(app_raw)
        if app:
            app_counts[app] = app_counts.get(app, 0) + 1

        for tag in _extract_tags(tags_raw):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    top_apps = sorted(app_counts.items(), key=lambda item: item[1], reverse=True)
    top_tags = sorted(tag_counts.items(), key=lambda item: item[1], reverse=True)

    suggestions = [
        {
            "title": "Latest screenshot details",
            "prompt": "What are the most important details visible in my latest screenshots?",
            "kind": "timeline",
        }
    ]

    if top_apps:
        app_name, _ = top_apps[0]
        suggestions.append(
            {
                "title": f"Recent progress in {app_name}",
                "prompt": f"What changed in my recent {app_name} screenshots, and which values or states stand out?",
                "kind": "application",
            }
        )

    if top_tags:
        tag_name, _ = top_tags[0]
        suggestions.append(
            {
                "title": f"Evidence for #{tag_name}",
                "prompt": f"Show the screenshots tagged with {tag_name} and summarize the concrete events they capture.",
                "kind": "tag",
            }
        )

    # Guarantee exactly 3 suggestions, prioritizing screenshot-derived prompts.
    while len(suggestions) < 3:
        fallback_candidates = [
            {
                "title": "Change since yesterday",
                "prompt": "Based on yesterday versus today screenshots, what changed the most?",
                "kind": "timeline",
            },
            {
                "title": "Visible numbers and stats",
                "prompt": "Which screenshots contain clear numeric values or stats, and what are they?",
                "kind": "application",
            },
        ]
        next_item = fallback_candidates[len(suggestions) % len(fallback_candidates)]
        suggestions.append(next_item)

    ai_suggestions = await suggest_archive_questions(db, limit=3)
    final_suggestions = []
    seen_prompts = set()

    for item in ai_suggestions:
        prompt = (item.get("prompt") or "").strip()
        if not prompt or prompt in seen_prompts:
            continue
        final_suggestions.append(item)
        seen_prompts.add(prompt)
        if len(final_suggestions) >= 3:
            break

    if len(final_suggestions) < 3:
        for item in suggestions:
            prompt = (item.get("prompt") or "").strip()
            if not prompt or prompt in seen_prompts:
                continue
            final_suggestions.append(item)
            seen_prompts.add(prompt)
            if len(final_suggestions) >= 3:
                break

    final_suggestions = final_suggestions[:3]
    ASK_SUGGESTIONS_CACHE["items"] = final_suggestions
    ASK_SUGGESTIONS_CACHE["updated_at"] = now

    logger.info("Ask suggestions refreshed (count=%d, used_ai=%s)", len(final_suggestions), bool(ai_suggestions))

    return {"suggestions": final_suggestions, "cached": False}


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


@router.put("/{screenshot_id}/tags")
async def update_screenshot_tags(
    screenshot_id: int,
    payload: UpdateTagsRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Screenshot).where(Screenshot.id == screenshot_id))
    screenshot = result.scalar_one_or_none()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    cleaned_tags = []
    seen = set()
    for tag in payload.tags:
        cleaned = " ".join((tag or "").strip().split())
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        cleaned_tags.append(cleaned)

    screenshot.tags = json.dumps(cleaned_tags)
    await db.commit()
    await db.refresh(screenshot)

    return {"message": "Screenshot tags updated", "screenshot": screenshot.to_dict()}


@router.get("/dlq")
async def list_dead_letters(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    resolved: bool | None = None,
    db: AsyncSession = Depends(get_db),
):
    base_query = select(DeadLetterItem)
    if resolved is not None:
        base_query = base_query.where(DeadLetterItem.resolved.is_(resolved))

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = (
        base_query.order_by(DeadLetterItem.failed_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    items = (await db.execute(query)).scalars().all()

    return {
        "items": [item.to_dict() for item in items],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total > 0 else 0,
    }


@router.post("/dlq/{item_id}/retry")
async def retry_dead_letter(
    item_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    item = (
        await db.execute(select(DeadLetterItem).where(DeadLetterItem.id == item_id))
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Dead-letter item not found")

    screenshot = (
        await db.execute(select(Screenshot).where(Screenshot.file_path == item.file_path))
    ).scalar_one_or_none()
    if not screenshot:
        raise HTTPException(
            status_code=404,
            detail="Screenshot for this dead-letter item was not found",
        )

    screenshot.status = "pending"
    screenshot.error_message = None
    screenshot.processed_at = None
    item.resolved = True
    item.retried_at = datetime.utcnow()
    await db.commit()

    worker = request.app.state.worker
    await worker.enqueue(screenshot.file_path)
    return {
        "message": "Dead-letter item requeued",
        "item": item.to_dict(),
    }


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
    logger.info(
        "Ask archive requested (question_chars=%d, limit=%s, mode=%s)",
        len(question),
        payload.limit,
        payload.mode,
    )
    if len(question) < 3:
        raise HTTPException(status_code=400, detail="Question is too short")

    limit = max(1, min(payload.limit, 15))
    mode = (payload.mode or "").strip().lower() or None
    result = await ask_archive(db, question=question, limit=limit, mode=mode)
    logger.info(
        "Ask archive completed (provider=%s, context_items=%s, retrieved_items=%s, matches=%d)",
        result.get("provider"),
        result.get("context_items"),
        result.get("retrieved_items"),
        len(result.get("matches") or []),
    )
    return result
