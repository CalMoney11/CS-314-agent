"""HTTP API for the phone app.

Every /api route requires "Authorization: Bearer <APP_API_TOKEN>".
Run locally:  backend/.venv/bin/uvicorn app.main:app --app-dir backend --reload
"""

from __future__ import annotations

import hmac
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from typing import Callable, Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from . import canvas, chat, gcal, gmail
from .config import Settings, get_settings
from .google_auth import GoogleAuthError

log = logging.getLogger("backend")
app = FastAPI(title="CS-314 Agent API", version="1.0.0")


# ---------------------------------------------------------------- auth

def require_token(authorization: str = Header(default=""),
                  settings: Settings = Depends(get_settings)) -> Settings:
    if not settings.app_api_token:
        raise HTTPException(503, "Server is missing APP_API_TOKEN.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.encode(), settings.app_api_token.encode()):
        raise HTTPException(401, "Bad or missing API token.")
    return settings


# ---------------------------------------------------------------- helpers

def _error_message(exc: Exception) -> str:
    """Short, safe-to-show message. Never includes tokens or response bodies."""
    if isinstance(exc, (GoogleAuthError, canvas.CanvasError)):
        return str(exc)
    if isinstance(exc, HttpError):
        return f"Google API error ({exc.resp.status})."
    if isinstance(exc, httpx.HTTPStatusError):
        return f"Canvas API error ({exc.response.status_code})."
    if isinstance(exc, httpx.HTTPError):
        return "Could not reach Canvas."
    return f"Unexpected error ({type(exc).__name__})."


def _gather(jobs: dict[str, Callable[[], list]]) -> tuple[dict[str, list], dict[str, str]]:
    """Run independent fetches in parallel; one failing source doesn't break the others."""
    results: dict[str, list] = {}
    errors: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=max(1, len(jobs))) as pool:
        futures = {name: pool.submit(fn) for name, fn in jobs.items()}
        for name, fut in futures.items():
            try:
                results[name] = fut.result()
            except Exception as exc:  # reported per source, logged for Cloud Run
                log.warning("%s failed: %s", name, exc, exc_info=not isinstance(exc, GoogleAuthError))
                results[name] = []
                errors[name] = _error_message(exc)
    return results, errors


def _check_account(settings: Settings, account: str) -> None:
    if account not in settings.google_accounts:
        raise HTTPException(404, "Unknown account.")


def _day_start(d: date, s: Settings) -> datetime:
    return datetime.combine(d, time.min, s.timezone)


def _emails(s: Settings, limit: int, unread_only: bool) -> tuple[list, dict]:
    query = "in:inbox is:unread" if unread_only else "in:inbox"
    results, errors = _gather({
        f"gmail:{acct}": (lambda a=acct: gmail.list_inbox(a, limit, query)) for acct in s.google_accounts
    })
    items = [m for msgs in results.values() for m in msgs]
    items.sort(key=lambda m: m.get("date") or "", reverse=True)
    return items[:limit], errors


def _events(s: Settings, start: datetime, end: datetime) -> tuple[list, dict]:
    results, errors = _gather({
        f"calendar:{acct}": (lambda a=acct: gcal.list_events(a, start, end, s.calendar_ids, s.timezone))
        for acct in s.google_accounts
    })
    items = [e for evs in results.values() for e in evs]
    items.sort(key=lambda e: datetime.fromisoformat(e["start"]))
    return items, errors


def _canvas(s: Settings, start: datetime, end: datetime) -> list:
    items = canvas.planner_items(s.canvas_base_url, s.canvas_token, start, end)
    items.sort(key=lambda i: i.get("due_at") or "")
    return items


# ---------------------------------------------------------------- routes

@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/emails")
def emails(limit: int = Query(20, ge=1, le=50), unread_only: bool = False,
           s: Settings = Depends(require_token)) -> dict:
    items, errors = _emails(s, limit, unread_only)
    return {"items": items, "errors": errors}


@app.get("/api/emails/{account}/{message_id}")
def email_detail(account: str, message_id: str, s: Settings = Depends(require_token)) -> dict:
    _check_account(s, account)
    if not message_id.isalnum():
        raise HTTPException(400, "Bad message id.")
    try:
        return gmail.get_message(account, message_id)
    except HttpError as exc:
        if exc.resp.status == 404:
            raise HTTPException(404, "Email not found.") from exc
        raise HTTPException(502, _error_message(exc)) from exc
    except GoogleAuthError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/api/calendar")
def calendar(start: date, end: date, s: Settings = Depends(require_token)) -> dict:
    """Events from start (inclusive) to end (exclusive), local dates YYYY-MM-DD."""
    if end <= start or (end - start).days > 100:
        raise HTTPException(400, "end must be after start, at most 100 days apart.")
    items, errors = _events(s, _day_start(start, s), _day_start(end, s))
    return {"items": items, "errors": errors}


@app.get("/api/canvas")
def canvas_items(days_back: int = Query(3, ge=0, le=60), days_ahead: int = Query(21, ge=1, le=120),
                 s: Settings = Depends(require_token)) -> dict:
    today = datetime.now(s.timezone).date()
    items, errors = _canvas_safe(s, _day_start(today - timedelta(days=days_back), s),
                                 _day_start(today + timedelta(days=days_ahead + 1), s))
    return {"items": items, "errors": errors}


def _canvas_safe(s: Settings, start: datetime, end: datetime) -> tuple[list, dict]:
    results, errors = _gather({"canvas": lambda: _canvas(s, start, end)})
    return results["canvas"], errors


def _dashboard(s: Settings) -> dict:
    now = datetime.now(s.timezone)
    today = now.date()
    # Each helper catches its own errors, so these futures never raise.
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_emails = pool.submit(_emails, s, 15, False)
        f_events = pool.submit(_events, s, _day_start(today, s), _day_start(today + timedelta(days=8), s))
        f_canvas = pool.submit(_canvas_safe, s, _day_start(today - timedelta(days=3), s),
                               _day_start(today + timedelta(days=15), s))
    emails_items, e1 = f_emails.result()
    events_items, e2 = f_events.result()
    canvas_list, e3 = f_canvas.result()
    return {
        "generated_at": now.isoformat(),
        "timezone": str(s.timezone),
        "emails": emails_items,
        "events": events_items,
        "canvas": canvas_list,
        "errors": {**e1, **e2, **e3},
    }


@app.get("/api/dashboard")
def dashboard(s: Settings = Depends(require_token)) -> dict:
    """Everything the home screen and background refresh need, in one call."""
    return _dashboard(s)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=60)


@app.post("/api/chat")
def chat_endpoint(req: ChatRequest, s: Settings = Depends(require_token)) -> dict:
    snap = _dashboard(s)
    snapshot = {k: snap[k] for k in ("emails", "events", "canvas", "errors")}
    try:
        text = chat.reply(s.anthropic_api_key, s.chat_model,
                          [m.model_dump() for m in req.messages], snapshot, datetime.now(s.timezone))
    except chat.ChatError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return {"reply": text}
