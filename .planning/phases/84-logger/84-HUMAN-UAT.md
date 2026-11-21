---
status: partial
phase: 84-logger
source: [84-CONTEXT.md D-01 D-05 D-07 D-08 D-13 D-14 D-16 D-18 D-19, 84-RESEARCH.md Gates and docs that grep log text verbatim, 84-RESEARCH.md Behaviour changes that are deliberate]
authored_by: 84-01
run_by: 84-11
started: 2026-11-21
updated: 2026-11-21
---

This is the live macOS gate contract for FND-05 (logs keep their format, location, rotation and redaction; log upload and
"show in folder" still work; crate diagnostics reach the log; shell lines live in `gamelib.log`). It was authored by plan
84-01 before any Phase 84 logger code exists and is run by plan 84-11, never by its author (live-gate-contract-authoring
standing rule D-E). It was run on 2026-11-21 by 84-11 (Task 1 pre-run re-check, Task 2 operator launches, Task 3 scoring);
the eight results are under Tests. The Structural Reachability Review below keeps its authoring-time verdicts.

From Phase 84 on, shell lines are scored in `gamelib.log` as `[Shell]` lines and in the terminal transcript as `[shell] `
lines, and `gamelib-shell.log` is no longer written (84-CONTEXT D-01). The 83 gate scored `gamelib-shell.log` by pid; that
file is not read by this contract except to prove it is no longer written (item 1).

## Launch recipe

1. Run `pnpm build:sidecar`, then confirm `build/main/sidecar.js` has an mtime newer than the last backend commit
   (`tauri dev` does not rebuild the sidecar, so a stale sidecar would still use the TS writer).
2. Launch only with `pnpm tauri:dev`, never `tauri:dev:run` (it skips the dev-vault flag, so Keychain prompts every launch).
3. The crate-diagnostics launch (launch 3) is `GAMELIB_LOG_LEVEL=debug pnpm tauri:dev`, with the variable as a prefix on
   that one command so it never persists in the shell (84-CONTEXT D-19). It is its own launch ordinal, so the variable never
   reaches launches 1, 2 or 4.
4. Four launches, in this order: launch 1 (items 1, 2), launch 2 (items 3, 5, 6, 4), launch 3 (item 7, debug), launch 4
   (item 7, default level). Item 8 is read from all four. Every launch ends with a graceful Cmd+Q (a Force Quit writes no
   exit line, so it cannot be scored by item 8). Network off only for an action that needs it, never during reporting.

## Sink partition after Phase 84

This is the authority for the contract. It restates, for the post-84 world, the partition that
`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2 Test 3 describes for the
pre-84 world. Each row names the plan that makes it true; none is true yet at authoring.

| Source | Reaches `gamelib.log` | Reaches the terminal transcript | Made true by |
|---|---|---|---|
| Rust shell lines (`shell_log`) | yes, as `(HH:MM:SS) [LEVEL]:   [Shell]:           <msg>` | yes, as `[shell] <msg>` (the stderr echo) | 84-08 |
| Crate diagnostics (tracing and `log` bridges) | yes, with `[Steam]` or `[Backend]` prefixes | no | 84-08 |
| Sidecar `logInfo`, `logWarning`, `logError`, `logDebug` | yes (forwarder frames ride stdout, the RPC pipe) | no | 84-03, 84-04 |
| Sidecar `console.*` | no | no | unchanged |
| Sidecar stderr | no | yes, as `[sidecar:err]` | unchanged |
| The reaper's own `[reaper] ` stderr lines | no | yes (transcript only) | unchanged (83-07) |
| `gamelib-shell.log` | not written any more (a stale copy from older releases may exist and is left alone) | not applicable | 84-08 |

The consequence for scoring: a `[Shell]` line is demanded of `gamelib.log` and, as `[shell] <msg>`, of the transcript (two
different sinks for one call); a sidecar line is demanded of `gamelib.log` only; a crate line is demanded of `gamelib.log`
only; the transcript is never asked for a sidecar-emitted line.

## Deliberate behaviour changes

Each is one line, with the decision that makes it deliberate. None is a regression when observed.

- New log files are mode 0600 (D-18); today's TS writer never set a mode (files were `0o666 & ~umask`).
- `gamelib.log` rotates once per app launch, not once per sidecar process (84-RESEARCH change 1).
- A second GameLib launch never rotates (84-RESEARCH change 2); this contract never starts a second instance.
- Shell lines are persisted on Windows for the first time (84-RESEARCH Pitfall 6); not scored here (no Windows gate).
- A single log message over the per-entry cap is truncated with a marker (84-03); not scored live (no live trigger).

## Preflight

Record each result in `"$S/notes.txt"` before the first launch. Record pids, process names, literals and counts only; never a
full `args` line (it can carry a user name in a path).

- P1 sidecar freshness: `pnpm build:sidecar`, then `stat -f %Sm build/main/sidecar.js` against
  `git log -1 --format=%cd -- src/backend`. Record both times; abort if the sidecar is older.
- P2 zero instances and a clean environment, before EVERY launch: `pgrep -f 'target/debug/gamelib-shell'` and
  `pgrep -f -- '--gamelib-reaper'` both print nothing, and `env | grep -c '^GAMELIB_LOG_LEVEL='` prints 0. Record the three
  results. A leftover process from an earlier session is killed by pid and the check is re-run.
- P3 baseline of the log directory, taken once before launch 1: `ls -la ~/Library/Logs/GameLib/`; copy any existing
  `gamelib.log` and `gamelib.log.old` into the session directory as `preexisting-gamelib.log` and
  `preexisting-gamelib.log.old`; if `~/Library/Logs/GameLib/gamelib-shell.log` exists, record
  `stat -f '%m %z' ~/Library/Logs/GameLib/gamelib-shell.log` (item 1 checks it does not change). Also record
  `stat -f '%m %z' ~/Library/Application\ Support/GameLib/store/uploadedLogs.json` if the file exists, and its entry count
  with `node -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))).length)' <that file>`
  (item 6 checks one entry is added; print the count only, never the URLs or tokens).
- P4 a game GameLib launches through the TS runner and that writes a GameLib launch log: a GOG, Epic, Amazon or sideloaded
  game, installed, ideally a Wine launch on this Mac (the `Wine Command:` header is written only by the Wine runner,
  `src/backend/commandRunner.ts:342`). Record its runner and appName. NOT a Steam game: a Steam handoff writes no GameLib
  launch log, and the Settings log picker lists only epic, gog, amazon and sideloaded games
  (`src/frontend/screens/Settings/sections/LogSettings/index.tsx:80-100`, `:170-185`). Its per-game "Verbose logs" setting
  (Game settings, Advanced) must be ON, or the launch log holds only the two forced `IMPORTANT: Logs are disabled` warnings
  (`src/backend/launcher.ts:283-296`, `src/backend/logger/index.ts` `createGameLogWriter`); record the setting.
