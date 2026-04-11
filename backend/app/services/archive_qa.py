import json
import logging
import re
import time
from datetime import datetime
from typing import Literal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.models.screenshot import Screenshot
from app.models.settings import Setting


logger = logging.getLogger("mnemosyne.ask")
logger.setLevel(logging.DEBUG)

STOPWORDS = {
    "a", "o", "os", "as", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
    "um", "uma", "uns", "umas", "para", "por", "com", "sem", "que", "se", "ou", "como", "qual",
    "quais", "quando", "onde", "isso", "essa", "esse", "esta", "este", "estas", "estes", "ao", "aos",
    "the", "and", "or", "for", "with", "without", "from", "into", "what", "which", "when", "where",
    "this", "that", "these", "those", "you", "your", "about", "show", "tell", "does", "did", "are",
}


def _tokenize(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9_]+", (text or "").lower())
        if len(t) > 1 and t not in STOPWORDS
    }


def _score_screenshot_relevance(question_tokens: set[str], ss: Screenshot) -> int:
    if not question_tokens:
        return 0

    filename_tokens = _tokenize(ss.filename or "")
    app_tokens = _tokenize(ss.application or "")
    summary_tokens = _tokenize(ss.summary or "")
    description_tokens = _tokenize(ss.description or "")
    tag_tokens = _tokenize(" ".join(_safe_tags(ss.tags)))

    score = 0
    score += len(question_tokens.intersection(summary_tokens)) * 4
    score += len(question_tokens.intersection(tag_tokens)) * 4
    score += len(question_tokens.intersection(app_tokens)) * 3
    score += len(question_tokens.intersection(filename_tokens)) * 2
    score += len(question_tokens.intersection(description_tokens)) * 1

    return score


def _safe_tags(raw_tags) -> list[str]:
    if isinstance(raw_tags, list):
        return [str(t) for t in raw_tags]
    if isinstance(raw_tags, str):
        try:
            parsed = json.loads(raw_tags)
            if isinstance(parsed, list):
                return [str(t) for t in parsed]
        except json.JSONDecodeError:
            return []
    return []


def _build_context_line(ss: Screenshot) -> str:
    tags = _safe_tags(ss.tags)
    ts = ss.timestamp.isoformat() if isinstance(ss.timestamp, datetime) else ""
    return (
        f"id={ss.id} | file={ss.filename} | app={ss.application or 'unknown'} | "
        f"timestamp={ts} | summary={ss.summary or ''} | "
        f"description={ss.description or ''} | tags={', '.join(tags)}"
    )


def _extract_json(raw: str) -> dict | None:
    raw = (raw or "").strip()
    if "```json" in raw:
        raw = raw.split("```json", 1)[1].split("```", 1)[0].strip()
    elif raw.startswith("```") and "```" in raw[3:]:
        raw = raw.split("```", 1)[1].split("```", 1)[0].strip()

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]

    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        return None
    return None


async def _ask_with_ollama(prompt: str, settings_map: dict[str, str]) -> str:
    base_url = (settings_map.get("ollama_base_url") or app_settings.ollama_base_url).rstrip("/")
    model = settings_map.get("ollama_model") or app_settings.ollama_model

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 700},
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{base_url}/api/generate", json=payload)
        resp.raise_for_status()
        return resp.json().get("response", "")


async def _ask_with_openrouter(
    prompt: str,
    settings_map: dict[str, str],
    *,
    flow: str = "ask",
) -> str:
    api_key = (settings_map.get("openrouter_api_key") or "").strip()
    model = (
        settings_map.get("ask_openrouter_model")
        or settings_map.get("openrouter_model")
        or app_settings.ask_openrouter_model
        or app_settings.openrouter_model
    )

    if not api_key:
        raise ValueError("OpenRouter API key is not configured")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/mnemosyne",
        "X-Title": "Mnemosyne",
    }
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }

    logger.info(
        "OpenRouter request started (flow=%s, model=%s, prompt_chars=%d)",
        flow,
        model,
        len(prompt),
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        started_at = time.monotonic()
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
        )

        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        logger.info(
            "OpenRouter response received (flow=%s, model=%s, status=%s, elapsed_ms=%d)",
            flow,
            model,
            resp.status_code,
            elapsed_ms,
        )

        if resp.status_code >= 400:
            body_preview = (resp.text or "")[:800]
            logger.error(
                "OpenRouter error response (flow=%s, model=%s, status=%s, body=%s)",
                flow,
                model,
                resp.status_code,
                body_preview,
            )
        resp.raise_for_status()

        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            logger.error(
                "OpenRouter response missing choices (flow=%s, model=%s)",
                flow,
                model,
            )
            raise ValueError("OpenRouter response missing choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not content:
            logger.error(
                "OpenRouter response missing content (flow=%s, model=%s)",
                flow,
                model,
            )
            raise ValueError("OpenRouter response missing content")

        logger.info(
            "OpenRouter response parsed (flow=%s, model=%s, content_chars=%d)",
            flow,
            model,
            len(str(content)),
        )
        return content


async def _ask_with_gemini(prompt: str, settings_map: dict[str, str]) -> str:
    api_key = (settings_map.get("gemini_api_key") or "").strip()
    model = settings_map.get("gemini_model") or app_settings.gemini_model

    if not api_key:
        raise ValueError("Gemini API key is not configured")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 800,
        },
    }

    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(endpoint, params={"key": api_key}, json=payload)
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise ValueError("Gemini response missing candidates")
        parts = ((candidates[0].get("content") or {}).get("parts") or [])
        content_parts = [p.get("text", "") for p in parts if isinstance(p, dict)]
        content = "\n".join([p for p in content_parts if p]).strip()
        if not content:
            raise ValueError("Gemini response missing content")
        return content


