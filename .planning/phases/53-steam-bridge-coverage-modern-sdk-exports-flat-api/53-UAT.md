---
status: complete
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
source:
  - 53-01-SUMMARY.md
  - 53-02-SUMMARY.md
  - 53-03-SUMMARY.md
  - 53-04-SUMMARY.md
  - 53-05-SUMMARY.md
  - 53-06-SUMMARY.md
  - 53-07-SUMMARY.md
started: 2026-10-25T00:00:00Z
updated: 2026-10-25T12:00:00Z
---

Authored by plan 53-08, run by 53-09. The plan that authored this contract did not run any item of it.

Done-when being gated (ROADMAP): the census Evidence column reads `verified` for a majority of
Steamworks-using rows, counted over ALL Steamworks-using rows (D-53-14), not only the sample.

Verified is strict (D-53-13): HELLO for the appid is required, plus the engine's evidence rule below.
In-Game in Mac Steam never counts. No game log means unverified. A known-bad title is never rerouted
to bottled Steam to raise the count.

## Desk gate

Recorded 2026-10-25 by 53-08. Phase base `a9d456961`; gate HEAD `90b6c6012` (includes one 53-08 fix
commit, see below).

| Command | Outcome |
|---|---|
| `pnpm gen-vtables` then `git diff --exit-code native/steam-bridge/generated src/backend/storeManagers/steam/bridge/shimExports.generated.ts` | PASS, no diff ("35 interfaces, 1392 vtable slots, 45 flat exports, 635 steam_api64 exports") |
| `pnpm codecheck` | PASS |
| `pnpm test:ci` | 4 suites / 6 tests failed on first run; phase-53 portion fixed (below); remainder pre-existing (below) |
| `pnpm build-steam-bridge` | PASS (steam_api.dll, steam_api64.dll, steamclient64.dll, steam-bridge-helper) |
| `objdump -p public/bin/arm64/darwin/steam_api64.dll`, count of `SteamAPI_ISteam` | 512 (>= 400) |
| exports `SteamInternal_GameServer_Init`, `SteamAPI_ISteamClient_GetISteamUser`, `SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck` | all three present |
| `graphify update .` | PASS (graphify-out is git-ignored) |

Artifact sizes (`stat -f %z`): steam_api64.dll = 402944, steam_api.dll = 286720,
steamclient64.dll = 187392, steam-bridge-helper = 152144. SHIM64 for the preflight = 402944.

Phase-53 regression found and fixed by this plan (commit `90b6c6012`): `meta/findDeadcode.cjs` reported
7 exports used only in their own module in files phase 53 touched (`bridgeScan.ts`
`RuntimeSteamApiDll`, `SteamApiImporterPe`; `managedImports.ts` `COMIMAGE_FLAGS_32BITREQUIRED`,
`COMIMAGE_FLAGS_32BITPREFERRED`, `ClrHeaderInfo`, `ManagedImportsResult`; fixture `managedPe.ts`
`ManagedPeOptions`). The `export` keyword was dropped from each. `BridgeImportScan` is imported by
`meta/bridgeCensus.ts`, which the scan does not cover, so it carries a `// ts-prune-ignore-next` with
the reason. Bridge suites: 17 suites, 524 tests pass.

Not phase 53 (the remainder of the 6 failures; unconfirmed at the phase base, no scratch worktree was
made, but none of these files is touched by a 53 plan): `testContainment` (unclassified
`steamNativeInstallDefault.test.ts`, quick 261024-exo), `findDeadcode` CLI check (still exits non-zero
on `RustNotificationBackendLabel` in `sidecarTransport.ts` from phase 52 notification work, `delayImportPe.ts`
fixture and `crossoverInstallRisk.ts`, both already named in 52 deferred-items.md),
`genI18nGateScope` A-17 (stale `meta/i18nForkTouchedFiles.json`), `machineFillGamelib`
`pluralCategoriesFor` (3 tests, ICU category ordering).

## Preconditions

