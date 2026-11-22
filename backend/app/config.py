"""All settings come from environment variables (.env locally, Cloud Run env/secrets in prod)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "backend" / ".env")


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    # Shared secret the phone sends as "Authorization: Bearer <APP_API_TOKEN>".
    app_api_token: str = field(default_factory=lambda: os.getenv("APP_API_TOKEN", ""))
    google_accounts: list[str] = field(default_factory=lambda: _list("GOOGLE_ACCOUNTS", "personal"))
    calendar_ids: list[str] = field(default_factory=lambda: _list("GOOGLE_CALENDAR_IDS", "primary"))
    timezone: ZoneInfo = field(default_factory=lambda: ZoneInfo(os.getenv("APP_TIMEZONE", "America/Los_Angeles")))
    canvas_base_url: str = field(default_factory=lambda: os.getenv("CANVAS_BASE_URL", "https://canvas.uoregon.edu").rstrip("/"))
    canvas_token: str = field(default_factory=lambda: os.getenv("CANVAS_API_TOKEN", ""))
    chat_model: str = field(default_factory=lambda: os.getenv("CHAT_MODEL", "claude-opus-5-5"))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))


def get_settings() -> Settings:
    return Settings()