def _parse_limit(raw_value: str | int | None, fallback: int, *, min_value: int = 1, max_value: int = 20000) -> int:
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = fallback
    return max(min_value, min(value, max_value))


async def ask_archive(
    db: AsyncSession,
    question: str,
    limit: int = 8,
    mode: str | None = None,
) -> dict:
    settings_result = await db.execute(select(Setting))
    settings_map = {s.key: s.value for s in settings_result.scalars().all()}
    provider = (
        settings_map.get("ask_provider")
        or settings_map.get("ai_provider")
        or app_settings.ask_provider
        or "openrouter"
    ).strip().lower()

    if provider != "openrouter":
        # Ask Mnemosyne is OpenRouter-first. Keep fallback only if explicitly requested later.
        provider = "openrouter"

    configured_mode = (
        settings_map.get("ask_default_mode")
        or app_settings.ask_default_mode
        or "balanced"
    ).strip().lower()
    mode_value = (mode or configured_mode or "balanced").strip().lower()
    if mode_value not in {"quick", "balanced", "deep"}:
        mode_value = "balanced"

    quick_limit = _parse_limit(settings_map.get("ask_quick_limit"), app_settings.ask_quick_limit)
    balanced_limit = _parse_limit(settings_map.get("ask_balanced_limit"), app_settings.ask_balanced_limit)
    deep_limit = _parse_limit(settings_map.get("ask_deep_limit"), app_settings.ask_deep_limit)

    retrieval_limit_by_mode = {
        "quick": quick_limit,
        "balanced": balanced_limit,
        "deep": deep_limit,
    }
    retrieval_limit = retrieval_limit_by_mode.get(mode_value, balanced_limit)

    shortlist_size_by_mode = {
        "quick": 80,
        "balanced": 500,
        "deep": 2000,
    }
    shortlist_size = shortlist_size_by_mode.get(mode_value, 500)

    context_char_budget_by_mode = {
        "quick": 140_000,
        "balanced": 520_000,
        "deep": 1_350_000,
    }
    context_char_budget = context_char_budget_by_mode.get(mode_value, 520_000)

    result = await db.execute(
        select(Screenshot)
        .where(Screenshot.status == "processed")
        .where(Screenshot.status != "ignored")
        .order_by(Screenshot.timestamp.desc())
        .limit(retrieval_limit)
    )
    processed = result.scalars().all()

    logger.info(
        "Ask archive context loaded (provider=%s, mode=%s, retrieved_items=%d)",
        provider,
        mode_value,
        len(processed),
    )

    if not processed:
        return {
            "answer": "Ainda nao ha capturas processadas para consultar.",
            "matches": [],
            "provider": provider,
        }

    q_tokens = _tokenize(question)

    scored: list[tuple[int, Screenshot]] = []
    for ss in processed:
        score = _score_screenshot_relevance(q_tokens, ss)
        scored.append((score, ss))

    scored.sort(key=lambda item: (item[0], item[1].timestamp or datetime.min), reverse=True)
    shortlisted = [ss for _, ss in scored[:shortlist_size]]
    if not shortlisted:
        shortlisted = processed[:shortlist_size]

    context_lines: list[str] = []
    context_chars = 0
    for ss in shortlisted:
        line = f"- {_build_context_line(ss)}"
        next_size = context_chars + len(line) + 1
        if next_size > context_char_budget:
            break
        context_lines.append(line)
        context_chars = next_size

    effective_shortlisted = shortlisted[: len(context_lines)] if context_lines else shortlisted[:limit]
    relevance_by_id = {ss.id: score for score, ss in scored}
    prompt = (
        "You are Mnemosyne Archive Assistant.\n"
        "Answer the user question using only the screenshot metadata below.\n"
        "This assistant is ONLY for screenshot/archive questions.\n"
        "If the question is general and cannot be answered from screenshots, state that clearly and ask for a screenshot-related question.\n"
        "If uncertain, explicitly say what is unknown.\n"
        "Return ONLY valid JSON with this schema:\n"
        "{\n"
        '  "answer": "short helpful answer in pt-BR",\n'
        '  "match_ids": [1,2,3],\n'
        '  "confidence": "high|medium|low"\n'
        "}\n\n"
        f"Question: {question}\n\n"
        "Screenshots:\n"
        + "\n".join(context_lines)
    )

    if provider == "openrouter":
        raw = await _ask_with_openrouter(prompt, settings_map, flow="ask_archive")
    elif provider == "gemini":
        raw = await _ask_with_gemini(prompt, settings_map)
    else:
        raw = await _ask_with_ollama(prompt, settings_map)

    parsed = _extract_json(raw)
    if parsed:
        answer = str(parsed.get("answer") or "")
        match_ids = parsed.get("match_ids") or []
        if not isinstance(match_ids, list):
            match_ids = []
        match_ids = [int(mid) for mid in match_ids if str(mid).isdigit()]
        confidence = str(parsed.get("confidence") or "medium")
    else:
        answer = raw.strip()[:1200] or "Nao consegui consolidar uma resposta util agora."
        match_ids = [ss.id for ss in effective_shortlisted[:limit]]
        confidence = "low"

    by_id = {ss.id: ss for ss in effective_shortlisted}
    resolved = [by_id[mid] for mid in match_ids if mid in by_id and relevance_by_id.get(mid, 0) > 0][:limit]
    if not resolved:
        strong_candidates = [ss for ss in effective_shortlisted if relevance_by_id.get(ss.id, 0) > 0]
        resolved = strong_candidates[:limit] if strong_candidates else effective_shortlisted[: max(1, min(limit, 2))]

    return {
        "answer": answer,
        "confidence": confidence,
        "provider": provider,
        "mode": mode_value,
        "context_items": len(effective_shortlisted),
        "retrieved_items": len(processed),
        "matches": [ss.to_dict() for ss in resolved],
    }


