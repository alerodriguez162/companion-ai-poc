from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI

from app.config import get_settings
from app.providers.llama_cpp import LlamaCppProvider
from app.routes import create_router


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "ts": datetime.now(UTC).isoformat(),
            "service": "ai",
            "logger": record.name,
        }
        conversation_id = getattr(record, "conversationId", None)
        character_id = getattr(record, "characterId", None)
        request_id = getattr(record, "requestId", None)
        if conversation_id:
            payload["conversationId"] = conversation_id
        if character_id:
            payload["characterId"] = character_id
        if request_id:
            payload["requestId"] = request_id
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "info").upper()
    level = getattr(logging, level_name, logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


configure_logging()
settings = get_settings()
provider = LlamaCppProvider(settings)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await provider.aclose()


app = FastAPI(title="Companion AI Service", version="0.2.0", lifespan=lifespan)
app.include_router(create_router(provider))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai"}
