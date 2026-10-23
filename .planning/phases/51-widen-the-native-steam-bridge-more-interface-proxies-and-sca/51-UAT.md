---
status: diagnosed
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
source:
  - 51-01-SUMMARY.md
  - 51-02-SUMMARY.md
  - 51-03-SUMMARY.md
  - 51-04-SUMMARY.md
  - 51-05-SUMMARY.md
  - 51-06-SUMMARY.md
  - 51-07-SUMMARY.md
  - 51-08-SUMMARY.md
  - 51-09-SUMMARY.md
  - 51-10-SUMMARY.md
  - 51-11-SUMMARY.md
  - 51-12-SUMMARY.md
  - 51-13-SUMMARY.md
  - 51-14-SUMMARY.md
  - 51-15-SUMMARY.md
  - 51-16-SUMMARY.md
  - 51-17-SUMMARY.md
  - 51-18-SUMMARY.md
started: 2026-10-21T12:30:34Z
updated: 2026-10-22T09:45:00Z
---

## Preconditions

Run against the **packaged build only — never `tauri:dev`** (a long-running dev server runs a
stale sidecar bundle, so code landed this phase would not even be present in the running
process). Mac Steam signed in. CrossOver present with the legacy `GameLibSteam` and
`GameLibSteamBridge` bottles plus any per-game `GameLibSteamBridge-<appId>` bottles the preceding
plans created. Archive `gamelib.log` before each item's arm — append-and-archive capture, never
truncate, so an earlier item's evidence survives a later item's own logging. Before item 1, record:

- `SHIM32 = stat -f %z build/bin/arm64/darwin/steam_api.dll`
- `SHIM64 = stat -f %z build/bin/arm64/darwin/steam_api64.dll`

Both values are the authoritative "is this really the bridge shim, not the game's own dll" check
used by items 1, 2, 4, and 6 below (file-size comparison beats `grep 54550`, which is a false
negative — the port is never stored as ASCII).

Pair-test note carried from the authoring review (live-gate-contract-authoring.md Test 5): **item
3 must run before item 4** — item 4's Hoard uninstall-then-fresh-install destroys item 3's
legacy-bottle launch-time-miss evidence.

## Current Test

[testing complete]

## Tests

### 1. Avernum 6 (206060) D-51-01 identity

expected: Play launches Avernum 6 through the per-game bridge path; Mac Steam shows In-Game; `gamelib.log` has `LISTEN 127.0.0.1:<port> appid=206060` (port != 54550) and `HELLO shim attached appid=206060`; the placed `steam_api.dll` next to `Avernum6.exe` has size == SHIM32, `grep -ac 127.0.0.1 <dll>` >= 1, `grep -ac GameLibSteamBridgeShim/2 <dll>` >= 1; quitting the game ends In-Game on Mac Steam and frees the port.
result: pass — 2026-10-22, packaged debug bundle at HEAD 171b4cbf2, fresh Mac (fresh install into a new per-game bottle `GameLibSteamBridge-206060`; no Windows Steam set up). SHIM32=894464, SHIM64=841728. Session 3: `LISTEN 127.0.0.1:50416 appid=206060 mode=full` (sessions 1-2 used 50405), `INIT SteamAPI ready (single InitFlat call, real appid=206060)`, real SteamID64 returned (matches account, …7096), `HELLO shim attached appid=206060` on every launch. Placed `steam_api.dll` = 894464 (== SHIM32), `grep -ac 127.0.0.1` = 1, `grep -ac GameLibSteamBridgeShim/2` = 1. Operator confirmed Mac Steam In-Game. Quit at 20:13:58: game stopped after 171s, then `stopBridgeHelper` SIGTERM, and `lsof` showed 50416 no longer listening (50405 was freed the same way at 20:10:40). Side findings (todos, not item failures): the game's pre-launch settings window and the game window open behind GameLib (2026-10-22-wine-launched-game-windows-open-behind-gamelib.md). The first two installs failed on the missing/misplaced CrossOver and silently flipped the route to bottled Steam until restart (2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md).

### 2. Avernum 5 (206040) per-game bottle regression

