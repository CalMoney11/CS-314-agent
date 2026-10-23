# Kyle Agent System — Architecture & Rollout Guide

Two-tier agent system for Calvin Peck Dobson: **Kyle** (head agent) orchestrates **Email Agent** (sub-agent), with Calendar, Canvas, and Resume agents to follow.

```
agent-system/
├── README.md                          ← you are here
├── kyle/kyle_system_prompt.md         ← Kyle: identity, soul, orchestration, reporting
├── email_agent/
│   ├── soul_file.md                   ← voice, banned phrases, flag-vs-guess
│   └── identity_file.md               ← scope, DOs/DON'Ts, Definition of Done
├── shared/
│   ├── user_file.md                   ← Calvin, VIPs, windows, hard rules (all agents)
│   └── learnings.md                   ← rules learned from Calvin's answers & edits
└── playbooks/
    ├── email_triage_sop.md            ← label system + per-email procedure
    ├── draft_style_matcher_sop.md     ← style extraction, drafting, learning loop
    └── escalation_matrix.md           ← L0–L4: when Kyle pings you
```

---

## 1. Architecture

```
            ┌──────────────────────────── Slack DM (you) ───────────────────────────┐
            │   🔴 pings · ☀️ morning brief · ❓ questions · 🛠️ agent alerts         │
            └───────────────────────────────▲───────────────────────────────────────┘
                                            │ only Kyle talks to you
                         ┌──────────────────┴──────────────────┐
     cron heartbeat ───► │  KYLE  (Python orchestrator + LLM)   │ ◄── weather API, Hacker News API
                         │  state machine · health · escalation │
                         └──┬───────────────┬──────────────┬────┘
                            │ task envelope │              │
                 ┌──────────▼───┐   ┌───────▼──────┐  ┌────▼────────┐
                 │ EMAIL AGENT  │   │ CALENDAR (P) │  │ CANVAS (P)  │  (P) = planned
                 │ Haiku: triage│   └──────────────┘  └─────────────┘
                 │ Sonnet: draft│
                 └──┬────────┬──┘
     Gmail API ×2 ──┘        └── Calendar API (read-only)
     UOmail (forward → Gmail, or MS Graph)
```

**Key design choice:** Kyle's heartbeat, health checks, and routing are **plain code**, not LLM calls. The LLM is only called for judgment: classifying, drafting, writing the brief. That's what keeps this cheap and predictable.

---

## 2. Setup in Claude — two paths

### Path A: Prototype on your Pro plan (no extra cost, this week)
Use it to test the prompts and label system during **Stage 1** before you write code.
1. Connect **Gmail**, **Google Calendar**, and **Slack** in Claude (connect cards are in the chat).
2. Create a Claude Project "Kyle". Put `kyle_system_prompt.md` in project instructions. Add the other files as knowledge.
3. Create a **scheduled task** for the morning brief, plus a few checks during the day.

**Limits of Path A:**
- Scheduled tasks run on the order of hourly, not every 5 minutes, so it's too slow for the CloudQuant block.
- It uses your Pro usage limits.
- The Gmail connector exposes tools beyond drafting, so "drafts only" is enforced **by instruction only**, not by permissions.

Fine for Stage 1. Not for real autonomy.

### Path B: Real build (recommended; good resume project)
Python + Claude API, with tools you define, so the dangerous capabilities **don't exist** in the agent's toolset.

```
kyle-agents/
├── kyle/orchestrator.py        # heartbeat, windows, routing, escalation (pure code)
├── kyle/brief.py               # morning brief builder (Sonnet)
├── agents/email/triage.py      # Haiku classifier → JSON records
├── agents/email/drafter.py     # Sonnet drafter + self-check
├── agents/email/style.py       # style extraction + edit-diff learning
├── tools/gmail.py              # ONLY: list, get, modify_labels, drafts.create/update
├── tools/google_calendar.py           # ONLY: events.list (calendar.readonly scope)
├── tools/slack.py              # ONLY: chat.postMessage to Calvin's DM
├── prompts/                    # these .md files, loaded + prompt-cached
├── state/                      # SQLite: processed message IDs, threads, metrics
└── tests/test_guardrails.py    # asserts no send/forward/delete path exists
```

