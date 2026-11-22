"""Google Calendar, read-only (calendar.readonly scope)."""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from .google_auth import service


def list_events(account: str, start: datetime, end: datetime,
                calendar_ids: list[str], tz: ZoneInfo) -> list[dict]:
    """Events overlapping [start, end), recurring events expanded,
    cancelled and declined ones dropped, sorted by start."""
    cal = service("calendar", "v3", account)
    events: list[dict] = []
    for cal_id in calendar_ids:
        page_token = None
        while True:
            resp = cal.events().list(
                calendarId=cal_id,
                timeMin=start.isoformat(),
                timeMax=end.isoformat(),
                singleEvents=True,
                orderBy="startTime",
                maxResults=250,
                pageToken=page_token,
            ).execute()
            for ev in resp.get("items", []):
                if ev.get("status") == "cancelled" or _my_status(ev) == "declined":
                    continue
                events.append(_simplify(account, cal_id, ev, tz))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
    events.sort(key=lambda e: datetime.fromisoformat(e["start"]))
    return events


def _my_status(ev: dict) -> str | None:
    return next((a.get("responseStatus") for a in ev.get("attendees", []) if a.get("self")), None)


def _parse(when: dict, tz: ZoneInfo) -> tuple[datetime, bool]:
    if "dateTime" in when:
        return datetime.fromisoformat(when["dateTime"]).astimezone(tz), False
    return datetime.combine(date.fromisoformat(when["date"]), time.min, tz), True


def _simplify(account: str, cal_id: str, ev: dict, tz: ZoneInfo) -> dict:
    start, all_day = _parse(ev["start"], tz)
    end, _ = _parse(ev["end"], tz)
    return {
        "account": account,
        "calendar_id": cal_id,
        "id": ev["id"],
        "title": ev.get("summary", "(no title)"),
        "start": start.isoformat(),
        "end": end.isoformat(),
        # Local calendar day the event starts on (YYYY-MM-DD) for grouping in the app.
        "date": start.date().isoformat(),
        "all_day": all_day,
        "location": ev.get("location", ""),
        "description": (ev.get("description") or "")[:2000],
        "web_url": ev.get("htmlLink", ""),
        "my_status": _my_status(ev),
    }
