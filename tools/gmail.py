"""Gmail tool wrapper for the Kyle agent system. Allowlist only.

This module is the ONLY way agents touch Gmail. It can:
    list_messages, get_message, get_label_id, modify_labels,
    create_draft, update_draft
It deliberately has NO send, forward, trash, or delete functions.

Why: Gmail has no "drafts-only" OAuth scope. gmail.modify (used here) can
technically send, so the safety lives in this file. Never add
messages.send / drafts.send / messages.trash / messages.delete here.
(tests/test_guardrails.py will enforce this later.)

Setup:
    pip install google-api-python-client google-auth-oauthlib python-dotenv

    1. Google Cloud Console -> create a project -> enable "Gmail API".
    2. OAuth consent screen -> External -> add both of your Gmails as test users.
    3. Credentials -> Create OAuth client ID -> "Desktop app" -> download JSON,
       save it as credentials.json next to this file
       (or set GMAIL_CREDENTIALS=/path/to/file.json in .env).
    4. Authorize each account once (opens a browser to log in):
           python gmail.py auth personal
           python gmail.py auth second
       The names ("personal", "second") are your choice. Tokens are saved to
       tokens/<name>.json. Put tokens/ and credentials.json in .gitignore.

Quick tests:
    python gmail.py list personal                         # 10 newest inbox emails
    python gmail.py list personal "is:unread newer_than:1d"
    python gmail.py get personal <message_id>             # headers + body
    python gmail.py label personal <message_id> Kyle/Test # add a label
    python gmail.py draft personal you@gmail.com          # test draft (NOT sent)
"""

import base64
import os
import re
import sys
from email.message import EmailMessage
from html import unescape
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]
BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_FILE = Path(os.getenv("GMAIL_CREDENTIALS", BASE_DIR / "credentials.json"))
TOKENS_DIR = Path(os.getenv("GMAIL_TOKENS_DIR", BASE_DIR / "tokens"))

# Labels agents may never add or remove. TRASH/SPAM would be a sneaky delete;
# SENT/DRAFT are managed by Gmail itself.
BLOCKED_LABELS = {"TRASH", "SPAM", "SENT", "DRAFT"}

MAX_BODY_CHARS = 20_000  # keeps one giant newsletter from blowing up token costs

_services = {}      # account name -> Gmail API client
_label_cache = {}   # account name -> {label name: label id}


# ---------------------------------------------------------------- auth

def authorize(account):
    """One-time browser login for an account. Saves tokens/<account>.json."""
    if not CREDENTIALS_FILE.exists():
        sys.exit(f"Missing {CREDENTIALS_FILE}. Download it from Google Cloud Console.")
    flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKENS_DIR.mkdir(exist_ok=True)
    (TOKENS_DIR / f"{account}.json").write_text(creds.to_json())
    print(f"Saved token for '{account}' to {TOKENS_DIR / f'{account}.json'}")


def _service(account):
    """Return a cached Gmail client for an account, refreshing the token if needed."""
    if account in _services:
        return _services[account]

    token_file = TOKENS_DIR / f"{account}.json"
    if not token_file.exists():
        raise RuntimeError(f"No token for '{account}'. Run: python gmail.py auth {account}")

    creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            token_file.write_text(creds.to_json())
        else:
            raise RuntimeError(f"Token for '{account}' is invalid. Re-run: python gmail.py auth {account}")

    _services[account] = build("gmail", "v1", credentials=creds, cache_discovery=False)
    return _services[account]


# ---------------------------------------------------------------- read

def list_messages(account, query="in:inbox", max_results=10):
    """Return [{id, thread_id}, ...] newest first, for any Gmail search query."""
    resp = (
        _service(account).users().messages()
        .list(userId="me", q=query, maxResults=max_results)
        .execute()
    )
    return [{"id": m["id"], "thread_id": m["threadId"]} for m in resp.get("messages", [])]


def get_message(account, message_id):
    """Return one email as a plain dict (headers + readable body text)."""
    msg = (
        _service(account).users().messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )
    headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
    body = _extract_body(msg["payload"])
    if len(body) > MAX_BODY_CHARS:
        body = body[:MAX_BODY_CHARS] + "\n[...truncated]"

    return {
        "account": account,
        "id": msg["id"],
        "thread_id": msg["threadId"],
        "label_ids": msg.get("labelIds", []),
        "from": headers.get("from", ""),
        "to": headers.get("to", ""),
        "cc": headers.get("cc", ""),
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "message_id_header": headers.get("message-id", ""),  # needed to thread replies
        "references": headers.get("references", ""),
        "snippet": unescape(msg.get("snippet", "")),
        "body": body,
    }


def _decode(data):
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")


