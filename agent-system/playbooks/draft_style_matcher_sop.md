# Draft Generation & Style Matcher SOP

**Owner:** Email Agent · **Model:** Sonnet 5.5 (drafts), Haiku 5.5 (style diffing) · **Output:** Gmail drafts only

## Part A — Style Extraction (one-time, then monthly refresh)

**Input:** Calvin's last 50 sent emails from each account (150 max). Exclude one-word replies and forwards.

1. Pull sent mail (`in:sent`, newest first).
2. Strip quoted replies and signatures, but record the signature separately.
3. Group by audience: **boss/CloudQuant · professor/TA · peer/team · makerspace · stranger/service**.
4. Measure: greetings, sign-offs, median and p90 length, contractions, exclamation and emoji rate, list usage, paragraph length.
5. Extract 3 real examples each of: saying yes, saying no, asking for something, following up, apologizing (if present).
6. Find repeated phrases (n-grams that appear in 3+ emails). These are **signature phrases** and override the banned list.
7. Find frequent correspondents. Propose additions to the VIP table in `user_file.md`; Calvin confirms them.
8. Write the YAML block into `soul_file.md` → "Voice profile". Save 5–8 anonymized exemplar emails to `style_examples.md` as few-shot examples.

## Part B — Draft generation (every Needs / Maybe / Escalated email)

1. **Load context:** the full thread (last 5 messages), the triage record, `soul_file.md`, `style_examples.md` (pick the 2 closest-audience examples), and `learnings.md`.
2. **Calendar step** (only if the email asks to meet or for availability): read the calendar for the next 7 days. Offer 2–3 free slots that avoid the internship block, classes, and makerspace shifts. Label them "PT". Never create an event.
3. **Write the draft:**
   - First sentence answers or asks.
   - Match the audience's measured length (±30%).
   - Unknowns go in `[[double brackets]]`.
   - Hard-no topics → **holding reply only**: acknowledge receipt and commit to nothing.
4. **Self-check before saving** (must pass all):
   - [ ] No banned phrases (unless they're on Calvin's signature-phrase list)
   - [ ] No invented facts, dates, numbers, or commitments
   - [ ] No financial details copied from the thread
   - [ ] Greeting and sign-off match the audience profile
   - [ ] Length within the audience range
   - [ ] Reply-to account = the account that received the email
5. **Save as a Gmail draft** in the correct thread (`threadId` set, `In-Reply-To` header set). **Never call send.**
6. Return `draft_id` to Kyle.

## Part C — Learning from Calvin's edits

When the sent-status check finds Calvin replied on a drafted thread:
1. Diff draft vs. sent (word-level).
2. Haiku classifies the edit: `no_change` · `tone` · `length` · `facts_added` · `greeting/signoff` · `rewrite`.
3. If the edit is `tone`, `length`, or `greeting/signoff` **and the same pattern appears 2+ times**, append a rule to `learnings.md`, for example: "RULE: To Jimmy, drop greeting, start with name only."
4. Track an **acceptance rate** (the share of drafts sent with < 20% change). Kyle reports it weekly. It's the main graduation metric for the Trust Stages.
5. Never record financial content in diffs. Redact before storing.
