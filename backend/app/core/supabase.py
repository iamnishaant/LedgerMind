"""
Supabase clients — server-side singletons.
"""
from supabase import create_client, Client
from app.core.config import settings

_client: Client | None = None
_anon_client: Client | None = None


def get_supabase() -> Client:
    """Return a shared Supabase service-role client (bypasses RLS — used by agents/pipeline)."""
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client


def get_supabase_anon() -> Client:
    """
    Return a shared Supabase anon-key client — used ONLY to verify a caller's
    access token (auth.get_user(jwt)). Never used for data access.
    """
    global _anon_client
    if _anon_client is None:
        _anon_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _anon_client
