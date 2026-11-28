---
status: pending
phase: 88-launch-pipeline
source: [88-CONTEXT.md D-05 D-08 D-09 D-16 D-17 D-27 D-29 D-30 D-31]
authored_by: 88-01
run_by: "the 88.3 live-gate plan (named when 88.3 is planned; never 88-01)"
started:
updated: 2026-11-25T00:00:00Z
---

This is the live macOS gate contract for SVC-03 (launching any game builds the same command line and environment from Rust and
Rust spawns it, a game survives a GameLib crash and is re-adopted, a graceful quit asks before it ends a running game, and a
known fix plus the pre and post scripts apply on a real launch). It was authored by plan 88-01 on 2026-11-25, at `main`
`b74b86393`, before any Phase 88 code plan runs, and is run only by the 88.3 live-gate plan, never by its author
(live-gate-contract-authoring standing rule D-E). The gate is macOS only (D-16): Windows and Linux are covered by the golden
replay, the three-OS stub-game smoke (88.2 and 88.3) and the real-title checks that ride with Phase 99. Nothing in this file has
run. Every row whose Rust emitter does not exist yet is CONDITIONAL and carries "re-check: the 88.3 live-gate plan, Task 1".

The gate touches real bottles, save folders and per-game settings. Nothing below edits any of them without a `ditto` copy first
(P3) and a restore step after the item that changed them. The operator names every title in P5; Claude never picks a bottle,
save or script to change.

## Builds under test

- **Baseline (the install-over source):** the signed and notarized Phase 87 gap build that plan 87-68 records in
  `.planning/phases/87-engine-wine-and-tools/87-VALIDATION.md` under `## Signed builds (D-12)`, "### Phase 87 gap build
  (87-68)". At authoring that record reads v0.13.1, run `45455431706`, `release/v0.13.1` at `97d6d2052`,
  `Identifier=com.gamelib.shell`, `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)`,
  `TeamIdentifier=S7U223QWXJ`, `CDHash=266b7378d08b90e305efe37d2573270b01b146dd`, designated requirement sha256 `68d712d0...`.
  The 88.3 plan re-reads that section at its own run and uses whatever it records then (a later Phase 87 build supersedes the
  authoring-time values).
- **Phase 88 build (every item):** the signed and notarized Phase 88 build that the 88.3 plan builds from a version-bumped
  release branch (as 85-19, 86-26, 87-59 and 87-68 did) and records in `.planning/phases/88-launch-pipeline/88-VALIDATION.md`
  under its own signed-builds heading. Check it with `codesign -dv --verbose=4 /Applications/GameLib.app` and
  `spctl -a -vv /Applications/GameLib.app` after the install.
- **The two identities must match** (same Authority chain, same TeamIdentifier, same designated requirement), so the Keychain ACL,
  the entitlements and the bottle markers the baseline wrote apply to the Phase 88 build unchanged.
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never exercises the signed app's entitlements, its real `wine`
  spawns or the Launch Services scheme handler) or an unsigned build scores every item `blocked`, and nothing else stands in for
  it (D-30). All four items run in one session on the same signed Phase 88 build.
- Sub-phases 88, 88.1 and 88.2 close on goldens plus three-OS CI with no signed build and no operator session; only the 88.3
  plan builds the signed build and runs this file (D-30).
- Launch ordinals below (launch 1, launch 2, ...) count launches of the Phase 88 build only. Launches of the baseline in P5 are
  not numbered.

## Deliberate behaviour changes

Each is one line, with the decision that makes it deliberate. None is a regression when observed, and none is scored as parity.

- A non-bridge game now survives a GameLib Force Quit, `kill -9` or crash, because Rust spawns it as `SpawnClass::Game` in its own
  session (D-05). Bridge launches keep the 83 D-15 interim until 95 to 97, so no bridge title is used in items 2 and 3.
- The pending-operations dialog now also appears when a game is running, and Yes kills the game's process tree through
  `gamelib-proc`; today the dialog fires only for a locked state, a running download queue or bridge hosting (D-27, which amends
  D-06; a behaviour change, not parity).
- A game that survived a crash is shown Playing after reopen, its per-game log gains a "re-adopted" line, and no further output
  is captured for it, because the original stdout pipe died with the old process (D-08, D-09).
- On a quit-kill, playtime is recorded at the kill and the after-launch script runs at the next GameLib boot, not at quit
  (D-31); nothing unbounded runs inside the 5 s exit budget.
- Game output reaches the per-game log through a private capture file that Rust tails, and Rust is the only writer of that log
  (D-29).
