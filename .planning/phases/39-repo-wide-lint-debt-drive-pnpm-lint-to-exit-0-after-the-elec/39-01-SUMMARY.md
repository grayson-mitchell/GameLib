---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
plan: 01
subsystem: infra
tags: [planning-gates, ipc-inventory, python, ci, tauri-sidecar]

# Dependency graph
requires:
  - phase: 34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc
    provides: "preload-surface-gate.py and ported-channels-gate.py, plus the IPC-PORT-INVENTORY.md they both read"
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "the disposition vocabulary (RE-POINT/RE-DERIVE/INVERT/RETIRE) and its column-shape precedent (D-35-14-02)"
provides:
  - "preload-surface-gate.py's AUDITED_UNION_FLOOR re-derived from 217 (stale) to 206 (measured)"
  - "IPC-PORT-INVENTORY.md's bucket lines and Totals row reconciled against the live preload surface, with one deliberate one-channel exception documented"
  - "39-GATE-DISPOSITIONS.md recording the RE-DERIVE disposition, the masked check-5 defect fix, and the seam-parity gate's deferral to plan 39-08"
  - "meta/runPlanningGates.py confirmed at 6/7, with the sole remaining failure attributed to seam-parity-sweep-gate.py"
affects: [39-08, seam-parity-sweep-gate, ported-channels-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A census's stated number and its backing list must move together in one commit (RE-DERIVE), or a floor repair can unmask an unrelated masked defect and look like a new regression"
    - "Two independent gate scripts can pin the SAME inventory bucket line for orthogonal invariants (live preload exposure vs. sidecar porting history) — deleting a name that satisfies one gate can silently break the other"

key-files:
  created:
    - .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-GATE-DISPOSITIONS.md
  modified:
    - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py
    - .planning/IPC-PORT-INVENTORY.md

key-decisions:
  - "AUDITED_UNION_FLOOR re-derived to 206 (the live extractor's measured union), not merely lowered to make the gate pass — demonstrated via mutation control (floor=207 fails)"
  - "getEpicGamesStatus was restored to the Phase 34.5 bucket line after its deletion broke a previously-passing, unrelated gate (ported-channels-gate.py); this makes IPC-PORT-INVENTORY.md's Totals row (207) one higher than the live preload union (206) permanently and by design, not a residual defect to chase to zero"
  - "seam-parity-sweep-gate.py is deliberately left red and deferred to plan 39-08, because its EXPECTED_AXIS_A_SITES pin names 8 call sites that REQ-39-03 (later in this phase) deletes 7 of — repairing it now would only have it fail again the moment that deletion lands"

patterns-established:
  - "39-GATE-DISPOSITIONS.md is a growing table: later plans (39-08) APPEND a row rather than rewriting prose"

requirements-completed: []  # REQ-39-02 is NOT complete — it requires 7/7 and spans plans 39-01 AND 39-08 (see REQUIREMENTS.md); this plan delivers half (the preload-surface-gate.py disposition only)

# Metrics
duration: ~50min
completed: 2026-09-02
---

# Phase 39 Plan 01: Preload-Surface Gate RE-DERIVE Summary

**Re-derived `preload-surface-gate.py`'s stale 217-channel floor to the live-measured 206, fixed a masked 225-vs-224 Totals defect in the same commit, and recorded both dispositions — `meta/runPlanningGates.py` now reports 6/7 with only `seam-parity-sweep-gate.py` (deferred to plan 39-08) still red.**

## Performance

- **Started:** 2026-09-02T09:22:39+12:00 (approximate — continued across a context break; first commit of this plan's work landed at 09:42:14+12:00)
- **Completed:** 2026-09-02T09:57:10+12:00
- **Duration:** ~50 min (includes investigation of an unplanned regression, see Deviations)
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- `preload-surface-gate.py` exits 0; `AUDITED_UNION_FLOOR` now equals the live extractor's measured union (206), not a stale pre-Phase-35 figure.
- The masked `check_totals_reconciliation` defect (Totals stated 225 against 224 actual bucket-line names, hidden because `check_multiline_awareness` exited first on every prior run) is fixed and recorded, not merely un-hidden.
- Discovered and fixed an unplanned regression: deleting `getEpicGamesStatus` (one of the plan's 18 named stale channels) broke a second, independent, previously-passing gate — `34.5-.../ported-channels-gate.py` — which pins that same channel name for an orthogonal reason. Restored it without touching the second gate's own file.
- `39-GATE-DISPOSITIONS.md` created, recording the RE-DERIVE disposition, the `getEpicGamesStatus` exception, the masked-defect before/after numbers, and the seam-parity gate's deferral with its full `EXPECTED_AXIS_A_SITES` list.
- `meta/runPlanningGates.py` confirmed at exactly `6/7 planning gates passed.`, with exactly one `[FAIL]` line (`seam-parity-sweep-gate.py`) and zero `[FAIL]` lines naming either `preload-surface-gate.py` or `ported-channels-gate.py`.

## Task Commits

Each task was committed atomically. Task 1 required a follow-up correction commit (see Deviations) after an unplanned regression was discovered mid-execution:

1. **Task 1: Re-derive the floor and reconcile the inventory Totals row in one edit** - `c54cf96ef` (fix) — floor 217→206, 18 names deleted from bucket lines, Totals 225→206
2. **Task 1 (correction): Restore getEpicGamesStatus** - `d888ca1f8` (fix) — restored 1 of the 18 names after it broke an unrelated gate; Totals 206→207
3. **Task 2: Record the disposition and confirm 6/7** - `41f2cddd8` (docs) — created `39-GATE-DISPOSITIONS.md`, confirmed `meta/runPlanningGates.py` at 6/7

**Plan metadata:** this commit (SUMMARY.md, committed immediately after this file is written)

## Files Created/Modified

- `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py` - `AUDITED_UNION_FLOOR` 217→206; failure-message provenance text rewritten to match
- `.planning/IPC-PORT-INVENTORY.md` - 17 stale window-chrome/misc channel names deleted from bucket lines (an 18th, `getEpicGamesStatus`, deleted then restored); `## Totals` → `Unique channels` 225→206→207; two explanatory paragraphs added/revised documenting the re-derive and the one-channel exception
- `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-GATE-DISPOSITIONS.md` - new disposition record (138 lines)

## Verification Evidence

**Direct import-based probe** (per acceptance criteria), run against the FINAL state (after the `getEpicGamesStatus` correction):

```
invoke: 154 send: 52 union: 206
bucket_names: 207 totals: 207
union - bucket_names (expect empty, check_coverage): set()
bucket_names - union (expect {'getEpicGamesStatus'}): {'getEpicGamesStatus'}
```

This is a deliberate deviation from the plan's literal acceptance-criteria wording, which expected
all three of `len(parse_bucket_names(text))`, `parse_totals_unique(text)`, and `len(invoke|send)`
to equal 206 with both set differences empty. The live union and the floor DO equal 206, exactly as
specified. `bucket_names` and `Totals` equal 207, one higher, because `getEpicGamesStatus` was
restored after deleting it broke an unrelated, previously-passing gate (see Deviations below) —
`bucket_names - union` is therefore `{'getEpicGamesStatus'}`, not empty, by design.
`check_coverage`'s actual assertion (`union - bucket_names` empty — no live channel is
undocumented) still holds exactly as required.

**Provenance markers:**
```
$ grep -c '34.5-PRELOAD-SURFACE-AUDIT.md' .planning/IPC-PORT-INVENTORY.md   # 1+
$ grep -c 'F-34.5-G6-10' .planning/IPC-PORT-INVENTORY.md                    # 1+
```
Both present, both ≥1.

**Gate self-test:** `python3 preload-surface-gate.py --self-test` → `SELF-TEST OK: every assertion rejects its corresponding bad input.` (6/6 checks, 1:1 with `ASSERTION_COUNT`).

**Mutation controls**, both demonstrated red then reverted via `cp` from scratchpad backups (never `git checkout --`, per this repo's post-checkout-hook hazard):
- (a) `AUDITED_UNION_FLOOR = 207` → `GATE FAILED: extracted union has only 206 distinct channel(s), below the audited floor of 207` — reverted.
- (b) `| Unique channels | 205 |` → `GATE FAILED: '## Totals' states 205 unique channels, but the bucket lines contain 207 distinct names — these must reconcile exactly` — reverted.

Both controls were re-run (fresh backups taken) AFTER the `getEpicGamesStatus` correction, confirming the gate can still fail appropriately against the corrected 207-state document.

**Full suite:**
```
$ python3 meta/runPlanningGates.py
...
[PASS] .../34.2-.../currency-gate.py
[PASS] .../34.3-.../ported-channels-gate.py
[PASS] .../34.4-.../ported-channels-gate.py
[PASS] .../34.4.1-.../ported-channels-gate.py
[FAIL] .../34.4.1-.../seam-parity-sweep-gate.py
[PASS] .../34.5-.../ported-channels-gate.py
[PASS] .../34.5-.../preload-surface-gate.py

6/7 planning gates passed.
```

## Decisions Made

- **Restored `getEpicGamesStatus` rather than accepting a `5/7` regression.** The plan named this channel among the 18 to delete, based on the (correct, for `preload-surface-gate.py`'s purposes) measurement that it has zero live `src/preload/` exposure. But `ported-channels-gate.py` (Phase 34.5's own gate, a completely separate script with its own hardcoded declared-channel list) independently requires it to remain in the same bucket line, for an orthogonal invariant (was it ported to the sidecar, not is it preload-exposed today). Restoring it keeps both gates green and does not require touching `ported-channels-gate.py`, which is outside this plan's file scope. This is documented in depth in `39-GATE-DISPOSITIONS.md`'s "getEpicGamesStatus exception" section so a future reader does not mistake the 206-vs-207 split for an unreconciled defect.
- **Did not attempt to repair `seam-parity-sweep-gate.py`.** Per the plan's explicit instruction and its own `<why_the_other_gate_is_not_here>` reasoning: `EXPECTED_AXIS_A_SITES` pins 8 call sites that REQ-39-03 deletes 7 of, later in this same phase. Repairing it now would create a fresh-looking regression the moment that deletion lands. Deferred to plan 39-08 with full reasoning recorded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-inflicted] Fixed a bucket-line count regression caused by my own added prose**
- **Found during:** Task 1, immediately after the initial edit
- **Issue:** The explanatory paragraph I added to document the 18 deleted names listed them in backticks. Due to markdown line-wrapping, three physical lines each accumulated ≥5 backticked names, so `parse_bucket_names`'s `len(found) >= 5` threshold rule mistook them for NEW bucket lines — silently reintroducing the very 18 names just deleted (bucket-line count read 222, not 206).
- **Fix:** Rewrote the paragraph to list the 18 names in plain text without backticks, with in-doc commentary explaining why (`parse_bucket_names`'s ≥5-backtick-name rule could otherwise mistake the retrospective note for a bucket line).
- **Files modified:** `.planning/IPC-PORT-INVENTORY.md`
- **Verification:** Re-ran `parse_bucket_names` via a standalone script; count returned to 206 with the expected lines.
- **Committed in:** `c54cf96ef` (part of Task 1's commit — the regression was caught and fixed before that commit landed, so it never shipped)

**2. [Rule 1 - Bug] Restored `getEpicGamesStatus` after its deletion broke an unrelated, previously-passing gate**
- **Found during:** Task 2, when the first post-Task-1 run of `meta/runPlanningGates.py` returned `5/7` instead of the plan's expected `6/7`, with an unexpected second failure naming `34.5-.../ported-channels-gate.py`
- **Issue:** `ported-channels-gate.py` (a different script, not touched by this plan, with its own hardcoded declared-channel list) requires `getEpicGamesStatus` to remain in `IPC-PORT-INVENTORY.md`'s Phase 34.5 Slice 8 bucket line, to track sidecar-porting history — an invariant orthogonal to `preload-surface-gate.py`'s live-exposure union. Confirmed via source inspection (`runnerAuthFlowRegistration.ts:117` still registers the sidecar handler; zero frontend/preload callers) that the channel is real, ported code, just currently unreachable from the renderer — a different kind of gap than the other 17, fully-retired window-chrome names.
- **Fix:** Restored `getEpicGamesStatus` to the Phase 34.5 bucket line in `IPC-PORT-INVENTORY.md`; updated `## Totals` → `Unique channels` from 206 to 207 to match; rewrote the two explanatory paragraphs to state the exception explicitly rather than leaving two numbers that silently disagree. Did NOT modify `ported-channels-gate.py` (out of this plan's file scope) or `preload-surface-gate.py`'s floor (206 remains correct — it measures the live union, which genuinely excludes this channel).
- **Files modified:** `.planning/IPC-PORT-INVENTORY.md`
- **Verification:** `preload-surface-gate.py` re-run plain (exit 0) and `--self-test` (6/6); direct probe re-run confirming `bucket_names`=207, `totals`=207, `union`=206, `bucket_names - union` = `{'getEpicGamesStatus'}`; both mutation controls re-demonstrated red and reverted against the corrected file; `meta/runPlanningGates.py` re-run confirming return to `6/7` with the same single expected failure.
- **Committed in:** `d888ca1f8` (separate commit from Task 1's `c54cf96ef`, per the "never amend, always a new commit" policy — Task 1's original commit had already landed correctly for its own stated acceptance criteria before this second-order regression was discovered)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs directly caused by this plan's own edits, fixed inline before or via a follow-up commit)
**Impact on plan:** Both fixes were necessary to reach the plan's actual goal (6/7, only `seam-parity-sweep-gate.py` red). Deviation 2 means Task 1's literal acceptance-criteria numbers (206 uniformly) are not exactly what shipped — the final state is 206 for the live union/floor and 207 for the bucket-line/Totals count, a one-channel difference that is correct and permanent, not a residual defect. This is documented in `39-GATE-DISPOSITIONS.md` as the disposition record of note for any future reader who diffs the two numbers and wonders why they differ.

## Issues Encountered

None beyond the two deviations above, both resolved inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `meta/runPlanningGates.py` is at 6/7, matching this plan's stated goal exactly (not 7/7 — deliberately).
- `seam-parity-sweep-gate.py` remains red, with its full disposition reasoning (including all 8 `EXPECTED_AXIS_A_SITES` call sites and which 7 REQ-39-03 removes) recorded in `39-GATE-DISPOSITIONS.md`, ready for plan `39-08` to append its own disposition row after the dead-seam collapse lands.
- `ported-channels-gate.py` for Phase 34.5 remains green and untouched — a future reader repairing `seam-parity-sweep-gate.py` or working on REQ-39-03 should be aware `getEpicGamesStatus` is intentionally still pinned in `IPC-PORT-INVENTORY.md`'s Phase 34.5 bucket for that gate's sake, independent of live preload exposure.
- **REQ-39-02 is NOT marked complete in `.planning/REQUIREMENTS.md`.** Its stated acceptance criteria require `python3 meta/runPlanningGates.py` to print `7/7 planning gates passed.`, and REQUIREMENTS.md itself explicitly assigns this requirement to "Plans `39-01` and `39-08`" together. This plan delivers exactly one of the two dispositions the requirement names (`34.5/preload-surface-gate.py`, RE-DERIVE); `34.4.1/seam-parity-sweep-gate.py`'s disposition is plan `39-08`'s to deliver. The checkbox should be marked only after `39-08` lands and the suite reports `7/7`.

---
*Phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec*
*Completed: 2026-09-02*

## Self-Check: PASSED

All claimed files exist on disk and all claimed commit hashes exist in `git log --oneline --all`:

- FOUND: `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py`
- FOUND: `.planning/IPC-PORT-INVENTORY.md`
- FOUND: `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-GATE-DISPOSITIONS.md`
- FOUND: `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-01-SUMMARY.md`
- FOUND: `c54cf96ef`, `d888ca1f8`, `41f2cddd8`, `417b17631`
