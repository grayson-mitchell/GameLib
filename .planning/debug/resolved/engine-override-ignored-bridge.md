---
status: resolved
trigger: "Per-game engine override to pinned Wine-Staging is logged as applied, but the bridge launch still runs on the CrossOver 26.3 overlay runner."
created: 2026-11-21
updated: 2026-11-21
---

## Current Focus

status_note: RESOLVED. Fix committed (dac99a816), self-verified (5 regression tests red before, green after; guardrail accepted) and CONFIRMED LIVE 2026-11-21 (same-boot CrossOver priming launch, then Staging override: the game process ran on Staging, 406 wine-staging paths, 0 crossover paths). See the live check evidence entry.
reasoning_checkpoint:
  hypothesis: "A pinned/fallback engine launch runs on the CrossOver overlay clone because selectLaunchEngine captures getBridgeBottleSettings while an overlay runner left by an earlier CrossOver launch is still registered (the registry outranks the engine selection), drmLaunchSetup then clears that entry, and prepareTcpOverlay's re-read is skipped for a fallback engine (`!fallbackEngine`), so the stale clone settings reach fireBridgeWineLaunch."
  confirming_evidence:
    - "Red tests: with a stale overlay entry and a pinned decision the launch's runWineCommand gameSettings.wineVersion.bin is '/ov/runner/CrossOver/bin/wine' (the clone), exactly the live symptom; the same for the Phase 59 automatic-fallback decision (reason cx-expired)."
    - "gamelib.log 08:12:41: `endPerGameBridgeBottleSessionWith: wineserver -k` is only issued when prepareTcpOverlay was given a previousRunner, i.e. an overlay entry from the 07:56 launch was still registered; no `uses overlay runner` line in the 08:12 launch."
    - "Code: getBridgeBottleSettings checks the runner registry before the engine selection (bridgeBottle.ts L480-488); drmLaunchSetup clears the entry for every non-DRM title (drmLaunchSetup.ts L564-575); gameBridgeLaunch only re-reads for kind==='drm' (L165, L305-310); prepareTcpOverlay re-reads only when `!fallbackEngine` (gameLaunchOverlay.ts L395) although its own comment says 'or the fallback engine'."
  falsification_test: "If the fix (re-read the settings whenever previousRunner.kind is 'overlay', for any engine) leaves any of the four red tests red, or if the live 08:12-style launch (override to Staging after a CrossOver overlay launch in the same boot) still logs `Checking if wine version exists: CrossOver ... overlay runner`, the hypothesis is wrong or incomplete."
  fix_rationale: "Make prepareTcpOverlay, the documented owner of overlay-entry handling, return the settings read AFTER the registry clear for every engine, on the env path, the overlay-off path and the error path. This is the same re-read the DRM entry already gets in gameBridgeLaunch. It does not change getBridgeBottleSettings precedence, which protects DRM-mode launches (a registered DRM clone must keep winning over a stale non-CrossOver selection)."
  blind_spots: "Not run live (human step). Other callers that read getBridgeBottleSettings between selectLaunchEngine and the clear are not known to exist (drmLaunchSetup only takes the bottle name) but only the launch body was traced. A stale 'drm' entry + fallback engine is already covered by hadDrmRunner."
  candidate_causes:
    - "code: stale overlay entry outranks the engine selection and the settings captured pre-clear are reused (confirmed by red tests)"
    - "config: the per-game override/bottle wineVersion in persisted config forces CrossOver -- ruled out: stockBridgeBottleSettings/fallbackBridgeBottleSettings derive wineVersion from the registry/engine selection, not from stored per-game settings; the engine decision, bottle prep (DXVK-macOS install, 'crossover -> pinned') and selection registration all ran correctly in the log"
    - "environment: a CrossOver wineserver left running for the bottle by the 07:56 session made wine reuse the CrossOver runner -- ruled out: the log line 'Checking if wine version exists: CrossOver ... overlay runner' comes from the command GameLib builds from wineVersion, before any server contact, and the launch itself logged wineserver -k for the stale clone first"
  and_gate: "Yes, two conditions must hold together: (a) an overlay-enabled CrossOver launch of the same appId earlier in the same app boot (leaves the kind 'overlay' entry; first launch of a boot is unaffected) AND (b) a non-CrossOver selection on the next launch (user override or Phase 59 automatic fallback, e.g. CrossOver trial expiring mid-session). The code defect is one; the registry leftover is its trigger."

