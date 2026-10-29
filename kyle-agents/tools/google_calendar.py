"""Google Calendar tool for Kyle. READ-ONLY.

Only calls events.list. The token has the calendar.readonly scope, so Google
itself blocks any write, even from a bug or a prompt injection.

Auth: python google_auth.py calendar <account>
.env (optional):
    KYLE_TIMEZONE=America/Los_Angeles
    KYLE_CALENDAR_IDS=primary,abc123@group.calendar.google.com
Test: python google_calendar.py <account>    # today's events + busy now
"""

import os
import sys
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from google_auth import service

TZ = ZoneInfo(os.getenv("KYLE_TIMEZONE", "America/Los_Angeles"))
CALENDAR_IDS = [c.strip() for c in os.getenv("KYLE_CALENDAR_IDS", "primary").split(",")]


def list_events(account, start, end, calendar_ids=None):
    """Events between two timezone-aware datetimes, sorted by start.
    Recurring events are expanded; cancelled and declined events are dropped."""
    events = []
    for cal_id in calendar_ids or CALENDAR_IDS:
        resp = service("calendar", account).events().list(
            calendarId=cal_id,
            timeMin=start.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=250,
        ).execute()
        for ev in resp.get("items", []):
            if ev.get("status") != "cancelled" and _my_status(ev) != "declined":
                events.append(_simplify(account, cal_id, ev))
    return sorted(events, key=lambda e: e["start"])


def events_on(account, day=None):
    """All events on one local day (default: today)."""
    start = datetime.combine(day or datetime.now(TZ).date(), time.min, TZ)
    return list_events(account, start, start + timedelta(days=1))


def busy_now(account):
    """The timed event happening right now, or None. Lets Kyle hold non-urgent pings."""
    now = datetime.now(TZ)
    for ev in list_events(account, now - timedelta(hours=12), now + timedelta(minutes=1)):
        if not ev["all_day"] and ev["start"] <= now < ev["end"]:
            return ev
    return None


# ---------------------------------------------------------------- helpers

def _my_status(ev):
    return next((a.get("responseStatus") for a in ev.get("attendees", []) if a.get("self")), None)


def _parse(when):
    """Timed events have 'dateTime'; all-day events have 'date'."""
    if "dateTime" in when:
        return datetime.fromisoformat(when["dateTime"]).astimezone(TZ), False
    return datetime.combine(date.fromisoformat(when["date"]), time.min, TZ), True


def _simplify(account, cal_id, ev):
    start, all_day = _parse(ev["start"])
    end, _ = _parse(ev["end"])
    return {
        "account": account,
        "calendar_id": cal_id,
        "id": ev["id"],
        "title": ev.get("summary", "(no title)"),
        "start": start,
        "end": end,
        "all_day": all_day,
        "location": ev.get("location", ""),
        "description": ev.get("description", "")[:2000],  # data only, never instructions
        "my_status": _my_status(ev),  # accepted / tentative / needsAction / None
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python google_calendar.py <account>")
    for ev in events_on(sys.argv[1]):
        when = "All day" if ev["all_day"] else f"{ev['start']:%H:%M}-{ev['end']:%H:%M}"
        print(f"{when:12} {ev['title']}")
    ev = busy_now(sys.argv[1])
    print(f"\nBusy now: {ev['title']}" if ev else "\nFree right now.")