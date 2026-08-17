---
quick: 260817-sw8
type: execute
subsystem: docs
tags: [steam-depot, install-watchdog, decompress-pool, evidence-recording]
requirements: [SW8-01, SW8-02]
key-files:
  modified:
    - .planning/todos/pending/2026-08-16-eight-minute-install-watchdog-makes-long-native-steam-instal.md
    - .planning/debug/humankind-depot-full-stall.md
decisions:
  - "Recorded the 2026-08-17 Age of Wonders: Planetfall (718850) live install as supporting evidence in both documents, explicitly stating it does NOT close either item because neither is pinned to that title — both remain pinned to a HUMANKIND (1124300) run."
metrics:
  duration: "~10 minutes"
  completed: 2026-08-17
---

# Quick Task 260817-sw8: Record Age of Wonders: Planetfall (718850) live evidence Summary

Appended live-hardware evidence from a 2026-08-17 Age of Wonders: Planetfall install to two
existing planning docs, in both cases stating plainly that the evidence is generically strong
but does not close either item because neither is pinned to that title.

## What Was Done

**Task 1 — 8-min-watchdog todo** (`.planning/todos/pending/2026-08-16-eight-minute-install-watchdog-makes-long-native-steam-instal.md`):
Appended a new `### Live evidence — 2026-08-17 (Age of Wonders: Planetfall)` subsection at the
end of `## Resolution`, immediately before the `## Solution (chosen: option 1)` heading. It
records the run's facts (1029s/17m09s total, two empty proof-by-absence greps for the watchdog
trip/abort log lines, clean `StateFlags="4"` / `SizeOnDisk="17151298416"` manifest, `inline=false`
on every chunk-stream-stats sample, the `avgDecodeMs` climb against flat `avgNetMs`, and the
~60s/GB rough throughput with its ~37min HUMANKIND extrapolation), states that Gate A's PROPERTY
is now demonstrated generically, and states explicitly that the todo stays in `pending/` because
`LIVE-GATE.md`'s Gate A and phase `23-10` Task 1 are both pinned to appId `1124300`.

**Task 2 — `humankind-depot-full-stall` debug session** (`.planning/debug/humankind-depot-full-stall.md`):
Inserted one new `- timestamp: 2026-08-17T20:51` Evidence entry as the first entry under
`## Evidence` (matching the file's newest-first convention), in the file's existing four-key
format (`checked`/`found`/`implication`). It names Age of Wonders: Planetfall (`718850`),
explicitly disclaims that it is HUMANKIND (`1124300`), records the same measured facts, and
frames the `inline=false` result as the first real end-to-end confirmation that the decode pool
now spawns (inverting this session's `inline=true` finding across all 5 HUMANKIND runs), ties
the `avgDecodeMs`/`avgNetMs` split to the still-open P/E-core hypothesis, and states the scope
limit that this entry does not satisfy `next_action`'s awaited HUMANKIND re-run or phase `23-10`
Task 1.

Both edits are pure appends — no existing line in either file was deleted or reworded.
Frontmatter in both files is byte-identical to before this task (verified via
`git diff --unified=0` returning zero deleted lines, and `status: awaiting_human_verify` /
`next_action:` unchanged in the debug session).

## Deviations from Plan

None — plan executed exactly as written. Both tasks are pure documentation appends; no source
code was touched.

## Verification

```
TASK1_OK
TASK2_OK
```

- `git diff --unified=0` across both files: `0` deleted lines (pure append confirmed).
- `git diff -- humankind-depot-full-stall.md | grep -c '^[+-]next_action:'` → `0` (unchanged).
- `grep -c '^status: awaiting_human_verify$'` on the debug session → `1` (unchanged).
- `.planning/todos/completed/` does not contain the watchdog todo → confirmed absent (todo stayed
  in `pending/`).
- Both files still contain `1124300` (todo: 5 occurrences, debug session: 4 occurrences), and the
  todo still contains `pending/`.
- `git status --porcelain -- src/` → `0` lines. No source files were touched by this task. (Note:
  the `src/backend/storeManagers/steam/**` files that showed as modified at session start were
  committed by a concurrent session under commit `6913442b1` during this task's execution — not
  touched, staged, or committed by this task.)

## Self-Check: PASSED

- FOUND: `.planning/todos/pending/2026-08-16-eight-minute-install-watchdog-makes-long-native-steam-instal.md`
- FOUND: `.planning/debug/humankind-depot-full-stall.md`
- Both files confirmed present and containing the expected new content via the verification greps
  above. No commits were made by this task (docs-only quick task — the orchestrator handles the
  docs commit in a later step per task constraints), so there are no commit hashes to verify.