expected: Same hooks as item 1, from the Avernum 5 per-game bottle (`GameLibSteamBridge-206040`) rather than the legacy shared bottle — Play launches through the bridge, Mac Steam shows In-Game, `LISTEN 127.0.0.1:<port> appid=206040` (its own port, distinct from item 1's), `HELLO shim attached appid=206040`, placed `steam_api.dll` size == SHIM32 with the same `grep -ac` checks, and quitting frees the port and clears In-Game.
result: issue — 2026-10-22, packaged debug bundle at HEAD 171b4cbf2, fresh Mac. Launch half passed: a new per-game bottle `GameLibSteamBridge-206040` was created ("no Windows Steam client installed — R6"), not the legacy shared bottle. `LISTEN 127.0.0.1:50481 appid=206040 mode=full` (its own port, distinct from item 1's 50405/50416), `INIT SteamAPI ready (… real appid=206040)`, `HELLO shim attached appid=206040`. Placed `steam_api.dll` = 894464 (== SHIM32), `grep -ac 127.0.0.1` = 1, `grep -ac GameLibSteamBridgeShim/2` = 1. Operator confirmed Mac Steam In-Game. Teardown FAILED on the first launch: after the game was force-quit (20:16-20:18), `steam-bridge-helper --appid 206040` was still LISTENing on 50481 at 6m39s of age, and no `bottleProcessMonitor [206040]` line was ever logged for that launch. Cause: `runWineCommand` (`launcher.ts:1453`) resolves only on the wine child's `close`; `wait: false` only skips `wineserver --wait`. `fireBridgeWineLaunch` starts the monitor after that await, and CrossOver's `winewrapper.exe --run` stays a child of the sidecar for the game's whole lifetime. So each launch's monitor starts only after its own game has exited. Corroborated on relaunch 20:20:55: `winewrapper` pid 26675 (ppid = sidecar) was still alive 1:35 into play, yet `game started` was logged at 20:20:57. That match came from the first launch's late-started monitor, which then stopped the helper at 20:25:05 (`gone after 248s`). The same thing happened on item 1's first launch (20:08:09, never matched). Todo: 2026-10-22-bridge-process-monitor-starts-after-game-exits.md. Also: the operator reports Avernum 5 is not really playable under wine (the in-game menu disappears), so its seed entry needs review in Task 2.

### 3. Legacy Hoard (63000, shared GameLibSteamBridge, Phase-24 shim) launch-time miss

expected: Pressing Play on the legacy-bottle Hoard install does NOT launch (the Phase-24 2-interface shim is still in place there, pre-widening); the D-05 dialog lists `<Family>@unknown-version` entries for the families Hoard actually imports; `gamelib.log` shows the miss verdict naming those same entries. MUST run before item 4 — item 4's uninstall-then-reinstall destroys this legacy-bottle evidence.
result: skipped — fresh Mac (2026-10-22): no legacy shared `GameLibSteamBridge` bottle and no Phase-24 two-interface shim install of Hoard has ever existed on this machine, so the launch-time-miss precondition cannot be reproduced. Item 4 runs as a plain fresh install instead of uninstall-then-reinstall.

### 4. Hoard Gate 4 re-run (24-UAT Gate 4)

expected: Uninstall the legacy Hoard copy, then a fresh install routes to the per-game bottle `GameLibSteamBridge-63000`; the game reaches playable single-player. Part A: `gamelib.log` shows `HELLO` + `INIT … SteamAPI ready` for appid=63000. Part B: a real SteamID64 + persona are served (USER/FRIENDS dispatch lines logged). The new bottle has no `steam.exe`. The placed `steam_api.dll` size == SHIM32. Mac Steam shows In-Game Hoard. A `[bridge-notice] appId=63000 reason=stubbed:…` line is logged and the game page shows the limited-features line (D-51-02's one-time stubbed-interfaces notice).
result: issue — 2026-10-22, packaged debug bundle at HEAD 171b4cbf2, fresh Mac. Hoard does NOT reach playable single-player: Reuben.exe shows a crash dialog. The operator reports this is the exact crash Hoard has always had under CrossOver, before the bridge existed, so it is a Hoard-under-Wine incompatibility, not a bridge regression. Bridge half passed: a fresh install created the per-game bottle `GameLibSteamBridge-63000` ("no Windows Steam client installed — R6", so no `steam.exe`); `LISTEN 127.0.0.1:50759 appid=63000 mode=full`; `INIT SteamAPI ready (single InitFlat call, real appid=63000)`; `HELLO shim attached appid=63000` on both launches (20:31:07, 20:31:52); `[bridge-notice] appId=63000 reason=stubbed:SteamMatchMaking,SteamNetworking,SteamRemoteStorage`; the game page shows the limited-features line (operator confirmed). Part B (USER/FRIENDS dispatch) not observed: no dispatch lines were logged before the crash. Route to the bridge only happened after a detour: the first install was delegated to Mac Steam (`steam://install/63000`), which installed the i386 native build and was never checked (poller gave up after 60s). The second, GameLib-direct install detected `mac_arch '32'`, and the operator-confirmed i386 recovery reinstalled through the bridge (todo 2026-10-22-steam-direct-download-default-on-and-verify-arch-after-delegated-install.md). D-51-14's Hoard acceptance anchor is therefore UNMET for a reason outside the bridge. Task 2 should add 63000 to knownBad with this item as evidence.

### 5. XCOM: Enemy Unknown (200510)

expected: A fresh bridge install loads the exe (the 9 out-of-scope `SteamGameServer*` bare imports resolve against the GameServer flat stubs, so the exe does not fail to load on an eagerly-bound IAT entry) and reaches the main menu; the verdict is clean (no missing symbols) against SteamUser016/SteamFriends011/SteamUtils005/STEAMAPPS_INTERFACE_VERSION004/STEAMUSERSTATS_INTERFACE_VERSION010.
result: issue — 2026-10-22, packaged debug bundle, sidecar at c1a641a21. Does NOT reach the main menu: XComGame.exe is Steam CEG-protected (DRM), so it cannot run through the bridge. Install path: the first install failed on a launch-exe path bug (`Binaries\Win32\XComGame.exe` joined unsplit, so objdump got a nonexistent path), fixed in c1a641a21 with a regression test. The reinstall then hit a separate depot-downloader bug: 11 real files under `XEW/` are claimed by depots 200522 and 225341 at different sizes, left UNRESOLVED, so the install was recorded as StateFlags=1026 (todo 2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md). Worked around by hand for this gate: StateFlags set 1026 -> 4 in the bridge bottle's appmanifest (original archived). Exe-load half PASSED: verdict clean, x86, missingSymbols [] against SteamUser016/SteamFriends011/SteamUtils005/STEAMAPPS_INTERFACE_VERSION004/STEAMUSERSTATS_INTERFACE_VERSION010 (stubbed: SteamMatchMaking, SteamNetworking, SteamMatchMakingServers, SteamRemoteStorage). The exe loaded with no unresolved IAT entry, and the shim `steam_api.dll` mapped as native. Helper `LISTEN 127.0.0.1:55018 appid=200510`, `INIT SteamAPI ready`. No `HELLO` on either GameLib launch (21:35:32, 21:37:02); the process exited after ~31s with no window. Diagnosed with a hand-run CrossOver `--cx-log --debugmsg +loaddll,+seh` capture: right after steam_api.dll attaches, the main thread reads the PE resources `STEAM_SPLIT_GUID`, `STEAM_GUIDD`, `STEAM_MINSTANCE`, writes `XComGame.exe.<pid>.STEAMSTART`, then idles ~30s and exits without ever calling SteamAPI_Init. That is CEG waiting for a Windows Steam client over Steam IPC, which a bridge bottle (no steam.exe, by design) cannot provide. Task 2: add 200510 to knownBad with reason `drm-wrapped` and this item as evidence. Todo 2026-10-22-detect-steam-ceg-drm-in-bridge-prescreen.md covers detecting this up front.

### 6. ELEX (411300) Win64

expected: A fresh bridge install's pre-install prescreen logs the title as x64 (D-51-06/17); `steam_api64.dll` is placed next to `ELEX.exe` with size == SHIM64; the game reaches the main menu; Mac Steam shows In-Game ELEX.
result: issue — 2026-10-22, packaged debug bundle, sidecar at c1a641a21. Does NOT reach the main menu: on launch ELEX shows the Steam error "Your account is not subscribed to this application [AppID: 411300]". The account does own 411300. Cause, by design of 51-15: the Win64 shim serves ELEX's core interfaces SteamUser019 / STEAMAPPS_INTERFACE_VERSION008 / SteamUtils008 / SteamClient017 as `stub` only (SHIM64_SERVED_INTERFACE_VERSIONS, shimCoverage.ts: "no macOS helper-dylib accessor for THESE version strings has ever been measured … D-09: never invented"). Only STEAMUSERSTATS_INTERFACE_VERSION011 is wired, so ELEX's subscription check gets a stubbed false. The launch-time notice confirms it: `[bridge-notice] appId=411300 reason=stubbed:SteamClient,SteamController,SteamGameServer,SteamUser,SteamUtils,SteamAppList,SteamApps,…`. Passed: a per-game bottle `GameLibSteamBridge-411300`; `steam_api64.dll` placed next to `ELEX/system/ELEX.exe` at 841728 bytes (== SHIM64); post-install scan clean, `arch: x64`, missingSymbols []; helper `LISTEN 127.0.0.1:55236 appid=411300 mode=full`, `INIT SteamAPI ready (… real appid=411300)`; `HELLO shim attached appid=411300` (22:05:17), so the Win64 shim loads and attaches. Failed sub-check: the pre-install prescreen did NOT log the title as x64. It logged `prescreenBridgeDepots: appId 411300 result=none` (21:13:17), and Hoard (63000) and XCOM (200510) got the same `none` with persisted `steamApi: "none"`. Cause: `screenDepotPlanForSteamApi` (depot.ts) takes the POSIX `basename()` of depot filenames that use Windows separators (`system\steam_api64.dll`), so any steam_api*.dll in a subfolder is missed; only root-level DLLs, like the Avernums', match. Routing still worked only because the post-install scan caught everything (todo 2026-10-22-bridge-prescreen-always-returns-none.md). Mac Steam In-Game not checked, because the game stops at the error. The x64 core-interface wiring is gap-closure work (todo 2026-10-22-wire-win64-core-steam-interfaces.md).

### 7. D-51-03 two bridge games at once

expected: Avernum 6 and Hoard running simultaneously each get their own per-game helper — `lsof -nP -iTCP -sTCP:LISTEN` shows two distinct `steam-bridge-helper` pids on two distinct LISTEN ports; both games stay responsive; neither launch is refused by a single-helper collision dialog.
result: pass — 2026-10-22, packaged debug bundle at HEAD 171b4cbf2. Pair substituted to Avernum 6 + Avernum 5 because Hoard cannot run under wine (item 4); this tests the same two-helper behaviour. Two distinct `steam-bridge-helper` pids, 36822 (`--appid 206040`) and 36865 (`--appid 206060`), on two distinct LISTEN ports, 51296 and 51306 (`lsof -nP -iTCP -sTCP:LISTEN`). `HELLO shim attached` for 206040 at 20:40:46 and for 206060 at 20:40:48. Both games running concurrently. No single-helper collision dialog or refusal logged.

### 8. D-51-09/D-51-10 route visibility

expected: The install dialog's wine section for an eligible, not-yet-installed title (e.g. Avernum 5 before it is installed) shows "Native Steam bridge — Known to work with the bridge" and a "Use the Windows Steam client instead" toggle; toggling it on and installing lands the title in the `GameLibSteam` bottled-Steam path instead of a bridge bottle; the game page's Extra info panel shows the route row beside the compatibility rating once installed.
result: pass — 2026-10-22, packaged debug bundle (sidecar 171b4cbf2 for the game-page check, c1a641a21 for the install). Install dialog for not-yet-installed Avernum 4 (206020): the wine section showed "Native Steam bridge — Known to work with the bridge" with a "Use the Windows Steam client instead" toggle (operator confirmed). With the toggle on, the install landed in the bottled-Steam path: Windows `Steam.exe` was provisioned in `GameLibSteam`, `steamapps/common/Avernum 4` installed with appmanifest StateFlags=4, the install was logged as `source bottle`, and no `GameLibSteamBridge-206020` bottle was created. Game page route row: Avernum 6 shows "Steam route: Native Steam bridge — Known to work with the bridge" beside the rating; Avernum 4 shows "Bottled Steam client — You chose the Windows Steam client". Contract wording note: the row is in the game page's **Install info** tab (rendered by AppleWikiInfo, GamePage/index.tsx:627-628, per 51-UI-SPEC "next to the AppleGamingWiki rating"), not the "Extra info" panel this item names. Implementation matches the UI spec. UX finding: the toggled install queued behind XCOM, and its Windows-Steam setup prompt only appeared ~24 min later, while the operator was starting ELEX, so it read as an ELEX prompt. The download queue also logged "Finished Installation of 206020" at the moment it deferred to guided setup (already in todo 2026-10-22-steam-client-setup-downloads-not-shown-in-downloads-progress.md).

### 9. D-51-08/D-51-11 route-notice dialog

expected: On a known-bad title (one 51-19's own running census classifies known-bad, or any owned title carrying a persisted scan miss), the install dialog names the specific reason and offers two buttons: "Use bottled Steam" (installs through the ordinary bottled path) and "Try the bridge anyway" (D-51-11 — installs then re-scans; a miss lands on the ordinary D-05 fallback dialog). If no owned title currently qualifies as known-bad or scan-missed, record result: skipped — no owned known-bad or scan-miss title (census 51-18) instead of exercising the dialog.
result: skipped — no owned known-bad or scan-miss title (census 51-18). On this fresh Mac no installed or uninstalled owned title currently carries a persisted scan miss, and the bundled knownBad list is still empty. The titles this gate proved incompatible (Hoard 63000 crashes under wine; XCOM 200510 is CEG `drm-wrapped`; ELEX 411300 fails on stubbed Win64 ownership interfaces) only join knownBad in Task 2, after this item, so none could drive the route-notice dialog here.

### 10. D-51-12 Remove all copies on a per-game bridge install

expected: Uninstalling a per-game bridge title (e.g. Avernum 5 from `GameLibSteamBridge-206040`) deletes that `GameLibSteamBridge-<appId>` bottle directory entirely; the legacy `GameLibSteamBridge` bottle and the Phase 17 `GameLibSteam` bottle are both left untouched (`ls ~/Library/Application Support/CrossOver/Bottles` unchanged apart from the removed directory).
result: pass — 2026-10-22, packaged debug bundle, sidecar c1a641a21. Uninstalling Avernum 5 (206040, per-game bridge install) logged `removePerGameBridgeBottle: removed per-game bridge bottle "GameLibSteamBridge-206040" for appId "206040"` (22:27:24). `ls ~/Library/Application Support/CrossOver/Bottles` before/after diff: exactly one line removed (`GameLibSteamBridge-206040`). `GameLibSteam` (the Phase 17 bottled-Steam bottle, holding Avernum 4) and the other five per-game bridge bottles are untouched. Fresh-Mac caveat: the legacy shared `GameLibSteamBridge` bottle never existed on this machine, so its "left untouched" half could not be observed. Pre/post listings archived in the session scratchpad.

### 11. D-51-16 Waiting for Steam

expected: With the bottled Steam client blocked from completing login (signed out, or the same account already playing on another machine) and Play pressed on a `GameLibSteam` (bottled) game, the game page shows "Waiting for Steam…" within roughly 20 seconds, naming the detected cause first in the canonical order [self-update, login, other-session]; a `[bottle-waiting]` line is logged; the waiting state clears once the game actually starts.
result: issue — 2026-10-22, packaged debug bundle, sidecar c1a641a21, bottled-Steam title Avernum 4 (206020) in `GameLibSteam`. Waiting state itself PASSED on both runs. Run 1 (bottled Steam self-updating on first start): Play 22:13:39, `[bottle-waiting] appId=206020 cause=none` 22:13:59 (20s), `cause=self-update` 22:14:30 once Steam's bootstrap log reached the install phase, game started 22:16:12 after sign-in. Run 2 (operator signed out of bottled Steam first, watching the page): Play 22:21:23, the page moved to "Waiting for Steam…" (operator observed), `[bottle-waiting] … cause=none` 22:21:43 (20s); the operator signed in, the game started 22:22:05 (`GameAction … Completed`), and the waiting message cleared (operator observed). Cause naming FAILED for the signed-out case: no `cause=login` was ever named. The login classifier only matches `LogonFailure <reason>` in console_log.txt, and a fresh sign-in prompt is not a logon failure. Self-update was also unnamed during its ~25s *download* phase, because the classifier matches only bootstrap "Installing update...", not "Downloading update (n of m KB)...". Todo 2026-10-22-waiting-for-steam-misses-sign-in-prompt-and-update-download.md.

### 12. D-51-04 desk probe (named real-profile arm)

expected: Running the bundled bridge helper binary directly with `--appid <an unowned AppID> --port 0` reports WHOAMI not-inited; running it with `--appid 480 --identity-only --report-appid <the same unowned AppID>` reports ready. Both outcomes confirm the live fallback precondition the unit tests only assume.
result: pass — 2026-10-22, named real-profile arm (live signed-in Mac Steam; HOME deliberately inherited), against the bundled helper `GameLib.app/Contents/Resources/build/bin/arm64/darwin/steam-bridge-helper`, using a scratchpad CONTROL-WHOAMI client (ordinal 0xFFFF, slot 1). Unowned AppID 1245620 (absent from the account's owned library cache). Arm A: `--appid 1245620 --port 0` gave `LISTEN … appid=1245620 mode=full` then WHOAMI status=1 (not-inited). Arm B: `--appid 480 --identity-only --report-appid 1245620 --port 0` gave `LISTEN … appid=480 mode=identity-only` then WHOAMI status=0 (ready), real SteamID64 returned (matches account, …7096). Both probe helpers were SIGTERMed afterwards and none were left running.

### 13. D-51-15 census

expected: `pnpm bridge-census` run against the final, fully-landed tree prints "N of M routed to the bridge" with every miss classified (win64-no-shim / missing-symbols / unknown-version / known-bad / no-binary); the exact numbers from that run are recorded here verbatim once executed.
result: pass — 2026-10-22, `pnpm bridge-census` against the final tree (HEAD 541544990, allowlist with XCOM knownBad), on this fresh Mac's real bottles. Verbatim: "3 of 6 routed to the bridge (bridge=3, known-bad=1, missing-symbols=1, unknown-version=1)". Rows: 206020 Avernum 4 x86 bridge; 200510 XCOM x86 known-bad drm-wrapped; 206060 Avernum 6 x86 bridge; 411300 ELEX x64 bridge; 63000 HOARD x86 unknown-version (SteamUtils, SteamUser, SteamFriends, SteamMatchMaking, SteamUserStats, SteamNetworking, SteamApps, SteamRemoteStorage all @unknown-version); 648410 Colony Ship x64 missing-symbols (SteamInternal_FindOrCreateUserInterface, SteamInternal_ContextInit). Every miss is classified. Reading it honestly: "routed" is not "runs". ELEX counts as bridge but fails at boot on stubbed Win64 ownership interfaces (item 6). Avernum 4 counts as bridge from its import table, but this machine installed it through bottled Steam (item 8). Hoard's unknown-version disagrees with the live scan, which resolved all of Hoard's versions; 51-18 already recorded this census/live divergence for Hoard. Colony Ship 648410 is a cancelled partial download (20:45:15), so its row reflects incomplete files. Of the gate-tested bridge titles, Avernum 6 is the one that both routes and plays to completion; Avernum 5 routes and launches but is not really playable under wine.

### 14. Re-gate of item 2 — helper teardown on the first launch (Avernum 6, 206060)

expected: On the session's first Play of Avernum 6, `bottleProcessMonitor [206060]: matched process(es) — game started` is logged while the game runs; after a normal quit, `matched process(es) gone` then `stopBridgeHelper` are logged and within 30s `pgrep -fl "steam-bridge-helper --appid 206060"` prints nothing and `lsof -nP -iTCP -sTCP:LISTEN` no longer shows its port; a second launch followed by a force-quit of the game process gives the same teardown; Mac Steam In-Game clears both times.
result: pass — 2026-10-23, HEAD c8729c36a packaged debug bundle. Operator: "14 pass". Log (gamelib.log): first Play of the session 17:15:42 spawns the helper (LISTEN, INIT, HELLO shim attached appid=206060) and 17:15:44 logs `bottleProcessMonitor [206060]: matched process(es) — game started` while the game runs (line 70, no longer deferred until exit); 17:17:39 `matched process(es) gone after 115s of play — game stopped` then `stopBridgeHelper: terminating the bridge helper for appId 206060` and `bridge helper [206060] exited (code=null signal=SIGTERM)` (lines 75-77). Second and third launches repeat the same sequence: gone 17:18:49 after 26s (lines 103-106) and 17:19:06 after 8s (lines 126-129), each followed by stopBridgeHelper and helper exit. The executor did not run pgrep/lsof; the teardown is evidenced by the helper-exit lines and the operator's pass.

### 15. Re-gate of item 6 — ELEX (411300) through the wired Win64 shim

expected: Play launches ELEX from `GameLibSteamBridge-411300`; the placed `steam_api64.dll` next to `ELEX/system/ELEX.exe` has size == the new SHIM64 (848896); `HELLO shim attached appid=411300`; no "not subscribed" error; the game reaches its main menu; Mac Steam shows In-Game ELEX; the `[bridge-notice] appId=411300 reason=stubbed:` line does not list SteamUser, SteamUtils, SteamApps or SteamFriends.
result: issue — 2026-10-23, HEAD c8729c36a packaged debug bundle. Operator: "15 elex does not reach main menu stuck on loading message, but the rest works. noting ELEX is a 'does not run' rating". Bridge half PASSED: launched from GameLibSteamBridge-411300 (line 147), placed ELEX/system/steam_api64.dll is 848896 bytes == SHIM64, `bottleProcessMonitor [411300]: matched process(es) — game started` 17:19:40 (line 148), `HELLO shim attached appid=411300` 17:19:41 (line 149), and the `[bridge-notice] appId=411300 reason=stubbed:` line (145) lists SteamClient, SteamController, SteamGameServer, SteamAppList, SteamHTTP, SteamMusicRemote, SteamMusic, SteamRemoteStorage, SteamScreenshots ... and none of SteamUser, SteamUtils, SteamApps or SteamFriends; no "not subscribed" error. Observed: ELEX hangs on its loading screen and never reaches the main menu (game gone 17:22:49 after 188s, line 156). The wiring gap (stubbed core interfaces, item 6) is closed; the title still does not run for a reason past the bridge handshake, undiagnosed. Disposition per operator: 411300 goes on knownBad as does-not-run (not seed).

### 16. Re-gate of item 11 — Waiting for Steam names sign-in (Avernum 4, 206020)

expected: With bottled Steam signed out (Steam > Sign out in the GameLibSteam client), Play on Avernum 4 shows "Waiting for Steam…" within roughly 20s naming the sign-in cause; `[bottle-waiting] appId=206020 cause=login` is logged within 35s of Play; after signing in the game starts and the waiting state clears. If bottled Steam has an update pending, `cause=self-update` is logged during its `Downloading update` phase; otherwise that half is fixture-proven only (51-24).
result: blocked — 2026-10-23, HEAD c8729c36a packaged debug bundle. Precondition not reached, not a classifier failure. Operator: "did not see message saying waiting for steam, also after quite game game page still says 'launching'". Bottled Steam's steamui_login.txt shows both launches (17:22:59-17:23:11 and 17:24:39-17:24:51) going WaitingForNetwork, WaitingForServerResponse, WaitingForLibraryReady, Success with no WaitingForCredentials: Steam auto-signed-in with remembered credentials despite the sign-out, so `[bottle-waiting] appId=206020 cause=none` (line 171) is correct. The login half of 51-24 stays unproven live; to exercise cause=login the sign-out must also clear remembered credentials (untick remember me or remove the account). The self-update half was not exercised (no update pending). NEW ISSUE found during this item: after quitting Avernum 4 the game page stays on "Launching". The backend saw the stop both times (`matched process(es) gone after 65s of play — game stopped` line 200; `gone after 34s` line 218, each followed by refreshLibrary origin=game-status), but `SteamGame.stop: ... no-op` plus "Aborting not possible. Could not find a matching abort controller for 206020" (lines 196-199) and `raiseFrontmostBottledProcess [launch]: no matching process within ~18s` (lines 169, 212) precede it. Filed as todo 2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits.md.

### 17. XCOM: Enemy Unknown (200510) through bottled Steam (confirms the CEG diagnosis)

expected: The install dialog's known-bad notice names "drm-wrapped" and offers "Use bottled Steam"; choosing it installs through the shared GameLibSteam bottle and Play reaches XCOM's main menu under the bottled Windows Steam client (CEG needs a Windows Steam client). Operator reports main menu yes/no.
result: pass — 2026-10-23, packaged debug bundle, bottled Steam (`GameLibSteam`). The CEG diagnosis is confirmed: operator "enemy within gets to menu,.. unknown crashes". XCOM: Enemy Within reaches its main menu under the bottled Windows Steam client, so CEG needs a Windows Steam client (item 5). The base Enemy Unknown build crashes after its shell starts loading (Launch.log: Steamworks init IsSubscribed TRUE, XComShell loaded, UIFinalShell:OnInit, loading packages, then it ends), a Wine-level crash CrossOver rates 3 stars, not a CEG or bridge cause. Four install and launch findings, filed as todos. (1) The known-bad notice offered "Use bottled Steam", but GameLib's native depot download into GameLibSteam failed closed at 20:22:07: `post-download structural re-verification found 11 of 9723 planned entries damaged or missing — failing closed to StateFlags=1026`; all 11 are under `XEW\XComGame\...` and correlate with `buildDepotPlan: UNRESOLVED cross-depot path collision ... claimed by depot(s) 200522,225341` (extends todo 2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md). (2) The button then sat at "Restart Steam to finish", disabled, with no way in the app to start bottled Steam; the operator started it by hand (`wine --bottle GameLibSteam steam.exe steam://install/200510`), bottled Steam adopted and repaired the files, and polling flipped to installed at 20:42:29. (3) On Play GameLib sends `steam.exe -applaunch 200510` and logs `[bottle-waiting] appId=200510 cause=none` ~20s later, then the Play button reverts, but the game starts later (DXSETUP.exe 20:49:16, 38s after the 20:48:38 click; XCOMLauncher.exe 21:14:06); repeated clicks queue more -applaunch dispatches, and the stated waiting causes (updating, sign in, running elsewhere) did not apply. Log lines: `launching appId 200510 via the bottled Steam client` 20:42:40; `bottleProcessMonitor [200510]: matched process(es) — game started` 20:49:16 and 21:14:06; `gone after 31s of play` 21:14:37.

### 18. The Age of Decadence (230070) through the bridge (D-51-14 replacement anchor)

expected: `pnpm bridge-census` (or the install dialog's scan verdict) first shows 230070 as x86 and requiring SteamApps, SteamUserStats and SteamRemoteStorage; if it shows no-steam-api or x64, the fallback is Legends of Eisenwald (246760). With the default route the game installs, Play launches it from `GameLibSteamBridge-230070`, `HELLO shim attached appid=230070` is logged, it reaches a playable state, and Mac Steam shows In-Game. Operator reports playable yes/no and the install dialog's route line.
result: pass — 2026-10-23, packaged debug bundle. Operator: "main menu yes, play game yes. yes shows in-game". Anchor condition as run: the operator chose "Play AoD now, decide after", and AoD ships both AoD.exe (x86) and AoD64.exe (x64); the game ran on its x64 build (AoD64.exe), so this gates the x64 runtime-lookup path (SteamInternal_CreateInterface, like ELEX), not the bare-accessor shape originally preferred. Install via the bridge: 21:18:49 `prescreenBridgeDepots: appId 230070 result=both in 2086ms`; per-game bottle GameLibSteamBridge-230070 created 21:19:00; StateFlags=4 written 21:20:02; `placeShimForGame: overwrote steam_api64.dll for appId 230070 ... (8 imported symbol(s) covered)`. Persisted verdict: steamApi both, scan clean, arch x64; required interfaces include SteamApps STEAMAPPS_INTERFACE_VERSION008, SteamUserStats STEAMUSERSTATS_INTERFACE_VERSION011, SteamRemoteStorage STEAMREMOTESTORAGE_INTERFACE_VERSION013 (stubbed), plus SteamUser019, SteamFriends015, SteamUtils008. Launch (21:21): helper `LISTEN 127.0.0.1:<port> appid=230070 mode=full`, `INIT SteamAPI ready (single InitFlat call, real appid=230070)`, `[bridge-notice] appId=230070 reason=stubbed:...`, game started 21:21:14, `HELLO shim attached appid=230070` 21:21:21, game gone after 452s 21:28:47 followed by `stopBridgeHelper`. Mac Steam showed In-Game. steam_api64.dll on disk is 848896 bytes (the shim); the x86 steam_api.dll is untouched at 213072 bytes. CENSUS DISCREPANCY: `pnpm bridge-census` reports `| 230070 | The Age of Decadence | Age of Decadence | x86 | missing-symbols | no | SteamInternal_CreateInterface, SteamAPI_GetHSteamUser, SteamAPI_GetHSteamPipe, ... |` (summary: 6 of 7 routed to the bridge; 1 of 7 verified running; 2 of 7 fully covered by the shim). The census scanned the x86 AoD.exe and steam_api.dll while install-time scan, shim placement and launch all used x64, so for a dual-arch title the census contradicts what actually runs. Filed as a todo; 51-30's closing census depends on it.
### 19. Representative sample — install through the default route and play (D-51-15 input)

expected: Every sampled title installs through GameLib's default route on the packaged build; its install logs `prescreenBridgeDepots: appId <id> result=<x>` and the route; every bridge-routed title is launched and reaches playable state or has its failure cause recorded; bottle-routed titles record their route reason. Per title also record the install-time persisted scan verdict (steam_metadata.json `bridge.scan`) and the launched exe from the log, and flag dual-arch titles (the census scans the x86 binary of those).
result: pass — 2026-10-24, 51-30. Every one of the 12 sampled titles has a recorded outcome (51-29 operator evidence, gamelib.log and gamelib.log archives, steam_metadata.json). Sample drawn and approved at the 51-29 Task 2 checkpoint (operator: "Known size only, redraw (Recommended)"). Outcome counts: 12 of 12 routed to the bridge, none bottled; 6 play offline without a clean in-game Steam init; 6 do not run; 0 verified running (HELLO plus a clean game-side Steam init). No dual-arch title in the sample. Per-title record (prescreen from gamelib.log; scan arch/status from steam_metadata.json bridge.scan; "n/l" = no prescreen line in any retained log):

| appId | Title | Prescreen | Route | Persisted scan | Bridge play outcome |
|---|---|---|---|---|---|
| 1167950 | Vampire's Fall: Origins | result=x64 | bridge | x64 miss (steam_api64.dll runtime-loaded, Unity plugin) | HELLO yes; plays offline; game log EntryPointNotFound SteamAPI_ISteamClient_GetISteamUser (flat API) |
| 219990 | Grim Dawn | n/l | bridge | x64 miss | NOT playable: exits after 2s; SteamStub .bind, then modern-SDK exports; no HELLO |
| 1284190 | The Planet Crafter | n/l | bridge | x64 miss (runtime-loaded, Unity plugin) | HELLO yes; plays offline 116s; same flat-API failure |
| 1782460 | Hell Clock | result=x64 | bridge | x64 miss (runtime-loaded, Unity plugin) | no HELLO; plays offline 137s; EntryPointNotFound SteamInternal_SteamAPI_Init (modern-SDK exports) |
| 1363080 | Manor Lords | n/l | bridge, no-steam-api, no helper | x86 clean (reads the UE bootstrap exe; Win64 shipping binary and Engine/.../Win64/steam_api64.dll missed) | n.a. no shim placed; plays offline with the Valve DLL, no Steam |
| 1691190 | Rogue Waters | result=x64 | bridge | x64 miss (runtime-loaded, Unity plugin) | HELLO yes; NOT playable: hangs on loading screen twice; GetISteamUser and SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck missing (flat API) |
| 427410 | Abiotic Factor | result=x64 | bridge, no-steam-api | x86 clean (UE bootstrap exe) | n.a. no shim placed; plays offline 82s |
| 648800 | Raft | result=x64 | bridge (SteamStub .bind informational) | x64 miss (runtime-loaded) | NOT playable: exits after about 4s; SteamStub; no HELLO |
| 284100 | Unclaimed World | result=both | bridge | x64 miss (steam_api.dll and steam_api64.dll runtime-loaded) | NOT playable: startup error, Windows Media Player missing in the bottle (bottle runtime component, not a bridge defect); no HELLO |
| 1119730 | Ranch Simulator | result=x64 | bridge, no-steam-api | x86 clean (UE bootstrap exe) | NOT playable: exits after 2-3s; no shim placed; UE scan miss then modern-SDK exports |
| 1603180 | Mining Mechs | result=x64 | bridge | x64 miss (Steamworks_x64.dll imports SteamInternal_SteamAPI_Init/ContextInit/FindOrCreateUserInterface) | NOT playable: serious-problem dialog, gone after 44s; no HELLO |
| 3410180 | Overlooting | result=x64 | bridge | x64 miss (runtime-loaded; DRM detector could not parse the 322 MB exe as PE) | NOT playable: same dialog; no HELLO |

Prescreen todo disposition (live half of 51-22): Rogue Waters (1691190) ships its steam_api64.dll in a subfolder (`RogueWaters_Data/Plugins/x86_64/steam_api64.dll`, listed from its bottle) and logged `prescreenBridgeDepots: appId 1691190 result=x64 in 5062ms` (08:45:53, 2026-10-24); Vampire's Fall: Origins (`Vampire's Fall Origins_Data/Plugins/x86_64/steam_api64.dll`) logged `result=x64` (21:45:48, 2026-10-23), and Raft, Hell Clock, Ranch Simulator, Abiotic Factor logged x64 for subfolder DLLs too. No subfolder-DLL title logged `none`, so there is no 51-22 regression and the todo is closed (moved to completed/). Prescreen lines for 219990, 1284190 and 1363080 are absent from every retained log (including the .pre-51-28, .pre-51-29 and .51-29-batch0 archives).

Sample rule (fixed before any install): 197 owned Windows-only titles; exclude already-measured and allowlist seed/knownBad appIds; eligible = Steam type game, known developer, KNOWN parseable size <= 15 GB (75 titles); order by sha256("gamelib-51-29:" + appId) ascending; take 12, at most 2 per developer. Sizes are approximate (store minimum-requirements text). Drawn (appId, title, developer, GB, CrossOver rating): 1167950 Vampire's Fall: Origins, Early Morning Studio, 1.5, none; 1119730 Ranch Simulator, Toxic Dog, 15, none; 219990 Grim Dawn, Crate Entertainment, 5, 5; 1363080 Manor Lords, Slavic Magic, 15, 5; 1284190 The Planet Crafter, Miju Games, 4, 5; 648800 Raft, Redbeet Interactive, 10, 4; 1782460 Hell Clock, Rogue Snail, 2, none; 284100 Unclaimed World, Refactored Games, 0.6, none; 1691190 Rogue Waters, Ice Code Games, 6, none; 427410 Abiotic Factor, Deep Field Games, 10, none; 3410180 Overlooting, Posing Possums, 0.5, none; 1603180 Mining Mechs, Delayed Victory, 0.2, none. Total approx 69.8 GB. Titles without steam_api are outside the Steamworks-using denominator.

Seed and knownBad disposition (strict criterion, operator decision 2026-10-24 "keep it strict": verified = HELLO shim attached for the appId AND a clean game-side Steam init in the game's own log; no game log is unverified; Mac Steam In-Game never counts). No sampled title meets it, so no seed entry was added. The existing seed entries stay: under the strict rule AoD (230070, item 18) and Avernum 6 (206060, item 1) are "played with shim attached but unverified" (no game-side log confirming a clean Steam init), as is the XCOM CEG evidence of item 17 (which was bottled Steam, not the bridge). Unclaimed World (284100), the only non-bridge failure, was NOT added to knownBad: no existing reason fits honestly (drm-wrapped, win64-only and p2p-required are false; does-not-run implies a Wine-level incompatibility, but the cause is a missing Windows runtime component the bottle could provision, with pending todo 2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md). Every other failing title is a fixable bridge or scan defect with a pending todo and is not on knownBad.



Sample rule (fixed before any install): 197 owned Windows-only titles; exclude already-measured and allowlist seed/knownBad appIds; eligible = Steam type game, known developer, KNOWN parseable size <= 15 GB (75 titles); order by sha256("gamelib-51-29:" + appId) ascending; take 12, at most 2 per developer. Sizes are approximate (store minimum-requirements text). Drawn (appId, title, developer, GB, CrossOver rating): 1167950 Vampire's Fall: Origins, Early Morning Studio, 1.5, none; 1119730 Ranch Simulator, Toxic Dog, 15, none; 219990 Grim Dawn, Crate Entertainment, 5, 5; 1363080 Manor Lords, Slavic Magic, 15, 5; 1284190 The Planet Crafter, Miju Games, 4, 5; 648800 Raft, Redbeet Interactive, 10, 4; 1782460 Hell Clock, Rogue Snail, 2, none; 284100 Unclaimed World, Refactored Games, 0.6, none; 1691190 Rogue Waters, Ice Code Games, 6, none; 427410 Abiotic Factor, Deep Field Games, 10, none; 3410180 Overlooting, Posing Possums, 0.5, none; 1603180 Mining Mechs, Delayed Victory, 0.2, none. Total approx 69.8 GB. Titles without steam_api are outside the Steamworks-using denominator.

### 20. D-51-15 closing census on the representative sample

expected: pnpm bridge-census against the sample prints N of M routed and K of M verified running with every row classified; numbers recorded verbatim.
result: pass — 2026-10-24, 51-30, after quick 261024-f0w (strict criterion: HELLO plus a clean game-side Steam init; "Play recorded (allowlist)" is a separate column). Every row is classified. The census covers the 19 installed titles (the 12 sampled plus Avernum 4, Avernum 6, AoD, XCOM, ELEX, HOARD and Colony Ship). Verbatim summary line:

`18 of 19 routed to the bridge; 0 of 19 verified running through the bridge (HELLO + clean game log; 1 init-failed, 18 unverified); 2 of 19 play recorded in the allowlist; 15 of 19 symbols covered by the shim (static scan) (bridge=3, known-bad=3, missing-symbols=1, no-steam-api=12)`

Verbatim table:

| AppID | Name | Installdir | Arch | Class (static scan) | Play recorded (allowlist) | Evidence | Detail |
|---|---|---|---|---|---|---|---|
| 200510 | XCOM: Enemy Unknown | XCom-Enemy-Unknown | x86 | known-bad | no | unverified (no per-game bridge bottle) | drm-wrapped |
| 206020 | Avernum 4 | Avernum 4 | x86 | bridge | no | unverified (no per-game bridge bottle) |  |
| 1119730 | Ranch Simulator | Ranch Simulator | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 1167950 | Vampire's Fall: Origins | Vampire's Fall Origins | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 1284190 | The Planet Crafter | The Planet Crafter | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 1363080 | Manor Lords | Manor Lords | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 1603180 | Mining Mechs | Mining Mechs | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 1691190 | Rogue Waters | RogueWaters | none | no-steam-api | no | init-failed (SteamAPI_ISteamClient_GetISteamUser) | launch exe imports no steam_api and none ships in the install tree |
| 1782460 | Hell Clock | Hell Clock | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 206060 | Avernum 6 | Avernum 6 | x86 | bridge | yes | unverified (no HELLO) |  |
| 219990 | Grim Dawn | Grim Dawn | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree; SteamStub .bind section (informational) |
| 230070 | The Age of Decadence | Age of Decadence | x64 | bridge | yes | unverified (no HELLO) |  |
| 284100 | Unclaimed World | Unclaimed World | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 3410180 | Overlooting | Overlooting | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 411300 | ELEX | ELEX | x64 | known-bad | no | unverified (no HELLO) | does-not-run |
| 427410 | Abiotic Factor | AbioticFactor | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree |
| 63000 | HOARD | Hoard | x86 | known-bad | no | unverified (no HELLO) | does-not-run |
| 648410 | Colony Ship: A Post-Earth Role Playing Game | Colony Ship RPG | x64 | missing-symbols | no | unverified (no HELLO) | SteamInternal_FindOrCreateUserInterface, SteamInternal_ContextInit |
| 648800 | Raft | Raft | none | no-steam-api | no | unverified (no HELLO) | launch exe imports no steam_api and none ships in the install tree; SteamStub .bind section (informational) |

Static-class blind spot (recorded, not fixed here): the class column reads `no-steam-api` for runtime-loaded and Unity-plugin steam_api (for example 1691190, 1167950, 1284190) and for Unreal titles whose bootstrap exe was scanned instead of the shipping binary, so the 12 `no-steam-api` rows are not evidence that those titles do not use Steamworks; the install trees of all 12 sampled titles ship a steam_api DLL (persisted scans show runtime-loaded misses). Tracked by todos 2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md (part 2) and 2026-10-24-bridge-scan-reads-unreal-bootstrap-exe-and-misses-the-shipping-binary.md. The Evidence column's "unverified (no HELLO)" reflects retained gamelib.log / gamelib.log.old only; it undercounts HELLOs seen in earlier sittings.

Separate count, never folded into K: played with shim attached but unverified under the strict rule (HELLO recorded in a live session, no clean game-side Steam init or no game log): AoD 230070 (item 18, 452s, no game log), Avernum 6 206060 (item 1), plus the sample titles whose HELLO was logged but whose game log shows a Steam-init failure (1167950, 1284190, 1691190, init-failed). Of these only 1167950 and 1284190 play (offline).

## Summary

total: 20
passed: 11
issues: 6
pending: 0
skipped: 2
blocked: 1

Run 2026-10-22 on a fresh Apple-silicon Mac (no prior Steam, CrossOver or bottles). Items 1-4, 7 and 12 ran with the sidecar at 171b4cbf2; items 5, 6, 8-11 and 13 ran at c1a641a21+ (c1a641a21 fixed backslash launch-exe paths mid-gate; 541544990 grew the allowlist).

D-51-14 anchor re-baselined by operator decision 2026-10-23 (option named-title, 230070, The Age of Decadence), in place of the locked Hoard (63000) anchor. Hoard is retired: it crashes under Wine regardless of the bridge (item 4), and it is on knownBad. XCOM is CEG DRM-wrapped (item 5), confirmed by item 17: Enemy Within reaches its menu under bottled Steam. ELEX stopped on stubbed Win64 ownership interfaces (item 6), and after the wiring it still hangs on loading (item 15, does-not-run). The replacement anchor passes (item 18): AoD plays through the bridge with SteamApps, SteamUserStats and SteamRemoteStorage in its required set. Still open: AoD was gated on its x64 runtime-lookup path (SteamInternal_CreateInterface, like ELEX), not through the bare accessors Hoard used, so bare-accessor x86 import coverage has no live play-through evidence; and `pnpm bridge-census` misreports AoD as `x86 | missing-symbols` because it scans the x86 binary of a dual-arch title (todo filed, needed before 51-30's closing census). Avernum 6 passes; Avernum 5 launches through the bridge.

ROADMAP hazard (b) acknowledged: for titles that still route to the shared `GameLibSteam` bottled-Steam path (now including knownBad XCOM, and any user-forced title like Avernum 4 here), per-executable Wine overrides under `HKCU\Software\Wine\AppDefaults\<game>.exe` remain the documented stopgap. Nothing in this phase removes that path.

Re-gate 2026-10-23 (plan 51-27, packaged build at c8729c36a): item 14 passes and closes the helper-teardown gap (item 2). Item 15 closes the stubbed Win64 core-interface gap (item 6) at the wiring level but records an issue: ELEX hangs on its loading screen and is classified does-not-run (knownBad). Item 16 is blocked: bottled Steam auto-signed-in with remembered credentials, so the login-cause half of the item 11 gap is still unproven live; it also surfaced a stuck-on-Launching defect after a bottled-Steam game exits.

"Most" verdict (D-51-15, 2026-10-24): goal NOT met. Item 20, verbatim: `18 of 19 routed to the bridge; 0 of 19 verified running through the bridge (HELLO + clean game log; 1 init-failed, 18 unverified)`, so N=18, K=0, M=19 on the strict criterion (HELLO plus a clean game-side Steam init; no game log is unverified; Mac Steam In-Game never counts). In the item 19 sample 12 of 12 were bridge-routed, 6 play offline, 6 do not run, 0 verified. Operator option: unmet-follow-up, answer recorded verbatim: "Unmet, follow-up phase (Recommended)"; follow-up phase name: Steam bridge coverage: modern-SDK exports, flat API, engine-layout scan, SteamStub forwarder, bottle runtime components. Phase 51 closes on the mechanism it built (per-app bridge bottle, helper, shim, routing, census evidence). Dominant miss classes, ranked by sample reach: (1) modern-SDK SteamInternal exports, (2) flat API for Unity Steamworks.NET, (3) Unreal bootstrap-exe scan miss, (4) SteamStub forwarding steamclient, (5) bottle Windows runtime components. The follow-up phase is to be added with /gsd-add-phase.

## Gaps

<!-- YAML format for plan-phase --gaps consumption -->
- truth: "Quitting a bridge game frees its helper port on the game's first launch"
  status: failed
  reason: "Avernum 5 first launch: helper still LISTENing 6m39s after the game was gone; no bottleProcessMonitor line for that launch"
  severity: major
  test: 2
  root_cause: "fireBridgeWineLaunch awaits runWineCommand, which resolves only on winewrapper close, before starting the monitor; each launch's monitor starts after its own game exits"
  artifacts: [src/backend/storeManagers/steam/games.ts, src/backend/launcher.ts, src/backend/storeManagers/steam/bottleProcessMonitor.ts]
  missing: ["start the monitor without awaiting the wine child"]
  debug_session: ".planning/todos/pending/2026-10-22-bridge-process-monitor-starts-after-game-exits.md"
- truth: "Hoard (63000) reaches playable single-player through the bridge (D-51-14 anchor)"
  status: failed
  reason: "User reported: crash dialog; Hoard crashed under CrossOver before the bridge existed, exact same behavior"
  severity: major
  test: 4
  root_cause: "Hoard is incompatible with wine/CrossOver itself; the bridge half (LISTEN/INIT/HELLO, stubbed notice, limited-features line) passed"
  artifacts: []
  missing: ["a wine-level fix or a decision to retire Hoard as the acceptance anchor"]
  debug_session: ""
- truth: "XCOM (200510) reaches its main menu through the bridge"
  status: failed
  reason: "User reported: pressed play, nothing launched"
  severity: major
  test: 5
  root_cause: "Steam CEG DRM: the exe reads STEAM_SPLIT_GUID/STEAM_GUIDD/STEAM_MINSTANCE, writes .STEAMSTART, waits for a Windows Steam client and exits without SteamAPI_Init (inferred from a cx-log trace)"
  artifacts: [src/backend/storeManagers/steam/bridge/bridge-allowlist.json]
  missing: ["CEG detection in prescreen/scan", "bottled-Steam confirmation run"]
  debug_session: ".planning/todos/pending/2026-10-22-detect-steam-ceg-drm-in-bridge-prescreen.md"
- truth: "ELEX (411300) reaches its main menu through the Win64 bridge, and the prescreen logs it as x64"
  status: failed
  reason: "User reported: Steam error 'Your account is not subscribed to this application [AppID: 411300]'"
  severity: major
  test: 6
  root_cause: "SHIM64_SERVED_INTERFACE_VERSIONS serves SteamUser019/SteamApps008/SteamUtils008/SteamClient017 as stub only. Separately, the prescreen takes POSIX basename() of backslash depot paths, so subfolder steam_api*.dll is missed"
  artifacts: [src/backend/storeManagers/steam/bridge/shimCoverage.ts, src/backend/storeManagers/steam/depot.ts]
  missing: ["wire the x64 core interfaces after a live accessor probe", "normalise separators in screenDepotPlanForSteamApi"]
  debug_session: ".planning/todos/pending/2026-10-22-wire-win64-core-steam-interfaces.md"
- truth: "Waiting for Steam names the detected cause for a signed-out bottled Steam"
  status: failed
  reason: "cause=none for the whole wait while the operator sat at the sign-in prompt; self-update also unnamed during its download phase"
  severity: minor
  test: 11
  root_cause: "classifyBottledSteamBlock matches only LogonFailure for login and only 'Installing update...' for self-update"
  artifacts: [src/backend/storeManagers/steam/bottleLaunchSignals.ts]
  missing: ["sign-in prompt and update-download detection"]
  debug_session: ".planning/todos/pending/2026-10-22-waiting-for-steam-misses-sign-in-prompt-and-update-download.md"
- truth: "ELEX (411300) reaches its main menu through the Win64 bridge"
  status: failed
  reason: "Re-gate item 15: wiring verified (no stubbed core interfaces, no subscription error) but ELEX hangs on its loading screen; operator rates it does-not-run"
  severity: major
  test: 15
  root_cause: "undiagnosed past the bridge handshake"
  artifacts: [src/backend/storeManagers/steam/bridge/bridge-allowlist.json]
  missing: ["none planned: 411300 is knownBad does-not-run"]
  debug_session: ".planning/todos/pending/2026-10-22-wire-win64-core-steam-interfaces.md"
- truth: "Waiting for Steam names the sign-in cause for a signed-out bottled Steam"
  status: unverified
  reason: "Re-gate item 16 blocked: bottled Steam auto-signed-in with remembered credentials, so the login state was never reached"
  severity: minor
  test: 16
  root_cause: "test precondition: sign-out did not clear remembered credentials"
  artifacts: [src/backend/storeManagers/steam/bottleLaunchSignals.ts]
  missing: ["re-run with remembered credentials cleared"]
  debug_session: ".planning/todos/pending/2026-10-22-waiting-for-steam-misses-sign-in-prompt-and-update-download.md"
- truth: "A bottled-Steam game's page returns from Launching to Play after the game exits"
  status: failed
  reason: "Item 16: backend logs game stopped twice, page stays on Launching"
  severity: major
  test: 16
  root_cause: ""
  artifacts: []
  missing: ["investigate"]
  debug_session: ".planning/todos/pending/2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits.md"
