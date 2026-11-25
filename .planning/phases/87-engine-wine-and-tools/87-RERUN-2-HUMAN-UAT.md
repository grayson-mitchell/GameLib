---
status: pending
phase: 87-engine-wine-and-tools
source: [87-CONTEXT.md D-06 D-11 D-12 D-13 D-19 D-21, 87-RERUN-1-HUMAN-UAT.md RF1 RF2 RF3 RF4 RF5 RF6]
authored_by: 87-71
run_by: 87-79
started:
updated:
---

This is re-run 2 of the D-11 live macOS gate for the Phase 87 gap closure (user decision 2026-11-25; D-06: gate findings are
fixed through gap plans, and nothing TypeScript is revived). Re-run 1 (`87-RERUN-1-HUMAN-UAT.md`, run by 87-69) scored items 1
and 7 issue and items 3 and 5 blocked, with findings RF1 to RF6; gap cycle 2 (87-72 to 87-77) fixes them and 87-78 builds the
signed gap build 2. This contract was authored by plan 87-71 before any cycle 2 fix is coded (D-21) and is run by plan 87-79
only: the plan that authors a contract never runs it (standing rule D-E). Nothing in this file has run. Rows that depend on code
written by 87-72 to 87-77 are CONDITIONAL and carry `re-check: 87-79 Task 1`: 87-79 re-greps each against the shipped gap
build 2 source before the first launch and resolves the row (REACHABLE, REACHABLE as amended, or IMPOSSIBLE, which is amended
and never scored). The gate is macOS only (D-13).

The gate touches real bottles, the operator's CrossOver licence, the Steam shortcut file and the profile. Nothing below edits
any of them without a `ditto` copy first (P3), the operator's recorded approval for the pin move, the Show in Steam add and the
uninstall, and a restore step the operator decides on afterwards. The operator names the titles in P5; Claude never picks a
bottle to destroy.

## Builds under test

- **Baseline (installed now):** the signed 0.13.1 build that 87-69 left in `/Applications/GameLib.app` (CDHash `266b7378...`,
  recorded in `87-VALIDATION.md` under `## Signed builds (D-12)`, `### Phase 87 gap build (87-68)`).
- **Gap build 2 (every item):** the signed and notarized Phase 87 gap build 2 that plan 87-78 records in
  `.planning/phases/87-engine-wine-and-tools/87-VALIDATION.md` under `## Signed builds (D-12)` as
  `### Phase 87 gap build 2 (87-78)`, with the line `Gate (gap build 2): ...` (version 0.13.2, from a `release/v0.13.2`
  branch). It is installed over the 0.13.1 build in the same path. Its identity (Identifier `com.gamelib.shell`, the Developer ID
  Application leaf, `TeamIdentifier=S7U223QWXJ`, the designated requirement) must equal the 0.13.1, 0.13.0 and Phase 86 records,
  so the Keychain ACL, the entitlements and the bottle markers apply unchanged. 87-79 reads the gate line for gap build 2 from
  that section and copies it into its pre-run record.
- **Deliberate choice:** the build also carries the Phase 88 and Phase 88.1 commits that are on main at its candidate head
  (Phase 88.1 executes in parallel). The gate scores Phase 87 items only; a defect that bisects to an 88.x commit is routed to
  that phase and does not score a Phase 87 item `issue`.
- **Deliberate choice:** the items re-run 1 passed (2, 4 and 6) are not re-scored; see `## Kept from re-run 1 and 87-59`.
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never exercises the signed app's entitlements or real `tar`, `wine`
  and `winetricks` spawns) or an unsigned build scores every item `blocked`, and nothing else stands in for it (D-12). All seven
  items run on the same signed gap build 2. macOS only (D-13).
- Launch ordinals below count launches of gap build 2 only. The 0.13.1 build's launches in P5 are not numbered.

## Deliberate behaviour changes

Each is one line, with its owning plan and decision. None is a regression when observed.

- The generic "might not work properly offline" warning is skipped when the engine will refuse the launch, with a fixed-text log
  line: 87-76 (RF5).
- A refused or failed launch ends its status and its display sleep blocker, and the game page shows Play again: 87-73 (RF2).
- CrossOver launches keep running: 87-77 fixes the cause 87-72 names (RF1).
- No uninstall-dialog close path reaches a game-page control, so Cancel changes nothing: 87-74 (RF3).
- A bottle-backed game on the shared default prefix reaches the bottle removal instead of being refused `is-protected-root`:
  87-75 (RF4, D-19).
- The bottle op's `in-use` and `unsafe-name` replies read as their own notice wording, not as `bad-reply`: 87-75 (RF6).

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found or absent, file names, hashes and
`~` paths only; never a token, a Keychain value, a full `args` line or the licence file's content.

- **P1** a new session directory, created once, under the session scratchpad and never a re-run 1 or 87-59 one
  (`gamelib-gate-87r1-2026-11-24T184311Z`, `gamelib-gate-87-2026-11-24T024510Z`):
  `S=<session scratchpad>/gamelib-gate-87r2-$(date -u +%Y-%m-%dT%H%M%SZ); mkdir -m 0700 -p "$S"`. Everything this contract copies
  or captures goes under `$S`. Captures are never committed.
