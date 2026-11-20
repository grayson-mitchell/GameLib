---
phase: quick-260925-oyr
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-260925-oyr]
files_modified:
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md
  - .planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md
  - .planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md
  - src/frontend/helpers/gamepad_layouts/nintendo.ts
  - src/frontend/helpers/__tests__/nintendoLayout.test.ts

must_haves:
  truths:
    - "`gsd-sdk query audit-uat` reports by_phase['38'] == 24 (was 25) and total_items == 49 (was 50). A FLAT count means the edit did not register or the array failed to parse."
    - "`38-C04b` is no longer in `human_verification`; it sits at the END of `human_verification_retired` with `retired: 2026-09-25`, `retired_by: \"quick 260925-oyr\"` and a `retired_reason` that says NOT a pass, NOT a discharge, nothing observed, and that this SUPERSEDES the 260925-nxt locked decision to keep it open."
    - "No stale controller count survives: zero hits for `EIGHT of the NINE`, `NINE controller items`, `nine surviving controller items` and `38-C04b is the exception` in 38-VERIFICATION.md and 38-HUMAN-UAT.md."
    - "`status:` is still exactly `human_needed`; nothing moved into `human_verification_discharged`."
    - "The todo lives in `completed/` (not `pending/`) with its frontmatter intact and a `## Resolution` section appended; every live pointer to the old `pending/` path is repointed."
    - "No executable source changed: the only `src/` diff lines are comment lines."
  artifacts:
    - path: ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md"
      provides: "38-C04b retired, count prose updated"
      contains: 'retired_by: "quick 260925-oyr"'
    - path: ".planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md"
      provides: "Closed todo with resolution"
      contains: "## Resolution"
  key_links:
    - from: "38-VERIFICATION.md human_verification"
      to: "gsd-sdk query audit-uat"
      via: "YAML array parsed by parseVerificationItems"
      pattern: "by_phase.*38.*24"
    - from: "34.1-VERIFICATION.md human_verification_relocated (gamepad receipt)"
      to: "38-VERIFICATION.md human_verification_retired 38-C04b"
      via: "relocation_rules (3) two-way receipt"
      pattern: "260925-oyr"
---

<objective>
Retire Phase 38 UAT item `38-C04b` (gamepad L3/R3 stick clicks) as an expectation that was never a
feature, and close the pending todo that recorded the gap.

Purpose: the 34.1 item-7 clause "Left/right stick clicks (the click-equivalents) activate the
element currently under focus or cursor" was a MISDESCRIPTION. A / `mainAction` already activates
the focused element; stick clicks were never a feature in this codebase. The operator decided
(2026-09-25, this session, LOCKED) to "Retire the expectation" rather than implement stick clicks
or leave it open. This REVERSES the earlier locked decision recorded by quick `260925-nxt`
(38-HUMAN-UAT.md ~line 131-136, STATE.md 260925-nxt row) to keep `38-C04b` in
`human_verification` so it stayed visible to `audit-uat`. The retirement text must say so
explicitly.

Output: 38-C04b moved to `human_verification_retired`; all controller counts corrected (nine ->
eight, eight-of-nine -> all eight); 34.1 receipt annotated; todo moved to `completed/` with a
resolution; two code COMMENTS repointed at the moved todo path. NO executable source change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/quick/260923-89z-retire-phase-38-electron-runtime-items/260923-89z-PLAN.md
@.planning/quick/260925-nxt-split-compound-uat-item-38-c01-and-resol/260925-nxt-SUMMARY.md

## Measured baseline (planner, HEAD cdf07ee95, 2026-09-25)

- `gsd-sdk query audit-uat` summary: `total_items: 50`, `by_phase['38']: 25`,
  `by_phase['34.13']: 7`.
- `grep -c '^  - id: "38-' 38-VERIFICATION.md` = 36 (25 in `human_verification`, 9 in
  `human_verification_retired`, 2 in `human_verification_discharged`). After this task: still 36
  in total, 24 / 10 / 2.
- Top-level keys of 38-VERIFICATION.md, in order: `phase` `verified` `status`(L4) `score`(L5)
  `audit_tool_note`(L6) `purpose`(L7) `deferral_note`(L8) `created` `relocation_rules`(L10)
  `human_verification:`(L12) `sweep_notes:`(L273) `human_verification_retired:`(L278)
  `human_verification_discharged:`(L390). The retired array's LAST entry is `38-S15`, ending with
  its `retired_reason:` line, then a blank line, then `human_verification_discharged:`.
