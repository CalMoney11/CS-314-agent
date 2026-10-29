# Escalation Matrix

**Owner:** Kyle. Sub-agents never contact Calvin.

## Decide (first match wins)
| # | Level | Trigger | Awake | After hours |
|---|---|---|---|---|
| 1 | **L4** 🛠️ | Agent blocked or erroring, auth expired, error rate > 10%, 2 failed runs in a row | Ping with the exact fix | Brief |
| 2 | **L3-E** ⚠️ | Hard-no topic | Ping, holding draft only | Top of brief |
| 3 | **L3** 🔴 | `needs_reply`, any VIP-1, deadline < 48h | Ping now (within 5 min in the internship block) | Top of brief |
| 4 | **L2** 🟡 | `maybe_reply`, any VIP-2 | Ping with draft link | Brief |
| 5 | **L1** | Human FYI, newsletters, cold human outreach | Brief only | Brief only |
| 6 | **L0** | Mass ads, routine notifications | Count in brief | Count in brief |

**Q ❓** is added on top of any level when confidence < 0.85, rules conflict, or Kyle can't resolve something. One batched message per run.

## Anti-noise
- One ping per thread per day. Later messages update the existing ping.
- More than 5 pings queued in 15 minutes → send one digest instead.
- An unsent 🔴 draft gets one reminder in the next brief, no more.
- Nothing between 10 PM and 6:30 AM, L4 included. If the brief itself can't be built, ping at 6:30 AM.
