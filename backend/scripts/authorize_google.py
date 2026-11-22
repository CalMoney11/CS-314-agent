"""One-time Google login for the app backend.

Opens a browser, asks for READ-ONLY Gmail + Calendar access, and saves the
token to tokens/app_<account>.json at the repo root (gitignored).

Usage (from the repo root):
    backend/.venv/bin/python backend/scripts/authorize_google.py personal

Needs credentials.json (OAuth client of type "Desktop app") at the repo root.
If the OAuth consent screen is still in "Testing", Google expires the refresh
token after 7 days. Publish the app (Google Auth Platform -> Audience ->
Publish app) so the token keeps working.
"""

import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.google_auth import SCOPES  # noqa: E402

CREDENTIALS_FILE = REPO_ROOT / "credentials.json"
TOKENS_DIR = REPO_ROOT / "tokens"


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].isidentifier():
        sys.exit("Usage: authorize_google.py <account-name>   e.g. personal")
    account = sys.argv[1]
    if not CREDENTIALS_FILE.exists():
        sys.exit(f"Missing {CREDENTIALS_FILE}. Download the OAuth client JSON from Google Cloud.")

    flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
    # prompt=consent guarantees Google returns a refresh token.
    creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")
    if not creds.refresh_token:
        sys.exit("Google did not return a refresh token. Remove the app's access at "
                 "https://myaccount.google.com/permissions and run this again.")

    TOKENS_DIR.mkdir(exist_ok=True)
    out = TOKENS_DIR / f"app_{account}.json"
    out.write_text(creds.to_json())
    out.chmod(0o600)
    print(f"Saved {out.relative_to(REPO_ROOT)} (Gmail + Calendar, read-only).")


if __name__ == "__main__":
    main()
