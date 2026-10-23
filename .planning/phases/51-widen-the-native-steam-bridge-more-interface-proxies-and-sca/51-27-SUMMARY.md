---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 27
subsystem: steam-bridge
tags: [live-gate, uat, gap-closure, allowlist, elex]
requires: [51-23, 51-24, 51-25, 51-26]
provides:
  - 51-UAT items 14-16 with live verdicts (pass, issue, blocked)
  - ELEX (411300) on knownBad as does-not-run
affects: [51-28, 51-29]
key-files:
  modified:
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-UAT.md
    - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
    - src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts
  created:
    - .planning/todos/pending/2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits.md
decisions:
  - "ELEX is knownBad does-not-run (operator rating), never a playVerified seed entry"
  - "Wire-win64 todo stays pending: closure was tied to ELEX reaching its menu"
metrics:
  tasks: 3
  completed: 2026-10-23
---

# Phase 51 Plan 27: Packaged-build re-gate Summary

Three gaps were re-gated live on a packaged build at HEAD c8729c36a: helper teardown passes, the Win64 wiring is verified but ELEX still does not run, and the Waiting-for-Steam login cause could not be exercised.

## Build facts

Built at c8729c36a. SHIM32 894464 bytes and SHIM64 848896 bytes (public/bin, build/bin and the bundle agree). `pnpm tauri:dev:packaged` exited 1 at the final `bundle_dmg.sh` step; the `.app` was complete and the DMG is not needed, so this is noted as a tooling issue only. A first test attempt was aborted: bottled Steam crashed and left an orphaned steamwebhelper.exe (killed by the orchestrator), and the app was relaunched. Results come from the second attempt. The pre-test log was archived as `gamelib.log.pre-51-27-<timestamp>`.

## Operator words (verbatim)

"14 pass, 15 elex does not reach main menu stuck on loading message, but the rest works.  noting ELEX is a 'does not run' rating" and, for item 16, "did not see message saying waiting for steam, also after quite game game page still says 'launching'".

## Results

| Item | Verdict | Evidence |
| ---- | ------- | -------- |
| 14 Avernum 6 teardown (206060) | pass | `game started` logged during first launch (log line 70); `game stopped`, `stopBridgeHelper` and helper exit after each of three launches (lines 75-77, 103-106, 126-129). pgrep/lsof was not run by the executor. |
| 15 ELEX through wired Win64 shim (411300) | issue | Placed steam_api64.dll 848896 == SHIM64; HELLO attached (line 149); the `[bridge-notice]` line (145) lists none of SteamUser, SteamUtils, SteamApps, SteamFriends; no subscription error. Hangs on the loading screen and never reaches the main menu. |
| 16 Waiting for Steam login cause (206020) | blocked | Bottled Steam auto-signed-in with remembered credentials (no WaitingForCredentials in steamui_login.txt), so `cause=none` (line 171) was correct. New defect found: game page stays on "Launching" after exit. |

## Seed and todos

- ELEX added to knownBad as `does-not-run` citing 51-UAT item 15; allowlist test extended (29 tests pass).
- Closed: bridge-process-monitor-starts-after-game-exits (item 14) moved to completed.
- Annotated and left pending: wire-win64-core-steam-interfaces (wiring verified, ELEX does not run) and waiting-for-steam-misses-sign-in-prompt-and-update-download (sign-out must also clear remembered credentials to exercise cause=login).
- New pending todo filed: 2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits (severity major, platform macos, ready code).

## Deviations from Plan

**1. [Rule 2 - Missing tracking] New todo outside files_modified.** The stuck-on-Launching defect surfaced during item 16 and was filed as a new pending todo, as directed by the orchestrator.

**2. [Operator direction] ELEX placed on knownBad.** The plan said ELEX disposition belonged to 51-28 when the failure is outside the bridge; the operator directed does-not-run now.

**3. Gaps appended to 51-UAT.md.** Three entries (ELEX, Waiting-for-Steam unverified, stuck Launching).

## Deferred Issues

`pnpm planning-gates` reports 11/12: preload-surface-gate.py (phase 34.5) fails on getSteamBridgeRoute and setSteamBridgeUserRoute missing from IPC-PORT-INVENTORY.md. Pre-existing and unrelated; logged in deferred-items.md. The todo-frontmatter gate passes.

## Self-Check: PASSED

Allowlist jest suite and prettier check on the JSON/TS paths pass; the new todo carries severity/platform/ready.