- `38-C04b` entry: 38-VERIFICATION.md lines 125-134 (id, test, expected, why_human, blocked_by,
  platform_gate, origin_phase, origin_item, prior_state, not_a_deferral_cost), followed by a
  blank line and `  - id: "38-C05"`.

## Every live reference to 38-C04b / the stale counts (census; historical quick dirs excluded)

38-VERIFICATION.md:
- L5 `score:` — "25 relocated items OPEN ... 9 retired" plus the "(Was 23 until ..." history.
- L8 `deferral_note:` — "Three exceptions: 38-E01 and 38-E02 ... ; 38-C04b (new, this split)
  reads 'feature decision' ... see 38-C04b's own not_a_deferral_cost field."
- L125-134 the entry itself.
- L145 (38-C05 `scope_note`) — "THE SAME unmeasured surface as 38-C01a..38-C04b" and "38-C04b is
  not dischargeable in a controller sitting — see its own entry."
- L157 (38-C06 `scope_note`) — "EIGHT of the NINE surviving controller items ... (38-C04b is the
  exception, ...)".
- L169 (38-C08 `scope_note`) — same "EIGHT of the NINE ... (38-C04b is the exception: ...)".
- L276 `sweep_notes.windows_linux_dependency` — "The NINE controller items (... 38-C04b ...) ...
  of which EIGHT are dischargeable ... (38-C04b is the exception ...)".

38-HUMAN-UAT.md:
- L118-119 "Disposition of the nine surviving controller items, to be applied at the ledger
  (eight are dischargeable in one sitting; `38-C04b` is the exception):"