- **P2** exactly one GameLib instance before every launch, and none while any file is copied or compared:
  `pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'` prints
  nothing before the launch. A leftover process is quit or killed by pid and the check re-run. Also assert `pgrep -fl wineserver`
  prints nothing for a gate bottle (a leftover one is stopped with that bottle's own `WINEPREFIX=<bottle dir> wineserver -k`, the
  form re-run 1's O3 measured, and the stop is recorded), and `pgrep -fl steam-bridge-helper-signin` prints nothing (re-run 1's
  O2 found one orphaned at P2; a leftover one is killed by pid and recorded).
- **P3** the copies, with the app closed (P2 first), before any item touches a file:
  - `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-before/"`
  - for each gate bottle the operator names in P5, including the bottle to be removed and the sibling's bottle:
    `ditto "$HOME/Library/Application Support/CrossOver/Bottles/<bottle>" "$S/bottles-before/<bottle>/"`
  - the pin directories before they are moved aside: `ditto <appFolder>/tools/steam-engines "$S/steam-engines-before/"`
  - the Steam shortcut file item 6 may change: found read-only under `~/Library/Application Support/Steam/userdata/*/config/`,
    then `ditto` the one `shortcuts.vdf` to `"$S/shortcuts-before/"` (file name and copy only; its content is never read out)
  - the CrossOver licence is existence only, never its content and never copied:
    `test -e "$HOME/Library/Preferences/com.codeweavers.CrossOver.license" && echo present || echo absent`. No item edits it.
  These copies are the restore path for every item.
- **P4** the baseline, recorded app closed and before gap build 2 is installed, saved to `"$S/baseline.txt"`:
  - for every gate bottle: `ls -la <bottle>`, the bytes of its `.gamelib-engine.json` (`cat`) and the first 20 lines of its
    `cxbottle.conf` (`head -20`);
  - `sibling-before.sha`, taken as 87-HUMAN-UAT.md P4 and re-run 1 P4 do:
    `find <sibling bottle> -type f ! -name system.reg ! -name user.reg ! -name userdef.reg -exec shasum -a 256 {} + | sort -k2 > "$S/sibling-before.sha"`.
    The three registry files are excluded by name because a wineserver rewrites them on any run; the exclusion is recorded in
    `notes.log`; the app is closed and P2 clean, so nothing else writes the bottle;
  - `store_cache/steam_engine_notices.json` and `store/wine-downloader-info.json` under the gamelib profile: `ls -la` and
    `shasum -a 256` of each;
  - the `shortcuts.vdf` of P3: `ls -la` and `shasum -a 256` only;
  - `ls -la <appFolder>/tools/steam-engines/` and `ls -la <appFolder>/tools/wine/` (the pin and the installed wine versions).
- **P5** the operator names the titles, and Claude records them in `notes.log` and starts nothing until they are named:
  - **(a)** the non-Steam CrossOver game with its own bottle (Trash Goblin, Epic, was used in re-run 1): items 1, 2, 3, 4 and 6;
  - **(b)** a sibling non-Steam game from a different store with its own bottle (Caravan SandWitch, Amazon, was used): items 3
    and 6;
  - **(c)** the game the operator agrees to uninstall together with its bottle, the agreement recorded; it may be (a), which
    then is uninstalled last, in item 6;
  - **(d) the launcher title for item 5, a hard preflight input.** The matcher (`launch/watch.rs`) compares a `ps` command line
    against the game's install directory in up to four forms (the unix path, the `Z:` form, the `Y:` form for installs under the
    home directory and the `C:` form for installs under the bottle's `drive_c`), keeps a trailing separator, and says in its own
    header that "a bare-basename launch (cwd plus `Game.exe`) cannot be matched". The non-Steam deadline (`launch/deadline.rs`,
    kind Notice) is a notice, never a kill, cancelled by the first match or by `launcher-exited`. So the 180 s notice fires only
    for a launch whose launcher process STAYS UP (otherwise `launcher-exited` cancels the deadline) and whose game process the
    matcher CANNOT see. The candidate rule, derived from those two files: an installed Windows non-Steam game on CrossOver whose
    configured launch executable is (1) a bare basename or relative path (the cwd supplies the directory, so no install path
    appears in the command line), or (2) a launcher stub that starts the real game from a directory outside the install
    directory, or (3) an executable outside the install directory's four forms. The read-only candidate procedure the runner
    uses, names only, never contents: list `GamesConfig/*.json` file names; for each installed game in the store records
    (`legendaryConfig/legendary/installed.json`, `gog_store/installed.json`, the nile and sideload records), print only the
    `appName`, the title, the install directory and the configured executable path (`jq -r` keys `title`, `install_path` or
    `install.install_path`, `executable`, `targetExe`), then mark each candidate by the three rules above. The operator picks one,
    or records "none", in which case item 5 scores `blocked` with the gap named (as re-run 1 did), but only after this procedure
    has listed the candidates and the list is in `notes.log`. If the held title's process IS matched inside 180 s, item 5 scores
    `blocked` (the premise failed), not `pass`;
  - **(e) the disabled-state game for item 7.** The runner lists, read-only from `GamesConfig/*.json` (keys and bottle names
    only, never values of other keys): installed Windows non-Steam games whose install directory exists on disk, whose stored
    `wineCrossoverBottle` differs from `per_game_bottle_name(runner, appName)` (`GameLib-<runner>-<encoded appName>`, from
    `game_engine.rs`; the dialog compares against the same engine value through `getPerGameBottleName`,
    `UninstallModal/index.tsx:114-124`) and whose stored `winePrefix` equals the default prefix. `disableDeleteWine` is true
    exactly then. Re-run 1 found none (Racine is missing on disk, Bloody Hell has its own prefix). If none exists now, the
    fallback surface is another disabled `ToggleSwitch` the operator can reach in a dialog (87-67 made the disabled style
    shared, so the same CSS class applies); item 7's Test 7 trace names the candidate (`UninstallModal`'s
    `uninstallsettingCheckbox` is never disabled, so the fallback is a disabled switch elsewhere in Settings), and the result
    records which surface was read. Without either, item 7 scores `blocked` with the gap named.
  With the 0.13.1 build installed and P2 clean, each named game is launched once so its bottle and marker exist before the
  upgrade (skipped when the bottle and a `kind=crossover` marker already exist, as in re-run 1); then the app is quit and P2
  re-run. P3 and P4 are taken AFTER P5.
