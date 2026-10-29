"""Shared Google OAuth for the Kyle tools (gmail.py, google_calendar.py).

Setup:
    pip install google-api-python-client google-auth-oauthlib python-dotenv
    Put credentials.json (OAuth client, "Desktop app") next to this file, then
    authorize each account once per tool:
        python google_auth.py gmail personal
        python google_auth.py calendar personal
    Tokens go to tokens/<tool>_<account>.json. Keep tokens/ and credentials.json
    in .gitignore.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_FILE = Path(os.getenv("GOOGLE_CREDENTIALS", BASE_DIR / "credentials.json"))
TOKENS_DIR = Path(os.getenv("GOOGLE_TOKENS_DIR", BASE_DIR / "tokens"))

# One fixed scope per tool. Calendar is read-only at Google's level.
SCOPES = {
    "gmail": ["https://www.googleapis.com/auth/gmail.modify"],
    "calendar": ["https://www.googleapis.com/auth/calendar.readonly"],
}
APIS = {"gmail": ("gmail", "v1"), "calendar": ("calendar", "v3")}

_services = {}


def _token_file(tool, account):
    return TOKENS_DIR / f"{tool}_{account}.json"


def authorize(tool, account):
    """One-time browser login. Saves tokens/<tool>_<account>.json."""
    if not CREDENTIALS_FILE.exists():
        sys.exit(f"Missing {CREDENTIALS_FILE}. Download it from Google Cloud Console.")
    flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES[tool])
    creds = flow.run_local_server(port=0)
    TOKENS_DIR.mkdir(exist_ok=True)
    _token_file(tool, account).write_text(creds.to_json())
    print(f"Saved {tool} token for '{account}'.")


def service(tool, account):
    """Cached API client for a tool + account, refreshing the token if needed."""
    key = (tool, account)
    if key in _services:
        return _services[key]

    token_file = _token_file(tool, account)
    if not token_file.exists():
        raise RuntimeError(f"No {tool} token for '{account}'. Run: python google_auth.py {tool} {account}")

    creds = Credentials.from_authorized_user_file(str(token_file), SCOPES[tool])
    if not creds.valid:
        if not (creds.expired and creds.refresh_token):
            raise RuntimeError(f"{tool} token for '{account}' is invalid. Re-run: python google_auth.py {tool} {account}")
        creds.refresh(Request())
        token_file.write_text(creds.to_json())

    name, version = APIS[tool]
    _services[key] = build(name, version, credentials=creds, cache_discovery=False)
    return _services[key]


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in SCOPES:
        sys.exit("Usage: python google_auth.py {gmail|calendar} <account>")
    authorize(sys.argv[1], sys.argv[2])