Run against the **packaged build only: `pnpm build-steam-bridge` then `pnpm tauri:dev:packaged`, never
plain `tauri:dev`** (a long-lived dev server runs a stale sidecar bundle; tauri dev does not rebuild
the sidecar). After the build, record the sidecar bundle (`sidecar.js`) mtime and confirm it is newer
than the last backend commit; record `stat -f %z` of `steam_api64.dll` (expected 402944 unless rebuilt).
Mac Steam signed in (operator confirms). No GameLib and no helper running at start:
`pgrep -f 'target/debug/gamelib-shell'` and `pgrep -fl steam-bridge-helper` must both print nothing.
Run the whole sample in ONE session so gamelib.log is not rotated mid-run; record which log files the
census reads. Per-game bottles `GameLibSteamBridge-<appid>` exist for: 1119730, 1167950, 1284190,
1363080, 1603180, 1691190, 1782460, 206060, 219990, 230070, 284100, 3410180, 411300, 427410, 648410,
648800. Helper log lines in gamelib.log: `bridge helper [<appid>]: [<ts>] HELLO  shim attached
appid=<appid>`, `... CALL   <Interface>.<Method>`, `... NOVER  flat lookup ver=<v> served=no`.

Recorded at launch (53-09 Task 1, 2026-10-25):

- HEAD 4f7c79cdec575f9cda165ee584592a5840a44842 (committed 2026-10-25 10:03:22 +1300).
- `steam_api64.dll` size 402944 (as expected).
- Sidecar binary `GameLib.app/Contents/MacOS/gamelib-sidecar` mtime 2026-10-25 10:04:40, newer than HEAD.
- `pnpm build-steam-bridge` ok. `pnpm tauri:dev:packaged` built the app bundle then exited 1 only on the
  updater-artifact signing step (no `TAURI_SIGNING_PRIVATE_KEY`); `gamelib-shell` and GameLib.app were produced.
- No `gamelib-shell` or `steam-bridge-helper` running beforehand. Launched `target/debug/gamelib-shell` detached
  (pid 19000), log `/private/tmp/claude-501/gamelib-53-09.log`.
- `~/Library/Logs/GameLib` at launch: gamelib-shell.log, gamelib.log, gamelib.log.51-29-batch0-215927,
  gamelib.log.old, gamelib.log.pre-51-27-20261023-073351, gamelib.log.pre-51-28-20261023-194304,
  gamelib.log.pre-51-29-20261023-214423, runners/.

Carried findings to check while running:

- 53-07: Ranch Simulator 1119730, Manor Lords 1363080 and Abiotic Factor 427410 read `unknown-version`
  in the census after the shared-scan switch. The census resolves over the original dll plus Shipping
  exe strings; if install's `shimGenerate` resolves the same bytes differently that is a census/install
  divergence (D-53-12). Items 7-9 record the version install actually used vs the census verdict.
- 53-07: shim-only rows (placed shim, no `.gamelib-orig` backup) still use the persisted-verdict path.
- 53-02: the flat-name fixture covers only 5 installed Mono titles.
- Census baseline before live runs: 0 of 18 Steamworks-using rows verified.

## Tests

### 1. Rogue Waters 1691190 (Unity)
expected: launch from GameLib through `GameLibSteamBridge-1691190`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1691190; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); the game gets past loading; the two former misses resolve; In-Game never counts
result: issue — Unity. HELLO y (1), CALL 0, NOVER 1 (STEAMSCREENSHOTS_INTERFACE_VERSION003). Player.log: `[Steamworks.NET] SteamAPI_Init() failed` then `Is initialized: False` and an IcgException; census `init-failed (SteamAPI_Init)`; detail still lists the former misses SteamController, SteamController006, SteamUtils009 and bridge-notice `stubbed:SteamUtils`, so the two former misses did NOT resolve. Operator: "logged out of steam friends, hung at usual spot (load screen)". D-53-06 trace: flat lookup STEAMSCREENSHOTS_INTERFACE_VERSION003 not served (the only fault line before init failure); plus SteamUtils009 stubbed.