- **P6** the network, for the offline steps only: the Wi-Fi interface is `en1` as re-run 1 measured (not `en0`); the runner
  re-reads it with `networksetup -listallhardwareports`, then uses `networksetup -setairportpower en1 off` and
  `networksetup -setairportpower en1 on` (or the Wi-Fi menu). Any offline step is off only for the one action it names: off,
  act, on, report (D-11). The operator needs the network to talk to Claude.
- **P7** the sandbox profile is copied into `$S` before use, unchanged:
  `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb` (denies reads
  of `/Applications/CrossOver.app`, so CrossOver reads as missing). A signed app launched from `/Applications` is started under
  it with `sandbox-exec -f "$S/no-crossover.sb" /Applications/GameLib.app/Contents/MacOS/gamelib-shell`, and the runner records
  the one resulting pid (P2 asserted first). The trial profile (`nolicence.sb`) is not used.
- **P8** before the first launch of gap build 2, run `codesign -dv --verbose=4 /Applications/GameLib.app` and
  `spctl -a -vv /Applications/GameLib.app`, and compare the Identifier, the Developer ID leaf, `TeamIdentifier` and the
  designated requirement with the `87-VALIDATION.md` record for gap build 2 and with the 0.13.1, 0.13.0 and Phase 86 records. A
  mismatch scores every item `blocked` (D-12).

## Tests

### 1. Offline refusal shows only the engine dialog, and the launch ends
expected: Under `no-crossover.sb` with the pinned engine absent and the app's connectivity monitor offline (network off only for the Play press), Play on the named game shows no generic "might not work properly offline" warning first, shows the modal refusal whose text reads "(offline)", attempts no download, and once the dialog is closed the game page shows Play again without leaving the page; gamelib.log carries the refusal's warning line, 87-76's skipped-warning line and a `Stopping Display Power Saver Blocker` line after the refusal.
result: pending

### 2. The generic offline warning still shows when the engine would launch
expected: With CrossOver healthy and the pin installed, network off only for the Play press, Play on the same game shows the generic offline warning; OK closes it, nothing launches and the game page shows Play again.
result: pending

### 3. CrossOver launches from GameLib keep running
expected: Two consecutive Play presses on the named game, each logged `engine=crossover` with `reason=cx-healthy`, keep its game process for at least 60 s with no `cancelled (launcher-exited)` deadline line for that launch before the operator ends it, and one launch of the sibling does the same.
result: pending

### 4. Stop ends a non-Steam game on CrossOver
expected: Stop from the game page of the running named game ends it, and within 15 s no game process and no wineserver for its bottle remain.
result: pending

### 5. The 180 s no-match notice does not raise the window
expected: The P5 (d) title held past 180 s, with the operator watching which application is frontmost, shows the system notification and the in-app notice without raising GameLib's window, and gamelib.log carries the deadline-fired line and the notice line with `raise=false`.
result: pending

### 6. Cancel changes nothing, and removing a game's bottle leaves its sibling byte-identical
expected: With the named game's Show in Steam switch on, Cancel in its uninstall dialog leaves the switch on and logs no Steam shortcut removal; then, with the bottle toggle on, the uninstall removes that game's own bottle and nothing else, with no protected-root refusal, so the sibling's bottle, marker and files equal the P4 record.
result: pending

### 7. The disabled bottle toggle is legible in three themes
expected: The uninstall dialog of the P5 (e) game shows the bottle toggle disabled with the default-prefix note, and the operator reads its label and box as legible in Midnight Mirage, Gruvbox Dark and Dracula.
result: pending

## Run order

P1, P2, P5, P3, P4, P6, P7 with the 0.13.1 build installed; then install gap build 2 over it (same path, identities matched per
`## Builds under test`); then P8. Then:

1. **Launch 1, plain.** Item 3 first: the named game, Play, process capture at 10 s and 60 s; ended by the operator; Play again,
   captures again, and this second run is carried into item 4's Stop; then the sibling once, captures, ended by Stop. Item 4:
   Stop on the second named-game run, then the 15 s process check. Then item 2: network off only for the Play press (off, press
   Play, read the warning, OK, on, report). Item 5 last (the 180 s hold of the P5 (d) title, the operator watching the frontmost
   application), with no other game, dialog or notice open. Quit; archive the logs.
