---
quick_id: 260821-ihs
slug: close-out-phase-36
description: "Close out Phase 36 — the bookkeeping its artifacts have already earned"
date: 2026-08-21
mode: quick
tasks: 3
---

# Quick Task 260821-ihs: Close out Phase 36

## Origin

The user asked for two things: (1) fix the two `meta/` test failures logged in
`36/deferred-items.md`, and (2) close out phase 36.

**(1) is already done and is NOT re-done here.** Both entries in `deferred-items.md`
are stale prose. Verified against the artifacts, not the note:

- `meta/i18nForkTouchedFiles.json` line 12 already carries
  `src/frontend/components/UI/Dialog/components/Dialog.tsx`, added at `c53a8d419`
  (`fix(meta): declare Dialog.tsx as i18n debt -- repair A-17 anti-rot`).
- `meta/i18nGateAllowlist.json` already records `expectedCount: 26` for
  `src/frontend/screens/Login/components/SteamLogin/index.tsx`, ratcheted at
  `5b7481b2e` (`fix(meta): ratchet SteamLogin D-18 allowlist count 27 -> 26`).
- Live run: `npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts`
  → **2 suites passed, 154 passed / 1 skipped**.

This is the [[blocker-records-rot-silently]] shape: a deferred-items note kept
describing a failure that two later commits had already fixed. The note is left in
place as the phase's historical record; this plan records the resolution instead of
editing history.

So this task is **docs-only**. No source file is touched.

## Scope boundary

**In scope:** `.planning/ROADMAP.md` §36, `.planning/REQUIREMENTS.md` REQ-36-02/-03,
`.planning/STATE.md` frontmatter + quick-task ledger.

**Explicitly NOT in scope:**
- Creating `36-VERIFICATION.md`. `/gsd-verify-work 36` never ran; the phase rests on
  36-03's operator gate. Recorded as owed, not manufactured.
- `36-VALIDATION.md` stays `status: draft` — deliberate, per the phase's own record.
- Code review / secure-phase artifacts for 36.
- The missing quick-task ledger rows for `260820-u29`, `260820-i18n-gate-scope-dialog`,
  `260820-ic0`, `260820-fyl` — a real gap, but a different task's.

## Hard constraints

- **NO `gsd-sdk state.*` / `roadmap.*` / `phase.complete` verb.** Every one of them
  corrupts STATE.md ([[gsd-sdk-state-writes-corrupt-state-md]]); `phase.complete`
  corrupted both files on 34.14. Hand-edit and whole-file-diff instead.
- **No `git stash`, ever** — twice now an executor's stash stranded a concurrent
  session's work ([[executor-git-stash-strands-concurrent-session]]).
- STATE.md's frontmatter is **not strict-YAML-parseable** at HEAD (an unescaped `"`
  pair inside the `stopped_at` scalar, pre-existing). Do not introduce a second one:
  the new `stopped_at` text must use backticks, never double quotes.
- The explorer's phase colour is parsed from `stopped_at`'s **first phase number**
  plus a strong completion marker ([[explorer-phase-colour-needs-a-strong-marker]]).
  `PHASE 36 COMPLETE — ✅` is required wording; prose alone is discarded.

---

## Task 1 — ROADMAP §36: tick the plan boxes, add the completion marker and Outcome

**files:** `.planning/ROADMAP.md`

**action:**
- Heading (line ~3635) gains the strong marker: `### Phase 36: … — ✅ COMPLETE 2026-08-21`
- The three `- [ ] 36-0N-PLAN.md` lines → `- [x]`
- Add an **Outcome** paragraph after the plan list recording the 10/10 live-gate
  verdict, what shipped, and the two routed cosmetic defects.

**verify:** `git diff --stat .planning/ROADMAP.md` shows one file; `git diff` shows
only the heading line, the three checkboxes, and the added Outcome block.

**done:** §36 reads as complete and the three plan boxes are ticked.

## Task 2 — REQUIREMENTS.md: discharge REQ-36-02 and REQ-36-03

**files:** `.planning/REQUIREMENTS.md`

**action:** Both boxes are currently `- [ ]`, each with trailing prose reading
"box stays unticked pending plan 36-03's live gate items …". That gate ran and
passed 10/10, so both tick, and the trailing prose is rewritten to name the
discharge (date + verdict) rather than the pending condition.

REQ-36-01, -04, -05 are already `- [x]` — untouched.

**verify:** `grep -c "^- \[x\] \*\*REQ-36-" .planning/REQUIREMENTS.md` returns 5.

**done:** All five REQ-36 requirements are ticked, with REQ-36-02/-03 naming the
live gate as their discharge.

## Task 3 — STATE.md: completion record, last_activity, quick-task row

**files:** `.planning/STATE.md`

**action:**
- `status: planned` → `status: ready_to_plan` (the 23.2 close-out precedent).
- `stopped_at:` rewritten as a genuine completion record opening
  `PHASE 36 COMPLETE — ✅ (2026-08-21 …)`, with the entire prior text retained
  verbatim after a `Prior: ` join. Must record: the 10/10 gate; that Task 4 DID
  execute (the phase was forbidden from closing without it); the T-34.4.2-39/-41
  basis change; the stale-deferred-items finding with both fixing commit hashes;
  and what is still owed.
- `last_activity:` (frontmatter) prepended with this close-out, prior value
  retained behind `Prior: `.
- Append the `260821-ihs` row to the **Quick Tasks Completed** table (4-column
  format: `# | Description | Date | Directory` — no Status column, this is not
  `--validate`).

**verify:** `git diff .planning/STATE.md` touches **exactly 4 lines**
(`status`, `stopped_at`, `last_activity`, + 1 added table row). Frontmatter must
contain no new `"` inside the `stopped_at` scalar.

**done:** STATE.md reports phase 36 complete and the explorer resolves 36 as green.

---

## Post-execution check (not a task — an assertion)

Replay the explorer parse over the real tree before and after, and diff **all**
phase statuses. Expect exactly one status to move (36 → complete). Any other
movement is a defect in this edit, not a bonus.

## must_haves

**truths:**
- Phase 36 reads COMPLETE in ROADMAP.md, REQUIREMENTS.md, and STATE.md, and those
  three agree with each other.
- No source file, and no file under `meta/`, is modified by this task.
- The two `deferred-items.md` entries are recorded as *already fixed by named
  commits*, not as fixed-by-this-task.
- Everything still owed on phase 36 (VERIFICATION, review, secure, draft
  VALIDATION) is stated in the completion record rather than quietly dropped.

**artifacts:**
- `.planning/quick/260821-ihs-close-out-phase-36/260821-ihs-SUMMARY.md`

**key_links:**
- `.planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/36-03-SUMMARY.md`
- `.planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/deferred-items.md`
