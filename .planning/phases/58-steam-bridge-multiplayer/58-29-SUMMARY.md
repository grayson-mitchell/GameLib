---
phase: 58-steam-bridge-multiplayer
plan: 29
subsystem: steam-bridge-helper
tags: [gap-closure, native, c, invite, control-channel]
requires: [58-25, 58-28]
provides:
  - helper remembers the lobby the game passed to ActivateGameOverlayInviteDialog
  - CONTROL slot 13 listFriends and slot 14 inviteFriend (authenticated)
  - MMS lobby-shape measurement lines
affects: [native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/protocol.ts]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamfriends017.manifest.json
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/generated/steam_api_shim.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
    - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
    - meta/__tests__/gen_vtables.test.ts
decisions:
  - Helper is single-threaded (one accept loop), so invite state has no mutex
  - Friends flats not generated are resolved by dlsym via gl_nets_sym
metrics:
  tasks: 2
  completed: 2026-11-01
---

# Phase 58 Plan 29: Helper invite path Summary

The helper now keeps the lobby the game itself asked to invite to and serves an authenticated friend list plus an InviteUserToLobby action over CONTROL slots 13 and 14, with SteamIDs never leaving the helper.

## What changed

- **Precondition:** 58-25-DIAGNOSIS.md reads `Decision: proceed`.
- **Invite dialog (Task 1, 75865d320):** `SteamFriends.ActivateGameOverlayInviteDialog` is now `helperCustom: gl_friends_invite_dialog`. It stores the lobby id with a monotonic timestamp, forwards unchanged to Mac Steam, and logs `INVITE dialog appid=<appid>` (rate limit 2 s, cap 16, no id). The 017 manifest was hand-edited to match wire-policy (see deviation); the generated header and shim were regenerated with `pnpm gen-vtables`.
- **MMS lobby lines:** `gl_mms_lobby_log` is called after each successful dispatch, independent of `g_call_seen`, and logs `MMS lobby op=create type=%d max=%d`, `op=set-type type=%d`, `op=set-joinable value=%d`; 4 lines per op, never the lobby id.
- **Slot 13 listFriends (Task 2):** snapshot of up to 100 immediate friends into a helper-only SteamID array; response `[u32 count]` then `[u32 ordinal][u8 online][u8 playingThisApp][u16 nameLen][name]`, names truncated at a UTF-8 boundary to 128 bytes. Logs only `INVITE friends n=<count>`.
- **Slot 14 inviteFriend:** `[u32 ordinal]` -> `[i32 result]`: 1 ok, 0 Mac refused, -1 no pending, -2 expired (>= 600 s), -3 bad ordinal or no snapshot. Logs `INVITE sent ok=` or `INVITE refused reason=`. The pending lobby survives success so several friends can be invited. Both slots sit behind the WR-03 auth gate and require `g_inited`; wrong `argLen` returns STATUS_ERR.
- **protocol.ts:** `CONTROL_SLOT.listFriends = 13`, `inviteFriend = 14`, `INVITE_RESULT`, `encodeInviteFriendArgs`, and a strict `decodeFriendList` that throws `RangeError` on truncation, count over 100, or names over 128 bytes.

## Verification

- `helperNetHarness.test.ts`: 20 pass (new: invite-dialog, invite-dialog-ratelimit, mms-lobby-args, list-friends, invite-ok, invite-refusals, control-unauth). The harness asserts no 17-digit number in stderr and no fake SteamID bytes in the slot 13 response.
- Whole `src/backend/storeManagers/steam/bridge` tree plus `gen_vtables`, `bridgeCensus`, `callbackRegistryHost`: 38 suites, 1854 tests pass.
- `pnpm gen-vtables` and `pnpm build-steam-bridge` exit 0 (arm64 helper compiles with `-Werror=uninitialized`; both Windows compile gates PASSED).
- Prettier clean on the touched `.ts`/`.json` files; `.c`/`.h` have no parser.

## Commits

- Task 1 (75865d320): invite lobby + MMS lines (helper, wire-policy, manifest, generated files, harness, gen_vtables pins)
- Task 2 (a80522167): protocol constants and codecs

Task 1 also contains the helper code for slots 13/14, because the harness driver exercises all of it in one translation unit; Task 2 is the TypeScript protocol side.

## Deviations from Plan

**1. [Rule 3 - Blocking] Manifest edited by hand.** `pnpm extract-proton-inventory` fails here, so `helperCustom` was added to the single ActivateGameOverlayInviteDialog entry in `meta/sdk/isteamfriends017.manifest.json`, matching the wire-policy change. Older Friends manifests carry no helperFlat for it and need no change.

**2. [Rule 1 - Test pins] Existing tests updated:** `gen_vtables.test.ts` custom-prototype list gained `gl_friends_invite_dialog`, the "base text only" fixture now also excludes SteamFriends017 (it uses an extended kind), and the 58-20 slot test no longer asserts slot 13 is unused.

**3. Log spacing.** `INVITE` fills the 6-character category column, so lines have a single space (`INVITE dialog ...`), unlike padded `CALL   X`. Tests match `INVITE +`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-58-95 to T-58-99, all mitigated and tested).

## Self-Check: PASSED

Both task commits exist; all listed files present.