- The known-fix exe-override info line in `gamelib.log` names the relative override, not the resolved absolute path (the
  `EngineLog` redaction rule; prohibition 1 of this phase).

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found or absent, file names, hashes and
`~` paths only; never a token, a Keychain value, a full `args` line, a save file's content or a per-launch record's content.

- **P1** session directory, created once: `S=/tmp/gamelib-gate-88-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`. Everything this
  contract copies or captures goes under `$S`. Captures stay under `/tmp` (or the session scratchpad under it) and are never
  committed.
- **P2** exactly one GameLib instance before every launch, and none while any file is copied: `pgrep -fl
  'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'` prints nothing before
  the launch. A leftover process is quit or killed by pid and the check re-run. Also assert no `wineserver` is left from the
  baseline session (`pgrep -fl wineserver` prints nothing for a gate bottle). **Item 3 amends P2 for its reopen only:** after the
  `kill -9`, the reaper exits on its own and P2's GameLib assertions are waited on until they hold (poll for up to 30 s); the
  game's own processes and the game bottle's wineserver are expected to be alive and are not a P2 failure there.
- **P3** the copies, with the app closed (P2 first), before any item touches a file:
  - `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-before/"` (this holds the per-game `GamesConfig/*.json`, the
    stores, and the `fixes/` and `overlays/` trees);
  - `ditto "$HOME/Library/Logs/GameLib/games" "$S/game-logs-before/"`;
  - for each named title's bottle: `ditto "$HOME/Library/Application Support/CrossOver/Bottles/<bottle>" "$S/bottles-before/<bottle>/"`;
  - for each named title's save folder, the operator names its path and the runner copies it with `ditto` to `$S/saves-before/`.
  These copies are the restore path for every item.
- **P4** the baseline, recorded app closed and before the Phase 88 build is installed, saved to `"$S/baseline.txt"`: for each named
  title, `ls -la` of its install folder and bottle top level, the `shasum -a 256` of its save files, and the three keys
  `firstPlayed`, `lastPlayed`, `totalPlayed` of its entry in `store/timestamp.json` (ISO strings and integer minutes only); and
  `ls -la` plus the entry count of `fixes/`, `fixes/local/` and `overlays/` under the gamelib profile.
- **P5** the operator names the titles, and Claude records them in `notes.log` and starts nothing until they are named: **one
  native macOS game** (GOG or Epic; item 1, and item 2); **one Windows game that runs on CrossOver** (item 1, and item 3); **one
  Windows game for the Staging fallback** (item 1, run under `no-crossover.sb` as in P7); **one title that has a known fix with an
  overlay and an env or exe override** (item 4), or the operator approves the runner writing a local fix pair under `fixes/local/`
  for a named title (that directory is `ditto`-copied by P3 and the added files are removed afterwards). **No Steam bridge title
  is used in items 2 and 3.** With the baseline installed and P2 clean, each named game is launched once so its bottle and marker
  exist before the upgrade; then the app is quit and P2 re-run. P3 and P4 are taken AFTER P5. A title the operator cannot name
  scores the half of the item that needs it `blocked`, with the gap named.
- **P6** the network: no scored step in this contract is offline. If an operator adds an offline launch, the network is off only
  for the action (off, act, on, report), by the Wi-Fi menu or `networksetup -setairportpower <interface> off` and `on` (the
  interface from `networksetup -listallhardwareports`; it was `en1` on this Mac at the 87 gate). The operator needs the network
  to talk to Claude.
- **P7** the sandbox profile for the Staging fallback is copied into `$S` unchanged from
  `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb` (it denies
  reads of `/Applications/CrossOver.app`, so CrossOver reads as missing and the engine step selects the pinned Wine-Staging
  with DXVK). The signed app is started under it with `sandbox-exec -f "$S/no-crossover.sb"
  /Applications/GameLib.app/Contents/MacOS/gamelib-shell`, and the runner records the one resulting pid (P2 asserted first). The
  pinned engine must already be installed under `tools/steam-engines/` (the 87 gate left it there; `ls -la` is recorded in P4).
- **P8** the scripts, the runner's own and never the operator's. `$S/pre.sh`, `$S/post.sh` and `$S/after.sh` each append one
  line to `"$S/script-order.txt"` of the form `<name> <UTC time>` and print one marker line to stdout, then exit 0. They are
  attached to a named title through the title's own Settings screen (the Before and After launch script fields), never by
  editing `GamesConfig/*.json` while the app is open. The restore for each is the P3 `profile-before/` copy of that one title's
  `GamesConfig/<app>.json`, put back with the app closed.
