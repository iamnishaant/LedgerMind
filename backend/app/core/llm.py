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


@lru_cache(maxsize=4)
def get_chat_model(temperature: float = 0.0):
    """
    Return a LangChain chat model for the configured provider.

    - provider="anthropic" → ChatAnthropic (default; current Claude model)
    - provider="openai"    → ChatOpenAI
    Cached per (provider, temperature) so we don't rebuild clients per call.
    """
    provider = settings.LLM_PROVIDER.lower()

    if provider == "nvidia":
        # NVIDIA NIM is OpenAI-compatible → reuse ChatOpenAI with a custom base_url.
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.NVIDIA_MODEL,
            api_key=settings.NVIDIA_API_KEY,
            base_url=settings.NVIDIA_BASE_URL,
            temperature=temperature,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
        )

    # Default: Anthropic (langchain-anthropic is already a dependency)
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model=settings.ANTHROPIC_MODEL,
        api_key=settings.ANTHROPIC_API_KEY,
        temperature=temperature,
        max_tokens=1024,
    )
