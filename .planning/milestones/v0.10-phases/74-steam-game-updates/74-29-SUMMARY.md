---
phase: 74-steam-game-updates
plan: 29
subsystem: steam-updates-live-gate
tags: [gap-closure, uat, live-gate, CR-01, CR-02]
requires: [74-23, 74-24, 74-25, 74-26, 74-27, 74-28]
provides:
  - "74-UAT.md items 19-23 recorded (3 pass, 1 issue, 1 blocked); status complete, 23 items"
  - "five new gaps for the round-2 live findings"
affects: [.planning/phases/74-steam-game-updates/74-UAT.md]
key-files:
  modified:
    - .planning/phases/74-steam-game-updates/74-UAT.md
  created:
    - .planning/todos/pending/2026-11-13-installed-steam-games-hidden-when-signed-out.md
key-decisions:
  - "Item 23 recorded blocked, not pass: no unattended failure could be induced live (sign-out empties the library; a stripped InstalledDepots ACF still updates)"
  - "Item 22 fixture uses spike 069's real prior ADOM state (build 3512046 + its manifest GID); lowering buildid alone does not make Steam download (Steam checks InstalledDepots manifests)"
requirements-completed: []
completed: 2026-11-13
---

# Phase 74 Plan 29: Round-2 live gate Summary

Items 20, 21 and 22 pass: Esc on the launch prompt plays the current build, bridge deltas raise no `depotJobEvent` IPC errors, and a registered InstallApp update shows Updating throughout with no button flash. Item 19 is an issue: the CR-01 hand-off now starts Steam, but the poll reports `finished` at the stale build after 120 s. Item 23 is blocked: no unattended failure could be induced.

## Commits

- 5e7241be7 docs(74-29): append items 19-23 (Task 1, pre-flight)
- c8926725b docs(todo): installed Steam games hidden when signed out
- ca8a53b8d docs(74-29): record live gate items 19-23 and round-2 gaps

## Results

| Item | Result | Note |
|---|---|---|
| 19 CR-01 registered update, Steam closed | issue | hand-off works; false `finished (build 5820077)` at the 40-tick quiet end |
| 20 Esc on the launch prompt | pass | no beep, launched, nothing queued; Return also launches |
| 21 bridge delta IPC | pass | `status=completed acf=4`, zero IPC_INVALID_ARGS; hero showed "Applying update…" |
| 22 InstallApp update, no flash | pass | 21:09:55 → 21:09:58 finished (build 5820078); no flash on card or page |
| 23 CR-02 failing auto-update | blocked | one attempt recorded, no retry on later checks; failure path not inducible |

## New gaps (in 74-UAT.md)

- major: registered hand-off waits on ACF TargetBuildID instead of the PICS target (item 19)
- minor: delegate path never retries InstallApp once Steam is up (item 19)
- minor: stale card loses its badge after the game is played (item 20)
- major: installed Steam games hidden while signed out; sign-in runs no library-wide update check (item 23)
- minor: Settings showed auto-update off while the config held true (item 20)

## Deviations

- Pre-flight `pnpm test:ci` had 54 failures in 6 known suites, none from round 2 (see 74-UAT preamble and the moduleStateCensus hit on uncommitted humble work).
- Orchestrator fixes landed during execution: 9c4d23d1a (unused export), 542664e94 (no-useless-catch), 37e6325ae (Esc-monitor guard scoped to the login surface).
