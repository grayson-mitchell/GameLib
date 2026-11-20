---
phase: 74-steam-game-updates
plan: 33
subsystem: steam-updates
tags: [steam, uat, live-gate, gap-closure]
requires: [74-30, 74-31, 74-32]
provides:
  - live results for 74-UAT.md items 24-28
affects: [steam update hand-off, signed-out Steam library, unattended bridge auto-update]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .planning/phases/74-steam-game-updates/74-UAT.md
key-decisions:
  - "Route B of item 28 not run: it exercises the same unattended path, which is not being entered at all"
requirements-completed: []
duration: 35min
completed: 2026-11-14
---

# Phase 74 Plan 33: Live gate for gap-closure round 3 Summary

Items 24-28 ran on real hardware (Mac Steam, ADOM 333300 registered, Hell Clock 1782460 bridge). Three
pass, two are issues recorded as new Gaps. UAT totals: 28 items, 19 pass, 6 issue, 2 skipped, 1 blocked.

## Results

| Item | Result | Proves |
| ---- | ------ | ------ |
| 24 UAT 19 re-run, InstallApp off | pass | 74-30 Task 1: the Steam-closed hand-off waits on the PICS target (5820078), ends quietly at 40 ticks, never logs `finished (build 3512046)`; badge kept |
| 25 InstallApp retry after Steam start | **issue** | 74-30 Task 2 does not work live: Steam flags the update as required (StateFlags 6) on start, `sawPending` is set, and `retryInstallApp` returns early forever |
| 26 Signed out: installed games, launch, update check | pass | 74-31 + 74-32: cache restore on the non-sync exit, `update check apps=44 stale=3`, Hell Clock badge, both launches reach their menus |
| 27 Sign-in runs an update check | pass | 74-32: `origin=steam-login` refresh → `library sync complete` → `update check apps=44` with no relaunch |
| 28 Failing unattended auto-update does not loop | **issue** | No unattended attempt is made at all, signed out or signed in (regression vs item 23 on 2026-11-13); no-loop property unverified. Manual signed-in Update completes (`status=completed acf=4`) |

## Task Commits

1. **Task 1: Pre-flight and append items 24-28** — `13ae96b86`
2. **Task 2: Operator runs items 24-28** — recorded in 74-UAT.md (this plan's metadata commit)

## Deviations from Plan

- ACF restages for items 24/25/26 were applied by Claude (with Steam quit, verified by `pgrep -x steam_osx`, originals backed up to the session scratchpad) rather than by the operator; the plan allows Claude to prepare the values.
- Item 28 route B skipped (see key decision).

## Environment restored

ADOM at buildid 5820078 (Steam applied the pending update on launch in item 26); Hell Clock at 26431636 (manual update in item 28); `autoUpdateGames` back to false; signed in to Steam in GameLib; InstallApp opt-in left ON (was set ON for item 25).

## Side observations (not gaps)

- Hell Clock exit logged `[bridge-notice] appId=1782460 reason=overlay-exit-abnormal` (item 26).
- `pnpm test:ci` pre-flight: 56 pre-existing failures across 8 suites (shimGenerate/shimCoverage steam_api.def drift, catalog parity, etc.); none introduced by round 3.

## Next

Gap-closure round 4 for the two new Gaps (items 25 and 28): `/gsd-plan-phase 74 --gaps`.
