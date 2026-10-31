---
phase: quick-261031-ixa
plan: 01
subsystem: steam-bridge
tags: [steam-bridge, callbacks, lobby, observability]
requirements: [M-03, M-05]
key-files:
  modified:
    - native/steam-bridge/helper/gamelib_cbqueue.h
    - native/steam-bridge/helper/gamelib_callresult.h
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - meta/gen_vtables.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - tests (cbqueue, helperIntegration, gen_vtables, callbackRegistryHost, harnesses)
metrics:
  tasks-done: 2 of 3 (Task 3 is the operator live check, pending)
  completed: 2026-10-31
---

# Quick 261031-ixa: Relay LobbyCreated_t (513) as a broadcast

The helper now relays LobbyCreated_t (513) as a broadcast, repacked from the 12-byte Mac layout to the 16-byte x64 layout (`{{0,0,4},{4,8,8}}`). The existing 703 call-result path is unchanged, so a game that registers both a `Callback<>` and a `CallResult<>` sees both. Call-result completion, drain and delivery now log, and the CBQ and CBDISP log budgets are per id.

**Live check (Task 3): PENDING, operator.**

## Commits
- `5052e604f` Task 1: helper (513 row, callresult/drained/mismatch logs, `callresult=0|1` tag, slot-10 kind 0..2, per-id budgets)
- `a0eae4319` Task 2: shim (`{513, 16u, 0}` relay row, kind-2 reports from `gl_cr_deliver` and `gl_md_get_api_call_result`, per-id report budget of 4 over `gl_cb_report_ids[]`, 703 never spends budget); regenerated `steam_api_shim.c` (`bridge_dispatch.h` unchanged)

## Call-result audit

| id  | Status | Reason |
|-----|--------|--------|
| 504 | already relayed as a broadcast | no change |
| 513 | added as a broadcast | `unlisted iCallback=513` seen in the live capture |
| 510 | NOT added (call-result-only) | never seen as a broadcast in the capture, and the SDK documents LobbyMatchList_t only as the RequestLobbyList call result. The new `callresult=1` tag on unlisted drops will flag it if Mac Steam ever broadcasts it |

## Deviations
- The request's example `CR complete h=...` format was not used. The new lines carry no handle (`CBQ callresult iCallback=%d failed=%d cub=%u`, `... action=drained`, `... action=mismatch`), to keep the NET/CBQ grammar free of handles (T-ixa-01). The id is enough to triage.
- No other deviations. Plan executed as written.

## Verification
- jest: cbqueue, helperIntegration, protocol (148 pass); gen_vtables, callbackRegistryHost, shimAbiGate, wireExtendedCompile, x86CallbackWineHarness, msvcCallbackBaseLayout, cbqueue (504 pass). Scoped prettier is clean. A second `pnpm gen-vtables` leaves `native/steam-bridge/generated/` clean.
- **Build: RAN.** `pgrep -fl steam-bridge-helper` printed nothing (the operator had quit Schedule I), so `pnpm build-steam-bridge` ran with exit 0. The helper in `public/bin/arm64/darwin/` was written at Oct 31 13:48:15 2026, and the x86 and x64 shim compile gates passed. Step 2 of the operator checklist can therefore be skipped.
- Known unrelated failures were not touched (steamclientLayerNotice NOTICE pin, genI18nGateScope A-17, i18nCatalogChurnGuard).

## Known Stubs / Threat Flags
None. One note: `gl_md_get_api_call_result` reports kind 2 for any successful fetch, including a non-call-result id such as 1101. The helper refuses that report (STATUS_ERR, ignored) and it spends one of that id's 4 shim budget slots. This is harmless.

## Task 3: operator steps (live check on Schedule I)
1. Confirm no stale helper is alive: `pgrep -fl steam-bridge-helper` must print nothing. If it prints anything, quit GameLib or `kill` that pid.
2. Build already done (see above). Optionally confirm with `stat -f '%Sm' public/bin/arm64/darwin/steam-bridge-helper`.
3. Restart tauri dev, so the old helper process is gone and the next launch spawns the new binary from public/bin. No reinstall is needed: every bridge launch runs placeShimForGame, which replaces a differing `steam_api64.dll` byte-for-byte.
4. Launch Schedule I: Free Sample (3205720) from GameLib, then choose Host.
5. In the GameLib log, after `HELLO shim attached appid=3205720`, expect:
   - `CALL SteamMatchMaking009.CreateLobby`
   - `CBQ queued iCallback=513 cub=16` (no `unlisted iCallback=513`)
   - `CBQ callresult iCallback=513 failed=0 cub=12`
   - `CBQ callresult iCallback=513 action=drained`
   - at least one `CBDISP iCallback=513 targets=1 ...` (`held=0` for the broadcast and/or `src=callresult`)
   - then `CALL SteamMatchMaking009.SetLobbyData`
6. In game, open "add a player". The host version must read 0.2.9f8 (not blank).
7. Report the 513-related lines and whether SetLobbyData appeared. If only `src=callresult` appears and SetLobbyData is still missing, say so: the game would then be listening some other way, and that is a follow-up.

## Self-Check: PASSED
Both commits exist (5052e604f, a0eae4319), and the generated shim contains `{513, 16u, 0}`.


## Live check (operator, 2026-10-31 14:34): PASSED

Ran Schedule I: Free Sample (3205720) after a dev restart and chose Host. Log:
`CALL SteamMatchMaking009.CreateLobby` → `CBQ callresult iCallback=513 failed=0 cub=12` →
`CBQ queued iCallback=513 cub=16` → `CBDISP iCallback=513 targets=1 held=0` →
`CALL SteamMatchMaking009.SetLobbyData` → `CBDISP iCallback=513 targets=1 src=callresult`.
The game's lobby-created handler now runs, which the SetLobbyData call shows. No `unlisted iCallback=513`.
Capture: /tmp/gamelib-58-01-20261031T001305Z/post-513-fix-gamelib.log.

Next blocker, outside this task: "add another player" does nothing because
`SteamFriends017.ActivateGameOverlayInviteDialog` is a stub. D-09 admits it now that Schedule I is
measured calling it on its host path. It goes to plans 58-17 and 58-18.
