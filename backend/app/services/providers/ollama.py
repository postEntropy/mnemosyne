import json
import base64
import re
import logging
import ast
from pathlib import Path
from app.config import settings
from app.services.providers.base import BaseProvider, AnalysisResult
import httpx

logger = logging.getLogger("mnemosyne.ollama")


class OllamaProvider(BaseProvider):
    def __init__(self, base_url: str | None = None, model: str | None = None):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model
        logger.info(f"OllamaProvider initialized with model: {self.model}")

    async def analyze(self, image_path: Path) -> AnalysisResult:
        logger.info(f"Starting analysis for: {image_path.name}")
        print(f"[DEBUG] Starting analysis for: {image_path.name}")

        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()

        # Simple prompt - qwen3-vl is smart enough to understand
        payload = {
            "model": self.model,
            "prompt": 'Look at this screenshot and respond with ONLY a JSON object with these keys: description (2-3 sentences), application (app name), tags (5 keywords), summary (1 sentence). Example: {"description":"...","application":"...","tags":["...","..."],"summary":"..."}',
            "images": [image_b64],
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 800},
        }

        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(f"{self.base_url}/api/generate", json=payload)
            if resp.status_code != 200:
                logger.error(f"Ollama error: {resp.status_code} - {resp.text}")
                raise Exception(f"Ollama API error: {resp.status_code}")

            raw = resp.json().get("response", "").strip()
            logger.info(f"Raw response: {raw[:200]}...")
            print(f"[DEBUG] Raw response: {raw[:200]}...")

        return self._parse(raw)

    async def test_connection(self) -> bool:
        logger.info("Testing Ollama connection...")
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code != 200:
                    return False
                models = resp.json().get("models", [])
                return any(self.model in m.get("name", "") for m in models)
            except Exception as e:
                logger.error(f"Connection test failed: {e}")
                return False

    def _parse(self, raw: str) -> AnalysisResult:
        raw = raw.strip()

        # Remove thinking tags if present
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0]
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0]

        # Try to find JSON object - handle multiline
        json_start = raw.find("{")
        json_end = raw.rfind("}")

        if json_start != -1 and json_end != -1 and json_end > json_start:
            raw = raw[json_start : json_end + 1]

        # Try literal_eval first (handles single quotes)
        data = None
        try:
            data = ast.literal_eval(raw)
        except (SyntaxError, ValueError):
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                # Try to fix common issues
                raw_fixed = raw.replace("\n", " ").replace("\r", "")
                if raw_fixed.count("{") > raw_fixed.count("}"):
                    raw_fixed += "}"
                try:
                    data = json.loads(raw_fixed)
                except:
                    pass

        if not isinstance(data, dict):
            # Fallback: extract what we can from raw text
            return AnalysisResult(
                description=raw[:500],
                application="Unknown",
                tags=[],
                summary=raw[:200],
            )

        return AnalysisResult(
            description=data.get("description", "")[:500],
            application=data.get("application", "Unknown")[:100],
            tags=data.get("tags", [])[:5],
            summary=data.get("summary", "")[:200],
        )