- **P9** which bundles claim the `gamelib` URL scheme, because item 2's second Play is a `gamelib://` link (a copy of an older
  GameLib.app kept in `$S` or `target/debug/bundle` would split it): record the bundle paths only, from
  `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump` filtered to
  the `gamelib:` scheme claim. More than one bundle path scores the double-Play half `blocked` until the operator removes the
  other from Launch Services' reach.

## Tests

### 1. Launches
expected: On the signed Phase 88 build, a native macOS game (GOG or Epic), a Windows game on CrossOver and a Windows game on the Staging fallback each start and run from Play, the per-game log carries the launch header and the game's own output, and `totalPlayed` and `lastPlayed` in `store/timestamp.json` are updated when each game exits.
result: pass. Run 2026-11-28 on the dev build (`pnpm tauri:dev`, main at c8dd0b0b3), not the signed build. Native macOS: SOMA (Epic via legendary). Its per-game log has the launch header (`Native? true`, install folder, system info) and Soma's own output, and its play time was recorded when it ended (by GameLib's Quit, item 3). CrossOver: Caravan SandWitch (Amazon via nile), `engine=crossover build=26.3.0.39832 reason=cx-healthy`. It was closed from in-game; the log has the header, the game output and the end marker, and `lastPlayed` moved to the exit. Staging: the same title pinned to `Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)` (`reason=override`), played 18:07:50 to 18:13:34, `totalPlayed` went from 7 to 12, and `lastPlayed` moved to the exit. Each launch's record in `launches/` was removed at the exit. An Amazon id holds dots, so its `timestamp.json` entry is nested under `amzn1 → adg → product`, as the TS store wrote it before.

### 2. Single flight and quit
expected: A second Play while the first is launching (a `gamelib://launch/<runner>/<appName>` link opened during the launch) produces one game process and the single-flight joiner line in `gamelib.log`; quitting GameLib with the game running shows the pending-operations dialog, No (cancelId 0, and Esc) keeps GameLib and the game running, Yes kills the game's whole tree through gamelib-proc inside the 5 s exit budget, playtime is recorded at the kill (D-31), and the after-launch script runs at the next GameLib boot, not at quit.
result: pass. Run 2026-11-28 on the dev build (`pnpm tauri:dev`, main at c8dd0b0b3), not the signed build, with SOMA (legendary) and a marker after-launch script. A `gamelib://launch?appName=Emu&runner=legendary` link was relayed through the single-instance socket while SOMA's launch was in flight (the game already running). `gamelib.log` printed `Launch of Emu (legendary) already in progress; joining it (WR-03)` and one Soma process stayed. At Cmd+Q the pending-operations dialog appeared; No kept GameLib and Soma running. At the second Cmd+Q, Yes ended Soma: the quit was handed over at 18:19:52 and Soma was killed at 18:19:56, a window that includes the time to click Yes. `totalPlayed` went from 7 to 9 and `lastPlayed` was set to the kill, the record read `quitKilled` with the after script, and the marker file did not exist. The next boot wrote `launch re-adoption: 0 adopted, 0 removed, 1 owed scripts, 0 skipped`, the marker was written at 18:20:42, and the record was removed. Follow-up todo: the dialog's wording ("There are pending operations, are you sure?") does not say that a game is running or that Yes closes it.

### 3. Force Quit survival and re-adopt
expected: `kill -9` of the GameLib app pid mid-game leaves the game's pid alive in its own session (the CrossOver title, whose Wine loader has already exited, is still a running game while its recorded session is alive); reopening GameLib shows the game as Playing once the renderer is ready (the re-adopted status is re-sent after `frontendReady`), the per-game log gains the re-adopted line and no further captured output, and when the game exits playtime is recorded and the after-launch script runs.
result: pass. Run 2026-11-28 on the dev build (`pnpm tauri:dev`, main at c8dd0b0b3), not the signed build, with SOMA (Epic via legendary, native macOS). Start-up wrote `launch re-adoption: 0 adopted`. `kill -9` of `gamelib-shell` ended the shell, the sidecar and the reaper; Soma (pid 19069, the recorded member, whose legendary leader 19066 had exited) kept running. The next start wrote `launch re-adoption: 1 adopted, 0 removed, 0 owed scripts, 0 skipped`, the per-game log gained the re-adopted line, and the game showed as Playing. Quit asked about the running game and Yes ended Soma: `totalPlayed` went from 2 to 7 and `lastPlayed` moved to the kill, and the per-game log got its end marker. Not exercised: a CrossOver title, and the after-launch script (SOMA has none). Two todos were filed: the quit-killed record is kept and logged as "owed" with no script, and the `launches` folder is 0755.

