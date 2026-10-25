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

total: 49
pass: 23
issue: 26
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
- truth: Avernum 6 206060 has a game-originated call (item 11). status: unverified. evidence: HELLO only, operator full pass; 53-20 shows the exe imports only `SteamAPI_Init` and `SteamAPI_Shutdown` from steam_api.dll. fix (user decision 2026-10-25, D-53-15): the shim logs the game's own `SteamAPI_Init` result, and the census counts HELLO + a logged init success for init-only rows.

## Gap re-test (53-14)

### 14. Abiotic Factor 427410 auth ticket forward (53-14)
expected: HELLO for 427410; CALL SteamUser023.GetAuthSessionTicket in this session's gamelib.log; current Saved log free of "Failed to acquire Steam auth session ticket"; the game passes loading (operator)
result: issue — ticket path fixed, hang survives. gamelib.log (12:11-12:16): `HELLO  shim attached appid=427410` (12:11:45), `CALL   SteamUser023.GetAuthSessionTicket` (12:12:03), plus BIsSubscribed, GetAppID, GetSteamID, GetPersonaName, BLoggedOn. Current Saved log has 0 occurrences of "Failed to acquire Steam auth session ticket" and three `LogOnlineIdentity: STEAM: Obtained steam authticket` (23.12.03, 23.12.45, 23.16.04 log clock). Bottle shim 497664 bytes (the built shim; game's own 295336-byte original kept as .gamelib-orig). Operator verbatim: "still hangs at loading". Last Steam/Online lines: `LogEOSSDK: Warning: LogEOSEcom: Purchase flow is disabled due to overlay setup failure (EOS_NotConfigured).` (23.12.00); `LogOnlineIdentity: STEAM: Obtained steam authticket` (23.12.03); `LogEOSSDK: Warning: LogEOSRTC: TickTracker Tick is delayed ... TimePeriod=[10.014727s]` (23.12.09); `Obtained steam authticket` (23.12.45); `Obtained steam authticket` (23.16.04). Not verified for the bridge: a hang with a clean Steam-init log is not a pass; In-Game does not count.

### 15. Rogue Waters 1691190 re-trace (53-15)
expected: Player.log shows Steam API initialized with no `SteamAPI_Init() failed`/NOVER, HELLO plus game-originated CALLs in gamelib.log, and the game passes the load screen where it used to hang (operator)
result: pass — operator verbatim: "rogue waters runs". Player.log `Steam API initialized`, `Steam AppId: 1691190`; gamelib.log HELLO 23:33:20Z, CALL SteamUtils010.GetAppID, SteamUser021.GetSteamID, STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage/BIsDlcInstalled, STEAMUSERSTATS_INTERFACE_VERSION012.StoreStats; zero NOVER. Meets the strict bridge-verified criterion. Disposition: fixed by 53-12 (53-DIAGNOSIS 1691190).

### 16. Overlooting 3410180 diagnosis (53-15)
expected: the rip=0 fault has a named cause and a shim-involved answer; the operator re-run says whether it still crashes
result: blocked — operator verbatim: "other two do not [run], think they have not changed". Cause: Godot 4.4 calls an unchecked NULL NvAPI pointer (`callq *%r15` at 0x1400607ee, return 0x1400607f1) because CrossOver's builtin nvapi64.dll cannot load its nvapi.dll backend (c0000135). Reproduces with the shim removed, so the shim is not involved. Bottle runtime gap, not bridge. Disposition: todo — 2026-10-25-overlooting-godot-null-call-before-shim.md. Scanner side fix 0a933329a (PE sections sized by VirtualSize).

### 17. Ranch Simulator 1119730 diagnosis (53-15)
expected: the exit code 0x35 before HELLO has a named cause and a shim-involved answer; the operator re-run says whether it launches
result: blocked — operator verbatim: "other two do not [run], think they have not changed". Cause: SteamStub `.bind` section (0x39248 bytes) self-terminates the Shipping exe with exit 53 before steam_api64.dll loads; identical with the original dll, so the shim is not involved. Phase 52 scope, not rerouted to bottled Steam. Disposition: todo — appended to 2026-10-24-steamstub-launch-check-static-re-decision.md.

## Gap closure re-run

Authored and desk-gated by 53-16 on HEAD `c468b5816` (2026-10-25). Results scored in 53-16 Task 3.

### Desk gate (53-16)

| Command | Outcome |
|---|---|
| `pnpm gen-vtables` then `git diff --exit-code` on generated paths | PASS, no diff ("58 interfaces, 2093 vtable slots, 68 flat exports, 1012 steam_api64 exports") |
| `pnpm codecheck` | PASS |
| `pnpm test:ci` | 4 suites / 6 tests failed, exactly the pre-existing suites named in 53-08 (genI18nGateScope, machineFillGamelib, testContainment, findDeadcode); 582 suites passed. No other failure. |
| `pnpm build-steam-bridge` | PASS (exit 0) |
| `objdump -p public/bin/arm64/darwin/steam_api64.dll`, count of `SteamAPI_ISteam` | 851 (>= 400) |
| exports `SteamAPI_ISteamClient_GetISteamScreenshots`, `SteamAPI_ISteamInput_GetAnalogActionData` | both present (grep count 2) |
| `stat -f %z` | steam_api64.dll = 497664, steam_api.dll = 290304, steam-bridge-helper = 153376. SHIM64 for the preflight = 497664. |
| `graphify update .` | run |

### Preconditions (53-16)

Packaged build only via `pnpm tauri:dev:packaged` (never plain tauri:dev). The `gamelib-sidecar` mtime must be newer than HEAD; no gamelib-shell or steam-bridge-helper running at start; the whole sample in ONE session. Every sampled bottle's shim size must equal 497664.

Census evidence rule as tightened by 53-11: a row is verified only with HELLO for the appid plus engine evidence (Unity: clean current Player.log with no EntryPointNotFoundException and no SteamAPI_Init failure; UE: current Saved log marker, stale backup logs ignored; Godot/GameMaker: a CALL), or at least 2 distinct game-originated CALLs including identity. A NOVER means init-failed. A known-bad title is never verified. In-Game in Mac Steam and friends presence never count. No game log and no qualifying CALLs means unverified. No title is rerouted to bottled Steam and the criterion is not relaxed.

Operator and census results go in Task 3; items below start pending.

### 18. Rogue Waters 1691190 (Unity)
expected: launch through `GameLibSteamBridge-1691190`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 1691190; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. Unity; HELLO y; CALLs BIsDlcInstalled, GetCurrentGameLanguage, StoreStats, SteamUser021.GetSteamID, SteamUtils010.GetAppID; NOVER none; census Evidence `verified`, my reading of the logs agrees. Operator: reached menu.

### 19. Vampire's Fall 1167950 (Unity)
expected: launch through `GameLibSteamBridge-1167950`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 1167950; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. Unity; HELLO y; CALL SteamFriends017.GetPersonaName; NOVER none; census Evidence `verified` (Unity engine rule: HELLO plus clean current Player.log), my reading agrees. Operator: reached menu.

### 20. Planet Crafter 1284190 (Unity)
expected: launch through `GameLibSteamBridge-1284190`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 1284190; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. Unity; HELLO y (two launches, 12:46:03 and 12:47:03); CALL STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled; NOVER none, so Steamworks.NET init did not fail; census Evidence `verified`, agrees. Operator: reached menu.

### 21. Hell Clock 1782460 (Unity)
expected: launch through `GameLibSteamBridge-1782460`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 1782460; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. Unity; HELLO y; CALL STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled; NOVER none; census Evidence `verified`, agrees. Operator: reached menu.

### 22. Mining Mechs 1603180 (engine per census class)
expected: launch through `GameLibSteamBridge-1603180`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 1603180; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. HELLO y; CALLs BLoggedOn, GetSteamID (identity), GetPersonaName, BIsSubscribedApp, GetCurrentGameLanguage (5 distinct); NOVER none; census Evidence `verified`, agrees. Operator: Win32 error dialog 4 times, game works once clicked through. Not a bridge-evidence failure; the dialogs are a separate defect, filed as a todo.

### 23. Overlooting 3410180 (Godot per census)
expected: launch through `GameLibSteamBridge-3410180`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 3410180; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue. Godot; HELLO n (helper LISTEN and INIT ok, shim never attached); no CALLs; NOVER none; game process gone after 23s; census Evidence `unverified (no HELLO)`. Operator: error on launch, crash out. Pre-HELLO fault diagnosed in 53-15 and routed out of scope; unchanged.

### 24. Ranch Simulator 1119730 (Unreal Engine)
expected: launch through `GameLibSteamBridge-1119730`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 1119730; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue. UE; HELLO n (helper LISTEN and INIT ok, shim never attached); no CALLs; NOVER none; game process gone after 3s; census Evidence `unverified (no HELLO)`. Operator: fail to launch. Pre-HELLO fault diagnosed in 53-15 and routed out of scope; unchanged.

### 25. Manor Lords 1363080 (Unreal Engine)
expected: launch through `GameLibSteamBridge-1363080`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 1363080; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. UE; HELLO y; CALLs BIsSubscribed, GetAchievementAndUnlockTime, GetAchievementDisplayAttribute, SteamUser023.GetSteamID, SteamUtils010.GetAppID; NOVER none; census Evidence `verified`, agrees. Operator: reached menu.

### 26. Abiotic Factor 427410 (Unreal Engine)
expected: launch through `GameLibSteamBridge-427410`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 427410; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. UE; HELLO y; CALLs BIsSubscribed, GetPersonaName, BLoggedOn, GetAuthSessionTicket, GetSteamID, SteamUtils010.GetAppID; NOVER none; census Evidence `verified`, agrees. Operator: hung in loading screen. The bridge evidence is clean; the hang is already tracked in todo 2026-10-25-abiotic-factor-loading-hang-after-auth-ticket.

### 27. Colony Ship 648410 (Unreal Engine)
expected: launch through `GameLibSteamBridge-648410`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 648410; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. UE; HELLO y; CALLs SteamUser023.BLoggedOn, SteamUtils010.GetAppID; NOVER none; census Evidence `verified`, agrees. Operator: reached menu.

### 28. Raft 648800 (Unity, SteamStub DRM)
expected: launch through `GameLibSteamBridge-648800`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 648800; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue. Unity, SteamStub; HELLO y; no CALLs; NOVER none; census Evidence `unverified (no game log found)`. Operator: DRM message, app load error. SteamStub DRM (Phase 52); kept in the denominator.

### 29. Avernum 6 206060 (x86)
expected: launch through `GameLibSteamBridge-206060`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 206060; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue. x86; HELLO y; no CALLs; NOVER none; census Evidence `unverified (no game-originated call)`. Operator: reached menu. Reaching the menu is not evidence; the census and the log agree. Kept in the denominator.

### 30. Age of Decadence 230070 (engine per census class)
expected: launch through `GameLibSteamBridge-230070`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 230070; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass. HELLO y; CALLs SteamUser019.BLoggedOn, SteamUtils008.GetAppID; NOVER none; census Evidence `verified`, agrees. Operator: reached menu.

### 31. ELEX 411300 (known-bad)
expected: launch through `GameLibSteamBridge-411300`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 411300; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue. Known-bad (does-not-run); HELLO y; one CALL (STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp); NOVER none; census Evidence `unverified (1 game call; needs 2 incl. identity)`. Operator: hangs in loading screen. A known-bad row is never verified.

### 32. Grim Dawn 219990 (SteamStub DRM)
expected: launch through `GameLibSteamBridge-219990`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 219990; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue. SteamStub; HELLO y; no CALLs (only FWD CreateInterface SteamClient014/017); NOVER none; census Evidence `unverified (no game-originated call)`. Operator: DRM message, app load error. Phase 52; kept in the denominator.

### 33. Unclaimed World 284100 (MonoGame, old SDK)
expected: launch through `GameLibSteamBridge-284100`; bottle shim size equals the built steam_api64.dll size (497664); HELLO for appid 284100; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue. MonoGame, old SDK via CSteamworks.dll; HELLO n; no CALLs; census Evidence `unverified (no HELLO)`. Operator: error on load, encountered a serious problem. Old-SDK todo unchanged; kept in the denominator.

### 34. Trace lines (53-16)
expected: every distinct CALL method and every NOVER version (`flat lookup ver=<v> served=no`) from this session's gamelib.log is listed
result: pass. Distinct CALL methods this session: STEAMAPPS_INTERFACE_VERSION008.{BIsDlcInstalled, BIsSubscribed, BIsSubscribedApp, GetCurrentGameLanguage}, STEAMUSERSTATS_INTERFACE_VERSION012.{StoreStats, GetAchievementAndUnlockTime, GetAchievementDisplayAttribute}, SteamUser019.BLoggedOn, SteamUser021.GetSteamID, SteamUser023.{BLoggedOn, GetSteamID, GetAuthSessionTicket}, SteamUtils008.GetAppID, SteamUtils010.GetAppID, SteamFriends017.GetPersonaName. NOVER versions (`served=no`): none seen.

### 35. Census majority (53-16)
expected: `pnpm bridge-census` run after the session prints `V of 18 Steamworks-using rows verified (majority: yes)` with V >= 10; the majority line is quoted verbatim with every non-verified row's Evidence reason
result: issue -- done-when NOT met (9 of 18). Majority line verbatim: `9 of 18 Steamworks-using rows verified (majority: no)`. V=9, N=18. Verified appids: 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410. Non-verified rows and Evidence reasons: 200510 and 206020 (unverified, no per-game bridge bottle); 1119730 (unverified, no HELLO); 3410180 (unverified, no HELLO); 284100 (unverified, no HELLO); 206060 (unverified, no game-originated call); 219990 (unverified, no game-originated call); 648800 (unverified, no game log found); 411300 (unverified, 1 game call; needs 2 incl. identity).

### Recorded at launch (53-16 Task 2)

- HEAD `9cd98f7b6` (committed 2026-10-25 12:40:44 +1300), code HEAD `c468b5816`.
- `pnpm tauri:dev:packaged` exited 1 only at updater signing (no `TAURI_SIGNING_PRIVATE_KEY`); bundle produced.
- `gamelib-sidecar` mtime 2026-10-25 12:40:58, newer than HEAD. `steam_api64.dll` 497664.
- No gamelib-shell or steam-bridge-helper running beforehand. Launched `target/debug/gamelib-shell` detached, pid 78810, log `/private/tmp/claude-501/gamelib-53-16.log`.
- `~/Library/Logs/GameLib` at launch: gamelib-shell.log, gamelib.log, gamelib.log.51-29-batch0-215927, gamelib.log.old, gamelib.log.pre-51-27-20261023-073351, gamelib.log.pre-51-28-20261023-194304, gamelib.log.pre-51-29-20261023-214423, runners/.

## Operator outcomes (53-16)

Recorded verbatim from the operator, 2026-10-25. Bridge evidence is scored from the logs, not from these lines.

1. Rogue Waters (1691190) - reached menu
2. Vampire's Fall (1167950) - reached menu
3. Planet Crafter (1284190) - reached menu
4. Hell Clock (1782460) - reached menu
5. Mining Mechs (1603180) - Win32 error (4 times), gme works once clicked through
6. Overlooting (3410180) - error on launch, crash out
7. Ranch Simulator (1119730) - fail to launch
8. Manor Lords (1363080) - reached menu
9. Abiotic Factor (427410) - hung in loading screen.
10. Colony Ship (648410) - reached menu
11. Raft (648800) - DRM message, app load error
12. Avernum 6 (206060) - reach menu
13. Age of Decadence (230070) - reach menu
14. ELEX (411300) - hangs in loading screen
15. Grim Dawn (219990) - DRM message, app load error
16. Unclaimed World (284100)- error on load, ... encounded a serious problem

### Done-when (53-16)

NOT MET. `9 of 18 Steamworks-using rows verified (majority: no)`; the bar is 10 of 18, so the result is one short and is reported as below 10. Against the stated ceiling, all nine fixable rows verified (1691190, 1167950, 1284190, 1782460, 1603180, 1363080, 427410, 648410, 230070). None of the three routed-or-diagnosed rows verified: Overlooting 3410180 and Ranch Simulator 1119730 still never send HELLO (the 53-15 pre-HELLO faults were out of scope and remain), and Avernum 6 206060 sends HELLO but no game-originated call. The other rows stay unverified for their stated reasons: Raft and Grim Dawn (SteamStub DRM, Phase 52), Unclaimed World (old SDK, no HELLO), ELEX (known-bad cap), 200510 and 206020 (no per-game bridge bottle).

Delta: 6 of 18 at 53-09 (live) and 5 of 18 at 53-11 (honest desk count) to 9 of 18 now. Rows gained since 53-11: 1691190, 1167950, 1284190 and 1782460 (Unity flat-API fix, 53-12: HELLO plus a clean current Player.log, no EntryPointNotFoundException), 1603180, 1363080 (UE5 and missing-version coverage), 427410 (stale backup log no longer read, and now live CALLs). Changes from the tightened criterion (downward): ELEX no longer counts (one CALL, known-bad); no row was added by relaxing anything. Changes from fixes (upward): the Unity flat-API export fix and the interface-version coverage. The criterion was not relaxed and no title was rerouted to bottled Steam.

Next step: `/gsd-plan-phase 53 --gaps` again. The nearest lever is one of Avernum 6, Overlooting or Ranch Simulator; 10 of 18 needs any one of them to verify.

## Gap closure re-run (53-20)

Authored and desk-gated by 53-20 on HEAD `173388fe3` (2026-10-25), which carries 53-17 (CR-01 generator fix), 53-18 (anchored census) and 53-19 (Overlooting `nvapi64` per-exe override). Results are scored in 53-20 Task 3.

### Desk gate (53-20)

| Command | Outcome |
|---|---|
| `pnpm gen-vtables` then `git diff --exit-code` on generated paths | PASS, no diff ("58 interfaces, 2093 vtable slots, 68 flat exports, 1012 steam_api64 exports") |
| `pnpm codecheck` | PASS |
| `pnpm test:ci` | 4 suites / 6 tests failed, exactly the pre-existing suites (testContainment, findDeadcode, genI18nGateScope, machineFillGamelib); 583 suites passed. No other failure. |
| `pnpm build-steam-bridge` | PASS (compile gates x64, x86 and steamclient64 passed) |
| `objdump -p public/bin/arm64/darwin/steam_api64.dll`, count of `SteamAPI_ISteam` | 851 (>= 400) |
| export `SteamAPI_ISteamGameServer_GetPublicIP` | present (grep count 1) |
| `stat -f %z` | steam_api64.dll = 497664, steam_api.dll = 290304, steam-bridge-helper = 153424. SHIM64 for the preflight = 497664. |
| `pnpm bridge-census` before the session (53-18 anchoring) | `9 of 18 Steamworks-using rows verified (majority: no)` |
| `graphify update .` | run |

### Preconditions (53-20)

Packaged build only via `pnpm tauri:dev:packaged` (never plain tauri:dev). The `gamelib-sidecar` mtime must be newer than HEAD (tauri dev does not rebuild the sidecar); no gamelib-shell or steam-bridge-helper running at start; the whole sample in ONE session; Overlooting first. Every sampled bottle's shim size must equal 497664 (x86 bottles: 290304).

Criterion, unchanged: a row is verified only with HELLO for the appid plus engine evidence (Unity: clean current Player.log with no EntryPointNotFoundException and no SteamAPI_Init failure; UE: current Saved log marker, stale backup logs ignored; Godot/GameMaker: a CALL), or at least 2 distinct game-originated CALLs including an identity call (`SteamUser*.GetSteamID|BLoggedOn` or `SteamFriends*.GetPersonaName`). A NOVER means init-failed. A known-bad title is never verified. In-Game in Mac Steam and friends presence never count. No game log and no qualifying CALLs means unverified. No title is rerouted to bottled Steam and the criterion is not relaxed.

### Ceiling (53-20)

The bar is 10 of 18. 53-16 verified 9 rows: 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410. Only Overlooting 3410180 (53-19 override) can add the tenth, so the result is 10 only if Overlooting verifies AND all nine stay verified.

Not reachable in this phase: Avernum 6 206060 and Avernum 4 206020 import only `SteamAPI_Init` and `SteamAPI_Shutdown` and write no game log, so they cannot meet D-53-13 by construction. Ranch Simulator 1119730 is SteamStub `.bind` (Phase 52). Raft 648800 and Grim Dawn 219990 are SteamStub. ELEX 411300 and XCOM 200510 are known-bad. Unclaimed World 284100 needs old-SDK exports (deferred).

Avernum 6 import evidence (`objdump -p` on `Avernum 6.exe` in `GameLibSteamBridge-206060`, `drive_c/Program Files (x86)/Steam/steamapps/common/Avernum 6/`), verbatim:

```
    DLL Name: steam_api.dll
    Hint/Ord  Name
          15  SteamAPI_Shutdown
           5  SteamAPI_Init
```

Operator and census results go in Task 3; items below start pending.

### 36. Overlooting 3410180 (Godot, nvapi64 override)
expected: the bottle's DllOverrides shows `nvapi64` set by 53-19 (per-exe, Overlooting.exe); no `page fault on read access to 0x0` and godot.log advances past the driver lines; launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (HELLO, 1 game call; census `unverified (1 game call; needs 2 incl. identity)`). Operator: `3410180 - reached menu`. The NvAPI crash is gone: 53-19's override applied (`reg add ...\\Overlooting.exe\\DllOverrides /v nvapi64 /t REG_SZ /d  /f` logged 14:02:46; bottle user.reg line 723 `"nvapi64"=""`), no `page fault on read access to 0x0` anywhere in gamelib.log, and godot.log advances past the driver lines (`OpenGL API 4.1 Metal ... Using Device: Apple`, then the script's own `ERROR: Steam is running!` and `Usernam: `). Shim 497664 = built dll. HELLO 14:03:00, then one CALL, `SteamUser023.GetSteamID` (an identity call), no NOVER, no `flat lookup` line in the session. Process gone after 11s of play (the operator quit). The rule needs 2 distinct game-originated CALLs; there is 1, so it stays unverified and in the denominator. Next-lever input for a further round: CALL list = [SteamUser023.GetSteamID]; NOVER versions = none this session; whether the persisted scan-miss versions (STEAMUGC_INTERFACE_VERSION021, STEAMREMOTEPLAY_INTERFACE_VERSION003, STEAMTIMELINE_INTERFACE_V004) were requested: no evidence either way, the session logged no NOVER or flat-lookup line; godot.log shows `Usernam: ` with an empty name after `Steam is running!`, while no SteamFriends GetPersonaName CALL was traced, so the name lookup either went through an untraced path or returned empty (unproven).

### 37. Rogue Waters 1691190 (Unity)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass (census verified). Operator: `1691190 - reached menu`. HELLO 14:03:53; 5 distinct CALLs (SteamUtils010.GetAppID, SteamUser021.GetSteamID identity, STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage / BIsDlcInstalled, STEAMUSERSTATS_INTERFACE_VERSION012.StoreStats); no NOVER; shim 497664. Unity, census Evidence `verified`.

### 38. Vampire's Fall 1167950 (Unity)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass (census verified). Operator: `1167950 - reached menu `. HELLO 14:04:50; CALL SteamFriends017.GetPersonaName (identity); Unity Player.log clean per the census; no NOVER; shim 497664.

### 39. Planet Crafter 1284190 (Unity)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (census `verified`, but the operator reports a regression, so the row is scored issue on the experience). Operator: `1284190 - menu disappered (3 times, note have seen this once before, but just quit game and tried again did not repeat 3 times in a row)`. Bridge evidence: four launches (14:05:53, 14:07:31, 14:08:00, 14:08:24), each HELLO plus one CALL STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled, no NOVER, shim 497664; the census still reads verified. Every stop in gamelib.log is an operator `SteamGame.stop` (14:07:25, 14:07:55, 14:08:20, 14:08:41); the bottleProcessMonitor logged no crash exit. Concrete lead: the two retained Unity logs (Player-prev.log = launch 3, Player.log = launch 4) each end in an exception thrown by the game's own `SpaceCraft.SteamRichPresence.JoinFriend ()` -> `SavedDataHandler.ParseConnectionString`: launch 3 `FormatException: Input string was not in a correct format`, launch 4 `ArgumentOutOfRangeException: Length cannot be less than zero ... String.Substring`. In the shim, `ISteamFriends::GetFriendRichPresence` and `ISteamApps::GetLaunchQueryParam` are both stubs that return an empty string (steam_api_shim.c slots 43 and 21). That an empty rich-presence/connect value feeds the exception is a hypothesis, not proven; the link to the vanishing menu is also unproven. Launches 1-2 logs were overwritten, so only launches 3 and 4 carry the exception. Todo created: 2026-10-25-planet-crafter-joinfriend-exception-menu-disappears.md.

### 40. Hell Clock 1782460 (Unity)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass (census verified). Operator: `1782460 - reached menu`. HELLO 14:10:04; CALL STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled; engine evidence per the census (Unity Player.log clean); no NOVER; shim 497664.

### 41. Mining Mechs 1603180 (engine per census class)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (census verified; the operator saw error messages). Operator: `1603180 - reached menu (with error messages)`. HELLO 14:11:41; 5 distinct CALLs incl. identity (SteamUser023.BLoggedOn / GetSteamID, SteamFriends017.GetPersonaName, STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage / BIsSubscribedApp); no NOVER; shim 497664. gamelib.log records no error for it, there is no Unity Player.log in its bottle, and the dialog text was not typed by the operator, so the cause is not identified. This is the same symptom as the existing todo 2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md (53-16 item 22); evidence appended there. The bridge criterion is met, so the row stays verified in the census.

### 42. Ranch Simulator 1119730 (Unreal Engine, SteamStub)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (census `unverified (no HELLO)`; SteamStub, Phase 52). Operator: `1119730 - failed to launch`. The helper reached INIT and the shim (497664) was placed at Ranch_Simulator/Binaries/Win64, but the Shipping process was gone after 3s of play (14:12:35 to 14:12:38) with no HELLO and no CALL, and raiseWineGameWindow found no process. Consistent with the SteamStub `.bind` wrapper failing before the shim is loaded; the logs do not show the wrapper's own message, so the exact failure is inferred from the class, not observed. Not reachable in this phase, stays in the denominator, not rerouted to bottled Steam.

### 43. Manor Lords 1363080 (Unreal Engine)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass (census verified). Operator: `1363080 - reached menu`. HELLO 14:13:39; 5 distinct CALLs incl. SteamUser023.GetSteamID; UE current Saved log marker per the census; no NOVER; shim 497664.

### 44. Abiotic Factor 427410 (Unreal Engine)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass (census verified) with a separate defect. Operator: `427410 - hung at load screen`. HELLO 14:14:26; CALLs incl. SteamUser023.GetSteamID, SteamFriends017.GetPersonaName, BLoggedOn, GetAuthSessionTicket (last CALL 14:14:42); UE init marker verified by the census; no NOVER; shim 497664. The load-screen hang follows the auth ticket exactly as the open todo 2026-10-25-abiotic-factor-loading-hang-after-auth-ticket.md describes; no new cause found, todo unchanged.

### 45. Colony Ship 648410 (Unreal Engine)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass (census verified). Operator: `648410 - reached menu`. HELLO 14:16:27; CALLs SteamUtils010.GetAppID and SteamUser023.BLoggedOn (identity); UE init marker verified by the census; no NOVER; shim 497664.

### 46. Raft 648800 (Unity, SteamStub DRM)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (census `unverified (no game log found)`; SteamStub DRM). Operator: `648800 - DRM message / error`. HELLO 14:17:08 for the appid but no CALL; no Player.log found; process gone after 29s. The DRM message is the SteamStub class (Phase 52) and the census agrees. Known-bad class never counts as verified; not rerouted. (Only DRM may justify bottled Steam, and the goal is to remove that path, so no proposal is made.)

### 47. Avernum 6 206060 (x86)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (census `unverified (no game-originated call)`; unverifiable by construction). Operator: `206060 - reached menu`. HELLO 14:17:51; zero CALLs; x86 shim 290304 = built dll. Avernum 6.exe imports only `SteamAPI_Init` and `SteamAPI_Shutdown` from steam_api.dll (import block quoted in the Ceiling section above), writes no game log, so no game-originated call and no engine log can exist; D-53-13 cannot be met. The operator saw the menu, which does not count. Stays in the denominator.

### 48. Age of Decadence 230070 (engine per census class)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: pass (census verified). Operator: `230070 - reached menu`. HELLO 14:18:41; CALLs SteamUtils008.GetAppID and SteamUser019.BLoggedOn (identity); census verified; no NOVER; shim 497664.

### 49. ELEX 411300 (known-bad)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (known-bad; census `unverified (1 game call; needs 2 incl. identity)`). Operator: `411300 - hung at load screen`. HELLO 14:19:23, one CALL STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp, then nothing; shim coverage miss logged at 14:19:21 (STEAMHTMLSURFACE_INTERFACE_VERSION_003, STEAMHTTP_INTERFACE_VERSION002, STEAMINVENTORY...). Known-bad is never verified; the title is not rerouted.

### 50. Grim Dawn 219990 (SteamStub DRM)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (census `unverified (no game-originated call)`; SteamStub DRM). Operator: `219990 - DRM message / error`. HELLO 14:20:58, no CALL; process gone after 32s. SteamStub class (Phase 52); not rerouted.

### 51. Unclaimed World 284100 (MonoGame, old SDK)
expected: launch through the title's GameLibSteamBridge bottle; bottle shim size equals the built dll size for its arch (497664 for x64); HELLO for the appid; the engine rule for its census class (Unity: clean current Player.log; UE: current Saved log marker or CALLs; Godot/GameMaker: CALLs; or at least 2 distinct game-originated CALLs incl. identity); no NOVER init failure; no reroute to bottled Steam; In-Game never counts
result: issue (census `unverified (no HELLO)`). Operator: `284100 - error on startup  ... serious problem`. Evidence: UnclaimedWorld.exe is a PE32 (x86) .NET exe that reaches Steam through CSteamworks.dll (x86) / CSteamworks64.dll; both shims were placed (steam_api.dll 290304, steam_api64.dll 497664, matching the built dlls), the helper reached INIT, the game process lived 51s (no window raised) and there was never a HELLO. The WMP Active Setup marker the hand test found necessary is present in the bottle's system.reg in both registry views (lines 66715 and 77788), so the missing-Windows-Media-Player dialog is not explained by a missing marker. The dialog text was not captured and no Wine stderr exists for this launch, so the exact error is not identified from the logs. Candidates, not proven: the old-SDK CSteamworks export gap (todo 2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md) or the runtime-components defect (todo 2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md). Side finding: the census Arch column prints x64 for this title but the launch exe is PE32. Evidence appended to the runtime-components todo.

### 52. Trace lines (53-20)
expected: every distinct CALL method and every NOVER version (`flat lookup ver=<v> served=no`) from this session's gamelib.log is listed
result: pass (informational listing). Distinct CALL methods this session (gamelib.log, 14:00-14:22): SteamUser023.GetSteamID, SteamUser023.BLoggedOn, SteamUser023.GetAuthSessionTicket, SteamUser021.GetSteamID, SteamUser019.BLoggedOn, SteamUtils010.GetAppID, SteamUtils008.GetAppID, SteamFriends017.GetPersonaName, STEAMAPPS_INTERFACE_VERSION008.{GetCurrentGameLanguage,BIsDlcInstalled,BIsSubscribedApp,BIsSubscribed}, STEAMUSERSTATS_INTERFACE_VERSION012.{StoreStats,GetAchievementAndUnlockTime,GetAchievementDisplayAttribute}. NOVER versions (`flat lookup ver=<v> served=no`): none. No `flat lookup`, `served=no` or NOVER line appears anywhere in the session's gamelib.log.

### 53. Census majority (53-20)
expected: `pnpm bridge-census` run after the session prints `V of 18 Steamworks-using rows verified (majority: yes)` with V >= 10; the majority line is quoted verbatim with every non-verified row's Evidence reason
result: issue - done-when NOT met (9 of 18). Verbatim from `pnpm bridge-census` run after the session:

`9 of 18 Steamworks-using rows verified (majority: no)`

V = 9, N = 18. Verified appids: 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410. Non-verified rows and their Evidence reasons: 200510 XCOM (unverified, no per-game bridge bottle; known-bad, drm-wrapped); 206020 Avernum 4 (unverified, no per-game bridge bottle); 1119730 Ranch Simulator (unverified, no HELLO); 206060 Avernum 6 (unverified, no game-originated call); 219990 Grim Dawn (unverified, no game-originated call); 284100 Unclaimed World (unverified, no HELLO); 3410180 Overlooting (unverified, 1 game call; needs 2 incl. identity); 411300 ELEX (unverified, 1 game call; needs 2 incl. identity; known-bad); 648800 Raft (unverified, no game log found).

### Recorded at launch (53-20)

- HEAD `8ec93895b` (code HEAD `54e43368d`, committed 2026-10-25 13:59:14 +1300).
- `pnpm tauri:dev:packaged` exited 1 only at updater signing (no `TAURI_SIGNING_PRIVATE_KEY`); bundle produced.
- `gamelib-sidecar` mtime 2026-10-25 13:59:29, newer than HEAD. `steam_api64.dll` 497664, `steam_api.dll` 290304, `steam-bridge-helper` 153424.
- No gamelib-shell or steam-bridge-helper running beforehand. Launched `target/debug/gamelib-shell` detached, pid 19982, log `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/3ae886c8-e750-4cb5-9d8d-00fcb97b8ad0/scratchpad/gamelib-53-20.log`.
- `~/Library/Logs/GameLib` at launch: gamelib-shell.log, gamelib.log (13:01), gamelib.log.51-29-batch0-215927, gamelib.log.old, gamelib.log.pre-51-27-20261023-073351, gamelib.log.pre-51-28-20261023-194304, gamelib.log.pre-51-29-20261023-214423, runners/.

## Operator outcomes (53-20)

Recorded verbatim, as typed (including typos and spacing):

```
3410180 - reached menu
1691190 - reached menu
1167950 - reached menu 
1284190 - menu disappered (3 times, note have seen this once before, but just quit game and tried again did not repeat 3 times in a row)
1782460 - reached menu
1603180 - reached menu (with error messages)
1119730 - failed to launch
1363080 - reached menu
427410 - hung at load screen
648410 - reached menu
648800 - DRM message / error
206060 - reached menu
230070 - reached menu
411300 - hung at load screen
219990 - DRM message / error
284100 - error on startup  ... serious problem
```

The operator supplied all 16 lines without typing a literal "done"; the session is treated as complete. These are what the operator saw; the items above are scored from the logs and the census, and "reached menu" alone never makes a row verified.

### Done-when (53-20)

Not met: 9 of 18 Steamworks-using rows verified, `majority: no`, against a bar of 10.

Delta against 53-16 (9 of 18): no row changed status. The same nine verified rows (1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410) stayed verified, so there is no regression among them in the census. Overlooting 3410180 moved from a crash at a null call (rip=0, the NvAPI path) to running: the 53-19 `nvapi64` override applied, the game reached its menu with the engine log past the driver lines, and the bridge saw HELLO and one identity call (SteamUser023.GetSteamID). It did not verify because the unchanged rule needs 2 distinct game-originated CALLs and there is 1. Overlooting stays in the denominator as a held-back row, class: bridge reached, evidence short by one call.

Not reachable in this phase: Avernum 6 206060 (imports only SteamAPI_Init/SteamAPI_Shutdown, no game log) and Avernum 4 206020 (same, plus no bottle); Ranch Simulator 1119730, Raft 648800 and Grim Dawn 219990 (SteamStub, Phase 52); ELEX 411300 and XCOM 200510 (known-bad); Unclaimed World 284100 (no HELLO, startup error unidentified). Nothing was rerouted to bottled Steam and the criterion was not relaxed.

Next lever, per the pre-stated rule, input for a further gap round: the 3410180 CALL list is [SteamUser023.GetSteamID]; no NOVER versions were seen; whether the persisted scan-miss versions (STEAMUGC_INTERFACE_VERSION021, STEAMREMOTEPLAY_INTERFACE_VERSION003, STEAMTIMELINE_INTERFACE_V004) were requested cannot be told from this session (no NOVER or flat-lookup line at all); godot.log shows `Steam is running!` then `Usernam: ` (empty name) with no SteamFriends GetPersonaName CALL traced. Candidate fix per D-53-06/D-53-03: find which call GodotSteam makes for the name after the identity call and forward or constant-answer it if a served interface's stubbed slot is what stops it, or add the missing manifest version slot by slot. Neither is done here.
