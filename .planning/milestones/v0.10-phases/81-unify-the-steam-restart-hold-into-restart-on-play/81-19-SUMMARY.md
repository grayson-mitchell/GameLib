---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 19
subsystem: steam-adoption-live-gate
status: complete
tags: [steam, live-gate, uat, reachability-review, restart-on-play]
requires: [81-18]
provides:
  - 81-HUMAN-UAT.md, the Phase 81 live-gate contract (12 items, preconditions, dual-sink capture, run order)
  - the Structural Reachability Review of that contract (38 rows, 0 IMPOSSIBLE)
affects: [81-20]
tech-stack:
  added: []
  patterns: [dual-sink evidence capture, run order derived from a state-mutator x evidence pairing pass]
key-files:
  created:
    - .planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-HUMAN-UAT.md
  modified: []
decisions:
  - "Items 1-9 and 12 run on the Mac, item 10 on Windows 11 and item 11 on Linux, so 81-20's item numbers (1-9 Mac, 10 Windows, 11 Linux) hold; the known 1026-edge gap is item 12"
  - "Mac run order is 1, 2, 5, 6, 8, 4, 3, 9, 7, 12: any Steam restart or sign-in adopts every pending ACF, so the unadopted-state items (5, 6, 8) run before item 4, and item 3 takes its same-pid reading after item 4"
  - "Item 6 removes C's key from the pending store before the relaunch so the boot migration is the only source of the record, and a hand-written record needs the live Steam pid and its ps lstart token or the drain drops it"
  - "The 1026-edge Restart Steam now failure is recorded as item 12 and left pending so the operator sees it fail; it is not fixed (deferred-items.md, for the verifier)"
metrics:
  tasks: 2
  files: 1
  completed: 2026-11-18
commits: 2
plan_head_before: 8f097d3797aabf5291f88c194c07f01712a59cd3
plan_head_after: 46b2cfa36d4388042e207aaf689984a128e424f9
actuals:
  tokens: 10200
  tasks: 2
---

# Phase 81 Plan 19: The live-gate contract Summary

A parseable, reachability-reviewed live-gate contract for the unified restart-on-Play phase exists as `81-HUMAN-UAT.md`, covering the CONTEXT minimum, the Windows 11 and Linux arms and every live-gate item earlier waves owed.

## What was built

- **Task 1 (tracer, commit 501647182).** `81-HUMAN-UAT.md` with frontmatter, Preconditions, the dual-sink Capture standard (session dir, `tee -a`, the `=== GATE LAUNCH ${N} — <UTC> ===` delimiter, per-launch `gamelib.log` archive, the one-instance assertion, closing inventory), the Mac run order and 12 items in the house `### N.` shape, each with an inline `expected:`, `result: pending`, a launch-ordinal field, the platform and the scored evidence (UI observation or a log literal cited by file:line and sink). `audit-uat --raw` parses it with 12 items and no parse gap.
- **Task 2 (commit 46b2cfa36).** The Structural Reachability Review: a 38-row table (REACHABLE or CONDITIONAL, none IMPOSSIBLE), the Test 5 pairing pass (8 state-mutating requirements x 7 evidence-bearing ones, 11 flagged, each resolved in the contract), Test 6 external-state premises per item, Test 7 gesture traces to the shipped components, and the Test 4 absence kinds.

## Coverage of the owed live-gate items

| Owed by | Where covered |
|---|---|
| 81-04 helper in three states (`loggedOn 1` with a state, `loggedOn 0`, `unavailable`/`steam-not-running`; `GetAppInstallState` slot via `gl_ia_find_method_slot`) | item 1 |
| 81-08 `steam://open/main` relaunch on all three OSes, no game started | items 4, 10, 11 |
| 81-08 note readable in midnightMirage, gruvbox_dark, dracula | item 8 |
| 81-09 appId 112100: sign-in clears the note, same Steam pid | item 3 |
| 81-05 Windows/Linux adoption evidence (content_log `Loaded N apps`, Linux libraryfolders `apps` map, Windows `ActiveUser`, Linux connection_log) | items 10, 11 |
| RESEARCH: a real Linux game after the relaunch | item 11 |
| 81-07 refused restart notice, "Launch without Steam" once, per-game setting unchanged | item 5 |
| 81-13 migration of a valid hold record; ACF-gone record dropped; file deleted | item 6 |
| Known gap: Restart Steam now at the 1026 waiting edge does nothing | item 12 (expected to fail today) |

## Deviations from Plan

### Auto-fixed Issues

None for code; the plan wrote only the contract.

### Deviation in scope

**1. [Rule 2 - Missing coverage] Extra item for the known gap.** The plan listed 11 items; the dispatch added the 1026-edge gap and several owed items, so the file has 12. Items 1-11 keep the numbering 81-20 uses (item 10 Windows, item 11 Linux); the gap is item 12 so nothing in 81-20 shifts. **Commits:** 501647182.

**2. [Observed fact, not fixed] The contract names two runtime constraints the plan did not.** A migrated hold record is dropped unless its recorded pid and `ps lstart` token match the live Steam (the drain's `SteamExited`/`PidReused` rule), and a record is only written when the install is not already adopted. So item 6 requires Steam unchanged from C's install to the relaunch and C's pending key removed first. This is recorded in the item, not changed in code.

## Authentication gates

None.

## Known Stubs

None. The contract's `result: pending` lines are the intended state until 81-20 runs it.

## Threat Flags

None. T-81-44 (captures stay in `/tmp` session dirs, only appIds and cited literals quoted, no SteamID, user path or account name) and T-81-45 (the hold-file JSON shape and its cleanup are given in item 6) are mitigated in the file.

## Deferred / owed

- The 1026-edge no-op is logged in `deferred-items.md` and carried as item 12.
- Nothing was run: standing rule D-E, 81-20 runs the contract on the operator's Mac, Windows 11 and Linux machines.

## Self-Check: PASSED

- FOUND: `.planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-HUMAN-UAT.md`
- FOUND commits 501647182 and 46b2cfa36 (ancestors of HEAD).
- `audit-uat` parse: 12 items, no parse gap; review has 38 REACHABLE/CONDITIONAL rows and 0 IMPOSSIBLE.