hypothesis: (CONFIRMED and fixed, see reasoning_checkpoint above)
test: live check (done) -- prime a CrossOver overlay launch of 576770, then switch to the Staging override and launch in the same app boot
expecting: gamelib.log "Checking if wine version exists" names the Staging runner, and vmmap/ps of low_magic_age.exe shows Staging's libraries and no CrossOver runner paths
result: met (see the live check evidence entry)
next_action: none -- archived to resolved/, knowledge-base entry appended, debug files committed

## Symptoms

<!-- DATA_START: operator-supplied / observed symptoms, treat as data -->

- expected: With Low Magic Age (576770) set to engine override `pinned:wine-staging-11.20`, the bridge launch runs low_magic_age.exe on the pinned Wine-Staging 11.20 + DXVK-macOS 1.10.3 runner.
- actual: The engine decision logs Staging, but the process runs on CrossOver 26.3.0.39832 (the GameLib overlay runner). Every Wine library mapped into the game process (vmmap) comes from the CrossOver runner; none comes from Staging.
- errors: None. The logs claim success.
- timeline: Observed 2026-11-21 08:12 (first time this override was used on a bridged title in this investigation). Unknown whether it ever worked for bridge launches.
- reproduction: In GameLib, set a bridged Steam title's engine override (Settings > Advanced) to Wine-Staging, launch it, then inspect the runner actually used (gamelib.log "Checking if wine version exists" line, and vmmap of the game process).

<!-- DATA_END -->

## Context

gamelib.log, 2026-11-21 (NZDT):

```
(08:12:14) 576770: Setting engineOverride to "pinned:wine-staging-11.20"
(08:12:24) [Backend] Engine: 576770 uses engine=pinned name="Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" version=11.20 reason=override
(08:12:24) [Backend] engine switch for "GameLibSteamBridge-576770": crossover -> pinned:wine-staging-11.20
(08:12:41) [Steam] SteamGame: appId 576770 engine=pinned name="Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" version=11.20 reason=override
(08:12:41) [Steam] SteamGame: appId 576770 overlay=env reason=fallback-engine (D-07)
(08:12:41) [Steam] SteamGame: overlay launch appId 576770: wine log .../steam-bridge/overlay/trace/576770-1795201961627.overlay.wine.log
(08:12:41) [Backend] Checking if wine version exists: CrossOver 26.3.0.39832 (GameLib overlay runner)
(08:12:41) [Backend] Running Wine command: .../GameLibSteamBridge-576770/drive_c/.../LowMagicAge/low_magic_age.exe
(08:12:49) bottleProcessMonitor [576770]: game started 22392
```

- vmmap of pid 22392 (watcher capture, /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/103e9c45-90c5-4853-80d5-da585ef72dc7/scratchpad/lma-watch/run5/s2/t006/pid22392.vmmap.txt): 44 mapped paths under `.../gamelib/steam-bridge/overlay/runners/crossover-26.3.0.39832/CrossOver`, 0 Staging paths.
- Code pointers: src/backend/storeManagers/steam/gameBridgeWineLaunch.ts L296-320 (DRM branch restores the DRM clone runner, D-11), L405-440 (`overlay.kind === 'env'` fallback-engine branch keeps "its own runner"; `cx-env` branch restores the overlay clone runner), `getBridgeBottleSettings`; engine decision in src/backend/engine/ (engineDecision.ts, engineState.ts, gameEngineState.ts); the per-game bottle engine switch in perGameBottle.ts.
- Relevant memory: "Steam engine: CrossOver first, Staging fallback" (pinned Wine-Staging+DXVK auto-fallback; override is advanced, unsupported unless CrossOver). Phase 59 (steam-engine-fallback-when-crossover-is-unavailable) and Phase 76 (engine-correct bottle for DRM-mode launches) are the design records.
- Scope question to settle: does this affect only the user override, or also the automatic Staging fallback when CrossOver is unavailable (Phase 59)? If the runner always comes from the CrossOver-runner bottle settings, the fallback would also not really run Staging on machines that have CrossOver installed. Check what wineVersion the bridge bottle settings hold after an engine switch.
- Blocks: debug session low-magic-age-no-window, test J (Staging vs CrossOver), which cannot run until the override really changes the runner.

## Eliminated

