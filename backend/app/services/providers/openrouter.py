import json
import base64
import re
import logging
from pathlib import Path
from app.config import settings
from app.services.providers.base import BaseProvider, AnalysisResult
import httpx

logger = logging.getLogger("mnemosyne.openrouter")


class OpenRouterProvider(BaseProvider):
    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or settings.openrouter_api_key
        self.model = model or settings.openrouter_model

    async def analyze(self, image_path: Path) -> AnalysisResult:
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": self._prompt()},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                    ],
                }
            ],
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/mnemosyne",
            "X-Title": "Mnemosyne",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices") or []
            if not choices:
                raise ValueError(f"OpenRouter response missing choices: {data}")

            message = choices[0].get("message") or {}
            raw = message.get("content")
            if not raw:
                raise ValueError(f"OpenRouter response missing content: {data}")

        return self._parse(raw)

    async def test_connection(self) -> bool:
        if not self.api_key:
            return False
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/auth/key", headers=headers
            )
            return resp.status_code == 200

    def _prompt(self) -> str:
        return (
            "Analyze this screenshot and return a JSON object with the following fields:\n\n"
            "{\n"
            '  "description": "Detailed narrative description of everything visible on screen",\n'
            '  "application": "Name of the main application/website shown",\n'
            '  "tags": ["relevant", "keywords", "extracted", "from", "content"],\n'
            '  "summary": "One-sentence summary of the activity shown"\n'
            "}\n\n"
            "Respond with ONLY valid JSON, no markdown formatting or extra text."
        )

    def _parse(self, raw: str) -> AnalysisResult:
        raw = raw.strip()

        # Strip markdown code blocks if present
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.rstrip("`").strip()

        # Try to extract JSON object from mixed content
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenRouter response: {e}\nRaw: {raw[:500]}")
            return AnalysisResult(
                description=raw[:2000],
                application="Unknown",
                tags=[],
                summary="Failed to parse AI response",
            )

        return AnalysisResult(
            description=data.get("description", ""),
            application=data.get("application", ""),
            tags=data.get("tags", []),
            summary=data.get("summary", ""),
        )
