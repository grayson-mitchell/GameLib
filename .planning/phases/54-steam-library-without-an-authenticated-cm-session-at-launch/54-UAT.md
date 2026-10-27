---
status: complete
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
source:
  - 54-LIVE-GATE.md
started: 2026-10-27T00:00:00Z
updated: 2026-10-28T09:30:00Z
---

Authored by plan 54-10, run by 54-11. The plan that authored this contract did not run any item of it.

Done-when being gated (ROADMAP): SC4, launch, browse, game page and Play leave Mac Steam Friends signed in with status changeable, and the anonymous session alone does not flip Friends. SC6 (live half), an explicit Refresh and a depot install with Mac Steam online leave Friends signed in with status changeable.

Before item 1, the runner completes preconditions PC1 to PC9 in 54-LIVE-GATE.md, including restarting `pnpm tauri:dev` so `build/main/sidecar.js` is rebuilt (tauri dev does not rebuild the sidecar) and checking its mtime is newer than the newest `feat(54-` commit. Evidence goes in `/tmp/gamelib-gate-<UTC>/`, never committed; items 10-13 use launches 2 to 6 (relaunching between them); record counts and timestamps here, not raw lines.

## Current Test

[testing complete]

## Tests

### 1. Cold launch, idle 90 s
expected: After a cold launch and 90 s idle, the gamelib.log slice has no `CM logon mode=authenticated` line, the connection_log.txt slice has no `user initiated logoff` and still ends `Logged On`, and Friends is signed in and status changeable, judged by the operator.
result: pass — launch 1 (dev was already running; slices retroactive, see run record). gamelib.log slice from the item-1 offset: 0 `CM logon mode=authenticated`, 0 `go-offline wrap:`. connection_log slice: 0 `user initiated logoff`, 0 `processing complete`, no state change (Mac Steam Logged On throughout, no GameLib-caused events). Operator: Friends signed in and status changeable. N0=385.

### 2. Browse the library and open three game pages
expected: Browsing the Steam library and opening three game pages leaves the gamelib.log slice with no `CM logon mode=authenticated` and no `go-offline wrap:` line, connection_log.txt with no new `user initiated logoff`, and Friends signed in and status changeable, judged by the operator.
result: pass — launch 1, 19:03:20Z offsets. Browsed the library and opened three game pages (Avernum 5, All Will Fall, Heroes of Steel RPG). gamelib.log slice: 0 `CM logon mode=authenticated`, 0 `go-offline wrap:`; connection_log slice: 0 `user initiated logoff`. Operator: Friends signed in and status changeable.

### 3. Play an installed title
expected: Playing an installed title (a bridge title if one is installed) leaves the gamelib.log slice with no `CM logon mode=authenticated` (and `CM logon mode=anonymous reason=launch-target` for a bridge title), connection_log.txt with no new `user initiated logoff`, and Friends signed in and status changeable, judged by the operator; record whether the title hit recorded behaviour change (i) or (ii).
result: pass — launch 1, 19:08:14Z offsets. Played Avernum 6 (206060, bridge title); "launched fine". gamelib.log slice: 0 `CM logon mode=authenticated`, 1 `CM logon mode=anonymous reason=launch-target` (08:09:03); connection_log slice: 0 `user initiated logoff`. Operator: Friends signed in and status changeable. Behaviour changes (i) and (ii): neither hit (redists already settled, no `launch-exe-not-resolved`).

### 4. The anonymous session alone
expected: Item 3's gamelib.log slice contains `CM logon mode=anonymous reason=launch-target` and no `mode=authenticated` line while Friends is signed in and status changeable, judged by the operator; blocked (not failed) if no bridge title is installed, with that reason recorded.
result: pass — launch 1, same slice as item 3: 1 `CM logon mode=anonymous reason=launch-target` at 08:09:03, 0 `mode=authenticated`, 0 `user initiated logoff`, while Friends was signed in and status changeable (operator). Bridge title Avernum 6 was installed, so not blocked.

