from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    screenshots_dir: str = str(Path.home() / "Pictures" / "Screenshots")
    thumbnails_dir: str = "./thumbnails"
    ai_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llava"
    openrouter_api_key: str = ""
    openrouter_model: str = "qwen/qwen3.6-plus:free"
    ask_provider: str = "openrouter"
    ask_openrouter_model: str = "qwen/qwen3.6-plus"
    ask_default_mode: str = "balanced"
    ask_quick_limit: int = 400
    ask_balanced_limit: int = 2000
    ask_deep_limit: int = 10000
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_requests_per_minute: int = 8
    database_url: str = "sqlite+aiosqlite:///./mnemosyne.db"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    class Config:
        env_file = ".env"


settings = Settings()
