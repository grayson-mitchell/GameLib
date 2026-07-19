---
status: resolved
resolution: fixed_fix1_hw_verified_fix2_deferred
slug: steam-bottle-game-no-launch
trigger: "D-UAT-10: A Steam game correctly installed into the CrossOver bottle (Portal 2, appId 620) cannot be launched or uninstalled from the GameLib UI. Found 2026-07-19 during Phase 21 UAT Task 3, fresh build @ adced885, real macOS."
created: 2026-07-19
updated: 2026-07-19
source: .planning/phases/21-steam-native-install/21-UAT.md (D-UAT-10)
---

# Debug: Steam bottle-installed game not launchable/uninstallable from GameLib

## Symptoms

**Expected behavior:** A Windows Steam game installed into the CrossOver bottle should be
launchable from GameLib (Play → launch via the bottled Steam / `steam://rungameid/620` inside the
CrossOver bottle) and uninstallable from GameLib, with the detail page reflecting the CrossOver
bottle as the compat tool.

**Actual behavior (real macOS, fresh build @ adced885):**
1. **Play button is a dead no-op** — clicking it does nothing.
2. **No install options shown** on the game.
3. **GamePage detail shows "Game Porting Toolkit"** as the tool instead of the CrossOver bottle.
4. **Uninstall runs then reverts to "Play"** — appears to fail silently and re-detect the game as
   installed.

**Error messages:** None surfaced to the user (silent no-ops).

**Timeline:** Found 2026-07-19 during Phase 21 UAT Task 3 (bottled Steam adoption). First real-HW
test of launching/uninstalling a GameLib-installed bottled Steam game.

**Reproduction:** Install a Windows-only (no Mac build) Steam game via GameLib into the CrossOver
bottle; wait for it to complete + adopt; then try Play / Uninstall from GameLib.

## Confirmed state (verified on disk + in GameLib store — NOT hypotheses)

- Bottle install **succeeded**: `portal2.exe` + ~12 GB complete Windows tree at
  `~/Library/Application Support/CrossOver/Bottles/GameLibSteam/drive_c/Program Files (x86)/Steam/steamapps/common/Portal 2/`.
- Bottle `appmanifest_620.acf`: `StateFlags "4"`, `BytesDownloaded == BytesToDownload` (12,755,935,432).
- `store_cache/steam_library.json` records 620 correctly:
  `is_mac_native:false`, `is_linux_native:true`, `mac_arch:"unknown"`, `is_installed:true`,
  `install.platform:"Windows"`, `install.install_path` = the bottle path, `install.install_size:"11.88 GiB"`.
- Bottle `GameLibSteam` is a **win64** bottle (Program Files (x86) layout). `isBottleReady()` true.

## Eliminated

