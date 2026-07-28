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

    # Model for the interactive chat assistant ONLY (get_chat_model_fast()); the
    # heavier reasoning agents keep NVIDIA_MODEL (the 70B). Chat is
    # latency-sensitive, so we default it to a small, fast NVIDIA model — the
    # injected financial snapshot means most questions need no tool call, so an
    # 8B answers them well and streams ~5-10x faster than the 70B on the free
    # tier, at zero extra cost (still NVIDIA, no Anthropic bill). Blank → fall
    # back to the provider default model. Override in .env for a different model.
    CHAT_MODEL: str = "meta/llama-3.1-8b-instruct"

    # Model for the CFO brief. Empty → CHAT_MODEL (the fast one).
    # Measured 2026-07 against this NVIDIA account: llama-3.3-70b timed out on
    # EVERY attempt (>60s, three consecutive runs) while llama-3.1-8b returned
    # valid JSON in ~1.5s. The 70B is nominally the better analyst, but a brief
    # that never arrives is worth nothing — so the default is the model that
    # actually responds. Point this at a larger model if your provider serves it
    # reliably; run_cfo_agent() falls back to CHAT_MODEL if it stalls.
    CFO_MODEL: str = ""

    # LLM reliability knobs. NVIDIA's free tier is slow (~30s/call) but should
    # never hang forever; a request that exceeds the timeout fails fast so the
    # user gets an error + Retry instead of an indefinite spinner. max_retries
    # covers transient httpx.ConnectError / DNS blips (seen in this project)
    # with LangChain's built-in exponential backoff.
    LLM_REQUEST_TIMEOUT: float = 60.0
    LLM_MAX_RETRIES: int = 2

    # NVIDIA NIM (build.nvidia.com) — OpenAI-compatible endpoint, hosts Llama/etc.
    NVIDIA_API_KEY: str = ""
    NVIDIA_MODEL: str = "meta/llama-3.3-70b-instruct"  # robust 70B; change to any model on build.nvidia.com
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    # Vision model used to cross-check OCR extractions against the receipt image.
    NVIDIA_VISION_MODEL: str = "meta/llama-3.2-90b-vision-instruct"

    # Multi-model OCR verification: a vision LLM independently reads the receipt
    # and any disagreement with the deterministic extraction flags human review.
    # The vision model never overwrites extracted numbers — consensus gating only.
    # Costs a full extra (slow) vision call per receipt — set false to trade the
    # cross-check for roughly half the processing time.
    OCR_VISION_VERIFY: bool = True

    # ── Receipt pipeline timeouts ────────────────────────────
    # Nothing in the ingest path may run unbounded: a stuck step used to leave a
    # receipt on 'pending' forever with the UI polling it indefinitely.
    # OCR_TIMEOUT_SECONDS covers the blocking PaddleOCR pass (first call may also
    # download model weights). INGEST_TIMEOUT_SECONDS is the outer watchdog for
    # the whole graph (OCR + classification + vision + accounting); on expiry the
    # receipt is marked 'failed' so the user sees a terminal state.
    OCR_TIMEOUT_SECONDS: float = 120.0
    INGEST_TIMEOUT_SECONDS: float = 300.0

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

    # Upload size cap — the frontend UI claims "max 10MB" but nothing enforced it
    # server-side; without this a large/malicious file flows straight into
    # Storage, then PaddleOCR, then the vision LLM before anything would reject it.
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