def _extract_body(payload):
    """Walk the MIME tree. Prefer text/plain; fall back to stripped HTML."""
    plain, html = [], []

    def walk(part):
        data = part.get("body", {}).get("data")
        if data and not part.get("filename"):  # skip attachments
            if part.get("mimeType") == "text/plain":
                plain.append(_decode(data))
            elif part.get("mimeType") == "text/html":
                html.append(_decode(data))
        for sub in part.get("parts", []):
            walk(sub)

    walk(payload)
    if plain:
        return "\n".join(plain).strip()
    if html:
        text = "\n".join(html)
        text = re.sub(r"(?is)<(script|style)\b.*?</\1>", "", text)
        text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", text)
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\n\s*\n+", "\n\n", unescape(text))
        return text.strip()
    return ""


# ---------------------------------------------------------------- labels

def get_label_id(account, name, create=True):
    """Look up a label ID by name (e.g. "Kyle/Needs Reply" or "INBOX").
    Creates user labels that don't exist yet unless create=False."""
    cache = _label_cache.setdefault(account, {})
    if name in cache:
        return cache[name]

    svc = _service(account)
    for lab in svc.users().labels().list(userId="me").execute().get("labels", []):
        cache[lab["name"]] = lab["id"]

    if name not in cache and create:
        lab = svc.users().labels().create(
            userId="me",
            body={"name": name, "labelListVisibility": "labelShow", "messageListVisibility": "show"},
        ).execute()
        cache[name] = lab["id"]
    return cache.get(name)


def modify_labels(account, message_id, add=(), remove=()):
    """Add/remove labels by NAME. System labels work too:
        archive      -> remove=["INBOX"]
        mark read    -> remove=["UNREAD"]
    TRASH, SPAM, SENT, and DRAFT are refused."""
    blocked = BLOCKED_LABELS & {n.upper() for n in (*add, *remove)}
    if blocked:
        raise PermissionError(f"Blocked label(s): {sorted(blocked)}. Agents can't trash or spam mail.")

    body = {
        "addLabelIds": [get_label_id(account, n) for n in add],
        "removeLabelIds": [i for i in (get_label_id(account, n, create=False) for n in remove) if i],
    }
    resp = _service(account).users().messages().modify(userId="me", id=message_id, body=body).execute()
    return resp.get("labelIds", [])


# ---------------------------------------------------------------- drafts (never sent)

def _draft_body(to, subject, body, cc=None, reply_to=None):
    """Build the API payload. reply_to = a dict from get_message() to thread it as a reply."""
    msg = EmailMessage()
    msg["To"] = to
    if cc:
        msg["Cc"] = cc

    message = {}
    if reply_to:
        message["threadId"] = reply_to["thread_id"]
        if not subject.lower().startswith("re:"):
            subject = "Re: " + subject
        parent = reply_to.get("message_id_header")
        if parent:
            msg["In-Reply-To"] = parent
            msg["References"] = f"{reply_to.get('references', '')} {parent}".strip()

    msg["Subject"] = subject
    msg.set_content(body)
    message["raw"] = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return {"message": message}


def create_draft(account, to, subject, body, cc=None, reply_to=None):
    """Save a draft in Gmail. It is NOT sent. Calvin reviews and sends it himself."""
    draft = (
        _service(account).users().drafts()
        .create(userId="me", body=_draft_body(to, subject, body, cc, reply_to))
        .execute()
    )
    return {"draft_id": draft["id"], "thread_id": draft["message"]["threadId"]}


def update_draft(account, draft_id, to, subject, body, cc=None, reply_to=None):
    """Replace an existing draft's content. Still NOT sent."""
    draft = (
        _service(account).users().drafts()
        .update(userId="me", id=draft_id, body=_draft_body(to, subject, body, cc, reply_to))
        .execute()
    )
    return {"draft_id": draft["id"], "thread_id": draft["message"]["threadId"]}


# ---------------------------------------------------------------- CLI for testing

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, account, rest = sys.argv[1], sys.argv[2], sys.argv[3:]

    if cmd == "auth":
        authorize(account)

    elif cmd == "list":
        query = rest[0] if rest else "in:inbox"
        for m in list_messages(account, query):
            e = get_message(account, m["id"])
            print(f"{e['id']}  {e['from'][:35]:35}  {e['subject'][:60]}")

    elif cmd == "get" and rest:
        e = get_message(account, rest[0])
        for key in ("from", "to", "subject", "date", "label_ids"):
            print(f"{key:>9}: {e[key]}")
        print("\n" + e["body"][:2000])

    elif cmd == "label" and len(rest) == 2:
        print("Labels now:", modify_labels(account, rest[0], add=[rest[1]]))

    elif cmd == "draft" and rest:
        d = create_draft(account, rest[0], "Kyle test draft", "This is a test draft from gmail.py. Not sent.")
        print(f"Draft created: {d['draft_id']}. Check your Drafts folder.")

    else:
        sys.exit(__doc__)