### 4. Known fix and scripts
expected: A title with a known-fix overlay and an env or exe override applies both on launch (the overlay present under `overlays/`, the override visible in the launch evidence and the exe override named relative), and the pre-launch script, the game and the after-launch script run in that order with each script's output in the per-game log, scored from `script-order.txt` and the per-game log.
result: pending

## Run order

P1 and P2, P5 (name the titles and launch each gate title once on the baseline, quit, P2 again), P9, P3, P4, P6, P7 and P8 on the
baseline. Then install the signed Phase 88 build over it (same path, `/Applications/GameLib.app`, identities matched per
`## Builds under test`). The run order is items 1, 4, 2, 3, so the destructive `kill -9` runs last:

1. **Launch 1 (plain): item 1 native and CrossOver halves, then item 4.** Item 1's native macOS game, then its CrossOver game
   (`reason=cx-healthy`), each launched from Play and exited normally; then item 4 on the named title with its scripts attached
   through Settings (P8). Archive logs after the quit.
2. **Launch 2 (under `no-crossover.sb`, P7): item 1 Staging half.** The Windows game on the pinned Wine-Staging with DXVK; exit
   it normally; quit; archive.
3. **Launch 3 (plain): item 2.** Launch the native title with `after.sh` attached. Open the `gamelib://` link while it is still
   launching (the double Play). Then ⌘Q: choose No, confirm GameLib and the game still run, ⌘Q again and press Esc, confirm the
   same, ⌘Q once more and choose Yes. Record the playtime keys. The after-script is NOT expected in this launch; archive the
   launch and write `wc -l "$S/script-order.txt"`.
4. **Launch 4 (plain): item 2's after-script half, then item 3 up to the kill.** Wait until the boot has finished (the window is
   up and `gamelib.log` shows the boot's quiet point); read `script-order.txt` (one new `after` line from item 2's record);
   attach `after.sh` to the CrossOver title if it is not already; press Play on the CrossOver title; once it is running record
   pid, pgid, session and start time of the game and of the sidecar (`ps -o pid,pgid,sess,lstart,comm`), then `kill -9` the app
   pid from `shell-pid-4.txt` (the app pid only, never the reaper, the sidecar or the game). Archive `gamelib.log` immediately,
   before anything is reopened.
5. **Launch 5 (plain, the reopen): item 3 after the kill.** Assert P2's amended form, record that the game pid, its start time and
   its session are unchanged, open `/Applications/GameLib.app`, wait for the renderer, report the Playing state, then let the
   game exit and read playtime and `script-order.txt`. Archive.
6. **Item 4's restore and the closing inventory** with the app closed (P2 first): the P3 `GamesConfig/<app>.json` copies put back
   for every title whose Settings were changed, and the `fixes/local/` files the runner added (if any) removed. The operator
   decides whether to restore anything else.

## Evidence capture

The dual-sink standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3), adapted
to a signed app launched from `/Applications`. A signed release build has no `pnpm tauri:dev` terminal, so there is no
`terminal.log` sink: every shell and sidecar line reaches `~/Library/Logs/GameLib/gamelib.log` (shell lines as `[Shell]`,
sidecar lines as `[Backend]`, Rust crate diagnostics under a mapped prefix), and the sidecar's `console.*` and stderr reach
nothing. Each game's own log is the second sink: `~/Library/Logs/GameLib/games/<appName>_<runner>/launch.log`, written only by
Rust (D-29), and read separately from `gamelib.log`. The transcript is `$S/notes.log`, written by hand; nothing below asks the
transcript for an app log line.

- One session directory (P1), created once, never reused across runs. Each result carries `~` paths, hashes and counts only.
- The transcript is appended, never truncated: every write to `$S/notes.log` is `tee -a`, never a bare `tee` and never `>`.
- Before each launch write the delimiter, exactly, as its own command:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`). `N` counts launches of the Phase 88 build from 1.
- One app instance, asserted before each launch (P2). After the window appears record the instance count with the reaper excluded:
  `ps -axo pid,ppid,args | grep 'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep` must
  print exactly one line; write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is not 1 the
  launch is ABORTED and re-run: its evidence is not scorable. Under `no-crossover.sb` the instance is the one `sandbox-exec`
  started, and the same count applies.
