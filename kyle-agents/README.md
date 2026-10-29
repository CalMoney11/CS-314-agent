# Kyle Agent System

**Kyle** (head agent) runs the **Email Agent**. Calendar, Canvas, and Resume agents come later. Only Kyle talks to Calvin, in a personal Slack DM.

## Files
```
agent-system/
├── README.md                     ← architecture, setup, trust stages
├── shared/
│   ├── user_file.md              ← Calvin, windows, VIPs, hard rules (read by all agents)
│   └── learnings.md              ← rules learned from Calvin's answers and edits
├── kyle/kyle_system_prompt.md    ← Kyle: role, heartbeat, envelopes, brief format
├── email_agent/
│   ├── identity_file.md          ← scope, access, definition of done
│   └── soul_file.md              ← voice, banned phrases, flag-vs-guess
└── playbooks/
    ├── email_triage_sop.md       ← labels + per-email procedure
    ├── draft_style_matcher_sop.md← style extraction, drafting, learning
    └── escalation_matrix.md      ← when Kyle pings
```
Each rule lives in one file. Others point to it.

## Architecture
```
             Slack DM (Calvin): 🔴 pings · ☀️ brief · ❓ questions · 🛠️ alerts
                                     ▲
cron heartbeat ──► KYLE (Python orchestrator; LLM only for judgment)
                     │ task envelope
          ┌──────────┴──────────┬────────────────┐
     EMAIL AGENT           CALENDAR (planned)  CANVAS (planned)
     Haiku triage · Sonnet drafts
     Gmail ×2 (UOmail forwarded in) · Calendar read-only
```
Heartbeat, health checks, and routing are plain code. The LLM only classifies, drafts, and writes the brief.

## Code layout
```
kyle-agents/
├── kyle/orchestrator.py       # heartbeat, windows, routing, escalation
├── kyle/brief.py              # morning brief (Sonnet, Batch API)
├── agents/email/triage.py     # Haiku classifier → JSON records
├── agents/email/drafter.py    # Sonnet drafter + self-check
├── agents/email/style.py      # style extraction + edit learning
├── tools/google_auth.py       # shared Google OAuth
├── tools/gmail.py             # list, get, labels, create/update draft. No send.
├── tools/google_calendar.py   # events.list only (calendar.readonly)
├── tools/slack.py             # post to Calvin's DM only
├── prompts/                   # these .md files, prompt-cached
├── state/                     # SQLite: processed IDs, threads, metrics
└── tests/test_guardrails.py   # fails if send/forward/trash/delete appears
```

**Guardrails in code**
- Gmail has no drafts-only scope, so `tools/gmail.py` is the allowlist. CI greps for `send`, `trash`, and `delete`.
- Calendar uses `calendar.readonly`; Google blocks writes.
- Email bodies go inside tags as data. A prompt-injection test suite runs in CI.
- A redaction filter (card, account, routing numbers, `$` amounts) runs on every log, summary, and `learnings.md` write.

**Hosting:** cron on a small VPS, Raspberry Pi, or GitHub Actions. `*/5` in the internship block, `*/15` while awake, one batch run at 5:45 AM for the brief.

**Accounts**
- Two Gmails: one OAuth token each.
- UOmail: an Outlook rule forwards to Gmail (Graph usually needs admin consent). Check UO allows auto-forwarding. Calvin replies from UOmail himself.
- Slack: a personal workspace (e.g. "Calvin HQ") with a bot. Never CloudQuant's Slack.

**Cost:** prompt-cache the .md files; use the Batch API (50% off) for the overnight brief.

## Prototype first (optional)
Before writing code, test the prompts in a Claude Project: connect Gmail, Calendar, and Slack; put `kyle_system_prompt.md` in instructions and the rest as knowledge; add a scheduled task for the brief. Limits: roughly hourly runs, uses your plan's limits, and "drafts only" is enforced by instruction, not permissions. Fine for Stage 1 only.

## Trust stages
"Nothing is ever sent" holds at every stage. Any hard-rule violation drops back to Stage 1.

| Stage | Agent adds | Calvin does | Graduate when |
|---|---|---|---|
| 1. Read & sort | Classify, label, archive, brief. No drafts | Corrects labels in Slack | 10 days · ≥ 95% category accuracy · 0 missed needs_reply · 0 violations |
| 2. Draft | Drafts for Needs/Maybe/Escalated, pings on | Reviews, edits, sends | 2 weeks · acceptance ≥ 60% and rising · 0 invented facts |
| 3. Auto-file & learn | Files sent threads, learning loop, adds rules without asking (logged) | Spot-checks weekly report | 3 weeks · acceptance ≥ 75% · < 1 question/day |
| 4. Full heartbeat | 5/15-min cadence, overnight brief, new agents plug in | Reads brief, sends drafts, answers ❓ | Ongoing |
