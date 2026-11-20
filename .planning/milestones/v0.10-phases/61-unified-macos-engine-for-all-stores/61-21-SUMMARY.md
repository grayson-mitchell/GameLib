---
phase: 61-unified-macos-engine-for-all-stores
plan: 21
subsystem: engine
tags: [launch-deadline, gameProcessWatch, wineserver, bottle-ledger]
requires: []
provides:
  - "C:\\ (drive_c) form in the non-Steam first-match matcher"
  - "non-Steam launch deadline as a no-kill notice"
affects: [61-25]
key-files:
  modified:
    - src/backend/engine/gameProcessWatch.ts
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/__tests__/gameProcessWatch.test.ts
    - src/backend/engine/__tests__/launchEngine.deadline.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
decisions:
  - "Deadline never kills: no wineserver -k, no game.stop, no endEngineLaunch; notice only"
  - "Watcher give-up cancels the deadline with monitor-unavailable"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 21: Deadline safety cluster Summary

The non-Steam launch deadline is now a notice that never kills, and drive_c installs match by their `C:\` command line.

Deadline branch: notice only (no kill); first-match forms unix, Z:, Y:, C: (drive_c)

## Tasks

1. `49ac72e61` - `deriveGameProcessPrefixes`/`watchForGameProcess` take optional `bottleDir`; adds the `C:\` form for installs under `<bottle>/drive_c/`. Header comment corrected.
2. `f11404752` - `onEngineLaunchDeadline` stops the watcher, logs and shows `notDetected` notice (ackId `launch-deadline-unconfirmed`); `killWineserver` dep removed; `onGiveUp` calls `cancelLaunchDeadline(key, 'monitor-unavailable')`; watcher receives `bottleDir: getBottleDir(bottleName)`.

Regression tests added: expiry no-kill with launch held, busy shared bottle neighbour (CR-03), give-up stands the deadline down (WR-01) and passes bottleDir, C:\ match / sibling non-match.

## Deviations from Plan

**1. [Rule 3 - Blocking] Presence baseline regenerated.** New `notDetected` keys produced 96 hard failures in `lint-translations:gamelib`; ran `LINT_TRANSLATIONS_WRITE_BASELINE=1` and committed `meta/i18nCatalogPresenceBaseline.json`.

**2. Test scope.** The "ledger no longer lists KEY after endEngineLaunch" check was dropped: the launch-to-bottle map is private and populated only by the real launch path, so a test-injected ledger entry cannot be released that way. The "ledger still lists KEY after expiry" and neighbour-survives checks are kept.

**3. `pnpm lint`** exits 1 on the repo-wide warning cap (1115 > 661), pre-existing; eslint on the four touched files shows 0 warnings/errors. `pnpm boundaries`, `i18n-churn-guard`, `smoke:sidecar` and the 490 engine tests pass.

No timers were added (smoke:sidecar passes). No stubs. Steam's `didntStart` path untouched.

## Self-Check: PASSED
