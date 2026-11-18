---
status: pending
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
source: [81-19-PLAN.md, 81-CONTEXT.md D-01..D-15, 81-RESEARCH.md live gate, 81-04/05/07/08/09/13 SUMMARY live-gate notes]
started: 2026-11-18
updated: 2026-11-18
---

# Phase 81 live gate (contract)

Authored by plan 81-19 and run by plan 81-20 (standing rule D-E: the plan that writes a gate never runs it).
Nothing below has been run. Every `result:` is `pending` until 81-20 records the operator's report.

Item map: items 1-9 and 12 run on the operator's Mac; item 10 on Windows 11; item 11 on Linux.
Decision coverage: D-01 (items 2, 8), D-02 (4, 10, 11), D-03 (3, 10, 11), D-04 (2, 5), D-05 (5), D-07 (3, 10, 11), D-08 (1), D-09 (7), D-12 (6), D-14 (10, 11).
Owed-from-earlier-waves coverage: 81-04 helper in three states (item 1), 81-05 Windows/Linux adoption evidence (items 10, 11), 81-07 refused-restart notice with "Launch without Steam" (item 5), 81-08 `steam://open/main` relaunch on all three OSes (items 4, 10, 11) and the three themes (item 8), 81-09 the 112100 regression (item 3), 81-13 boot migration (item 6), the RESEARCH Linux real-game launch after relaunch (item 11), and the known 1026-edge gap (item 12, expected to fail today).

## Preconditions

Honour these before launch 1 and re-check after any restart of the app.

- Build prep, in this order, from the repo root: `pnpm build-steam-bridge` then `pnpm build:sidecar`. `tauri dev` rebuilds neither the sidecar nor the helper, so confirm the sidecar bundle's mtime is newer than the last backend change before trusting a backend result. Restart `pnpm tauri:dev` after either build.
- Launch with `pnpm tauri:dev`. Never `pnpm tauri:dev:run` (it skips the dev-vault flag and Keychain prompts on every launch).
- Mac Steam installed and signed in, and at least six small owned games that GameLib can depot-install, none already installed. Roles used below: A (restart-on-Play), B (the 112100 case; use appId 112100 if owned), C (refused restart, migration, themes, Restart Steam now), F and G (InstallApp), H (unadopted uninstall). A game can be reused for a later role after GameLib uninstalls it and Steam's own library shows it not installed.
- C must be a game with no Steam DRM that the game page offers "Launch without Steam" for (Settings > Games, the per-game "Launch without Steam" toggle is not greyed out). A second game that Steam already knows and can run (A after item 2) supplies "a game running in Steam".
- The experimental InstallApp setting ("Steam Experimental InstallApp Feature") is OFF except in item 7. Record its state at the top of every launch's notes.
- No pending records at the start: after launch 1 settles, no game page shows the adoption note. No leftover `steam_restart_hold.json` under `store_cache/` in the profile directory (`~/Library/Application Support/GameLib/` on this Mac). Remove a leftover one before launch 1 and note that you did.
- No pre-existing GameLib instance: `pgrep -f 'target/debug/gamelib-shell'` prints nothing before each launch (see Capture).
- Never quote a SteamID, an account name, a user path or a ticket in any result. Quote appIds and the log literals cited below only. The Steam tile in GameLib hides the account name on purpose: prove "signed in" through Steam's own window or the helper's `loggedOn`, not through the tile.
- There are no offline steps in this contract. If one is added later, the network goes off only for the action itself (off, act, on, then report), because the operator needs the network to talk to Claude.

## Capture

Dual-sink standard (spike-findings-gamelib `live-gate-contract-authoring.md` Section 3). Two sinks, and each scored line lives in exactly one of them.

- Terminal transcript sink: Rust lines (the `gamelib-steampoll:` lines written by `eprintln!` in `src-tauri/crates/gamelib-steampoll/src/adoption.rs`, plus `[shell]` and `[sidecar:err]` lines). They never reach `gamelib.log`.
- `gamelib.log` sink: sidecar `logInfo`/`logWarning` lines (the `[Steam]` and `SteamGame:` lines cited per item). They never reach the terminal transcript. Sidecar `console.*` reaches neither, so none is scored.

Per-OS locations of `gamelib.log`: macOS `~/Library/Logs/GameLib/gamelib.log`; Windows `%LOCALAPPDATA%\GameLib\logs\gamelib.log`; Linux `${XDG_STATE_HOME:-$HOME/.local/state}/GameLib/logs/gamelib.log`. On launch, the next writer renames the existing file to `gamelib.log.old` (`src/backend/logger/log_writer.ts`), so archive before the next launch.

Create the session directory once, before launch 1 (macOS and Linux shown; on Windows use `$env:TEMP\gamelib-gate-<UTC>` and `Tee-Object -Append -FilePath`, the `pwsh` equivalent of `tee -a`):

    SESSION=/tmp/gamelib-gate-$(date -u +%Y%m%dT%H%M%SZ); mkdir -p "$SESSION"; echo "$SESSION"
    cp ~/Library/Logs/GameLib/gamelib.log.old "$SESSION/gamelib-pre-session.old.log" 2>/dev/null

