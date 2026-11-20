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

## Structural Reachability Review

Applied before publishing, per `live-gate-contract-authoring.md` Section 2. Verdicts: REACHABLE, IMPOSSIBLE, CONDITIONAL.
Test 5 (the pairing pass) is completed in plan 83-01 Task 2 after every item exists. Rows below are for item 1, preflight
lines P1-P6, and the evidence-capture instruction, across Tests 1-4, 6 and 7.

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
| Defect class summary at authoring | n/a | n/a | Test 5 completes in Task 2; Test 7 completes in Task 2 for the About and external-link gestures | n/a |

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
