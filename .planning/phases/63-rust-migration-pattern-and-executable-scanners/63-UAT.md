---
status: pending
phase: 63-rust-migration-pattern-and-executable-scanners
source: [63-11-PLAN.md]
---

# Phase 63 UAT: live smoke of the Rust scanners (D-13)

Authored by plan 63-11, run by plan 63-12 (standing rule D-E: the author never runs the gate).
Record only pass/issue and the log excerpts needed; no tokens, no account ids, no full paths.

## Shipped defaults under test

| scanner | default | expected evidence suffix |
| --- | --- | --- |
| peSections | rust | `impl=rust` |
| peSteamDrm | rust | `impl=rust` |
| drmScanExe | rust | `impl=rust` |
| machoExports | rust | `impl=rust` |
| importScan | ts (held, 4 VirtualSize-0 diffs awaiting user acceptance, see 63-PARITY.md) | `impl=ts`; if the user accepts and the default is flipped before 63-12 runs, change these lines to `impl=rust` |

Positive evidence is always the full line `scanner <name> op=<op> caller=<tag>: impl=<x>` in
`~/Library/Logs/GameLib/gamelib.log` (emitted by `runScanner` in `src/backend/scanners/rustScan.ts:47`,
once per (scanner, op, caller) triple per process). The absence of `rust scan failed` or
`containment check failed` is an extra condition, never the proof.

## Titles (appId and name only)

| role | title |
| --- | --- |
| (a) bridge title, shim placement | Avernum 6 (206060), has a per-game bottle, x86 |
| (b) GameMaker title | Mining Mechs (1603180), has `data.win` |
| (c) SteamStub / DRM-mode title | Grim Dawn (219990) |
| (d) ordinary bridge launch | The Age of Decadence (230070) |
| (e) Wine-Staging-macOS with a `-DXMT` copy | CONDITIONAL: only `Wine-Staging-macOS-latest` is installed and no `-DXMT` sibling directory exists (raised at the 63-11 checkpoint); Wine Manager install for item 7 is available |
| largest title for the timing record | Manor Lords (1363080) |

## Preconditions

Run in this order before launch 1. Each must hold or the run is aborted.

- P1: `pgrep -f 'target/debug/gamelib-shell'` prints nothing (re-asserted before EVERY launch).
- P2: `pnpm build:sidecar` was run after the last TS change, and `build/main/sidecar.js` mtime is newer than every file in `git diff --name-only 342895f84^..HEAD -- src/`.
- P3: `env | grep GAMELIB_SCANNER_` prints nothing, so the shipped defaults are what runs.
- P4: session dir created ONCE: `S=/tmp/gamelib-gate-63-$(date -u +%Y%m%dT%H%M%SZ); mkdir -p $S`. Archive any pre-existing `~/Library/Logs/GameLib/gamelib.log.old` into `$S/pre-session.old` on the first pass.

## Capture standard (every launch N = 1..6)

1. `pgrep -f 'target/debug/gamelib-shell'` empty.
2. `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a $S/terminal.log`
3. Launch with `pnpm tauri:dev 2>&1 | tee -a $S/terminal.log` (the dev-vault launcher only, never the raw run variant; never a bare `tee`).
4. After the window appears, `pgrep -f 'target/debug/gamelib-shell'` must print exactly one PID; record it in the transcript, and again at teardown.
5. After quitting the app, BEFORE the next launch: `cp ~/Library/Logs/GameLib/gamelib.log $S/gamelib-launch-${N}.log`.
6. At session end: `ls -la $S/` and `wc -l $S/*`, recorded in the result of item 8.

## Launch plan

| launch | items |
| --- | --- |
| 1 | 1, 6, 7 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 8 |
| 7 (only if item 6 needs a relaunch after item 7 creates a DXMT copy) | 6 |

### 1. Sidecar freshness
expected: launch 1 only. `build/main/sidecar.js` mtime is newer than the newest changed `src/` file since `342895f84^` (`git log -1 --format=%cd` for each, or the P2 command), and `gamelib.log` for launch 1 contains `scanner ` lines at all (so the build carries `runScanner`); one gamelib-shell PID recorded. Launch ordinal 1.
result: pending

### 2. Shim placement on Avernum 6 (206060)
expected: launch 2 only; launch Avernum 6 from its game page (Play button). gamelib-launch-2.log contains `scanner drmScanExe op=scan_contained_real caller=detectLaunchDrmWrapper: impl=rust`, `scanner peSections op=scan_steamstub_section caller=detectLaunchDrmWrapper: impl=rust`, `scanner peSteamDrm op=scan_steam_drm caller=placeShimForGame: impl=rust`, `scanner importScan op=scan_steam_api_imports caller=placeShimForGame: impl=ts`, `scanner importScan op=scan_steam_api_imports caller=bridgeScan: impl=ts` (bridgeScan only if the bridge scan walks PEs; record if absent), plus the existing `placeShimForGame` result line (shim placed or already-placed) and no `rust scan failed`. Launch ordinal 2.
result: pending