- P5 a Steam account signed in inside GameLib, for item 7 (Test 6 external state). The positive observable is that the Steam
  library lists at least one owned game that is not installed; record the count only. The Steam tile deliberately hides the
  account name, so it is not evidence either way, and the account name is never recorded.
- P6 a benign log the operator is willing to post publicly for 2 days, chosen for item 6. The Settings Log box shows the
  selected log's content, so the operator reads it before confirming. Not the GameLib log (it holds paths and session
  lines). Record only which picker entry was chosen, never any content.
- P7 the session directory, created once (see Evidence capture), with `notes.txt` in it.

## Evidence capture

The dual-sink standard, in full.

- One session directory per gate run, created once before the first launch, named with a UTC timestamp:
  `S=/tmp/gamelib-gate-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`. Captures stay under `/tmp` and are never committed.
- Every launch is `pnpm tauri:dev 2>&1 | tee -a "$S/terminal.log"` (launch 3:
  `GAMELIB_LOG_LEVEL=debug pnpm tauri:dev 2>&1 | tee -a "$S/terminal.log"`). Never a bare `tee`, never a `>` redirect, and the
  file is named exactly `terminal.log` (83's run lost launch 2 to a misnamed `terminal.log.`).
- Before each launch write the delimiter, exactly, as its own command BEFORE the launch command:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/terminal.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/terminal.log"`).
- After each launch exits and BEFORE the next launch starts, archive both files while they still exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"` (skip the second copy only if
  `gamelib.log.old` does not exist, and record that). The next launch's first write renames `gamelib.log` to
  `gamelib.log.old`, replacing whatever `.old` held, so the copies must come first. After launch 1 the `.old` is the
  pre-session log from an older release (also in `preexisting-gamelib.log`).
- Exactly one app instance, asserted. Before each launch P2's results are empty/zero. After the window appears, count shell
  processes with the reaper excluded (the reaper is the same executable, so a bare `pgrep -f 'target/debug/gamelib-shell'`
  also matches it and reads 2):
  `ps -axo pid,ppid,pgid,args | grep 'target/debug/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep` must print
  exactly one line. Write its pid to `"$S/shell-pid-${N}.txt"`, write the reaper pid
  (`pgrep -f -- '--gamelib-reaper'`) to `"$S/reaper-pid-${N}.txt"`, and echo the shell pid into the transcript with
  `echo "gate shell pid ${N}: <pid>" | tee -a "$S/terminal.log"`. Record the shell pid again immediately before Cmd+Q. If the
  count is ever not 1 the launch is ABORTED and re-run: its evidence is not scorable.
- Game files (item 4): after the first game launch exits, `cp` the game's `launch.log` to `"$S/game-launch-1.log"` before the
  second game launch (the second launch rotates it).
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run, so a
  missing or zero-length capture is visible while the evidence still exists.

## Required literals

Sinks are the post-84 partition above. At authoring every row whose emitter did not exist yet, or whose sink changed in
Phase 84, was conditional on code not yet written. Plan 84-11 Task 1 re-grepped each such row against the then-current
source (2026-11-21, HEAD b3e8857fc) and recorded the emitter file:line and sink below; a row that cannot be emitted is
IMPOSSIBLE, stops the run, and is amended, never scored. No row is IMPOSSIBLE.

| Literal | Emitting plan and file | Sink | Verdict at authoring |
|---|---|---|---|
| `[Shell]:` prefix chunk | 84-02 `gamelib-log` line format, 84-08 `shell_log` | `gamelib.log` | REACHABLE: `shell_log` at `src-tauri/src/main.rs:545` calls `shell_log_to` (`:551`), which logs `gamelib_log::Prefix::Shell` through the native writer; `Prefix::Shell` line format pinned by `src-tauri/crates/gamelib-log/src/format.rs:126` |
| `reaper started (pid ` | 83-08 `shell_diag` at `src-tauri/src/main.rs:1867` today, routed to `shell_log` by 84-08 | transcript (`[shell] `) and `gamelib.log` | REACHABLE: emitter `src-tauri/src/main.rs:1944` (`shell_log`); `init_native_logger()` (`:1936`) runs before `gamelib_proc::reaper::start()` (`:1943`), so the writer is live when the line is logged; sinks stderr `[shell] ` echo (`:546`) and `gamelib.log` `[Shell]` |
| `System facts:` | `logBootFacts` at `src/backend/logger/index.ts:139`, called at `src/backend/sidecar/bootstrap.ts:2510`, sent through the 84-03 forwarder | `gamelib.log` | REACHABLE: emitter `src/backend/logger/index.ts:178-190` (`logBootFacts`, `logInfo` with `LogPrefix.Backend`), called at `src/backend/sidecar/bootstrap.ts:2515`; `logInfo` goes through the `LogForwarder` (`index.ts:22`, `:33`), frames to the shell writer; `gamelib.log` only |
| `Logging to file(s) ` | 84-02 writer on a rotate of a runner or game target, driven by the 84-04 facade (today `src/backend/logger/log_writer.ts`, DEBUG `[Backend]`) | `gamelib.log` | REACHABLE: emitter `src-tauri/crates/gamelib-log/src/writer.rs:353` (`self.general(Level::Debug, ...)` on a typed target with `batch.rotate`, written to `gamelib.log`); the facade `src/backend/logger/targetWriter.ts` enqueues the rotate flag |
| `============= End of log =============` | 84-04 facade `LogWriter.close` (today `log_writer.ts` `close`, called at `src/backend/launcher.ts:317`, `:357`, `:419`) | the game's `launch.log` | REACHABLE: emitter `src/backend/logger/targetWriter.ts:59` (`END_OF_LOG`), written by `close()` at `:189`; sink the game's `launch.log` through the forwarder and native writer |
| `Uploaded log file ` | 84-05 (today `src/backend/logger/uploader.ts:109`, `logInfo` with `[LogUploader]`) | `gamelib.log` | REACHABLE: emitter `src-tauri/src/log_upload.rs:296` (`Uploaded log file {name} to {url}`), logged to `gamelib.log` by the native uploader |
| `exit finished in ` | 83-09 `shell_diag` in `handle_exit` at `src-tauri/src/main.rs:841`, moved into `finish` by 84-09 | transcript (`[shell] `) and `gamelib.log` | REACHABLE: emitter `src-tauri/src/main.rs:892` (`shell_log`, inside the `finish` closure of `handle_exit`), followed by `gamelib_log::flush(ctx.remaining)` (`:899`); sinks transcript `[shell] ` and `gamelib.log` `[Shell]` |
| `still running at exit deadline:` | 83-09 at `src-tauri/src/main.rs:846`, moved by 84-09; absent unless a drain overran | transcript and `gamelib.log` | REACHABLE: emitter `src-tauri/src/main.rs:895` (`shell_log`, inside `finish`, only when `ctx.still_running` is non-empty); absence is non-vacuous only because `exit finished in ` (`:892`) is the positive line on the same path. ORDER NOTE: the code logs `exit finished in ` first and this line second, the reverse of item 8's expectation; see the Pre-run re-check |
| `lines dropped` (must be ABSENT) | 84-03 forwarder and 84-02 writer | `gamelib.log` | REACHABLE: emitters `src/backend/logger/forwarder.ts:441` (`lines dropped (queue full)`) and `src-tauri/crates/gamelib-log/src/writer.rs:305` (`lines dropped (ingest full)`, `general(Level::Warning, ...)` into `gamelib.log`); absence is therefore observable |
| `log frame rejected` (must be ABSENT) | 84-03 reader arm in the shell | `gamelib.log` and transcript | REACHABLE: emitter `src-tauri/src/sidecar.rs:372` (`[shell] log frame rejected:` stderr) and `:374-376` (`gamelib_log::log` with `Prefix::Shell`, into `gamelib.log`); absence is therefore observable |