- hypothesis: "the `overlay.kind === 'env'` branch in fireBridgeWineLaunch swaps in the CrossOver runner"
  evidence: That branch (gameBridgeWineLaunch.ts L406-419) only merges env vars into `launchSettings`; it never touches `wineVersion`. The CrossOver overlay runner is already in the `bridgeBottleSettings` handed to fireBridgeWineLaunch. The defect is upstream of it, in what gameBridgeLaunch.ts passes in.
  timestamp: 2026-11-21

## Evidence

- timestamp: 2026-11-21
  checked: gameBridgeLaunch.ts L159-300 + gameLaunch.ts selectLaunchEngine L397-668 + bridgeBottle.ts getBridgeBottleSettings L476-500 + bridge/drm/drmLaunchSetup.ts L564-575 + gameLaunchOverlay.ts prepareTcpOverlay L279-420
  found: Order of operations in launchBridgeGameBody for a TCP launch: (1) `previousRunner = drmRunners.getDrmBridgeRunner(appId)` (L159); (2) `selectLaunchEngine` registers the pinned selection, then returns `getBridgeBottleSettings(deps, appId)` (gameLaunch.ts L664-667) and the result is stored in `bridgeBottleSettings`; (3) `drmLaunchSetup` returns 'not-applicable' for a non-DRM title and CLEARS the registry entry (drmLaunchSetup.ts L564-575); (4) only `hadDrmRunner = previousRunner?.kind === 'drm'` triggers a re-read of the settings (L305-310); the comment says "an overlay entry is handled by prepareTcpOverlay"; (5) prepareTcpOverlay's re-read is guarded by `previousRunner?.kind === 'overlay' && !fallbackEngine` (gameLaunchOverlay.ts L395), so for a fallback/pinned engine it is skipped and the `envVars` branch returns the ORIGINAL `settings` argument. getBridgeBottleSettings checks the DRM/overlay registry FIRST ("A DRM runner or overlay runner wins", bridgeBottle.ts L480-488) and only then the non-CrossOver engine selection, so at step (2) a stale overlay entry beats the pinned engine and the CrossOver overlay clone settings are captured, then used for the whole launch.
  implication: A stale `kind: 'overlay'` registry entry left from an earlier CrossOver launch in the same boot makes the pinned/fallback launch run on the CrossOver overlay clone. The comment at gameLaunchOverlay.ts L393-394 ("Stock CrossOver (or the fallback engine) again") shows the fallback-engine case was meant to be covered; the `!fallbackEngine` guard excludes it.

- timestamp: 2026-11-21
  checked: ~/Library/Logs/GameLib/gamelib.log lines 291-1125 (same app boot, no restart between 07:14 and 08:18)
  found: Earlier launches of 576770 on CrossOver registered the overlay clone (`bottle: appId 576770 uses overlay runner crossover-26.3.0.39832` at 07:14:56, 07:36:09, 07:56:36). Nothing between 07:58 (game stopped) and 08:12 clears it (stop() only runs `wineserver -k`). At 08:12:41 the pinned launch logs `endPerGameBridgeBottleSessionWith: wineserver -k ... (appId 576770)`, which prepareTcpOverlay issues only when `previousRunner` is defined (`nextRunnerDir !== previousRunner?.runner.runnerDir`, undefined === undefined otherwise), so a previous overlay runner entry WAS registered when the pinned launch started.
  implication: Confirms the stale-registry precondition for the 08:12 observation. The pinned decision and bottle prep (DXVK-macOS install, "engine switch crossover -> pinned") did run, so the bottle was prepared for Staging but spawned with the CrossOver clone runner.