### 2. Vampire's Fall 1167950 (Unity)
expected: launch through `GameLibSteamBridge-1167950`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1167950; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: issue — Unity. HELLO y (1), CALL 0, NOVER 1 (STEAMSCREENSHOTS_INTERFACE_VERSION003). Player.log line 18: `[Steamworks.NET] SteamAPI_Init() failed`; census `init-failed (SteamAPI_Init)`. Operator: "reaches menu, shows me in friends playing vampire's fall" (friends presence is not bridge evidence). D-53-06 trace: STEAMSCREENSHOTS_INTERFACE_VERSION003 not served.

### 3. Planet Crafter 1284190 (Unity)
expected: launch through `GameLibSteamBridge-1284190`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1284190; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: pass — Unity. HELLO y (1), CALL 0 (not required), NOVER 1 (STEAMSCREENSHOTS_INTERFACE_VERSION003, no init failure). Player.log clean (no EntryPointNotFoundException, no SteamAPI_Init failed); census `verified`. Operator: "reached menu, friends worked".

### 4. Hell Clock 1782460 (Unity)
expected: launch through `GameLibSteamBridge-1782460`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1782460; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: issue — Unity. HELLO y (2 helper launches), CALL 0, NOVER 2 (STEAMSCREENSHOTS_INTERFACE_VERSION003). Current Player.log line 30: `[Steamworks.NET] SteamAPI_Init() failed`; census `init-failed (SteamAPI_Init)`. Operator saw a full pass, but the strict rule is the game's own init log, which shows failure. D-53-06 trace: STEAMSCREENSHOTS_INTERFACE_VERSION003 not served.

### 5. Mining Mechs 1603180 (Unity)
expected: launch through `GameLibSteamBridge-1603180`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1603180; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: pass — engine not detected (no Player.log, no engine log under the bottle; scored by the game-originated CALL rule). HELLO y (1), CALL 10 (SteamUser023.BLoggedOn/GetSteamID, SteamFriends017.GetPersonaName, STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp/GetCurrentGameLanguage, STEAMUSERSTATS_INTERFACE_VERSION013.GetStat/SetStat/GetAchievement/SetAchievement/StoreStats), NOVER 0; census `verified`. Operator: game played past menu. The launch dialog (`GR_D3D_Device->CheckMultisampleQualityLevels`, HRESULT 0x80070057, Graphics_DisplayM.cpp line 1782) is a D3D/Wine graphics error with no Steam call, clicked through; recorded, not a bridge fault.

### 6. Overlooting 3410180 (Unity)
expected: launch through `GameLibSteamBridge-3410180`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 3410180; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); note whether the PE-parse message recurs (record its exact text); In-Game never counts
result: issue — class Godot per census (libgodotsteam.windows.template_release.x86_64.dll; the item header said Unity). HELLO n, CALL 0, NOVER 0; census `unverified (no HELLO)`. Two launches (23s and 5s of play). Godot logs 0 bytes. Wine crash: page fault on read of 0x0 with rip=0, return address 0x00000001400607f1 inside overlooting.exe, backtrace `=>0 0000000000000000 no code accessible`; steam_api64 and libgodotsteam were loaded. PE-parse message recurs: `placeShimForGame: Steam DRM detection could not parse the exe as a PE for appId 3410180 -- treating as not CEG`. No Interface.Method traced (no HELLO, so the shim was never entered): not a post-init Steam fault. Static check: all 13 steam_api64 imports of libgodotsteam are exported by the placed shim (402944 bytes).

