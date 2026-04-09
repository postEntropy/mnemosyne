from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.models.settings import Setting
from app.services.analyzer import get_provider

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    ai_provider: str | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    openrouter_api_key: str | None = None
    openrouter_model: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    gemini_requests_per_minute: str | None = None
    ui_scale: str | None = None


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Setting))
    settings = {s.key: s.value for s in result.scalars().all()}

    # Ensure ui_scale has a default if not set
    if "ui_scale" not in settings:
        settings["ui_scale"] = "1.0"

    if "openrouter_api_key" in settings and settings["openrouter_api_key"]:
        key = settings["openrouter_api_key"]
        if key.strip():
            settings["openrouter_api_key"] = (
                key[:6] + "..." + key[-4:] if len(key) > 10 else "..."
            )

    if "gemini_api_key" in settings and settings["gemini_api_key"]:
        key = settings["gemini_api_key"]
        if key.strip():
            settings["gemini_api_key"] = (
                key[:6] + "..." + key[-4:] if len(key) > 10 else "..."
            )
    return settings


@router.put("")
async def update_settings(data: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    updates = data.model_dump(exclude_unset=True)

    for key, value in updates.items():
        if value is None:
            continue

        # Don't overwrite with masked key
        if key in ("openrouter_api_key", "gemini_api_key") and "..." in value:
            continue

        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = str(value)
        else:
            db.add(Setting(key=key, value=str(value)))

    await db.commit()
    return {"message": "Settings updated"}


@router.post("/test", response_model=TestConnectionResponse)
async def test_connection(
    data: SettingsUpdate | None = None, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Setting))
    settings_map = {s.key: s.value for s in result.scalars().all()}

    # Allow UI to test unsaved form values (provider/model/base_url/key) before persisting.
    if data is not None:
        overrides = data.model_dump(exclude_unset=True)
        for key, value in overrides.items():
            if value is None:
                continue
            # Ignore masked placeholders from UI when no new key was entered.
            if key in ("openrouter_api_key", "gemini_api_key") and "..." in str(value):
                continue
            settings_map[key] = str(value)

    provider_name = settings_map.get("ai_provider", "ollama")

    try:
        provider = get_provider(provider_name, settings_map)
        success, message = await provider.test_connection()
        return TestConnectionResponse(
            success=success,
            message=message,
        )
    except Exception as e:
        return TestConnectionResponse(success=False, message=str(e))
