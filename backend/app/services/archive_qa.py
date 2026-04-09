import json
import re
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.models.screenshot import Screenshot
from app.models.settings import Setting


def _tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9_]+", (text or "").lower()) if len(t) > 1}


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


async def _ask_with_openrouter(prompt: str, settings_map: dict[str, str]) -> str:
    api_key = (settings_map.get("openrouter_api_key") or "").strip()
    model = settings_map.get("openrouter_model") or app_settings.openrouter_model

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

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            raise ValueError("OpenRouter response missing choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not content:
            raise ValueError("OpenRouter response missing content")
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


async def ask_archive(db: AsyncSession, question: str, limit: int = 8) -> dict:
    settings_result = await db.execute(select(Setting))
    settings_map = {s.key: s.value for s in settings_result.scalars().all()}
    provider = settings_map.get("ai_provider", "ollama")

    result = await db.execute(
        select(Screenshot)
        .where(Screenshot.status == "processed")
        .where(Screenshot.status != "ignored")
        .order_by(Screenshot.timestamp.desc())
        .limit(400)
    )
    processed = result.scalars().all()

    if not processed:
        return {
            "answer": "Ainda nao ha capturas processadas para consultar.",
            "matches": [],
            "provider": provider,
        }

    q_tokens = _tokenize(question)

    scored: list[tuple[int, Screenshot]] = []
    for ss in processed:
        text = " ".join(
            [
                ss.filename or "",
                ss.application or "",
                ss.summary or "",
                ss.description or "",
                " ".join(_safe_tags(ss.tags)),
            ]
        )
        score = len(q_tokens.intersection(_tokenize(text)))
        if score > 0:
            score += 1
        scored.append((score, ss))

    scored.sort(key=lambda item: (item[0], item[1].timestamp or datetime.min), reverse=True)
    shortlisted = [ss for _, ss in scored[:40]]
    if not shortlisted:
        shortlisted = processed[:40]

    context_lines = [f"- {_build_context_line(ss)}" for ss in shortlisted]
    prompt = (
        "You are Mnemosyne Archive Assistant.\n"
        "Answer the user question using only the screenshot metadata below.\n"
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
        raw = await _ask_with_openrouter(prompt, settings_map)
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
        match_ids = [ss.id for ss in shortlisted[:limit]]
        confidence = "low"

    by_id = {ss.id: ss for ss in shortlisted}
    resolved = [by_id[mid] for mid in match_ids if mid in by_id][:limit]
    if not resolved:
        resolved = shortlisted[:limit]

    return {
        "answer": answer,
        "confidence": confidence,
        "provider": provider,
        "matches": [ss.to_dict() for ss in resolved],
    }
