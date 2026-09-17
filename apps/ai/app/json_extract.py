from __future__ import annotations

import json
import logging
import re
from typing import Any

from pydantic import BaseModel, ValidationError

from app.providers.base import LLMProvider

logger = logging.getLogger("ai.json")


class JsonParseError(ValueError):
    pass


def extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", stripped, flags=re.DOTALL)
    candidate = fenced.group(1) if fenced else stripped
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end <= start:
        raise JsonParseError("no JSON object found")
    try:
        parsed = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError as exc:
        raise JsonParseError("invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise JsonParseError("JSON root is not an object")
    return parsed


async def generate_model(
    provider: LLMProvider,
    schema: type[BaseModel],
    *,
    messages: list[dict[str, str]],
) -> BaseModel:
    raw = await provider.generate(messages=messages, temperature=0.1, max_tokens=700)
    try:
        data = extract_json_object(raw)
        return schema.model_validate(data)
    except (JsonParseError, ValidationError) as exc:
        logger.warning("structured output parse failed: %s", exc)
        raise


def parse_model(schema: type[BaseModel], text: str) -> BaseModel:
    data = extract_json_object(text)
    return schema.model_validate(data)
