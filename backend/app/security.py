"""Password hashing, session tokens and simple rate limiting."""

import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException

PASSWORD_ITERATIONS = 390_000
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid e-mail address.")
    return email


def validate_password(password: str) -> None:
    if len(password or "") < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters long.")
    if len(password) > 128:
        raise HTTPException(status_code=422, detail="Password is too long.")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algorithm, iterations, salt_hex, expected_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(actual.hex(), expected_hex)
    except (TypeError, ValueError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class RateLimiter:
    """Sliding-window limiter kept in memory (per process)."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        current = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and current - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                raise HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes.")
            hits.append(current)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


login_limiter = RateLimiter(limit=10, window_seconds=600)
