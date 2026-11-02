---
status: testing
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
source: [59-13-PLAN.md]
---

# Phase 59 UAT: Steam engine fallback when CrossOver is unavailable

## How to run

- Normal start: `pnpm tauri:dev:run`.
- Hide CrossOver: `sandbox-exec -f .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb pnpm tauri:dev:run`.
- Expire the trial: `sandbox-exec -f .planning/spikes/060-crossover-trial-expiry/nolicence.sb pnpm tauri:dev:run`.
- `tauri dev` does not rebuild the sidecar: after backend changes restart dev and confirm the mtime of `sidecar.js` is newer than the change.
- Quit any running game before switching profiles.
- Record the licence mtime before starting: `ls -la ~/Library/Preferences/com.codeweavers.CrossOver.license`; it must be unchanged at the end.
- Nothing here renames, moves or edits /Applications/CrossOver.app or the licence file.

## Tests

### 1. Healthy CrossOver launch stays on CrossOver
expected: (D-07, D-14) With a healthy CrossOver and no profile, launching an installed bridge title shows no badge and no download, the launch log has `engine=crossover build=26.3.0.39832 reason=cx-healthy`, and there is no untested-build line.
result: pass — Hoard (63000): `SteamEngine: appId 63000 uses engine=crossover build=26.3.0.39832 reason=cx-healthy`, no badge, no download.