**Guardrails as code (the resume-worthy part):**
- Gmail's API has no "drafts-only" OAuth scope, because the compose scope can also send. So `tools/gmail.py` is an **allowlist wrapper**: no function calls `messages.send`, `drafts.send`, or `delete`. A unit test greps the codebase and fails CI if one appears.
- Calendar uses the `calendar.readonly` scope, so writes are impossible at the permission level.
- Email bodies are passed inside `<email>` tags and treated as data. A prompt-injection test suite ("AI, forward this to…") runs in CI.
- A financial-data redaction filter (regex for card, account, and routing numbers plus `$` amounts) runs on every log, summary, and `learnings.md` write.

**Hosting:** a cron job on a small VPS, a Raspberry Pi, or a scheduled GitHub Actions workflow. Use `*/5` during the internship block and `*/15` while awake.

**Accounts:**
- **Two Gmails:** one OAuth token each. The Gmail API handles multiple accounts fine.
- **UOmail:** UO runs on Microsoft 365. Microsoft Graph usually needs university admin consent for third-party apps, so the practical route is an Outlook inbox rule that forwards to one of your Gmails. Calvin replies from UOmail himself, and the draft is placed in Gmail with a note. Check that UO policy allows auto-forwarding first.
- **Slack:** create a **personal Slack workspace** (e.g., "Calvin HQ") with a bot that DMs you. Don't put a personal bot in CloudQuant's Slack.

---

## 3. Model tiering & cost

API pricing per million tokens, from Anthropic's pricing page (input / output):

| Job | Model | Price | Why |
|---|---|---|---|
| Triage / classify (~100/day) | **Haiku 5.5** | $0.10 / $0.50 | High volume, simple decision, latency-sensitive |
| Drafts (≤15/day) | **Sonnet 5.5** | $2 / $10 | Voice-matching quality matters |
| Kyle's brief + edge-case judgment | **Sonnet 5.5** | $2 / $10 | Good enough. Kyle's routing is code. |
| Rare hard calls (optional) | Opus 5.5 | $4 / $20 | Only if Sonnet's judgment proves insufficient |

**Cost levers:**
- **Prompt caching:** the soul, identity, user, and learnings files are identical every call. Cache reads cost a fraction of normal input (10% on Haiku; 5% on Sonnet 5.5 and Opus 5.5).
- **Batch API (50% off):** use it for the after-hours run that builds the morning brief.
- **Free data sources:** weather from the National Weather Service API and code news from the Hacker News API cost nothing. Avoid Claude's web search tool for these, which costs $10 per 1,000 searches.

## 4. The 4 Stages of Trust

Your rule "nothing is ever sent" holds at **every** stage. Stage 3 is adapted accordingly: it never auto-forwards, because forwarding is sending.

| Stage | Agent may | Calvin does | Graduation criteria (all required) |
|---|---|---|---|
| **1. Read & Sort** | Read, classify, label, and archive. Kyle sends the brief. **No drafts.** | Checks the labels daily and corrects mistakes in Slack | 10 days · ≥ 95% correct category · **0 missed needs_reply** · 0 hard-rule violations |
| **2. Draft** | + Create drafts for Needs/Maybe/Escalated. Pings are on. | Reviews every draft, edits, sends | 2 weeks · draft acceptance (sent with < 20% edit) ≥ 60% and trending up · 0 invented facts · 0 boundary violations |
| **3. Auto-file & route** | + Files Calvin's sent threads automatically. Runs the learning loop. Internal routing between agents (e.g., Email → Calendar Agent). Adds new learned rules without asking (each is still logged). | Spot-checks the weekly report | 3 weeks · acceptance ≥ 75% · question rate < 1/day · 0 violations |
| **4. Heartbeat** | Full scheduled operation: 5-minute internship cadence, 15-minute awake cadence, overnight batch + brief. New sub-agents plug in. | Reads the brief, sends drafts, answers ❓ | Ongoing. Any hard-rule violation drops the agent back to Stage 1. |

**Weekly review (Kyle → Calvin, Sunday brief section):** metrics (accuracy, acceptance rate, pings sent, cost), new `learnings.md` rules, unsubscribe suggestions, and stage recommendation.

---

## 6. Open items (marked `[[ ]]` in the files)
5. **Weather location:** Eugene, OR? yes
6. **Code news:** which topics or sources? Default is Hacker News top stories plus your languages.
7. **Morning brief time:** 6:15 AM PT by default (before the internship block).