Each launch N (N starts at 1 and counts every launch of the app during the run), exactly in this order:

    pgrep -f 'target/debug/gamelib-shell'     # must print nothing; if it prints a pid, ABORT, quit it, start again
    echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$SESSION/terminal.log"
    pnpm tauri:dev 2>&1 | tee -a "$SESSION/terminal.log"

- Always `tee -a`, never a bare `tee` and never `>`. A bare `tee` truncates the transcript on every relaunch, and items 6 and 10-11 relaunch the app.
- The delimiter is exactly `=== GATE LAUNCH ${N} — <UTC> ===`. Find the section boundaries with `grep -n '^=== GATE LAUNCH' "$SESSION/terminal.log"`.
- Once the window is up, in a second terminal, assert exactly one instance and record its pid: `pgrep -f 'target/debug/gamelib-shell' | tee -a "$SESSION/terminal.log"` must print exactly one pid. Record it again at teardown. If the count is ever not 1 the launch is ABORTED and re-run; its evidence is not scorable (a second instance splits the terminal sink while `gamelib.log` stays shared).
- Before the next launch, and at the end of the run, archive: `cp ~/Library/Logs/GameLib/gamelib.log "$SESSION/gamelib-launch-${N}.log"`.
- Every item's result names its launch ordinal (`L<N>`). Several items may share a launch.
- Closing inventory, recorded in the result of the last item run: `ls -la "$SESSION"/` and `wc -l "$SESSION"/*`. A missing or zero-length file is visible then, while the evidence still exists.
- Captures stay in the session directory under `/tmp` and are never committed (T-81-44). Quote only appIds and the literals cited below.
- Never use the terminal transcript to prove a backend path did not run. Every absence below is checked against something that would have shown presence (a log line, a dialog, a pid).

## Run order (Test 5, requirement pairs)

Mac run: item 1, then item 2, then 5, then 6, then 8, then 4, then 3, then 9, then 7, then 12.

- Item 1 first: it signs Steam out and quits it, which would destroy any unadopted state set up earlier.
- Item 2 consumes Steam's own restart on game A. Game C is installed after it, so C is unadopted by the new Steam.
- Items 5, 6 and 8 all need C to be unadopted and the same Steam pid alive, and any Steam restart or Steam sign-in adopts every pending ACF. So they run before items 4 and 3.
- Item 6 needs the pid that is alive when GameLib is relaunched to be the pid the hand-written record names, so no Steam restart sits between its setup and its boot.
- Item 4 restarts Steam and so destroys the same-pid evidence item 3 needs. Item 3 takes its "before" pid after item 4 is done and records it before any further restart. Item 3's sign-in also adopts everything pending, so nothing pending may be needed afterwards: item 9 installs its own game H after item 3.
- Item 7 last of the Mac installs: its signed-out sign-in adopts whatever is pending, and its setting toggle changes the install path for later games.
- Windows (item 10) and Linux (item 11) follow the same internal order, written out in each item.

## Tests

### 1. Helper live reading in three states (macOS, D-08, 81-04)
expected: With Steam signed in, `public/bin/arm64/darwin/steam-bridge-helper --steam-appstate <an installed appId>` prints exactly one JSON line `{"result":"ok","loggedOn":1,"state":...}` whose state has bit 4 (value 4 for an adopted game); at Steam's sign-in screen it prints `{"result":"ok","loggedOn":0,...}`; with Steam quit it prints `{"result":"unavailable","reason":"steam-not-running"}`; no line contains a SteamID (grep the three lines for a 17-digit number starting 7656119: no match).
result: pending
launch: none (the helper is run from a terminal, no app launch needed; run before launch 1). Real-profile arm: the helper reads the real Steam profile, not a fake HOME (D-08; `gl_ia_find_method_slot` with the interface-17 marker resolves `GetAppInstallState`, proven only against a live client).
runs on: Mac. Steps: (a) signed in, run it for an installed appId and for appId 112100 if not installed; (b) Steam menu, sign out so the sign-in window shows, run it again; (c) quit Steam, run it again; (d) relaunch Steam and sign in again.
scores: the three stdout lines (terminal). The helper is a standalone process, so its output is neither of the app's sinks; paste it into the session directory with `tee -a "$SESSION/helper.log"`.

### 2. Signed-in restart-on-Play (macOS, D-01, D-04)
expected: With Steam signed in and InstallApp OFF, GameLib installs game A; the badge reads Installed, Play is enabled, and the note under the status reads "Steam will restart once when you press Play." with a "Restart Steam now" action. Pressing Play shows the existing steam-starting status, Steam quits and relaunches once, game A starts, no Steam install dialog appears, and the note is gone.
result: pending
launch: L1 (first app launch; the install and the Play are in the same launch).
runs on: Mac.
scores: UI observation; `pgrep -x steam_osx` before Play and after the relaunch shows two different pids; gamelib.log `[Steam] fired steam://exit to adopt <appId> on restart` (`src/backend/storeManagers/steam/macSteamAdoption.ts:445`) and `[Steam] Steam exited after <ms> ms; relaunching <appId>` (`macSteamAdoption.ts:468`); no `Play for <appId> not launched` line (`playAdoption.ts:143`). Before pressing Play, run the helper for A: its state must not be 4 (the positive observable that Steam has not adopted A; Test 6).