- After each launch quits (or is killed), and BEFORE the next launch starts, archive while the files exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"`, and if `gamelib.log.old` exists
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`; and for every title launched in that
  launch, `cp ~/Library/Logs/GameLib/games/<appName>_<runner>/launch.log "$S/game-<appName>-launch-${N}.log"` (and
  `launch.log.old` the same way if present). The next launch's first write renames `gamelib.log` to `.old` and the next launch of
  the same title rotates its per-game log. Before launch 1 also copy the baseline session's `gamelib.log` and `.old` into `$S` as
  `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
- Every result records the launch ordinal that covered it, so a reader can find its `gamelib-launch-N.log`, its per-game log
  copy and its `notes.log` section.
- A game's own output (the save file, the bottle) is evidence by `shasum -a 256` and `ls -la` recorded in `notes.log`, never by a
  paste of content. Process evidence is names, counts, pids, pgids, sessions and start times, never an args line.
- `script-order.txt` is the one file the scripts append to; it is read with `wc -l` and `cat` before and after each step that can
  add a line, and the line counts are written to `notes.log`.
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run, then the
  restore of P3 for whatever the operator chooses to restore, with the post-restore `shasum -a 256` against the `*-before`
  copies. The captures hold account data and paths, stay under `$S` and are deleted by the operator after Phase 88 is verified.

## Required literals

Sinks are `gamelib.log` unless stated. The literals below are the ones the items score. At authoring (HEAD `b74b86393`) no Rust
emitter of any of them exists: the single-flight line exists only as the TypeScript one, and the re-adopted line, the quit
dialog's game-running condition and the capture-file output do not exist at all. Every row is therefore CONDITIONAL, and the 88.3
live-gate plan, Task 1, re-greps each literal at the shipped Phase 88 code, names its emitter and sink, and resolves the row
(REACHABLE, REACHABLE as amended, or IMPOSSIBLE, which is amended and never scored). No row may carry a URL, query, header,
token, account name or profile path (prohibition 1); each is fixed text through the `EngineLog` redactor.

| Literal | Emitter at authoring | Sink | Status |
|---|---|---|---|
| the single-flight joiner line, today `Launch of <appName> (<runner>) already in progress; joining it (WR-03)` | `launchEventCallback`'s `onJoin`, `src/backend/launcher.ts:519-522` (TS, `logInfo`, `[Backend]`) | `gamelib.log` | CONDITIONAL: a Rust emitter replaces it in 88.3 (D-04); re-check: the 88.3 live-gate plan, Task 1 |
| the re-adopted line (the session was re-adopted, no further output captured) | none (new in 88.3, D-08 and D-09) | the game's per-game log, `games/<appName>_<runner>/launch.log` | CONDITIONAL: also decides whether the line lands in the file the game was launched into or in a rotated one; re-check: the 88.3 live-gate plan, Task 1 |
| the quit dialog's game-running text (`box.quit.title` Exit, `cancelId: 0`, buttons No and Yes) | `createQuitHandler`'s `handleExit`, `src/backend/quitHandler.ts:35-67` (TS; the dialog shows only for `isLocked`, `isRunning` or `isBridgeHosting` at authoring) | none: a system dialog scored by the operator seeing it and reporting its text; the matching `gamelib.log` line, if any, is named by re-check | CONDITIONAL: the game-running condition is new in 88.2 (D-27); re-check: the 88.3 live-gate plan, Task 1 |
| the capture-file output in the per-game log (the game's own stdout and stderr lines, tailed by Rust) | none (new in 88.2, D-29; today the TS runner pipes the child's output) | the game's per-game log | CONDITIONAL: the lines are the game's own, so the game must print something at start (the operator names such a title); re-check: the 88.3 live-gate plan, Task 1 |
| the per-game log header, the lines from `Launching` and `Game Settings:` onward | `launcher.ts:716` and `:768` (TS) | the game's per-game log | CONDITIONAL: Rust writes the per-game log from 88.3 (D-29); re-check: the 88.3 live-gate plan, Task 1 |
| the known-fix lines (the fix applied, the overlay installed or present, the exe override named relative) | `knownFixLaunch.ts` and `knownFixOverlays.ts` (TS, `logInfo`/`logWarning`) | `gamelib.log` | CONDITIONAL: Rust emitters from sub-phase 88; the exe-override line names the relative override only; re-check: the 88.3 live-gate plan, Task 1 |
| the pre-launch and after-launch script lines (the script ran, its marker line) | `runBeforeLaunchScript` and `runAfterLaunchScript` in `launcher.ts` (TS) | the game's per-game log, plus `script-order.txt` as the ordering proof | CONDITIONAL: Rust runs the scripts from 88.3; the ordering proof does not depend on a log literal; re-check: the 88.3 live-gate plan, Task 1 |
| `refused a store write:` and `store frame rejected` (each must be ABSENT; playtime is written through the same store host) | `src-tauri/src/store_dispatch.rs` and `src-tauri/src/store_native.rs` per the 87 gate | `gamelib.log` as `[Shell]` | CONDITIONAL: 87's re-check confirmed the presence case logs; the 88.3 re-check confirms it still does at the shipped code |

