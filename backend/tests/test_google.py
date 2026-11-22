"""Gmail / Calendar wrappers against a fake googleapiclient service."""
from zoneinfo import ZoneInfo

from app import gcal, gmail

TZ = ZoneInfo("America/Los_Angeles")


class Exec:
    def __init__(self, value):
        self.value = value

    def execute(self):
        return self.value


class FakeGmail:
    def __init__(self, ids, fail=()):
        self.ids, self.fail = ids, set(fail)

    # service.users().messages().list/get
    def users(self):
        return self

    def messages(self):
        return self

    def list(self, **kw):
        return Exec({"messages": [{"id": i, "threadId": "t" + i} for i in self.ids]})

    def get(self, userId, id, **kw):
        return ("get", id)

    def new_batch_http_request(self, callback):
        svc = self

        class Batch:
            def __init__(self):
                self.reqs = []

            def add(self, req, request_id):
                self.reqs.append(request_id)

            def execute(self):
                for rid in self.reqs:
                    if rid in svc.fail:
                        callback(rid, None, RuntimeError("boom"))
                    else:
                        callback(rid, {"id": rid, "threadId": "t" + rid, "labelIds": ["UNREAD"],
                                       "snippet": "s", "internalDate": "1763800000000",
                                       "payload": {"headers": [{"name": "Subject", "value": rid}]}}, None)
        return Batch()


def test_list_inbox_keeps_order_and_skips_failures(monkeypatch):
    fake = FakeGmail(["c", "b", "a"], fail={"b"})
    monkeypatch.setattr(gmail, "service", lambda *a: fake)
    out = gmail.list_inbox("personal", 3)
    assert [m["id"] for m in out] == ["c", "a"]
    assert out[0]["unread"] and out[0]["subject"] == "c"


def test_list_inbox_empty(monkeypatch):
    monkeypatch.setattr(gmail, "service", lambda *a: FakeGmail([]))
    assert gmail.list_inbox("personal") == []


class FakeCal:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def events(self):
        return self

    def list(self, **kw):
        self.calls.append(kw)
        return Exec(self.pages[kw.get("pageToken") or "first"])


def test_calendar_paginates_filters_and_sorts(monkeypatch):
    pages = {
        "first": {"items": [
            {"id": "late", "summary": "Late", "start": {"dateTime": "2026-11-22T15:00:00-08:00"},
             "end": {"dateTime": "2026-11-22T16:00:00-08:00"}},
            {"id": "gone", "status": "cancelled", "start": {"date": "2026-11-22"}, "end": {"date": "2026-11-23"}},
        ], "nextPageToken": "p2"},
        "p2": {"items": [
            {"id": "allday", "summary": "Holiday", "start": {"date": "2026-11-22"}, "end": {"date": "2026-11-23"}},
            {"id": "declined", "start": {"dateTime": "2026-11-22T09:00:00Z"}, "end": {"dateTime": "2026-11-22T10:00:00Z"},
             "attendees": [{"self": True, "responseStatus": "declined"}]},
            # 02:00 UTC on the 23rd is still the 22nd in Oregon
            {"id": "utc", "start": {"dateTime": "2026-11-23T02:00:00Z"}, "end": {"dateTime": "2026-11-23T03:00:00Z"}},
        ]},
    }
    fake = FakeCal(pages)
    monkeypatch.setattr(gcal, "service", lambda *a: fake)
    from datetime import datetime
    out = gcal.list_events("personal", datetime(2026, 11, 22, tzinfo=TZ), datetime(2026, 11, 23, tzinfo=TZ), ["primary"], TZ)
    assert [e["id"] for e in out] == ["allday", "late", "utc"]
    assert out[0]["all_day"] and out[0]["date"] == "2026-11-22"
    assert out[2]["date"] == "2026-11-22" and out[2]["start"].endswith("-08:00")
    assert len(fake.calls) == 2 and fake.calls[1]["pageToken"] == "p2"