### 7. Ranch Simulator 1119730 (Unreal Engine)
expected: launch through `GameLibSteamBridge-1119730`; the shim is placed, not withheld, and its size equals the built steam_api64.dll size; HELLO for appid 1119730; UE rule: Saved log free of `SteamAPI failed to initialize` plus `Client API initialized 1`, or a CALL line; record the interface version install resolved vs the census `unknown-version` verdict (D-53-12); In-Game never counts
result: issue — Unreal Engine. HELLO n, CALL 0, NOVER 0; census `unverified (no HELLO)`. Shim placed (402944 bytes) at Engine/Binaries/ThirdParty/Steamworks/Steamv161/Win64 with steam_api64.dll.gamelib-orig (330296 bytes) kept. Shipping exe exited in under 1 s with code 0x35 (EOSBootstrapper.log: `Target application failed with exit code: 35h`), before any UE Saved log existed. Operator: "play button changees breifly, but game fails to launch" and friends briefly showed it playing (the helper's real-appid init, not game evidence). D-53-12: the install log does not record a resolved interface version; census shows `SteamClient@ambiguous(SteamClient017,SteamClient021)` (unknown-version); install placed regardless, so no divergence is observable from logs.

### 8. Manor Lords 1363080 (Unreal Engine)
expected: launch through `GameLibSteamBridge-1363080`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1363080; UE rule: Saved log free of `SteamAPI failed to initialize` plus `Client API initialized 1`, or a CALL line; no 0x0 access violation. A 0x0 crash traced to the null object is the D-53-08 revisit trigger and is recorded as `issue — D-53-08 trigger` with the log line; record install-vs-census version resolution (D-53-12); In-Game never counts
result: pass — Unreal Engine. HELLO y (1), CALL 7 (STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed, STEAMUSERSTATS_INTERFACE_VERSION012.GetAchievementAndUnlockTime/GetAchievementDisplayAttribute/SetAchievement/StoreStats, SteamUser023.GetSteamID, SteamUtils010.GetAppID), NOVER 0; census `verified`. Operator: "full pass"; no 0x0 crash, so D-53-08 null-object fallback stands. D-53-12: census class unknown-version (SteamClient017/020, SteamGameServer014/015, SteamUser021/023 ambiguous) yet verified at runtime; install log records no differing resolution.

### 9. Abiotic Factor 427410 (Unreal Engine)
expected: launch through `GameLibSteamBridge-427410`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 427410; UE rule: Saved log free of `SteamAPI failed to initialize` plus `Client API initialized 1`, or a CALL line; record install-vs-census version resolution (D-53-12); In-Game never counts
result: issue — Unreal Engine. HELLO y (1), CALL 5 (STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed, SteamFriends017.GetPersonaName, SteamUser023.BLoggedOn/GetSteamID, SteamUtils010.GetAppID), NOVER 0. Current Saved log is clean (`Loading Steam SDK 1.57`, `Steam SDK Loaded!`, no `SteamAPI failed to initialize`); only warnings `LogOnlineIdentity: STEAM: Failed to acquire Steam auth session ticket for 0` (21:34:56 and 21:35:57). Census says `init-failed (UE SteamAPI init failed)` wrongly: findUnrealSavedLogs reads the stale AbioticFactor-backup-2026.10.23-21.35.54.log from the previous session, whose failure markers win. Operator: "friends works, hug at loading screen". Hang traced to the auth-ticket warning (ISteamUser GetAuthSessionTicket path, not a logged CALL; Steam's real ticket is not a constant, so forward it through wire-policy.json rather than a local constant) - hypothesis, to confirm in a gap plan. D-53-12: census SteamClient017/020, SteamGameServer014/015, SteamUser021/023 ambiguous.

### 10. Colony Ship 648410 (engine per census class)
expected: launch through `GameLibSteamBridge-648410`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 648410; apply the engine rule for its census class (Unity: clean Player.log, no CALL needed; UE: Saved log marker or CALL; Godot/GameMaker: a CALL line); record the class used; In-Game never counts
result: pass — Unreal Engine (ColonyShipGame layout). HELLO y (1), CALL 2 (SteamUser023.BLoggedOn, SteamUtils010.GetAppID), NOVER 0; census `verified` (game-originated CALL). Operator: "full pass".

### 11. Remaining 51-29 sample: Raft 648800, 206060, 230070, 411300, Grim Dawn 219990, Unclaimed World 284100
expected: each of the six launched through its own `GameLibSteamBridge-<appid>` bottle, scored on its own line with its engine class and rule (HELLO required; Unity clean Player.log; UE marker or CALL; Godot/GameMaker CALL); Grim Dawn 219990 and Unclaimed World 284100 are scored with their class and kept in the denominator even if they fail; In-Game never counts
result: issue — 1 of 6 pass. Raft 648800 (Unity, SteamStub DRM): HELLO y, CALL 0, FWD CreateInterface SteamClient017/014 only, census `unverified (no game log found)`; bridge-notice steamstub-forwarded:launch-check-unsatisfiable; operator: friends updates, DRM message, "Application load error" - issue (DRM). Avernum 6 206060 (x86): HELLO y, CALL 0, census `unverified (no game-originated call)`; operator "full pass" but not verifiable - issue (unverified). Age of Decadence 230070: HELLO y, CALL 2 (SteamUser019.BLoggedOn, SteamUtils008.GetAppID), census `verified`, operator "full pass" - pass. ELEX 411300 (known-bad does-not-run): HELLO y, CALL 1 (STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp), census `verified` (game-originated CALL) but operator "game hangs when loading" and placeShimForGame recorded coverage miss SteamGameServer012 - issue (hang; the census counts it verified). Grim Dawn 219990 (SteamStub DRM): HELLO y, CALL 0, FWD CreateInterface only, census `unverified (no game-originated call)`; operator: DRM message, "application failed error" - issue (DRM), kept in the denominator. Unclaimed World 284100 (MonoGame, CSteamworks64): HELLO n, census `unverified (no HELLO)`; Wine crash `unimplemented function steam_api64.dll.SteamAPI_InitSafe called in 64-bit code`, backtrace ntdll+0x68870 then csteamworks64+0x17da - issue (missing export SteamAPI_InitSafe; old-SDK todo), kept in the denominator.

### 12. Trace lines
expected: gamelib.log holds at least one CALL line from a game process (not only HELLO); any NOVER lines are listed with their versions (`flat lookup ver=<v> served=no`) so uncovered versions are named
result: pass — CALL lines from game processes present for 1603180 (10), 1363080 (7), 427410 (5), 648410 (2), 230070 (2), 411300 (1). Distinct methods seen: SteamUtils010.GetAppID, SteamUtils008.GetAppID, SteamUser023.GetSteamID/BLoggedOn, SteamUser019.BLoggedOn, SteamFriends017.GetPersonaName, STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed/BIsSubscribedApp/GetCurrentGameLanguage, STEAMUSERSTATS_INTERFACE_VERSION012/013 achievements and stats. NOVER lines (5, all `flat lookup ver=STEAMSCREENSHOTS_INTERFACE_VERSION003 served=no`): 1691190 x1, 1167950 x1, 1284190 x1, 1782460 x2. No other NOVER versions.

### 13. Census majority
expected: `pnpm bridge-census` prints `V of N Steamworks-using rows verified (majority: yes)` over all Steamworks-using rows, run after the whole sample in the same session; record V, N and the rows still not verified with their Evidence reason
result: issue — census printed `6 of 18 Steamworks-using rows verified (majority: no)`. Verified: 1284190, 1363080, 1603180, 230070, 411300, 648410. Not verified: 1119730 (no HELLO), 1167950/1691190/1782460 (init-failed SteamAPI_Init, STEAMSCREENSHOTS_INTERFACE_VERSION003), 427410 (init-failed, census misreads stale backup UE log; this session's evidence is clean), 206060 and 219990 (no game-originated call), 284100 and 3410180 (no HELLO), 648800 (no game log found), 200510 and 206020 (no per-game bridge bottle). Corrected for the 427410 stale-log defect the count would be 7 of 18, still not a majority (needs 10).

## Post-init fault rule (D-53-06)

When a title faults after init, record `issue — <Interface.Method traced in the log>` with the log
line, and say whether Steam's real value on a Mac is a constant (then the fix is a local constant) or
not (then forward it through `wire-policy.json`). The fix is planned as a gap plan from these results,
not improvised during the run.

## Summary

total: 13
pass: 5
issue: 8
pending: 0
skipped: 0
blocked: 0

## Operator outcomes (verbatim, 53-09 Task 2)

GameLib ran as the bare `src-tauri/target/debug/gamelib-shell` binary (pid 19000), same bundled sidecar. "friends" = Steam friends list showing the operator as playing; it is not bridge evidence.

1. 1691190 Rogue Waters: "logged out of steam friends, hung at usual spot (load screen)"
2. 1167950 Vampire's Fall: "reaches menu, shows me in friends playing vampire's fall"
3. 1284190 Planet Crafter: "reached menu, friends worked"
4. 1782460 Hell Clock: "full pass"
5. 1603180 Mining Mechs: "friends updated. error on launch: Win32 function failed: HRESULT: 0x80070057 - Invalid parameter. Call: GR_D3D_Device->CheckMultisampleQualityLevels at line 1782 in file \Graphics_DisplayM.cpp >> however after clicking through errors game works!! went past menu and played for a bit"
6. 3410180 Overlooting: "friends works, error:" Wine crash "Unhandled exception: page fault on read access to 0x0000000000000000 in 64-bit code (0000000000000000)"; rip=0; first stack slot 0x00000001400607f1 inside overlooting.exe (PE 140000000-145e5a000); loaded steam_api64 (PE 6ffffce30000-6ffffce9c000) and libgodotsteam.windows.template_release.x86_64 (PE 6ffffceb0000-6ffffd0a6000); backtrace `=>0 0000000000000000 no code accessible`; wine-11.0-8726-g2e2f5fca349
7. 1119730 Ranch Simulator: "play button changees breifly, but game fails to launch. while button is changed to playing state freind updates to say playing ranch simulator"
8. 1363080 Manor Lords: "full pass"
9. 427410 Abiotic Factor: "friends works, hug at loading screen"
10. 648410 Colony Ship: "full pass"
11a. 648800 Raft: "friends updates, drm message shows, error message: Application load error."
11b. 206060 Avernum 6: "full pass"
11c. 230070 The Age of Decadence: "full pass"
11d. 411300 ELEX: "friends works, game hangs when loading"
11e. 219990 Grim Dawn: "friends works, DRM message in app, error: application failed error"
11f. 284100 Unclaimed World: "freinds works, error:" Wine crash "Unhandled exception: unimplemented function steam_api64.dll.SteamAPI_InitSafe called in 64-bit code (0x006ffffffa8870)"; backtrace 0 ntdll+0x68870, 1 csteamworks64 (+0x17da); modules unclaimedworld, steamworks.net, monogame.framework, sharpdx.*, mscorlib (Wine Mono)

## Gaps

Each entry feeds `/gsd-plan-phase 53 --gaps`. Nothing was patched during the run (D-53-06).

- truth: Unity titles reach `SteamAPI_Init` success (items 1, 2, 4). status: failed. evidence: Player.log `SteamAPI_Init() failed` for 1691190, 1167950, 1782460 while 1284190 (same NOVER) does not fail; all four log `NOVER flat lookup ver=STEAMSCREENSHOTS_INTERFACE_VERSION003 served=no`; 1691190 also stubs SteamUtils (SteamUtils009 miss) and SteamController/SteamController006. fix: serve STEAMSCREENSHOTS_INTERFACE_VERSION003 (add the version to the flat lookup/gen-vtables), add SteamUtils009, SteamController006; re-run the three titles. Closes the flat-API todo only when items 1-3 pass.
- truth: Overlooting 3410180 reaches the shim (item 6). status: failed. evidence: no HELLO/CALL/NOVER; NULL function-pointer call from overlooting.exe (return address 0x1400607f1), godot logs 0 bytes; libgodotsteam imports are all exported by the shim. fix: not traceable to a Steam method from logs; investigate as a Godot/Wine start-up fault (GDExtension or graphics function pointer) before touching the shim; capture the wine +loaddll,+err trace.
- truth: Ranch Simulator 1119730 starts (item 7). status: failed. evidence: Shipping exe exits <1 s with code 0x35 before any UE log, no HELLO. fix: capture wine +loaddll,+err trace to find the load failure; confirm whether the .gamelib-orig/Steamv161 placement path is the one UE loads.
- truth: Abiotic Factor 427410 loads past the loading screen (item 9). status: failed. evidence: clean Saved log, 5 CALLs, but `Failed to acquire Steam auth session ticket for 0` twice and a hang. fix: trace ISteamUser GetAuthSessionTicket (not a constant; forward through wire-policy.json).
- truth: census scores only this session's logs (item 13). status: failed. evidence: findUnrealSavedLogs reads `*-backup-*.log` files, so 427410 scores init-failed from the 2026-10-23 backup; findAppLogs also reads rotated gamelib.log siblings and Unity `Player-prev.log` for 1782460. fix: skip `*-backup-*` and `-prev` logs (or take only the newest file) in census log discovery.
- truth: SteamStub DRM titles (Raft 648800, Grim Dawn 219990) start (item 11). status: failed. evidence: steamstub-forwarded:launch-check-unsatisfiable, FWD CreateInterface only, "Application load error" / "application failed". fix: stays DRM-limited; counted in the denominator, no reroute to bottled Steam.
- truth: ELEX 411300 loads (item 11). status: failed. evidence: census class known-bad (does-not-run), shim coverage miss SteamGameServer012, hang at load after BIsSubscribedApp. fix: add SteamGameServer012 coverage and re-test; census counts it verified on a single CALL.
- truth: Unclaimed World 284100 reaches HELLO (item 11). status: failed. evidence: `unimplemented function steam_api64.dll.SteamAPI_InitSafe`. fix: old-SDK todo steps 1, 2, 4, 5 (export SteamAPI_InitSafe and the other 11 missing CSteamworks exports; interface versions).
- truth: Avernum 6 206060 has a game-originated call (item 11). status: unverified. evidence: HELLO only, operator full pass. fix: x86 shim call tracing or accept as unverifiable.

## Gap re-test (53-14)

### 14. Abiotic Factor 427410 auth ticket forward (53-14)
expected: HELLO for 427410; CALL SteamUser023.GetAuthSessionTicket in this session's gamelib.log; current Saved log free of "Failed to acquire Steam auth session ticket"; the game passes loading (operator)
result: issue — ticket path fixed, hang survives. gamelib.log (12:11-12:16): `HELLO  shim attached appid=427410` (12:11:45), `CALL   SteamUser023.GetAuthSessionTicket` (12:12:03), plus BIsSubscribed, GetAppID, GetSteamID, GetPersonaName, BLoggedOn. Current Saved log has 0 occurrences of "Failed to acquire Steam auth session ticket" and three `LogOnlineIdentity: STEAM: Obtained steam authticket` (23.12.03, 23.12.45, 23.16.04 log clock). Bottle shim 497664 bytes (the built shim; game's own 295336-byte original kept as .gamelib-orig). Operator verbatim: "still hangs at loading". Last Steam/Online lines: `LogEOSSDK: Warning: LogEOSEcom: Purchase flow is disabled due to overlay setup failure (EOS_NotConfigured).` (23.12.00); `LogOnlineIdentity: STEAM: Obtained steam authticket` (23.12.03); `LogEOSSDK: Warning: LogEOSRTC: TickTracker Tick is delayed ... TimePeriod=[10.014727s]` (23.12.09); `Obtained steam authticket` (23.12.45); `Obtained steam authticket` (23.16.04). Not verified for the bridge: a hang with a clean Steam-init log is not a pass; In-Game does not count.