- hypothesis: "GamePage routes by `is_mac_native` to a native/GPTK path"
  disproven_by: `620.is_mac_native` is **false**; the install record already points at the bottle
  with `platform:"Windows"`. The GPTK label + dead Play are NOT explained by a mac-native flag.
  (This was the orchestrator's first code-read guess during UAT — do NOT re-try it.)

## Open questions to investigate

1. Why does the detail page show **Game Porting Toolkit** as the tool for a Steam bottle install
   that should launch via the CrossOver bottle's Steam? Is GamePage reading a default/global Wine
   version (GPTK) rather than the dedicated Steam-bottle wine/config?
2. Is the Steam `launch()` / `uninstall()` path in `src/backend/storeManagers/steam/games.ts` wired
   for a game whose install lives in the **bottle** steamapps (vs the native macOS Steam library), or
   does it fall through to a generic Wine/native path that no-ops?
3. Why does uninstall "revert to Play" — does it fail silently and re-detect the still-present bottle
   `appmanifest_620.acf` / files as installed (install-detection reads bottle steamapps)?
4. Does `is_linux_native:true` (with `mac_arch:"unknown"`) steer any launch/tool routing on macOS?

## Investigation hints (starting points)

- `src/backend/storeManagers/steam/games.ts` — `SteamGame`, `.install()`, `launch()`, `uninstall()`.
- `src/backend/storeManagers/steam/bottle.ts` — `getBottleSteamappsDir()`, `getBottleSteamExePath()`,
  bottle launch (`tellBottledSteamToInstall`, `BottledSteamVerb`).
- Frontend GamePage action button (`MainButton.tsx`) + compat-tool/Wine-version display
  (`getGamePortingToolkitWine()` and how the Steam runner picks a wine version).
- `src/backend/launcher.ts` — `prepareWineLaunch()` and how a Steam bottle launch differs from native.
- NOTE: graphify-out/graph.json exists — use `graphify query "<question>"` before grepping raw source.

## Current Focus

status: resolved

reasoning_checkpoint:
  hypothesis: "Two compounding defects. (1) main.ts's `requestGameSettings` IPC
    handler calls `GameConfig.get(appName).getSettings()` directly instead of
    the runner-aware `libraryManagerMap[runner].getGame(appName).getSettings()`
    — so for a bottle-eligible Steam game it NEVER returns
    `getSteamBottleSettings()`, always the generic per-appId GameConfig
    (defaults to the GLOBAL wine, e.g. GPTK on macOS). This alone explains
    symptom 3 (GPTK shown instead of the bottle). (2) `checkWineBeforeLaunch`'s
    self-heal path (utils.ts) persists a corrected wineVersion via
    `GameConfig.get(gameInfo.app_name).setSetting('wineVersion', ...)` — for a
    REAL Steam-bottle game this writes to a store `getSteamBottleSettings()`
    never reads, so if the bottle's stored/resolved wine ever fails
    `validWine()`, the self-heal is a no-op for the bottle: every subsequent
    bottle dispatch (`dispatchToBottledSteam` in bottle.ts, used for
    install/launch/uninstall) keeps re-reading the SAME broken wineVersion via
    `getSteamBottleSettings()`, so `runWineCommand` keeps silently
    failing/no-op'ing (Play does nothing — symptom 1; uninstall dispatches
    nothing effective, bottle ACF/files remain, poll re-detects installed —
    symptom 4, with symptom 2 as its direct consequence)."
  confirming_evidence:
    - "main.ts:994-996 requestGameSettings handler: `GameConfig.get(appName).getSettings()`
      — bypasses SteamGame.getSettings()'s isBottleEligible() branch entirely,
      unlike launcher.ts:132 (`game.getSettings()`) which correctly goes
      through the Game interface."
    - "bottle.ts:722-751 provisionBottle() step 6 has an explicit code comment:
      'Pitfall 6: checkWineBeforeLaunch writes recovery via
      GameConfig.get(appName).setSetting(\"wineVersion\", ...) — use the
      reserved synthetic appName so it never collides with a real game' — the
      team ALREADY discovered this exact defect class for the provisioning
      synthetic-game call and worked around it by (a) using a reserved appId
      so the stray GameConfig write is harmless, AND (b) explicitly
      re-persisting `bottleSettings.wineVersion` into `steamBottleConfigStore`
      themselves right after. No equivalent re-persist step exists in
      launcher.ts's launchEventCallback (the REAL per-game launch path, which
      passes gameInfo.app_name — a real appId, e.g. '620') — the same gap the
      team patched once was never patched at the real-launch checkpoint."
    - "utils.ts:952-1044 checkWineBeforeLaunch: every self-heal branch calls
      `GameConfig.get(gameInfo.app_name).setSetting('wineVersion', ...)`
      unconditionally — no runner/bottle-awareness."
    - "bottle.ts:266-279 getSteamBottleSettings(): `wineVersion: storedWineVersion
      ?? globalSettings.wineVersion` — confirms steamBottleConfigStore is the
      ONLY store consulted for the bottle's wine, and confirms a fallback to
      the GLOBAL default (GPTK on this macOS machine) is reachable whenever
      steamBottleConfigStore has no explicit wineVersion."
    - "bottle.ts:868-874 dispatchToBottledSteam (used by
      tellBottledSteamToInstall/Launch/Uninstall) calls `getSteamBottleSettings()`
      fresh on every dispatch — so a broken persisted wineVersion affects
      install, launch, AND uninstall identically, matching the observed
      pattern (install eventually succeeded via Steam's own network-driven
      download; launch/uninstall — which need the wine engine to actually run
      steam.exe — silently fail)."
  falsification_test: "If the real hardware's `steam_store/steamBottleConfigStore.json`
    'wineVersion' key is a genuinely valid CrossOver-type entry (existsSync(bin)
    true) at the time Play was clicked, this hypothesis is wrong and the dead
    no-op must come from elsewhere (e.g. runWineCommand itself, or a disabled
    button state) — NOT verifiable from this sandboxed environment (no access
    to the real macOS store files); flagged as a blind spot below."
  fix_rationale: "Fix 1 (requestGameSettings bypass) removes the display-bypass
    unconditionally and matches the existing correct pattern used everywhere
    else in the codebase (launcher.ts:114/132) — addresses symptom 3 at the
    root regardless of the wine-validity question. Fix 2 (persist self-healed
    wine back into steamBottleConfigStore after a real-game
    checkWineBeforeLaunch call) closes the exact gap the team already
    identified and fixed once (Pitfall 6) but left open at the real launch
    checkpoint — this makes the self-heal actually effective for bottle
    dispatches instead of silently writing to a dead-end store, addressing the
    mechanism believed to cause symptoms 1/2/4."
  blind_spots: "Could not directly inspect the real macOS
    steamBottleConfigStore.json / confirm validWine() actually failed for this
    specific UAT run (no live hardware access from this environment) — the
    fix is based on a proven code-level asymmetry (Pitfall 6 patched once,
    not at the real-launch site) rather than a live-observed failing
    validWine() call. Fix 2 is defensive/correct either way (closes a real gap)
    even if it turns out not to be the exact trigger for this specific report;
    requires human hardware verification per protocol."

## Evidence

- timestamp: 2026-07-19
  checked: src/backend/main.ts requestGameSettings IPC handler
  found: "Calls `GameConfig.get(appName).getSettings()` directly — does not
    go through `libraryManagerMap[runner].getGame(appName).getSettings()`
    like every other correct call site (e.g. launcher.ts:114/132)."
  implication: "For a Steam bottle-eligible game, the frontend's
    `requestGameSettings` (used by GamePage InstalledInfo.tsx wine/tool
    display) never resolves SteamGame.getSettings()'s isBottleEligible()
    branch — always reads the generic per-appId GameConfig, which defaults to
    the global wine (GPTK on this Mac). Confirmed root cause of symptom 3."

- timestamp: 2026-07-19
  checked: src/backend/storeManagers/steam/bottle.ts getSteamBottleSettings(),
    provisionBottle(), dispatchToBottledSteam()
  found: "getSteamBottleSettings() reads wineVersion ONLY from
    steamBottleConfigStore (falling back to the global default wine).
    dispatchToBottledSteam() (install/launch/uninstall) re-reads this on every
    call. provisionBottle()'s step 6 comment ('Pitfall 6') documents that
    checkWineBeforeLaunch's self-heal writes to GameConfig(appName), not
    steamBottleConfigStore, and explicitly works around this ONLY for its own
    synthetic-appName provisioning call by re-persisting the result itself."
  implication: "The identical self-heal-writes-to-wrong-store gap is not
    patched at the REAL per-game launch checkpoint (launcher.ts
    launchEventCallback uses the real gameInfo.app_name) — a self-heal
    triggered by a real Play click never reaches steamBottleConfigStore, so
    bottle dispatch keeps using the same broken wine on every subsequent
    install/launch/uninstall call. Likely mechanism for symptoms 1/2/4."

- timestamp: 2026-07-19
  checked: Real-hardware verification on a clean, fully-restarted `pnpm start`
    build (fix confirmed on disk: persistBottleWineVersion exported in
    bottle.ts, called at launcher.ts:242; main.ts requestGameSettings rewritten).
  found: "FIX #1 HW-CONFIRMED: after the clean rebuild, Portal 2's GamePage
    detail tab shows the CrossOver/Steam bottle as the tool instead of 'Game
    Porting Toolkit'. FIX #2 NOT VERIFIED: on the pre-restart (stale-backend)
    build, Uninstall ran ~30s then reverted to Play; the user did NOT retest
    Play/Uninstall on the clean fixed build — they stopped (fatigue + bottle
    path has other open issues) and manually deleted the Portal 2 files (12 GB
    dir + appmanifest_620.acf) to reclaim disk, so the test subject is now gone."
  implication: "Fix #1 (requestGameSettings runner-aware getSettings → correct
    tool display) is confirmed correct on real hardware. Fix #2 (self-heal
    re-persist into steamBottleConfigStore → Play/Uninstall dispatch) is a
    correct, defensive gap-closure that passed tsc + full jest, but its
    launch/uninstall behavior on real hardware is DEFERRED to a future bottle
    install (no subject currently installed)."

## Resolution

root_cause: "(1) main.ts's requestGameSettings IPC handler bypasses
  SteamGame.getSettings()'s bottle-aware routing, always reading the generic
  GameConfig store — surfaces the wrong wine/tool (GPTK) on GamePage for a
  bottle-eligible Steam game. (2) checkWineBeforeLaunch's self-heal
  persistence (GameConfig.get(appName).setSetting('wineVersion', ...)) never
  reaches steamBottleConfigStore for a REAL game launch (only patched for
  provisionBottle's synthetic appName, per the existing 'Pitfall 6' comment),
  so a self-healed wine correction never actually fixes the bottle's stored
  wine — every subsequent install/launch/uninstall dispatch
  (dispatchToBottledSteam) keeps using the same broken wineVersion, causing
  silent no-ops on Play/Uninstall."
fix: "(1) main.ts: requestGameSettings now resolves settings via
  libraryManagerMap[runner].getGame(appName).getSettings() instead of
  GameConfig.get(appName).getSettings() directly. (2) bottle.ts: exported
  persistBottleWineVersion() helper; launcher.ts's launchEventCallback now
  calls it (dynamic import, mirroring bottle.ts's existing
  dynamic-import-of-launcher.ts pattern) to re-persist gameSettings.wineVersion
  into steamBottleConfigStore after a successful checkWineBeforeLaunch call
  for runner === 'steam', closing the Pitfall-6-class gap at the real launch
  checkpoint."
verification: "Self-verified: `npx tsc --noEmit` clean; full backend jest
  suite (65 suites / 1463 tests, including bottle.test.ts, games.test.ts,
  library.test.ts) all pass, zero regressions.
  HARDWARE (2026-07-19, clean fully-restarted pnpm start build):
  - FIX #1 (requestGameSettings → GamePage tool display): HW-VERIFIED. Portal 2
    detail tab now shows the CrossOver/Steam bottle instead of 'Game Porting
    Toolkit'. Real fix confirmed on hardware.
  - FIX #2 (self-heal re-persist → Play/Uninstall dispatch): DEFERRED, NOT
    hardware-verified. The stale-backend build still showed Uninstall revert to
    Play; the user stopped before retesting on the clean fixed build (fatigue +
    bottle-install path has separate open issues) and deleted the Portal 2
    bottle files, so no test subject remains. Fix #2 is code-correct (tsc +
    jest green, closes a proven Pitfall-6-class gap) but its launch/uninstall
    behavior needs re-verification on a FUTURE bottle install."
followups:
  - "DEFERRED: re-verify Fix #2 (Play + Uninstall dispatch for a bottle-located
    Steam game) on real macOS hardware next time a Windows-only Steam game is
    installed into the CrossOver bottle. No subject currently installed."
  - "Cross-reference: original report is D-UAT-10 in
    .planning/phases/21-steam-native-install/21-UAT.md."
files_changed:
  - src/backend/main.ts
  - src/backend/launcher.ts
  - src/backend/storeManagers/steam/bottle.ts
