---
status: pending
phase: 74-steam-game-updates
source: [74-13-PLAN.md]
started: 2026-11-12
updated: 2026-11-13
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

[testing complete]

Preflight (2026-11-12): cargo tests (gamelib-scan, gamelib-scan-cli, gamelib-depot, gamelib-depot-cli, and the gamelib-shell bin) exit 0; clippy ratchet PASS (darwin, 1.99.1); `pnpm build:sidecar` exit 0, sidecar.js newer than the newest src/backend change; check:ipc-contract, find-deadcode, steam-line-ceiling, smoke:sidecar exit 0; planning-gates 12/12.

## Tests

### 1. Bridge badge after Refresh (Mining Mechs)
expected: After Refresh the card shows the existing update badge, the "updates" filter lists Mining Mechs, and the game page shows Update and "Show update size".
result: pass. The badge shows and the updates filter lists Mining Mechs (operator, 2026-11-13). UX note (minor, not a defect): the game page has no visible Update button. The update trigger is the inherited Heroic clickable status text "Installed - New Version Available! (Click to Update)" (GameStatus.tsx:227), and "Show update size" lives in the Info tab (GamePage index.tsx:677), not beside Play. The operator could not find either without being told. Candidate follow-up: a real Update button and/or moving the size line next to the status.
precondition: Mining Mechs (1603180) installed through the bridge and stale; sidecar freshly built; `pnpm tauri:dev`.

### 2. Update sizes (Mining Mechs)
expected: "Show update size" and the Update confirmation both show "Download up to ... · needs ... free during update (estimate)"; the values are close to spike 076 (about 5.7 MiB download).
result: pass. The Info-tab line and the confirmation dialog both show "Download up to 18 MiB" and match (operator, 2026-11-13). This is consistent with spike 076: 18 CDN chunks (5.7 MiB) + 13.1 MiB reused from verified local chunks = about 18.8 MiB changed. The pre-click estimate cannot know which chunks are local without hashing, so "up to" is the honest changed-bytes bound. The UAT expectation of "about 5.7 MiB" compared against the CDN-only figure. Peak value not recorded. Actual CDN bytes to be confirmed from the item 3 outcome line.
precondition: item 1 done; Refresh pressed within 60 s.

### 3. Mining Mechs update completes
expected: The Downloads entry is labelled Update and shows "Planning update...", then progress, then "Applying update...". The log has `[depot-rust] outcome appId=1603180 ... mode=install status=completed acf=4`. The ACF buildid equals the PICS public buildid and the InstalledDepots manifest GIDs match the new manifest (compare as strings). The badge is gone after Refresh. Saves and user files are kept.
result: pass. `[depot-rust] outcome appId=1603180 jobId=9878fe2d-... mode=install status=completed acf=4 ... bytes=5979200 elapsedMs=1105` (05:26:14, 2026-11-13). CDN bytes 5.7 MiB match spike 076 exactly. Only `Mining Mechs.exe` and `data.win` were rewritten; the other 51 files were untouched. Saves (save_data_0.sav, settings.ini, steamid.ini) are unchanged since Nov 7. The `gamelib-delta` journal dir is empty and no temps remain. Follow-ups: `shimTouched=false redist=true drm=true errors=0`. New ACF: buildid 26574035, depot 1603181 manifest 3064890709306462296. Badge gone after Refresh (operator). Note: the operator confirmed the update from the item 2 dialog, so the Planning/Applying stage labels were not observed; the job finished in about 1 s. Stage labels are deferred to item 5.
precondition: item 2 done. Action: confirm Update, wait for completion, then Refresh.

### 4. Mining Mechs launches through the bridge after the update
expected: Helper HELLO plus a clean game Steam-init log (strict criterion), and `gamelib_bridge.cfg` beside the exe is rewritten at launch.
result: pass. Strict criterion met (2026-11-13 05:37): `HELLO  shim attached appid=1603180`, then `GINIT  fn=SteamInternal_SteamAPI_Init ret=0 ok=1 session=1`, then game calls `SteamUser023.BLoggedOn` / `GetSteamID` / `SteamFriends017.GetPersonaName` and callback registration. The game reached its menu (operator). `gamelib_bridge.cfg` was rewritten at launch (Nov 7 12:58 to Nov 13 05:37:01). `placeShimForGame ... already present and current (idempotent, no-op)`. Observation, not a Phase 74 defect: on quit after 8 s the log shows `[bridge-notice] appId=1603180 reason=overlay-exit-abnormal` and an in-app overlay notice was pushed. Phase 74 did not touch the overlay path; triage separately if it recurs.
precondition: item 3 passed. Action: Play.

