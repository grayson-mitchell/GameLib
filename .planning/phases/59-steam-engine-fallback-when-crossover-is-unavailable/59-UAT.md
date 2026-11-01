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
result: issue — Hoard launched on the built-in engine (`engine=pinned … version=11.20 reason=cx-missing`), reached its main menu, badge "Built-in engine (best-effort)" and the Get-CrossOver panel showed; but no toast appeared (G6) and at 180 s GameLib showed "HOARD did not start within 180 seconds" and stopped the running game (G3, G4, G5). Retest after the fix.

### 4. CrossOver adopts the fallback-made bottle
expected: (D-03, D-07) Restart without the profile and launch the same title: it runs on CrossOver, cxbottle.conf gains a Timestamp line, `current_dxvk-macOS` is gone, the item 3 save is present, and the badge is gone.
result: pending

### 5. D3D11 title on the built-in engine
expected: (D-05, D-07) Planet Crafter or Avernum 6 under no-crossover.sb renders, then returns cleanly to CrossOver when launched without the profile.
result: pending

### 6. Trial notice at 7 days or fewer
expected: (D-13) With operator approval, under nolicence.sb, backdate ONE throwaway bridge bottle with spike-060 backdate.py to 5 days remaining: its game page shows a notice with "5 days remaining" and Buy CrossOver. Backdate to 10 days remaining: no notice.
result: pending

### 7. Expired trial routes to the built-in engine
expected: (D-06, D-09, D-12) The same bottle backdated past expiry, under nolicence.sb: launch shows "CrossOver trial expired — using built-in engine" and the game runs.
result: pending

### 8. Game didn't start after the deadline
expected: (D-10, D-11) On the same expired bottle, set the title's override to CrossOver and launch: after about 180 s a "Game didn't start" dialog appears, `ps` shows no wine process for that bottle, and there is no bottled-Steam dialog. Set the override back to Automatic afterwards.
result: pending

### 9. Override section and Unsupported badge
expected: (D-14, D-08) Advanced > Engine (advanced) is collapsed with Automatic as default and lists CrossOver and the pinned build; selecting one shows a warning and the "Unsupported engine" badge; the launch log shows the chosen engine and version; no rollback toggle exists anywhere.
result: pending

### 10. DRM title without CrossOver
expected: (D-09 discretion) Under no-crossover.sb a SteamStub title shows the CrossOver-required message and never hangs.
result: pending

### 11. Fallback-made bottle survives a different engine build
expected: (RESEARCH Open Question 4) Set the item 3 title's override to an installed Wine Manager Wine-Staging-macOS build other than 11.20, under no-crossover.sb: wine does a silent prefix update, the game launches, the item 3 save is present, and after setting the override back to Automatic it launches on the pinned build again. If no other Wine-Staging-macOS build is installed, record skipped with that reason.
result: pending

### 12. Sidecar exits after quit
expected: (sidecar exit contract) After quitting the app following items 2-11, `pgrep -f sidecar` is empty within 10 s.
result: pending

## Restore

Undo the throwaway bottle's backdate by re-running spike-060 `backdate.py`, or delete that bottle with GameLib's uninstall, as the operator chooses. Confirm the licence file mtime is unchanged.

## Gaps

- G1 (item 2, major): the engine-download label never shows real progress. The backend logged 5% → 100% (09:44:12–09:44:24) and ensureBuiltInEngineForInstall sends `engine-download` with the rounded percent, but the operator saw only 0%. Ruled out: GlobalState.handleGameStatus (updates on context change), hasStatus deps, sendGameStatusUpdate (no dedupe). Also: verifying/extracting emit `percentage` undefined → 0, so the label resets to 0% for the ~40 s extract + DXVK install and still says "Downloading". Needs a phase label (verifying/extracting/setting up) and the cause of the missing updates.
- G2 (item 2, minor): the Steam sign-in check runs after the engine download and bottle creation. With an expired Steam session the bottle was built (09:44:12–09:45:05) and only then was the install refused (`install refused, no authenticated Steam session (logon-rejected)`, 09:45:09). The auth precondition should run first.
- G3 (item 3, major): the launch deadline kills a running game when the process monitor has given up. bottleProcessMonitor logged `giving up after 20 consecutive ps failures` at 09:50:31, then at 09:52:59 `launch deadline fired … (no game process seen)` stopped the bottle while Hoard was at its main menu. When process detection is unavailable the deadline must stand down, not fire.
- G4 (item 3, major for UAT): bottleProcessMonitor spawns only `ps`, which is setuid root; a sandboxed process cannot exec setuid binaries (`spawn EPERM` under both no-crossover.sb and nolicence.sb). `/usr/bin/pgrep` is not setuid and runs under both profiles. Fall back to pgrep when ps cannot spawn.
- G5 (item 3, minor): the deadline log says `launch deadline fired (engine=crossover)` on a launch whose decision was `engine=pinned`.
- G6 (item 3, minor): the "CrossOver not found — using built-in engine" toast is only a macOS notification (`notify(): "HOARD" handed to tauri-plugin-notification (delivery not confirmable)`); none was seen. Operator to check whether GameLib notifications show at all (native install).