def _normalize_suggestion_item(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None

    title = str(item.get("title") or "").strip()
    prompt = str(item.get("prompt") or "").strip()
    kind = str(item.get("kind") or "timeline").strip().lower()

    if not title or not prompt:
        return None
    if kind not in {"timeline", "application", "tag"}:
        kind = "timeline"

    return {
        "title": title[:80],
        "prompt": prompt[:240],
        "kind": kind,
    }


async def suggest_archive_questions(db: AsyncSession, limit: int = 3) -> list[dict]:
    settings_result = await db.execute(select(Setting))
    settings_map = {s.key: s.value for s in settings_result.scalars().all()}

    rows = (
        await db.execute(
            select(Screenshot)
            .where(Screenshot.status == "processed")
            .where(Screenshot.status != "ignored")
            .order_by(Screenshot.timestamp.desc())
            .limit(250)
        )
    ).scalars().all()

    if not rows:
        logger.info("Ask suggestions skipped: no processed screenshots")
        return []

    # Use compact metadata lines so this generation remains cheap and fast.
    context_lines = []
    context_chars = 0
    for ss in rows:
        tags = ", ".join(_safe_tags(ss.tags)[:5])
        line = (
            f"- app={ss.application or 'unknown'} | summary={ss.summary or ss.filename or ''} "
            f"| tags={tags} | ts={ss.timestamp.isoformat() if ss.timestamp else ''}"
        )
        if context_chars + len(line) + 1 > 80_000:
            break
        context_lines.append(line)
        context_chars += len(line) + 1

    if not context_lines:
        logger.info("Ask suggestions skipped: no usable context lines")
        return []

    prompt = (
        "You are building smart prompt suggestions for Ask Mnemosyne.\n"
        "Given the screenshot metadata below, generate exactly 3 high-value user prompts in English.\n"
        "This assistant is screenshot-only: suggestions MUST be answerable from screenshot metadata.\n"
        "Avoid generic prompts like productivity advice, broad summaries, or open-ended brainstorming.\n"
        "Prefer concrete prompts about values, changes over time, app-specific progress, or identifiable events in captures.\n"
        "At least 2 suggestions should explicitly reference an app name or tag present in metadata.\n"
        "Return ONLY valid JSON in this schema:\n"
        "{\n"
        '  "suggestions": [\n'
        '    {"title": "short title", "prompt": "question", "kind": "timeline|application|tag"}\n'
        "  ]\n"
        "}\n\n"
        "Screenshot metadata:\n"
        + "\n".join(context_lines)
    )

    try:
        raw = await _ask_with_openrouter(prompt, settings_map, flow="ask_suggestions")
        parsed = _extract_json(raw)
        if not parsed:
            logger.warning("Ask suggestions: OpenRouter returned non-JSON response")
            return []

        suggestions = parsed.get("suggestions")
        if not isinstance(suggestions, list):
            return []

        normalized: list[dict] = []
        for item in suggestions:
            clean_item = _normalize_suggestion_item(item)
            if not clean_item:
                continue
            normalized.append(clean_item)
            if len(normalized) >= limit:
                break

        logger.info("Ask suggestions generated by AI (count=%d)", len(normalized))
        return normalized
    except Exception:
        logger.exception("Ask suggestions generation failed")
        return []
