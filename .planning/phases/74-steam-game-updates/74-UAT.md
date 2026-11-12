---
status: pending
phase: 74-steam-game-updates
source: [74-13-PLAN.md]
started: 2026-11-12
updated: 2026-11-12
---

# Phase 74 UAT: live gate for Steam game updates

Authored by plan 74-13. Record only the status word first (pass / issue / skipped / blocked), then a short proving log excerpt and a note. Leave out tokens, SteamID64s, account ids and full home paths. Record any issue as a gap for /gsd-verify-work; do not fix code inside this plan.

## Ground rules (read before every item)

- **Dev launch is `pnpm tauri:dev`**, never `tauri:dev:run` (that one skips the dev-vault flag and prompts the Keychain on every launch).
- **`tauri dev` does not rebuild the sidecar.** Run `pnpm build:sidecar` before the first launch and after any backend change, then check that `build/main/sidecar.js` is newer than the newest `src/backend` change.
- **Offline steps:** the network is off only for the action itself (off -> act -> on -> report), because the operator needs the network to talk to Claude.
- **Authenticated steps:** press Refresh in the library first, then act within 60 s (the auth session closes 60 s after the last lease release).
- **Logs:** `~/Library/Logs/GameLib/gamelib.log` and `~/Library/Logs/GameLib/gamelib-shell.log`. Every launch rotates `gamelib.log`, so keep a cumulative `tail -F` copy of both. Outcome lines look like `[depot-rust] outcome appId=<id> jobId=<uuid> mode=<install|...> status=<completed|cancelled|failed> acf=<StateFlags|none> ...`.
- **Never use bottled Steam to fix a stale bridge game.** The goal is to update through GameLib.
- **Bridge "verified" is strict:** helper HELLO plus a clean game Steam-init log. In-Game alone never counts.
- **Fixtures (spike 070):** Mining Mechs 1603180 (quick case), Manor Lords 1363080 (hard case, needs at least 14 GB free), Abiotic Factor 427410, Planet Crafter 1284190, Hell Clock 1782460, Core Keeper 1621690. The registered fixture is a small Mac-native installed game, made per spike 069 step 4.
- **After every Ctrl-C of `tauri dev`**, run `pgrep -fl sidecar.js`; an orphan is the known defect in todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`. Kill it and do not fail an item for it.

## Known follow-ups carried in (not blockers for this gate)

- Pre-existing test:ci failures, red on the pre-phase commit as well: tauriShellSource WR-07, epicOfflineMode R8 Test 6c, gamelibCatalogParity (sl), genI18nGateScope, lintTranslations and the presence baseline, x86CallbackWineHarness slot 15.
- Phase 74 added i18n drift on top of those: about 30 new `gamelib` en keys are untranslated, and two new fork-touched files are not yet in `meta/i18nForkTouchedFiles.json`.

## Current Test

[awaiting operator]

Preflight (2026-11-12): cargo tests (gamelib-scan, gamelib-scan-cli, gamelib-depot, gamelib-depot-cli, and the gamelib-shell bin) exit 0; clippy ratchet PASS (darwin, 1.99.1); `pnpm build:sidecar` exit 0, sidecar.js newer than the newest src/backend change; check:ipc-contract, find-deadcode, steam-line-ceiling, smoke:sidecar exit 0; planning-gates 12/12.

## Tests

### 1. Bridge badge after Refresh (Mining Mechs)
expected: After Refresh the card shows the existing update badge, the "updates" filter lists Mining Mechs, and the game page shows Update and "Show update size".
result: pending
precondition: Mining Mechs (1603180) installed through the bridge and stale; sidecar freshly built; `pnpm tauri:dev`.

### 2. Update sizes (Mining Mechs)
expected: "Show update size" and the Update confirmation both show "Download up to ... · needs ... free during update (estimate)"; the values are close to spike 076 (about 5.7 MiB download).
result: pending
precondition: item 1 done; Refresh pressed within 60 s.

### 3. Mining Mechs update completes
expected: The Downloads entry is labelled Update and shows "Planning update...", then progress, then "Applying update...". The log has `[depot-rust] outcome appId=1603180 ... mode=install status=completed acf=4`. The ACF buildid equals the PICS public buildid and the InstalledDepots manifest GIDs match the new manifest (compare as strings). The badge is gone after Refresh. Saves and user files are kept.
result: pending
precondition: item 2 done. Action: confirm Update, wait for completion, then Refresh.

### 4. Mining Mechs launches through the bridge after the update
expected: Helper HELLO plus a clean game Steam-init log (strict criterion), and `gamelib_bridge.cfg` beside the exe is rewritten at launch.
result: pending
precondition: item 3 passed. Action: Play.

### 5. Manor Lords (1363080) hard case
expected: With at least 14 GB free, the update completes. `steam_api64.dll` is the shim and `steam_api64.dll.gamelib-orig` is the NEW genuine DLL (316,608 bytes). `stagedbuild_manorlords.ini` is byte-identical to before. Saves under the bottle's user profile are unchanged. The game launches through the bridge (strict).
result: pending
precondition: Manor Lords stale, free disk at least 14 GB checked first. Record the size and sha1 of `steam_api64.dll.gamelib-orig` and the ini before the update.

### 6. Pause and resume of a bridge update
expected: Pausing mid-download holds the job. Play while paused launches the OLD build. Resume finishes with a `status=completed` outcome and no `*.gamelib-delta-tmp` is left in the install dir.
result: pending
precondition: Abiotic Factor (427410) or Planet Crafter (1284190), stale. Action: Update, pause mid-download, Play, then resume.

### 7. Pre-launch update prompt and its status handling
expected: Play on a stale game shows Update now / Play anyway / Don't ask again for this build. Play anyway launches. Don't ask again launches and the next Play shows no prompt, with the badge still shown. Sub-step: choosing Update now on the prompt starts the update, and the game card does NOT stay on "launching" (the card status clears to its normal state; plan 74-09 noted the Steam launch returns false and launchDispatch sends no status reset).
result: pending
precondition: Hell Clock (1782460) or Core Keeper (1621690), still stale. Run the three prompt choices on one title, then use the other stale title (or re-arm the prompt) for the Update now sub-step and watch the card.

### 8. Offline Play
expected: With the network off only for the Play action, the prompt or the launch appears within about 3 s and nothing hangs (D-05).
result: pending
precondition: a stale app whose "Don't ask again" is cleared (or another stale app). Action: network off, Play, network on, then report.

### 9. Short disk refusal (optional)
expected: When free space is below an update's peak, the confirmation says "Needs X free, Y available" and nothing is queued. `skipped` is allowed.
result: pending
precondition: a stale bridge game whose update peak exceeds free space (for example Manor Lords on a nearly full disk).

### 10. Registered fixture shows the update
expected: After Refresh the badge shows, and the game page says "Steam will update this game."
result: pending
precondition: a small Mac-native installed game; follow spike 069 step 4: quit Steam, edit the ACF to StateFlags 6 with TargetBuildID different from buildid and ScheduledAutoUpdate set, relaunch Steam. Never fabricate it with a branch switch.

### 11. Registered Update with InstallApp OFF
expected: Update opens Steam on the game's library page (`steam://nav/games/details/<appId>` in the log). After updating in Steam, GameLib shows Updating... and then clears the badge. Record whether the page offered Update (verifies RESEARCH A1).
result: pending
precondition: item 10 done; the InstallApp opt-in is off.