### 5. Explicit Refresh with Mac Steam online
expected: connection_log.txt shows `user initiated logoff` before gamelib.log's `CM logon mode=authenticated reason=user-refresh wrap=toggled`, then Mac Steam `RecvMsgClientLogOnResponse() : processing complete` and a `Logged On` state, with Friends signed in and status changeable 60 s later, judged by the operator, and the library count unchanged.
result: pass — launch 1, T5 19:09:36Z. connection_log slice: 1 `user initiated logoff` (08:10:23) before gamelib.log's 1 `CM logon mode=authenticated reason=user-refresh wrap=toggled` (08:10:23, goonline fired 08:10:26), 1 `processing complete` and last state `Logged On` at 08:10:27. 1 `CM session closed mode=authenticated cause=idle` at 08:11:31. Operator: friends dropped and came back online, status change works, still 385 (N0=N5=385). Re-run: re-run 2026-10-28 on 20c1fe9d5: pass, launch 1; wrap=toggled 10:03:39, 1 logoff, 1 `processing complete`, `Logged On` and `marker cleared` confirmation 10:03:44, N=385; operator Friends ok.

### 6. Depot install with Mac Steam online
expected: Started at least 70 s after item 5 (after `CM session closed mode=authenticated cause=idle`), the install shows the same wrap evidence with `reason=user-install` in gamelib.log and connection_log.txt, completes, leaves Friends signed in and status changeable judged by the operator, and gamelib.log shows `CM session closed mode=authenticated cause=idle` at least 60 s after the install completes.
result: pass — launch 1, 19:12:06Z. Installed World of Goo (PC7). Started 08:19:04, 7 min 33 s after item 5's idle close (08:11:31), so past the 70 s spacing. gamelib.log slice: 1 `reason=user-install` authenticated logon with `wrap=toggled` (08:19:04), 1 `go-offline wrap: firing goonline` (08:19:07); connection_log slice: 1 `user initiated logoff` (08:19:04), 1 `processing complete` and `Logged On` at 08:19:08. `CM session closed mode=authenticated cause=idle` logged at 08:20:32 (the exact install-completion second was not resolved; the install finished before then per the operator). Operator: install completed, friends dropped and came back, status works. Re-run: re-run 2026-10-28 on 20c1fe9d5: pass, launch 1; Avadon 2 install, `reason=user-install` wrap=toggled 10:05:48, marker cleared 10:05:53, authenticated idle close 10:07:19; operator Friends ok.

### 7. Mac Steam set offline by hand, then Refresh
expected: With Mac Steam offline, Refresh logs `go-offline wrap: Mac Steam state=Logged Off, no toggle needed` and `CM logon mode=authenticated reason=user-refresh wrap=already-offline` in gamelib.log, connection_log.txt gains no `user initiated logoff` or `processing complete` from GameLib's action, and Steam stays offline.
result: pass — launch 1, re-armed at 19:27:54Z after a confirmed CONNLOG `Logged Off` at 08:27:38 (first attempt VOID, see run record). gamelib.log slice: 1 `go-offline wrap: Mac Steam state=Logged Off, no toggle needed` and 1 `CM logon mode=authenticated reason=user-refresh wrap=already-offline` (08:29:13), 0 `wrap=toggled`. connection_log slice: 0 `user initiated logoff`, 0 `processing complete`. Operator: Steam stayed offline. Re-run: re-run 2026-10-28 on 20c1fe9d5: pass, launch 1; `wrap=already-offline` 10:09:10, 0 toggled, 0 logoff, 0 `processing complete` in the connection_log slice (an Epic 504 in this Refresh was an Epic server error, not Phase 54).

