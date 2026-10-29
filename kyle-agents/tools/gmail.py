"""Gmail tool for Kyle. Allowlist only:
    list_messages, get_message, modify_labels, create_draft, update_draft

No send, forward, trash, or delete. gmail.modify can technically send, so
this file IS the guardrail. tests/test_guardrails.py should fail if
messages.send / drafts.send / trash / delete ever appear here.

Auth: python google_auth.py gmail <account>
Test: python gmail.py <account>      # prints 10 newest inbox emails
"""

import base64
import re
import sys
from email.message import EmailMessage
from html import unescape

from google_auth import service

BLOCKED_LABELS = {"TRASH", "SPAM", "SENT", "DRAFT"}  # TRASH/SPAM = sneaky delete
MAX_BODY_CHARS = 20_000

_label_ids = {}  # account -> {label name: id}


def _gmail(account):
    return service("gmail", account).users()


# ---------------------------------------------------------------- read

def list_messages(account, query="in:inbox", max_results=10):
    """[{id, thread_id}, ...] newest first, for any Gmail search query."""
    resp = _gmail(account).messages().list(userId="me", q=query, maxResults=max_results).execute()
    return [{"id": m["id"], "thread_id": m["threadId"]} for m in resp.get("messages", [])]


def get_message(account, message_id):
    """One email as a plain dict: headers + readable body."""
    msg = _gmail(account).messages().get(userId="me", id=message_id, format="full").execute()
    h = {x["name"].lower(): x["value"] for x in msg["payload"].get("headers", [])}
    return {
        "account": account,
        "id": msg["id"],
        "thread_id": msg["threadId"],
        "label_ids": msg.get("labelIds", []),
        "from": h.get("from", ""),
        "to": h.get("to", ""),
        "cc": h.get("cc", ""),
        "subject": h.get("subject", ""),
        "date": h.get("date", ""),
        "message_id_header": h.get("message-id", ""),  # for threading replies
        "references": h.get("references", ""),
        "body": _extract_body(msg["payload"])[:MAX_BODY_CHARS],
    }


def _extract_body(payload):
    """Prefer text/plain; fall back to stripped HTML. Skips attachments."""
    parts = {"text/plain": [], "text/html": []}

    def walk(part):
        data = part.get("body", {}).get("data")
        if data and not part.get("filename") and part.get("mimeType") in parts:
            raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
            parts[part["mimeType"]].append(raw.decode("utf-8", errors="replace"))
        for sub in part.get("parts", []):
            walk(sub)

    walk(payload)
    if parts["text/plain"]:
        return "\n".join(parts["text/plain"]).strip()
    text = "\n".join(parts["text/html"])
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", "", text)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n\s*\n+", "\n\n", unescape(text)).strip()


# ---------------------------------------------------------------- labels

def _label_id(account, name):
    """Label ID by name ("Kyle/Needs Reply", "INBOX"...). Creates missing user labels."""
    cache = _label_ids.setdefault(account, {})
    if name not in cache:
        labels = _gmail(account).labels()
        cache.update({l["name"]: l["id"] for l in labels.list(userId="me").execute().get("labels", [])})
        if name not in cache:
            cache[name] = labels.create(userId="me", body={"name": name}).execute()["id"]
    return cache[name]


def modify_labels(account, message_id, add=(), remove=()):
    """Add/remove labels by name. Archive = remove=["INBOX"]; mark read = remove=["UNREAD"]."""
    blocked = BLOCKED_LABELS & {n.upper() for n in (*add, *remove)}
    if blocked:
        raise PermissionError(f"Blocked label(s): {sorted(blocked)}")
    body = {
        "addLabelIds": [_label_id(account, n) for n in add],
        "removeLabelIds": [_label_id(account, n) for n in remove],
    }
    resp = _gmail(account).messages().modify(userId="me", id=message_id, body=body).execute()
    return resp.get("labelIds", [])


# ---------------------------------------------------------------- drafts (never sent)

def _draft(to, subject, body, cc=None, reply_to=None):
    """reply_to = a dict from get_message() to thread the draft as a reply."""
    msg = EmailMessage()
    msg["To"] = to
    if cc:
        msg["Cc"] = cc
    message = {}
    if reply_to:
        message["threadId"] = reply_to["thread_id"]
        if not subject.lower().startswith("re:"):
            subject = "Re: " + subject
        if reply_to.get("message_id_header"):
            msg["In-Reply-To"] = reply_to["message_id_header"]
            msg["References"] = f"{reply_to.get('references', '')} {reply_to['message_id_header']}".strip()
    msg["Subject"] = subject
    msg.set_content(body)
    message["raw"] = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return {"message": message}


def create_draft(account, to, subject, body, cc=None, reply_to=None):
    """Save a draft. NOT sent; Calvin sends it himself."""
    d = _gmail(account).drafts().create(userId="me", body=_draft(to, subject, body, cc, reply_to)).execute()
    return {"draft_id": d["id"], "thread_id": d["message"]["threadId"]}


def update_draft(account, draft_id, to, subject, body, cc=None, reply_to=None):
    """Replace a draft's content. Still NOT sent."""
    d = _gmail(account).drafts().update(userId="me", id=draft_id, body=_draft(to, subject, body, cc, reply_to)).execute()
    return {"draft_id": d["id"], "thread_id": d["message"]["threadId"]}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python gmail.py <account>")
    for m in list_messages(sys.argv[1]):
        e = get_message(sys.argv[1], m["id"])
        print(f"{e['id']}  {e['from'][:35]:35}  {e['subject'][:60]}")