### 3. GameMaker detection on Mining Mechs (1603180)
expected: launch 3 only; launch Mining Mechs with the CrossOver engine selected. gamelib-launch-3.log contains `scanner peSteamDrm op=scan_pe_imported_dlls caller=gameMakerRunner: impl=rust` plus the CX_GRAPHICS_BACKEND dxvk default source line `GameMaker D3D11 runner default: data.win + d3d11.dll import + CheckMultisampleQualityLevels probe`. Launch ordinal 3. If the title is not on a crossover engine the line cannot appear (bridgeKnownFixes.ts gate on `wineVersion.type !== 'crossover'`): record BLOCKED, not pass.
result: pending

### 4. DRM-mode launch of Grim Dawn (219990)
expected: launch 4 only; launch Grim Dawn. gamelib-launch-4.log contains `scanner peSteamDrm op=scan_steam_drm caller=launchBridgeGameBody: impl=rust`, `scanner peSections op=scan_steamstub_section caller=detectLaunchDrmWrapper: impl=rust`, `scanner drmScanExe op=scan_contained_real caller=detectLaunchDrmWrapper: impl=rust`, plus the steamclient-layer / DRM mode routing line and the lsteamclient game-process trace. `caller=prefetchBridgeDrmDownloads` is install-time only (`gameInstall.ts:1273`), so it is not required on a launch; record it as not reached. Launch ordinal 4.
result: pending

### 5. Ordinary bridge launch of The Age of Decadence (230070)
expected: launch 5 only; launch The Age of Decadence. gamelib-launch-5.log contains `scanner drmScanExe op=scan_contained_real caller=detectLaunchDrmWrapper: impl=rust` and `scanner peSections op=scan_steamstub_section caller=detectLaunchDrmWrapper: impl=rust` (the first-in-process occurrence of those triples, which is why this is a separate launch from 2 and 4) and NO `caller=launchBridgeGameBody` line (non-steamstub exe never reads CEG, `gameBridgeLaunch.ts:223-226`). Launch ordinal 5.
result: pending

### 6. DXMT boot check on a -DXMT copy
expected: launch 1 only. gamelib-launch-1.log contains `scanner machoExports op=scan_winemac_metal_exports caller=dxmtBootUpdate: impl=rust`, emitted when `releasesInfoReady` fires and a `<install>-DXMT` directory exists (`dxmt.ts:219-226`), plus either the `Not updating DXMT copy of` skip line or a DXMT update. CONDITIONAL: no `-DXMT` directory is installed today, so the line cannot appear; create a DXMT copy first (Wine Manager install of Wine-Staging-macOS whose winemac.so passes the export check, via item 7) and relaunch, or record BLOCKED. Launch ordinal 1 (or a later launch 7 if the copy is created during launch 1).
result: pending

### 7. wineVersionInstalled check on a Wine-Staging-macOS install
expected: launch 1 only; in Settings, Wine Manager, install a Wine-Staging-macOS release that is not yet installed (WineItem install button). gamelib-launch-1.log contains `scanner machoExports op=scan_winemac_metal_exports caller=wineVersionInstalled: impl=rust` (`dxmt.ts:150-155`, emitted on the `wineVersionInstalled` event from `downloader/main.ts:359`). Launch ordinal 1. This downloads a large archive; the operator chooses whether to proceed.
result: pending

### 8. Record only: scan wall time on the largest title
expected: launch 6; launch Manor Lords; record the wall time between the `scanner drmScanExe ... caller=detectLaunchDrmWrapper` line and the next launch log line, compared with the objdump-era note if any (63-PARITY.md has none, so record the absolute number); also record the closing `ls -la $S/` and `wc -l $S/*`. Launch ordinal 6. No pass/fail threshold.
result: pending

## Structural Reachability Review

Applied by the author of the contract (plan 63-11), all seven tests, before publishing.

### Item to launch to evidence mapping (Test 5 pairing pass)

| item | launch | positive evidence lines | also present in the same launch, by another item |
| --- | --- | --- | --- |
| 1 | 1 | any `scanner ` line; sidecar mtime | none |
| 6 | 1 | `machoExports ... caller=dxmtBootUpdate` | items 1 and 7 evidence differs (`caller=wineVersionInstalled`, any-line) |
| 7 | 1 | `machoExports ... caller=wineVersionInstalled` | item 6 evidence differs by caller tag |
| 2 | 2 | `placeShimForGame`/`bridgeScan` triples, `detectLaunchDrmWrapper` triples | none |
| 3 | 3 | `peSteamDrm ... caller=gameMakerRunner` | none |
| 4 | 4 | `launchBridgeGameBody` triple | none |
| 5 | 5 | `detectLaunchDrmWrapper` triples, absence of `launchBridgeGameBody` | none |
| 8 | 6 | timing | none |