### 8. Guided fallback with a game running (conditional)
expected: With a Mac Steam game running, Refresh either wraps successfully (`wrap=toggled`, recording that the URL verb works with a game running) or shows the dialog with `CM logon skipped` and no `mode=authenticated` line, after which Steam > Go Offline plus Continue logs on with `wrap=guided-restore` and Steam returns online; fails only if an authenticated logon lands while connection_log.txt's last state is `Logged On`.
result: pass — launch 1, 19:39:13Z, game Wazhack (PC8) running. Outcome (b): URL gooffline fired 08:39:34, no user-initiated logoff within 5000 ms (08:39:39), dialog shown; gamelib.log: 1 `CM logon skipped` (08:39:39), 0 `mode=authenticated` while the last state was `Logged On`. Mac Steam ignored gooffline with the game running, both GameLib's URL and the operator's own menu Go Offline (08:41:26, 08:41:41). After quitting the game the operator went offline (08:43:31) and pressed Continue: 1 `wrap=guided-restore` (08:43:42), goonline 08:43:45, `processing complete` and `Logged On` at 08:43:46. Counts for the slice: 1 authenticated (guided-restore only), 0 toggled, 1 guided-restore, 1 skipped, 1 `user initiated logoff` (the operator's own, preceding the authenticated logon), 1 `processing complete`. Operator: Steam came back online, Friends signed in, status works. Re-run: re-run 2026-10-28 on 20c1fe9d5: pass, launch 1. 8a, Refresh with a game running: logon skipped 10:12:01, 0 authenticated, dialog tells the user to quit the game first (WR-06), Cancel left Steam online. 8b, CR-01: Isaac (113200) on Windows installed via the guided Continue, `wrap=guided-restore` 10:16:35, marker cleared 10:16:39, install logged `source bottle` and the persisted forced Windows-via-bottle verdict. The install-folder half of CR-01 was not tested live (one Steam library, no folder dropdown).

### 9. Sidecar exit
expected: After quitting GameLib, `pgrep -f 'build/main/sidecar.js'` and `pgrep -f 'target/debug/gamelib-shell'` are both empty within 10 s.
result: pass — launch 1. Cmd+Q at 08:45:01 local; shell and sidecar both gone by 19:45:01Z check (`remaining=0 shell=0`), well inside 10 s (exact exit second not resolved finer). Re-run: re-run 2026-10-28 on 20c1fe9d5: pass, launch 1; Cmd+Q 10:18:31, shell and sidecar gone the same second.

### 10. Routed quit mid-wrap restores Mac Steam online
expected: After Refresh then Cmd+Q within about 1 s (launch 2 log has `go-offline restore trigger=shutdown: firing goonline`, else VOID, at most 3 attempts), connection_log.txt shows `user initiated logoff`, `processing complete` and last state `Logged On` within 20 s, the owed-goonline marker file is absent, the loginusers.vdf WantsOfflineMode=1 count is 0, and Friends is signed in and status changeable, judged by the operator.
result: pass on attempt 2 (launch 3; log begins 08:51:18, sliced by timestamp because the operator triggered it before offsets were recorded). Attempt 1 (launch 2) VOID: the operator's Cmd+Q went to Mac Steam, which the gooffline URL had brought to the foreground, so Steam itself quit (steam_osx absent afterwards). Attempt 2: Refresh 08:51:48 `firing gooffline` plus `wrap=toggled` (1 authenticated), quit 08:51:49, 1 `go-offline restore trigger=shutdown: firing goonline` (08:51:49), 0 wrap `firing goonline`. connection_log: 1 `user initiated logoff` (08:51:48), 1 `processing complete` and `Logged On` at 08:51:51, well inside 20 s. Marker absent, WantsOfflineMode=1 count 0 at 08:52:13+, sidecar gone. Operator: Friends signed in, status works. Re-run: re-run 2026-10-28: pass; attempt 1 VOID (quit after the wrap had already completed), attempt 2 on 20c1fe9d5 passed, repeat on 95a89d8d3 (launch 5) passed first try: quit 10:38:54 during the settle, `restore trigger=shutdown` 10:38:54, `Logged On` 10:38:55, marker absent, count 0.

### 11. Shell killed mid-wrap restores Mac Steam online
expected: After the shell is killed 1 s after `firing gooffline` (launch 3 log has `[sidecar] stdin closed:` and `go-offline restore trigger=shutdown: firing goonline`, else VOID, at most 3 attempts), the sidecar is gone within 10 s, connection_log.txt ends `Logged On` after `processing complete`, the marker is absent, the WantsOfflineMode=1 count is 0, and Friends is signed in and status changeable, judged by the operator.
result: pass — launch 4 (19:54:35Z offsets). kill -9 of the shell 08:55:17 after `firing gooffline` 08:55:15 and `wrap=toggled` 08:55:16 (1 authenticated). 1 `[sidecar] stdin closed:` and 1 `go-offline restore trigger=shutdown: firing goonline` at 08:55:17; the wrap's own goonline at 08:55:19 (sidecar alive at least 2 s after the kill). Sidecar gone by the 19:55:27Z check (within 10 s, exact exit second not resolved). connection_log: logoff 08:55:16, `processing complete` and `Logged On` 08:55:18. Marker absent, WantsOfflineMode=1 count 0. Operator: Friends signed in, status works. Re-run: re-run 2026-10-28: first run on 20c1fe9d5 FAILED (launch 4: slow 7.9 s CM connect, kill landed mid-connect, steam-user's retry logged on at 10:24:27 while Steam was online, sidecar orphaned over 107 s; see Gaps). Fixed in 95a89d8d3; retry on that build passed (launch 6): kill 10:40:49, restore 10:40:49, `Logged On` 10:40:50, sidecar gone within 4 s, no logon or sync after EOF over 60 s. The retry did not reproduce the slow mid-connect path live (the logon had already landed); that path is covered by unit tests, including one against real steam-user.

