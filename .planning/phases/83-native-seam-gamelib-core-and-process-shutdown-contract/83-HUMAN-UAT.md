---
status: pending
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
source: [83-CONTEXT.md D-08 D-09 D-11 D-13 D-15, 83-RESEARCH.md Live macOS gate]
authored_by: 83-01
run_by: 83-11
started:
updated:
---

This is the live macOS gate contract for FND-04 (no orphaned helper after a quit or a kill) and the live check of the two
native channels for FND-03. It was authored by plan 83-01 before any Phase 83 code exists and is run by plan 83-11,
never by its author (live-gate-contract-authoring standing rule D-E). Nothing in it has been run.

## Launch recipe

1. Run `pnpm build:sidecar`, then confirm `build/main/sidecar.js` has an mtime newer than the last backend commit
   (`tauri dev` does not rebuild the sidecar).
2. Launch only with `pnpm tauri:dev`, never `tauri:dev:run` (it skips the dev-vault flag).
3. Network off only for an action that needs it, never during reporting.

## Known behaviour change (D-15)

In Phase 83 the TS runner's game spawns are unchanged. TS-launched games therefore still die on a graceful quit, as
before, and the `box.quit.bridgeHosting` copy stays correct. On macOS and Linux a SIGKILL of GameLib now also kills
TS-launched games, because the reaper kills the sidecar's process group; before, they survived by accident. Rust-spawned
`SpawnClass::Game` trees and games Steam launched through `steam://` survive. Phase 88 (launch port) and Phases 95-97
(bridge slices) move games onto `SpawnClass::Game`.

Consequence for this contract: every "game survives" step launches the game through `steam://rungameid/<appid>`, so the
game is Steam's child, not GameLib's. A Wine game launched by the TS runner is NOT a valid survival subject and must not
be used; it dies with the sidecar group by design until Phase 88.

## Preflight

Record each result in the session directory notes before the first launch. Record pids, process names, literals and
counts only; never a full `args` line (it can carry a SteamID or a user name in a path).

- P1 sidecar freshness: `pnpm build:sidecar`, then `stat -f %Sm build/main/sidecar.js` against `git log -1 --format=%cd`
  of the last commit under `src/backend`. Record both times; abort if the sidecar is older.
- P2 zero instances: `pgrep -f 'target/debug/gamelib-shell'` and `pgrep -f -- '--gamelib-reaper'` both print nothing.
  Record the two empty results. A leftover process from an earlier session is killed by pid and the run restarts.
- P3 Mac Steam running and signed in, with an installed native macOS game. Record its appId (WazHack 264160 was used in
  80-HUMAN-UAT). This is the "game survives" subject, launched only through `steam://rungameid/<appid>`.
- P4 an owned, not-installed small Steam game for a Steam handoff download (`steam://install/<appid>`), so the steampoll
  download monitor (a `/bin/sh` watchdog with a `nettop` child) runs. Record Steam's "Allow downloads during gameplay"
  value. The item needs the monitor process alive, not the download progressing, so the setting only decides whether the
  download keeps moving while the game runs; record it, it does not gate the item.
- P5 a GameLib-driven (Rust depot) install target for the graceful-quit item: an owned game that is NOT installed (a
  user cancel over an already-installed manifest preserves it and writes no 1026 record, per
  `gamelib-depot/src/acf.rs` `preserve_installed_manifest`). Record its appId, and the Steam library folder it installs
  into (where `appmanifest_<appid>.acf` will appear), and the state of the experimental InstallApp setting.
- P6 the session directory, created once (see Evidence capture). Also, before launch 1: copy any pre-existing
  `~/Library/Logs/GameLib/gamelib.log` and `gamelib.log.old` into the session directory as `preexisting-*`, and record
  `wc -l < ~/Library/Logs/GameLib/gamelib-shell.log` as the shell-log baseline (it is append-only and never rotated).

## Evidence capture

The dual-sink standard, in full.

- One session directory per gate run, created once before the first launch, named with a UTC timestamp:
  `S=/tmp/gamelib-gate-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`. Captures stay under `/tmp` and are never
  committed.
