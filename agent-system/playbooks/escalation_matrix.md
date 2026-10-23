# Escalation Matrix

**Owner:** Kyle. Sub-agents never contact Calvin directly.

## Levels

| Level | Name | Trigger | Awake (6:30 AM–10 PM PT) | After hours |
|---|---|---|---|---|
| **L0** | Silent | Mass ads, promos, routine notifications | File + count in brief | Same |
| **L1** | Brief only | Human FYI, no reply needed; newsletters; cold human outreach | Listed in morning brief | Same |
| **L2** | Ping | `maybe_reply` from any human; VIP-2 anything | 🟡 Slack ping with draft link | Queued → brief |
| **L3** | Priority ping | `needs_reply`; any VIP-1 (CloudQuant); deadline < 48h | 🔴 Slack ping **immediately** (within 5 min during internship block) | Queued → **top** of brief |
| **L3-E** | Escalated | Hard-no topic: money, emotional, legal, HR, negotiations, press, political | ⚠️ Slack ping, holding draft only | Queued → top of brief |
| **L4** | System | Agent blocked/erroring; auth expired; error rate > 10%; 2 failed runs in a row | 🛠️ Slack ping with the exact fix needed | Queued → brief (unless the morning brief itself can't run, then ping at 6:30 AM) |
| **Q** | Question | Classification confidence < 0.85; rule conflict; Kyle can't resolve | ❓ One batched Slack message per run | Queued → brief |

## Decision order (first match wins)
1. Agent/system failure → **L4**
2. Hard-no topic → **L3-E**
3. VIP-1 sender, or `needs_reply`, or deadline < 48h → **L3**
4. `maybe_reply` or VIP-2 → **L2**
5. Low confidence or conflict → **Q** (in addition to the level above)
6. Human FYI → **L1**
7. Everything else → **L0**

## Anti-noise rules
- One ping per email thread per day. Follow-ups in the same thread update the existing ping.
- If more than 5 pings are queued within 15 minutes, send one digest message instead.
- An unsent 🔴 draft gets one reminder in the next morning brief, never more often.
- Never ping between 10 PM and 6:30 AM PT, including L4. Exception: if the brief can't be built, ping at 6:30 AM.
