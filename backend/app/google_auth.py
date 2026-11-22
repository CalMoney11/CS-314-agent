"""Google credentials for the backend.

Tokens come from (first match wins):
  1. GOOGLE_TOKENS_JSON env var: {"personal": {<authorized-user token json>}, ...}
     This is how Cloud Run gets them (from Secret Manager).
  2. Files tokens/app_<account>.json at the repo root (local dev), made by
     backend/scripts/authorize_google.py.

Scopes are read-only, so the backend can never send, delete, or edit anything.
Refreshed access tokens live in memory only.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]

REPO_ROOT = Path(__file__).resolve().parents[2]


class GoogleAuthError(RuntimeError):
    pass


_lock = threading.Lock()
_creds: dict[str, Credentials] = {}


def _tokens_dir() -> Path:
    return Path(os.getenv("GOOGLE_TOKENS_DIR", REPO_ROOT / "tokens"))


def _load_token_info(account: str) -> dict:
    raw = os.getenv("GOOGLE_TOKENS_JSON")
    if raw:
        try:
            all_tokens = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GoogleAuthError("GOOGLE_TOKENS_JSON is not valid JSON") from exc
        if account not in all_tokens:
            raise GoogleAuthError(f"No token for Google account '{account}' in GOOGLE_TOKENS_JSON")
        return all_tokens[account]

    path = _tokens_dir() / f"app_{account}.json"
    if not path.exists():
        raise GoogleAuthError(
            f"No token for Google account '{account}'. Run: "
            f"backend/.venv/bin/python backend/scripts/authorize_google.py {account}"
        )
    return json.loads(path.read_text())


def credentials(account: str) -> Credentials:
    with _lock:
        creds = _creds.get(account)
        if creds is None:
            creds = Credentials.from_authorized_user_info(_load_token_info(account), SCOPES)
            _creds[account] = creds
        if not creds.valid:
            if not creds.refresh_token:
                raise GoogleAuthError(f"Google token for '{account}' has no refresh token; re-authorize.")
            try:
                creds.refresh(Request())
            except Exception as exc:  # google.auth.exceptions.RefreshError and transport errors
                _creds.pop(account, None)
                raise GoogleAuthError(
                    f"Google token for '{account}' could not be refreshed ({exc}). "
                    f"Re-run backend/scripts/authorize_google.py {account}"
                ) from exc
        return creds


def service(api: str, version: str, account: str):
    """A fresh API client per call: googleapiclient objects are not thread-safe,
    and FastAPI runs sync endpoints in a thread pool."""
    return build(api, version, credentials=credentials(account), cache_discovery=False)