## Pre-run re-check

Run by 84-11 Task 1 on 2026-11-21 at HEAD `b3e8857fc23e5ab57608c7d690dc52cbf853184f`, before any launch.

### Required literals re-grepped (`grep -rnF` over `src-tauri/src`, `src-tauri/crates`, `src/backend`)

| Literal | Emitter file:line | Sink actually reached | Verdict |
|---|---|---|---|
| `[Shell]:` prefix chunk | `src-tauri/src/main.rs:545` `shell_log` -> `:551` `shell_log_to` (`Prefix::Shell`); format `src-tauri/crates/gamelib-log/src/format.rs:126` | `gamelib.log`; stderr echo `[shell] ` at `:546` | REACHABLE |
| `reaper started (pid ` | `src-tauri/src/main.rs:1944`; `init_native_logger()` at `:1936` precedes `reaper::start()` at `:1943` | `gamelib.log` as `[Shell]`, and transcript `[shell] ` | REACHABLE |
| `System facts:` | `src/backend/logger/index.ts:182` (`logBootFacts`, `:178`), called at `src/backend/sidecar/bootstrap.ts:2515`, through `LogForwarder` (`index.ts:22`) | `gamelib.log` only | REACHABLE |
| `Logging to file(s) ` | `src-tauri/crates/gamelib-log/src/writer.rs:353` (rotate of a typed target) | `gamelib.log` (general log), not the game's `launch.log` | REACHABLE |
| `============= End of log =============` | `src/backend/logger/targetWriter.ts:59` (`END_OF_LOG`), written by `close()` at `:189` | the game's `launch.log` | REACHABLE |
| `Uploaded log file ` | `src-tauri/src/log_upload.rs:296` | `gamelib.log` | REACHABLE |
| `exit finished in ` | `src-tauri/src/main.rs:892` (in `handle_exit`'s `finish`), flush at `:900` | transcript `[shell] ` and `gamelib.log` `[Shell]` | REACHABLE |
| `still running at exit deadline:` | `src-tauri/src/main.rs:895` (only when a drain overran) | transcript and `gamelib.log` | REACHABLE (see order note) |
| `lines dropped` (absent) | `src/backend/logger/forwarder.ts:441`, `src-tauri/crates/gamelib-log/src/writer.rs:305` | `gamelib.log` | REACHABLE (absence observable) |
| `log frame rejected` (absent) | `src-tauri/src/sidecar.rs:372` (stderr), `:374-376` (`gamelib.log`) | `gamelib.log` and transcript | REACHABLE (absence observable) |

No row is IMPOSSIBLE, so the run is not stopped.

Formats checked against the golden expected files: `gamelib.log` shell line is `(13:05:09) [INFO]:    [Shell]:           reaper started (pid 4242)`
(4 spaces after `[INFO]:`, 11 after `[Shell]:`) and the game line is `[DEBUG]:   [Backend]:         Logging to file(s) ...`
(3 and 9), so the item 1 and item 4 regexes match the emitted format.

### Findings recorded at the re-check (nothing is fixed here)

- **Item 8 order note.** `handle_exit`'s `finish` logs `exit finished in <ms> ms` (`main.rs:892`) and then, only if a drain
  overran, `still running at exit deadline:` (`main.rs:895`). Item 8's expected text and this plan demand the deadline
  line BEFORE the exit line. The contradiction bites only when a drain overran: with no overrun the deadline line is absent
  and item 8 is scored on the exit line and its bound alone. If a launch shows a deadline line, item 8 is `issue` for that
  launch on the contract's wording, with the order as the evidence; the fix (reorder the two calls, or amend the contract)
  goes to `/gsd-plan-phase 84 --gaps`, not into this plan.
- **Store path case.** The uploaded-logs store is `~/Library/Application Support/gamelib/store/uploadedLogs.json`
  (lowercase `gamelib`, per `log_upload.rs:276`); the contract spells `GameLib`. APFS here is case-insensitive, so both spellings resolve.
- **Sidecar bundle holds uncommitted work.** `build/main/sidecar.js` was built from a tree that also carries another
  session's uncommitted `src/backend/storeManagers/steam/` changes (`bridge/helperProcess.ts`, `gameBridgeLaunch.ts`,
  `bridge/otherSessionPlaying.ts`, tests). They do not touch `src/backend/logger/`.

### Automatable preflight

- **P1** `pnpm build:sidecar` exit 0; `build/main/sidecar.js` mtime `Nov 21 21:26:44 2026` is newer than the last
  `src/backend` commit (`06a741eb1`, `Sat Nov 21 21:14:20 2026 +1300`). PASS.
- **P2** before launch 1: `pgrep -f 'target/debug/gamelib-shell'` empty, `pgrep -f -- '--gamelib-reaper'` empty,
  `env | grep -c '^GAMELIB_LOG_LEVEL='` prints 0. PASS. Must be repeated before EVERY launch.