### 5. Manor Lords (1363080) hard case
expected: With at least 14 GB free, the update completes. `steam_api64.dll` is the shim and `steam_api64.dll.gamelib-orig` is the NEW genuine DLL (316,608 bytes). `stagedbuild_manorlords.ini` is byte-identical to before. Saves under the bottle's user profile are unchanged. The game launches through the bridge (strict).
result: pass. `[depot-rust] outcome appId=1363080 jobId=ca76ac97-... mode=install status=completed acf=4 ... bytes=960127440 elapsedMs=96967` (05:42:12, 2026-11-13); about 916 MiB matches spike 076. buildid 24905706 to 26185246, depot 1363081 manifest 8288717246775224817. `steam_api64.dll.gamelib-orig` is the NEW genuine DLL at 316,608 bytes (was 295,336); the shim (742,400) was re-placed; follow-ups `shimTouched=true redist=true drm=true errors=0`. `StagedBuild_ManorLords.ini` is byte-identical (sha1 da39a3ee..., empty). Saves are unchanged; the only diffs are runtime files the game writes at launch (pipeline cache, a CrashReportClient dir, rtsSettings.sav created). Bridge launch is strict-verified: `HELLO shim attached appid=1363080`, then `GINIT fn=SteamAPI_Init ret=1 ok=1 session=1`, and the game reached its menu (operator). Downloads hero meta read "Update · Steam" (type plus store, correct). Stage labels were not observed on the Downloads hero (planning about 2 s; download in progress otherwise); recheck in item 6. GAP (minor): pre-click estimate `download<=7036035296 peak=15077174693` versus actual 960,127,440 bytes downloaded, about 7x high (Mining Mechs about 3x). The estimate counts all changed chunk bytes without crediting local reuse, so "Download up to 6.6 GiB" for a 0.9 GiB update may deter updating.
precondition: Manor Lords stale, free disk at least 14 GB checked first. Record the size and sha1 of `steam_api64.dll.gamelib-orig` and the ini before the update.

### 6. Pause and resume of a bridge update
expected: Pausing mid-download holds the job. Play while paused launches the OLD build. Resume finishes with a `status=completed` outcome and no `*.gamelib-delta-tmp` is left in the install dir.
result: pass. Run on The Planet Crafter (1284190); Abiotic Factor is not installed. The estimate showed `download<=539259840 peak=2486939749`. Pause: `Update of 1284190 paused!` and outcome `status=cancelled acf=none bytes=70353072` (D-07: pause = abort). Play while paused showed the pre-launch update prompt (correct; still stale) and launched the OLD build, strict-verified: `HELLO shim attached appid=1284190`, then `GINIT fn=SteamAPI_Init ret=1 ok=1`. Resume: `status=completed acf=4 bytes=101424944 elapsedMs=13030`; buildid now 26411416; follow-ups `errors=0`; no `*.gamelib-delta-tmp` remains and the journal dir is empty. Issues are recorded as gaps: (a) resume restarted from 0% and re-downloaded the whole delta (70 MB lost); (b) the Downloads hero never showed "Planning update..." (sat at 0% for a few seconds); (c) prompt wording while an update is part-downloaded.
precondition: Abiotic Factor (427410) or Planet Crafter (1284190), stale. Action: Update, pause mid-download, Play, then resume.

### 7. Pre-launch update prompt and its status handling
expected: Play on a stale game shows Update now / Play anyway / Don't ask again for this build. Play anyway launches. Don't ask again launches and the next Play shows no prompt, with the badge still shown. Sub-step: choosing Update now on the prompt starts the update, and the game card does NOT stay on "launching" (the card status clears to its normal state; plan 74-09 noted the Steam launch returns false and launchDispatch sends no status reset).
result: issue. Hell Clock (1782460): two prompts stack. The Heroic in-app update prompt appears, then a native macOS box "Update now, or play the build you have?" with only an OK button. The 3-button showMessageBox falls back to OK-only in src-tauri/src/dialogs.rs. OK resolved as Update now: the update was queued and the launch aborted, despite the operator choosing play anyway in the first prompt. Play anyway and Don't ask again steps are blocked by this. Sub-step passes: after Update now (via the OK box) the card showed Updating, not stuck on "Launching", and returned to normal when the update finished (operator). Major gap recorded.
precondition: Hell Clock (1782460) or Core Keeper (1621690), still stale. Run the three prompt choices on one title, then use the other stale title (or re-arm the prompt) for the Update now sub-step and watch the card.

