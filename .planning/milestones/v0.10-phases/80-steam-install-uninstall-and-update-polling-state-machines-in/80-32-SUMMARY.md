---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 32
subsystem: steam-polls
tags: [steam, rust, gate, docs]
requires: [80-31]
provides: [steamPollsPortComplete delete-gate pin, Phase 80 docs, WazHack todo closed]
affects: [80-33]
key-files:
  created:
    - src/backend/__tests__/steamPollsPortComplete.test.ts
  modified:
    - src-tauri/crates/README.md
    - src/backend/process/README.md
    - .planning/research/STEAM-STACK.md
    - .planning/todos/completed/2026-11-14-macos-wazhack-single-playing-done-check.md
completed: 2026-11-16
---

# Phase 80 Plan 32: Port-complete pin and docs

The deletion of the TS Steam polls is pinned by a 21-case test, and the docs and the folded WazHack todo are updated.

## Commits

- 4ab67856d: steamPollsPortComplete.test.ts (11 DELETED files, 7 FORBIDDEN identifiers, a reg-query-of-RunningAppID regex, 6 KEPT paths, scan-can-fail case, 500-file floor)
- docs commit (see git log, "docs(80-32)"): crates README, process README, STEAM-STACK.md "Amended by Phase 80", todo moved to completed with resolution (80-HUMAN-UAT item 4a passed)

## Deviations from Plan

- [Rule 2] Also updated the `steam-running-poll` mention in `src/backend/process/README.md` (80-31 carry-forward).
- Regex had to allow `[` between `'reg'` and `'query'` to match a spawn argv array; caught by the scan-can-fail case.

## Verification

jest on the pin 21/21, eslint and prettier clean, planning-gates 12/12. Pre-existing comment mentions of MAX_TICKS (refresh.ts, installRoot.ts) are comments, stripped by the scan.

## Carry-forwards for 80-33

- Live smoke is operator-run (`pnpm build:sidecar`, then `pnpm tauri:dev`).
- STEAM-STACK.md's Phase 80 note is appended at the file end after the 2026-11-14 note.

## Self-Check: PASSED
