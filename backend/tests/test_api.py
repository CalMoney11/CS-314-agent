import base64
from datetime import datetime, timezone

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import canvas, chat, gcal, gmail, main
from app.config import Settings
from app.google_auth import GoogleAuthError

TOKEN = "test-token-123"


@pytest.fixture
def settings():
    return Settings(app_api_token=TOKEN, google_accounts=["personal"], canvas_token="ct",
                    canvas_base_url="https://canvas.example.edu", anthropic_api_key="k")


@pytest.fixture
def client(settings):
    main.app.dependency_overrides[main.get_settings] = lambda: settings
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


AUTH = {"Authorization": f"Bearer {TOKEN}"}


# ---------------------------------------------------------------- auth

def test_health_needs_no_token(client):
    assert client.get("/health").json() == {"ok": True}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": TOKEN}])
def test_api_rejects_bad_token(client, headers):
    assert client.get("/api/dashboard", headers=headers).status_code == 401


def test_api_refuses_when_server_token_unset():
    main.app.dependency_overrides[main.get_settings] = lambda: Settings(app_api_token="")
    try:
        r = TestClient(main.app).get("/api/dashboard", headers={"Authorization": "Bearer "})
        assert r.status_code == 503
    finally:
        main.app.dependency_overrides.clear()


# ---------------------------------------------------------------- dashboard

def test_dashboard_combines_sources(client, monkeypatch):
    monkeypatch.setattr(gmail, "list_inbox", lambda a, n, q: [
        {"id": "a", "date": "2026-11-20T10:00:00+00:00"}, {"id": "b", "date": "2026-11-21T10:00:00+00:00"}])
    monkeypatch.setattr(gcal, "list_events", lambda a, s, e, ids, tz: [{"id": "ev", "start": "2026-11-22T09:00:00-08:00"}])
    monkeypatch.setattr(canvas, "planner_items", lambda base, tok, s, e: [{"id": "c", "due_at": "2026-11-23T07:59:00Z"}])
    body = client.get("/api/dashboard", headers=AUTH).json()
    assert [m["id"] for m in body["emails"]] == ["b", "a"]  # newest first
    assert body["events"][0]["id"] == "ev"
    assert body["canvas"][0]["id"] == "c"
    assert body["errors"] == {}


def test_dashboard_reports_one_failing_source(client, monkeypatch):
    def boom(*a):
        raise GoogleAuthError("Google token for 'personal' could not be refreshed")
    monkeypatch.setattr(gmail, "list_inbox", boom)
    monkeypatch.setattr(gcal, "list_events", lambda *a: [])
    monkeypatch.setattr(canvas, "planner_items", lambda *a: [{"id": "c", "due_at": None}])
    body = client.get("/api/dashboard", headers=AUTH).json()
    assert body["emails"] == []
    assert "refreshed" in body["errors"]["gmail:personal"]
    assert body["canvas"][0]["id"] == "c"


def test_calendar_validates_range(client):
    assert client.get("/api/calendar?start=2026-11-10&end=2026-11-01", headers=AUTH).status_code == 400


def test_email_detail_rejects_unknown_account(client):
    assert client.get("/api/emails/someoneelse/abc", headers=AUTH).status_code == 404


# ---------------------------------------------------------------- chat

def test_chat_passes_snapshot(client, monkeypatch):
    monkeypatch.setattr(gmail, "list_inbox", lambda *a: [])
    monkeypatch.setattr(gcal, "list_events", lambda *a: [])
    monkeypatch.setattr(canvas, "planner_items", lambda *a: [])
    seen = {}

    def fake_reply(key, model, history, snapshot, now):
        seen.update(history=history, snapshot=snapshot)
        return "hi"
    monkeypatch.setattr(chat, "reply", fake_reply)
    r = client.post("/api/chat", headers=AUTH, json={"messages": [{"role": "user", "content": "what's due?"}]})
    assert r.json() == {"reply": "hi"}
    assert set(seen["snapshot"]) == {"emails", "events", "canvas", "errors"}


