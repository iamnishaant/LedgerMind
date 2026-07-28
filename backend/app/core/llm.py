"""
Central LLM factory — provider-agnostic chat model.

Keeps model selection in one place so agents don't hard-code a provider.
Switch providers/models via the LLM_PROVIDER / *_MODEL settings (see config.py).

Design note (architecture review §8.1): the LLM is used ONLY for reasoning /
classification over already-extracted text — never for extracting raw currency
amounts. Deterministic parsing owns the numbers.
"""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings


@lru_cache(maxsize=8)
def get_chat_model(temperature: float = 0.0, model: str | None = None):
    """
    Return a LangChain chat model for the configured provider.

    - provider="anthropic" → ChatAnthropic (default; current Claude model)
    - provider="openai"    → ChatOpenAI
    - provider="nvidia"    → ChatOpenAI against the NVIDIA NIM endpoint
    `model` overrides the provider's default model id (e.g. a fast chat model);
    None → the configured default. Cached per (provider, temperature, model).
    """
    provider = settings.LLM_PROVIDER.lower()

    # Fail fast instead of hanging forever, and ride out transient network blips
    # with built-in exponential backoff (see config.py for the rationale).
    timeout = settings.LLM_REQUEST_TIMEOUT
    max_retries = settings.LLM_MAX_RETRIES

    if provider == "nvidia":
        # NVIDIA NIM is OpenAI-compatible → reuse ChatOpenAI with a custom base_url.
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model or settings.NVIDIA_MODEL,
            api_key=settings.NVIDIA_API_KEY,
            base_url=settings.NVIDIA_BASE_URL,
            temperature=temperature,
            timeout=timeout,
            max_retries=max_retries,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model or settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
            timeout=timeout,
            max_retries=max_retries,
        )

    # Default: Anthropic (langchain-anthropic is already a dependency)
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model=model or settings.ANTHROPIC_MODEL,
        api_key=settings.ANTHROPIC_API_KEY,
        temperature=temperature,
        max_tokens=1024,
        timeout=timeout,
        max_retries=max_retries,
    )


def get_chat_model_fast():
    """The chat assistant's model: the optional fast CHAT_MODEL override, or the
    provider default when unset."""
    return get_chat_model(model=settings.CHAT_MODEL or None)
