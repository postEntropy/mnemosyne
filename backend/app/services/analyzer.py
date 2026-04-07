from pathlib import Path
from app.config import settings
from app.services.providers.base import BaseProvider
from app.services.providers.ollama import OllamaProvider
from app.services.providers.openrouter import OpenRouterProvider


def get_provider(
    db_ai_provider: str | None = None, provider_settings: dict[str, str] | None = None
) -> BaseProvider:
    provider_settings = provider_settings or {}
    provider_name = db_ai_provider or settings.ai_provider

    if provider_name == "openrouter":
        return OpenRouterProvider(
            api_key=provider_settings.get("openrouter_api_key"),
            model=provider_settings.get("openrouter_model"),
        )

    return OllamaProvider(
        base_url=provider_settings.get("ollama_base_url"),
        model=provider_settings.get("ollama_model"),
    )
