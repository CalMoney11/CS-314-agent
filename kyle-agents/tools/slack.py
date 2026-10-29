"""Slack tool for Kyle. Allowlist: post() -> chat.postMessage to Calvin's DM.

There is deliberately no channel argument: Kyle can only ever message Calvin.

Setup:
    pip install slack_sdk python-dotenv
    Slack app in your personal workspace, bot scope: chat:write
    .env:
        SLACK_BOT_TOKEN=xoxb-...
        SLACK_CALVIN_USER_ID=U0123ABCD   # your member ID (Profile -> ... -> Copy member ID)

Test: python slack.py "hello from Kyle"
"""

import os
import sys

from dotenv import load_dotenv
from slack_sdk import WebClient

load_dotenv()

_client = None


def post(text):
    """Send one message to Calvin's DM with the bot. Returns the message timestamp."""
    global _client
    if _client is None:
        _client = WebClient(token=os.environ["SLACK_BOT_TOKEN"])
    resp = _client.chat_postMessage(channel=os.environ["SLACK_CALVIN_USER_ID"], text=text)
    return resp["ts"]


if __name__ == "__main__":
    print("Posted:", post(" ".join(sys.argv[1:]) or "Kyle test ping"))