### 12. kill -9 mid-wrap is restored at the next launch
expected: After STOP plus kill -9 of shell and sidecar (interrupted state recorded: last state `Logged Off`, marker present, WantsOfflineMode=1 count 1), the launch-5 log has `go-offline restore trigger=boot: firing goonline` and `go-offline restore trigger=boot: Mac Steam back online, marker cleared`, connection_log.txt shows `processing complete` and last state `Logged On`, the marker is absent, the count is 0, and Friends is signed in and status changeable, judged by the operator.
result: pass — interrupt in launch 5 (19:56:43Z offsets): gooffline 08:57:11 (`wrap=toggled`, 1 authenticated, 0 restore lines), STOP plus KILL of both processes 08:57:12. At +20 s: last state `Logged Off`, marker present, WantsOfflineMode=1 count 1, no processes (defect state reproduced). Boot in launch 6 (08:58:28): 1 `go-offline restore trigger=boot: firing goonline` (08:58:28), 1 `go-offline restore trigger=boot: Mac Steam back online, marker cleared` (08:58:30). connection_log: `processing complete` and last state `Logged On` at 08:58:30. Marker absent, count 0. Operator: Friends signed in, status works. Re-run: re-run 2026-10-28 on 95a89d8d3: pass, launches 7-8; interrupted state reproduced (marker present, count 1), boot restore 10:44:32, marker cleared and `Logged On` 10:44:34, count 0.