- **P3** log directory baseline taken. `~/Library/Logs/GameLib/` holds `gamelib.log` (mode 600, 11904 bytes, `Nov 21 20:41`,
  91 lines), `gamelib.log.old` (mode 600, 10282 bytes, 83 lines), `gamelib-shell.log` and older `gamelib.log.*` snapshots.
  Both were copied to the session dir as `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
  `gamelib-shell.log` baseline `stat -f '%m %z'` = `1795246522 1348615` (item 1 requires it unchanged).
  `uploadedLogs.json` does not exist yet: baseline entry count is 0 (item 6 expects one entry afterwards, not "one more
  than an existing file").
- **P7** session dir: `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/2ac7689c-6dfc-4793-b795-25f79a4607b8/scratchpad/gamelib-gate-2026-11-21T082706Z`
  (under `/tmp`, never committed), holding `notes.txt`, `terminal.log` (empty) and the two preexisting copies.
- **P4** (operator-confirmed, 2026-11-21): runner `gog`, appName `1192621307` (Racine), a Wine/CrossOver launch
  (`engine=crossover build=26.3.0.39832`). Verbose logs: assumed ON per the run instructions and CONFIRMED from the captured
  content: `game-launch-1.log` is 182 lines (system info, game settings, the game's own output) and holds no
  `IMPORTANT: Logs are disabled` line, where an OFF setting would leave only the two forced warnings.
- **P5** (operator): Steam signed in, at least one owned not-installed game; the operator reported no contrary observation.
  Independent evidence in launch 3: `[signInProbe] steam outcome=healthy` and a signed-in CM session (`session started`,
  PICS requests) after Refresh.
- **P6** (operator): the benign log was Balrum's game log (picker entry `Game log of Balrum`), read in the Log box before
  the upload. No content recorded.

## Current Test

[partial — scored 2026-11-21 by 84-11 Task 3: 7 pass, 1 issue (item 4, header clause); gaps go to `/gsd-plan-phase 84 --gaps`]

## Tests

### 1. Shell lines persist in gamelib.log with the [Shell] prefix and gamelib-shell.log is not written (D-01, criterion 4)
expected: In launch 1 (read from `gamelib-launch-1.log` and `terminal.log` after the launch exits), `gamelib-launch-1.log` holds a line matching `^\(\d{2}:\d{2}:\d{2}\) \[INFO\]: {4}\[Shell\]: {11}reaper started \(pid \d+\)$` whose pid equals the reaper pid in `reaper-pid-1.txt`, `terminal.log` holds `[shell] reaper started (pid ` with the same pid in launch 1's section, and `gamelib-shell.log`'s mtime and size equal the P3 baseline (or it is still absent).
result: pass — launch 1 (scorable run: shell pid 51625, reaper pid 51705, the third `=== GATE LAUNCH 1` section, `terminal.log` lines 87-171; see Capture-procedure notes). `gamelib-launch-1.log` line 1 `(21:53:54) [INFO]:    [Shell]:           reaper started (pid 51705)` matches the regex and `reaper-pid-1.txt` holds 51705; `terminal.log` line 139, inside that section, holds `[shell] reaper started (pid 51705)`; `gamelib-shell.log` `stat -f '%m %z'` after the run is `1795246522 1348615`, equal to the P3 baseline. One `reaper started` line per archive in all four launches.

### 2. TS sidecar lines keep the line format (criterion 1)
expected: In launch 1, `gamelib-launch-1.log` holds a `System facts:` line matching `^\(\d{2}:\d{2}:\d{2}\) \[INFO\]: {4}\[Backend\]: {9}System facts: `, and `lines dropped` and `log frame rejected` are absent from `gamelib-launch-1.log` and from launch 1's section of `terminal.log` (re-checked on all four launches' archives).
result: pass — `gamelib-launch-1.log` line 14 `(21:53:55) [INFO]:    [Backend]:         System facts: darwin arm64 27.0.0, CPU: Apple M5 Ultra x30, memory: 96 GiB` matches the regex (9 spaces after `[Backend]:`); the same line is present in launches 2, 3 and 4. `lines dropped` and `log frame rejected` count 0 in all four `gamelib-launch-N.log` archives and in all of `terminal.log` (each of launch 1's three sections, launches 2-4).

### 3. Rotation once per app launch, and new files are 0600 (criterion 1, D-18)
expected: In launch 2, after its window appears (launch 2 reads launch 1's archive), `cmp "$S/gamelib-launch-1.log" ~/Library/Logs/GameLib/gamelib.log.old` reports no difference and `stat -f %Lp ~/Library/Logs/GameLib/gamelib.log` prints 600.
result: pass — launch 2 (shell pid 52750, reaper pid 52792; no up-time instance count was recorded for this launch, see Capture-procedure notes). Helper output at launch 2: `item3 stat: 600` and `item3 cmp: no difference`; re-run from the archives afterwards: `cmp gamelib-launch-1.log gamelib-old-after-launch-2.log` reports no difference (both 17585 bytes), and the same pairing holds for launches 2 to 3 and 3 to 4. `gamelib.log` and `gamelib.log.old` are mode 600 at session end too.

### 4. A game transcript is written by the native writer and keeps its bytes (D-05, D-06)
expected: In launch 2, launch the P4 game twice from GameLib, quitting it normally in between and copying `launch.log` to `$S/game-launch-1.log` after the first quit; after the second quit `gamelib-launch-2.log` (archived after launch 2 exits) holds at least two `^\(\d{2}:\d{2}:\d{2}\) \[DEBUG\]: {3}\[Backend\]: {9}Logging to file\(s\) .*/games/<appName>_<runner>/launch\.log$` lines, `launch.log` starts with the runner's header line (record which: `Wine Command:` for Wine launches) and ends with `============= End of log =============`, `cmp "$S/game-launch-1.log" launch.log.old` reports no difference, and `lines dropped` is absent.
result: issue — the writer half is met, the header clause is not. Launch 2, runner `gog`, appName `1192621307` (Racine, Wine via CrossOver, Verbose logs ON confirmed from content): `gamelib-launch-2.log` holds two `[DEBUG]:   [Backend]:         Logging to file(s) ~/Library/Logs/GameLib/games/1192621307_gog/launch.log` lines (line 281 at 22:03:57 and line 358 at 22:08:35); `game-launch-1.log` (182 lines) and the final `launch.log` (180 lines) both end with `============= End of log =============`; `cmp game-launch-1.log launch.log.old` reports no difference (helper `item4 cmp: no difference`, re-run); `lines dropped` is absent; `launch.log`, `launch.log.old` and `install.log` are mode 600. NOT met: `launch.log` does not start with a runner header and holds no `Wine Command:` line (nor `Game Log:`). It starts `(22:03:57) [INFO]:    engine=crossover build=26.3.0.39832 reason=cx-healthy`, then `Launching "Racine" (gog)`, and its last line before End of log is gogdl's own `Launch command: [...]`. `Wine Command:` appears in no log under `~/Library/Logs/GameLib` on this Mac, including launch logs written before Phase 84 (e.g. the Nov 7 Balrum log), so this is not a Phase 84 regression. Cause: the header is written only by `runWineCommand` callers that pass `logWriters` (`src/backend/commandRunner.ts:342`), and a GOG launch goes through `runRunnerCommand` (`src/backend/storeManagers/gog/games.ts:938`), which never calls it. The contract premise (P4: a Wine launch writes `Wine Command:`) is wrong for this path; the fix is a contract amendment (name the real header, or pick a path that writes `Wine Command:`), to `/gsd-plan-phase 84 --gaps`. Evidence: `game-launch-1.log`, `gamelib-launch-2.log`.

### 5. Show in folder (criterion 2)
expected: In launch 2, Settings, Log, pick the GameLib entry, click "Show log file in folder": Finder opens `~/Library/Logs/GameLib` with `gamelib.log` selected.
result: pass — launch 2, operator observation (the log cannot show it): Finder opened `~/Library/Logs/GameLib` with `gamelib.log` selected. No executor-side evidence beyond the operator's report.

### 6. Upload and the uploaded list (criterion 2, D-07, D-09)
expected: In launch 2, upload the P6 benign log through the dialog (Yes on the confirm): the dialog shows an `https://dpaste.com/` URL, "Show uploaded log files" lists the entry by name, `~/Library/Application Support/GameLib/store/uploadedLogs.json` holds that URL with name, token and uploadedAt in 2-space JSON and one more entry than the P3 count, and `gamelib-launch-2.log` has a `[LogUploader]:` line containing `Uploaded log file `; record only the URL host and the entry name, never the log content.
result: pass — launch 2. Operator observation: the upload dialog showed an `https://dpaste.com/` URL and "Show uploaded log files" listed the `Game log of Balrum` entry. Executor evidence: URL host `dpaste.com`, entry name `Game log of Balrum`; `~/Library/Application Support/gamelib/store/uploadedLogs.json` (path lowercase `gamelib`, mode 600) has 1 entry against a P3 baseline of 0 (file absent), keyed by the URL and holding `name`, `token` and `uploadedAt`, byte-equal to `JSON.stringify(parsed, null, 2)` (2-space JSON); `gamelib-launch-2.log` line 144 `(22:00:59) [INFO]:    [LogUploader]:     Uploaded log file Game log of Balrum to https://dpaste.com/<id>`. Nothing about the log content recorded. Note: the entry is keyed by URL rather than carrying a separate `url` field; the contract's wording ("holds that URL with name, token and uploadedAt") is met.

### 7. Crate diagnostics reach the log (criterion 3, D-16, D-19)
expected: In launch 3 (`GAMELIB_LOG_LEVEL=debug`), with the P5 signed-in account, pressing the Library header's Refresh produces in `gamelib-launch-3.log` at least one `[DEBUG]:   [Steam]:` line whose message text is found by no `grep -rnF` over `src/backend` (so it came from a steam-vent or gamelib-steamcm tracing event, not a TS `logDebug`) and at least one `[Backend]:` line from an http-stack crate, and in launch 4 (no variable, P2 confirms) the same Refresh adds no `[DEBUG]` line whose message text matches any launch-3 crate-origin line.
result: pass — launches 3 and 4 (shell pids 58545 and 60316). Launch 3 (`gamelib-launch-3.log`) has 158 `[DEBUG]:   [Steam]:` lines; 120 of them are true crate-origin steam-vent events found by no `grep -rnF` and carrying no TS template (`picked websocket server from list addr=...`, `connected to websocket server`, `writing raw k_EMsgClientLogon message`, `session started steam_id=...`, `Setting up heartbeat with interval 9s`, `Reading child message MsgKind(...)`, with `(repeated N more times)` collapsing). The `[Backend]` http-stack lines are present: `connecting to <ip>:443`, `connected to <ip>:443`, `No cached session for DnsName("api.steampowered.com")`, `Using ciphersuite TLS13_AES_256_GCM_SHA384`, `pooling idle connection for ("https", api.steampowered.com)` (16 matches for the TLS/connect/pool/websocket pattern in launch 3, 0 in launch 4). Launch 4 (default level, P2 count 0): the Refresh ran (`[steamcm] rust steamcm_refresh` at 22:13:54, `steamcm_licenses` at 22:13:55) and adds 0 true crate-origin lines; its 39 `[DEBUG]:   [Steam]:` lines are all `[steampoll|steamfiles|steamcm] rust <channel>` lines, which are TS `logDebug` calls (`src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts:24`, `localFiles/rustSteamFiles.ts:19`, `cm/rustSteamCm.ts:24`) emitted at every level, not tracing events. CONTRACT-WORDING DEFECT, scored on the stated purpose ("not a TS logDebug"): the literal rule "message text found by no `grep -rnF` over `src/backend`" classifies those 38 launch-3 and 39 launch-4 `rust <channel>` lines as crate-origin, because the text is built from a template literal (`rust ${channel}`) that grep -F cannot match, and read literally the launch 4 absence would then fail. Fix for the gaps pass: amend the origin rule (exclude the three `[steam*] rust ` templates, or compare against an emitter list). That launch 3 and 4 were separated by the variable alone is shown by the 120 versus 0 true crate lines; the variable itself was a command prefix (launch 3 pre-check recorded `GAMELIB_LOG_LEVEL_count=0`, as designed).

### 8. The exit lines are flushed into gamelib.log inside the deadline (D-13 as amended, D-21)
expected: Read from launches 1-4 (each ended by Cmd+Q), each `gamelib-launch-N.log` holds a `[Shell]` line `exit finished in <ms> ms` with ms at most 5000, and a `still running at exit deadline:` line appears only if a drain overran and, when present, comes before that exit line; presence and order are scored, never end-of-file, so lines that land after the exit line (late sidecar frames or teardown `[Shell]` lines from other threads) do not affect the score.
result: pass — all four archives hold the `[Shell]` line and none holds `still running at exit deadline:`, so the order clause (and the Task 1 order note) was not triggered. `exit finished in 51 ms` in launch 1 (`gamelib-launch-1.log` line 118, 21:54:43), launch 2 (line 407, 22:10:07), launch 3 (line 332, 22:12:14) and launch 4 (line 156, 22:14:27); the same line `[shell] exit finished in 51 ms` is in `terminal.log` five times (launch 1's final section plus the aborted first section, launches 2-4 at lines 85, 171, 258, 348, 438). Lines after the exit line, recorded as observed and not scored: launch 1 ends with 3 `[Steam]` DEBUG lines and launch 3 with 8 lines after it (late sidecar frames); launches 2 and 4 end on the exit line itself. The value is 51 ms in every launch; it is read as the measured value and not interpreted further here.

## Capture-procedure notes

Recorded as they happened; none changed a score.

- **Launch 1 false starts.** `pre 1` ran three times (three `=== GATE LAUNCH 1` delimiters in `terminal.log`, at 08:48:33,
  08:52:36 and 08:53:23 UTC); the first attempt (shell pid 48809, reaper pid 48852) ran as an app instance, and the first
  attempt's `up 1` failed because `$G` was unset in the operator's second tab. The scorable launch 1 is the last (shell pid
  51625, reaper pid 51705, `terminal.log` lines 87-171; `shell-pid-1.txt` and `reaper-pid-1.txt` hold those final values,
  confirmed). The earlier attempts' `gamelib.log` went to `.old`, so `gamelib-old-after-launch-1.log` (140 lines, 20524 bytes)
  is a false start's log and not the pre-session `.old`, which is in `preexisting-gamelib.log.old` (83 lines).
- **Launch 2 has no up-time instance record.** `$G up 2` was not run: there is no `shell-pid-2.txt`, `reaper-pid-2.txt` or
  instance-count-at-up line. The contract's abort rule is "if the count is ever not 1 the launch is ABORTED"; every count
  taken was 1 (P2 empty before launch 2; `quit 2` recorded `instances: 1`, shell pid 52750) and no count was 2, so the rule
  does not fire. The missing record is a gap in the capture, covered by indirect evidence only: the launch 2 archive holds
  exactly one `reaper started` line (pid 52792) and one `System facts:` line, which a second instance sharing the log would
  have doubled, and launch 1's archive is byte-equal to `.old` (no second rotation). Items 3, 5 and 6 (and the writer half of
  item 4) were scored on that basis; this is a recorded weakness, not a clean assertion.
- **Launch 3 pre-check.** `GAMELIB_LOG_LEVEL_count=0` because the variable was supplied only as a command prefix, as designed;
  that it took effect is shown by launch 3's 120 true crate-origin DEBUG lines against launch 4's 0.

## Capture inventory (closing, 2026-11-21, before deletion)

`ls -la` of the session dir (`/tmp`-side, user name elided) and `wc -l` per file:

| file | bytes | lines |
|---|---|---|
| `game-launch-1.log` | 9042 | 182 |
| `gamelib-launch-1.log` | 17585 | 121 |
| `gamelib-launch-2.log` | 55039 | 407 |
| `gamelib-launch-3.log` | 39976 | 340 |
| `gamelib-launch-4.log` | 22596 | 156 |
| `gamelib-old-after-launch-1.log` | 20524 | 140 |
| `gamelib-old-after-launch-2.log` | 17585 | 121 |
| `gamelib-old-after-launch-3.log` | 55039 | 407 |
| `gamelib-old-after-launch-4.log` | 39976 | 340 |
| `preexisting-gamelib.log` | 11904 | 91 |
| `preexisting-gamelib.log.old` | 10282 | 83 |
| `terminal.log` | 28483 | 438 |
| `notes.txt` | 6691 | 74 |
| `reaper-pid-1/3/4.txt`, `shell-pid-1/3/4.txt` | 6 each | 1 each |

Total 2906 lines. No capture is missing or zero-length except `reaper-pid-2.txt` and `shell-pid-2.txt`, which were never
written (see Capture-procedure notes). After the counts above were copied, the log copies (`game-launch-1.log`,
`gamelib-launch-N.log`, `gamelib-old-after-launch-N.log`, `preexisting-*`, `terminal.log`) were deleted from the session dir
because they hold user paths; `notes.txt` and the pid files remain there (pids, literals and counts only).

## Withdrawn from live scoring

- Delete-uploaded: no reachable UI control, so no gesture can reach it live (`UploadedLogFilesList/index.tsx:59-64` is a JSX
  comment block; `UploadedLogFilesList/__tests__/deleteButtonReachability.test.tsx` proves no rendered control reaches the
  channel). Covered instead by the Rust round-trip test in 84-06.
- The rate limiter: no live trigger exists without injecting a fault into the running app. Covered instead by the limiter
  golden in 84-04.
- Windows: no live gate is claimed. CI's Windows leg is the Windows proof (paths, rotation with a held `.old`, and 0600 is
  unix-only), per research OQ5. The same reasoning leaves Linux to CI; this contract is a macOS gate.