- Every launch is `pnpm tauri:dev 2>&1 | tee -a "$S/terminal.log"`. Never a bare `tee`, never a `>` redirect.
- Before each launch write the delimiter, exactly:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/terminal.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/terminal.log"`).
- After each launch ends and before the next launch starts, archive both app logs while they still exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and
  `cp ~/Library/Logs/GameLib/gamelib-shell.log "$S/gamelib-shell-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old` (`src/backend/logger/log_writer.ts:72-74`), so the copy must come first.
  `gamelib-shell.log` is append-only (`shell_diag` opens it with `append(true)`, `src-tauri/src/main.rs:589-593`) and is
  not rotated, so launch 2's archive also holds launch 1's lines: score a shell-log line only when it starts
  `<epoch> pid=<that launch's shell pid> `, and ignore lines before the baseline from P6.
- Exactly one app instance, asserted. Before each launch P2's two `pgrep` results are empty. After the window appears,
  count shell processes with the reaper excluded (the reaper is the same executable, so a bare `pgrep -f
  'target/debug/gamelib-shell'` also matches it and reads 2):
  `ps -axo pid,ppid,pgid,args | grep 'target/debug/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep`
  must print exactly one line. Write its pid to `"$S/shell-pid-${N}.txt"` and echo it into the transcript with
  `echo "gate shell pid ${N}: <pid>" | tee -a "$S/terminal.log"`. Record it again immediately before the launch ends
  (before the SIGKILL in launch 1, before Cmd+Q in launch 2). If the count is ever not 1 the launch is ABORTED and re-run:
  its evidence is not scorable.
- Every `ps` snapshot: `ps -axo pid,ppid,pgid,stat,comm,args > "$S/ps-<item>-<before|after>.txt"`.
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run, so a
  missing or zero-length capture is visible while the evidence still exists.

## Required literals