Pairs considered: every state-mutating requirement (6 relaunches, the Wine install in item 7, the
`tee -a` capture) against every evidence-bearing requirement (the 18 distinct positive lines
above): 8 mutating x 18 evidence = 144 pairs scanned by launch ordinal. Flagged: items 2, 4, 5
share the `detectLaunchDrmWrapper` triples; separated by giving each its own launch. Items 6 and 7
share a launch but not a triple. No pair left unresolved.

### Seven-test table

| Item / precondition | Surface | Asks for | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| Capture standard | `tee -a`, per-launch `cp` | append, archive before next launch | REACHABLE | `log_writer.ts:72-74` rotates `gamelib.log` to `.old` on next launch; `cp` happens first (Tests 3, 5) |
| P1 single instance | pgrep | zero pre-existing instance | REACHABLE | Section 3 standard; asserted per launch |
| P2 sidecar mtime | `build/main/sidecar.js` | newer than `src/` changes | REACHABLE | `pnpm build:sidecar` is a package.json script |
| P3 no env override | `env` | empty `GAMELIB_SCANNER_*` | REACHABLE | `scannerImpl.ts` resolve reads env |
| 1 | gamelib.log | any `scanner ` line | REACHABLE | Test 3 sink: `logInfo` at `rustScan.ts:47` goes to `gamelib.log` (sidecar logger), never the terminal transcript; `terminal.log` is NOT the sink for any `scanner ...` line |
| 2 | Play on Avernum 6 | `placeShimForGame` triples | REACHABLE | Test 6: `placeShimForGame` runs on every launch (`gameBridgeLaunch.ts:373`), also when already placed (`already-placed` result still runs detection, `shimGenerate.ts:476-486` before the placement decision); `detectExeSteamDrm` at `shimGenerate.ts:602` and import scan at `:865-869`. Test 7: game page Play button |
| 3 | Play on Mining Mechs | `gameMakerRunner` triple | CONDITIONAL | Test 6: requires `settings.wineVersion.type === 'crossover'` and no explicit `CX_GRAPHICS_BACKEND` (`bridgeKnownFixes.ts:151-153`); the runner confirms first. Test 7: Play button; engine chosen in game Settings, Wine tab |
| 4 | Play on Grim Dawn | `launchBridgeGameBody` CEG read | REACHABLE | `gameBridgeLaunch.ts:221-226` only when `launchDrmWrapper === 'steamstub'`; 62-UAT item 3 shows Grim Dawn routes to DRM mode; Test 6: do not delete its bottle or switch mode first |
| 4 `prefetchBridgeDrmDownloads` | install flow | line | IMPOSSIBLE on launch, withdrawn | `gameInstall.ts:1273` only; the contract does not require it (Test 7: needs an uninstall and reinstall of Grim Dawn, out of scope) |
| 5 | Play on Age of Decadence | detectLaunchDrmWrapper triples; no CEG line | REACHABLE | `gameBridgeLaunch.ts:212`; Test 4: the absence of `launchBridgeGameBody` is falsifiable, because a steamstub exe WOULD log that triple |
| 6 | startup `releasesInfoReady` | `dxmtBootUpdate` line | CONDITIONAL | Test 6: needs `<install>-DXMT` directory (`dxmt.ts:219-226`); none exists today, so it BLOCKS unless created via item 7 and relaunched. No substitute invented |
| 7 | Settings, Wine Manager, install | `wineVersionInstalled` line | REACHABLE | `WineItem/index.tsx:62` install button calls `installWineVersion`; event at `downloader/main.ts:359`; macOS only (`dxmt.ts:151` `isMac`); Test 6: needs a not-yet-installed Wine-Staging-macOS release |
| 8 | Play on Manor Lords | timing | REACHABLE | record-only, no assertion (Test 4 n/a) |
| Test 1 (scheme) | all | no URL used | REACHABLE | no network-origin item |
| Test 2 (concurrency) | all | nothing driven concurrently | REACHABLE | one action per item, one launch per item (except 6/7 which are sequential in launch 1) |
| Test 5 (interaction) | all | see mapping table | REACHABLE | pairing pass recorded above |
| Test 6 (external state) | 2, 3, 4, 6, 7 | titles installed; DXMT copy | CONDITIONAL | titles 206060, 1603180, 219990, 230070, 1363080 appear in `pnpm bridge-census` with per-game bottles; DXMT copy absent (items 6) |
