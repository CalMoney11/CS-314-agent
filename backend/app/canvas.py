"""Canvas LMS, read-only, via a personal access token.

Uses the Planner API (the same data as Canvas's "To Do" / dashboard list):
assignments, quizzes, discussions, announcements, and calendar events.
Docs: https://canvas.instructure.com/doc/api/planner.html
"""

from __future__ import annotations

from datetime import datetime

import httpx

TIMEOUT = httpx.Timeout(20.0, connect=5.0)
MAX_PAGES = 10


class CanvasError(RuntimeError):
    pass


def _client(base_url: str, token: str) -> httpx.Client:
    if not token:
        raise CanvasError("CANVAS_API_TOKEN is not set")
    return httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=TIMEOUT,
        follow_redirects=False,  # never forward the token to another host
    )


def _get_all(client: httpx.Client, path: str, params: dict) -> list[dict]:
    """GET with Canvas Link-header pagination."""
    items: list[dict] = []
    url: str | None = path
    query: dict | None = {**params, "per_page": 100}
    for _ in range(MAX_PAGES):
        resp = client.get(url, params=query)
        if resp.status_code == 401:
            raise CanvasError("Canvas rejected the token (401). Make a new access token in Canvas settings.")
        resp.raise_for_status()
        items.extend(resp.json())
        nxt = resp.links.get("next", {}).get("url")
        if not nxt:
            break
        # Only follow pagination links on the same Canvas host.
        if httpx.URL(nxt).host != client.base_url.host:
            break
        url, query = nxt, None
    return items


def planner_items(base_url: str, token: str, start: datetime, end: datetime) -> list[dict]:
    with _client(base_url, token) as client:
        raw = _get_all(client, "/api/v1/planner/items",
                       {"start_date": start.isoformat(), "end_date": end.isoformat()})
    return [_simplify(base_url, it) for it in raw]


def _simplify(base_url: str, it: dict) -> dict:
    p = it.get("plannable") or {}
    sub = it.get("submissions") if isinstance(it.get("submissions"), dict) else {}
    override = it.get("planner_override") or {}
    kind = it.get("plannable_type", "")
    html_url = it.get("html_url") or ""
    if html_url.startswith("/"):
        html_url = base_url + html_url
    return {
        "id": f"{kind}-{it.get('plannable_id')}",
        "type": kind,  # assignment | quiz | discussion_topic | announcement | calendar_event | planner_note | ...
        "title": p.get("title") or p.get("name") or "(untitled)",
        "course": it.get("context_name") or "",
        "course_id": it.get("course_id"),
        "due_at": p.get("due_at") or p.get("todo_date") or it.get("plannable_date"),
        "points_possible": p.get("points_possible"),
        "submitted": bool(sub.get("submitted")),
        "graded": bool(sub.get("graded")),
        "missing": bool(sub.get("missing")),
        "late": bool(sub.get("late")),
        "done": bool(override.get("marked_complete")) or bool(sub.get("submitted")),
        "new_activity": bool(it.get("new_activity")),
        "web_url": html_url,
    }