### 13. A user's own offline choice survives quit and relaunch
expected: With Steam set offline by hand, after Cmd+Q and relaunch (launches 5 and 6) neither log slice contains any `go-offline restore trigger=` line, connection_log.txt has no `processing complete` and its last state is still `Logged Off`, and the WantsOfflineMode=1 count is 1; the operator then restores Steam online by hand.
result: pass — launches 6 and 7. Operator Go Offline 08:59:17, Cmd+Q 08:59:56, relaunch 09:00:29 (launch 7). `go-offline restore trigger=` count: launch-6 slice after the 19:59:31Z offset 0, launch 7 0. connection_log after the offset: 0 `processing complete`, 0 `user initiated logoff`, last state `Logged Off`. Marker absent, WantsOfflineMode=1 count 1 (the user's choice persisted). Operator: Steam stayed offline; then restored online by hand. Re-run: re-run 2026-10-28 on 95a89d8d3: pass, launches 8-9; 0 restore lines, 0 authenticated logons, last state `Logged Off`, count 1, Steam stayed offline.

## Notes

Recorded behaviour changes (not items to pass or fail):

- A bridge title installed before Phase 54 with an unsettled shared-redist ledger logs `shared redists: Steam client offline, skipping for <appId> (no open session and logon not allowed here)` at Play and launches without the redists until a Play follows a session-holding action (plans 05 and 08).
- A pre-Phase-54, license-gated bridge title Played before any Refresh shows the SteamBridgeSetup dialog with `Reason: launch-exe-not-resolved`; one Refresh backfills its launch target (plans 06 and 08).

## Gaps


- truth: "Mac Steam is never left offline by GameLib: every steam://open/gooffline the go-offline wrap fires is followed by steam://open/goonline, even if GameLib quits, crashes or is killed between the two"
  status: resolved
  resolved: "2026-10-28, plan 54-11 live gate. Items 10-13 all passed: a routed quit mid-wrap (item 10, launch 3) and a killed shell (item 11, launch 4) were restored online by the shutdown restore (trigger=shutdown); a kill -9 of both processes (item 12, launches 5-6) was restored at next boot (trigger=boot, marker cleared, Logged On 08:58:30); a user's own offline choice survived quit and relaunch with no restore line (item 13, launches 6-7). Marker absent and WantsOfflineMode=1 count 0 after items 10-12. Operator confirmed Friends signed in with status changeable."
  reason: "User reported: something seems wrong with steam, is opening offline. cant change to online"
  severity: blocker
  test: pre-gate (observed before item 1; no item 1-9 covers an exit mid-wrap)
  root_cause: "withMacSteamOffline fires gooffline, then restores with goonline only in its own `finally`. Nothing restores Steam if the process exits in between: no shutdown hook, no on-disk marker, no boot-time restore. Mac Steam persists the user-initiated offline choice (loginusers.vdf WantsOfflineMode=1), so one interrupted wrap leaves Steam offline across every Steam restart. Evidence 2026-10-27: two short-lived gamelib-shell instances spawned at 21:37:07 and 21:37:11 (gamelib-shell.log), connection_log.txt LogOff() at 21:37:08 'not auto reconnecting due to user initiated logoff', no Logged On until a manual steam://open/goonline at 22:58:31 restored it (WantsOfflineMode back to 0). Which code those instances ran is unproven (their gamelib.log rotated away); the missing restore path is proven by source."
  artifacts:
    - path: "src/backend/storeManagers/steam/macSteamOffline.ts"
      issue: "goonline only in withMacSteamOffline's finally (around line 290); no persistent record that GameLib took Steam offline"
    - path: "src/backend/storeManagers/steam/user.ts"
      issue: "releaseForShutdown does not restore Mac Steam online"
    - path: ".planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch/54-LIVE-GATE.md"
      issue: "no item exercises quit/kill between gooffline and goonline"
  missing:
    - "Persist an on-disk marker (e.g. under the GameLib config dir) BEFORE firing gooffline; clear it only after goonline is fired"
    - "Fire goonline from the sidecar shutdown path (stdin EOF / releaseForShutdown) when the marker is set, honouring the sidecar exit contract (bounded, unref'd)"
    - "At sidecar boot, if the marker is present (previous run died mid-wrap), fire goonline once and clear it; never fire goonline when GameLib did not take Steam offline (marker absent), so a user's own offline choice is respected"
    - "Unit tests for: marker written before gooffline; cleared after goonline; boot-time restore when stale; no goonline at boot when absent; shutdown restore"
    - "A new 54-LIVE-GATE.md / 54-UAT.md item: quit (and separately kill -9) GameLib between gooffline and goonline, then confirm Mac Steam is online after the next GameLib launch and loginusers.vdf WantsOfflineMode is 0"
  debug_session: ""

- truth: "A shell kill (stdin EOF) mid-connect leaves no authenticated Steam logon alive: the sidecar exits within 10 s and no logon completes after EOF"
  status: resolved
  resolved: "2026-10-28, fix 95a89d8d3 (debug session eb445bd56, .planning/debug/shutdown-mid-connect-logon-survives.md). Re-run of item 11 on that build passed (launch 6): sidecar gone within 4 s, no loggedOn or sync after EOF over 60 s, restore trigger=shutdown, Logged On 10:40:50. Caveat: the passing run did not reproduce the slow mid-connect path live (the logon had already landed before the kill); that path is covered by unit tests in 95a89d8d3, including one against the real steam-user library. Items 10 (repeat), 12 and 13 also passed on the fixed build."
  reason: "Post-review-fix re-run, item 11 on 20c1fe9d5: kill of the shell landed during a 7.9 s CM connect; steam-user's 5 s _logonMsgTimeout re-logged on about 6 s later (10:24:27), outside the wrap and while Mac Steam was online; the refresh completed and the sidecar was orphaned over 107 s until the orchestrator killed it."
  severity: major
  test: 11
  evidence: "54-LIVE-GATE.md, run record 2026-10-28 post-review-fix re-run"