2. **Launch 2, under `no-crossover.sb`, with the pin moved aside** (the P3 `ditto` copy first, the operator's approval recorded):
   item 1 only (network off only for the Play press, then on, then report). Network back on; quit; archive the logs; the pin
   moved back from `$S/pin-aside/` with the operator's approval and listed with `ls -la`.
3. **Launch 3, plain.** Item 7 first (themes selected one at a time; the dialog opened for the P5 (e) game and cancelled each
   time), then item 6: the Show in Steam switch state recorded (turned on with the operator's approval if off), Cancel in the
   dialog, then the removal with the bottle toggle on. Quit. P2 re-run clean, the sibling compare app closed (`sibling-before.sha`,
   marker, `ls -la`), before any other launch.
4. **Restores** from the P3 copies only on the operator's decision, after every item is scored (the item 6 bottle is gone by
   design and is restored from `bottles-before/` only if the operator wants the game back).

## Kept from re-run 1 and 87-59

These results are not re-run and keep their earlier scores unchanged (`87-RERUN-1-HUMAN-UAT.md`, scored 2026-11-25 by 87-69;
`87-HUMAN-UAT.md`, scored 2026-11-24 by 87-59).

- **Re-run 1 item 2 (engine lines reach gamelib.log, redacted):** pass. 12 download, verify and extract lines and 4
  `[engine-notice]` lines; 148 engine-origin lines carry 0 home paths, 0 account names, 0 argument lines and 0 tokens.
- **Re-run 1 item 4 (Winetricks on the game's own bottle):** pass. `fontsmooth=bgr` landed in the bottle's own `winetricks.log`;
  `Prefixes/shared` was not created; the offline `tahoma` verb ended "install failed".
- **Re-run 1 item 6 (wine manager installs a never-installed release):** pass. Wine-11.18 installed and removed, and the row
  followed both; 0 `installWineVersion` IPC rejections; the DXMT skip line logged once.
- **Item 1 (a) healthy CrossOver (87-59):** MET. launch 1: `engine=crossover build=26.3.0.39832 reason=cx-healthy` for Trash Goblin (Epic) and Avernum 6 (bridge), no toast or dialog.
- **Item 1 (b) the no-CrossOver fallback (87-59):** MET. under `no-crossover.sb` the pinned Wine-Staging 11.20 downloaded in about 12 s with progress, `reason=cx-missing`, toast, badge and DXVK on Avernum 6 and Trash Goblin.
- **Item 1 (c) the re-adopt (87-59, re-confirmed by re-run 1 launch 3):** MET. marker back to crossover, `saveinfo.dat` sha256 `7eb70257...` identical before and after.
- **Item 2 (expired trial routes to Staging) (87-59):** pass. 5-day notice with Buy CrossOver, `reason=cx-expired` routing, toast, badge, Staging wineserver, licence untouched, Isaac's bottle restored.
- **Item 3 reuse half (87-59):** MET. a second launch reused its bottle: marker, `cxbottle.conf`, birth time and the 46 bottle directories unchanged, no new bottle created.
- **Item 4 (d) DXVK install and restore (87-59):** blocked by design. the per-game DXVK toggle is hidden for bottle-backed games (`GamesSettings/index.tsx:276`).
- **Item 4 (e) DXMT (87-59):** blocked by the missing exports. `Wine-11.21`'s `winemac.so` has 0 `macdrv` exports, so no `-DXMT` copy can be made; the skip line scored it in re-run 1.
- **Re-run 1 item 1, the refusal half:** the refusal itself, its "(offline)" text, the `offline gate:` line with `verdict=blocked:crossover-missing` and no download were MET; item 1 here re-scores the half that was not (the launch ending, RF2) and the generic warning (RF5).
- **Re-run 1 item 7, the removal premise:** the dialog toggle naming the bottle, enabled, with the risk warning, and the sibling's bytes after a refused removal (1902 files, 0 diff lines) were MET; item 6 here re-scores the removal itself (RF4) and Cancel (RF3).

## Evidence capture

The dual-sink standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3), adapted
to a signed app launched from `/Applications`, as 87-HUMAN-UAT.md and re-run 1 applied it. A signed release build has no
`pnpm tauri:dev` terminal, so there is no `terminal.log` sink: every shell and sidecar line reaches
`~/Library/Logs/GameLib/gamelib.log` (shell lines as `[Shell]`, sidecar lines as `[Backend]`, renderer lines as `[Frontend]`),
and the sidecar's `console.*` and stderr reach nothing. The transcript is `$S/notes.log`, which the operator and runner write by
hand; nothing below asks the transcript for an app log line.

- One session directory (P1), created once with mode 0700, never reused across runs and never an earlier gate's. Captures are
  never committed, and each result carries `~` paths, hashes and counts only (T-87-135).
- The transcript is appended, never truncated: every write to `$S/notes.log` is `tee -a`, never a bare `tee` and never `>`.
- Before each launch write the delimiter, exactly, as its own command:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`). `N` counts launches of gap build 2 from 1.
- One app instance, asserted before each launch (P2). After the window appears record the instance count with the reaper
  excluded: `ps -axo pid,ppid,args | grep 'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep`
  must print exactly one line; write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is not 1 the
  launch is ABORTED and re-run: its evidence is not scorable. Under a sandbox profile the instance is the one `sandbox-exec`
  started, and the same count applies.
- After each launch quits, and BEFORE the next launch starts, archive the logs while they exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and, if `gamelib.log.old` exists,
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old`. Before the first gap build 2 launch also copy the 0.13.1 session's `gamelib.log` and `.old`
  into `$S` as `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
- **Item 3's process evidence.** At 10 s and at 60 s after each Play, capture the game's exe and its bottle's wineserver:
  `ps -axo pid,ppid,command | grep -iE '<game exe name>|wineserver' | grep -v grep`, written to `notes.log` as process names,
  counts and `~` paths only (a command line is reduced to its executable name and a count before it is written; never the
  arguments).
- Every result records the launch ordinal that covered it, so a reader can find its `gamelib-launch-N.log` and its `notes.log`
  section.
- A game's own output (the save file, the bottle) is evidence by `shasum -a 256` and `ls -la` recorded in `notes.log`, never by a
  paste of content. **Never paste a matched log line into `notes.log` or a result; record counts, timestamps and hashes only.**
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run, and then the
  restore of P3 for whatever the operator chooses to restore, with the post-restore `shasum -a 256` against the `*-before`
  copies. The captures hold account data and paths, stay under `$S` and are deleted by the operator after Phase 87 is verified.

## Required literals

Sinks are `gamelib.log` unless stated. Authored by 87-71 at HEAD `df0a29cd9`, before 87-72 to 87-77 are coded. Rows whose emitter
or control a gap cycle 2 plan writes are CONDITIONAL with `re-check: 87-79 Task 1`: 87-79 re-greps each against the gap build 2
source (`release/v0.13.2`) before the first launch. For each ABSENT row the presence case is named, and the emitter was
confirmed to exist at HEAD so the absence stays falsifiable.

| Literal | Emitter | Sink | Status |
|---|---|---|---|
| `Engine: <key> launch blocked before pre-flight while offline (<arm>)` (the refusal's WARNING line, item 1) and `Engine: <key> offline gate: ... verdict=blocked:crossover-missing` (the gate's reading line) | `launch/step.rs` (`step.warn`, `offline_gate_line`), re-run 1 resolved both REACHABLE as amended | `gamelib.log` as `[Shell]` | REACHABLE (re-run 1 launch 2 emitted both; re-run 1 resolved them) |
| `[engine-notice] key=<k> tag=engine-download-failed ... display=pending`, then `display=confirmed` or `display=unconfirmed` (the refusal's display lines, item 1) | `launch/dialogs.rs:188` (pending) and `settled_line` (`:71`) | `gamelib.log` as `[Shell]` | REACHABLE (re-run 1 launch 2) |
| `Stopping Display Power Saver Blocker` after a refused launch (item 1) | `launcher.ts:442` (`logInfo`), reached on the refused path only after 87-73 ends it | `gamelib.log` as `[INFO] [Backend]` | CONDITIONAL on 87-73; `re-check: 87-79 Task 1` |
| 87-76's fixed-text skipped-warning line, its exact text left for the re-check (item 1) | the TS renderer or backend path 87-76 adds beside `launch()` in `helpers/library.ts` | `gamelib.log` as `[Frontend]` or `[Backend]` | CONDITIONAL on 87-76; `re-check: 87-79 Task 1` |
| the generic offline warning (item 2): the dialog text "This game might not work properly offline. Do you want to play anyway?" | `launch()` in `helpers/library.ts:258-273` | an observation row (a renderer dialog; no log line) | REACHABLE as an observation; its presence is read by the operator, and it is item 1's presence case |
| `engine=crossover` with `reason=cx-healthy` (item 3) | the engine's selection line (`engine=<id> ... reason=<reason>`), seen in re-run 1 launches 1 and 3 | `gamelib.log` as `[Shell]` | REACHABLE (re-run 1) |
| **ABSENT** `Engine: launch deadline for key <k> cancelled (launcher-exited)` within 60 s of a Play in item 3. The plan text spelled the literal `launch deadline cancelled (launcher-exited)`; the emitter's real text is `Engine: launch deadline for key {key} cancelled ({reason})` (`launch/deadline.rs:195`), so the grep is `cancelled (launcher-exited)` | `deadline::cancel`, `launch/deadline.rs:195`, reason `launcher-exited` | `gamelib.log` as `[Shell]` | CONDITIONAL on 87-77; `re-check: 87-79 Task 1`. Presence case: re-run 1 launch 1 logged 7 of them |
| `Engine: <key> launch deadline fired (` and `Engine: <key> launch deadline notice surface=in-app pushed=<b> raise=false`, plus `[engine-notice] key=<k> tag=launch-deadline-unconfirmed dispatched=notify raise=false` (item 5) | `launch/deadline.rs:250` and `:288`, `launch/dialogs.rs:207` | `gamelib.log` as `[Shell]` | REACHABLE as amended in re-run 1 (the `fired for key` line at `deadline.rs:223` has no `(` and is not counted) |
| `Removed the game bottle` (`[INFO] [Backend]`, `utils/uninstaller.ts`) and the engine's `removePerGameBottle: ...` warn lines (`bottles/remove_per_game.rs`, `[WARNING] [Shell]`) (item 6) | 87-70's `removeOwnBottle` and 87-66's engine op, re-run 1 resolved REACHABLE as amended; the route moves with 87-75 | `gamelib.log` | CONDITIONAL on 87-75 (the route's order changes); `re-check: 87-79 Task 1` |
| **ABSENT** the uninstall's `is-protected-root` refusal for the named game (`[safety] uninstall refused: is-protected-root`) (item 6) | the D-14 pre-flight in `utils/uninstaller.ts`; the `is-protected-root` reason string exists at HEAD in `utils/uninstaller.ts` and `components/UI/RemovalRefusedNotice` | `gamelib.log` as `[Backend]` | CONDITIONAL on 87-75; `re-check: 87-79 Task 1`. Presence case: re-run 1 launch 4, 19:20:22Z |
| **ABSENT** a Steam shortcut removal line during item 6's Cancel (`was successfully removed from Steam` and the image removal, `[Shortcuts]`) | `gamelib-shortcuts` `steam/mod.rs:460` (the message text); the emitter exists at HEAD | `gamelib.log` as `[Shell]` or `[Backend]` | CONDITIONAL on 87-74; `re-check: 87-79 Task 1`. Presence case: re-run 1 launch 4 at 19:16:59Z |

Observation rows (no log line; scored by the operator's report, with the matching file state): the refusal dialog text
"(offline)" and the absence of the generic warning before it (item 1); the game page showing Play again after the dialog closes
(item 1, 2); the system notification and the in-app notice at 180 s and which application is frontmost (item 5); the Show in
Steam switch's state before and after Cancel (item 6); the disabled bottle toggle's label and box in three themes (item 7).

## Structural Reachability Review

Authored by 87-71 on 2026-11-25 against the tree at HEAD `df0a29cd9`, before any cycle 2 fix is coded. REACHABLE means the surface
exists in current source and the gesture can be performed; CONDITIONAL means it depends on code a later plan writes (87-73 to
87-77) or on external state; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. Every CONDITIONAL row carries
`re-check: 87-79 Task 1`. Each of the seven defect-class tests
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2) is applied below to every item,
sub-check and precondition.

### Test 1: origin and scheme reachability

| Item or sub-check | Origin | Verdict | Evidence |
|---|---|---|---|
| 1 (the refusal) | none: the refusal fires before any request | REACHABLE | re-run 1 launch 2 refused with 0 `Engine: downloading` lines |
| 2 (generic warning) | none | REACHABLE | a renderer dialog before any request |
| 3, 4 (CrossOver launches, Stop) | none | REACHABLE | local process control |
| 5 (180 s hold) | none | REACHABLE | the title's own launch |
| 6 (Cancel, removal), and the pin move-back | none, except the Show in Steam add (a local `shortcuts.vdf` write) and the pin move-back (a local copy) | REACHABLE | no `http://` fixture, no DummyStore |
| 7 (themes) | none | REACHABLE | local UI |

No item uses a local fixture, a DummyStore or an `http://` origin, so there is nothing for an https-only gate to reject.

### Test 2: concurrency reachability

| Item or sub-check | Concurrency premise | Verdict | Evidence |
|---|---|---|---|
| 3 | two Play presses and the sibling never overlap: each run is ended (by the operator, then by Stop) before the next starts | REACHABLE | the run order in `## Run order`, launch 1 |
| 2 | the generic warning is application-modal and is dismissed (OK) before item 5 | REACHABLE | a modal blocks the window, so nothing else is driven while it is up |
| 4 | Stop is pressed only after the game is matched and `is.playing` is true | REACHABLE | `MainButton.tsx:109` |
| 5 | last in launch 1: no other game, dialog or notice is open, so nothing else can raise the window during the observation | REACHABLE | item 5 is placed after items 3, 4 and 2 |
| 7 before 6 | item 7 (themes, dialog cancelled) precedes item 6 (destructive) | REACHABLE | the run order, launch 3 |
| 1 | the refusal dialog is dismissed before the pin is moved back | REACHABLE | launch 2 holds item 1 only |

### Test 3: log-line emitter reachability, with the sink clause

| Literal | Emitter | Sink chain | Verdict |
|---|---|---|---|
| offline refusal warn and `offline gate:` reading | `launch/step.rs` | `ctx.log` -> `ShellEngineLog` -> redactor -> `shell_log_at` -> `gamelib.log` as `[Shell]` | REACHABLE (re-run 1) |
| `[engine-notice] ... display=` lines | `launch/dialogs.rs:188`, `:71` | same chain | REACHABLE (re-run 1) |
| `Stopping Display Power Saver Blocker` | `launcher.ts:442` | `logInfo` -> the RPC `log` frame -> `gamelib.log` as `[Backend]` | CONDITIONAL on 87-73 (the refused path reaches it after the fix) |
| 87-76's skipped-warning line | 87-76's line, location unknown until written | renderer `[Frontend]` or backend `[Backend]`, both into `gamelib.log` | CONDITIONAL on 87-76 |
| `engine=crossover ... reason=cx-healthy` | the engine selection line | `[Shell]` chain | REACHABLE (re-run 1) |
| `cancelled (launcher-exited)` (absent) | `launch/deadline.rs:195` | `[Shell]` chain | CONDITIONAL on 87-77 |
| deadline fired and notice (`raise=false`) | `launch/deadline.rs:250`, `:288`; `launch/dialogs.rs:207` | `[Shell]` chain | REACHABLE as amended (re-run 1) |
| `Removed the game bottle`, `removePerGameBottle:` | `utils/uninstaller.ts`; `bottles/remove_per_game.rs` | `[Backend]` or `[Shell]` | CONDITIONAL on 87-75 |
| `is-protected-root` (absent) | `utils/uninstaller.ts` | `[Backend]` | CONDITIONAL on 87-75 |
| Steam shortcut removal (absent) | `gamelib-shortcuts` `steam/mod.rs:460` | `[Shell]` or `[Backend]` | CONDITIONAL on 87-74 |

A signed build has no terminal sink, so every required line is read from the archived `gamelib-launch-N.log`, never from the
transcript and never from the sidecar's stdout. The surfaces that carry no log line at all (the generic warning dialog, the
fallback toast, the 180 s notification and notice, the switch state, the theme legibility) are read by observation.