### 3. The 112100 case: sign-in clears the note, same Steam pid (macOS, D-03, D-07, 81-09)
expected: With Steam open at its sign-in screen when the install finishes, GameLib shows the note "Sign in to Steam to finish setup" with an "Open Steam" action; Open Steam brings Steam forward; after the operator signs in, the note clears on its own within about 30 seconds (a 5 second watch tick, plus up to 15 seconds between helper reads) with no page reload; `pgrep -x steam_osx` prints the same pid before the sign-out, at the sign-in screen and after sign-in; Play then launches the game without a Steam restart.
result: pending
launch: any launch after item 4; note the ordinal. Steps: record the pid; Steam menu, sign out so the sign-in window shows; confirm the sign-in screen by the helper's `loggedOn 0` (positive observable that the premise holds); install B in GameLib with InstallApp OFF; watch the note and press Open Steam; sign in; start a stopwatch at sign-in; record when the note clears; record the pid again; press Play.
runs on: Mac. Main regression scenario of the phase.
scores: UI observation and the stopwatch; the pid before and after; terminal line `gamelib-steampoll: adoption appId <appId> adopted (<evidence>)` (`src-tauri/crates/gamelib-steampoll/src/adoption.rs:658`; evidence is `acf` or `helper`); no terminal line `signed in but not adopted, requested InstallApp` (it is the InstallApp fallback, `adoption.rs:574`, and must not appear here because InstallApp is OFF); no `Steam exited after` line for B in gamelib.log after sign-in. While the sign-in screen is up, also read the note on the sign-in variant in the three themes if time allows (item 8 owns the verdict).

### 4. Restart Steam now (macOS, D-02, 81-08)
expected: With game C pending and no game running in Steam, pressing "Restart Steam now" quits Steam and relaunches it with `steam://open/main` with no game started and no install dialog; Steam comes up in front of other windows; the note clears; Steam's own library lists C as installed; the helper's state for C is 4.
result: pending
launch: same launch as item 5 or a later one; note the ordinal. Quit game A first (Restart Steam now refuses while a game runs in Steam; item 5 covers that refusal).
runs on: Mac. Relaunch variant is `steam://open/main` (81-08); if Steam does not come back, the fallbacks recorded in 81-08-SUMMARY (`open -b com.valvesoftware.steam`) are for the fix, not for this item.
scores: UI observation (no game window or process appears after Steam is back: `pgrep -f` the game's binary prints nothing); `pgrep -x steam_osx` before and after shows different pids; gamelib.log `fired steam://exit to adopt <appId> on restart` (`macSteamAdoption.ts:445`) and `Steam exited after <ms> ms; relaunching <appId>` (`macSteamAdoption.ts:468`); the pending record is gone (`find "$HOME/Library/Application Support/GameLib" -name 'steam_pending_adoption*'` and look for C's appId, never the whole file).

### 5. Refused restart with "Launch without Steam" (macOS, D-05, 81-07)
expected: With game A running in Steam, pressing Play on the pending game C shows an in-app notice reading "Quit the game running in Steam, then press Play to finish setting up <C's name>."; Steam is not quit, no Steam install dialog appears, the note on C is still shown and C's record is still pending. Because C is eligible, the notice carries "Launch without Steam"; pressing it starts C once without Steam, does not change C's per-game "Launch without Steam" toggle in Settings, leaves the record pending, and a second press while C is starting does nothing extra. For a game with Steam DRM (use any DRM-marked game you have pending, or record skipped) the notice has no such button.
result: pending
launch: same launch as item 6 (both before any Steam restart); note the ordinal.
runs on: Mac. Steps: with A running from item 2, install C (InstallApp OFF); note the per-game toggle state in Settings first; press Play on C; read the notice; press "Launch without Steam"; confirm C runs; quit C; reopen Settings and compare the toggle; confirm `steam_pending_adoption` still holds C.
scores: UI observation; gamelib.log `[Steam] not restarting Steam for <appId>: game <runningAppId> is running` (`macSteamAdoption.ts:425`) and `SteamGame: Play for <appId> not launched (game-running); pending adoption kept` (`playAdoption.ts:143`); no `fired steam://exit` for C in this launch (presence would show; its absence is meaningful, because the restart path logs it, `macSteamAdoption.ts:445`).

