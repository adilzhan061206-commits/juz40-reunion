"""Runtime settings, read once from environment variables."""

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    environment: str = field(default_factory=lambda: os.getenv("APP_ENV", "development").lower())
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./data/app.db"))
    base_url: str = field(default_factory=lambda: os.getenv("APP_BASE_URL", "http://127.0.0.1:8000").rstrip("/"))

    cookie_name: str = "sra_session"
    cookie_secure: bool = field(default_factory=lambda: _bool("AUTH_COOKIE_SECURE", False))
    session_ttl: int = field(default_factory=lambda: _int("AUTH_SESSION_TTL_SECONDS", 30 * 24 * 3600))
    reset_ttl: int = field(default_factory=lambda: _int("AUTH_RESET_TTL_SECONDS", 30 * 60))

    # my.sdu.edu.kz integration
    sdu_base_url: str = field(default_factory=lambda: os.getenv("SDU_BASE_URL", "https://my.sdu.edu.kz").rstrip("/"))
    sdu_timeout: int = field(default_factory=lambda: _int("SDU_TIMEOUT_SECONDS", 25))
    sdu_enabled: bool = field(default_factory=lambda: _bool("SDU_LOGIN_ENABLED", True))

    # Registration rules
    max_ects: int = field(default_factory=lambda: _int("MAX_TERM_ECTS", 40))
    max_seat_alerts: int = field(default_factory=lambda: _int("MAX_SEAT_ALERTS", 5))
    hold_grace_hours: int = field(default_factory=lambda: _int("HOLD_GRACE_HOURS", 24))

    # Demo data
    seed_demo: bool = field(default_factory=lambda: _bool("SEED_DEMO", True))
    admin_email: str = field(default_factory=lambda: os.getenv("ADMIN_EMAIL", "admin@sdu.demo"))
    admin_password: str = field(default_factory=lambda: os.getenv("ADMIN_PASSWORD", "admin2026"))

    # SMTP (optional). Without it, e-mails are logged and shown as in-app notifications only.
    smtp_host: str = field(default_factory=lambda: os.getenv("SMTP_HOST", "").strip())
    smtp_port: int = field(default_factory=lambda: _int("SMTP_PORT", 587))
    smtp_username: str = field(default_factory=lambda: os.getenv("SMTP_USERNAME", "").strip())
    smtp_password: str = field(default_factory=lambda: os.getenv("SMTP_PASSWORD", ""))
    smtp_from: str = field(default_factory=lambda: os.getenv("SMTP_FROM", "").strip())
    smtp_use_tls: bool = field(default_factory=lambda: _bool("SMTP_USE_TLS", True))
    smtp_use_ssl: bool = field(default_factory=lambda: _bool("SMTP_USE_SSL", False))

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
