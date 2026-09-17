from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Sequence
from typing import Any


class LLMProvider(ABC):
    """Inference boundary. Callers must not depend on llama.cpp directly."""

    @abstractmethod
    async def generate(
        self,
        *,
        messages: Sequence[dict[str, Any]],
        **kwargs: Any,
    ) -> str: ...

    @abstractmethod
    def stream(
        self,
        *,
        messages: Sequence[dict[str, Any]],
        **kwargs: Any,
    ) -> AsyncIterator[str]: ...

    @abstractmethod
    async def embed(
        self,
        *,
        texts: Sequence[str],
        **kwargs: Any,
    ) -> list[list[float]]: ...
