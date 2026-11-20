---
phase: 61-unified-macos-engine-for-all-stores
plan: 01
subsystem: macos-engine
tags: [spike, crossover, launch-deadline, ps, bottle-name]
requires: []
provides:
  - "Spike 068 verdict.json: non-Steam first-match signal (z-path) and bottle-name cap (120)"
affects: [61-07, 61-16]
key-files:
  created:
    - .planning/spikes/068-nonsteam-first-match-signal/verdict.json
    - .planning/spikes/068-nonsteam-first-match-signal/README.md
    - .planning/spikes/068-nonsteam-first-match-signal/run.sh
    - .planning/spikes/068-nonsteam-first-match-signal/sleeper.c
    - .planning/spikes/068-nonsteam-first-match-signal/build.sh
  modified:
    - .planning/spikes/MANIFEST.md
key-decisions:
  - "Arm the non-Steam launch deadline in 61-16 using matchShape z-path"
  - "Cap per-game bottle name at 120 characters in 61-07"
requirements-completed: [D-18, D-01]
duration: n/a
completed: 2026-11-07
---

# Phase 61 Plan 01: Spike 068 non-Steam first-match signal Summary

Spike 068 verdict PARTIAL with matchShape `z-path`: match a launched non-Steam game by its install dir (case-insensitive, trailing separator kept) in the unix, `Z:` and (home installs) `Y:` forms; bottle names up to 120 chars are accepted.

Deadline branch: armed

Non-Steam launch deadline: WILL be armed (matchShape z-path)

## User acknowledgement

At the blocking checkpoint the user replied "approved". They were told the live evidence was GPTK wine64, not CrossOver, and that CrossOver rests on the synthetic shapes S1-S3. They did not ask for a CrossOver re-run.

## Caveats

- The live launch (GOG Bloody Hell) used the GPTK engine; CrossOver's real gogdl exec shape is unconfirmed and relies on synthetic S1-S3.
- S4 (cwd + bare basename launches) is unmatchable; the deadline cannot see such launches.
- Bottle names were tested only to 120 chars with no rejection; the true cap is not measured.

## Tasks

1. Harness and automated probes - d13f0dc35
2. Live launch capture (operator) - recorded in spike logs
3. Verdict, README, MANIFEST row, checkpoint - 95a57d632

## Deviations from Plan

None - plan executed as written.

## Self-Check: PASSED