- L131-136 the `38-C04b` bullet ("OPEN as an unmet expectation, NOT scoreable and NOT retired ...
  deliberately kept in `human_verification` — per the user's locked decision ... See
  `.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`.").

34.1-VERIFICATION.md:
- L79 `moved_as: "38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C04b (SPLIT into six)"`
- L83 `split_reason:` ends "... `38-C04b` is open as an unmet expectation pending a feature
  decision."

Pointers to the todo's `pending/` path:
- src/frontend/helpers/gamepad_layouts/nintendo.ts:322 (comment inside `checkNintendo`)
- src/frontend/helpers/__tests__/nintendoLayout.test.ts:539 (comment in the "stick clicks (L3/R3)
  dispatch nothing" test)
- 38-VERIFICATION.md 38-C04b `prior_state` ("Standing source finding: .planning/todos/pending/...")
- 38-HUMAN-UAT.md L136 (rewritten in Task 2 anyway)

Deliberately LEFT AS-IS (frozen history, do not edit):
- `.planning/STATE.md` 260925-nxt / 260925-ms5 / 260925-9de rows (append-only history; the
  orchestrator adds this task's row).
- `.planning/todos/completed/2026-09-24-nonstandard-nintendo-pad-stick-clicks-and-guide-unmeasured.md`
  — names the sibling by bare filename only, no `pending/` path, so it is not dangling.
- Everything under `.planning/quick/`.
- The retired `38-C07` entry's "Same gate as 38-C01..C06" and any `sitting_1_2026_09_23` fields.
</context>

<hazards>
**H1 — `status:` MUST stay exactly `human_needed`.** `gaps_found` makes `parseVerificationItems`
emit zero items and the whole phase silently vanishes from `audit-uat`.

**H2 — MOVE, don't annotate.** `audit-uat` counts EVERY entry in `human_verification` regardless
of any field, so adding `retired:` in place changes nothing. The entry must leave the array.

**H3 — Retired is NOT discharged.** Do not put `38-C04b` in `human_verification_discharged` and do
not write "pass"/"result" language for it. Nothing was observed.

**H4 — The count gate is the parse check.** If `audit-uat` stays at 25/50 after the move, the edit
did not register or the YAML broke. Do not proceed; fix it. If 38 moves to 24 but `total_items`
does not move to 49, STOP and investigate — do not adjust the assertion to fit.

**H5 — YAML quoting.** Single-quoted scalars escape an apostrophe as `''`. Several fields being
edited (L145/L157/L169/L276, deferral_note) are single-quoted and already contain `''`. New
prose containing an apostrophe inside a single-quoted scalar must double it. Prefer double-quoted
scalars for NEW fields and avoid inner double quotes in them.

**H6 — No `expected: |` flattening, no new UAT `### N.` items.** This task edits prose and YAML
only; it adds no UAT-file items. Leave every existing `expected: |` block alone.

**H7 — Comment-only in `src/`.** `git diff -U0 -- src/` must show only `//` comment lines changed.
Do not add or remove any `checkAction` call; the test's two `toHaveLength(0)` assertions stay.
</hazards>

<tasks>

<task type="auto">
  <name>Task 1: Move 38-C04b into human_verification_retired and correct every count in 38-VERIFICATION.md</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md</files>
  <action>
First re-measure the baseline: run `gsd-sdk query audit-uat` and confirm `by_phase['38'] == 25`
and `total_items == 50` (record both numbers for the SUMMARY). If they differ, stop and report.

Then, following the 260923-89z retirement precedent exactly:

(a) CUT the whole `38-C04b` entry (lines 125-134 plus the blank line that follows it) out of
`human_verification`, and APPEND it at the end of `human_verification_retired` — after `38-S15`'s
`retired_reason:` line and before the blank line preceding `human_verification_discharged:`. Keep
the same two-space-list / four-space-field indentation. Keep every existing field verbatim
(id, test, expected, why_human, blocked_by, platform_gate, origin_phase, origin_item,
not_a_deferral_cost) EXCEPT `prior_state`, where only the path
`.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md` changes to
`.planning/todos/completed/...` (same filename). Then add three fields at the end of the entry,
matching the precedent's shape: `retired: 2026-09-25`, `retired_by: "quick 260925-oyr"`, and a
single-quoted `retired_reason:` stating, in this order: (1) the 34.1 item-7 stick-click clause was
a MISDESCRIPTION, not a deferred feature — A / `mainAction` already activates the focused element,
and stick clicks were never a feature in this codebase (the platform_gate census above is the
evidence: no layout dispatches `buttons[10]`/`buttons[11]` on any mapping); (2) it was NEVER RUN
and NO OBSERVATION IS CLAIMED — a retirement, NOT a pass and NOT a discharge, which is why it is
not in `human_verification_discharged`; (3) operator decision 2026-09-25 ("Retire the expectation",
chosen over "Implement stick clicks" and "Leave it open"), which EXPLICITLY SUPERSEDES the locked
decision recorded by quick `260925-nxt` to keep this item in `human_verification` so the unmet
expectation stayed visible to `audit-uat` — that visibility is given up deliberately because there
is no expectation left to keep visible; (4) its sibling `38-C04a` (B/back) is UNAFFECTED and
remains open and scoreable; (5) falsifiable re-open condition: if any layout ever gains a
`checkAction` on `buttons[10]`/`buttons[11]`, stick clicks become a real feature and need a NEW
item, not a revival of this one. Apostrophes inside this single-quoted scalar must be doubled (H5).

(b) `score:` (L5): change "25 relocated items OPEN" to "24 relocated items OPEN" and "9 retired"
to "10 retired". Insert, as the FIRST sentence inside the parenthetical history (immediately after
"(" and before "Was 23 until 2026-09-25"), a new entry in the established voice: "Was 25 until
2026-09-25, when quick `260925-oyr` RETIRED `38-C04b` (stick clicks) because its expectation was a
misdescription of a feature that never existed -- A/mainAction already activates the focused
element; this is NOT a discharge and NOT a pass, nothing was observed, and it supersedes
`260925-nxt`'s decision to keep the item open. Confirmed at the tool: `audit-uat` moved 25 -> 24
and 50 -> 49, which is the check that the array still parses -- a FLAT count after a removal would
mean the edit did not register or the array failed to parse." Use the ACTUAL measured after-values
in that sentence (they must be 24 and 49; see H4). `score:` is an unquoted plain scalar today —
keep it that way and do not introduce a `: ` (colon-space) or ` #` sequence into it.

(c) `deferral_note:` (L8): append (inside the single-quoted scalar, before its closing quote) a
sentence: "AMENDED AGAIN 2026-09-25 (quick `260925-oyr`): `38-C04b` was retired, so only TWO
exceptions remain in `human_verification` -- `38-E01` and `38-E02`. `38-C04b`''s `blocked_by` and
its `not_a_deferral_cost` field travel with it into `human_verification_retired`, unchanged."
Do not rewrite the earlier AMENDED sentence — it is history.

(d) 38-C05 `scope_note` (L145): change "38-C01a..38-C04b" to "38-C01a..38-C04a", and replace
"38-C04b is not dischargeable in a controller sitting — see its own entry." with "(`38-C04b`, stick
clicks, was retired on 2026-09-25 by quick `260925-oyr` -- see `human_verification_retired`.)"

(e) 38-C06 `scope_note` (L157) and 38-C08 `scope_note` (L169): replace "one controller discharges
EIGHT of the NINE surviving controller items in a single sitting (38-C04b is the exception, ...)"
(each note's own parenthetical wording, through its closing parenthesis) with "one controller
discharges ALL EIGHT surviving controller items in a single sitting (a ninth, `38-C04b`, was
retired on 2026-09-25 by quick `260925-oyr`)". Leave the rest of each note untouched.

(f) `sweep_notes.windows_linux_dependency` (L276): change "The NINE controller items (38-C01a,
38-C01b, 38-C02, 38-C03, 38-C04a, 38-C04b, 38-C05, 38-C06, 38-C08)" to "The EIGHT controller items
(38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C05, 38-C06, 38-C08)" and "of which EIGHT are
dischargeable in a single controller sitting (38-C04b is the exception, open as an unmet
expectation pending a feature decision)" to "all EIGHT dischargeable in a single controller
sitting (`38-C04b`, formerly the ninth, was retired on 2026-09-25 by quick `260925-oyr`)".

Do NOT touch `status:`, `audit_tool_note`, `relocation_rules`, the `human_verification_discharged`
array, or any other retired entry.

After editing, run `gsd-sdk query audit-uat` and confirm 38 == 24, total == 49 (H4).
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && F=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md && test "$(grep -c '^  - id: "38-' "$F")" = 36 && test "$(sed -n '/^human_verification:/,/^sweep_notes:/p' "$F" | grep -c '^  - id: "38-')" = 24 && test "$(sed -n '/^human_verification_retired:/,/^human_verification_discharged:/p' "$F" | grep -c '^  - id: "38-')" = 10 && sed -n '/^human_verification_retired:/,/^human_verification_discharged:/p' "$F" | grep -q '^  - id: "38-C04b"' && test "$(grep -c 'retired_by: "quick 260925-oyr"' "$F")" = 1 && grep -q '^status: human_needed$' "$F" && test "$(grep -c -e 'EIGHT of the NINE' -e 'NINE controller items' -e '38-C04b is the exception' -e 'todos/pending/2026-09-25-no-layout' "$F")" = 0 && gsd-sdk query audit-uat 2>/dev/null | python -c "import json,sys; d=json.load(sys.stdin); s=d['summary']; assert s['by_phase']['38']==24, s['by_phase']; assert s['total_items']==49, s['total_items']; p=[r for r in d['results'] if r['phase']=='38'][0]; bad=[i['name'] for i in p['items'] if 'stick clicks (L3/R3)' in i['name']]; assert not bad, bad; print('OK 38=24 total=49 no-C04b')" && npx prettier --check "$F" && pnpm planning-gates</automated>
  </verify>
  <done>38-C04b is the last entry of `human_verification_retired` with retired/retired_by/retired_reason (misdescription; not a pass/discharge; supersedes 260925-nxt); audit-uat reports 38=24, total=49 (baseline 25/50 recorded); no "EIGHT of the NINE"/"NINE controller items"/"38-C04b is the exception" survives; status still human_needed; prettier and planning-gates green. Commit: `docs(quick-260925-oyr): retire 38-C04b stick-click expectation from the Phase 38 ledger`.</done>
</task>

<task type="auto">
  <name>Task 2: Update 38-HUMAN-UAT.md disposition prose and the 34.1 relocation receipt</name>
  <files>.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md, .planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md</files>
  <action>
38-HUMAN-UAT.md:
- L118-119: change the lead-in to "Disposition of the eight surviving controller items, to be
  applied at the ledger (all eight are dischargeable in one sitting; a ninth, `38-C04b`, was
  retired on 2026-09-25 -- see below):". Re-wrap only as needed to keep the paragraph's existing
  ~100-column wrap.
- L131-136: REPLACE the `38-C04b` bullet with one that records the reversal explicitly, in the
  file's existing voice: `38-C04b` (stick clicks) — RETIRED 2026-09-25 by quick `260925-oyr`, NOT
  scored, NOT a pass, NOT a discharge; nothing was observed. The operator chose "Retire the
  expectation" over implementing stick clicks or leaving it open, because the 34.1 item-7 clause
  was a misdescription: A / `mainAction` already activates the focused element, and no layout ever
  dispatched `buttons[10]`/`buttons[11]` (L3/R3 were measured live at 10/11 by quick `260925-ms5`,
  but no feature exists to attach them to). State plainly that this SUPERSEDES the earlier locked
  decision (quick `260925-nxt`) to keep the item in `human_verification` so the unmet expectation
  stayed visible to `audit-uat` — it now lives in `human_verification_retired`, and `audit-uat`
  moved 25 -> 24. Point at `.planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`.
  Keep it a single `- ` bullet with two-space continuation indent, like its neighbours.
- Do NOT add any `### N.` UAT item and do NOT touch any `expected: |` block (H6).
- Grep the file for any other "nine" controller count or "C04b" mention and handle it the same way.

34.1-VERIFICATION.md (relocation rule 3 is two-way, as in the 89z precedent's receipt update):
- L79 `moved_as`: change to
  "38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C04b (SPLIT into six; 38-C04b RETIRED 2026-09-25 by quick 260925-oyr)".
  Keep all six IDs — the receipt records what the item was moved AS; the retirement is annotated,
  not erased.
- L83 `split_reason`: replace the trailing clause "`38-C04b` is open as an unmet expectation
  pending a feature decision." with "`38-C04b` was first kept open as an unmet expectation, then
  RETIRED 2026-09-25 (quick `260925-oyr`) as a misdescription -- A/mainAction already activates
  the focused element and stick clicks were never a feature; not a pass, nothing observed."
  This scalar is double-quoted: do not introduce unescaped double quotes.
- Confirm afterwards that `audit-uat`'s by_phase for 34.1 is unchanged (it is absent from the
  baseline summary, i.e. zero open items — it must stay absent).
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && U=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md && V=.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md && test "$(grep -c -i -e 'nine surviving controller' -e '38-C04b. is the exception' -e 'NOT retired' -e 'todos/pending/2026-09-25-no-layout' "$U")" = 0 && grep -q '260925-oyr' "$U" && grep -q 'todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md' "$U" && test "$(grep -c '260925-oyr' "$V")" -ge 2 && grep -q 'moved_as: "38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C04b (SPLIT into six; 38-C04b RETIRED' "$V" && gsd-sdk query audit-uat 2>/dev/null | python -c "import json,sys; s=json.load(sys.stdin)['summary']; assert s['by_phase']['38']==24 and s['total_items']==49, s; assert '34.1' not in s['by_phase'], s['by_phase']; print('OK')" && npx prettier --check "$U" "$V" && pnpm planning-gates</automated>
  </verify>
  <done>38-HUMAN-UAT.md says eight surviving controller items and records 38-C04b as RETIRED (superseding 260925-nxt's keep-open decision, not a pass) with the completed/ todo path; 34.1 receipt annotated on both moved_as and split_reason; audit-uat still 38=24/total=49 and 34.1 absent; prettier and planning-gates green. Commit: `docs(quick-260925-oyr): record 38-C04b retirement in 38-HUMAN-UAT and the 34.1 receipt`.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo into completed/ and repoint the two code comments</name>
  <files>.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md, .planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md, src/frontend/helpers/gamepad_layouts/nintendo.ts, src/frontend/helpers/__tests__/nintendoLayout.test.ts</files>
  <action>
Todo: `git mv .planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md
.planning/todos/completed/` (preserve history). Keep the frontmatter byte-for-byte intact (all
keys including severity/platform/ready). Do not rewrite the existing body — it is the record.
Append a `## Resolution` section at the end with: date 2026-09-25, `resolved_by: quick
260925-oyr`; disposition RETIRED, not implemented; the operator decision ("Retire the expectation"
chosen over "Implement stick clicks" and "Leave it open"); the reason (the 34.1 item-7 clause was
a misdescription — A / `mainAction` already activates the focused element, stick clicks were never
a feature); that `38-C04b` moved from `human_verification` to `human_verification_retired` in
38-VERIFICATION.md and `audit-uat` moved 25 -> 24 / 50 -> 49 (use the numbers actually measured
in Task 1); that this supersedes 260925-nxt's decision to keep the item open; that NO `src/`
executable code changed and the body's "Do NOT implement stick clicks" ruling stands; and that the
`nintendoLayout.test.ts` "dispatch nothing" test continues to pin the non-dispatch, so any future
stick-click wiring is a deliberate new feature with a new UAT item.

Comments (H7 — comment lines only, minimal):
- src/frontend/helpers/gamepad_layouts/nintendo.ts ~L316-329 (the "Stick clicks (L3/R3)" comment
  block at the end of `checkNintendo`): change the path
  `.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md` to
  `.planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`, and replace
  "and that measuring the index does not by itself make that dischargeable." with "and whose
  UAT expectation (38-C04b) was retired on 2026-09-25 as a misdescription (quick-260925-oyr)."
  Keep the final "do not add a `checkAction` call here without a separate, deliberate decision to
  implement stick clicks" sentence exactly as is.
- src/frontend/helpers/__tests__/nintendoLayout.test.ts ~L539: change `todos/pending/` to
  `todos/completed/` in the path. Nothing else in the file changes.
Let prettier decide wrapping (`npx prettier --write` on exactly these two files, then `--check`).
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && T=.planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md && test ! -e .planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md && test -f "$T" && grep -q '^## Resolution' "$T" && grep -q '^severity: medium$' "$T" && grep -q '^ready: code$' "$T" && grep -q '260925-oyr' "$T" && test "$(grep -rn 'todos/pending/2026-09-25-no-layout' src .planning --include=*.ts --include=*.md | grep -v '^.planning/quick/' | grep -v '^.planning/STATE.md' | wc -l)" = 0 && test "$(git diff -U0 -- src/ | grep '^[+-]' | grep -v '^[+-][+-]' | grep -v -E '^[+-][[:space:]]*//' | wc -l)" = 0 && npx prettier --check "$T" src/frontend/helpers/gamepad_layouts/nintendo.ts src/frontend/helpers/__tests__/nintendoLayout.test.ts && npx jest --projects src/frontend -- src/frontend/helpers/__tests__/nintendoLayout.test.ts && pnpm planning-gates && gsd-sdk query audit-uat 2>/dev/null | python -c "import json,sys; s=json.load(sys.stdin)['summary']; assert s['by_phase']['38']==24 and s['total_items']==49, s; print('OK final 38=24 total=49')"</automated>
  </verify>
  <done>Todo is in completed/ only, frontmatter intact, `## Resolution` appended naming 260925-oyr and the superseded decision; no live pointer to the pending/ path remains outside quick dirs and STATE history; the src/ diff is comment-only; nintendoLayout tests pass unchanged; prettier, planning-gates and the final audit-uat 24/49 check are green. Commit: `docs(quick-260925-oyr): close stick-click todo and repoint its code comments`. jest projects are path-keyed (`jest.config` lists `<rootDir>/src/frontend`), hence `--projects src/frontend`; the jest exit code is deliberately not piped through `tail` so a failure turns the gate red.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| planning YAML -> gsd-sdk audit-uat | Hand-edited YAML is parsed by an upstream tool; a parse break silently drops the whole phase |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-oyr-01 | Tampering | 38-VERIFICATION.md `human_verification` array | mitigate | audit-uat must move exactly 25->24 / 50->49 (flat = parse break or unregistered edit); `status: human_needed` asserted in every verify |
| T-oyr-02 | Repudiation | Retirement recorded as a pass | mitigate | retired_reason states NOT a pass / NOT a discharge / nothing observed; item placed in `human_verification_retired`, never `_discharged` |
| T-oyr-03 | Tampering | src/ comment edits | mitigate | verify asserts `git diff -U0 -- src/` contains only `//` lines; nintendoLayout jest file re-run |
| T-oyr-04 | Information disclosure | n/a | accept | docs-only change, no secrets, no binary runs, no profile access |
</threat_model>

<verification>
- `gsd-sdk query audit-uat`: by_phase['38'] 25 -> 24, total_items 50 -> 49, by_phase['34.13'] still 7, 34.1 still absent; no Phase 38 item name contains "stick clicks (L3/R3)".
- `grep -c '^  - id: "38-'` still 36 in 38-VERIFICATION.md (24 open / 10 retired / 2 discharged).
- `status: human_needed` unchanged.
- Zero hits for stale counts ("EIGHT of the NINE", "NINE controller items", "nine surviving controller", "38-C04b is the exception") in both Phase 38 files.
- `pnpm planning-gates` all pass; `npx prettier --check` clean over the exact written paths.
- `git diff -U0 -- src/` comment-only.
</verification>

<success_criteria>
38-C04b is retired (not discharged) with an explicit record that the operator's 2026-09-25 decision supersedes 260925-nxt's keep-open decision; every controller count reads eight; the 34.1 receipt and 38-HUMAN-UAT agree; the todo is closed in completed/ with a resolution; audit-uat moved by exactly one item.
</success_criteria>

<output>
Create `.planning/quick/260925-oyr-retire-38-c04b-stick-click-expectation/260925-oyr-SUMMARY.md` when done, recording the measured audit-uat before/after numbers.
</output>