## Structural Reachability Review

Authored by 84-01 on 2026-11-21 against the tree at HEAD, before any Phase 84 logger code exists. Every Phase 84 emitter is
absent, so every row that depends on one is CONDITIONAL and names 84-11 Task 1 as its re-check. REACHABLE means the surface
exists in current source and the gesture or command can be performed; IMPOSSIBLE means it cannot, and no row is IMPOSSIBLE.

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|
| Item 1: `[Shell]` line in gamelib.log | `shell_log` (84-08), `gamelib-log` writer (84-02) | the line with the reaper pid | CONDITIONAL: emitter not written; 84-11 Task 1 re-greps. T3 SINK: the transcript line is the stderr echo `[shell] <msg>` (`src-tauri/src/main.rs:581-582`, `shell_diag`) and the `gamelib.log` line is the writer, two different sinks for one call | the call exists at `src-tauri/src/main.rs:1867`; the pid is the reaper's (`gamelib_proc::reaper::start()` returns it) and `reaper-pid-1.txt` records it by command |
| Item 1: gamelib-shell.log unchanged | the file written by `shell_diag` today (`main.rs:568-600`) | mtime and size equal the P3 baseline | CONDITIONAL: holds only after 84-08 removes the file write. T4: presence case observable, because today every launch appends many lines (the 83 run's launch 1 and launch 2 each wrote 16 and 24 `pid=` lines to it), so an unchanged file proves the write is gone | `stat -f '%m %z'` before and after, P3 |
| Item 2: `System facts:` line | `logBootFacts` through the forwarder | the line format with `[Backend]:` and 9 spaces | CONDITIONAL: emitter exists, forwarder (84-03) does not. T3 SINK: sidecar `logInfo` reaches `gamelib.log` only, never the transcript, so the line is demanded of `gamelib-launch-1.log` only | `src/backend/logger/index.ts:139`, `src/backend/sidecar/bootstrap.ts:2510`; padding from `formatter.ts` and `constants.ts` (longest prefix 15, so `[Backend]:` pads to 18) |
| Item 2: `lines dropped` and `log frame rejected` absent | 84-03 forwarder, 84-02 writer, reader arm | absence in both sinks | CONDITIONAL. T4: confirmation of an existing structural guarantee, not a novel live discovery; each emitter is proven by its own unit test, and the rows in Required literals say so | Required literals table rows 9 and 10; re-check owner 84-11 Task 1 |
| Item 3: `cmp` launch 1 archive against `.old` | `gamelib.log.old` after launch 2's first write | no difference, proving one rotation at launch 2 | REACHABLE once 84-02 rotates; CONDITIONAL on it. T5: depends on the archive step running before launch 2 (flagged pair F1) | `cmp` exit status; rotation rule `log_writer.ts` `#archiveOldLogFile` today, 84-02 tomorrow |
| Item 3: `stat -f %Lp` prints 600 | the live `gamelib.log` at launch 2 | the mode of a file created by the Rust writer | CONDITIONAL: 0600 comes from 84-02 (D-18). T6: gamelib.log is created at launch 2's first write, so the pre-session 0644 file (renamed to `.old` at launch 1) cannot be read by mistake | `stat -f %Lp ~/Library/Logs/GameLib/gamelib.log`, read while launch 2 is running |
| Item 4: game launch twice | the installed P4 game's Play control | two launches, quitting between | REACHABLE: T7: the picker lists installed epic, gog, amazon and sideloaded games; the launch path writes a per-launch writer | `src/backend/launcher.ts:283` (`createGameLogWriter`, one writer per launch); `LogSettings/index.tsx:80-100`, `:170-185` |
| Item 4: `Logging to file(s)` lines and header | the facade and Rust writer (84-04, 84-02) | at least two DEBUG `[Backend]` lines naming the game's `launch.log` | CONDITIONAL: neither exists. T3 SINK: the line goes to `gamelib.log` (the general log), not to the game's launch log | `log_writer.ts` `Logging to file(s)` today; each launch builds a new writer, so one line per launch |
| Item 4: `End of log` and header in `launch.log` | the game's `launch.log` | the header first, `============= End of log =============` last | CONDITIONAL on 84-04. T6: P4 requires Verbose logs ON, because with it OFF the launch log holds only the two forced warnings and no header (`launcher.ts:283-296`) | `src/backend/commandRunner.ts:342` (`Wine Command:` header), `launcher.ts:317`, `:357`, `:419` (`logWriter.close()`) |
| Item 4: `cmp game-launch-1.log launch.log.old` | `launch.log.old` | the first launch's bytes | CONDITIONAL on 84-02 rotating a game target per writer. T5: flagged pair F5, resolved by the `cp` step between the two launches | `cmp`; evidence-capture bullet "Game files" |
| Item 5: show in folder | `LogSettings` footer control | Finder opens the log directory with `gamelib.log` selected | REACHABLE as a gesture; CONDITIONAL on 84-05's native path. T7: Settings (tier-2 panel) then Log renders `LogSettings` with `isInSettingsMenu`; the picker button `GameLib` (`index.tsx:206-221`) selects `{}`; `getLogContent` returns the content, so `logFileExist` is true and the control renders; the click calls `window.api.showLogFileInFolder(showLogOf)` | `src/frontend/screens/Settings/sections/LogSettings/index.tsx:130-132`, `:236-239` (render guard `logFileExist &&`) |
| Item 6: upload through the dialog | `LogSettings` footer Upload control, `LogFileUploadDialog` | the confirm, an `https://dpaste.com/` URL | REACHABLE as a gesture; CONDITIONAL on 84-05. T1: the one URL is the https dpaste endpoint (`uploader.ts:14`), not an http fixture. T2: the dialog is modal and sequential, nothing is driven concurrently. T7: picker entry, then the footer Upload control (`index.tsx:252-258`) sets `uploadLogFileProps`, the dialog's Yes (`LogFileUploadDialog/index.tsx:65`) runs `doUpload` (`:26-52`) and then shows `Uploaded to {{url}}` | `LogFileUploadDialog/index.tsx:26-52`, `:65`; one-shot resource: an upload cannot be retracted (`uploader.ts` has no delete), so a failed score is not retried by uploading again |
| Item 6: uploaded list and `uploadedLogs.json` | `UploadedLogFilesList`, `store/uploadedLogs.json` | the entry by name; the URL, name, token and uploadedAt in 2-space JSON; count plus one | CONDITIONAL on 84-06. T7: "Show uploaded log files" renders only `isInSettingsMenu` (`LogSettings/index.tsx:273-277`) and the row shows `<td>{name}</td>` (`UploadedLogFilesList/index.tsx:50`). T6: pre-existing entries from earlier sessions are why P3 records a count | P3 baseline; `src/backend/logger/stores.ts:13-16` (`uploadedLogs`, `cwd: 'store'`) |
| Item 6: `Uploaded log file ` line | the uploader's `logInfo` `[LogUploader]` | the line in `gamelib-launch-2.log` | CONDITIONAL on 84-05. T3 SINK: reaches `gamelib.log` only | `src/backend/logger/uploader.ts:109` today |
| Item 7: crate `[DEBUG] [Steam]` and `[Backend]` lines | tracing and `log` bridges (84-08), Library header Refresh | at least one of each in launch 3 | CONDITIONAL on 84-08. T7: the Library header's Refresh button runs `refreshLibrary({checkForUpdates: true, origin: 'action-icons-refresh-button'})` for all runners | `src/frontend/components/UI/Header/index.tsx:471-482`; `src/frontend/state/libraryState.ts:407-470`; T3 SINK: crate lines reach `gamelib.log` only |
| Item 7: launch 4 absence | launch 4's `[DEBUG]` Steam lines | none whose text matches a launch-3 crate-origin line | CONDITIONAL. T4: the absence is meaningful only because the same Refresh in launch 3 produced those lines (the positive control); a TS `logDebug` with the `Steam` prefix would otherwise be mistaken for a crate line, which is why crate origin is defined as "message text found by no `grep -rnF` over `src/backend`", compared by text, not by prefix alone | launch 3 and launch 4 archives; residual risk recorded: a cached Refresh could emit fewer crate events in launch 4, so a missing line is read together with launch 3's set |
| Item 8: exit line presence, bound and order | `exit finished in <ms> ms`, `still running at exit deadline:` | present, at most 5000, deadline line (if any) before it | CONDITIONAL on 84-09. T3 SINK: both are `[Shell]` lines in `gamelib.log` after 84-08, and `[shell] ` lines in the transcript. T4: presence is the positive control for the deadline line. T5: scores presence and order, never end-of-file (late sidecar frames and teardown `[Shell]` lines from other threads can follow the exit line) | `src-tauri/src/main.rs:841`, `:846` (today) |
| P1 sidecar freshness | `build/main/sidecar.js` | newer than the last `src/backend` commit | REACHABLE | `stat -f %Sm build/main/sidecar.js`; `git log -1 --format=%cd -- src/backend` |
| P2 zero instances and clean env | process table and shell env | two empty `pgrep` results and zero `GAMELIB_LOG_LEVEL` | REACHABLE. T5 and T6: a stale instance or a lingering variable is the F-34.4.2-15 and F-34.4.2-18 shape, checked before every launch | `pgrep -f 'target/debug/gamelib-shell'`, `pgrep -f -- '--gamelib-reaper'`, `env` |
| P3 baseline | `~/Library/Logs/GameLib/`, `uploadedLogs.json` | listing, copies, stat, entry count | REACHABLE. T6: names the pre-existing `gamelib.log`, `gamelib.log.old`, `gamelib-shell.log` and uploaded-logs state this run starts from | `ls -la`, `stat -f`, `node -e` entry count |
| P4 a TS-launched game with Verbose logs on | an installed gog, epic, amazon or sideloaded game | runner, appName, setting recorded | REACHABLE. T6: the game's existing `launch.log` from earlier sessions is rotated into `.old` by the first launch and replaced by the second, so only the two launches in this run remain; Verbose logs ON is the premise | `launcher.ts:283-296`; `LogSettings/index.tsx:170-185` |
| P5 signed-in Steam account | the Steam library | at least one owned, not-installed game (count only) | REACHABLE. T6: an emptied app-side store would not prove a signed-out session, so the positive observable is the library content; the tile hides the account name by design | Library view, Steam filter |
| P6 a benign log to publish | the Settings Log box | a log the operator has read | REACHABLE. T6: external state is the operator's judgement of what is benign; the contract records only the URL host and the entry name | `LogSettings/index.tsx:206-221` (picker), the Log box |
| P7 the session directory | `/tmp/gamelib-gate-<UTC>/` | created once | REACHABLE | `mkdir -p "$S"` |
| Evidence-capture instruction across Tests 1-4, 6, 7 | `terminal.log`, the archive copies | `tee -a`, delimiter, per-launch archive, one-instance assert, closing inventory | REACHABLE. T3: each literal is read from the sink its row names. T5: see the pairing pass | the Evidence capture section; `live-gate-contract-authoring.md` Section 3 |

**Test 1 (origin/scheme).** The only network origin is `https://dpaste.com/api/v2/` (`src/backend/logger/uploader.ts:14`), a
real https endpoint; no http fixture origin and no login URL is required. Steam sign-in is a precondition (P5), never driven.

**Test 2 (concurrency).** Nothing is driven at once: the upload dialog is modal and sequential, Finder opens after the click,
and the two game launches are sequential by design.

**Test 3 (emitter and SINK).** Every literal is in the Required literals table with its sink, and the sink column is the
post-84 partition. Sidecar lines are demanded of `gamelib.log` only; `[Shell]` lines of both sinks as two different sinks;
crate lines of `gamelib.log` only. The transcript is never asked for a sidecar-emitted line (the F-34.4.2-14 shape).

**Test 4 (absence-observability).** Four absences: `lines dropped`, `log frame rejected` (structural guarantees, each with a
unit-tested emitter; the live check confirms them), gamelib-shell.log unchanged (observable: today every launch appends a couple of dozen lines), and launch 4's missing crate lines (observable: launch 3's positive control).

