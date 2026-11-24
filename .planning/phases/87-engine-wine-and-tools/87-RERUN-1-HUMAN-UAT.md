---
status: pending
phase: 87-engine-wine-and-tools
source: [87-CONTEXT.md D-06 D-11 D-12 D-13 D-19 D-21, 87-HUMAN-UAT.md F1 F2 F3 F4 F5]
authored_by: 87-60
run_by: 87-69
started:
updated:
---

This is re-run 1 of the D-11 live macOS gate for the Phase 87 gap closure. The 87-59 run scored item 1 issue, item 3 blocked
and item 4 issue, with five findings (F1 to F5) and the deferred engine-log gap. On 2026-11-24 the user decided to fix all of
them inside Phase 87 and to re-run the affected halves on a new signed build (D-06: gate findings are fixed through gap
plans, and nothing TypeScript is revived). This contract was authored by plan 87-60 before any gap fix is coded (D-21) and is
run by plan 87-69 only: the plan that authors a contract never runs it (standing rule D-E). Nothing in this file has run.
Rows that depend on code written by 87-61 to 87-67 or 87-70 are CONDITIONAL and carry `re-check: 87-69 Task 1`: 87-69 re-greps
each against the shipped gap code before the first launch and resolves the row (REACHABLE, REACHABLE as amended, or
IMPOSSIBLE, which is amended and never scored). The gate is macOS only (D-13).

The gate touches real bottles, the operator's CrossOver licence and the profile. Nothing below edits any of them without a
`ditto` copy first (P3), the operator's recorded approval for the pin move and the uninstall, and a restore step the operator
decides on afterwards. The operator names the titles in P5; Claude never picks a bottle to destroy.

## Builds under test

- **Baseline (installed now):** the signed 0.13.0 build that 87-59 left in `/Applications/GameLib.app` (CDHash
  `18d7ea76c1f0758325b0976c643496d28c3b861d`, recorded in `87-VALIDATION.md` under `## Signed builds (D-12)`, "Phase 87 build
  (87-59, 2026-11-24)").
- **Gap build (every item):** the signed and notarized Phase 87 gap build that plan 87-68 records in
  `.planning/phases/87-engine-wine-and-tools/87-VALIDATION.md` under `## Signed builds (D-12)` (version 0.13.1, from a
  `release/v0.13.1` branch). It is installed over the 0.13.0 build in the same path. Its identity (Identifier
  `com.gamelib.shell`, the Developer ID Application leaf, `TeamIdentifier=S7U223QWXJ`, the designated requirement) must equal
  the Phase 86 and 0.13.0 records, so the Keychain ACL, the entitlements and the bottle markers apply unchanged. 87-69
  reads the gate line for the 0.13.1 build from that section and copies it into its pre-run record.
- **Deliberate choice:** the upgrade-from-86 survival is not re-scored. 87-59's item 3 reuse half proved that the signed
  upgrade kept bottles and markers, and its result is kept (see `## Kept from 87-59`).
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never exercises the signed app's entitlements or real `tar`,
  `wine` and `winetricks` spawns) or an unsigned build scores every item `blocked`, and nothing else stands in for it (D-12).
  All seven items run on the same signed gap build.
- Launch ordinals below count launches of the gap build only. The 0.13.0 build's launches in P5 are not numbered.

## Deliberate behaviour changes

Each is one line, with its owning plan and decision. None is a regression when observed.

- Engine and wine crate lines now reach `gamelib.log` as `[Shell]` lines, after redaction (home as `~`, no account name, no
  token, no full argument line): 87-61, the user's 2026-11-24 redacted-lines decision.
