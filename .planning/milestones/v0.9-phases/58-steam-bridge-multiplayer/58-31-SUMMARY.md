---
phase: 58-steam-bridge-multiplayer
plan: 31
subsystem: steam-bridge-backend
tags: [gap-closure, invite, ipc, control-channel]
requires: [58-29]
provides:
  - steamBridgeInviteRequest push when the game opens its invite dialog
  - IPC steamBridgeListFriends / steamBridgeInviteFriend over the authenticated helper control channel
  - preload bindings for 58-32
affects: [helperProcess.ts, steamAuthFlowRegistration.ts, preload/api/steam.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/inviteBridge.ts
    - src/backend/storeManagers/steam/bridge/__tests__/inviteBridge.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/common/types/ipc.ts
    - src/common/types/steam.ts
    - src/preload/api/steam.ts
decisions:
  - Control frames with args built via encodeRequest(CONTROL_ORDINAL, slot, args); protocol.ts untouched
  - Census pin is 27 (not the plan's 24) because Phase 59 had already raised it to 25
metrics:
  tasks: 2
  completed: 2026-11-01
---

# Phase 58 Plan 31: Invite backend wiring Summary

The helper's `INVITE dialog appid=` stderr line now raises the main window and pushes `steamBridgeInviteRequest`, and the renderer can list friends and invite through two validated IPCs backed by single-shot, probe-role, unref'd control sockets.

## What changed

- **inviteBridge.ts:** `listBridgeFriends` and `sendBridgeInvite`, sharing one `controlRoundTrip` (HELLO with `HELLO_ROLE_PROBE`, one frame, 3 s unref'd timeout, destroy on settle). Result codes map to `sent | steam-refused | no-pending | expired | bad-ordinal | no-helper | error`. Logs fixed words and counts only.
- **helperProcess.ts:** `INVITE_DIALOG_LINE` handler (own appid, own child, 2 s Date.now() debounce, no timers); `getBridgeHelperConnection(appId)`.
- **IPC/types/preload:** two `ipcMain.handle` registrations with appId regex and integer ordinal validation; `BridgeFriend`, `BridgeInviteResult`, `BridgeListFriendsResult`; `steamBridgeListFriends`, `steamBridgeInviteFriend`, `handleSteamBridgeInviteRequest` exports.

## Verification

inviteBridge, helperProcess and flowRegistrationCensus suites: 142 tests pass. `pnpm codecheck` clean. Prettier applied to touched files.

## Deviations from Plan

**1. [Rule 3 - Stale pin] Census pin 27, not 24.** Phase 59 plan 08 had already moved `steamAuthFlowRegistration.ts` to `invoke: 25`; the two new handlers make 27. Comment line added accordingly.

**2. Single commit.** The two tasks share helperProcess.ts and types, so they were committed together (0a627de67) to keep the tree compiling.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-58-103 to T-58-107, all mitigated and tested).

## Self-Check: PASSED
