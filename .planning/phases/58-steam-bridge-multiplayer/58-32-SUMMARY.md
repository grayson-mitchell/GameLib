Route: /gsd-plan-phase 58 --gaps (friend picker: helper cannot serve control while the game's shim connection is open)

---
phase: 58-steam-bridge-multiplayer
plan: 32
subsystem: steam-bridge-frontend
tags: [gap-closure, invite, friend-picker, live-check-failed]
requires: [58-31]
provides:
  - useSteamBridgeInvite store + SteamBridgeInviteDialog (code complete, unit tested)
affects: [GlobalState.tsx, App.tsx, public/locales/*/gamelib.json]
key-files:
  created:
    - src/frontend/state/SteamBridgeInvite.ts
    - src/frontend/state/__tests__/SteamBridgeInvite.test.ts
    - src/frontend/components/UI/SteamBridgeInviteDialog/index.tsx
    - src/frontend/components/UI/SteamBridgeInviteDialog/index.scss
    - src/frontend/components/UI/SteamBridgeInviteDialog/__tests__/SteamBridgeInviteDialog.test.tsx
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/frontend/App.tsx
    - public/locales/*/gamelib.json (49 files, +13 lines each)
metrics:
  tasks: "1 of 2 passed; Task 2 (live check) FAILED"
  completed: 2026-11-01
---

# Phase 58 Plan 32: Friend-picker invite dialog Summary

The friend-picker store, dialog, wiring and strings were built and unit tested (commit 29be44715), but the live check failed: pressing the game's '+' produced no picker and no invite. M-01 is NOT complete.

## Task 1 (passed)

12 tests pass, `pnpm codecheck` is clean and prettier is clean. English strings are under `steam.bridge.invite.*`, copied verbatim into the other 48 locales (additive, English fallback, no invented translations).

i18n gate notes (pre-existing, not caused by this plan): `pnpm lint-translations:gamelib` reports about 5,376 missing-translation lines, none for invite. `pnpm i18n-churn-guard` fails because `pnpm i18n` rewrites `public/locales/en/gamepage.json`, which the other session had left dirty. My one `pnpm i18n` run reordered 4 keys there (drmSetup, steamStarting, steamFinishInSteam). It is uncommitted, with values unchanged, and was not touched further.

## Task 2 (FAILED): live result

Operator answer, verbatim: "i pressed +, no picker" (dialog: no; sent shown: no; PC saw invite: no; PC accept result: skipped).

Scored launch, gamelib.log, 10:20 local:
- shim HELLO attached 10:20:12; lobby create; `CALL ActivateGameOverlayInviteDialog` and `INVITE dialog appid=3205720` at 10:20:19 (the '+' press)
- `bridge invite [3205720]: list result=error` at 10:20:22, exactly the 3 s `CONTROL_TIMEOUT_MS`
- Counts: `INVITE dialog` 1, `INVITE friends n=` 0, `INVITE sent` 0

### Root cause (orchestrator-verified from source)

The helper's accept loop (`native/steam-bridge/helper/bridge_helper.c` ~2991, `for(;;){ c = accept(...); serve_connection(c); }`) serves one connection at a time until it closes. The game shim's connection stays open for the whole session, so `inviteBridge.ts`'s second (control) connection waits in the listen backlog and times out after 3 s. The 58-29 and 58-31 harness tests exercised slots 13/14 with no concurrent shim connection, so they could not catch it. 58-29 noted "no mutex, helper is single-threaded" without considering a second client.

### Unresolved secondary finding

The frontend evidently received `steamBridgeInviteRequest`, since `listBridgeFriends` ran. The 12 unit tests expect the dialog to show an "unavailable" message on list failure, and the main window to be shown. The operator saw no picker. Either the GameLib window did not come to the front over the game, or the dialog did not render. Unresolved; check it in the fix plan.

### Suggested fix direction (recorded, not implemented)

- Single-threaded `poll()`-based multiplexing of the listen socket and all open connections, so every Steam call stays on one thread.
- A harness test that holds a shim connection open while calling slots 13/14.
- Verify the window-raise and dialog render path.

## Run-condition note and Phase 59 defect observed (not part of this plan's result)

On the first launch, Phase 59 engine code (other session) ran a CrossOver demo-status probe that succeeded (licensed, 8 s). A second probe timed out at 15 s and was classified `cx-broken`. GameLib then downloaded Wine-Staging 11.20 + DXVK 1.10.3 and switched the bridge bottle to the pinned engine. The operator set the per-game Engine (advanced) override to CrossOver. The scored relaunch logged `engine switch pinned:wine-staging-11.20 -> crossover` and `uses engine=crossover build=26.3.0.39832 reason=cx-healthy`. Defect: a single probe timeout leads to `cx-broken` and a bottle mutation.

## Deviations from Plan

None in code. Task 2 outcome is a failed gate, routed to gap planning. 58-33 must not start.

## Known Stubs

None.

## Self-Check: PASSED (commit 29be44715 exists; files present)