Sinks: the terminal transcript is `terminal.log` (stdout and stderr of `pnpm tauri:dev`, so Rust `shell_eprintln!` and
`shell_diag` lines, `[sidecar:err]` lines, and the stderr of any child that inherits the shell's stderr); `gamelib-shell.log`
is written only by `shell_diag` (plain `shell_eprintln!` never reaches it); `gamelib.log` is written only by sidecar
`logInfo` and `logWarning` and never reaches the transcript. Sidecar `console.*` reaches no sink.

Verdict at authoring: no emitter below exists yet, so every row is CONDITIONAL. Plan 83-11 Task 1 re-checks each row
against the then-current source (`grep` for the literal, then confirm the emitting call and its sink) before launch 1.

| Literal | Emitting plan and file | Sink | Verdict at authoring |
|---|---|---|---|
| `reaper started (pid ` | 83-08, `shell_diag` in `src-tauri/src/main.rs` | terminal transcript and `gamelib-shell.log` | CONDITIONAL: emitter does not exist yet; 83-11 Task 1 re-checks |
| `reaper unavailable:` (must be ABSENT) | 83-08, `shell_diag` in `src-tauri/src/main.rs` | terminal transcript and `gamelib-shell.log` | CONDITIONAL: emitter does not exist yet; absence is meaningful only once the emitter exists; 83-11 Task 1 re-checks |
| `[reaper] parent gone: signalled ` | 83-07, `src-tauri/crates/gamelib-proc/src/reaper.rs`, written by the reaper process to its inherited stderr | terminal transcript only (the reaper is not `shell_diag`, so it never reaches `gamelib-shell.log`; it outlives the shell and `tee` keeps reading while the reaper holds the pipe) | CONDITIONAL: emitter does not exist yet; 83-11 Task 1 re-checks |
| `[reaper] disarmed` | 83-07, `src-tauri/crates/gamelib-proc/src/reaper.rs`, reaper stderr | terminal transcript only | CONDITIONAL: emitter does not exist yet; 83-11 Task 1 re-checks |
| `exit finished in ` | 83-09, `shell_diag` in `handle_exit`, `src-tauri/src/main.rs` | terminal transcript and `gamelib-shell.log` | CONDITIONAL: emitter does not exist yet; 83-11 Task 1 re-checks |
| `still running at exit deadline:` (absent unless a drain overran) | 83-09, `shell_diag` in `handle_exit`, `src-tauri/src/main.rs` | terminal transcript and `gamelib-shell.log` | CONDITIONAL: emitter does not exist yet (today's `[shell] depot jobs still running at exit deadline: ` at `main.rs:763` is `shell_eprintln!`, transcript only, and is the wrong literal); 83-11 Task 1 re-checks |
| `[GAMELIB_IPC_INVALID_CHANNEL]` (must be ABSENT in the native-channel item) | 83-03 (Rust verdict, `src-tauri/src/ipc_contract.rs:19` marker) and the sidecar's `validateInbound` | Rust side: terminal transcript; sidecar side: `gamelib.log` | CONDITIONAL: the Rust native path does not exist yet; 83-11 Task 1 re-checks. Absence is scored over all three captures (transcript, shell log, `gamelib.log`) because a mistaken relay to the sidecar would surface there |
| `native send rejected` (must be ABSENT in the native-channel item) | 83-06, Rust, `[shell] native send rejected: <channel>` | terminal transcript (and `gamelib-shell.log` if routed through `shell_diag`) | CONDITIONAL: emitter does not exist yet; 83-11 Task 1 re-checks |

Note: sidecar `logInfo` lines reach `gamelib.log` only and never the transcript, and sidecar `console.*` reaches nothing,
so no required literal in this contract is a sidecar-emitted line demanded of the transcript.

## Current Test

[pending — run by plan 83-11]

## Tests

### 1. Force Quit during a download with a game running leaves no helper and the game survives (D-13, D-08, T-80-16)
expected: With the Steam handoff download running (a `gamelib-watchdog` sh and a nettop visible) and the P3 game launched through `steam://rungameid/<appid>`, record the before snapshot, SIGKILL the shell (`kill -9 <shell pid>` or Cmd-Opt-Esc Force Quit), and within 5 s the after snapshot shows no `node .../sidecar.js`, no process whose pgid is the sidecar's recorded pgid, no nettop, no `gamelib-watchdog` sh, no `--gamelib-reaper` process, no comet/legendary/gogdl/nile, and no `--steam-owned-apps` helper, while the game pid is still alive; the transcript carries `[reaper] parent gone: signalled ` (launch 1).
result: pending

### 2. Reaper runs, in its own process group, and is invisible (D-11, assumption A3)
expected: Right after the window appears in launch 1, before item 1's download starts, exactly one process has `--gamelib-reaper` in its args, its ppid is the shell pid and its pgid differs from the shell's pgid; `reaper started (pid ` appears in the transcript and in `gamelib-shell.log` (lines starting `<epoch> pid=<shell pid> `); `reaper unavailable:` is absent from both; and while it runs there is no second Dock icon, no second Cmd-Tab entry and no extra entry in the Force Quit Applications window (Cmd-Opt-Esc) beyond the one GameLib shell entry (launch 1).
result: pending

### 3. The two native channels behave as before (D-01, D-02)
expected: In launch 1, before item 1: Settings (tier-2 panel) then the About row opens the About dialog, whose `Version:` value equals `node -p "require('./package.json').version"` (and equals the version shown in the nav shell's version link); then Settings, General, Language set to a non-English language (record the original first) shows the machine-translation notice with a report link, and clicking that link opens the default browser on the GameLib GitHub new-issue page; restore the recorded language afterwards; the transcript, `gamelib-shell.log` and `gamelib.log` for this launch hold no `[GAMELIB_IPC_INVALID_CHANNEL]` and no `native send rejected` (launch 1).
result: pending

### 4. Graceful quit during a depot download keeps finalize and leaves nothing behind (D-09, D-12)
expected: In launch 2, with a GameLib-driven Rust depot install of the P5 game in progress (before snapshot and a copy of its `appmanifest_<appid>.acf`, if any, taken first), Cmd+Q and, only if the existing "There are pending operations, are you sure?" confirm appears, answer Yes (its appearance is recorded, not scored, and no other prompt may appear); within the deadline the after snapshot shows no sidecar group member, no `--gamelib-reaper` process and no Rust helper that the before snapshot showed; the transcript has `[reaper] disarmed`; `gamelib-shell.log` has `exit finished in `; and a copy of the ACF taken immediately after exit shows StateFlags 1026 written before exit (launch 2).
result: pending

### 5. One exit deadline (D-12, D-16)
expected: Read from item 4's evidence in launch 2: the value in `exit finished in <ms> ms` is at most 5000, with the confirm-dialog time not counted because the Rust deadline starts at `handle_exit`, after the TS confirm; `still running at exit deadline:` is absent, or if present names registrants only, with counts and no job detail (launch 2).
result: pending

## Structural Reachability Review

Applied before publishing, per `live-gate-contract-authoring.md` Section 2. Verdicts: REACHABLE, IMPOSSIBLE, CONDITIONAL.
Rows cover items 1-5, preflight lines P1-P6, and the evidence-capture instruction, across Tests 1-4, 6 and 7. Test 5 is
the pairing pass after the table.

Structural impossibilities found at authoring and removed from the contract before it was published: 2 (both under item 3,
Test 7, see the rows marked IMPOSSIBLE). Unresolved requirement interactions after the pairing pass: 0.

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|
| Item 1, Test 1 (origin and scheme) | `steam://install/<appid>`, `steam://rungameid/<appid>` | URL schemes handed to Mac Steam | REACHABLE: no https-only gate sits on these; Steam handles the scheme itself and 80-HUMAN-UAT item 4a launched WazHack the same way | `80-HUMAN-UAT.md` items 1 and 4a |
| Item 1, Test 2 (concurrency) | a running download, a running game and a SIGKILL from a terminal | three things at once | REACHABLE: no modal blocks it; the SIGKILL is from a terminal or the Force Quit window, outside GameLib's own window | `kill -9` is a terminal command; Cmd-Opt-Esc is the OS window |
| Item 1, Test 3 (emitter and SINK) for `[reaper] parent gone: signalled ` | reaper stderr | a transcript line | CONDITIONAL: the emitter is planned (83-07) and not written; the SINK is the transcript only, because the reaper inherits the shell's stderr and is not `shell_diag`, so it never reaches `gamelib-shell.log`; the contract therefore reads `terminal.log` for it and never the shell log | `src-tauri/src/main.rs:577-598` (`shell_diag` writes stderr and the shell log; the reaper is a separate process); 83-07 PLAN truth |
| Item 1, Test 4 (absence) for the nettop and watchdog sub-checks | nettop and `gamelib-watchdog` sh | absence within 5 s | REACHABLE but WEAK: the watchdog loop exits by itself within about one second once its parent pid is gone (`while kill -0 "$p"`, `monitor.rs:49`), so this absence is a pre-existing guarantee, not a reaper discovery; recorded so it is never misread as one | `src-tauri/crates/gamelib-steampoll/src/monitor.rs:35-57` |
| Item 1, Test 4 (absence) for the sidecar and group-member sub-checks | `node .../sidecar.js` and its pgid | no member of the recorded pgid | CONDITIONAL: a presence case is observable only if the before snapshot lists the sidecar and at least one other group member; the sidecar alone also exits by itself on stdin EOF; the discriminating signal is the transcript literal plus any group member that outlives the sidecar. Rule: a helper absent from the before snapshot is recorded "not exercised", never "passed" | `src-tauri/src/sidecar.rs:201-228`, exit contract in CLAUDE.md |
| Item 1, Test 4 (absence) for comet, legendary, gogdl, nile and `--steam-owned-apps` | helpers that exist only when an Epic or GOG action or a Mac owned-apps refresh is running | absence | CONDITIONAL: each is checked only when the before snapshot shows it running; otherwise recorded "not exercised" | `src-tauri/crates/gamelib-steamcm/src/macowned.rs:163` |
| Item 1, Test 6 (external state) | Steam's "Allow downloads during gameplay" setting, a signed-in Mac Steam | the monitor process alive while the game runs | CONDITIONAL: with the setting off, Steam pauses the download while the game runs; the item needs the monitor (watchdog sh and nettop) alive, which does not depend on progress; P4 records the value | preflight P3, P4 |
| Item 1, Test 6 (external state) for a pre-existing process | a leftover GameLib, reaper or sidecar from an earlier session | zero instances | REACHABLE: P2 and the per-launch single-instance assertion check it positively | `pgrep` commands in P2 and Evidence capture |
| Item 1, Test 7 (UI gesture) | Force Quit | a human action on the OS | REACHABLE: `kill -9 <shell pid>` needs no GameLib UI at all, and Cmd-Opt-Esc is the macOS Force Quit window; neither goes through the frontend | no frontend control involved |
| P1 sidecar freshness | `build/main/sidecar.js` | an mtime comparison | REACHABLE | `src-tauri/src/sidecar.rs:10-18` (the dev sidecar path is `../build/main/sidecar.js`; `tauri dev` does not rebuild it) |
| P2 zero instances | `pgrep` over the shell and reaper | two empty results | REACHABLE; Test 6: this is the positive check that closes the pre-existing-instance gap | `ps` and `pgrep` are read-only |
| P3 Mac Steam signed in and a game installed | Mac Steam | external state | CONDITIONAL: only the operator can establish it; Test 6 external state, recorded as a fact, not assumed | `80-HUMAN-UAT.md` used WazHack 264160 the same way |
| P4 an owned, not-installed game for a handoff | Mac Steam | external state | CONDITIONAL: depends on the account owning an uninstalled small game; recorded with the gameplay-download setting | `80-HUMAN-UAT.md` item 1 |
| P5 a not-installed Rust depot install target | the depot pipeline | a fresh install | REACHABLE only for an uninstalled game: a cancel over an installed manifest writes no 1026 record, which would make the graceful item's premise false | `src-tauri/crates/gamelib-depot/src/acf.rs:5-9` |
| P6 session directory and pre-existing logs | `/tmp` and `~/Library/Logs/GameLib` | one directory, copies, a baseline | REACHABLE | `src/backend/logger/log_writer.ts:72-74` (rotation); `main.rs:589-593` (append-only shell log) |
| Evidence capture, Test 1 | none | none | REACHABLE: no URL involved | n/a |
| Evidence capture, Test 2 | a terminal | `tee`, `cp`, `ps` | REACHABLE: all run from a shell, none is modal | n/a |
| Evidence capture, Test 3 | `terminal.log`, `gamelib-shell.log`, `gamelib.log` | each literal read from its own sink | REACHABLE for the sink assignment in "Required literals"; the emitters are CONDITIONAL until 83-11 Task 1 | `main.rs:577-598`; `src/backend/logger/index.ts` |
| Evidence capture, Test 4 | the single-instance count | a count of one that would show two | REACHABLE: a second instance would print a second `ps` line, and the reaper is excluded by `grep -v -- '--gamelib-reaper'` so the count of one is meaningful | the reaper shares the shell's executable path |
| Evidence capture, Test 6 | an already-running instance | positive zero-instance checks | REACHABLE | P2 |
| Evidence capture, Test 7 | none (terminal only) | no GameLib gesture | REACHABLE | n/a |
| Item 2, Test 1 (origin and scheme) | the reaper process | none | REACHABLE: no URL involved | n/a |
| Item 2, Test 2 (concurrency) | `ps`, Dock, Cmd-Tab, Force Quit window | read-only observations while the app idles | REACHABLE: nothing modal is open at that point | n/a |
| Item 2, Test 3 (emitter and SINK) for `reaper started (pid ` and the absent `reaper unavailable:` | `shell_diag` | transcript and `gamelib-shell.log` | CONDITIONAL: emitters planned in 83-08 (`main.rs`, `shell_diag`), not written; both sinks are real (`main.rs:577-598`); 83-11 Task 1 re-checks | "Required literals" |
| Item 2, Test 4 (absence) for `reaper unavailable:` | `shell_diag` failure branch | absence | REACHABLE once the emitter exists: a start failure would write the line to both sinks, and the positive `reaper started (pid ` line plus the `ps` process make the absence non-vacuous | 83-08 PLAN truth |
| Item 2, Test 4 (absence) for "no second Dock icon, Cmd-Tab entry or Force Quit entry" | LaunchServices registration | absence of UI entries | CONDITIONAL: confirmation of an assumption (A3), not a structural guarantee; a regression that registered the reaper would visibly add an entry, so the presence case is observable; this is the one row where a live discovery is possible | `83-RESEARCH.md` Pattern 5, assumption A3 |
| Item 2, Test 6 (external state) | a leftover reaper, a second Dock icon already present from another GameLib instance | exactly one of each | REACHABLE: P2 and the single-instance assertion establish a clean start before the observation | Evidence capture |
| Item 2, Test 7 (UI gesture) | Dock, Cmd-Tab, Cmd-Opt-Esc | OS-level views, no GameLib control | REACHABLE: all three are OS surfaces, independent of the frontend | n/a |
| Item 3, Test 1 (origin and scheme) for the report link | `buildTranslationIssueUrl` | an `https` GitHub URL | REACHABLE: the URL is built from `GAMELIB_ISSUES_NEW_URL` with query parameters and `openExternalUrl` accepts `https` | `src/frontend/components/UI/LanguageSelector/translationIssue.ts:47-53`; `externalLinkClicks.ts:13` lists the routed schemes |
| Item 3, Test 2 (concurrency) | the About dialog and the Settings General page | sequential gestures | REACHABLE: the About dialog is closed (its close button) before navigating to Settings, General; nothing is driven while a modal is up | `AboutDialog/index.tsx:63` (`showCloseButton`) |
| Item 3, Test 3 (emitter and SINK) for `[GAMELIB_IPC_INVALID_CHANNEL]` and `native send rejected` | Rust native handlers (83-03, 83-06) and the sidecar `validateInbound` | absence in three captures | CONDITIONAL: the Rust emitters do not exist yet; the marker constant exists (`ipc_contract.rs:19`); sinks assigned in "Required literals"; 83-11 Task 1 re-checks | `src-tauri/src/ipc_contract.rs:19`; `83-06-PLAN.md` truth |
| Item 3, Test 4 (absence) for both markers | the native channels | absence | REACHABLE: the presence case is observable (a mistaken relay yields `no_schema` and the INVALID_CHANNEL marker in `gamelib.log`; a rejected send logs `native send rejected`), and the positive observables (version string equals `package.json`, browser opens) mean absence is never the only signal | `83-RESEARCH.md` Anti-Patterns (`validateInbound` fails closed) |
| Item 3, Test 6 (external state) | the default browser, the stored UI language, the package.json version | a new browser tab; a restorable language; a known version | CONDITIONAL: the operator records the original language before changing it and the exact package.json version; a browser that is already open does not change the evidence because the check is a new tab on the new-issue URL; GitHub reachability is not required | `LanguageSelector/index.tsx:131-142` (a change persists to config, so it must be restored) |
| Item 3, Test 7 (UI gesture): About dialog and version | Settings tier-2 About row, `AboutDialogHost`, `AboutDialog`; nav shell `HeroicVersion` | open About, read `Version:`; read the nav shell version | REACHABLE: the About row is an unconditional `NavItem` that calls `showAboutWindow`, which raises the event `AboutDialogHost` answers; `getHeroicVersion` is called at `AboutDialog/index.tsx:48-51`, rendered at `:69-73`; the nav shell version is always mounted (`NavShell/index.tsx:120`), called at `HeroicVersion/index.tsx:69`, rendered at `:138` | `SettingsPanel/index.tsx:208-213`; `AboutDialogHost.tsx:25-32` |
| Item 3, Test 7 (UI gesture): clicking a link in the About dialog | `AboutDialog` | click the project URL | IMPOSSIBLE: the project URL is a plain `<p>` with no anchor and no handler, so there is nothing to click; replaced by the Settings, General, Language report link | `AboutDialog/index.tsx:77` |
| Item 3, Test 7 (UI gesture): the Donate row as the `openExternalUrl` subject | `SettingsPanel` Donate row | click Donate | IMPOSSIBLE as a subject for this channel: it calls `window.api.openKofiPage` (a different channel), behind a stored external-link confirm; it would pass without touching `openExternalUrl`; replaced | `SettingsPanel/index.tsx:123-139` |
| Item 3, Test 7 (UI gesture): the nav shell "Update Available!" links | `HeroicVersion` | click a release link | CONDITIONAL: rendered only when `getLatestReleases` returns a newer release (network and release state outside the contract); not used as the gesture | `HeroicVersion/index.tsx:141-160` |
| Item 3, Test 7 (UI gesture): Settings, General, Language, then the report link | `GeneralSettings`, `LanguageSelector` | pick a non-English language, click the notice link | REACHABLE: `LanguageSelector` is rendered unconditionally on General; the notice and link render for any non-English language (`shouldShowMtNotice`); the link is an `<a role="button">` with an `onClick` that calls `openExternalUrl` directly, so it does not depend on the `externalLinkClicks` anchor handler and no external-link confirm intervenes | `GeneralSettings/index.tsx:28`; `LanguageSelector/index.tsx:147-149, 183-199`; `translationIssue.ts:31-39` |
| Item 4, Test 1 (origin and scheme) | none | none | REACHABLE: no URL involved | n/a |
| Item 4, Test 2 (concurrency) | the native quit confirm | one modal, answered, no other gesture driven meanwhile | REACHABLE: the confirm is a modal message box; the contract drives nothing while it is up | `quitHandler.ts:41-70` |
| Item 4, Test 3 (emitter and SINK) for `[reaper] disarmed` | reaper stderr | transcript line | CONDITIONAL: emitter planned (83-07); sink is the transcript only, because the reaper is not `shell_diag`; the contract reads `terminal.log` for it | `83-07-PLAN.md` truth |
| Item 4, Test 3 (emitter and SINK) for `exit finished in ` | `shell_diag` in `handle_exit` | shell log line | CONDITIONAL: emitter planned (83-09); both sinks real (`main.rs:577-598`) | `main.rs:755` (`handle_exit`), 83-09 PLAN truth |
| Item 4, Test 4 (absence) for "no sidecar group member, reaper or Rust helper" | helpers present before the quit | absence | CONDITIONAL: a helper absent from the before snapshot is recorded "not exercised", never "passed"; `[reaper] disarmed` is the positive signal that the graceful path ran | rule in item 1 row |
| Item 4, Test 4 for the 1026 record | `appmanifest_<appid>.acf` | StateFlags 1026 after, something else before | CONDITIONAL: the check discriminates only if the before copy is not already 1026; if it is, the item is recorded INCONCLUSIVE, not passed | `gamelib-depot/src/acf.rs:5-9` |
| Item 4, Test 6 (external state) | a running Mac Steam, a not-installed target | Steam may react to the ACF; the target must be fresh | CONDITIONAL: Steam can rewrite a 1026 ACF it sees; the after copy is taken immediately after exit and before relaunch; a target that is already installed writes no 1026 and falsifies the premise, so P5 requires an uninstalled game | `acf.rs:5-9`; P5 |
| Item 4, Test 7 (UI gesture) | Cmd+Q, the existing confirm | quit, answer Yes if shown | REACHABLE: Cmd+Q routes to `quit_via_sidecar` (`terminate_veto.rs:193`) then `handleExit` (`quitHandler.ts:35`); the confirm appears only if `isLocked`, `isRunning` or `isBridgeHosting` is true (`quitHandler.ts:40`), which a Rust depot install may not set, so its appearance is recorded and not required; the nav shell Quit button (`QuitButton/index.tsx:38`) is an equivalent gesture not used | `terminate_veto.rs:193`; `quitHandler.ts:35-70` |
| Item 5, Test 1 and Test 2 | none | a reading of item 4's evidence | REACHABLE: no gesture of its own | n/a |
| Item 5, Test 3 (emitter and SINK) for `exit finished in ` and `still running at exit deadline:` | `shell_diag` | both sinks | CONDITIONAL: emitters planned (83-09); today's `main.rs:763` line is `shell_eprintln!` with different wording, so it is not a substitute | `main.rs:763`; 83-09 PLAN truth |
| Item 5, Test 4 (absence) for `still running at exit deadline:` | `handle_exit` overrun branch | absence | REACHABLE once the emitter exists: an overrun writes the line to both sinks, and `exit finished in ` in the same section proves `handle_exit` ran to its end | 83-09 PLAN truth |
| Item 5, Test 6 (external state) | none beyond item 4's | none | REACHABLE: inherits item 4's rows | n/a |
| Item 5, Test 7 (UI gesture) | none | none | REACHABLE: no gesture | n/a |

**Test 5: the pairing pass.** Reduction applied: every state-mutating requirement (M1-M8 below) against every
evidence-bearing requirement (E1-E17 below). The number of pairs considered is 136 (8 x 17), and the number of pairs flagged is 14. The other 122 pairs
were considered and left alone because the mutation neither restarts, truncates, clears, overwrites nor consumes that
evidence's source.

State-mutating requirements: M1 launch 1 starts (also starts the reaper); M2 the Steam handoff download starts; M3 the P3
game is launched through `steam://rungameid`; M4 item 3 changes the UI language (persisted to config); M5 item 1 SIGKILLs
the shell and ends launch 1; M6 launch 2 starts (renames `gamelib.log`, appends to `gamelib-shell.log`, new shell and
reaper pids); M7 item 4 starts the P5 depot install; M8 item 4 quits with Cmd+Q and ends launch 2.

Evidence-bearing requirements: E1 `reaper started (pid `; E2 absent `reaper unavailable:`; E3 `[reaper] parent gone:
signalled `; E4 `[reaper] disarmed`; E5 `exit finished in `; E6 `still running at exit deadline:`; E7 absent
`[GAMELIB_IPC_INVALID_CHANNEL]`; E8 absent `native send rejected`; E9 item 1 ps snapshots; E10 item 2 ps snapshot; E11
item 4 ps snapshots; E12 item 4 ACF copies; E13 `terminal.log`; E14 archived `gamelib-launch-${N}.log`; E15 archived
`gamelib-shell-launch-${N}.log`; E16 the single shell pid records; E17 operator-observed UI evidence (About version,
browser tab, Dock, Cmd-Tab, Force Quit window, confirm dialog).

| Flag | Pair | Interaction | Resolution |
|---|---|---|---|
| PF1 | M5 x E10 | the SIGKILL ends launch 1, so the item 2 snapshot cannot be taken after it | item 2 is scored before item 1 |
| PF2 | M5 x E17 | the same end of launch 1 removes the window the About, browser and Dock observations need | items 2 and 3 are scored before item 1 |
| PF3 | M5 x E16 | the teardown pid record cannot be made once the shell is dead | the second pid record is made immediately before the `kill -9` |
| PF4 | M5 x E4 | `[reaper] disarmed` can never appear in launch 1 (no graceful quit) | E4 is scored only in launch 2 |
| PF5 | M5 x E5 | `exit finished in ` can never appear in launch 1 (`handle_exit` does not run on SIGKILL) | E5 and E6 are scored only in launch 2; their absence in launch 1 is expected, not a finding |
| PF6 | M6 x E3 | starting launch 2 before the reaper's line lands would put the line in launch 2's section or lose it | launch 2 starts only after the transcript shows `[reaper] parent gone: signalled ` (or the after snapshot shows the reaper gone) and launch 1's `tee` has exited |
| PF7 | M6 x E14 | launch 2's first write renames `gamelib.log` to `.old` | launch 1's `gamelib.log` is copied before launch 2 starts |
| PF8 | M6 x E15 | `gamelib-shell.log` is append-only, so launch 2's archive mixes in launch 1's lines | shell-log lines are scored by `pid=<that launch's shell pid>`; launch 1's copy is also kept |
| PF9 | M1 x E14 | pre-existing `gamelib.log` and `.old` from an earlier session sit where launch 1's archive reads | P6 copies them to `preexisting-*` before launch 1 |
| PF10 | M1 x E15 | pre-existing shell-log lines precede launch 1 | P6 records the line-count baseline; lines are scored by pid |
| PF11 | M1 x E16 | the reaper started by launch 1 is the same executable, so a bare `pgrep` count reads 2 | the instance count excludes `--gamelib-reaper` lines |
| PF12 | M8 x E12 | a running Mac Steam may rewrite the 1026 ACF after the quit | the ACF is copied immediately after exit, before relaunch, and the before copy is the discriminator |
| PF13 | M4 x E17 | the persisted language change would put the item 4 confirm in another language | item 3 restores the recorded language before item 1 |
| PF14 | M3 x E11 | the game that survives item 1 is still running at launch 2 and would show as a survivor in item 4's after snapshot | after item 1, the game is quit through Steam and the handoff download is cancelled in Steam before launch 2 |

All 14 flagged pairs are resolved in the contract text above or in the run order below. None remains open.

**Run order.** P1-P6, then launch 1 (N=1): item 2, item 3 (restore the language), then start the P4 handoff download and
launch the P3 game via `steam://rungameid/<appid>`, then item 1 (SIGKILL); wait for the reaper line and the after snapshot;
quit the game and cancel the download in Steam; archive `gamelib.log` and `gamelib-shell.log` as launch 1; then launch 2
(N=2): item 4 (start the P5 install, take the before snapshot and ACF copy, Cmd+Q), item 5 (read from item 4's evidence);
archive launch 2's logs; closing inventory. Items 2 and 3 run before item 1's SIGKILL; item 5 runs after item 4.

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