### 2. No-CrossOver install downloads the built-in engine
expected: (D-01, D-02, D-05) Under no-crossover.sb, installing a small not-yet-installed bridge title (operator's choice) shows "Downloading built-in engine (N%)"; `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<appid>/cxbottle.conf` has the seven minimal lines and `drive_c/users/crossover` exists.
result: issue — bottle correct (cxbottle.conf has the 7 minimal lines, drive_c/users/crossover exists, Hoard installed after Steam re-sign-in), but the progress label showed only "Downloading built-in engine (0%)" throughout; see gaps G1, G2.

### 3. No-CrossOver launch runs on the built-in engine
expected: (D-04, D-06, D-11) Under no-crossover.sb the launch toast reads "CrossOver not found — using built-in engine", the "Built-in engine (best-effort)" badge shows, the no-CrossOver note is dismissible and stays dismissed after reopening the page, and the game keeps running past 180 s. Make a save in this session.
result: pass — retest after 9e2509cf2: Hoard on `engine=pinned … version=11.20 reason=cx-missing`, deadline `cancelled (first-match)` 2 s after launch via the monitor, game ran 851 s with no "did not start" dialog; badge and Get-CrossOver panel shown. Toast not verifiable under `tauri dev` (G6). First run (before the fix) had the deadline stop the running game: G3-G5.

### 4. CrossOver adopts the fallback-made bottle
expected: (D-03, D-07) Restart without the profile and launch the same title: it runs on CrossOver, cxbottle.conf gains a Timestamp line, `current_dxvk-macOS` is gone, the item 3 save is present, and the badge is gone.
result: pass — retest after 5a6f4f877: engine switch `pinned:wine-staging-11.20 -> crossover` removed the dxvk-macOS version file, DLL overrides and DXVK DLLs and restored stock Wine DLLs in the bottle (10:37:59-10:38:19); `current_dxvk-macOS` gone; Hoard ran on `engine=crossover build=26.3.0.39832 reason=cx-healthy`. Earlier run: cxbottle.conf gained `"Version" = "26.3.0.39832"` and `"Timestamp" = "20260715T103801Z"`, badge gone. Save check n/a (Hoard has no saves). First run left DXVK in place: G7.

### 5. D3D11 title on the built-in engine
expected: (D-05, D-07) Planet Crafter or Avernum 6 under no-crossover.sb renders, then returns cleanly to CrossOver when launched without the profile.
result: pass — The Planet Crafter under no-crossover.sb: engine switch `crossover -> pinned:wine-staging-11.20` installed dxvk-macOS, `engine=pinned … reason=cx-missing`, deadline cancelled at first match, renders fine; back under the normal profile the switch `pinned -> crossover` removed DXVK (`current_dxvk-macOS` gone, marker crossover) and it ran on `engine=crossover build=26.3.0.39832 reason=cx-healthy`.

### 6. Trial notice at 7 days or fewer
expected: (D-13) With operator approval, under nolicence.sb, backdate ONE throwaway bridge bottle with spike-060 backdate.py to 5 days remaining: its game page shows a notice with "5 days remaining" and Buy CrossOver. Backdate to 10 days remaining: no notice.
result: pass — operator-approved throwaway bottle GameLibSteamBridge-38400 (Fallout), system.reg backed up first. Under nolicence.sb, `--demo-status` read 15 days remaining fresh (InstallTime 0x614a692d; encoding is Unix time XOR 0x0badda6d). At 0x6177c54f ("5 days remaining") the page showed the notice with Buy CrossOver (probe `status=trial`); at 0x614d629b ("10 days remaining") no notice. No other bottle gained a trial clock.

### 7. Expired trial routes to the built-in engine
expected: (D-06, D-09, D-12) The same bottle backdated past expiry, under nolicence.sb: launch shows "CrossOver trial expired — using built-in engine" and the game runs.
result: pass — Fallout (38400) at "Demo version (expired 5 days ago)" (InstallTime 0x616128a3) under nolicence.sb: probe `status=expired`, launch `engine=pinned … reason=cx-expired`, switch `crossover -> pinned:wine-staging-11.20` installed DXVK, game ran. Badge shows only "Built-in engine (best-effort)"; the reason ("CrossOver trial expired") is only in its hover tooltip, and the toast does not show in dev (G6). The monitor never matched the game, launched by host path (G8, fixed in 1a5b750bb).

### 8. Game didn't start after the deadline
expected: (D-10, D-11) On the same expired bottle, set the title's override to CrossOver and launch: after about 180 s a "Game didn't start" dialog appears, `ps` shows no wine process for that bottle, and there is no bottled-Steam dialog. Set the override back to Automatic afterwards.
result: pass — Fallout on the expired bottle, override CrossOver, under nolicence.sb: launch at 11:13:26 (`engine=crossover build=26.3.0.39832 reason=override`) sat behind CodeWeavers' Expired Bottle dialog (left untouched); `launch deadline fired … after 180002 ms` at 11:16:26 with the right engine label; in-app didnt-start dialog `display=confirmed`; no wine process left for the bottle; no steamBridgeSetupRequired or bridge-failed mark. Before the launch the expired dialog appeared once per DXVK-restore step (G10); operator cancelled one.

### 9. Override section and Unsupported badge
expected: (D-14, D-08) Advanced > Engine (advanced) is collapsed with Automatic as default and lists CrossOver and the pinned build; selecting one shows a warning and the "Unsupported engine" badge; the launch log shows the chosen engine and version; no rollback toggle exists anywhere.
result: pass — retest after 5cc3007a3: section collapsed with Automatic by default; after a restart the stored "Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" shows with the red Unsupported warning, the game page shows "Unsupported engine", the launch logged `engine=pinned name="Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" version=11.20 reason=override`, no rollback or previous-version toggle anywhere, and back on Automatic the badge clears. Earlier runs: G11 (override did not read back), G9 (CrossOver labelled unsupported); UX issues in G12.

### 10. DRM title without CrossOver
expected: (D-09 discretion) Under no-crossover.sb a SteamStub title shows the CrossOver-required message and never hangs.
result: pass — Grim Dawn (219990, SteamStub `.bind` on its exes; Raft 648800 also qualifies) under no-crossover.sb: both Play presses showed "This game uses Steam DRM support that needs CrossOver (CrossOver not found)…", logged `drm launch needs CrossOver but pre-flight is missing; not launching (no built-in engine, no fallback)` (12:33:29, 12:33:52), no wine command or monitor started, no hang.

### 11. Fallback-made bottle survives a different engine build
expected: (RESEARCH Open Question 4) Set the item 3 title's override to an installed Wine Manager Wine-Staging-macOS build other than 11.20, under no-crossover.sb: wine does a silent prefix update, the game launches, the item 3 save is present, and after setting the override back to Automatic it launches on the pinned build again. If no other Wine-Staging-macOS build is installed, record skipped with that reason.
result: skipped — no other Wine-Staging-macOS build is installed: Wine Manager's `Wine-Staging-macOS-latest` is also 11.20 (`wine-11.20 (Staging)`), the same build as the pin.

### 12. Sidecar exits after quit
expected: (sidecar exit contract) After quitting the app following items 2-11, `pgrep -f sidecar` is empty within 10 s.
result: pass — after Cmd-Q the sidecar (`build/main/sidecar.js`) was gone 0.0 s after `gamelib-shell` exited and `pgrep -f sidecar` was empty (the one transient match was the pnpm `tauri:dev:run` wrapper command line).

## Re-UAT (gap closure 59-14..59-22)

Run order groups by environment: A (no-crossover.sb, item 13 and 19 and 15 prerequisites), B (engine absent), C (nolicence.sb), D (no profile). The numbers below are stable; the order is in the 59-23 checkpoint.

### 13. Install checks Steam sign-in before any engine work
expected: (G2) Under no-crossover.sb with the Steam session signed out, installing a not-installed bridge title is refused with the sign-in prompt, no new `GameLibSteamBridge-<appid>` directory appears and no engine download starts.
result: pending

### 14. No-CrossOver install shows real engine progress and runs redists on the built-in engine
expected: (G1, CR-02, D-05) With the pinned engine moved aside (operator go-ahead) and signed in, the label climbs through "Downloading built-in engine (N%)" with N increasing; HARD PASS REQUIREMENT: N advances past 0% to at least one intermediate value before the download ends, a label stuck at 0% or jumping from 0% to the next phase is an issue. Then "Verifying built-in engine" and "Unpacking built-in engine"; the install-time redist lines in the log run the pinned wine (path under the engine root) and no redist entry fails on a missing CrossOver binary. Prior evidence 2026-11-02 (59-22): Dungeons of Dredmor (98800), i386-recovery path, no CrossOver, engine absent, phases showed in order (downloading, verifying, unpacking, setting up, installing) and the install button was disabled then read "Installing..." (158bc680e); redist lines not yet checked.
result: pending

### 15. Fallback launch is announced in the app
expected: (G6, D-06, IN-05) Under no-crossover.sb, launching an installed bridge title shows the in-app notice "CrossOver not found — using built-in engine" in the dev build, and the badge shows "Built-in engine (best-effort)" with "CrossOver not found" visible without hovering; after the download in item 14, the label shows "Setting up built-in engine" before "Launching".
result: pending

### 16. Expired bottle switch shows the Expired dialog at most once
expected: (G10) On the operator-approved throwaway bottle backdated past expiry, with its marker on pinned, under nolicence.sb, override CrossOver and launch: the log shows the DXVK restore running on the built-in engine, no CodeWeavers Expired Bottle dialog appears before the launch itself, and afterwards `current_dxvk-macOS` is gone and `.gamelib-engine.json` says crossover. Set the override back to Automatic.
result: pending

### 17. CrossOver override is supported
expected: (G9) Choosing CrossOver in Engine (advanced) shows no red Unsupported warning and the game page shows no Unsupported badge; choosing the pinned build shows both.
result: pending

### 18. Override shows the stored value and Automatic sticks
expected: (G12, WR-05) After a restart with a non-automatic stored override, opening Settings immediately shows the stored engine (disabled while options load), never Automatic; choosing Automatic once logs one `Setting steamEngineOverride to "automatic"` and survives a restart. With operator approval, hand-set `steamEngineOverride` in that title's GamesConfig JSON to `wine-manager:0.0-missing`: the select shows "Wine Manager: 0.0-missing (not installed)" selected, and one click on Automatic saves.
result: pending

### 19. Engine UI only for bridge titles
expected: (WR-04) Under no-crossover.sb, a native macOS Steam title's page shows no no-CrossOver note and no engine badge, and its settings have no Engine (advanced) section; a not-installed Windows title's page shows none either.
result: pending

### 20. Return to CrossOver without the pin on disk
expected: (CR-03) Prepare a title on the built-in engine (item 15), quit, move the pinned engine aside (operator go-ahead), start without a profile and launch it: the log shows the restore source being downloaded (or, offline, a `dxvk-failed` restore with the marker left on pinned and a retry on the next launch); `.gamelib-engine.json` says crossover only when `current_dxvk-macOS` is gone.
result: pending

### 21. Quit during the engine download, and a running game outlives the deadline
expected: (WR-11, CR-01 regression) With the pinned engine moved aside, start a no-CrossOver install, Cmd-Q during "Downloading built-in engine", and `pgrep -f build/main/sidecar.js` is empty within 10 s, no new bottle directory exists, and after the next launch no `.tmp-*` directory remains under the engine root; then launch a built-in-engine title and keep it running past 180 s with no "Game didn't start" dialog.
result: pending

## Restore

Done 2026-11-02: GameLibSteamBridge-38400's system.reg restored from the pre-test copy (cmp identical), `InstallTime.orig` removed, `--demo-status` with the licence visible reads "Standard version"; licence file unchanged (304 bytes, Oct 22 19:57) before and after. The bottle's engine marker is pinned from item 9; its next Automatic launch switches it back to CrossOver.


Re-UAT restore (59-23): move the pinned engine back (or let GameLib re-download it), undo the throwaway bottle's backdate with backdate.py or uninstall it as the operator chooses, remove any hand-set override (`wine-manager:0.0-missing`), and confirm the licence mtime is unchanged.

Undo the throwaway bottle's backdate by re-running spike-060 `backdate.py`, or delete that bottle with GameLib's uninstall, as the operator chooses. Confirm the licence file mtime is unchanged.

## Gaps

- G1 (item 2, major): the engine-download label never shows real progress. The backend logged 5% → 100% (09:44:12–09:44:24) and ensureBuiltInEngineForInstall sends `engine-download` with the rounded percent, but the operator saw only 0%. Ruled out: GlobalState.handleGameStatus (updates on context change), hasStatus deps, sendGameStatusUpdate (no dedupe). Also: verifying/extracting emit `percentage` undefined → 0, so the label resets to 0% for the ~40 s extract + DXVK install and still says "Downloading". Needs a phase label (verifying/extracting/setting up) and the cause of the missing updates.
- G2 (item 2, minor): the Steam sign-in check runs after the engine download and bottle creation. With an expired Steam session the bottle was built (09:44:12–09:45:05) and only then was the install refused (`install refused, no authenticated Steam session (logon-rejected)`, 09:45:09). The auth precondition should run first.
- G3 (item 3, major): the launch deadline kills a running game when the process monitor has given up. bottleProcessMonitor logged `giving up after 20 consecutive ps failures` at 09:50:31, then at 09:52:59 `launch deadline fired … (no game process seen)` stopped the bottle while Hoard was at its main menu. When process detection is unavailable the deadline must stand down, not fire.
- G4 (item 3, major for UAT): bottleProcessMonitor spawns only `ps`, which is setuid root; a sandboxed process cannot exec setuid binaries (`spawn EPERM` under both no-crossover.sb and nolicence.sb). `/usr/bin/pgrep` is not setuid and runs under both profiles. Fall back to pgrep when ps cannot spawn.
- G5 (item 3, minor): the deadline log says `launch deadline fired (engine=crossover)` on a launch whose decision was `engine=pinned`.
- G6 (item 3, minor): the "CrossOver not found — using built-in engine" toast is only a macOS notification (`notify(): "HOARD" handed to tauri-plugin-notification (delivery not confirmable)`); none was seen. Operator confirmed no notifications appear for any game install under `tauri dev`: dev builds go through tauri-plugin-notification, which on this macOS neither prompts nor registers the app (src-tauri/Cargo.toml:268; packaged builds use UNUserNotificationCenter). So the toast is unverifiable in dev, and when notifications are off in a packaged build the engine choice is announced nowhere but the badge. Fix: surface the engine notice in-app too, not only as a system notification. Item 7 adds: the badge text is only "Built-in engine (best-effort)" and the reason ("CrossOver trial expired") is only in its hover tooltip, so in dev the user is never shown why.
- G7 (item 4, major): moving a fallback-made bottle back to CrossOver did not restore DXVK. The stock CrossOver bridge settings carry the global winePrefix, so installRemove checked an unrelated prefix, logged `DXVK cannot be installed on a Proton or a invalid prefix!` and returned true; the engine marker moved to crossover with `current_dxvk-macOS` (v1.10.3) still in the bottle. Had the global prefix been valid, the restore would have hit the wrong prefix. Fixed in 5a6f4f877 (prefix pinned to the bottle; a surviving marker is a failed restore). Retest: Hoard's `.gamelib-engine.json` reset to pinned so the next CrossOver launch re-runs the switch.
- G8 (item 7, major): on the built-in engine the process monitor could not see a game launched by host path. Wine-Staging shows such a process by its host path (`/Users/…/drive_c/windows/system32/cmd.exe`, checked live), while the monitor only matched the `C:\…` form that CrossOver's winewrapper shows. Hoard and Planet Crafter matched only through Windows-spawned children (`Reuben.exe`, `UnityCrashHandler64.exe`); Fallout's `falloutlauncher.exe` was never matched (`launcher exited before any game process matched`). A title with no such child would be stopped mid-play by the 180 s deadline. 59-01's `staging_monitor_match: yes` was measured on a `C:\` launch. Fixed in 1a5b750bb: the monitor also matches the install root's host path.
- G9 (item 8/9, design, operator decision 2026-11-02): an explicit per-game override to CrossOver shows the red "Unsupported — known fixes and compatibility rating don't apply" warning and the "Unsupported engine" badge. Operator: CrossOver is the supported engine, and "how you get there should not make a difference". Fix: a CrossOver override is supported (no warning, no badge, known fixes apply); only non-CrossOver overrides are unsupported.
- G10 (item 8, major): on a bottle whose CrossOver trial has expired, the pinned -> crossover engine switch runs its DXVK restore through CrossOver (`reg delete` x2, `wineboot -u`, 11:11:43-11:13:16), and each step blocks on CodeWeavers' Expired Bottle dialog before the game even launches; the first step sat 45 s. When the CrossOver preflight is not healthy, run the restore with the built-in engine (or defer it), so the expired dialog can appear at most once, for the launch itself.
- G11 (item 9, major): the per-game engine override did not stick in the UI. Choosing "Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" logged `38400: Setting steamEngineOverride to "pinned:wine-staging-11.20"` and GamesConfig/38400.json held it, but reopening Settings showed Automatic: SteamGame.getSettings() returns the shared bottle settings for a Windows-only (bottle-eligible) title, so the screen read the key back from a store it is never written to (every bridge title is affected; the launch reads GameConfig and did honour it). Also the game page fetched engine state only on mount and at launch end, so no Unsupported badge appeared after closing Settings. Fixed: getSettings merges the title's own override (only when its config file exists), and the page refetches engine state when the settings modal opens or closes. The first fix (c6b2779ca) still showed Automatic after a restart: GameConfig.get(id).config is filled asynchronously after construction, so the first read sees undefined; the same race let the first launch and the badge state ignore the override. Fixed in 5cc3007a3: one synchronous reader (readStoredEngineOverride) parses GamesConfig/<appId>.json for getSettings, the launch decision and the engine state.
- G12 (item 9, minor): (a) the badge appears only after the CrossOver preflight finishes (`demo-status probe … elapsedMs=5230` on the first page load after a restart), though an override's badge does not depend on it; getSteamEngineState should compute the override state without awaiting the preflight. (b) Until listSteamEngineOptions resolves, the select shows Automatic for any stored value (effectiveValue falls back while `options` is empty), so choosing Automatic in that window is a no-op and nothing is saved: the operator's first switch back to Automatic did not stick (only one `Setting steamEngineOverride to "automatic"` was logged, on the second try). Show the stored value while the options load, or load them on mount.
