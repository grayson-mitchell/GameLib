---
status: resolved
trigger: "Steam overlay does not attach to Core Keeper (1621690) under the bridge — from todo .planning/todos/pending/2026-11-13-core-keeper-bridge-overlay-not-attached.md"
created: 2026-11-14
updated: 2026-11-14
---

# Debug: Steam overlay does not attach to Core Keeper (1621690) under the bridge

## Symptoms

DATA_START
expected: Under the macOS bridge, the Steam overlay attaches to Core Keeper (Unity 6000.0.59f2, Direct3D 11) and Shift+Tab opens it in game.
actual: The game starts cleanly (HELLO, `steam initialized successfully`, stats received), but gamelib.log shows `overlay attach: not attached within 10s` at 21:33:18 on 2026-11-13. Steam's `gameoverlayui` was not running at 21:34.
errors: The overlay shim loaded into CoreKeeper.exe (pid 14888): `layer_hooks=3 overlay=present`. Device, queue and MTL4 queue hooks installed (`AGXG17DDevice hooks=4`, `AGXG17XFamilyCommandQueue hooks=2`). The command-buffer hook line read `hooks=1 overlay_commit=missing`, which is the first lead.
timeline: Seen 2026-11-13 21:33 NZDT during the live re-verify of the closed SteamInventory_v003 todo (gamelib.log lines 158-222). Not known whether it ever worked for this title.
reproduction: Launch Core Keeper 1621690 from GameLib through the bridge on macOS and watch for the overlay attach line. Suggested next probe: per-game env var `CX_ENV=STEAM_OVERLAY_LOGGING=1 STEAM_OVERLAY_LOGGING_FLUSH=1` (honoured since 89d40050d), then check whether gameoverlayui is spawned and whether `overlay_commit` is ever resolved.
DATA_END

## Context

- Code: src/backend/storeManagers/steam/bridge/overlay/overlayAttachWatch.ts:170, native/steam-bridge/overlay-shim
- Related resolved session: .planning/debug/resolved/opengl-bridge-overlay-no-attach.md (Dredmor; unsupported because it renders 2D in software, a reason that does not apply to a D3D11 title)
- Skill("spike-findings-gamelib") covers the overlay in bottles (CX_ENV dylib injection, the 10-bit/Metal 4 overlay-shim fix).
- Done when the overlay attaches and Shift+Tab opens it in game, or the title is recorded as unsupported with the reason (a user decision).
- Live launches need the operator. When asking for one, follow memory: network off only during the action; dev launch is `pnpm tauri:dev`.

## Current Focus

hypothesis: Since b8e5cb85e (Nov 13 21:30) Core Keeper hangs before its first frame. Facepunch Steam init now succeeds, the game issues ISteamUGC016 CreateQueryUserUGCRequest + SendQueryUGCRequest, which the bridge shim only stubs, and it waits for a call result that never completes. No frame means no overlay attach and no window raise.
next_action: none. Resolved and live-verified 2026-11-14 22:19.
reasoning_checkpoint:
tdd_checkpoint:

## Evidence