**Test 5 (requirement interaction), the pairing pass.** Reduction applied: every state-mutating requirement against every
evidence-bearing requirement, not the full cross product. State-mutating requirements (M = 8): relaunch 2, relaunch 3,
relaunch 4, the `GAMELIB_LOG_LEVEL` change (set for launch 3, unset for launch 4, counted as one), game launch 1, game
launch 2, the upload, and the graceful quit that ends each launch. Evidence-bearing requirements (N = 11): `terminal.log`,
the `gamelib-launch-N.log` archives, the `gamelib-old-after-launch-N.log` archives, the live `gamelib.log` (cmp and stat
reads), the P3 `gamelib-shell.log` baseline, the game's `launch.log`, `launch.log.old`, `uploadedLogs.json`, the item 3
`cmp`, the item 3 `stat`, and the absence checks (`lines dropped`, `log frame rejected`). Total pairs considered: **88 (8 x 11)**. Pairs flagged: **7**.

- F1: relaunch 2 x the live `gamelib.log` and the launch 1 archive. Launch 2's first write renames `gamelib.log` to
  `.old`. Resolution: launch 1's copy is archived before launch 2 starts, and item 3 compares that copy to `.old`.
- F2: relaunch 2, 3 and 4 x the `gamelib-old-after-launch-N.log` archives. Each launch replaces `.old`. Resolution: archive
  `.old` after each launch and before the next.