### 8. Offline Play
expected: With the network off only for the Play action, the prompt or the launch appears within about 3 s and nothing hangs (D-05).
result: pass. Core Keeper (1621690), network off for the Play action only: the first prompt appeared in about 2 s (operator), with no hang. Log: `Steam: update check apps=1 stale=1 unknown=0 pics=failed` (last-known stale state used offline). The same stacked-prompt defect as item 7 appeared (two prompts; OK queued an update). The queued update failed offline (`Update of 1621690 failed!`) and the operator cleared it, so Core Keeper stays stale for item 14.
precondition: a stale app whose "Don't ask again" is cleared (or another stale app). Action: network off, Play, network on, then report.

### 9. Short disk refusal (optional)
expected: When free space is below an update's peak, the confirmation says "Needs X free, Y available" and nothing is queued. `skipped` is allowed.
result: skipped. Optional. 1.3 TiB is free, so no short-disk fixture is practical. The refusal path is covered by the updateBridge unit tests (disk check against the exact peak).
precondition: a stale bridge game whose update peak exceeds free space (for example Manor Lords on a nearly full disk).

### 10. Registered fixture shows the update
expected: After Refresh the badge shows, and the game page says "Steam will update this game."
result: pass. ADOM (333300): the badge shows after Refresh, and the Info tab says "Steam will update this game." (operator, 2026-11-13). The fixture follows spike 069 steps 2-4: update behavior "only when launched", beta release-101 (old build 3512046), quit Steam, delete both BetaKey lines, relaunch. ACF now StateFlags 6, buildid 3512046, TargetBuildID 5820078. content_log: `Update Required,Fully Installed` and `update prefetch finished : 1872128 bytes to download`. GameLib `update check apps=43 stale=4 pics=ok`.
precondition: a small Mac-native installed game; follow spike 069 step 4: quit Steam, edit the ACF to StateFlags 6 with TargetBuildID different from buildid and ScheduledAutoUpdate set, relaunch Steam. Never fabricate it with a branch switch.

### 11. Registered Update with InstallApp OFF
expected: Update opens Steam on the game's library page (`steam://nav/games/details/<appId>` in the log). After updating in Steam, GameLib shows Updating... and then clears the badge. Record whether the page offered Update (verifies RESEARCH A1).
result: pass. With InstallApp OFF, Update logged `SteamGame: delegating update for appId 333300 via steam://nav/games/details/333300` (06:23:53). Steam opened ADOM's library page, and the page DID offer an Update button (RESEARCH A1 verified, operator). Update polling ran from `starting install polling ... delegatedToSteamClient true` to `update of appId 333300 finished (build 5820078)` at 06:24:20. The badge cleared and the ACF is StateFlags 4, buildid 5820078. Note: the Downloads entry logs `Finished Update` at the hand-off itself (06:23:53), not when Steam finishes; polling owns the real completion.
precondition: item 10 done; the InstallApp opt-in is off.

### 12. Registered Update with InstallApp ON
expected: Steam starts updating with no window; GameLib shows Updating... with progress. Record the ACF StateFlags values seen during the update (RESEARCH A2: 0x100/0x400 bits). It completes and the badge clears.
result: issue. The InstallApp update itself works: `SteamGame: Steam is updating appId 333300 via InstallApp` (06:30:24), no Steam window, and `update of appId 333300 finished (build 5820078)` 3 s later (06:30:27). ACF StateFlags sampled every 0.5 s: 6, then 1030 (0x406; the 0x400 bit set), then 4 with buildid 5820078 (RESEARCH A2: 0x400 seen; 0x100 not seen at 0.5 s sampling of a 3 s update). The first attempt went via steam://nav because the setting had not saved as ON; after re-toggling, config `steamExperimentalInstallApp: true` was confirmed. UX defect: after the 3 s completion the badge stayed and the Play button only flickered. A second click on the now-current game ran Steam's empty job instantly (6 to 4 in 0.5 s). The poll never matched completion (no pending seen, buildid already equal to fromBuild), so GameLib showed "Updating game" with a grey Play and no progress until the 40-tick timeout (06:32:41, `no update activity ... ending the update poll quietly`). Only then did the badge clear. Minor gap recorded.
precondition: the registered fixture stale again (redo the spike 069 step 4 edit); the InstallApp opt-in is on.

