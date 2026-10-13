"""Minimal Claude API example.

Setup:
    pip install anthropic python-dotenv
    cp .env.example .env   # then paste your API key into .env

Usage:
    python terminal.py "Write a haiku about Oregon rain"
    python terminal.py --model claude-opus-5-5 "Write a haiku about Oregon rain"
    python terminal.py -m claude-haiku-5-5 "Quick question..."
"""

import argparse
import os
import sys

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()  # reads ANTHROPIC_API_KEY (and CLAUDE_MODEL) from .env

parser = argparse.ArgumentParser(description="Send a prompt to Claude.")
parser.add_argument(
    "-m", "--model",
    default=os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5"),
    help="Model to use (default: CLAUDE_MODEL from .env, else claude-sonnet-5-5)",
)
parser.add_argument("prompt", nargs="*", help="Your prompt")
args = parser.parse_args()

api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    sys.exit("Missing ANTHROPIC_API_KEY. Copy .env.example to .env and add your key.")

prompt = " ".join(args.prompt) or "Say hello in one sentence."

client = Anthropic(api_key=api_key)

response = client.messages.create(
    model=args.model,
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}],
)

# The response can contain several blocks (e.g. a "thinking" block before the
# answer), so print only the text blocks.
print("".join(block.text for block in response.content if block.type == "text"))
print(
    f"\n[{args.model} | tokens: {response.usage.input_tokens} in / {response.usage.output_tokens} out]",
    file=sys.stderr,
)