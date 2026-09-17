from app.providers.base import LLMProvider


def test_llm_provider_is_abstract() -> None:
    try:
        LLMProvider()  # type: ignore[abstract,call-arg]
        raise AssertionError("LLMProvider must remain abstract")
    except TypeError:
        pass