- timestamp: 2026-11-14
  checked: all 148 `ensure_command_buffer_hooks` lines across every overlay trace (~/Library/Application Support/GameLib/steam-bridge/overlay/trace/*.log), plus skill steam-overlay-in-bottles.md section 3
  found: `overlay_commit=missing` appears on EVERY line, including titles whose overlay attaches (Planet Crafter 1284190). The skill states "With the shim in place, overlay_commit=missing is normal, not a failure (061)".
  implication: the todo's first lead is a red herring.
- timestamp: 2026-11-14
  checked: Mac Steam logs/console_log.txt for AppID 1621690
  found: six Core Keeper launches (Nov 12 06:21, Nov 13 17:53, 17:55, 17:56, 21:27, 21:33) and none has a `GameOverlay: started ... gameoverlayui` line, while many other titles do. Not a one-off; Core Keeper has never attached.
  implication: deterministic per-title, not flaky timing.
- timestamp: 2026-11-14
  checked: Core Keeper overlay traces vs Planet Crafter 1284190-1794502345119 trace
  found: both log shim_load in the game exe (image_added shows gameoverlayrenderer loaded), device/queue/MTL4 queue hooks, hook_set_colorspace/pixel_format (WineMetalLayer BGRA8Unorm, overlay_pipeline=present), ensure_encoder_hooks. Only Planet Crafter then logs 4x `record_overlay_pipeline` (Steam's overlay building its Metal pipelines). Core Keeper never does, in any of its 5 traces that reach the encoder stage. The 21:33 trace has no pixel_format line at all.
  implication: Valve's renderer is injected but never reaches overlay init in Core Keeper. The shim's Metal hooks are not the failing step.
- timestamp: 2026-11-14
  checked: Player.log in bottle GameLibSteamBridge-1621690
  found: Unity 6000.0.59f2, Direct3D 11.0 level 11.1 (AMD Compatibility Mode), Steam API initialised, stats received. Game process stayed up ~11h (gameprocess_log: tracked until 08:15 next day).
  implication: not a crash or early exit; game renders on D3D11.
- timestamp: 2026-11-14
  checked: Steam userdata localconfig.vdf for app 1621690
  found: no EnableGameOverlay override (default on).
  implication: per-app overlay disable ruled out.
- timestamp: 2026-11-14
  checked: bottle DllOverrides / d3d11 dxgi files for GameLibSteamBridge-1621690 vs -1284190
  found: no d3d11/dxgi native override in either user.reg; same layout.
  implication: DXVK-on-D3DMetal mix pitfall not evident.

- timestamp: 2026-11-14 22:05
  checked: operator live launch 21:59 with CX_ENV overlay logging (operator: "core keeper did not launch"); gamelib.log, Player.log, newest trace 1621690-1794646768053, ps
  found: CoreKeeper.exe pid 93225 still running at 2+ min with no window. Player.log ends at `steam initialized successfully` (same as 21:33 Player-prev.log). raiseWineGameWindow found no window (same as 21:33). Last bridge calls: STEAMUGC_INTERFACE_VERSION016.CreateQueryUserUGCRequest then SendQueryUGCRequest, both `kind=stub`.
  implication: the game hangs before it ever draws.
- timestamp: 2026-11-14 22:05
  checked: pixel_format / ensure_encoder_hooks per Core Keeper trace, all 7 runs
  found: Nov 12 06:22 and Nov 13 17:53, 17:55, 17:56, 21:28 each log `hook_set_pixel_format` from CoreKeeper.exe (a WineMetalLayer was created, so the game drew). Nov 13 21:33 and Nov 14 21:59 log neither line. Between 21:28 and 21:33 landed b8e5cb85e (21:30): exports SteamAPI_SteamMatchmakingServers_v002 / SteamVideo_v002 / SteamGameSearch_v001, which fixed the EntryPointNotFoundException in Facepunch Steam init.
  implication: REFRAME. The overlay is not the defect. Since b8e5cb85e, Facepunch Steam init succeeds, the game goes on to a Workshop UGC query that the shim only stubs, and (hypothesis) waits forever for a SteamUGCQueryCompleted_t call result, so it never presents a frame. With no frame there is nothing for the overlay to attach to, and no window to raise. The 21:33 "started cleanly" reading was wrong: it was already hung. Also explains todo 2026-11-13-raise-wine-game-window-misses-core-keeper.md.

- timestamp: 2026-11-14 22:10
  checked: meta/sdk/isteamugc016.manifest.json, meta/gen_vtables.ts emitStubBody, generated steam_api_shim.c, Core Keeper's Facepunch.Steamworks.Win64.dll strings
  found: ISteamUGC016 is `mode: stub`; every stub int64 method returns `0LL`, so SendQueryUGCRequest returned SteamAPICall_t 0 (k_uAPICallInvalid). IsAPICallCompleted(0) is never true (results table only holds minted/wire handles), no 703 is ever queued, so an awaiting Facepunch call never resumes. The DLL uses flat SteamAPI_ISteamUtils_IsAPICallCompleted/GetAPICallResult and SteamAPI_ManualDispatch_RunFrame, and its SteamUGCQueryCompleted_t carries NextCursor (struct 280 bytes). The shim already had a results table (gl_md_store_result), a 703 announce and a CCallResult held table, but only fed from the helper wire.
  implication: mechanism confirmed from code (not yet live). Hang = await on handle 0.
- timestamp: 2026-11-14 22:15
  checked: fix commit 01d78e5e3
  found: new STUB_FAILED_CALL_RESULTS table + gl_stub_fail_call_result in the generated shim: a flagged stub mints handle 0x474C<<48|n and completes it at once (m_eResult=k_EResultFail, failed=0) via gl_md_store_result, plus gl_cr_hold when manual dispatch is off. Applied to SendQueryUGCRequest in ISteamUGC 016/017/020 (older 007/010 struct has no cursor; not listed). Both steam_api.dll and steam_api64.dll compile; meta jest gen_vtables/shimAbiGate/buildSteamBridgeShims pass (445), new tests added; prettier clean.
  implication: pending live verification. Other stubbed call-returning methods (SubscribeItem, RequestUGCDetails, ...) still return 0 and could hang the same way for other titles; extend the table per method as needed.
- note: todo .planning/todos/pending/2026-11-13-raise-wine-game-window-misses-core-keeper.md is likely the same root cause (game never draws, so no window to raise). Do NOT close without the live check.

## Eliminated

- hypothesis: `overlay_commit=missing` in the command-buffer hook line is the cause
  evidence: appears on every trace, including working titles; skill documents it as normal.
  timestamp: 2026-11-14
- hypothesis: overlay disabled for the app in Steam settings
  evidence: no EnableGameOverlay key in localconfig.vdf for 1621690.
  timestamp: 2026-11-14
- hypothesis: shim/Metal hook install fails for this title
  evidence: all hooks install identically to Planet Crafter; divergence is after (no overlay pipelines created).
  timestamp: 2026-11-14

## Resolution

root_cause: ISteamUGC stub SendQueryUGCRequest returns SteamAPICall_t 0 and nothing ever completes it, so Core Keeper's awaited Workshop query never resumes and it hangs before its first frame. The overlay was never the defect: with no frame there was nothing to attach to and no window to raise. Regression since b8e5cb85e (Nov 13 21:30), which let Facepunch Steam init succeed and reach the query.
fix: commit 01d78e5e3, stubs listed in STUB_FAILED_CALL_RESULTS complete immediately as failed call results.
verification: live 2026-11-14, two launches (22:19, 22:20). Operator: "core keeper opened, shift-tab worked". gamelib.log: `raiseWineGameWindow [bridge:1621690]: raised (CoreKeeper.exe pid=10040)` and `overlay attach: attached gameoverlayui pid=10218 game pid=10040 after 9019ms`; same for pid 10694. Trace 1621690-1794648013468: hook_set_pixel_format 1, record_overlay_pipeline 4. Steam console_log: GameOverlay started for both game pids.
files_changed: meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, native/steam-bridge/generated/steam_api_shim.c (01d78e5e3). Also closes todo 2026-11-13-raise-wine-game-window-misses-core-keeper.md (same root cause).
