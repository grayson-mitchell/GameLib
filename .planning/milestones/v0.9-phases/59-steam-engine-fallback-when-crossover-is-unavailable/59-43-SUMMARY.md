---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 43
subsystem: steam-engine
tags: [G25, re-uat, offline-at-play, uat]
requires: [59-40, 59-41, 59-42]
provides:
  - Re-UAT 4 (items 36-39) recorded in 59-UAT.md with live evidence
  - Gaps G26-G28 filed from item 38
key-files:
  modified:
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-UAT.md
key-decisions:
  - Item 38 supersedes item 34's expectation; item 34 left as recorded
metrics:
  tasks: 3
  files: 1
  completed: 2026-11-03
requirements-completed: [G25]
---

# Phase 59 Plan 43: Re-UAT 4 live re-test of G25 Summary

Live re-test of the offline-at-Play work (59-40..59-42): the early refusal and CM-logon skip are confirmed for the CrossOver-missing and DXVK-copy-gone paths; the CrossOver-healthy restore path exposed three new gaps (G26-G28).

## Commits

- 0aa475d02: Task 1, drop dead exports and one new lint warning from round 4
- ef1e20fb8: Task 1, re-UAT 4 items 36-39 added to 59-UAT.md
- 030198802: Task 3, results, G26-G28, restore paragraph, `status: complete`

Task 2 was the operator live session (no commit).

## Results

| Item | Verdict | Notes |
| ---- | ------- | ----- |
| 36 | pass | crossover-missing refused in 9 ms, source no-interface, no CM logon, no probe |
| 37 | pass | restore-needs-pin refused, source no-interface, no CM logon, no probe |
| 38 | issue | offline probe 12.4 s; concurrent second launch broke the DXVK restore |
| 39 | pass | no renderer-offline line in any window; recovery without restart; online path unchanged |

G25 code is closed live for `crossover-missing` and `restore-needs-pin`. The new gaps G26-G28 remain open.

## New gaps

- G26 (major): no per-appId in-flight guard over bridge launch pre-flight; a second launch switched the bottle while the first's probe ran, DXVK removal failed (code 1), marker left `dxvk:"failed"`. Recovered on the next online launch.
- G27 (minor): offline demo-status probe still about 12 s on the restore path (the old G22 latency).
- G28 (minor): three engine notices after the first confirmed dialog were dispatched but display=unconfirmed.
- Observation: macOS Keychain prompt on reconnect, likely from the sidecar rebuild; unconfirmed.

## Deviations from Plan

None in the plan's own work. The operator moved the pin and DXVK copy aside with go-ahead, and restored them; licence file and bottle list unchanged, CrossOver.app untouched.

## Self-Check: PASSED

59-UAT.md verify printed ok; commits 0aa475d02, ef1e20fb8, 030198802 exist.
