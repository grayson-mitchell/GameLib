---
phase: 74-steam-game-updates
plan: 36
subsystem: steam-updates
tags: [steam, uat, live-gate, gap-closure]
requires: [74-34, 74-35]
provides:
  - live results for 74-UAT.md items 29-30
affects: [steam update hand-off, unattended bridge auto-update]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .planning/phases/74-steam-game-updates/74-UAT.md
key-decisions:
  - "Route B of item 30 not run: route A produced the unattended not-started failure it needs"
  - "No cargo run: 74-34/35 changed no Rust"
requirements-completed: []
duration: 25min
completed: 2026-11-14
---

# Phase 74 Plan 36: Live gate for gap-closure round 4 Summary

Items 29-30 ran on real hardware (Mac Steam, ADOM 333300 registered, Hell Clock 1782460 bridge). Both
pass. UAT totals: 30 items, 21 pass, 6 issue, 2 skipped, 1 blocked. No new Gaps entries; the item 25
and item 28 Gaps entries stay as history.

## Results

| Item | Result | Proves |
| ---- | ------ | ------ |
| 29 UAT 25 re-run, InstallApp on, Steam closed | pass | 74-34: `retry after Steam start` at 16:22:11, 9 s after the click, with no click in Steam; `finished (build 5820078)` at 16:22:14; badge cleared; no `finished (build 3512046)`, no 40-tick give-up |
| 30 UAT 28 re-run, autoUpdateGames confirmed on | pass | 74-35 lines make the run self-explaining: `auto-update candidates=1`, one `attempt recorded`, `unattended=true update not started: Steam sign-in unavailable (not-signed-in)`, no prompts; three later checks each `already attempted this session` + `candidates=0`; signed-in manual Update `status=completed acf=4` |

## Pre-flight (Task 1)

| Command | Exit | Notes |
| --- | --- | --- |
| `pnpm exec tsc --noEmit` | 2 | 4 errors, none in 74-34/35 files: downloadqueue.ts (2), macArch/recovery.ts (1), legendaryRuntime.test.ts (1), all from the concurrent phase-70 retyping |
| `pnpm lint` | 0 | |
| `pnpm check:ipc-contract` | 0 | |
| `pnpm find-deadcode` | 0 | |
| `pnpm steam-line-ceiling` | 0 | |
| `pnpm planning-gates` | 0 | |
| `pnpm smoke:sidecar` | 0 | |
| `pnpm build:sidecar` | 0 | sidecar.js 16:17:54, newer than the newest src/backend change |
| `pnpm test:ci` | 1 | 9 suites / 63 tests failed, none in 74-34/35 files: known list (tauriShellSource, epicOfflineMode, gamelibCatalogParity, genI18nGateScope, lintTranslations, x86CallbackWineHarness), shimCoverage + shimGenerate (generated steam_api.def), libraryState.test.ts (uncommitted phase-70 WIP in libraryState.ts) |

## Task Commits

- Task 1: `42ccd8779` — items 29-30 appended to 74-UAT.md
- Task 2: results recorded with this SUMMARY

## Deviations from Plan

- The orchestrator recorded the operator's results directly instead of spawning a continuation agent.
- ACF restages were done by the orchestrator with Steam (item 29) and GameLib (item 30) quit; backups were
  taken first. Both games ended at their current builds (ADOM 5820078, Hell Clock 26431636) through their
  own update paths.

## Self-Check: PASSED
