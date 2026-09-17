from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any

import httpx

from app.config import Settings
from app.providers.base import LLMProvider

logger = logging.getLogger("ai.llm")


class LLMUnavailableError(RuntimeError):
    pass


class LLMTimeoutError(RuntimeError):
    pass


class LlamaCppProvider(LLMProvider):
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(timeout=settings.llm_timeout_seconds)
        self._owns_client = client is None
        self.model_name = settings.llm_model_path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def health(self) -> bool:
        for path in ("/health", "/v1/models"):
            try:
                response = await self._client.get(f"{self._settings.llm_base_url}{path}")
                if response.status_code < 500:
                    return True
            except httpx.HTTPError:
                continue
        return False

    async def generate(
        self,
        *,
        messages: Sequence[dict[str, Any]],
        **kwargs: Any,
    ) -> str:
        chunks: list[str] = []
        async for chunk in self.stream(messages=messages, **kwargs):
            chunks.append(chunk)
        return "".join(chunks)

    async def stream(
        self,
        *,
        messages: Sequence[dict[str, Any]],
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        payload = {
            "model": kwargs.get("model", self.model_name),
            "messages": list(messages),
            "temperature": kwargs.get("temperature", self._settings.llm_temperature),
            "max_tokens": kwargs.get("max_tokens", self._settings.llm_max_tokens),
            "stream": True,
        }
        url = f"{self._settings.llm_base_url}/v1/chat/completions"
        try:
            async with self._client.stream("POST", url, json=payload) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise LLMUnavailableError(
                        f"llama.cpp returned HTTP {response.status_code}: {body[:200]!r}"
                    )
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = parsed.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content")
                    if isinstance(content, str) and content:
                        yield content
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError("llama.cpp request timed out") from exc
        except httpx.HTTPError as exc:
            raise LLMUnavailableError("llama.cpp is unreachable") from exc

    async def embed(
        self,
        *,
        texts: Sequence[str],
        **kwargs: Any,
    ) -> list[list[float]]:
        url = f"{self._settings.llm_base_url}/v1/embeddings"
        payload = {
            "model": kwargs.get("model", self.model_name),
            "input": list(texts),
        }
        try:
            response = await self._client.post(url, json=payload)
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError("embedding request timed out") from exc
        except httpx.HTTPError as exc:
            raise LLMUnavailableError("llama.cpp embeddings unreachable") from exc
        if response.status_code >= 400:
            raise LLMUnavailableError(f"embeddings HTTP {response.status_code}")
        data = response.json().get("data", [])
        vectors: list[list[float]] = []
        for item in sorted(data, key=lambda row: row.get("index", 0)):
            embedding = item.get("embedding")
            if not isinstance(embedding, list):
                continue
            vectors.append([float(value) for value in embedding])
        if len(vectors) != len(texts):
            raise LLMUnavailableError("embedding count mismatch")
        return vectors
