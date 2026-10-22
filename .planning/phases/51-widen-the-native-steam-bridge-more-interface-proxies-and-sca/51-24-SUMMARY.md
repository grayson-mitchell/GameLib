---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 24
subsystem: steam-bottle
tags: [gap-closure, D-51-16, waiting-for-steam, bottle-logs]
requires: []
provides:
  - bottledSteamLogPaths returns a login path (steamui_login.txt)
  - classifyBottledSteamBlock names login from the latest SetLoginState and self-update from Downloading update lines
key-files:
  modified:
    - src/backend/storeManagers/steam/bottleLaunchSignals.ts
    - src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
key-decisions:
  - "Verification lines (Verifying installation / Verification complete) never count as self-update: they are logged on every start (22:21:25, no update), so counting them would mislabel every launch. The todo suggested the opposite; the measurement overrides it."
  - "Login-state rule has no timestamp cutoff: the classifier only runs after the grace window with no game process, so the CURRENT latest SetLoginState is what matters."
requirements-completed: [D-51-16]
completed: 2026-10-22
---

# Phase 51 Plan 24: Waiting-for-Steam login and update-download causes Summary

"Waiting for Steam..." now names cause=login when bottled Steam sits at its sign-in screen (latest `SetLoginState:` in steamui_login.txt is `WaitingForCredentials`) and cause=self-update during the `Downloading update` phase, while a normal start stays unclassified.

## Tasks

1. Classifier (121269ff6): `bottledSteamLogPaths` adds `login`; CRLF stripped per line; self-update also matches `Downloading update`; login also matches latest `WaitingForCredentials`. Fixtures are the real 2026-10-22 GameLibSteam lines. Precedence other-session > self-update > login unchanged.
2. Monitor (746da24d8): third bounded tail read (`paths.login`) with the same cancellation re-check, passed as required `loginTail`. Tests cover cause=login being logged/sent and cancellation between the console and login reads.

## Deviations from Plan

- The plan's todo-suggested "treat verification as self-update" was not followed, per the plan's own instruction (see key-decisions).
- Task 1 left `loginTail` required from the start rather than defaulted, since the existing tests were updated to pass `loginTail: ''` in Task 2's commit; Task 1's commit was green via the optional default and tightened in Task 2.

## Known limit

The no-cutoff login rule can show a stale `WaitingForCredentials` label if bottled Steam exited at its sign-in screen and was not restarted by this launch. If the 51-27 live re-gate (item 16) shows it, bound it: require the latest `SetLoginState:` line to be at/after the latest `Client version:` line that is itself at/after `launchStartedAt - 5000`. Documented in the file header comment.

## Verification

bottleLaunchSignals and bottleProcessMonitor suites: 48 passed. `pnpm codecheck` clean. Prettier applied to written paths. Todo `2026-10-22-waiting-for-steam-misses-sign-in-prompt-and-update-download.md` stays pending until 51-27's live re-gate.

## Self-Check: PASSED
