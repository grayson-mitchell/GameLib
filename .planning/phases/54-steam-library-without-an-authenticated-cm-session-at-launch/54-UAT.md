---
status: testing
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
source:
  - 54-LIVE-GATE.md
started: 2026-10-27T00:00:00Z
updated: 2026-10-27T10:05:00Z
---

Authored by plan 54-10, run by 54-11. The plan that authored this contract did not run any item of it.

Done-when being gated (ROADMAP): SC4, launch, browse, game page and Play leave Mac Steam Friends signed in with status changeable, and the anonymous session alone does not flip Friends. SC6 (live half), an explicit Refresh and a depot install with Mac Steam online leave Friends signed in with status changeable.

Before item 1, the runner completes preconditions PC1 to PC8 in 54-LIVE-GATE.md, including restarting `pnpm tauri:dev` so `build/main/sidecar.js` is rebuilt (tauri dev does not rebuild the sidecar) and checking its mtime is newer than the newest `feat(54-` commit. Evidence goes in `/tmp/gamelib-gate-<UTC>/`, never committed; record counts and timestamps here, not raw lines.

## Current Test

number: 1
name: Cold launch, idle 90 s
awaiting: plan 54-11 to run the gate

## Tests

### 1. Cold launch, idle 90 s
expected: After a cold launch and 90 s idle, the gamelib.log slice has no `CM logon mode=authenticated` line, the connection_log.txt slice has no `user initiated logoff` and still ends `Logged On`, and Friends is signed in and status changeable, judged by the operator.
result: pending

### 2. Browse the library and open three game pages
expected: Browsing the Steam library and opening three game pages leaves the gamelib.log slice with no `CM logon mode=authenticated` and no `go-offline wrap:` line, connection_log.txt with no new `user initiated logoff`, and Friends signed in and status changeable, judged by the operator.
result: pending

### 3. Play an installed title
expected: Playing an installed title (a bridge title if one is installed) leaves the gamelib.log slice with no `CM logon mode=authenticated` (and `CM logon mode=anonymous reason=launch-target` for a bridge title), connection_log.txt with no new `user initiated logoff`, and Friends signed in and status changeable, judged by the operator; record whether the title hit recorded behaviour change (i) or (ii).
result: pending

### 4. The anonymous session alone
expected: Item 3's gamelib.log slice contains `CM logon mode=anonymous reason=launch-target` and no `mode=authenticated` line while Friends is signed in and status changeable, judged by the operator; blocked (not failed) if no bridge title is installed, with that reason recorded.
result: pending

### 5. Explicit Refresh with Mac Steam online
expected: connection_log.txt shows `user initiated logoff` before gamelib.log's `CM logon mode=authenticated reason=user-refresh wrap=toggled`, then Mac Steam `RecvMsgClientLogOnResponse() : processing complete` and a `Logged On` state, with Friends signed in and status changeable 60 s later, judged by the operator, and the library count unchanged.
result: pending

### 6. Depot install with Mac Steam online
expected: Started at least 70 s after item 5 (after `CM session closed mode=authenticated cause=idle`), the install shows the same wrap evidence with `reason=user-install` in gamelib.log and connection_log.txt, completes, leaves Friends signed in and status changeable judged by the operator, and gamelib.log shows `CM session closed mode=authenticated cause=idle` at least 60 s after the install completes.
result: pending

### 7. Mac Steam set offline by hand, then Refresh
expected: With Mac Steam offline, Refresh logs `go-offline wrap: Mac Steam state=Logged Off, no toggle needed` and `CM logon mode=authenticated reason=user-refresh wrap=already-offline` in gamelib.log, connection_log.txt gains no `user initiated logoff` or `processing complete` from GameLib's action, and Steam stays offline.
result: pending

### 8. Guided fallback with a game running (conditional)
expected: With a Mac Steam game running, Refresh either wraps successfully (`wrap=toggled`, recording that the URL verb works with a game running) or shows the dialog with `CM logon skipped` and no `mode=authenticated` line, after which Steam > Go Offline plus Continue logs on with `wrap=guided-restore` and Steam returns online; fails only if an authenticated logon lands while connection_log.txt's last state is `Logged On`.
result: pending

### 9. Sidecar exit
expected: After quitting GameLib, `pgrep -f 'build/main/sidecar.js'` and `pgrep -f 'target/debug/gamelib-shell'` are both empty within 10 s.
result: pending

## Notes

Recorded behaviour changes (not items to pass or fail):

- A bridge title installed before Phase 54 with an unsettled shared-redist ledger logs `shared redists: Steam client offline, skipping for <appId> (no open session and logon not allowed here)` at Play and launches without the redists until a Play follows a session-holding action (plans 05 and 08).
- A pre-Phase-54, license-gated bridge title Played before any Refresh shows the SteamBridgeSetup dialog with `Reason: launch-exe-not-resolved`; one Refresh backfills its launch target (plans 06 and 08).

## Gaps


- truth: "Mac Steam is never left offline by GameLib: every steam://open/gooffline the go-offline wrap fires is followed by steam://open/goonline, even if GameLib quits, crashes or is killed between the two"
  status: failed
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