## Structural Reachability Review

Authored by 88-01 on 2026-11-25 against the tree at HEAD `b74b86393`, before any Phase 88 code plan runs. REACHABLE means the
surface exists in current source (or is a shell command) and the gesture can be performed; CONDITIONAL means it depends on code a
later plan writes or on external state; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. Findings that changed the
contract are marked **amended** and are already applied above (items, run order, preflight). The seven defect-class tests
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2) are applied below.

### Test 1: origin and scheme reachability

| Item or sub-check | Surface it names | Verdict | Evidence |
|---|---|---|---|
| item 2 second Play | the `gamelib://launch/<runner>/<appName>` link | CONDITIONAL | the scheme is registered by the signed app (`src-tauri/tauri.conf.json:66-68`, `"schemes": ["gamelib"]`) and handled at `src/backend/protocol.ts:164-171`; it needs no network origin. It reaches the running signed instance only if no other bundle claims the scheme: P9 records the claimants, and a second one scores the half `blocked` |
| items 1 and 4 | no network call is required by any item; the known fix is read from `fixes/local/`, bundled `public/fixes/` or the fetched `fixes/` cache already on disk | REACHABLE | a remote fetch that fails is not a gate failure; no item needs an `http://` fixture or a DummyStore |

### Test 2: concurrency reachability

- Item 2's double Play needs two launches driven at once. A UI second press is impossible once the first is in flight (see Test
  7), so the second launch is the `gamelib://` link from the shell, which is a separate entry point and not a second modal
  gesture. The in-flight entry lives until the first launch settles (`src/backend/launchSingleFlight.ts:45-52`: the owner's
  promise is released on settle, and the owner's promise is the whole `launchEventCallback`), so the link can be opened at any
  point from Play press until the game exits and it joins; the contract opens it while the status is `launching`. **Amended** into
  the item 2 expected line and run order step 3.
- The quit dialog is modal to the main window. Nothing else is driven while it is up; the runner records the dialog's button
  response and dismisses it with the named button before the next gesture. The three quit presses (No, Esc, Yes) are sequential,
  never concurrent, and each is its own sub-observation.
- Item 3's `kill -9` and the reopen cannot overlap: the reopen starts only after P2's amended form holds (the reaper gone).
- No item needs a second window or a second app instance (P2, Evidence capture).

### Test 3: log-line emitter reachability, with the sink clause

See `## Required literals`: every row names its emitter at authoring (TypeScript, or none) and its sink, and every row is
CONDITIONAL because the Rust emitter is written by a later plan. Sinks: a signed build has no terminal, so there is no
transcript sink for app output. Rust shell lines reach `gamelib.log` as `[Shell]`, crate diagnostics reach `gamelib.log` under a
mapped prefix, sidecar `logInfo` lines reach `gamelib.log` as `[Backend]`, and the per-game log is a separate file written by
Rust; the contract archives both per launch, and reads each from its own file. One surface carries no log line at all: the quit
dialog is observed by the operator, never read from a log.

### Test 4: absence-observability

| Absence required | Kind | Why it can or cannot fail |
|---|---|---|
| Item 2: exactly one game process after the double Play | falsifiable | the process count by exe name is recorded before the link and after; a second launch would add a second process (and, with the joiner line absent, a second launch header in the per-game log) |
| Item 2: no after-launch script run at the quit (it runs at the next boot) | falsifiable | `script-order.txt` is counted before the quit and after the archive; a script run at quit adds a line in launch 3 where launch 4 is expected |
| Item 3: no further captured output after re-adoption | observation only, not scored | the 88 design says capture is not resumed (D-09); the absence is only meaningful if the game keeps printing after the kill, which the contract does not require, so it is recorded and never scored |
| Required literal `refused a store write:` / `store frame rejected` ABSENT | falsifiable | the presence case logs through `shell_log` (`store_dispatch.rs`, `store_native.rs`), pinned by the 87 gate's re-check; the 88.3 re-check confirms it at the shipped code |

### Test 5: requirement-interaction reachability

Reduction applied: every state-mutating step (M) against every evidence-bearing one (N), not the full cross product.
M = 8: (m1) installing the Phase 88 build over the baseline; (m2) the relaunch under `no-crossover.sb` and the later plain one;
(m3) item 2's quit No, Esc and Yes (Yes kills the game and marks its record quit-killed); (m4) item 3's `kill -9` of the app pid;
(m5) each launch's first write rotating `gamelib.log` to `.old`; (m6) each launch of a title rotating that title's per-game log;
(m7) attaching the P8 scripts through a title's Settings, and removing them; (m8) restoring from a P3 copy.
N = 6: (n1) the required literals in each `gamelib-launch-N.log`; (n2) each title's per-game log copy; (n3) the P4 bytes and the
save hashes; (n4) the process observations (pid, pgid, session, start time, count by name); (n5) the `notes.log` transcript;
(n6) `script-order.txt`.
**48 pairs considered** (8 x 6). Flagged pairs and their resolutions:

- F1: m3 x n6, n1. A quit-Yes defers the after-script to the next boot, so item 2's after-script line and its log line appear in
  launch 4's evidence, not launch 3's. Resolution: item 2's after-script half is scored from launch 4 (run order step 4), the
  result records both ordinals, and the line counts of `script-order.txt` are read before and after each step so item 3's own
  after-script is told from it by count and time.
- F2: m4 x n1. A `kill -9` ends `gamelib.log` mid-write, so the last lines before the kill may be absent. Resolution: no required
  literal is the last line before the kill; the kill's own evidence is the process table, not a log line.
- F3: m5 x n1. The reopen's first write rotates the killed launch's `gamelib.log` to `.old`. Resolution: the killed launch's log is
  archived immediately after the kill and before any reopen (run order step 4), and the reopen's `.old` is archived too.
- F4: m6 x n2. Relaunching the same title (items 2 and 3 may use one title; item 1's CrossOver title is item 3's) rotates its
  per-game log, and the re-adopted line may itself land in a rotated file (Required literals, row 2). Resolution: each title's
  per-game log is copied after every launch of it and before the next, and the item 3 result records the file the re-adopted line
  landed in and whether the original session's header is still readable.
- F5: m4 x n4. P2's "nothing left running" would fail on the very state item 3 needs (a live game and its wineserver).
  Resolution: P2 is amended for item 3's reopen only, asserting the GameLib processes are gone and expecting the game's.
- F6: m7 x n3. Attaching scripts changes the title's `GamesConfig/<app>.json`. Resolution: attached through Settings only (never
  by editing the file under a running app), and restored from the P3 copy with the app closed; the restore is step 6.