- timestamp: 2026-11-21
  checked: games.test.ts 'Phase 60 overlay (TCP route)': a launch with a stale `kind: 'overlay'` registry entry (model of the real registry precedence and of drmLaunchSetup's clear), a pinned decision, via both `override` and the Phase 59 automatic fallback (`cx-expired`); plus prepareTcpOverlay called directly with a stale clone `settings` argument on the env route, with the overlay off, and with a throwing env prepare
  found: BEFORE the fix the launch's runWineCommand gameSettings.wineVersion.bin was `/ov/runner/CrossOver/bin/wine` (the clone) -- the live symptom reproduced; 5 tests red. AFTER the fix all green.
  implication: Reproduction automated; the defect is engine-independent (any non-CrossOver selection) and hits the automatic fallback as well as the override.

- timestamp: 2026-11-21
  checked: scope question (does the Phase 59 automatic fallback suffer the same defect?)
  found: Yes, by the same code path, but only with the precondition (a) an overlay-enabled CrossOver launch of the same appId earlier in the SAME app boot and (b) a non-CrossOver selection on the next launch. A fresh boot has an empty registry, so the first launch of a boot on Staging (override or automatic) picks fallbackBridgeBottleSettings correctly (code reading: bridgeBottle.ts L476-500 + buildFallbackGameSettings in engine/bottlePrimitives.ts L164, which sets wineVersion to the pin's wineBin, type 'wine', USER=crossover). A machine without CrossOver cannot have a clone entry at all, so only mid-session transitions (trial expiry, CrossOver breaking between launches) or override flips after an overlay launch reach it. That narrowness is why it went unseen. The automatic-fallback case is covered by an it.each test.
  implication: The Phase 59 fallback was not broken on its own; it shares the defect only in the mixed-boot case.

- timestamp: 2026-11-21
  checked: side effect of the defect on the 08:12 run
  found: The engine switch ("crossover -> pinned:wine-staging-11.20", DXVK-macOS install, d3d10core/d3d11 native overrides) DID run on the bottle, but the game was spawned by the CrossOver clone. The 08:12 run (and any other Staging-override run after a CrossOver launch in the same boot) was really CrossOver 26.3 over a bottle carrying DXVK-macOS native overrides, a mixed state, so debug session low-magic-age-no-window test J (Staging vs CrossOver) has not yet been run on a real Staging runner.
  implication: Results of any Staging-vs-CrossOver comparison taken after a CrossOver launch in the same boot before this fix are contaminated.

- timestamp: 2026-11-21
  checked: LIVE CHECK of the fix, same app boot, sidecar.js rebuilt 08:49 (orchestrator-observed; operator drove the launches)
  found: |
    Priming launch on CrossOver: pid 44365 at 08:51:01, stopped 08:51:12. Its watcher vmmap shows 797 `overlay/runners/crossover` paths and 0 wine-staging paths (so the stale overlay entry WAS registered going into the next launch, the precondition the defect needs).
    Staging launch (override pinned:wine-staging-11.20): gamelib.log line 298 `engine=pinned ... Wine-Staging 11.20 ... reason=override`. Line 309 `endPerGameBridgeBottleSessionWith: wineserver -k` (the stale clone session ended). Line 346, the last "Checking if wine version exists" before the Running Wine command (line 349), reads `Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)` (before the fix this line read `CrossOver 26.3.0.39832 (GameLib overlay runner)`). Game pid 44684 started 08:51:55. Its watcher vmmap (lma-watch/run6/s2/t006) shows 406 wine-staging paths and 0 crossover paths.
    Operator reply at the human-verify checkpoint: the game then showed an error window ("the program has encountered a serious problem"). That is the game's own crash dialog, a separate Low Magic Age issue tracked in debug session low-magic-age-no-window, not a failure of this fix.
  implication: The falsification test is met: the live 08:12-style sequence (override to Staging after a CrossOver overlay launch in one boot) now names the Staging runner and runs on it. The fix is CONFIRMED live. The same-boot precondition was actually exercised (it is not a fresh-boot pass). Debug session low-magic-age-no-window test J (Staging vs CrossOver) is now unblocked.

## Resolution

root_cause: |
  A stale overlay runner registry entry from an earlier CrossOver launch of the same title (same app boot) outranks a non-CrossOver engine selection in getBridgeBottleSettings (bridgeBottle.ts L480-488: DRM/overlay runner first, then a registered non-CrossOver engine). selectLaunchEngine (gameLaunch.ts L664-667) returns getBridgeBottleSettings BEFORE drmLaunchSetup clears that entry (drmLaunchSetup.ts L564-575, every non-DRM title), so the CrossOver overlay clone's wineVersion is captured. gameBridgeLaunch re-reads only for a 'drm' entry (hadDrmRunner), and prepareTcpOverlay re-read only when `!fallbackEngine` (gameLaunchOverlay.ts), so for a pinned/fallback engine the stale clone settings flowed on to fireBridgeWineLaunch, whose `overlay.kind === 'env'` branch deliberately leaves the runner alone ("its own runner stands"). Engine decision, bottle prep and selection registration were all correct; only the spawn runner was wrong. Trigger = (a) overlay-on CrossOver launch of the same appId earlier in the boot AND (b) a non-CrossOver selection next (override or Phase 59 automatic fallback).
fix: |
  prepareTcpOverlay (src/backend/storeManagers/steam/gameLaunchOverlay.ts) now re-reads getBridgeBottleSettings after the registry clear whenever the previous runner was an overlay clone, for EVERY engine (new settingsAfterRunnerClear helper): on the env route, with the overlay off, and in the catch path (falling back to the handed settings only if the read itself throws). getBridgeBottleSettings precedence is unchanged on purpose (a registered DRM clone must keep outranking a stale non-CrossOver selection). Commit dac99a816.
verification:
  target_test:        { result: pass, tests: "games.test.ts 'Phase 60 overlay (TCP route)': 2 launch-level (override, Phase 59 automatic fallback) + 3 prepareTcpOverlay (env route, overlay off, throwing prepare); 5 red before the fix, green after", live: "pass (2026-11-21, see live_check)" }
  mutation_check:     { result: skipped, reason_if_skipped: "no Stryker in the repo", mutant_killed: "hand mutants at the fix site all killed: (A) re-read only for kind 'drm' -> 5 fail; (B) env route returns the handed settings -> 3 fail; (C) overlay-off return keeps the handed settings -> 1 fail; the catch path was not mutated on its own, but the full-revert run's 5 red tests include the throwing-prepare case" }
  no_op_deletion:     { result: pass, deletion_justified_by_rca: false, note: "the diff replaces a guarded early return with an unconditional re-read; it adds behaviour, it does not short-circuit any" }
  adjacent_tests:     { result: pass, suites_run: ["src/backend/storeManagers/steam (all)", "src/backend/engine (all)"], totals: "207 suites, 5000 tests pass", other_checks: "tsc --noEmit clean; node meta/lintScoped.cjs production PASS / tests PASS; prettier --check clean on both files" }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "automated repro; `git show HEAD:` of gameLaunchOverlay.ts put back -> 5 red; fix restored -> green" }
  guardrail_verdict:  accepted
  oracle_type: derived (the launch must run on the runner the engine selection implies, as stated by buildFallbackGameSettings and D-07 'its own runner stands')
  live_check: |
    PASS 2026-11-21 NZDT, one app boot, sidecar.js rebuilt 08:49, same-boot sequence (CrossOver overlay launch first, then the Staging override; a fresh-boot Staging launch would not have exercised the fix).
    Priming CrossOver launch: pid 44365, 08:51:01 to 08:51:12, vmmap 797 overlay/runners/crossover paths, 0 wine-staging.
    Staging launch: gamelib.log L298 engine=pinned ... Wine-Staging 11.20 ... reason=override; L309 endPerGameBridgeBottleSessionWith: wineserver -k (stale clone ended); L346 (last "Checking if wine version exists" before the Running Wine command at L349) = Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in); game pid 44684 started 08:51:55, vmmap (lma-watch/run6/s2/t006) 406 wine-staging paths, 0 crossover paths.
    The game's own post-launch crash dialog ("the program has encountered a serious problem") is a separate Low Magic Age issue (debug session low-magic-age-no-window), not a failure of this fix.
  postmortem: |
    why not caught: the overlay runner registry is process-lifetime state written by launch N and read by launch N+1, but every launch-level test and every first-launch-of-a-boot started from an EMPTY registry, so the stale entry never existed. A code comment (gameLaunchOverlay.ts, "Stock CrossOver (or the fallback engine) again") claimed the fallback engine was covered while the `!fallbackEngine` guard excluded it, and nothing compared the claim to the guard. Every log line a reader checks (Engine decision, engine switch, DXVK-macOS bottle prep, "uses engine=pinned") reported Staging correctly; only the one "Checking if wine version exists" line named the runner actually spawned, and no gate asserts the spawned runner equals the decided engine.
    guard: games.test.ts 'Phase 60 overlay (TCP route)' (5 tests: stale-overlay + override, stale-overlay + Phase 59 automatic fallback, and prepareTcpOverlay on the env route, overlay off and a throwing prepare); runtime: the gamelib.log "Checking if wine version exists:" line before "Running Wine command" must name the runner the "Engine:" line decided.
files_changed:
  - src/backend/storeManagers/steam/gameLaunchOverlay.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
