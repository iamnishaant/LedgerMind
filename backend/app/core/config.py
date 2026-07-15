"""
Core application configuration — reads from .env
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    ENV: str = "development"
    DEBUG: bool = True

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str          # server-side key (bypasses RLS for agents)
    SUPABASE_ANON_KEY: str

    # Postgres connection string for the LangGraph durable checkpointer.
    # Use the Supabase Postgres URI (Project Settings → Database → Connection string).
    # Leave blank to fall back to an in-memory checkpointer (dev only).
    DATABASE_URL: str = ""

    # ── LLM selection ────────────────────────────────────────
    # Which provider agents reason with: 'anthropic', 'openai', or 'nvidia'.
    LLM_PROVIDER: str = "anthropic"

    # Anthropic
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-5"      # current-gen Claude; fast + strong reasoning

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # NVIDIA NIM (build.nvidia.com) — OpenAI-compatible endpoint, hosts Llama/etc.
    NVIDIA_API_KEY: str = ""
    NVIDIA_MODEL: str = "meta/llama-3.3-70b-instruct"  # robust 70B; change to any model on build.nvidia.com
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    # Vision model used to cross-check OCR extractions against the receipt image.
    NVIDIA_VISION_MODEL: str = "meta/llama-3.2-90b-vision-instruct"

    # Multi-model OCR verification: a vision LLM independently reads the receipt
    # and any disagreement with the deterministic extraction flags human review.
    # The vision model never overwrites extracted numbers — consensus gating only.
    OCR_VISION_VERIFY: bool = True

    # Inngest
    INNGEST_EVENT_KEY: str = ""
    INNGEST_SIGNING_KEY: str = ""

    # ── Automations (Phase 8) ────────────────────────────────
    # Google OAuth (Web application client; Gmail read-only ingest)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/automations/callback/gmail"

    # Fernet key for encrypting OAuth tokens at rest. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Losing this key makes every stored token permanently undecryptable.
    TOKEN_ENCRYPTION_KEY: str = ""

    # Where the OAuth callback sends the browser back to
    FRONTEND_URL: str = "http://localhost:3000"

    # Gmail ingest tuning: lookback window + hard cap per sync run
    # (cap prevents an uncapped first-connect burst through the OCR pipeline;
    #  the remainder is picked up by subsequent polls/manual syncs)
    GMAIL_LOOKBACK_DAYS: int = 30
    SYNC_MAX_ITEMS_PER_RUN: int = 20

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Agent thresholds
    OCR_CONFIDENCE_THRESHOLD: float = 0.85   # below this → human review

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