### 12. Registered Update with InstallApp ON
expected: Steam starts updating with no window; GameLib shows Updating... with progress. Record the ACF StateFlags values seen during the update (RESEARCH A2: 0x100/0x400 bits). It completes and the badge clears.
result: pending
precondition: the registered fixture stale again (redo the spike 069 step 4 edit); the InstallApp opt-in is on.

### 13. Friends stay signed in on Mac Steam
expected: Mac Steam's Friends list stays signed in after Refresh and after items 3 and 12 (Steam-auth live-gate rule).
result: pending
precondition: Mac Steam running and signed in with Friends visible. Check after Refresh, after item 3 and after item 12.

### 14. Auto-update ON
expected: With Settings, auto update games on, Refresh queues a stale bridge game automatically and does NOT queue the registered fixture (D-01, D-02).
result: pending
precondition: one stale bridge game and the stale registered fixture; auto update games switched on.

### 15. Windows/Linux hand-off (optional)
expected: `steam://nav/games/details/<appId>` opens the game page in Steam on Windows or Linux. `skipped` is allowed without the machine.
result: pending
precondition: a Windows or Linux machine with Steam installed.

## Summary

total: 15
passed: 0
issues: 0
pending: 15
skipped: 0
blocked: 0

## Gaps

[none yet]
