from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, Field


class Settings(BaseModel):
    log_level: str = "info"
    debug_prompt_logging: bool = False
    llm_base_url: str = "http://localhost:8080"
    llm_model_path: str = "./models/model.gguf"
    llm_context_size: int = 8192
    llm_temperature: float = 0.7
    llm_max_tokens: int = 512
    llm_timeout_seconds: float = 120
    embedding_dimensions: int = 1024
    recent_message_limit: int = Field(default=20, ge=1, le=200)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        log_level=os.getenv("LOG_LEVEL", "info"),
        debug_prompt_logging=os.getenv("DEBUG_PROMPT_LOGGING", "false").lower() == "true",
        llm_base_url=os.getenv("LLM_BASE_URL", "http://localhost:8080").rstrip("/"),
        llm_model_path=os.getenv("LLM_MODEL_PATH", "./models/model.gguf"),
        llm_context_size=int(os.getenv("LLM_CONTEXT_SIZE", "8192")),
        llm_temperature=float(os.getenv("LLM_TEMPERATURE", "0.7")),
        llm_max_tokens=int(os.getenv("LLM_MAX_TOKENS", "512")),
        llm_timeout_seconds=float(os.getenv("LLM_TIMEOUT_SECONDS", "120")),
        embedding_dimensions=int(os.getenv("EMBEDDING_DIMENSIONS", "1024")),
        recent_message_limit=int(os.getenv("RECENT_MESSAGE_LIMIT", "20")),
    )