def test_clean_history_alternates_and_ends_with_user():
    h = chat._clean_history([
        {"role": "assistant", "content": "Hello!"},  # app greeting: dropped
        {"role": "user", "content": "a"}, {"role": "user", "content": "b"},
        {"role": "assistant", "content": "c"}, {"role": "user", "content": "d"},
    ])
    assert [m["role"] for m in h] == ["user", "assistant", "user"]
    assert h[0]["content"] == "a\n\nb"
    with pytest.raises(chat.ChatError):
        chat._clean_history([{"role": "user", "content": "x"}, {"role": "assistant", "content": "y"}])


# ---------------------------------------------------------------- gmail parsing

def _b64(s):
    return base64.urlsafe_b64encode(s.encode()).decode().rstrip("=")


def test_extract_body_prefers_plain_and_strips_html():
    plain = {"mimeType": "multipart/alternative", "parts": [
        {"mimeType": "text/plain", "body": {"data": _b64("Hello plain")}},
        {"mimeType": "text/html", "body": {"data": _b64("<b>Hello</b>")}}]}
    assert gmail._extract_body(plain) == "Hello plain"
    html = {"mimeType": "text/html", "body": {"data": _b64("<style>x{}</style><p>Hi&amp;bye</p><p>2</p>")}}
    assert gmail._extract_body(html) == "Hi&bye\n2"


def test_summary_fields():
    msg = {"id": "m1", "threadId": "t1", "labelIds": ["INBOX", "UNREAD"], "snippet": "a &amp; b",
           "internalDate": "1763800000000",
           "payload": {"headers": [{"name": "From", "value": "Prof X <x@uoregon.edu>"},
                                   {"name": "Subject", "value": "Exam"}]}}
    s = gmail._summary("personal", msg)
    assert s["from_name"] == "Prof X" and s["from_email"] == "x@uoregon.edu"
    assert s["unread"] and not s["important"] and s["snippet"] == "a & b"
    assert s["date"].startswith("2025-11-22")


# ---------------------------------------------------------------- canvas

@respx.mock
def test_canvas_pagination_and_simplify():
    base = "https://canvas.example.edu"
    page2 = f"{base}/api/v1/planner/items?page=2"
    respx.get(f"{base}/api/v1/planner/items", params={"page": "2"}).mock(return_value=httpx.Response(200, json=[
        {"plannable_type": "quiz", "plannable_id": 2, "plannable": {"title": "Q1", "due_at": "2026-11-25T07:59:00Z"},
         "submissions": False, "html_url": "/courses/1/quizzes/2", "context_name": "CS 314"}]))
    respx.get(f"{base}/api/v1/planner/items").mock(return_value=httpx.Response(
        200, headers={"Link": f'<{page2}>; rel="next"'}, json=[
            {"plannable_type": "assignment", "plannable_id": 1,
             "plannable": {"title": "HW 5", "due_at": "2026-11-24T07:59:00Z", "points_possible": 10},
             "submissions": {"submitted": True, "missing": False}, "html_url": "/courses/1/assignments/1",
             "context_name": "CS 314", "course_id": 1}]))
    start = datetime(2026, 11, 20, tzinfo=timezone.utc)
    items = canvas.planner_items(base, "tok", start, start)
    assert [i["title"] for i in items] == ["HW 5", "Q1"]
    assert items[0]["done"] and items[0]["web_url"] == f"{base}/courses/1/assignments/1"
    assert not items[1]["done"] and items[1]["type"] == "quiz"


@respx.mock
def test_canvas_does_not_follow_foreign_next_link():
    base = "https://canvas.example.edu"
    route = respx.get(f"{base}/api/v1/planner/items").mock(return_value=httpx.Response(
        200, headers={"Link": '<https://evil.example.com/steal>; rel="next"'}, json=[]))
    canvas.planner_items(base, "tok", datetime.now(timezone.utc), datetime.now(timezone.utc))
    assert route.call_count == 1


@respx.mock
def test_canvas_401_message():
    respx.get("https://canvas.example.edu/api/v1/planner/items").mock(return_value=httpx.Response(401, json={}))
    with pytest.raises(canvas.CanvasError, match="token"):
        canvas.planner_items("https://canvas.example.edu", "bad", datetime.now(timezone.utc), datetime.now(timezone.utc))


def test_canvas_missing_token():
    with pytest.raises(canvas.CanvasError):
        canvas.planner_items("https://canvas.example.edu", "", datetime.now(timezone.utc), datetime.now(timezone.utc))
