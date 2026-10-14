"""Claude in Slack — same idea as terminal.py, but messages come from Slack.

Setup:
    pip install anthropic python-dotenv slack_bolt
    Add to .env:
        ANTHROPIC_API_KEY=sk-ant-...
        SLACK_BOT_TOKEN=xoxb-...   # OAuth & Permissions -> Bot User OAuth Token
        SLACK_APP_TOKEN=xapp-...   # Basic Information -> App-Level Token (connections:write)
        CLAUDE_MODEL=claude-sonnet-5-5   # optional

Slack app needs: Socket Mode on; bot scopes app_mentions:read, chat:write,
im:history; bot events app_mention and message.im.

Usage:
    python slack.py
    python slack.py -m claude-opus-5-5
Then DM the bot or @mention it in a channel.
"""

import argparse
import os
import re
import sys

from anthropic import Anthropic
from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

load_dotenv()

parser = argparse.ArgumentParser(description="Run Claude as a Slack bot.")
parser.add_argument(
    "-m", "--model",
    default=os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5"),
    help="Model to use (default: CLAUDE_MODEL from .env, else claude-sonnet-5-5)",
)
args = parser.parse_args()

for var in ("ANTHROPIC_API_KEY", "SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"):
    if not os.getenv(var):
        sys.exit(f"Missing {var} in .env")

claude = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
app = App(token=os.environ["SLACK_BOT_TOKEN"])


def ask_claude(prompt):
    response = claude.messages.create(
        model=args.model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    print(
        f"[{args.model} | tokens: {response.usage.input_tokens} in / {response.usage.output_tokens} out]",
        file=sys.stderr,
    )
    return "".join(block.text for block in response.content if block.type == "text")


def reply(event, say, text):
    try:
        answer = ask_claude(text) or "(no response)"
    except Exception as e:
        answer = f"Error: {e}"
    say(text=answer)


@app.event("app_mention")
def on_mention(event, say):
    text = re.sub(r"<@[A-Z0-9]+>", "", event["text"]).strip()  # drop the @mention
    reply(event, say, text or "Say hello in one sentence.")


@app.event("message")
def on_dm(event, say):
    # Only plain DMs from people; ignore bots, edits, and channel messages.
    if event.get("channel_type") != "im" or event.get("bot_id") or event.get("subtype"):
        return
    reply(event, say, event.get("text", ""))


if __name__ == "__main__":
    print(f"Slack bot running with {args.model}. Ctrl+C to stop.")
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()