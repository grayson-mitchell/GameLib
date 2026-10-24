---
status: testing
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
updated: 2026-10-25T00:00:00Z
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
result: pending

### 2. Vampire's Fall 1167950 (Unity)
expected: launch through `GameLibSteamBridge-1167950`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1167950; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: pending

### 3. Planet Crafter 1284190 (Unity)
expected: launch through `GameLibSteamBridge-1284190`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1284190; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: pending

### 4. Hell Clock 1782460 (Unity)
expected: launch through `GameLibSteamBridge-1782460`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1782460; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: pending

### 5. Mining Mechs 1603180 (Unity)
expected: launch through `GameLibSteamBridge-1603180`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1603180; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); In-Game never counts
result: pending

### 6. Overlooting 3410180 (Unity)
expected: launch through `GameLibSteamBridge-3410180`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 3410180; Unity rule: Player.log found and free of `EntryPointNotFoundException` and `SteamAPI_Init ... failed` (no CALL line required); note whether the PE-parse message recurs (record its exact text); In-Game never counts
result: pending

### 7. Ranch Simulator 1119730 (Unreal Engine)
expected: launch through `GameLibSteamBridge-1119730`; the shim is placed, not withheld, and its size equals the built steam_api64.dll size; HELLO for appid 1119730; UE rule: Saved log free of `SteamAPI failed to initialize` plus `Client API initialized 1`, or a CALL line; record the interface version install resolved vs the census `unknown-version` verdict (D-53-12); In-Game never counts
result: pending

### 8. Manor Lords 1363080 (Unreal Engine)
expected: launch through `GameLibSteamBridge-1363080`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 1363080; UE rule: Saved log free of `SteamAPI failed to initialize` plus `Client API initialized 1`, or a CALL line; no 0x0 access violation. A 0x0 crash traced to the null object is the D-53-08 revisit trigger and is recorded as `issue — D-53-08 trigger` with the log line; record install-vs-census version resolution (D-53-12); In-Game never counts
result: pending

### 9. Abiotic Factor 427410 (Unreal Engine)
expected: launch through `GameLibSteamBridge-427410`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 427410; UE rule: Saved log free of `SteamAPI failed to initialize` plus `Client API initialized 1`, or a CALL line; record install-vs-census version resolution (D-53-12); In-Game never counts
result: pending

### 10. Colony Ship 648410 (engine per census class)
expected: launch through `GameLibSteamBridge-648410`; bottle shim size equals the built steam_api64.dll size; HELLO for appid 648410; apply the engine rule for its census class (Unity: clean Player.log, no CALL needed; UE: Saved log marker or CALL; Godot/GameMaker: a CALL line); record the class used; In-Game never counts
result: pending

### 11. Remaining 51-29 sample: Raft 648800, 206060, 230070, 411300, Grim Dawn 219990, Unclaimed World 284100
expected: each of the six launched through its own `GameLibSteamBridge-<appid>` bottle, scored on its own line with its engine class and rule (HELLO required; Unity clean Player.log; UE marker or CALL; Godot/GameMaker CALL); Grim Dawn 219990 and Unclaimed World 284100 are scored with their class and kept in the denominator even if they fail; In-Game never counts
result: pending

### 12. Trace lines
expected: gamelib.log holds at least one CALL line from a game process (not only HELLO); any NOVER lines are listed with their versions (`flat lookup ver=<v> served=no`) so uncovered versions are named
result: pending

### 13. Census majority
expected: `pnpm bridge-census` prints `V of N Steamworks-using rows verified (majority: yes)` over all Steamworks-using rows, run after the whole sample in the same session; record V, N and the rows still not verified with their Evidence reason
result: pending

## Post-init fault rule (D-53-06)

When a title faults after init, record `issue — <Interface.Method traced in the log>` with the log
line, and say whether Steam's real value on a Mac is a constant (then the fix is a local constant) or
not (then forward it through `wire-policy.json`). The fix is planned as a gap plan from these results,
not improvised during the run.

## Summary

total: 13
pass: 0
issue: 0
pending: 13
skipped: 0
blocked: 0