### 13. Friends stay signed in on Mac Steam
expected: Mac Steam's Friends list stays signed in after Refresh and after items 3 and 12 (Steam-auth live-gate rule).
result: pass. Friends signed in at the end of the session (operator). The operator saw brief sign-outs during Refreshes. These are the designed macOS go-offline wrap: every authenticated session logs `go-offline wrap: ... firing gooffline`, then `CM logon mode=authenticated reason=<user-refresh|user-install> wrap=toggled`, then `firing goonline`, then `Mac Steam back online, marker cleared`, a 3-4 s offline window each time. Bridge updates also wrap (reason=user-install at 05:54 and 06:02). Every wrap restored online, with no LogonSessionReplaced or permanent kick. The registered InstallApp and nav updates used no authenticated session. Update checks themselves are anonymous (`CM logon mode=anonymous reason=update-check`).
precondition: Mac Steam running and signed in with Friends visible. Check after Refresh, after item 3 and after item 12.

### 14. Auto-update ON
expected: With Settings, auto update games on, Refresh queues a stale bridge game automatically and does NOT queue the registered fixture (D-01, D-02).
result: pass. With `autoUpdateGames: true`, Refresh auto-queued and updated both stale bridge games: Core Keeper 1621690 (`outcome ... status=completed acf=4`, 06:39:42; follow-ups errors=0) and All Will Fall 2706020 (`status=completed acf=4`, 06:40:21). Trash Goblin was the Epic/Legendary auto-update (not Steam). The registered fixture ADOM 333300 was NOT queued: 0 log lines for 333300 after 06:34, and the ACF stays StateFlags 6 / buildid 3512046 (D-01, D-02 hold). Note: `Auto-Updating All Will Fall` was logged 3 times (06:39:35, then twice at 06:39:58, alongside 4 back-to-back `update check` lines). The queue de-duplicated and one update ran, but the repeated auto-update pass is worth a look.
precondition: one stale bridge game and the stale registered fixture; auto update games switched on.

### 15. Windows/Linux hand-off (optional)
expected: `steam://nav/games/details/<appId>` opens the game page in Steam on Windows or Linux. `skipped` is allowed without the machine.
result: skipped. Deferred by the operator to run on their Windows machine at leisure; tracked in `.planning/todos/pending/2026-11-13-verify-steam-nav-update-handoff-on-windows.md`. The macOS form of the same `steam://nav/games/details/<appId>` hand-off passed in item 11.
precondition: a Windows or Linux machine with Steam installed.

### 16. Single launch prompt and in-update block (re-run of item 7)
expected: Play shows ONE native box with Play anyway / Update now / Don't ask again for this build, and no in-app Heroic box first. Play anyway launches the current build (strict bridge criterion not required; the game reaching its menu suffices). Don't ask again launches and the next Play shows no prompt while the badge stays. Update now queues the update and the card does not stay on Launching. While that update is downloading, Play shows "<title> is updating..." and does not launch. Esc on the box launches (never updates).
result: pending
precondition: Hell Clock 1782460 or Core Keeper 1621690 (bridge), still stale; sidecar rebuilt and GameLib relaunched with `pnpm tauri:dev`.

### 17. Registered Update with InstallApp ON clears promptly (re-run of item 12)
expected: Update starts Steam's update with no window; GameLib shows Updating and then, within a few seconds of Steam finishing (log `update of appId <id> finished`), the badge and the Updating state clear without waiting for `ending the update poll quietly`. A second Update click on the now-current game logs `is already current` and does not show Updating.
result: pending
precondition: the registered fixture re-staled per spike 069 step 4 (quit Steam, edit the ACF buildid lower, relaunch); the InstallApp opt-in is on and confirmed saved.

