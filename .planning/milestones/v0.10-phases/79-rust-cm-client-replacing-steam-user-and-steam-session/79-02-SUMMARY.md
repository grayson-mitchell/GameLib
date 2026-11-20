---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 02
subsystem: steam
tags: [steam, mac-steam, wrap, retest, friends, cm-logon]
requires: []
provides:
  - "79-WRAP-RETEST.md with a single verdict line: PASS"
affects: [79-12, 79-13]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-WRAP-RETEST.md
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-02-SUMMARY.md
  modified: []
key-decisions:
  - "Unwrapped authenticated Refresh did not sign Mac Steam's Friends out (verdict PASS); the wrap is not needed for this arm"
requirements-completed: [D-09, D-10]
duration: operator-run live window about 9 min
completed: 2026-11-15
---

# Phase 79 Plan 02: Unwrapped Refresh Retest Summary

An unwrapped authenticated Refresh (`mode=authenticated reason=user-refresh wrap=not-darwin`) against a freshly started Mac Steam left Friends signed in for at least 90 s, so the verdict is `verdict: PASS`.

## What was done

- Task 1 (commit 4a4b0c6de): wrote the retest contract, 79-WRAP-RETEST.md.
- Task 2 (live run, operator and orchestrator, 2026-11-15 07:19 to 07:28 NZDT): wrap bypassed by a hand-made edit in `wrappedConnectNow` (never committed), sidecar rebuilt, Mac Steam relaunched fresh, Refresh pressed. The log line `CM logon mode=authenticated reason=user-refresh wrap=not-darwin` appeared, there were 0 `gooffline` occurrences, and connection_log showed no LogOff after the fresh logon. The operator reported "Stayed signed in". The bypass was reverted and `git diff --quiet HEAD -- user.ts` exits 0. Results were recorded in 79-WRAP-RETEST.md.

## Consequence

Plans 79-12 and 79-13 branch on `grep '^verdict:'` in 79-WRAP-RETEST.md, which reads PASS. The CM-fallback Refresh arm in Rust is still retested in UAT-B (79-37, run by 79-38).

## Deviations from Plan

- `arm-b-nowrap.patch` no longer applied; the plan's documented hand-edit fallback was used.
- `pnpm tauri:dev` found port 5173 already served by a vite from the same repo, so the shell ran against that dev server. The sidecar was freshly built, so the backend under test was the bypassed one. Harmless.

## Known Stubs

None.

## Self-Check: PASSED