- F7: m1 x n1. The first Phase 88 launch rotates the baseline session's `gamelib.log`. Resolution: archived as
  `preexisting-gamelib.log*` before launch 1 (Evidence capture).
- F8: m2 x n5. Relaunching under a sandbox profile and then without it restarts the app. Resolution: every transcript write is
  `tee -a`, the delimiter carries the launch ordinal, and a bare `tee` or `>` redirect is forbidden.
- F9: m8 x everything. A restore overwrites what the items read. Resolution: it runs last, after every item is scored, and only on
  the operator's decision.

### Test 6: pre-existing external-state reachability

| Item | External state its premise depends on | Preflight or in-run confirmation |
|---|---|---|
| 1 (CrossOver half) | CrossOver installed, licensed and healthy, not a trial that has expired on this Mac | the positive observable is the baseline's own `engine=crossover ... reason=cx-healthy` line in the archived P5 launch and the game running; an expired trial scores the half `blocked` with the gap named |
| 1 (Staging half) | the pinned Wine-Staging engine installed under `tools/steam-engines/`, and a GPU able to run the named title with DXVK | P4 records `ls -la` of that directory as the positive observable; a missing pin would trigger a 228 MB download that item 1 does not exercise, so it scores the half `blocked` unless the operator re-seeds it from the 87 copy |
| 1 (all) | a title that prints output at start, so the per-game log can carry captured lines | P5: the operator names such a title for the native half; a silent title scores only the header and playtime parts |
| 2 | no other bundle claims the `gamelib` scheme; the named native title is not a Steam bridge title (bridge launches keep the D-15 interim and die on a quit) | P9 records the scheme claimants; P5 records the title's runner; the joiner line in the archived log is the in-run confirmation that the link reached the running instance |
| 3 | the app pid recorded is the app, not the reaper, the sidecar or the game; the game is a CrossOver title launched by Rust as a Game-class spawn; the killed launch is a Phase 88 launch | `shell-pid-4.txt` from the instance assertion, and `ps -o pid,pgid,sess,lstart,comm` of the app, the sidecar and the game before the kill: the game's pgid and session differ from the sidecar's (the positive observable that it is outside the reaper's group) |
| 3 | the Wine loader may already have exited by the time of the kill (Pitfall 10), so "the game's pid" may be a loader that is gone | the run records the game's processes by exe name and wineserver before the kill; item 3's "alive" means a recorded game process, or the recorded session, is alive after the kill |
| 4 | the named title's known fix is present (local, bundled or fetched) and its overlay is installable | the game page's GameLib fix row (`readGamelibFixStatus`) and `ls -la` of `fixes/local/` and `overlays/` in P4; no fix scores the half `blocked`, or the operator approves a local pair |

An emptied or missing app-side file never proves an absent state: the positive observable for "the game is running" is the process
table, for "no GameLib" the P2 `pgrep` lines, for "the fix is present" the directory listing.

### Test 7: UI-level reachability, distinct from backend reachability

Each gesture was traced to the component that renders its control, in the state the item assumes.

| Item | Gesture | Component and what it does in that state |
|---|---|---|
| 1, 2, 3 | press Play | the game page's Play control, `src/frontend/screens/Game/GamePage/index.tsx`; once clicked it latches (`playClickedLatch.ts`: `releasesPlayClicked` releases the latch on `launching` and `playing`, so while the latch is held and while the game is `launching` or `playing` the Play control is not a second press). **A UI double Play is therefore unperformable; amended**: the second Play of item 2 is the `gamelib://launch/<runner>/<appName>` link opened from the shell (`open`), which reaches `handleLaunch` in `src/backend/protocol.ts:155` |
| 2 | quit with a game running | the macOS app menu Quit or ⌘Q, which the 87 gate recorded as a clean quit path (`exit finished in 51 ms` on every launch); the dialog comes from `handleExit` (`quitHandler.ts:35`) and shows the game-running condition only after 88.2 writes it (CONDITIONAL, Required literals row 3). The window's red close button is not a quit gesture here and is not used |
| 2 | answer the dialog | the native message-box buttons No (index 0, `cancelId: 0`) and Yes; Esc and a window dismissal resolve to `cancelId` 0, which is why Esc is its own observation |
| 3 | `kill -9` the app, reopen | a shell command on a recorded pid (no UI), then `open /Applications/GameLib.app`; Playing is read from the game page and the library card (`src/frontend/screens/Library/components/GameCard/index.tsx`, `GamePage/index.tsx`), which render the `playing` status from the library state. The status is re-sent after `frontendReady` (RESEARCH Pitfall 9), so the item waits for the renderer to be up and reads the card, not a log line |
| 4 | attach the before and after scripts | the per-game Settings fields `BeforeLaunchScriptPath` and `AfterLaunchScriptPath`, `src/frontend/screens/Settings/sections/GamesSettings/index.tsx:338-339` (components under `Settings/components/`) |

### Defect-class notes the review forces onto the 88.3 plan

- Kill target (items 2 and 3): the contract names the app pid for `kill -9` and the game's tree for the quit-kill. The runner never
  signals the game, the sidecar or the reaper itself; a signal to a process the stamp has not proven is the very thing prohibition
  5 forbids of the product, and the gate holds itself to the same rule by using only the recorded pid.
- Renderer-ready ordering (item 3, RESEARCH Pitfall 9): the Playing state is read only after the renderer's listeners are mounted;
  an early read on a fresh window scores nothing.
- Wine-loader exit (item 3, RESEARCH Pitfall 10 and D-31): the CrossOver title is chosen on purpose, because the loader exits
  about a second after launch and leader-only matching would drop a live game; the item passes only when the live group or the
  recorded session is matched, not just the leader pid.

## Withdrawn from live scoring

- Windows and Linux for every item: no live gate is claimed (D-16). The golden replay, the three-OS stub-game smoke with single
  flight and quit-kill (88.2, 88.3) and Phase 99's real-title checks are the proof, and ROADMAP 88.3 success criterion 3 carries
  that wording.
- Bridge (Steam) launches: the 83 D-15 interim holds until 95 to 97, so no item scores a bridge title.
- Anti-cheat at launch: covered by goldens and Rust tests (no macOS-visible path found at authoring).
- `online_monitor.ts`, `connectivityNow.ts` and `gamedetails/` are not ported by Phase 88 (the funnel reads `EngineCtx.online`);
  nothing here scores connectivity.

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0
