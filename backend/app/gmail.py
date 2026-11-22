"""Gmail, read-only: list recent inbox messages and read one message."""

from __future__ import annotations

import base64
import re
from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime
from html import unescape

from .google_auth import service

MAX_BODY_CHARS = 20_000
LIST_HEADERS = ["From", "Subject", "Date"]


def _headers(payload: dict) -> dict[str, str]:
    return {h["name"].lower(): h["value"] for h in payload.get("headers", [])}


def _iso_date(raw: str, internal_ms: str | None) -> str | None:
    """Prefer Gmail's internalDate (when it arrived); fall back to the Date header."""
    if internal_ms:
        return datetime.fromtimestamp(int(internal_ms) / 1000, tz=timezone.utc).isoformat()
    try:
        return parsedate_to_datetime(raw).isoformat() if raw else None
    except (TypeError, ValueError):
        return None


def _summary(account: str, msg: dict) -> dict:
    h = _headers(msg.get("payload", {}))
    name, addr = parseaddr(h.get("from", ""))
    labels = msg.get("labelIds", [])
    return {
        "account": account,
        "id": msg["id"],
        "thread_id": msg.get("threadId"),
        "from_name": name or addr,
        "from_email": addr,
        "subject": h.get("subject", "") or "(no subject)",
        "snippet": unescape(msg.get("snippet", "")),
        "date": _iso_date(h.get("date", ""), msg.get("internalDate")),
        "unread": "UNREAD" in labels,
        "important": "IMPORTANT" in labels,
        "labels": labels,
    }


def list_inbox(account: str, max_results: int = 20, query: str = "in:inbox") -> list[dict]:
    """Newest inbox messages with sender/subject/snippet. One batched HTTP round trip."""
    svc = service("gmail", "v1", account)
    gmail = svc.users()
    resp = gmail.messages().list(userId="me", q=query, maxResults=max_results).execute()
    ids = [m["id"] for m in resp.get("messages", [])]
    if not ids:
        return []

    results: dict[str, dict] = {}
    errors: list[Exception] = []

    def _cb(request_id, response, exception):
        if exception is not None:
            errors.append(exception)
        else:
            results[request_id] = response

    batch = svc.new_batch_http_request(callback=_cb)
    for mid in ids:
        batch.add(
            gmail.messages().get(userId="me", id=mid, format="metadata", metadataHeaders=LIST_HEADERS),
            request_id=mid,
        )
    batch.execute()
    if errors and not results:
        raise errors[0]
    # Keep Gmail's newest-first order; skip any message that failed individually.
    return [_summary(account, results[mid]) for mid in ids if mid in results]


def get_message(account: str, message_id: str) -> dict:
    msg = service("gmail", "v1", account).users().messages().get(
        userId="me", id=message_id, format="full").execute()
    out = _summary(account, msg)
    h = _headers(msg.get("payload", {}))
    out.update({
        "to": h.get("to", ""),
        "cc": h.get("cc", ""),
        "body": _extract_body(msg.get("payload", {}))[:MAX_BODY_CHARS],
        "web_url": f"https://mail.google.com/mail/#all/{msg['id']}",
    })
    return out


def _extract_body(payload: dict) -> str:
    """Prefer text/plain; fall back to HTML stripped to text. Skips attachments."""
    parts: dict[str, list[str]] = {"text/plain": [], "text/html": []}

    def walk(part: dict) -> None:
        data = part.get("body", {}).get("data")
        if data and not part.get("filename") and part.get("mimeType") in parts:
            raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
            parts[part["mimeType"]].append(raw.decode("utf-8", errors="replace"))
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    if parts["text/plain"]:
        return "\n".join(parts["text/plain"]).strip()
    text = "\n".join(parts["text/html"])
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", "", text)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[ \t]+", " ", unescape(text))
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()
