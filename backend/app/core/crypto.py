"""
Token encryption — Fernet (AES-128-CBC + HMAC-SHA256, authenticated).

OAuth tokens are encrypted with this module BEFORE they touch the database, so
a DB dump alone can neither read nor undetectably tamper with them. The
service-role key bypasses RLS, so RLS is NOT a substitute for this.

Key management:
  - TOKEN_ENCRYPTION_KEY lives in backend/.env (never committed).
  - Back it up separately from the database: losing the key makes every stored
    token permanently undecryptable (users would simply have to reconnect).
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_fernet: Fernet | None = None


class TokenCryptoError(RuntimeError):
    pass


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.TOKEN_ENCRYPTION_KEY.strip()
        if not key:
            raise TokenCryptoError(
                "TOKEN_ENCRYPTION_KEY is not set. Generate one with:\n"
                '  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        try:
            _fernet = Fernet(key.encode())
        except Exception as e:
            raise TokenCryptoError(f"TOKEN_ENCRYPTION_KEY is not a valid Fernet key: {e}") from e
    return _fernet


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise TokenCryptoError(
            "Could not decrypt stored token — wrong TOKEN_ENCRYPTION_KEY or corrupted value."
        ) from e
