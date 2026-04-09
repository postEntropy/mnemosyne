import asyncio
import base64
import json
import logging
import mimetypes
import re
import time
from collections import deque
from pathlib import Path

import httpx

from app.config import settings
from app.services.providers.base import AnalysisResult, BaseProvider

logger = logging.getLogger("mnemosyne.gemini")


class GeminiProvider(BaseProvider):
    _rate_lock = asyncio.Lock()
    _request_times: deque[float] = deque()

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        requests_per_minute: int | None = None,
    ):
        self.api_key = (api_key or settings.gemini_api_key).strip()
        self.model = model or settings.gemini_model
        self.requests_per_minute = requests_per_minute or settings.gemini_requests_per_minute

    def _endpoint(self) -> str:
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )

    async def _respect_rate_limit(self):
        rpm = max(1, int(self.requests_per_minute))
        wait_time = 0.0

        async with self._rate_lock:
            now = time.monotonic()
            window_start = now - 60.0
            while self._request_times and self._request_times[0] < window_start:
                self._request_times.popleft()

            if len(self._request_times) >= rpm:
                wait_time = 60.0 - (now - self._request_times[0]) + 0.05
            else:
                self._request_times.append(now)

        if wait_time > 0:
            logger.warning(
                "Gemini rate limit guard active (rpm=%s). Waiting %.2fs",
                rpm,
                wait_time,
            )
            await asyncio.sleep(wait_time)
            await self._respect_rate_limit()

    def _guess_mime(self, image_path: Path) -> str:
        mime, _ = mimetypes.guess_type(str(image_path))
        return mime or "image/png"

    def _extract_text(self, data: dict) -> str:
        candidates = data.get("candidates") or []
        if not candidates:
            raise ValueError(f"Gemini response missing candidates: {data}")

        parts = ((candidates[0].get("content") or {}).get("parts") or [])
        texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
        raw = "\n".join(t for t in texts if t).strip()
        if not raw:
            raise ValueError(f"Gemini response missing text content: {data}")
        return raw

    async def analyze(self, image_path: Path) -> AnalysisResult:
        if not self.api_key:
            raise ValueError("Gemini API key is not configured")

        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": (
                                "Look at this screenshot and respond with ONLY a JSON object "
                                "with these keys: description (2-3 sentences), application "
                                "(app name), tags (5 keywords), summary (1 sentence)."
                            )
                        },
                        {
                            "inlineData": {
                                "mimeType": self._guess_mime(image_path),
                                "data": image_b64,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 900,
            },
        }

        await self._respect_rate_limit()

        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                self._endpoint(),
                params={"key": self.api_key},
                json=payload,
            )
            if resp.status_code >= 400:
                body_preview = (resp.text or "")[:600]
                logger.error(
                    "Gemini analyze failed (model=%s, status=%s, body=%s)",
                    self.model,
                    resp.status_code,
                    body_preview,
                )
                raise RuntimeError(
                    f"Gemini analyze failed for model '{self.model}' "
                    f"(HTTP {resp.status_code}): {body_preview}"
                )

            data = resp.json()
            raw = self._extract_text(data)
            logger.info(f"Raw response (model={self.model}): {raw[:200]}...")

        return self._parse(raw)

    async def test_connection(self) -> tuple[bool, str]:
        if not self.api_key:
            return (False, "Gemini API key is not configured")

        sample_image: Path | None = None
        watch_dir = Path(settings.screenshots_dir)
        if watch_dir.exists():
            for ext in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
                candidates = sorted(watch_dir.glob(ext), reverse=True)
                if candidates:
                    sample_image = candidates[0]
                    break

        await self._respect_rate_limit()

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                if sample_image and sample_image.exists():
                    with open(sample_image, "rb") as f:
                        sample_b64 = base64.b64encode(f.read()).decode()

                    payload = {
                        "contents": [
                            {
                                "parts": [
                                    {"text": "Reply with exactly: OK"},
                                    {
                                        "inlineData": {
                                            "mimeType": self._guess_mime(sample_image),
                                            "data": sample_b64,
                                        }
                                    },
                                ]
                            }
                        ],
                        "generationConfig": {
                            "temperature": 0,
                            "maxOutputTokens": 32,
                        },
                    }

                    resp = await client.post(
                        self._endpoint(),
                        params={"key": self.api_key},
                        json=payload,
                    )
                    if resp.status_code >= 400:
                        body_preview = (resp.text or "")[:400]
                        return (
                            False,
                            f"Gemini vision test failed for '{self.model}' "
                            f"(HTTP {resp.status_code}): {body_preview}",
                        )

                    data = resp.json()
                    raw = self._extract_text(data)
                    if raw:
                        return (
                            True,
                            "Connection successful (key valid, model available, image completion ok)",
                        )

                # Fallback: text-only connectivity test when no local image is available.
                text_payload = {
                    "contents": [
                        {
                            "parts": [{"text": "Reply with exactly: OK"}],
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0,
                        "maxOutputTokens": 32,
                    },
                }
                resp = await client.post(
                    self._endpoint(),
                    params={"key": self.api_key},
                    json=text_payload,
                )
                if resp.status_code >= 400:
                    body_preview = (resp.text or "")[:400]
                    return (
                        False,
                        f"Gemini text test failed for '{self.model}' "
                        f"(HTTP {resp.status_code}): {body_preview}",
                    )

                data = resp.json()
                raw = self._extract_text(data)
                if not raw:
                    return (False, "Gemini test returned empty content")

                return (
                    True,
                    "Connection successful (text completion ok; no local image sample for vision test)",
                )
            except Exception as e:
                logger.exception("Gemini connection test failed (model=%s)", self.model)
                return (False, f"Connection failed: {e}")

    def _parse(self, raw: str) -> AnalysisResult:
        raw = (raw or "").strip()

        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.rstrip("`").strip()

        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return AnalysisResult(
                description=raw[:500],
                application="Unknown",
                tags=[],
                summary=raw[:200],
            )

        tags = data.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        return AnalysisResult(
            description=str(data.get("description", ""))[:500],
            application=str(data.get("application", "Unknown"))[:100],
            tags=[str(t) for t in tags][:5],
            summary=str(data.get("summary", ""))[:200],
        )
