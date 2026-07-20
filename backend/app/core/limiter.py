"""
Rate limiting — protects the LLM-calling endpoints from cost/DoS abuse.

Keyed by IP (not user id): slowapi's key_func runs before FastAPI resolves
dependencies, so the authenticated user isn't available yet without extra
JWT-decoding work. IP-based limiting is the standard slowapi pattern and is
sufficient to stop a single scripted client from running up NVIDIA API cost.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# config_filename points at a file that deliberately doesn't exist. Without
# this, slowapi's Limiter() auto-loads Starlette's Config from a ".env" in the
# CWD — which hits OUR backend/.env (used by pydantic-settings, a separate
# mechanism) and crashes decoding its non-ASCII characters as cp1252 on
# Windows. A missing config_filename just logs a harmless warning and skips.
limiter = Limiter(key_func=get_remote_address, config_filename="__slowapi_no_dotenv__")