### Test 4: absence-observability

| Absence required | Kind | Presence case that proves the absence is falsifiable |
|---|---|---|
| Item 1: no generic offline warning before the refusal | falsifiable | item 2 in the same build shows the generic warning when the engine would launch, so a regression that restored it would be seen in item 1 as the dialog appearing first |
| Item 1: no download attempted in the refusal | falsifiable | the `tools/steam-engines/` listing before and after (no `.tmp-*`), and re-run 1's launch 2 shows the three download lines when the network is on |
| Item 3: no `cancelled (launcher-exited)` line within 60 s of a Play | falsifiable | re-run 1 launch 1 logged 7 of them on 0.13.1; the emitter `deadline.rs:195` exists at HEAD. The window is Play to 60 s by timestamp: Stop and a normal exit legitimately cancel later |
| Item 4: no game process and no wineserver for the bottle within 15 s of Stop | falsifiable | the `ps` capture taken before Stop shows both present |
| Item 5: the 180 s notice does not raise the window | falsifiable only with the focus observation | the operator reports the frontmost application across the whole 180 s; the presence case is observable because `showEngineDialog` calls `raiseMainWindow()`, so a notice routed through it would raise the window and be seen |
| Item 6: no Steam shortcut removal line during Cancel | falsifiable | re-run 1 launch 4 logged the removal at 19:16:59Z; the emitter `steam/mod.rs:460` exists at HEAD |
| Item 6: no `is-protected-root` refusal for the named game | falsifiable | re-run 1 launch 4 logged it at 19:20:22Z; the reason string exists in `utils/uninstaller.ts` at HEAD |
| Item 6: the sibling's bottle, marker and files untouched | falsifiable | `find ... -exec shasum` against `sibling-before.sha` (registry files excluded by name), the sibling's `.gamelib-engine.json` bytes and `ls -la`; a removal that reached the sibling changes at least one of them |