- The offline refusal fires before any download when no branch of the launch can start: 87-63 (F1).
- Winetricks and Stop act on the game's own CrossOver bottle, not the stored shared prefix, and a Winetricks failure shows:
  87-64 and 87-65 (F3, the user's decision 4).
- A never-installed wine-manager entry installs (absent `isInstalled`, `hasUpdate` and `installDir` decode as defaults), and the
  Wine Manager list follows an install or remove without a restart: 87-62 (F2, F4).
- The uninstall dialog can remove a non-Steam game's own per-game bottle through `gamelib-safety`, naming that bottle, and the
  disabled toggle is legible: 87-66 (op), 87-70 (route), 87-67 (dialog), D-19 (F5, the user's decision 5).

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found or absent, file names, hashes and
`~` paths only; never a token, a Keychain value, a full `args` line or the licence file's content.

- **P1** a new session directory, created once, under the session scratchpad and never the 87-59 one
  (`gamelib-gate-87-2026-11-24T024510Z`): `S=<session scratchpad>/gamelib-gate-87r1-$(date -u +%Y-%m-%dT%H%M%SZ); mkdir -m 0700 -p "$S"`.
  Everything this contract copies or captures goes under `$S`. Captures are never committed.
- **P2** exactly one GameLib instance before every launch, and none while any file is copied or compared:
  `pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'` prints
  nothing before the launch. A leftover process is quit or killed by pid and the check re-run. Also assert
  `pgrep -fl wineserver` prints nothing for a gate bottle (a leftover one is stopped with that bottle's own `wineserver -k`
  under its `WINEPREFIX` or `CX_BOTTLE`, and the stop is recorded).
- **P3** the copies, with the app closed (P2 first), before any item touches a file:
  - `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-before/"`
  - for each gate bottle the operator names in P5, including the bottle to be removed and the sibling's bottle:
    `ditto "$HOME/Library/Application Support/CrossOver/Bottles/<bottle>" "$S/bottles-before/<bottle>/"`
  - the pin directories before they are moved aside: `ditto <appFolder>/tools/steam-engines "$S/steam-engines-before/"`
  - the CrossOver licence is existence only, never its content and never copied:
    `test -e "$HOME/Library/Preferences/com.codeweavers.CrossOver.license" && echo present || echo absent`. No item edits it.
  These copies are the restore path for every item.
- **P4** the baseline, recorded app closed and before the gap build is installed, saved to `"$S/baseline.txt"`:
  - for every gate bottle: `ls -la <bottle>`, the bytes of its `.gamelib-engine.json` (`cat`) and the first 20 lines of its
    `cxbottle.conf` (`head -20`);
  - `sibling-before.sha`, taken exactly as 87-HUMAN-UAT.md P4 does:
    `find <sibling bottle> -type f ! -name system.reg ! -name user.reg ! -name userdef.reg -exec shasum -a 256 {} + | sort -k2 > "$S/sibling-before.sha"`.
    The three registry files are excluded by name because a wineserver rewrites them on any run; the exclusion is recorded in
    `notes.log`; the app is closed and P2 clean, so nothing else writes the bottle;
  - `store_cache/steam_engine_notices.json` and `store/wine-downloader-info.json` under the gamelib profile: `ls -la` and
    `shasum -a 256` of each, and `cat` of the notices file (notice keys and timestamps only);
  - `ls -la <appFolder>/tools/steam-engines/` and `ls -la <appFolder>/tools/wine/` (the pin and the installed wine versions).
- **P5** the operator names the titles, and Claude records them in `notes.log` and starts nothing until they are named:
  1. one installed non-Steam (GOG or Epic) game that has its own CrossOver bottle (Trash Goblin was used in 87-59): items 1, 4, 5;
  2. a sibling non-Steam game with its own CrossOver bottle (Caravan SandWitch was the 87-59 sibling): item 7's comparison;
  3. a non-Steam game the operator agrees to uninstall together with its bottle, named with that agreement recorded (it may be
     the first game, uninstalled last): item 7;
  4. one Windows title whose game process the matcher cannot see for the 180 s hold, that is, a title that is not a native Mac
     install (87-59's Conquest of Elysium 3 was native and could not carry it): item 3. If none can be named, item 3 scores
     `blocked` with the gap named;
  5. one wine-manager entry that was never installed, whose row shows an Install button and whose stored entry has never held
     `isInstalled` (87-59 used Wine-11.20; an entry that was installed and then removed carries the keys and does not
     exercise F2): item 6. If no such entry exists, item 6 scores `blocked` with the gap named.
  With the 0.13.0 build installed and P2 clean, each named game is launched once so its bottle and marker exist before the
  upgrade; then the app is quit and P2 re-run. P3 and P4 are taken AFTER P5.
- **P6** the network, for the offline steps only: the Wi-Fi interface is `en1`, as 87-59's re-check measured (not `en0`); the
  runner re-reads it with `networksetup -listallhardwareports`, then uses `networksetup -setairportpower en1 off` and
  `networksetup -setairportpower en1 on` (or the Wi-Fi menu). Any offline step is off only for the action it names: off, act,
  on, report. The operator needs the network to talk to Claude.
- **P7** the sandbox profile is copied into `$S` before use, unchanged:
  `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb` (denies
  reads of `/Applications/CrossOver.app`, so CrossOver reads as missing). A signed app launched from `/Applications` is
  started under it with `sandbox-exec -f "$S/no-crossover.sb" /Applications/GameLib.app/Contents/MacOS/gamelib-shell`, and the
  runner records the one resulting pid (P2 asserted first). The trial profile (`nolicence.sb`) is not used: item 2 of 87-59
  passed and is kept.
- **P8** before the first launch of the gap build, run `codesign -dv --verbose=4 /Applications/GameLib.app` and
  `spctl -a -vv /Applications/GameLib.app`, and compare the Identifier, the Developer ID leaf, `TeamIdentifier` and the
  designated requirement with the `87-VALIDATION.md` record for the gap build and with the Phase 86 and 0.13.0 records. A
  mismatch scores every item `blocked` (D-12).

## Tests

### 1. Offline refusal before any download
expected: Under `no-crossover.sb` with the pinned engine absent and the app's connectivity monitor offline (network off only for the Play press), Play on the named non-Steam CrossOver game shows the modal refusal whose text reads "(offline)", no download is attempted, the game page leaves `engine-download`, and gamelib.log carries the refusal's warning line.
result: pending

### 2. Engine lines reach gamelib.log, redacted
expected: Online in the same sandboxed session, the pinned engine's first-need download writes its downloading, verifying and extracting lines, item 1's refusal wrote its engine-notice display lines, and no engine-origin line in any archived log carries the operator's home path (it reads `~`), account name, a full argument line or a token.
result: pending

### 3. The 180 s no-match notice does not raise the window
expected: A launch of the operator-named title held past 180 s, with the operator watching which application is frontmost, shows the system notification and the in-app notice without raising GameLib's window, and gamelib.log carries the deadline-fired line and the notice line with `raise=false`.
result: pending

### 4. Winetricks acts on the game's own bottle and a failure shows
expected: A verb applied from the game's Wine settings runs against the game's own bottle with progress lines, the bottle's `winetricks.log` gains the verb, the shared default prefix directory is not created, and a download verb applied with the network off only for the Apply ends with its row in the failed state and the failure in the log panel.
result: pending

### 5. Stop ends a non-Steam game on CrossOver
expected: Stop from the game page of the running named game ends it, and within 15 s no game process and no wineserver for its bottle remain.
result: pending

### 6. Wine manager installs a never-installed release and the list follows
expected: Install on the named never-installed entry downloads with progress and toasts, `tools/wine/<version>` appears with no temporary sibling, the row shows installed without a restart or a tab switch, Remove flips it back the same way, gamelib.log has no IPC argument rejection for `installWineVersion`, and a Wine-Staging-macOS install either creates its `-DXMT` copy or logs the DXMT skip line.
result: pending

### 7. Removing a game's bottle leaves its sibling byte-identical
expected: The uninstall dialog of the named game offers an enabled toggle that names the game's own bottle; with it on, the uninstall removes that bottle and nothing else, so the sibling's bottle, marker and files equal the P4 record; a refusal shows the removal-refused notice instead; and the toggle's disabled state (a game on the shared default prefix) is legible in the Midnight Mirage, Gruvbox Dark and Dracula themes.
result: pending

## Run order

P1, P2, P5, P3, P4, P6, P7 with the 0.13.0 build installed; then install the gap build over it (same path, identities matched per
`## Builds under test`); then P8. Then:

1. **Launch 1, plain.** Item 6 first (the never-installed wine-manager entry installs, the list follows, Remove flips it back),
   then item 4 (Winetricks on the named game's bottle; its offline Apply last, network off only for that Apply), then item 5
   (Stop on the running named game). Quit; archive the logs.
2. **Launch 2, under `no-crossover.sb`, with the pin directories moved aside** (the P3 `ditto` copy first, the operator's
   approval recorded): item 1 first (network off only for the Play press, then on), then, still sandboxed and online, item 2's
   pinned-engine download. Quit; archive the logs.
3. **Launch 3, plain.** CrossOver re-adopts the game's bottle (the marker returns to crossover, the save hash equal), then
   item 3 last in that launch (the 180 s hold, with the operator watching the frontmost application). Quit; archive the logs.
4. **Item 7 after launch 3 quits and its logs are archived**, as launch 4 (it needs the app for the uninstall dialog): the
   dialog is read first for all three themes and the disabled state, then the removal of the named game with the toggle on,
   then the app quits and P2 is re-run clean and the sibling compare (`sibling-before.sha`, marker, `ls -la`) is taken with the
   app closed, before any other launch.
5. **Item 2's redaction check runs last** over every archived `gamelib-launch-N.log` and `gamelib-old-after-launch-N.log`.
6. **Restores** from the P3 copies only on the operator's decision, after every item is scored (the item 7 bottle is gone by
   design and is restored from `bottles-before/` only if the operator wants the game back).

## Kept from 87-59

These halves are not re-run and keep their 87-59 result unchanged (`87-HUMAN-UAT.md`, scored 2026-11-24).

- **Item 1 (a) healthy CrossOver:** MET. launch 1: `engine=crossover build=26.3.0.39832 reason=cx-healthy` for Trash Goblin (Epic) and Avernum 6 (bridge), no toast or dialog.
- **Item 1 (b) the no-CrossOver fallback:** MET. under `no-crossover.sb` the pinned Wine-Staging 11.20 downloaded in about 12 s with progress, `reason=cx-missing`, toast, badge and DXVK on Avernum 6 and Trash Goblin.
- **Item 1 (c) the re-adopt:** MET. launch 3 without the sandbox: marker back to crossover, `saveinfo.dat` sha256 `7eb70257...` identical before and after.
- **Item 2 (expired trial routes to Staging):** pass. 5-day notice with Buy CrossOver, `reason=cx-expired` routing, toast, badge, Staging wineserver, licence untouched, Isaac's bottle restored.
- **Item 3 reuse half:** MET. a second launch reused its bottle: marker, `cxbottle.conf`, birth time and the 46 bottle directories unchanged, no new bottle created.
- **Item 4 (d) DXVK install and restore:** blocked by design. the per-game DXVK toggle is hidden for bottle-backed games (`GamesSettings/index.tsx:276`).
- **Item 4 (e) DXMT:** blocked by the missing exports. `Wine-11.21`'s `winemac.so` has 0 `macdrv` exports, so no `-DXMT` copy can be made; item 6 re-reads the half from the log (the skip line) instead of from a missing directory.

## Evidence capture

The dual-sink standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3), adapted
to a signed app launched from `/Applications`, as 87-HUMAN-UAT.md applied it. A signed release build has no `pnpm tauri:dev`
terminal, so there is no `terminal.log` sink: every shell and sidecar line reaches `~/Library/Logs/GameLib/gamelib.log` (shell
lines as `[Shell]`, sidecar lines as `[Backend]`, Rust crate diagnostics under a mapped prefix), and the sidecar's `console.*`
and stderr reach nothing. The transcript is `$S/notes.log`, which the operator and runner write by hand; nothing below asks
the transcript for an app log line.

- One session directory (P1), created once with mode 0700, never reused across runs and never the 87-59 one. Captures are never
  committed, and each result carries `~` paths, hashes and counts only (T-87-99).
- The transcript is appended, never truncated: every write to `$S/notes.log` is `tee -a`, never a bare `tee` and never `>`.
- Before each launch write the delimiter, exactly, as its own command:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`). `N` counts launches of the gap build from 1.
- One app instance, asserted before each launch (P2). After the window appears record the instance count with the reaper
  excluded: `ps -axo pid,ppid,args | grep 'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep`
  must print exactly one line; write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is not 1
  the launch is ABORTED and re-run: its evidence is not scorable. Under a sandbox profile the instance is the one
  `sandbox-exec` started, and the same count applies.
- After each launch quits, and BEFORE the next launch starts, archive the logs while they exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and, if `gamelib.log.old` exists,
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old`. Before the first gap launch also copy the 0.13.0 session's `gamelib.log` and `.old` into
  `$S` as `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
- Every result records the launch ordinal that covered it, so a reader can find its `gamelib-launch-N.log` and its `notes.log`
  section.
- A game's own output (the save file, the bottle) is evidence by `shasum -a 256` and `ls -la` recorded in `notes.log`, never by
  a paste of content.
- **Item 2 redaction procedure.** From each archived `gamelib-launch-N.log` select the engine-origin lines with a grep over the
  literals in the table below (the `[engine-notice]` lines, `Engine: downloading|verifying|extracting`,
  `launch deadline fired (`, `launch blocked before pre-flight while offline`, `Not creating DXMT copy of`, and the 87-66
  removal line). Record the selection's line count first as the presence control: it is non-empty, and the same grep over the
  whole archived log finds the operator's home path in a non-engine line (the TypeScript `Logging to file(s)` line, which
  names the log directory), so a zero inside the selection is not vacuous. Then count, inside the selection only, matches of
  the operator's home path, the account name, `args=[`, `--token=` and `token=` followed by anything but `<redacted>`. The
  result records those counts. **Never paste a matched line into `notes.log` or a result; record counts and hashes only.**
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run, and then
  the restore of P3 for whatever the operator chooses to restore, with the post-restore `shasum -a 256` against the `*-before`
  copies. The captures hold account data and paths, stay under `$S` and are deleted by the operator after Phase 87 is verified.

## Required literals

Sinks are `gamelib.log` unless stated. The emitters named are the Rust crate lines at authoring (HEAD `b81419c02`), which write
through `ctx.log`. At authoring the shell's `build_ctx` calls no `with_log`, so `ctx.log` is `None` and none of these reaches
a log (87-59's deferred engine-log gap). Plan 87-61 wires a `ShellEngineLog` that writes each line to `gamelib.log` as a
`[Shell]` line through the redactor. Every row is therefore CONDITIONAL on 87-61, and 87-69 Task 1 re-greps each literal at
the shipped gap code, resolves the row, and also confirms the redacted form still contains the literal. For a row that must
be ABSENT the re-check also confirms the presence case would log.

| Literal | Emitter (planned) | Sink | Status |
|---|---|---|---|
| `launch blocked before pre-flight while offline (crossover-missing)` (the offline gate's warning, item 1) | `step.warn` at `launch/step.rs:529-532`, the arm text from `arm.as_str()`; 87-63 may move the gate, so the line is re-read there | `gamelib.log` as a `[Shell]` WARNING line via 87-61's engine log | CONDITIONAL, `re-check: 87-69 Task 1` (87-61 wires the sink; 87-63 may change the emitter's place and text) |
| `[engine-notice] key=<k> tag=engine-download-failed dispatched=in-app-dialog+notify` with `display=pending`, then `display=confirmed` or `unconfirmed` (the refusal's display lines, items 1 and 2) | `launch/dialogs.rs:188` and `settled_line` `:71` | `gamelib.log` as `[Shell]` | CONDITIONAL, `re-check: 87-69 Task 1` (sink by 87-61; the redacted form keeps the key and tag) |
| `Engine: downloading <kind> <version>`, `Engine: verifying <kind>`, `Engine: extracting <kind>` (the pinned engine's first-need download, item 2) | `fallback/ensure.rs:608`, `:644`, `:666` | `gamelib.log` as `[Shell]` | CONDITIONAL, `re-check: 87-69 Task 1` (sink by 87-61) |
| `Engine: <key> launch deadline fired (` and `Engine: <key> launch deadline notice surface=in-app pushed=<b> raise=false` (the 180 s hold, item 3; the notice line must show `raise=false`) | `launch/deadline.rs:250` and `:288`; the engine-notice line `launch/dialogs.rs:207` | `gamelib.log` as `[Shell]` | CONDITIONAL, `re-check: 87-69 Task 1` (sink by 87-61). A log line proves intent, not that nothing raised the window: the frontmost-application observation scores the no-raise |
| `Not creating DXMT copy of` (the DXMT skip line, item 6) | `gamelib-wine` `tools/dxmt.rs:147` | `gamelib.log` as `[Shell]` | CONDITIONAL, `re-check: 87-69 Task 1` (sink by 87-61). If the install creates a `-DXMT` copy instead, the line is absent and the half scores on the copy |
| the bottle-removal outcome line (fixed text plus the bottle name, item 7) | added by 87-66 in `gamelib-engine` bottles, one line per failing step, run through 87-61's redactor; the `removePrefix` route of 87-70 logs its own fixed-text line when it refuses | `gamelib.log` as `[Shell]` (engine line) or `[Backend]` (route line) | CONDITIONAL, `re-check: 87-69 Task 1` (the exact text exists only after 87-66 and 87-70 execute; a successful removal may log nothing, so the success path is scored by the directory and the sibling bytes, never by a log absence) |
| `GAMELIB_IPC_INVALID_ARGS` for channel `installWineVersion` (**ABSENT**, item 6) | the renderer's `IpcValidationError` frame as `[ERROR][Frontend] Installing <version> failed: IpcValidationError: [GAMELIB_IPC_INVALID_ARGS] ... 'installWineVersion'` | `gamelib.log` | CONDITIONAL, `re-check: 87-69 Task 1` (the absence is only meaningful if 87-62 left the decoder able to emit the presence case for a wrong-typed key). The presence case is measured: 87-59's `gamelib-launch-3-wine.log` carries it at 21:30:20-21:30:40 |
| `store frame rejected` and `refused a store write:` (**ABSENT**, items 4 and 6; the engine notices and the wine-downloader store are written through the same host) | `store_dispatch.rs:449` (`WARN: store frame rejected: <reason>`) and `store_native.rs:423` (`WARN: native <channel> refused a store write: <kind>`) | `gamelib.log` as `[Shell]` | CONDITIONAL, `re-check: 87-69 Task 1` (87-62 touches the install shim; the re-check confirms both lines still exist, so the absence stays falsifiable) |

Observation rows (no log line; scored by the operator's report, with the matching file state): the refusal dialog text "(offline)"
in item 1; the renderer's `engine-download` status leaving after the refusal (`GamePage/index.tsx:196`, label
`hooks/constants.ts:96`); the system notification and the in-app notice at 180 s; the Winetricks failed row and log-panel
error in item 4; the wine-manager row's installed state in item 6.

## Structural Reachability Review

Authored by 87-60 on 2026-11-24 against the tree at HEAD `b81419c02`, before any gap fix is coded. REACHABLE means the surface
exists in current source and the gesture can be performed; CONDITIONAL means it depends on code a later plan writes (87-61 to
87-67, 87-70) or on external state; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. Every CONDITIONAL row
carries `re-check: 87-69 Task 1`. Each of the seven defect-class tests
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2) is applied below to every item,
sub-check and precondition.

### Test 1: origin and scheme reachability

| Item or sub-check | Origin | Verdict | Evidence |
|---|---|---|---|
| 1 (the refusal) | none: the refusal fires before any request | REACHABLE | the gate is `launch/step.rs:513-537`, before the engine ensure |
| 2 (the pinned engine download) | `https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.20/wine-staging-11.20-osx64.tar.xz` and the pinned DXVK on `github.com` | REACHABLE | https origins, proven by 87-59's download in about 12 s |
| 3 (180 s hold) | none | REACHABLE | the title's own launch, no engine request |
| 4 (Winetricks) | winetricks' own download hosts for the success verb; the failing verb fails because the network is off, not because of an origin rule | REACHABLE for the success verb, CONDITIONAL for the failing verb | the verb must be a download verb (not one that only writes a `.reg` locally); the verb is named by the operator after reading the verb's winetricks source in the Wine settings list, and a verb that needs no network scores `blocked` with the gap named |
| 5 (Stop) | none | REACHABLE | local process control |
| 6 (wine manager) | `https://api.github.com` release feeds and the release asset hosts | REACHABLE | https; the TLS fingerprint of reqwest was proven by 87-59's remove-and-reinstall of Wine-11.21 |
| 7 (removal) | none | CONDITIONAL | the dialog control exists only after 87-67 |

No item uses a local fixture, a DummyStore or an `http://` origin, so there is nothing for an https-only gate to reject.

### Test 2: concurrency reachability

- Item 1's refusal and item 2's download are separate actions of one launch and never overlap: the network is back on before the
  download starts, and the refusal dialog is dismissed before the next gesture (a modal is application-modal to the main
  window, so nothing else is driven while it is up).
- Winetricks (item 4) never runs during a wine-manager download (item 6): item 6 finishes, with the row installed and the
  progress gone, before item 4 starts, and item 4's two Applies are separate presses.
- Stop (item 5) is pressed only after the game is matched (the Stop control exists only while the game page is in `playing`,
  `MainButton.tsx:109`), and after item 4's verbs, which need the bottle's wineserver and the prefix.
- The 180 s hold (item 3) is its own launch, last in launch 3, so no other notification or dialog can raise the window during
  the observation.
- Item 7 is its own launch (launch 4), after every other item, because it deletes a bottle.
- No item needs a second window or a second app instance (P2, Evidence capture).

### Test 3: log-line emitter reachability, with the sink clause

| Literal | Emitter (crate line) | Sink chain | Verdict |
|---|---|---|---|
| offline warn | `launch/step.rs:529-532` | `ctx.log` (`None` today) -> 87-61 `ShellEngineLog` -> redactor -> `shell_log_at` -> `gamelib.log` | CONDITIONAL on 87-61 and 87-63 |
| `[engine-notice] ... display=` lines | `launch/dialogs.rs:188`, `:71` | same chain | CONDITIONAL on 87-61 |
| `Engine: downloading/verifying/extracting` | `fallback/ensure.rs:608`, `:644`, `:666` | same chain | CONDITIONAL on 87-61 |
| deadline fired and notice (`raise=false`) | `launch/deadline.rs:250`, `:288`, `launch/dialogs.rs:207` | same chain | CONDITIONAL on 87-61 |
| DXMT skip line | `gamelib-wine` `tools/dxmt.rs:147` | same chain | CONDITIONAL on 87-61 |
| bottle-removal outcome line | 87-66 (engine) and 87-70 (route) | same chain, or `[Backend]` for the route | CONDITIONAL on 87-61, 87-66, 87-70 |
| `IpcValidationError ... installWineVersion` (absent) | the renderer logger | `[Frontend]` into `gamelib.log` | REACHABLE (87-59 recorded the presence) |
| `store frame rejected` and `refused a store write:` (absent) | `store_dispatch.rs:449`, `store_native.rs:423` | `shell_log` -> `gamelib.log` as `[Shell]` | REACHABLE |

A signed build has no terminal sink, so every required line is read from the archived `gamelib-launch-N.log`, never from the
transcript and never from the sidecar's stdout. Three surfaces carry no log line at all and are read by observation: the
fallback toast, the 180 s notification and notice, and the renderer-side progress.

### Test 4: absence-observability

| Absence required | Kind | Presence case that proves the absence is falsifiable |
|---|---|---|
| Item 1: no download attempted in the refusal | falsifiable | item 2 in the same sandboxed session shows the three download lines and the `tools/steam-engines/wine-staging-11.20` directory appearing; 87-59's offline run attempted a download (`failed-to-get-headers`), so a regression is visible as the old dialog text, no "(offline)". The directory listing before and after the refusal is also compared (no `.tmp-*`) |
| Item 4: the shared default prefix directory is not created | falsifiable by a directory listing | 87-59 created `~/Games/GameLib/Prefixes/shared` with a `winetricks.log` containing `fontsmooth=bgr`; the listing of `Prefixes/` before item 4 (P4) is the baseline, and the stray directory was deleted so a re-creation is visible |
| Item 6: no IPC argument rejection for `installWineVersion` | falsifiable | 87-59's `gamelib-launch-3-wine.log` carries `IpcValidationError ... 'installWineVersion' at 0.isInstalled` at 21:30:20-21:30:40; and `store_dispatch.rs:449` and `store_native.rs:423` still log the presence case of a store rejection |
| Item 2: no engine-origin line carries the home path, account name, argument line or token | falsifiable only with the control | the presence control of `## Evidence capture`: the selection is non-empty, and the same grep over the whole archived log finds the home path in a non-engine line, so a zero inside the selection is not vacuous; the redactor's own required unit test (87-61 Task 2) is the code-level presence case |
| Item 3: the 180 s notice does not raise the window | falsifiable only with the focus observation | the operator reports which application is frontmost across the whole 180 s; the presence case is observable because `showEngineDialog` calls `raiseMainWindow()` (the dialog path raises, the notice path does not), so a notice routed through it would raise the window and be seen |
| Item 7: the sibling's bottle, marker and files untouched | falsifiable | `find ... -exec shasum` against `sibling-before.sha` (registry files excluded by name), the sibling's `.gamelib-engine.json` bytes and `ls -la`; a removal that reached the sibling changes at least one of them |
| Item 5: no game process and no wineserver left for the bottle within 15 s | falsifiable | 87-59's Stop left the game running; `pgrep -fl wineserver` and a process listing for the game's exe are the positive observables, recorded before Stop (present) and after (absent) |
| Item 6: no temporary sibling of `tools/wine/<version>` | falsifiable | `ls -la tools/wine/` before (P4) and after; 87-59's earlier install left no `.tmp` either, and a failed or aborted install would leave one |

### Test 5: requirement-interaction reachability

Reduction applied: every state-mutating step (M) against every evidence-bearing one (N), not the full cross product.
M = 11: (m1) installing the gap build over 0.13.0; (m2) the sandboxed relaunch and the later plain relaunch; (m3) network off
for item 1's Play press; (m4) network off for item 4's Apply; (m5) the pin move aside; (m6) the wine-manager install and remove;
(m7) the Winetricks verbs; (m8) Stop; (m9) the uninstall with bottle removal; (m10) the per-launch rotation of `gamelib.log`
to `.old`; (m11) a restore from a P3 copy.
N = 7: (n1) each required literal in each `gamelib-launch-N.log`; (n2) the P4 bytes (markers, `cxbottle.conf` head,
`steam_engine_notices.json`, `wine-downloader-info.json`, the `tools/` listings); (n3) `sibling-before.sha`; (n4) the bottle's
`winetricks.log`; (n5) `tools/wine/<version>` and the pin directory; (n6) `notes.log`; (n7) the focus observation.
**77 pairs considered** (11 x 7). Eleven flagged pairs, each with its resolution:

- F1: m10 x n1. Each launch's first write renames the previous `gamelib.log`. Resolution: each launch's log and `.old` are archived
  before the next launch starts (`## Evidence capture`).
- F2: m1 x n1. The first gap launch rotates the 0.13.0 session's log to `.old`. Resolution: the 0.13.0 session's logs are archived as
  `preexisting-gamelib.log*` before the first gap launch.
- F3: m2 x n6. A relaunch under a sandbox profile, then without it, restarts the app. Resolution: every transcript write is `tee -a`,
  the delimiter carries the launch ordinal, and a bare `tee` or `>` redirect is forbidden.
- F4: m3, m4 x n1, n5. Network off must not fall inside another action's evidence. Resolution: off only for the one action it names
  (off, act, on, report); item 1's off is its own launch step before item 2's download; item 4's off is the last action of launch 1
  after items 6 and 4's success verb have completed.
- F5: m5 x n2, n5. Moving the pin aside changes `tools/steam-engines/` that P4 recorded. Resolution: the P3 `steam-engines-before`
  copy is the before; item 2's download is scored against the listing and `du -sk`, not against P4 bytes; the restore is the
  operator's decision.
- F6: m7 x n4. A failing verb never writes `winetricks.log`, and a success verb that is the failing one's name would confuse the
  count. Resolution: the success verb and the offline failing verb are two different verbs, and the `winetricks.log` check is read
  for the success verb only.
- F7: m8 x n1, n4. Stop kills the bottle's wineserver, which Winetricks needs. Resolution: item 4 runs before item 5 in launch 1.
- F8: m2 x n2. The fallback runs write into the bottle the marker lives in, so the P4 marker bytes are valid only before launch 2.
  Resolution: after the re-adopt in launch 3 the marker and the save hash are compared with the P3 `bottles-before` copy, not with
  P4 bytes, and the marker's version-field difference seen in 87-59 is expected.
- F9: m6 x n2. A wine-manager install and remove rewrites `wine-downloader-info.json`. Resolution: after item 6 the store is
  compared by parsed entries (only the named entry changes), not by bytes.
- F10: m9 x n3. Any launch after the removal could rewrite the sibling's registry or marker. Resolution: the sibling comparison is
  taken immediately after launch 4 quits, with the app closed and P2 clean, before any other launch.
- F11: m11 x everything. A restore overwrites what the items read. Resolution: it runs last, after every item is scored, and only
  on the operator's decision.

### Test 6: pre-existing external-state reachability

| Item | External state its premise needs | Positive observable, preflight or in-run |
|---|---|---|
| 1 | the pinned engine absent from `<appFolder>/tools/steam-engines/`; CrossOver missing to the app (the sandbox); the app's connectivity monitor offline | pin absent by `ls -la` after the move aside (a P4 listing alone does not prove it); CrossOver missing by the `reason=cx-missing` style selection or the refusal's own `crossover-missing` arm; the monitor offline by the `offline via` line in `gamelib.log` before Play (the interface being off is not proof the monitor saw it) |
| 2 | network back on; the pin still absent at the start of the download; a redactable home path in a non-engine line | the first `Engine: downloading` line; the pin absent by `ls` immediately before; the home-path presence control of `## Evidence capture` |
| 3 | a title whose game process the matcher cannot see; the app not already frontmost-locked by another notice | the operator names the title in P5 and reports its first-match outcome; the in-app notice and the system notification are the positive observables, and a title that matches inside 180 s scores `blocked` with the gap named |
| 4 | winetricks present and runnable for the game's bottle; the game's bottle exists and is CrossOver's; a download verb available for the offline Apply | the Winetricks tab shows no environment banner (a missing winetricks scores `blocked` with the banner text); the bottle directory exists by `ls`; `CX_BOTTLE` and `WINEPREFIX` read from the Wine command line the log panel prints (names and `~` paths only) |
| 5 | the named game running and matched, on CrossOver, in its own bottle | the game process in `ps` and the bottle's wineserver in `pgrep -fl wineserver` before Stop; a game that exited by itself scores `blocked` (87-59's 1 s exit pattern is a known cause) |
| 6 | an entry never installed (no stored `isInstalled`), github reachable | the entry's row shows an Install button; the `wine-downloader-info.json` entry is read (parsed, keys listed) before the install |
| 7 | the named game installed with its own bottle; its stored `wineCrossoverBottle` equals the name `getPerGameBottleName` returns; the sibling's bottle present | the dialog opened and cancelled first, recording the toggle's label and enabled state before anything is removed; the bottle directory exists by `ls`; the sibling's `sibling-before.sha` exists |

An emptied app-side store never proves an absent state: the positive observable for the pin is the directory listing, for the
network the app's own `offline via` line, never the Wi-Fi menu alone.

### Test 7: UI-level reachability, distinct from backend reachability

Each gesture was traced to the component that renders its control, in the state the item assumes.

| Item | Gesture | Component and what it does in that state | Verdict |
|---|---|---|---|
| 1 | press Play; read the modal refusal and the game page status | `GamePage/components/MainButton.tsx` (the Play control; `getPlayLabel` :78); the refusal is the engine dialog pushed to the main window; the status is `engine-download` read at `GamePage/index.tsx:196` and labelled at `hooks/constants.ts:96` | REACHABLE |
| 2 | read the download progress | the same game page status and the `tools/` listing | REACHABLE |
| 3 | watch the notice at 180 s | the system notification from the shell and the in-app notice `SteamEngineLaunchNotice` (`components/UI/SteamEngineLaunchNotice`) | REACHABLE |
| 4 | open the game's Wine settings, the Winetricks tab, Apply a verb, read the failed row | `screens/Settings/sections/WinetricksSettings/index.tsx` (rows, the sticky bar, the log panel; failed rows folded from queue outcomes at `:141`) | REACHABLE for the success verb; CONDITIONAL for the failed state shown by 87-64 Task 2 (today a failure does not end `failed`) |
| 5 | press Stop on the running game | `MainButton.tsx` renders the Stop control when `is.playing` (`:109`) | REACHABLE |
| 6 | Install, Remove, read the row | `screens/WineManager/index.tsx` with its `WineItem` rows (`components/WineItem`); the list re-reads on `handleWineVersionsUpdated` (`:86-93`), which F4 says does not fire after a Rust install; fixed by 87-62 | CONDITIONAL, `re-check: 87-69 Task 1` |
| 7 | open the uninstall dialog, read the bottle toggle, turn it on, uninstall; read the disabled toggle in three themes | `components/UI/UninstallModal/index.tsx` (today the "Remove prefix" toggle, disabled when the stored prefix equals the default, `:104-107`); the enabled bottle toggle labelled with the bottle name does not exist until 87-67; the refusal is `components/UI/RemovalRefusedNotice`; the three themes are selected in app Settings | CONDITIONAL, `re-check: 87-69 Task 1` |

The themes for item 7's legibility check are Midnight Mirage, Gruvbox Dark and Dracula, each selected before the dialog is
opened; the disabled state is reached with a game whose stored prefix is the default and whose `wineCrossoverBottle` is absent
or different from the per-game name.

## Withdrawn from live scoring

- Windows and Linux for every item: no live gate is claimed (D-13). CI goldens on the three-OS matrix are the proof, and the live
  check rides with Phase 99.
- DXVK install and restore on a bottle-backed game: hidden by design (`GamesSettings/index.tsx:276`), kept blocked as in 87-59.
- A `-DXMT` copy while no feed's `winemac.so` exports the macdrv metal-view symbols: scored by the skip line instead (item 6).
- GPTK and bottled Steam as engines (D-20): not engines the engine step selects, so no item scores them.

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0