### 18. Multi-depot / DLC bridge update keeps DLC content (WR-01)
expected: On a bridge game whose ACF InstalledDepots lists at least one DLC or language depot besides the base depot, an update completes with `[depot-rust] outcome ... status=completed acf=4`; the log line `retire appId=<id> ...` shows the DLC/language depot under kept (never retired); every file that belonged to that depot before the update still exists afterwards (compare a file list taken before and after); the game launches through the bridge (strict criterion).
result: pending
precondition: choose a bridge install with a DLC or language depot (read InstalledDepots in the bridge bottles' appmanifest files). If none is stale, stage one with GameLib quit: copy the ACF aside, set its `buildid` to any lower number while leaving InstalledDepots untouched, relaunch GameLib, Refresh; the badge shows, and Update runs the retire decision over every installed depot with little or nothing to download. Restore nothing afterwards (the update rewrites the ACF). Take before/after file lists with `find <installdir> -type f | sort` into the scratchpad, never into the repo.

## Summary

total: 18
passed: 11
issues: 2
pending: 3
skipped: 2
blocked: 0

## Gaps

- truth: "The pre-click update size is a useful guide to the real download"
  status: failed
  reason: "Item 5: the estimate showed download <= 7.0 GB (peak 15.1 GB) for Manor Lords, but only 0.96 GB was downloaded (about 7x high; Mining Mechs about 3x). The estimate counts all changed chunk bytes and does not credit chunks reusable from local files."
  severity: minor
  test: 5
- truth: "The update trigger and the update size are easy to find on the game page"
  status: failed
  reason: "Item 1: the operator could not find an Update control. The trigger is the inherited clickable status text, and 'Show update size' is on the Info tab."
  severity: cosmetic
  test: 1
- truth: "Resuming a paused bridge update keeps the progress already downloaded"
  status: failed
  reason: "Item 6: pause aborts the delta (D-07), and resume started a fresh job from 0% that re-downloaded the whole delta (70 MB fetched before pause, then 101 MB again). Install resume reconciles finished files, but delta build-beside temps are discarded on the fresh run. On a large update (Manor Lords about 916 MiB) a pause could cost the whole download."
  severity: minor
  test: 6
- truth: "The Downloads hero shows 'Planning update...' during the plan stage and 'Applying update...' during commit"
  status: failed
  reason: "Items 5 and 6: the operator watched Downloads from the start; the hero sat at '0%' for several seconds with no 'Planning update...' text. The game page did show its own friendly text. Either the steam-update-planning stage status is not reaching heroPhase (libraryStatus) or download progress overrides it."
  severity: minor
  test: 6
- truth: "The pre-launch prompt wording fits a part-downloaded update"
  status: failed
  reason: "Item 6 (operator suggestion): when an update was paused partway, the prompt still says to install the update; it could offer to finish or complete it instead."
  severity: cosmetic
  test: 6
- truth: "Play on a stale bridge game shows ONE prompt with Update now / Play anyway / Don't ask again for this build, and each choice does what it says"
  status: failed
  reason: "Item 7 (Hell Clock 1782460): two prompts stack. (1) The inherited Heroic in-app prompt (frontend/helpers/library.ts:177, gamepage:box.update, fired by hasUpdate) appears first; the operator chose play anyway. (2) Then Phase 74's backend gateBridgeLaunchOnUpdate (updateLaunchPrompt.ts) calls deps.dialogs.showMessageBox with THREE buttons, but the Tauri native dialog (src-tauri/src/dialogs.rs:151) renders custom buttons only for exactly 2. With 3 it falls back to an OK-only box showing 'Update now, or play the build you have?'. OK resolves as response 0 = Update now, so the update was queued and the launch aborted, overriding the operator's Play anyway. Play anyway and Don't ask again are unreachable through the native prompt."
  severity: major
  test: 7
- truth: "After Steam finishes a registered update, GameLib clears the badge and the Updating state promptly"
  status: failed
  reason: "Item 12 (InstallApp ON, ADOM 333300): Steam finished in 3 s (06:30:27 `update of appId 333300 finished (build 5820078)`), but the card badge stayed and the Play button only flickered. A second Update on the now-current game showed 'Updating game' with no progress for 2 min. The update-aware poll needs pending/active seen or buildid != fromBuild; Steam's empty InstallApp job finished before the first tick and fromBuild was already the new build, so it ran to the 40-tick timeout. Likely causes: the frontend update list / updateStates cache is not refreshed on registered-update completion, and the poll's fromBuild/completion rule does not handle an already-current game."
  severity: minor
  test: 12