### Test 5: requirement-interaction reachability

Reduction applied: every state-mutating step (M) against every evidence-bearing one (N), not the full cross product.
M = 11: (m1) installing gap build 2 over 0.13.1; (m2) the sandboxed relaunch and the plain relaunches (three launches in all);
(m3) network off for item 1's Play press; (m4) network off for item 2's Play press; (m5) the pin move aside and back; (m6) the
Show in Steam add; (m7) the uninstall with bottle removal; (m8) each launch's log rotation to `.old`; (m9) a P3 restore;
(m10) Stop (item 4), which ends the bottle's wineserver; (m11) item 5's 180 s hold, which leaves a game running.
N = 7: (n1) each required literal in each `gamelib-launch-N.log`; (n2) the P4 bytes (markers, `cxbottle.conf` head,
`steam_engine_notices.json`, `wine-downloader-info.json`, `shortcuts.vdf`'s hash, the `tools/` listings); (n3)
`sibling-before.sha`; (n4) the `ps` captures of item 3; (n5) the `tools/steam-engines/` listings; (n6) `notes.log`; (n7) the
focus observation.
**77 pairs considered** (11 x 7). Eleven flagged pairs, each with its resolution:

- F1: m8 x n1. Each launch's first write renames the previous `gamelib.log`. Resolution: each launch's log and `.old` are archived
  before the next launch starts (`## Evidence capture`).
- F2: m1 x n1. The first gap build 2 launch rotates the 0.13.1 session's log to `.old`. Resolution: the 0.13.1 session's logs are
  archived as `preexisting-gamelib.log*` before the first launch.
- F3: m2 x n6. A relaunch under a sandbox profile, then without it, restarts the app. Resolution: every transcript write is
  `tee -a`, the delimiter carries the launch ordinal, and a bare `tee` or `>` redirect is forbidden.
- F4: m3, m4 x n1, n5. Network off must not fall inside another action's evidence. Resolution: off only for the one action it
  names (off, act, on, report); item 1's off is the only network action of launch 2; item 2's off is its own Play press in launch
  1 and ends before item 5 starts.
- F5: m5 x n2, n5. Moving the pin aside changes `tools/steam-engines/`, which P4 recorded. Resolution: the P3
  `steam-engines-before` copy is the before; item 1 is scored against the listing, not against P4 bytes; the move-back is the
  operator's approved step and is listed with `ls -la`.
- F6: m10 x n4. Stop ends the wineserver whose process the `ps` captures read. Resolution: item 3's 10 s and 60 s captures are
  taken before the run is ended or Stopped; item 4's check is the capture after Stop.
- F7: m11 x n7. The 180 s hold leaves a game running that could itself raise or cover the window. Resolution: item 5 is last in
  launch 1; every earlier game is ended and every dialog dismissed; the operator records the frontmost application at the start
  and across the hold.
- F8: m7 x n3. Any launch after the removal could rewrite the sibling's registry or marker. Resolution: the sibling compare is
  taken immediately after launch 3 quits, with the app closed and P2 clean, before any other launch.
- F9: m6 x n2. The Show in Steam add rewrites `shortcuts.vdf`, which P4 hashed. Resolution: the P3 `shortcuts-before` copy is the
  before; item 6 scores the switch state and the log lines, and the hash is compared before the add and after Cancel, so Cancel
  leaves the file equal to its after-add value.
- F10: m10 x n1. Stop and a normal exit legitimately cancel the deadline with other reasons. Resolution: item 3's absence window
  is Play to 60 s by timestamp, and only the `launcher-exited` reason is scored.
- F11: m9 x everything. A restore overwrites what the items read. Resolution: it runs last, after every item is scored, and only
  on the operator's decision.

### Test 6: pre-existing external-state reachability

| Item | External state its premise needs | Positive observable, preflight or in-run |
|---|---|---|
| 1 | the pinned engine absent from `<appFolder>/tools/steam-engines/`; CrossOver missing to the app (the sandbox); the app's connectivity monitor offline | pin absent by `ls -la` after the move aside (a P4 listing alone does not prove it); CrossOver missing by the refusal's own `crossover-missing` arm; the monitor offline by the `Connectivity: ... offline via` line in `gamelib.log` before Play (the interface being off is not proof the monitor saw it) |
| 2 | CrossOver healthy; the pin installed; the monitor offline for the Play press | `reason=cx-healthy` in the launch's engine line; the pin present by `ls`; the `offline via` line before Play |
| 3 | CrossOver healthy; the named game and the sibling installed with their own bottles | `reason=cx-healthy` on each Play; the bottle directory present by `ls`; the game process in `ps` at 10 s |
| 4 | the named game running and matched on CrossOver, in its own bottle | the game process in `ps` and the bottle's wineserver in `pgrep -fl wineserver` before Stop; a game that exited by itself scores `blocked` |
| 5 | a title whose game process the matcher cannot see and whose launcher stays up | the P5 (d) procedure's list and the operator's pick; the title's launcher still running at 60 s; a title that is matched inside 180 s scores `blocked` with the gap named |
| 6 | the named game's stored `wineCrossoverBottle` equals its per-game name; the Show in Steam switch can be turned on; the sibling's bottle present | the dialog's toggle names the bottle (read before anything is removed); the switch's `aria-checked` state read by the operator; the bottle directory exists by `ls`; `sibling-before.sha` exists |
| 7 | an installed game on the default prefix with a different or absent `wineCrossoverBottle` | the P5 (e) procedure's list; the disabled toggle and the default-prefix note read in the dialog; if none exists, the fallback surface named in P5 (e) |

An emptied app-side store never proves an absent state: the positive observable for the pin is the directory listing, for the
network the app's own `offline via` line, never the Wi-Fi menu alone.

### Test 7: UI-level reachability, distinct from backend reachability

Each gesture was traced to the component that renders its control, in the state the item assumes.

| Item | Gesture | Component and what it does in that state | Verdict |
|---|---|---|---|
| 1 | press Play offline; read the modal refusal and then the Play button | `MainButton.tsx` (Play); `launch()` in `helpers/library.ts:258-273` shows the generic warning when `notPlayableOffline`, which 87-76 skips when the engine will refuse; the refusal is the engine dialog; the button state is the page's `playClicked` latch (RF2) that 87-73 fixes | CONDITIONAL on 87-73 and 87-76; `re-check: 87-79 Task 1` |
| 2 | press Play offline with CrossOver healthy, read the warning, OK | the same `launch()` warning, unchanged for a launch the engine would allow | REACHABLE (presence case) |
| 3 | press Play twice, then the sibling | `MainButton.tsx` Play; the launch path is 87-77's | CONDITIONAL on 87-77; `re-check: 87-79 Task 1` |
| 4 | press Stop on the running game | `MainButton.tsx:109` renders Stop while `is.playing`; 87-65 routes a CrossOver overlay's Stop to the bottle's wineserver | REACHABLE |
| 5 | watch the notice at 180 s | the system notification from the shell and the in-app notice `SteamEngineLaunchNotice` | REACHABLE |
| 6 | open the Install tab's Show in Steam row, turn it on; open the uninstall dialog; Cancel; open it again; bottle toggle on; confirm | `InstallTab/IntegrationRows.tsx` (the Show in Steam `SwitchRow`) and `UninstallModal/index.tsx` (the footer at its bottom holds Confirm `uninstallGame` and Cancel `onClose`; the toggle `uninstallCheckbox` named by `bottleName`); the close paths and the stray activation of the Steam row are 87-74's | CONDITIONAL on 87-74 and 87-75; `re-check: 87-79 Task 1` |
| 7 | select a theme in app Settings; open the uninstall dialog of the P5 (e) game; read the disabled toggle and note | `UninstallModal/index.tsx:278-298` (`ToggleSwitch ... disabled={disableDeleteWine}`) and the `default-wine-warning` note `:308`; `disableDeleteWine` is true only when `perGameBottle` is empty and the stored prefix equals the default (`:130-134`) | REACHABLE when P5 (e) names a game; otherwise the named fallback |

The themes for item 7's legibility check are Midnight Mirage, Gruvbox Dark and Dracula, each selected before the dialog is
opened.

## Withdrawn from live scoring

- Windows and Linux for every item: no live gate is claimed (D-13). CI goldens on the three-OS matrix are the proof, and the live
  check rides with Phase 99.
- RF6's `in-use` and `unsafe-name` notice wording: a live in-use refusal would uninstall the game and strand its bottle, so
  87-75's unit tests are the proof.
- DXVK install and restore on a bottle-backed game: hidden by design (`GamesSettings/index.tsx:276`), kept blocked as in 87-59.
- A `-DXMT` copy while no feed's `winemac.so` exports the macdrv metal-view symbols (re-run 1 item 6 scored it on the skip line).
- GPTK and bottled Steam as engines (D-20): not engines the engine step selects, so no item scores them.

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0
