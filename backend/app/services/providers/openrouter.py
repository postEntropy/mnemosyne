import json
import base64
import re
import logging
from pathlib import Path
from app.config import settings
from app.services.providers.base import BaseProvider, AnalysisResult
from app.services.providers.prompting import build_analysis_prompt
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
            try:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                if resp.status_code >= 400:
                    body_preview = (resp.text or "")[:600]
                    logger.error(
                        "OpenRouter analyze failed (model=%s, status=%s, body=%s)",
                        self.model,
                        resp.status_code,
                        body_preview,
                    )
                    raise RuntimeError(
                        f"OpenRouter analyze failed for model '{self.model}' "
                        f"(HTTP {resp.status_code}): {body_preview}"
                    )

                data = resp.json()
                choices = data.get("choices") or []
                if not choices:
                    raise ValueError(f"OpenRouter response missing choices: {data}")

                message = choices[0].get("message") or {}
                raw = message.get("content")
                if not raw:
                    raise ValueError(f"OpenRouter response missing content: {data}")

                logger.info(f"Raw response (model={self.model}): {str(raw)[:200]}...")
            except httpx.HTTPError as e:
                logger.exception(
                    "HTTP error while calling OpenRouter analyze (model=%s): %s",
                    self.model,
                    e,
                )
                raise RuntimeError(
                    f"OpenRouter HTTP error for model '{self.model}': {e}"
                ) from e
            except Exception:
                logger.exception("Unexpected OpenRouter analyze error (model=%s)", self.model)
                raise

        return self._parse(raw)

    async def test_connection(self) -> tuple[bool, str]:
        if not self.api_key:
            return (False, "OpenRouter API key is not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/mnemosyne",
            "X-Title": "Mnemosyne",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                key_resp = await client.get(
                    "https://openrouter.ai/api/v1/auth/key", headers=headers
                )
                if key_resp.status_code != 200:
                    return (
                        False,
                        f"OpenRouter key validation failed (HTTP {key_resp.status_code})",
                    )

                models_resp = await client.get(
                    "https://openrouter.ai/api/v1/models", headers=headers
                )
                if models_resp.status_code != 200:
                    return (
                        False,
                        f"OpenRouter models endpoint failed (HTTP {models_resp.status_code})",
                    )

                models_data = models_resp.json().get("data") or []
                model_ids = {m.get("id", "") for m in models_data if isinstance(m, dict)}
                if self.model not in model_ids:
                    return (
                        False,
                        f"Configured model '{self.model}' not found in OpenRouter",
                    )

                completion_payload = {
                    "model": self.model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Reply with exactly: OK"},
                                {
                                    "type": "image_url",
                                    # 1x1 transparent PNG to verify multimodal support.
                                    "image_url": {
                                        "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+M8cAAAAASUVORK5CYII="
                                    },
                                },
                            ],
                        }
                    ],
                    "max_tokens": 8,
                    "temperature": 0,
                }
                completion_resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=completion_payload,
                )
                if completion_resp.status_code != 200:
                    body_preview = (completion_resp.text or "")[:400]
                    logger.error(
                        "OpenRouter test completion failed (model=%s, status=%s, body=%s)",
                        self.model,
                        completion_resp.status_code,
                        body_preview,
                    )
                    return (
                        False,
                        f"Model test completion failed for '{self.model}' "
                        f"(HTTP {completion_resp.status_code}): {body_preview}",
                    )

                completion_data = completion_resp.json()
                choices = completion_data.get("choices") or []
                if not choices:
                    return (False, "Model test completion returned no choices")

                content = (choices[0].get("message") or {}).get("content")
                if not content:
                    return (False, "Model test completion returned empty content")

                return (
                    True,
                    "Connection successful (key valid, model available, image completion ok)",
                )
            except Exception as e:
                logger.error(f"OpenRouter connection test failed: {e}")
                return (False, f"Connection failed: {e}")

    def _prompt(self) -> str:
        return build_analysis_prompt()

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
