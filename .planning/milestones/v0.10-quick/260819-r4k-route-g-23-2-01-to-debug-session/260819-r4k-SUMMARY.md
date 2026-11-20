---
quick_id: 260819-r4k
slug: route-g-23-2-01-to-debug-session
status: complete
completed: 2026-08-19
files_modified:
  - .planning/phases/23.2-steam-depot-selection-required-vs-optional-depots-and-skip-a/23.2-HUMAN-UAT.md
  - .planning/debug/uninstall-game-vanishes.md
  - .planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md
source_files_touched: 0
tests_run: none (docs-only; no source implicated)
---

# Quick Task 260819-r4k — Summary

**`G-23.2-01` is routed, not resolved.** Phase 23.2's UAT ledger now reads
`open_gaps: []`; the library-vanish defect's sole live owner is
`.planning/debug/uninstall-game-vanishes.md`, which stays `parked` with root cause OPEN.

## What changed

**`23.2-HUMAN-UAT.md`**
- `open_gaps: [G-23.2-01]` → `open_gaps: []`, with an inline comment naming the
  destination and stating plainly that this is not a resolution.
- Gap entry `status: failed` → `status: routed`, plus `routed_out: 2026-08-19`,
  `routed_to:` (the debug file, its park state, and commit `6891551b0`) and `routed_why:`
  (not a declared item; different subsystem; `scope_note` already excluded it from item
  1's verdict).
- `notes:` gained a `(LATEST)` routing clause; the previous `(LATEST)` marker was demoted
  to `PRIOR:` so exactly one clause claims to be current.
- `new_gaps_found_outside_declared_items: 1` deliberately **not** decremented — annotated
  as a historical count of what the run found, not a live-gap counter.
- `debug_outcome_2026_08_19`'s line "Gap stays `failed`, not resolved" was amended in
  place; left as-is it would have contradicted the new status.

**`.planning/debug/uninstall-game-vanishes.md`**
- `also_tracked_as:` now records the route-out and that the 23.2 entry is a retained stub.
- New `sole_owner: true` key, and a new lead section above the re-park note stating that
  nothing about the defect changed and that no phase ledger will surface it any more.

**`23-UAT.md` (Phase 23, closed)**
- The forward pointer said the defect "is filed on 23.2-HUMAN-UAT.md" — after this task
  that leads to a stub. Amended to name the debug session as the live owner. Phase 23's
  own `open_gaps: []` and gate verdicts untouched.

## Verification

- All three files' frontmatter parses under `js-yaml`; `23.2-HUMAN-UAT.md` reports
  `open_gaps = []`, debug file still `status: parked`.
- The gap entry block in the Gaps section parses as YAML with all 19 keys intact —
  `triage_so_far`, `narrowed_2026_08_19`, `architecture_finding`, `census_trap_noted`,
  `still_unverified`, `debug_outcome_2026_08_19`, `recommended_next`, `artifacts` all
  retained verbatim.
- `grep -c "status: failed"` on `23.2-HUMAN-UAT.md` → `0`.
- One YAML trap caught during the work: the first `also_tracked_as:` edit put an unquoted
  `status: routed` inside a plain scalar, which is invalid YAML (`": "` in a plain
  scalar). Quoted and re-validated. Worth remembering — these ledgers are hand-edited
  prose inside frontmatter and nothing in the repo lints them.

## Accepted trade, recorded deliberately

`/gsd-audit-uat` keys on recognised status values; `routed` is not one, so this gap will
no longer appear in any cross-phase UAT sweep. That is the intent — but it makes
`.planning/debug/uninstall-game-vanishes.md` the **only** surface that can resurface it.
That file must stay `parked` (never archived, never closed) until a recurrence and a fix.
Stated in the plan, in the UAT `notes`, and in the debug file's own lead section so it
cannot be discovered by accident later.

## Not done (out of scope, still owed on 23.2)

Phase closure bookkeeping is untouched and is what now stands between 23.2 and done:

- `.planning/STATE.md` is `status: verifying` with a stale `stopped_at` reading "PHASE
  23.2 EXECUTED — NOT COMPLETE … VERIFICATION.md is status: human_needed at 8/9 — 3 items
  pending", contradicting the artifacts.
- No `phase.complete` verb was invoked; `ROADMAP.md` §23.2 has all four plans `[x]` but no
  phase-level completion marker, so the explorer will keep showing 23.2 as unfinished.

## Commit discipline note

The working tree carried a concurrent session's uncommitted edits (`.planning/STATE.md`
decisions row `260819-p2d`, `.planning/phases/34.13-.../34.13-UAT.md`, and an untracked
`260819-p2d-*` quick directory). Every commit here was made by explicit path, and the
STATE.md hunk for this task was staged on its own via `git apply --cached` on a filtered
diff so the concurrent row was not absorbed. No `git stash` at any point.