### 6. Boot migration of an old hold record (macOS, D-12, 81-13)
expected: With GameLib quit and a `steam_restart_hold.json` in the profile holding one valid record for the pending game C (pid and start token of the live Steam) and one record for an appId with no ACF, the next GameLib start (a) migrates C's record to a pending adoption record so C shows the note "Steam will restart once when you press Play.", (b) drops the no-ACF record without leaving a pending record for it, (c) deletes `steam_restart_hold.json`, (d) logs `[Steam] restart-hold migration <C appId>: migrated` and `[Steam] restart-hold migration <ghost appId>: acf-gone`.
result: pending
launch: a relaunch (note the ordinal; the previous launch ends first and its gamelib.log is archived before the relaunch, see Capture).
runs on: Mac. Steps: (1) with C pending and the live Steam pid unchanged since C was installed, quit GameLib, archive its `gamelib.log`; (2) find and remove C's entry from the pending-adoption store file (`find "$HOME/Library/Application Support/GameLib" -name 'steam_pending_adoption*'`; keep a copy in the session directory; remove only C's key, so the migration is the only source of the record afterwards); (3) take the live pid with `pgrep -x steam_osx` and its start token with `ps -o lstart= -p <pid>`; (4) write `<profile>/store_cache/steam_restart_hold.json` shaped like `src-tauri/crates/gamelib-steampoll/tests/fixtures/restart_hold/ts-written.json`: an object keyed by appId, each value `{"pids":[{"pid":<pid>,"startToken":"<the ps lstart output, for example Mon Nov 16 09:12:03 2026>"}],"recordedAt":<epoch ms now>,"macNativeRoute":true,"skippedDepots":[]}`; use C's appId for the first record and an appId such as 999999 (with no ACF anywhere) for the second; (5) launch GameLib; (6) at the end, confirm the file is gone and remove nothing else.
scores: gamelib.log `[Steam] restart-hold migration <appId>: <outcome>` (`src/backend/storeManagers/steam/adoptionWatch.ts:219`; the sidecar logs it, so it is in `gamelib.log`, not the terminal); the file's absence (`ls`); the note on C; the pending store holding C and not 999999. Cleanup (T-81-45): the file is deleted by the app on success; if it is still there afterwards, delete it by hand and report an issue, and put back the pending store copy only if C's record is missing.

