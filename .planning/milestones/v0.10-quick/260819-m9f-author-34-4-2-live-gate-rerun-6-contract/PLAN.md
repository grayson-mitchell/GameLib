---
quick_id: 260819-m9f
slug: author-34-4-2-live-gate-rerun-6-contract
date: 2026-08-19
phase_touched: 34.4.2
type: docs
autonomous: false
---

# Quick: author `34.4.2-LIVE-GATE-RERUN-6.md`, action two locked operator decisions

## Why this exists

Phase 34.4.2 is 0-for-8 on live gates across five gap cycles and 25 plans. Its blocker
(F-34.4.2-19) was diagnosed, fixed and live-confirmed on 2026-08-08, so the phase's own next step
is a gate run — but `34.4.2-LIVE-GATE-RERUN-5.md` is byte-frozen with `verdict: FAIL` and cannot be
re-run in place. A successor contract is required before any operator time is spent.

This task authors that successor and actions two decisions the operator locked on 2026-08-19.

## Locked operator decisions (input, not this task's to re-litigate)

**D-G4 — retire REQ-34.4.2-05 and REQ-34.4.2-04's autofill-glyph half.** The synthesized
right-click autofill poster was DELETED IN FULL by plan 34.4.2-13 under decision D-A on
2026-08-05, and that decision's own record already ordered "Retire REQ-34.4.2-04/05". The
retirement was never actioned; instead both requirements were re-pointed at each successive gate
contract, waiting for a live discharge of a mechanism that does not exist.

Verified at this authoring — all five autofill literals return `0` against
`src-tauri/src/main.rs`: `post_autofill_right_click`, `autofill glyph injected for`,
`autofill glyph injection SKIPPED`, `GAMELIB_AUTOFILL_GLYPH`, `autofill_glyph_script`. The absence
is held permanently by the mutation-proven `PHASE_34_4_2_REMOVED_AUTOFILL_SYMBOLS` guard in
`src/backend/__tests__/tauriShellSource.test.ts`.

Consequence: RERUN-5's sub-checks **3(b)** (transcript contains zero occurrences of three literals
whose emitters do not exist) and **3(c)** (a dedicated extra app launch proving an env var with no
reader does nothing) cannot fail against current source. Both are dropped. 3(c) is the sub-check
that never ran across eight consecutive gate attempts.

**D-G5 — inherit item 6(b) rather than re-measure it.** REQ-34.4.2-10 is already ticked and 6(b)
recorded the phase's first-ever measured live PASS in RERUN-4. Re-measuring it is what F-34.4.2-20
blocks (its required literal carries no window label). Inheriting it sidesteps F-34.4.2-20
entirely, which is downgraded from a blocking fix to a standing contract note. This relaxes D-G3
("every item re-measured, nothing inherited") for this final run only, and only for 6(b).

## Tasks

1. Author `.planning/phases/34.4.2-*/34.4.2-LIVE-GATE-RERUN-6.md` — five scored items (1, 2, 3(a),
   4, 6(a)) in ONE continuous launch, `verdict`/`run_date`/`items_passed` all null.
2. Amend `REQUIREMENTS.md`: retire REQ-34.4.2-05 and REQ-34.4.2-04's glyph half per D-G4; restate
   what each still owes.
3. Update `ROADMAP.md`'s Phase 34.4.2 status banner to supersede the stale "Next: `/gsd-debug`".
4. Log D-G4/D-G5 and the stale-line-number finding in `deferred-items.md`.

## Constraints

- **Author/runner separation (T-34.4.2-25) is binding.** This task authors the contract and is
  FORBIDDEN from running any item in it, starting any harness, launching `npm run tauri:dev`, or
  writing any value into `verdict`, `run_date` or `items_passed`. A separate operator session runs
  it and is the only writer of results.
- **All prior gate documents stay byte-unchanged** — `-LIVE-GATE.md`, `-RERUN.md`, `-RERUN-2.md`,
  `-RERUN-3.md`, `-RERUN-4.md`, `-RERUN-5.md`. Do not edit any of them in place.
- **No source changes.** `git diff --stat -- src src-tauri/src` must be empty at completion.
- **No requirement box is ticked by this task.** REQ-34.4.2-09 can only be discharged by a measured
  run. D-08's no-partial-pass rule is untouched.
- A concurrent session is executing Phase 23.2 in this repo. Touch nothing under
  `src/backend/storeManagers/steam/`, no 23.2 artifact, and do not stash.

## Must-haves

- Every literal and line number in the contract is re-resolved against current source at authoring
  time, not copied from RERUN-5 (whose `main.rs` citations are all stale by ~208 lines).
- The contract states the F-34.4.2-21 hold-time bound explicitly, since its own procedure is what
  trips `LOGIN_WATCH_TIMEOUT_MS`.
- Item 6(a) is identified as the only never-measured behaviour in the phase.