- F3: every relaunch x `terminal.log`. A bare `tee` truncates on each new process. Resolution: `tee -a` and the delimiter
  command run as its own step before each launch.
- F4: the `GAMELIB_LOG_LEVEL` change x item 7's launch 4 absence and item 2's absences. The variable must not reach launch
  4. Resolution: it is a command prefix on launch 3 only, and P2 asserts `env | grep -c '^GAMELIB_LOG_LEVEL='` is 0 before
  launches 1, 2 and 4.
- F5: game launch 2 x `launch.log`. The second launch rotates the first launch's file into `.old`. Resolution: item 4
  copies `launch.log` to `game-launch-1.log` between the launches and compares that copy with `.old`.
- F6: the upload x `uploadedLogs.json`. Entries from earlier sessions would make "the URL is present" vacuous.
  Resolution: P3 records the entry count and item 6 asserts the count rose by one and names the new URL.
- F7: every relaunch x the one-instance assertion. A previous instance or its reaper still alive splits the sinks.
  Resolution: P2's two `pgrep` checks before every launch, and a graceful Cmd+Q to end each launch.

Considered and not flagged: the upload x item 4's `launch.log` (the upload only reads the chosen log), the graceful quit x
items 5 and 6 (they run earlier in launch 2), and every relaunch x the `stat` mode read (the file is created at that
launch's first write and read in the same launch).

**Test 6 (pre-existing external state).** Per item: item 1 depends on the pre-session `gamelib-shell.log` (P3 records it).
Item 3 depends on the pre-session `gamelib.log` and `.old` (renamed at launch 1; `preexisting-*` copies kept). Item 4 depends
on the game's earlier `launch.log` and its Verbose logs setting (P4). Item 5 depends on Finder (a window opened by another
app; read by eye). Item 6 depends on `uploadedLogs.json` from earlier sessions (P3) and on dpaste being reachable. Item 7
depends on the live Steam sign-in (P5, a positive observable) and on Steam's own cached state. Item 8 depends on a graceful
quit in every launch.

