import json
import logging
import re
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.screenshot import Screenshot
from app.models.settings import Setting
from app.services.analyzer import get_provider
from pathlib import Path

logger = logging.getLogger("mnemosyne.storage")


GENERIC_APPLICATION_VALUES = {
    "",
    "unknown",
    "app not detected",
    "not detected",
    "n/a",
    "na",
    "none",
    "null",
    "desktop",
    "screen",
    "screenshot",
}

KNOWN_APPLICATION_HINTS: list[tuple[str, str]] = [
    (r"\bngu\s*idle\b", "NGU Idle"),
    (r"\bvisual\s+studio\s+code\b|\bvscode\b", "Visual Studio Code"),
    (r"\bgoogle\s+chrome\b|\bchrome\b", "Google Chrome"),
    (r"\bmozilla\s+firefox\b|\bfirefox\b", "Mozilla Firefox"),
    (r"\bedge\b|\bmicrosoft\s+edge\b", "Microsoft Edge"),
    (r"\bdiscord\b", "Discord"),
    (r"\btelegram\b", "Telegram"),
    (r"\bspotify\b", "Spotify"),
    (r"\bsteam\b", "Steam"),
]


def _clean_application_name(raw: str | None) -> str:
    cleaned = " ".join((raw or "").strip().split())
    if cleaned.lower() in GENERIC_APPLICATION_VALUES:
        return ""
    return cleaned[:100]


def _infer_application_from_text(*texts: str | None) -> str:
    corpus = "\n".join(t for t in texts if t).lower()
    if not corpus:
        return ""

    for pattern, app_name in KNOWN_APPLICATION_HINTS:
        if re.search(pattern, corpus):
            return app_name

    return ""


def _resolve_application(result: dict, screenshot: Screenshot) -> str:
    from_ai = _clean_application_name(result.get("application"))
    if from_ai:
        return from_ai

    inferred = _infer_application_from_text(
        result.get("summary"),
        result.get("description"),
        screenshot.filename,
    )
    if inferred:
        return inferred

    return "Unknown"


async def validate_provider(
    db: AsyncSession, provider_name: str | None = None
) -> tuple[bool, str]:
    """Validate that the configured provider has all required settings."""
    result = await db.execute(select(Setting))
    settings_map = {s.key: s.value for s in result.scalars().all()}

    name = provider_name or settings_map.get("ai_provider", "ollama")

    if name == "openrouter":
        api_key = settings_map.get("openrouter_api_key", "")
        if not api_key or not api_key.strip():
            return False, "OpenRouter API key is not configured"
    elif name == "gemini":
        api_key = settings_map.get("gemini_api_key", "")
        if not api_key or not api_key.strip():
            return False, "Gemini API key is not configured"
    elif name == "ollama":
        pass
    else:
        return False, f"Unknown provider: {name}"

    return True, ""


async def process_screenshot(
    db: AsyncSession, screenshot: Screenshot, ai_provider_name: str | None = None
) -> Screenshot:
    screenshot.status = "processing"
    await db.commit()

    try:
        settings_result = await db.execute(select(Setting))
        settings_map = {s.key: s.value for s in settings_result.scalars().all()}

        provider = get_provider(ai_provider_name, settings_map)
        result = await provider.analyze(Path(screenshot.file_path))

        screenshot.description = result["description"]
        screenshot.application = _resolve_application(result, screenshot)
        screenshot.tags = json.dumps(result["tags"])
        screenshot.summary = result["summary"]
        screenshot.processed_at = datetime.utcnow()
        screenshot.status = "processed"
        screenshot.error_message = None
    except Exception as e:
        logger.exception(f"Analysis failed for {screenshot.file_path}: {e}")
        screenshot.status = "error"
        screenshot.error_message = str(e)

    await db.commit()
    await db.refresh(screenshot)
    return screenshot


async def get_active_provider(db: AsyncSession) -> str:
    result = await db.execute(select(Setting).where(Setting.key == "ai_provider"))
    setting = result.scalar_one_or_none()
    # Default to ollama if not set
    return setting.value if setting else "ollama"
