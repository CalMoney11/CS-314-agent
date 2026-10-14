"""Google Calendar tool wrapper for the Kyle agent system. READ-ONLY.

This module is the ONLY way agents touch Google Calendar. It can:
    list_calendars, list_events, events_on, busy_now
It cannot create, edit, delete, or RSVP to anything. Unlike Gmail, this is
enforced by Google itself: the token only has the calendar.readonly scope,
so even a bug or a prompt injection can't change your calendar.

Setup (reuses the same credentials.json as gmail.py):
    pip install google-api-python-client google-auth-oauthlib python-dotenv

    1. Google Cloud Console -> same project -> also enable "Google Calendar API".
    2. Authorize each account once (opens a browser to log in):
           python calendar.py auth personal
           python calendar.py auth second
       Tokens are saved to tokens/calendar_<name>.json, separate from the
       Gmail tokens because the permissions are different.

Optional .env:
    KYLE_TIMEZONE=America/Los_Angeles   # default

Quick tests:
    python google_calendar.py calendars personal   # every calendar this account can see
    python google_calendar.py today personal       # today's events, all calendars
    python google_calendar.py week personal        # next 7 days
    python google_calendar.py now personal         # am I in an event right now?
"""

import os
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_FILE = Path(os.getenv("GMAIL_CREDENTIALS", BASE_DIR / "credentials.json"))
TOKENS_DIR = Path(os.getenv("GMAIL_TOKENS_DIR", BASE_DIR / "tokens"))
TZ = ZoneInfo(os.getenv("KYLE_TIMEZONE", "America/Los_Angeles"))

_services = {}  # account name -> Calendar API client


# ---------------------------------------------------------------- auth

def _token_file(account):
    return TOKENS_DIR / f"calendar_{account}.json"


def authorize(account):
    """One-time browser login for an account. Saves tokens/calendar_<account>.json."""
    if not CREDENTIALS_FILE.exists():
        sys.exit(f"Missing {CREDENTIALS_FILE}. Download it from Google Cloud Console.")
    flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKENS_DIR.mkdir(exist_ok=True)
    _token_file(account).write_text(creds.to_json())
    print(f"Saved token for '{account}' to {_token_file(account)}")


def _service(account):
    """Return a cached Calendar client for an account, refreshing the token if needed."""
    if account in _services:
        return _services[account]

    token_file = _token_file(account)
    if not token_file.exists():
        raise RuntimeError(f"No calendar token for '{account}'. Run: python calendar.py auth {account}")

    creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            token_file.write_text(creds.to_json())
        else:
            raise RuntimeError(f"Calendar token for '{account}' is invalid. Re-run: python calendar.py auth {account}")

    _services[account] = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return _services[account]


# ---------------------------------------------------------------- read

def list_calendars(account):
    """Return [{id, name, primary}, ...] for every calendar this account can see
    (your own, plus shared ones like a class schedule or a work calendar)."""
    items = _service(account).calendarList().list().execute().get("items", [])
    return [
        {"id": c["id"], "name": c.get("summaryOverride") or c.get("summary", ""), "primary": c.get("primary", False)}
        for c in items
        if not c.get("hidden")
    ]


def list_events(account, start, end, calendar_ids=None, max_results=250):
    """Return events between two datetimes, sorted by start time.

    calendar_ids: list of calendar IDs, or None for every visible calendar.
    Recurring events are expanded into single occurrences.
    Declined events are dropped.
    """
    if calendar_ids is None:
        calendar_ids = [c["id"] for c in list_calendars(account)]

    events = []
    for cal_id in calendar_ids:
        resp = (
            _service(account).events()
            .list(
                calendarId=cal_id,
                timeMin=_to_aware(start).isoformat(),
                timeMax=_to_aware(end).isoformat(),
                singleEvents=True,     # expand recurring events
                orderBy="startTime",
                maxResults=max_results,
            )
            .execute()
        )
        for ev in resp.get("items", []):
            if ev.get("status") == "cancelled" or _declined(ev):
                continue
            events.append(_simplify(account, cal_id, ev))

    events.sort(key=lambda e: e["start"])
    return events


def events_on(account, day=None, calendar_ids=None):
    """All events on one local day (default: today)."""
    day = day or datetime.now(TZ).date()
    start = datetime.combine(day, time.min, TZ)
    return list_events(account, start, start + timedelta(days=1), calendar_ids)


def busy_now(account, calendar_ids=None):
    """Return the timed event happening right now, or None. All-day events don't count.
    Kyle can use this to hold non-urgent pings while you're in a meeting."""
    now = datetime.now(TZ)
    for ev in list_events(account, now - timedelta(hours=12), now + timedelta(minutes=1), calendar_ids):
        if not ev["all_day"] and ev["start"] <= now < ev["end"]:
            return ev
    return None


# ---------------------------------------------------------------- helpers

def _to_aware(dt):
    """Accept a date or a naive/aware datetime. Naive values are treated as local time."""
    if isinstance(dt, date) and not isinstance(dt, datetime):
        dt = datetime.combine(dt, time.min)
    return dt if dt.tzinfo else dt.replace(tzinfo=TZ)


def _parse(when):
    """Google gives {'dateTime': ...} for timed events and {'date': ...} for all-day ones."""
    if "dateTime" in when:
        return datetime.fromisoformat(when["dateTime"]).astimezone(TZ), False
    return datetime.combine(date.fromisoformat(when["date"]), time.min, TZ), True


def _declined(ev):
    for a in ev.get("attendees", []):
        if a.get("self") and a.get("responseStatus") == "declined":
            return True
    return False


def _simplify(account, cal_id, ev):
    start, all_day = _parse(ev["start"])
    end, _ = _parse(ev["end"])
    my_status = next((a.get("responseStatus") for a in ev.get("attendees", []) if a.get("self")), None)
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
        "organizer": ev.get("organizer", {}).get("email", ""),
        "attendees": [a.get("email", "") for a in ev.get("attendees", [])],
        "my_status": my_status,   # accepted / tentative / needsAction / None (your own event)
        "meet_link": ev.get("hangoutLink", ""),
        "html_link": ev.get("htmlLink", ""),
    }


def format_event(ev):
    """One readable line, handy for the morning brief and for debugging."""
    if ev["all_day"]:
        when = "All day"
    else:
        when = f"{ev['start']:%a %I:%M %p}–{ev['end']:%I:%M %p}".replace(" 0", " ")
    extra = f" @ {ev['location']}" if ev["location"] else ""
    flag = " (not yet accepted)" if ev["my_status"] in ("needsAction", "tentative") else ""
    return f"{when:24} {ev['title']}{extra}{flag}"


# ---------------------------------------------------------------- CLI for testing

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, account = sys.argv[1], sys.argv[2]

    if cmd == "auth":
        authorize(account)

    elif cmd == "calendars":
        for c in list_calendars(account):
            print(f"{'*' if c['primary'] else ' '} {c['name'][:40]:40}  {c['id']}")

    elif cmd == "today":
        evs = events_on(account)
        print("\n".join(format_event(e) for e in evs) or "Nothing on the calendar today.")

    elif cmd == "week":
        start = datetime.combine(datetime.now(TZ).date(), time.min, TZ)
        evs = list_events(account, start, start + timedelta(days=7))
        print("\n".join(format_event(e) for e in evs) or "Nothing in the next 7 days.")

    elif cmd == "now":
        ev = busy_now(account)
        print(f"Busy: {format_event(ev)}" if ev else "Free right now.")

    else:
        sys.exit(__doc__)