**Test 7 (UI-level reachability).** Items 4 to 7 are traced above to the components that render each control: the
LogSettings picker, footer controls and uploaded-list button (`src/frontend/screens/Settings/sections/LogSettings/index.tsx`
at the lines cited), `LogFileUploadDialog/index.tsx`, `UploadedLogFilesList/index.tsx` and the Library header Refresh
(`src/frontend/components/UI/Header/index.tsx:471-482`). The delete control is commented out and is withdrawn above.

**Run-time count (84-11, 2026-11-21).** Structural impossibilities and unresolved requirement interactions met during the run:
**2**. (1) Item 4's header clause is structurally unreachable on the path P4 chose: a GOG launch goes through
`runRunnerCommand` and never writes `Wine Command:` (see item 4). (2) Item 7's crate-origin rule, "message text found by no
`grep -rnF` over `src/backend`", cannot see TS `logDebug` calls built from a template literal, so the launch 4 absence read
literally contradicts its own purpose (see item 7). Not counted: the item 8 order contradiction recorded at Task 1 (latent,
never triggered, since no launch had a deadline line). Two capture-procedure slips were met and are not contract defects:
launch 1 needed three attempts, and launch 2 has no up-time instance record (see Capture-procedure notes).

**Run order.** P1 to P7, then launch 1 (item 1, item 2; item 8 read after exit), archive, launch 2 (item 3 first, then 5, 6,
4), archive, launch 3 (item 7 with `GAMELIB_LOG_LEVEL=debug`), archive, launch 4 (item 7 without it), archive, read item 8 across all four archives,
then the closing inventory.

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0
blocked: 0
