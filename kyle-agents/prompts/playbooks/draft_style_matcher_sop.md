# Draft & Style SOP

**Owner:** Email Agent · **Models:** Sonnet (drafts), Haiku (style diffs) · **Output:** Gmail drafts only

## A. Style extraction (once, then monthly)
1. Pull the last 50 sent emails per account (`in:sent`). Skip forwards and one-word replies.
2. Strip quoted text. Save the signature separately.
3. Group by audience: boss/CloudQuant · professor/TA · peer · makerspace · stranger/service.
4. Measure greetings, sign-offs, length (median, p90), contractions, exclamations, emoji, lists.
5. Pull 3 real examples each of yes, no, asking, following up, and apologizing.
6. Phrases in 3+ emails become signature phrases (they override the banned list).
7. Propose frequent correspondents as VIPs; Calvin confirms.
8. Fill the voice YAML in `soul_file.md`. Save 5–8 anonymized emails to `style_examples.md`.

## B. Drafting (Needs, Maybe, Escalated)
1. **Context:** last 5 messages of the thread, the triage record, `soul_file.md`, the 2 closest-audience examples, `learnings.md`.
2. **Meeting asks only:** read the next 7 days of calendar. Offer 2–3 free slots outside the internship block, classes, and makerspace shifts, labeled "PT".
3. **Write:** answer or ask first · audience length ±30% · unknowns in `[[brackets]]` · hard-no → holding reply only.
4. **Self-check** (all must pass):
   - [ ] No banned phrases (unless they're signature phrases)
   - [ ] No invented facts, dates, numbers, or commitments
   - [ ] No financial details copied from the thread
   - [ ] Greeting, sign-off, and length fit the audience
   - [ ] Draft is in the account that received the email
5. **Save** with `gmail.create_draft(..., reply_to=message)` so it threads correctly. Return `draft_id`.

## C. Learning from edits
When the sent check finds Calvin replied on a drafted thread:
1. Word-level diff of draft vs. sent (redact financial content first).
2. Haiku tags it: `no_change` · `tone` · `length` · `facts_added` · `greeting/signoff` · `rewrite`.
3. A `tone`, `length`, or `greeting/signoff` pattern seen 2+ times becomes a rule in `learnings.md`, e.g. "RULE: To Jimmy, skip the greeting."
4. Track **acceptance rate**: drafts sent with < 20% change. Kyle reports it weekly; it gates the trust stages.