### 7. InstallApp ON, and its sign-in fallback (macOS, D-09)
expected: With the setting ON and Steam signed in, installing F adopts it through InstallApp with no restart and no note; gamelib.log shows `SteamGame: Steam adopted appId <F> via InstallApp without a restart`. With the setting ON and Steam signed out when game G's install finishes, InstallApp is refused or unavailable, G shows the note "Sign in to Steam to finish setup", and gamelib.log shows `SteamGame: InstallApp adoption of <G> not used (...) — recording restart-on-Play instead`; after sign-in the note clears on its own, and the terminal shows no `requested InstallApp` line unless G stayed un-adopted for 10 seconds after sign-in, in which case the terminal shows exactly one.
result: pending
launch: one launch with the setting turned ON before the first install; turn it OFF again at the end and record that.
runs on: Mac. Steps: (a) setting ON, Steam signed in, install F; (b) Steam signed out (confirm with the helper's `loggedOn 0`), install G; (c) sign in and watch the note; (d) setting OFF.
scores: gamelib.log `SteamGame: Steam adopted appId <appId> via InstallApp without a restart` (`gameInstallDepot.ts:284`) and `SteamGame: InstallApp adoption of <appId> not used` (`gameInstallDepot.ts:289`); terminal `gamelib-steampoll: adoption appId <appId> adopted (<evidence>)` (`adoption.rs:658`) and, only if the fallback fired, `adoption appId <appId> signed in but not adopted, requested InstallApp (<ok|unavailable|error>)` (`adoption.rs:574`). Absence of the fallback line is meaningful: the fallback path would write that line if it ran.

### 8. The note in three themes (macOS, 81-08)
expected: With game C pending (the restart-on-Play note and the "Restart Steam now" button shown), switching the app theme to midnightMirage, then gruvbox_dark, then dracula keeps the note text and the action readable in each (text contrast against the page background, button label legible, nothing clipped, wraps under the status line rather than overflowing). The sign-in variant ("Sign in to Steam to finish setup" with "Open Steam") reads in the same three themes when it is shown during item 3.
result: pending
launch: same launch as item 6; note the ordinal. Theme is a setting: the operator changes it in Settings and returns to C's page. Record the theme you started in and restore it.
runs on: Mac. A screenshot per theme is the evidence; attach to the session directory, not the repo.
scores: UI observation only (a theme change emits no log line).

### 9. Uninstall of an unadopted game (macOS, D-06)
expected: With game H installed by GameLib and still unadopted, pressing Uninstall removes the files directly by GameLib, without a hang and without asking Steam, the game returns to not installed, and the "Game Uninstalled" notification fires; the pending record for H is gone.
result: pending
launch: any launch after item 3; note the ordinal. Steps: install H (InstallApp OFF); confirm the note; Uninstall; check the folder and the store.
runs on: Mac.
scores: UI observation; the install folder for H is gone (`ls`); the pending store no longer has H's appId; the game's state afterwards is not installed in GameLib. Run the helper for H afterwards: it must not report 4.

### 10. Windows 11: restart-on-Play, sign-out, adoption evidence (D-14, 81-05, 81-08)
expected: On Windows 11 with native Steam, (a) a GameLib-installed unadopted game shows Installed, Play and the restart-on-Play note, and Play quits Steam via `steam://exit` and relaunches it with the game once, with no install dialog and the note gone; (b) with another game running in Steam, Play on a second pending game is refused with the in-app notice and Steam is not quit; (c) "Restart Steam now" relaunches Steam alone with `steam://open/main`, no game starts, the note clears and the game is installed in Steam; (d) Uninstall of a still-pending game removes it directly with no hang and no pending record left; (e) with Steam signed out (signing out restarts `steam.exe`, which gives a new pid), a game GameLib installs shows the pending note and the note does NOT clear when the pid changes or while Steam sits at the sign-in screen; it clears only after sign-in. (f) Evidence: Steam's `logs\content_log.txt` gains a `Loaded N apps from install folder` line on that rescan; HKCU `ActiveProcess` `ActiveUser` is 0 while signed out and non-zero after sign-in; the terminal shows `adoption appId <appId> adopted (acf|log)`.
result: pending
launch: record per sub-check as L<N>.
runs on: Windows 11. PowerShell equivalents: pid `(Get-Process -Name steam).Id`; one-instance assertion `Get-Process gamelib-shell -ErrorAction SilentlyContinue` (must print nothing before a launch and one row after); sign-in read `reg query "HKCU\Software\Valve\Steam\ActiveProcess" /v ActiveUser` (report only "0" or "non-zero", never the number); evidence file `<Steam install dir>\logs\content_log.txt`. Order: (a), then install C2 while (a)'s game runs and press Play on C2 for (b); install H2 and Uninstall it for (d); quit the running game; "Restart Steam now" on C2 for (c); then sign out of Steam and run (e), (f). Any Steam restart adopts every pending ACF, so (b) and (d) come before (c) and (e).
scores: UI observation; terminal `gamelib-steampoll: adoption appId <appId> adopted (<evidence>)` (`adoption.rs:658`); gamelib.log `fired steam://exit to adopt` and `relaunching <appId>` lines (`macSteamAdoption.ts:445,468`, the same restart code runs on every OS); pid before and after each restart; `content_log.txt` line and `ActiveUser` zero/non-zero. The sign-out step in (e) must record the pid before and after sign-out and the note's visibility at each point: a cleared note on a pid change alone is an issue (a sign-out is not adoption).

### 11. Linux: restart-on-Play, a real game after relaunch, sign-out, adoption evidence (D-14, 81-05, 81-08, RESEARCH)
expected: On Linux with native Steam (record whether Steam is native or Flatpak; Flatpak is untested), the same five behaviours as item 10 (a) to (e) hold, and in addition (a) is done with a real game, not a tool app: after Steam quits and relaunches the game window opens and the game plays (spike 088 only proved a tool app, so a real launch after the relaunch is the new evidence). Evidence: `steamapps/libraryfolders.vdf` lists the app in a folder's `apps` map after adoption; `logs/content_log.txt` gains a `Loaded N apps` line with N one higher on the rescan; `logs/connection_log.txt` ends in a `Logged On` state line after sign-in and `Logged Off` while signed out; the terminal shows `adoption appId <appId> adopted (log|libraryfolders)`. A sign-out restarts `steam` (new pid) with the ACF untouched, and the pending note must stay until sign-in.
result: pending
launch: record per sub-check as L<N>.
runs on: Linux. Commands: pid `pgrep -x steam`; one-instance assertion `pgrep -f 'target/debug/gamelib-shell'`; evidence files under the Steam root (for example `~/.local/share/Steam/`): `steamapps/libraryfolders.vdf`, `logs/content_log.txt`, `logs/connection_log.txt`; `gamelib.log` at `${XDG_STATE_HOME:-$HOME/.local/state}/GameLib/logs/gamelib.log`. Use the same ordering as item 10 (pending-only checks before any Steam restart or sign-in).
scores: UI observation; the game window after relaunch; terminal `adoption appId <appId> adopted (<evidence>)` (`adoption.rs:658`, evidence is `log` or `libraryfolders` on Linux because Steam does not rewrite the ACF there); the three Steam files as above; pid before and after.

### 12. KNOWN GAP: "Restart Steam now" at the GameLib 1026 waiting edge (macOS, expected to fail today)
expected: At the GameLib 1026 waiting edge (an install whose ACF reads StateFlags exactly 1026 while GameLib's poll is on it, the `steam-waiting-for-restart` status, button label "Restart Steam to finish"), the note block shows "Restart Steam now" and pressing it restarts Steam and relaunches it. TODAY IT DOES NOTHING VISIBLE: no pending-adoption record exists on that path, so the backend answers `no-record`, and nothing restarts. This item is recorded so the operator observes the failure; it is not fixed by Phase 81 plans (logged in `deferred-items.md` as an orchestrator note after 81-08 for the verifier).
result: pending
launch: any launch; note the ordinal. Reaching the edge: a native handoff install (a `steam://install/<appId>` that Steam leaves at 1026) or a GameLib depot install that finished with `allowFullOwnership` false (`src/backend/storeManagers/steam/depotRust/install.ts:165`); if the operator cannot reach the edge, record `blocked` with the reason, not `skipped`.
runs on: Mac.
scores: UI observation (the button is shown and pressing it leaves Steam running with the same pid); gamelib.log has no `fired steam://exit` for that appId after the press. The expected result when run today is an issue; do not file a fix under this phase, the verifier routes it.

## Structural Reachability Review

Applied before first use, as the standing reference requires (live-gate-contract-authoring.md Sections 2 and 3). No item below was run. Verdicts: REACHABLE, CONDITIONAL (condition recorded), IMPOSSIBLE (none remain).

Tests 1-7 were applied to every item, sub-check and precondition, and to the capture instruction itself.

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|
| 1a signed-in reading | `steam-bridge-helper --steam-appstate` | one JSON line with loggedOn 1 and a state | CONDITIONAL | Needs `pnpm build-steam-bridge` first; the binary exists at `public/bin/arm64/darwin/steam-bridge-helper` and the slot resolution for `GetAppInstallState` is proven only live (81-04-SUMMARY). Condition: fresh helper build. |
| 1b sign-in screen reading | the helper at Steam's sign-in screen | loggedOn 0 | REACHABLE | D-08 uses `BLoggedOn`, not `ConnectToGlobalUser` (CONTEXT D-08); positive observable is the visible sign-in window. |
| 1c Steam quit | the helper with no Steam | `unavailable` / `steam-not-running` | REACHABLE | Command: `pgrep -x steam_osx` empty first; reason string is from 81-04-SUMMARY live-gate note. |
| 1d no SteamID in output | helper stdout | absence of a 17-digit number | REACHABLE | Test 4 kind: falsifiable, because a printed SteamID would match `7656119[0-9]{10}`; guarded by T-81-10..14. |
| 2 restart-on-Play | Play, status, note, "Restart Steam now" | note, restart once, game starts | REACHABLE | Note and button: `src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx:75-121`, mounted at `GamePage/index.tsx:599-601`; Play shown by MainButton for an installed game; log literals `macSteamAdoption.ts:445,468`. |
| 2 premise: Steam has not adopted A | Steam's own view | the helper state is not 4 before Play | CONDITIONAL | Test 6: an emptied app-side store does not prove Steam's state. Positive observable is the helper's state for A before Play. Condition: A was installed after Steam last started. |
| 3 sign-in screen at install end | Steam sign-in window | install finishes while signed out | CONDITIONAL | Test 6: the premise needs a positive observable, the helper `loggedOn 0` (item 1b mechanism). GameLib's own CM session installs without Steam. Condition: B owned and installable; appId 112100 if owned. |
| 3 note text and Open Steam | AdoptionNote signed-out branch | "Sign in to Steam to finish setup" and "Open Steam" | REACHABLE | `AdoptionNote.tsx:81-85,112-121`; the log for the action is `SteamGame: opening Steam from the adoption note` (`adoptionStatus.ts:198`). |
| 3 note clears on its own, same pid | adoption watch push | clear within about 30 s | REACHABLE | Tick 5 s and helper signed-in interval 15 s (`src-tauri/crates/gamelib-steampoll/src/constants.rs:40,48`); push on adoption (81-09-SUMMARY). |
| 3 no restart on Play afterwards | Play gate | clear-and-launch | REACHABLE | `playAdoption.ts:85-87` clears and unwatches on adopted. |
| 3 no InstallApp fallback line | terminal sink | absence of the `requested InstallApp` line | REACHABLE | Test 4: the emitter would print on presence (`adoption.rs:574`), and the sink is the terminal (Rust `eprintln!`, `adoption.rs:281`). |
| 4 Restart Steam now | AdoptionNote button, backend restart, `steam://open/main` | Steam relaunches alone, note clears | CONDITIONAL | Button `AdoptionNote.tsx:105-117` is disabled while busy, launching or playing, and the backend refuses while a game runs (`macSteamAdoption.ts:425`). Condition: A quit first. Relaunch literal is `open/main` (81-08-SUMMARY). |
| 4 "no game starts" | process list | absence of the game process | REACHABLE | Test 4: a started game would show as a process or window; checked by `pgrep -f` on the game binary. |
| 5 game running in Steam | Steam's RunningAppID | A running | CONDITIONAL | Test 6: A must have been started by Steam (item 2 does it through Play). Condition: A still running when Play is pressed on C. |
| 5 notice text | in-app notice | "Quit the game running in Steam..." | REACHABLE | Key `steam.adoptRestart.gameRunning` (`public/locales/en/gamelib.json:701-706`); the notice component maps the closed kind (`SteamEngineLaunchNotice/index.tsx:770-785`). |
| 5 "Launch without Steam" action | notice action | one launch, setting unchanged | CONDITIONAL | Test 7: the button renders only when the backend's verdict applies (`SteamEngineLaunchNotice/index.tsx:771-785`, `playAdoption.ts` sets the flag). Condition: C is eligible and the Settings toggle for C is greyed out only for DRM games (`screens/Settings/components/LaunchWithoutSteam.tsx`). DRM-game sub-check is CONDITIONAL on having one; otherwise record skipped. |
| 5 no install dialog, no plain rungameid | Steam window | absence of Steam's install dialog | REACHABLE | Test 4: the dialog is the visible presence signal; the restart code logs `fired steam://exit` on its path (`macSteamAdoption.ts:445`). |
| 6 GameLib quit before the file is written | app lifecycle | quit, then write | REACHABLE | Test 5: the store is read once at boot (`adoptionWatch.ts:280-300`); writing with the app up has no effect. |
| 6 live Steam pid and start token | `pgrep`, `ps -o lstart=` | token matches Steam | CONDITIONAL | Rust compares the recorded token to `ps -o pid=,lstart=` (`steam_process.rs:154-163`); a token that does not match, or a Steam that exited, drops the record (`hold_migration.rs`, `Drop` on `SteamExited`/`PidReused`). Condition: Steam unchanged from C's install to the relaunch; the pid file shape follows `tests/fixtures/restart_hold/ts-written.json`. |
| 6 pre-existing pending record for C | pending store | the migration is the only source | CONDITIONAL | Test 6: the pending store from C's install already holds a record, which would mask the migration. Condition: step 2 removes C's key and the file is checked before the relaunch. |
| 6 log literals and file deletion | gamelib.log, filesystem | `restart-hold migration` lines, file gone | REACHABLE | `adoptionWatch.ts:219` (sidecar, so gamelib.log) and `discard_hold_store` (`hold_migration.rs`); the sink is `gamelib.log`, not the terminal (Test 3). |
| 7a InstallApp adopts | `gameInstallDepot.ts` install-end branch | no restart, no note | CONDITIONAL | The setting is macOS only (`experimentalInstallAppSetting.ts`); Condition: the setting ON and Steam signed in at install end. |
| 7b signed out, fallback and no-fallback | InstallApp setting plus sign-in | note, then clears, no InstallApp unless 10 s | CONDITIONAL | Test 6 (sign-in screen confirmed by the helper) and Test 4: `ADOPTION_INSTALLAPP_FALLBACK_DELAY_MS` is 10 s (`constants.rs:51`); a fallback would print `adoption.rs:574` on the terminal. Condition: either outcome is legitimate, the item scores what was observed. |
| 8 three themes | Settings theme selector, note | readable | REACHABLE | Theme names exist in `src/frontend/themes.scss`; the note uses theme tokens only (`AdoptionNote.scss`). |
| 8 note present during the theme change | C pending | note visible | CONDITIONAL | Test 5: a Steam restart adopts C and removes the note. Condition: item 8 runs before item 4 (run order). |
| 9 unadopted uninstall | Uninstall button, direct removal | no hang, no record | REACHABLE | Uninstall is the standard page action; the unadopted path is the direct removal in `gameUninstall.ts` (81-06-SUMMARY). |
| 9 H stays unadopted until uninstalled | Steam | no restart or sign-in between install and uninstall | CONDITIONAL | Test 5: item 3's sign-in adopts everything pending, so H is installed after item 3 and uninstalled immediately. |
| 10 Windows (a)-(f) | native Steam on Windows 11 | the restart-on-Play flow, sign-out check, evidence | CONDITIONAL | Needs the operator's Windows machine (spike 087 environment); Play gate runs on every OS (81-06-SUMMARY); sign-out restart and `ActiveUser` are from spike 087 (CONTEXT D-14); the `[shell]` terminal sink is the PowerShell transcript. Condition: `pnpm tauri:dev` runs there. |
| 10 (e) sign-out must not clear | pid change on Windows | the note stays | REACHABLE | Pid change is not evidence off macOS (81-05, `adoption_evidence.rs`, four tests); the positive observable is the pid before and after plus the visible note. |
| 11 Linux (a)-(e) with a real game | native Steam on Debian | restart-on-Play and a real game launch | CONDITIONAL | Spike 088 environment; Flatpak is untested (CONTEXT D-14) and is recorded, not assumed. Condition: the game has a launch option (not a tool app). |
| 11 evidence files | `libraryfolders.vdf`, `content_log.txt`, `connection_log.txt` | adoption lines | REACHABLE | Evidence sources are those the Rust watcher reads (`adoption_evidence.rs:7-25,189,251`). |
| 12 known gap at the 1026 edge | AdoptionNote at `steam-waiting-for-restart` | pressing the button restarts Steam | CONDITIONAL | The control exists (`AdoptionNote.tsx:75-78,105-121`) and the failing behaviour is the point of the item. Condition: the 1026 edge can be produced; `depotRust/install.ts:165` writes 1026 when `allowFullOwnership` is false. |
| Precondition: no leftover `steam_restart_hold.json` | profile `store_cache` | clean start | REACHABLE | Test 6: the path is `store_cache/steam_restart_hold.json` (`profile.rs:91-94`); `ls` before launch 1. |
| Precondition: InstallApp setting state | Settings | OFF except item 7 | REACHABLE | Test 5/6: the setting changes the install-end branch (`gameInstallDepot.ts:259-290`); recorded at every launch. |
| Precondition: game not already adopted | Steam | A, B, C, F, G, H unknown to Steam | CONDITIONAL | Test 6: a game Steam adopted earlier is not pending after a reinstall only if Steam also forgot it. Condition: use fresh games, or uninstall in GameLib and confirm Steam lists it as not installed. |
| Precondition: one app instance | `pgrep -f 'target/debug/gamelib-shell'` | none before, one after | REACHABLE | Capture rule from the standing reference; checked per launch. |
| Capture: `tee -a` with relaunch (items 6, 10, 11) | terminal transcript | append across launches | REACHABLE | Test 5: the relaunch would truncate a bare `tee`; the contract mandates `tee -a` and archives `gamelib.log` per launch before the next launch renames it to `.old`. |
| Capture: terminal vs gamelib.log sinks | both sinks | each scored literal in its sink | REACHABLE | Test 3 sinks: Rust `eprintln!` lines at `adoption.rs:574,658` are terminal; `logInfo`/`logWarning` lines at `playAdoption.ts:143`, `macSteamAdoption.ts:425,445,461,468`, `adoptionWatch.ts:219`, `adoptionStatus.ts:198`, `gameInstallDepot.ts:284,289` are gamelib.log. |

Test 5 pairing pass. Reduction applied: every state-mutating requirement considered against every evidence-bearing requirement, not the full cross product. State-mutating requirements: M1 a GameLib relaunch (items 6, 10, 11), M2 a Steam restart (items 2, 4, 10, 11), M3 a Steam sign-out and sign-in (items 1, 3, 7b, 10, 11), M4 quitting Steam (item 1c), M5 hand-written hold file and removed pending key (item 6), M6 an uninstall (item 9), M7 the InstallApp toggle (item 7), M8 a theme change (item 8). Evidence-bearing requirements: E1 the appended terminal log, E2 the per-launch `gamelib.log` archive, E3 the pid before and after (items 3, 10, 11), E4 the pending store (items 4, 5, 6, 9), E5 helper readings (items 1, 2, 3, 7b), E6 content_log and connection_log lines (items 10, 11), E7 an unadopted game for the next item. Eight mutators by seven evidence requirements is 56 pairs; 11 were flagged and each has a fix already in the contract:

- M1 x E1 and M1 x E2: a relaunch truncates a bare `tee` and rotates `gamelib.log` to `.old`; fixed by `tee -a` and the per-launch archive.
- M2 (item 4) x E3 (item 3): Steam's restart destroys item 3's same-pid evidence; fixed by running item 3 after item 4 and taking the pid after.
- M2 and M3 x E7 (items 5, 6, 8 need C unadopted): any restart or sign-in adopts every pending ACF; fixed by the run order.
- M3 (item 3 sign-in) x E7 for item 9: fixed by installing H after item 3.
- M3 (item 7b) x E7: item 7 runs after item 9.
- M4 (item 1c) x E7: item 1 runs first, before any pending game exists.
- M5 x E4: the existing pending record for C would mask the migration; fixed by removing C's key.
- M5 x E3 (item 6's pid token): needs Steam unchanged; run order puts item 6 before item 4.
- M6 x E4: the uninstall removes the record by design; scored as intended.
- M7 x E5: the setting is OFF before item 1 and turned back OFF after item 7.
- M8 x E7: a theme change touches nothing in Steam; no pair flagged, none lost.

Test 6 pre-existing external state, per item: items 2, 4, 5, 6, 8, 9 depend on Steam's adopted/unadopted view of the game (positive observable: the helper state, item 1 mechanism); item 3 depends on Steam's sign-in state (positive observable: the helper's `loggedOn 0` or the visible sign-in window); item 6 depends on the pending store and a leftover hold file (observable: `find` and `ls` before launch); item 7 depends on the persisted setting; item 12 depends on the 1026 edge being producible; items 10 and 11 depend on Steam's own state on those machines (observable: `ActiveUser`, `connection_log.txt`).

Test 7 gestures traced to the shipped UI: Play, "Restart Steam now" and "Open Steam" all render from `AdoptionNote.tsx` and `MainButton.tsx`, mounted for Steam games at `GamePage/index.tsx:599-601`; the refused-restart notice action renders at `SteamEngineLaunchNotice/index.tsx:770-785`; the per-game toggle is `screens/Settings/components/LaunchWithoutSteam.tsx`; the theme selector is in Settings. In the installed-but-pending state the note's button is disabled only while an action is in flight, the game is launching, or the game is playing (`AdoptionNote.tsx:110`); the item steps press it when none of those holds. In `steam-waiting-for-restart` the button is the only way forward (`AdoptionNote.tsx:75-78`), and the item 12 failure is in the backend, not in reachability.

Test 4 absences, kinds recorded: the no-SteamID check (item 1d) and the no `requested InstallApp` check (items 3, 7) are falsifiable, because the emitter would print on presence; "no install dialog" (items 2, 5) is falsifiable by the visible dialog; "no `fired steam://exit` for C" (item 5) is falsifiable by `macSteamAdoption.ts:445`; "no game starts" (item 4) is falsifiable by a process or window; "the note does NOT clear on a pid change" (items 10, 11) is a structural guarantee from 81-05 confirmed live, not a novel discovery.

IMPOSSIBLE count: 0. CONDITIONAL rows carry their condition in the table; none requires a surface the shipped build lacks.
