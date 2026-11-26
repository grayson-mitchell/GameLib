---
status: partial
phase: 87-engine-wine-and-tools
source: [87-CONTEXT.md D-06 D-11 D-12 D-13 D-19 D-21, 87-HUMAN-UAT.md F1 F2 F3 F4 F5]
authored_by: 87-60
run_by: 87-69
started: 2026-11-24T18:43:11Z
updated: 2026-11-25T04:10:00Z
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
result: issue — launch 2, under `sandbox-exec -f no-crossover.sb` with the pin moved aside (`gamelib-launch-2.log`, `notes.log` ITEM 1). The refusal itself is right and F1 does not reproduce: `tools/steam-engines/` listed empty after the move aside; the monitor's `offline via no-interface` line (19:04:55Z) precedes Play (19:05:01Z), Wi-Fi `en1` off 19:04:50Z to 19:06:06Z only; the `offline gate:` line (1) reads `request-offline=true context-online=false crossover-missing=true current-pin-installed=false` and `verdict=blocked:crossover-missing`; the WARNING `launch blocked before pre-flight while offline (crossover-missing)` (1); `[engine-notice] ... tag=engine-download-failed` pending then `display=confirmed` (2 lines); 0 `Engine: downloading` lines before the network came back, `steam-engines` still empty. Operator's dialog text: "GameLib couldn't download its built-in engine (offline). Check your connection and try again". NOT MET: the game page did not leave the launch state. After the refusal the backend logged the launch start and display-sleep prevention (19:05:01Z) and no launch end (no `Stopping Display Power Saver` line until the later online run ended at 19:10:00Z); the operator closed the dialog at 19:05:12Z and the Play button stayed on launching until they navigated away and back (RF2). The generic "game might not play properly offline" warning showed before the refusal (RF5).

### 2. Engine lines reach gamelib.log, redacted
expected: Online in the same sandboxed session, the pinned engine's first-need download writes its downloading, verifying and extracting lines, item 1's refusal wrote its engine-notice display lines, and no engine-origin line in any archived log carries the operator's home path (it reads `~`), account name, a full argument line or a token.
result: pass — launch 2, online in the same sandboxed session (`gamelib-launch-2.log`), with the redaction check over all 8 archived logs (`gamelib-launch-1..4.log`, `gamelib-old-after-launch-1..4.log`, 5041 lines). Download: `Engine: downloading|verifying|extracting` lines for `dxvk` (19:08:45Z to 19:08:46Z) and `wine` 11.20 (19:08:46Z to 19:08:57Z), 6 in `gamelib-launch-2.log` and 12 across the archives (the launch-2 log also lives on as `gamelib-old-after-launch-3.log`); progress and toast seen by the operator; `engine=pinned ... reason=cx-missing` (3 lines); the game ran on the pinned Staging engine (operator: "everything worked as expected"); `tools/steam-engines` repopulated; Trash Goblin's marker kind pinned. Item 1's `[engine-notice]` display lines: 4 across the archives (2 distinct). Redaction: presence control live, 211 non-engine lines carry the raw home path. Engine-origin selection (`Engine:|[engine-notice]|engine=|steam-engines|engineSwitch|wine-staging|dxvk`) 148 lines: home path 0, account name 0, `args=[` 0, unredacted `token=` or `--token=` 0, after excluding one launcher-origin line counted twice (launch 2 and its `.old` copy): the `[Legendary]` `Launching <game>:` line, which the selection matched only through the pinned-engine paths in its env and which is not engine-origin (observation O1). Counts only; no line was pasted.

### 3. The 180 s no-match notice does not raise the window
expected: A launch of the operator-named title held past 180 s, with the operator watching which application is frontmost, shows the system notification and the in-app notice without raising GameLib's window, and gamelib.log carries the deadline-fired line and the notice line with `raise=false`.
result: blocked — no launch. P5 (d) named no title: the operator said launcher titles exist but none can be identified as one the matcher cannot see without launching each game in the library ("block for now"). The gap is named as the plan's flagged assumption and as 87-59 left it: the 180 s no-raise hold still needs a Windows title whose game process the matcher cannot see. The deadline lines (`launch deadline fired (`, `raise=false`) are REACHABLE but were not emitted (0 in every archive), because no hold ran; their absence is not a finding.

### 4. Winetricks acts on the game's own bottle and a failure shows
expected: A verb applied from the game's Wine settings runs against the game's own bottle with progress lines, the bottle's `winetricks.log` gains the verb, the shared default prefix directory is not created, and a download verb applied with the network off only for the Apply ends with its row in the failed state and the failure in the log panel.
result: pass — launch 1, Trash Goblin (Epic, bottle `GameLib-legendary-54f7949350c949c6a2c47f12e7b15636`), Winetricks tab (`gamelib-launch-1.log`, `notes.log` ITEM 4). Success verb `fontsmooth=bgr`, online: progress lines, row installed; the bottle's `winetricks.log` created holding `fontsmooth=bgr`; its `user.reg` FontSmoothing values changed (sha256 `41ef382aeb0d...` to `f1ae3726917d...`); regedit ran through CrossOver's wine (syswow64 and system32) with no `was not found` line; `~/Games/GameLib/Prefixes/shared` NOT created and no other new `winetricks.log`. Failure verb `tahoma` with Wi-Fi `en1` off 18:53:55Z to 18:55:10Z only: download timeouts, `winetricks exited with code 1` (1), the row ended "install failed" and the failure showed in the log panel; `WINEARCH=win64`. 0 `store frame rejected` and 0 `refused a store write:` lines in any archive.

### 5. Stop ends a non-Steam game on CrossOver
expected: Stop from the game page of the running named game ends it, and within 15 s no game process and no wineserver for its bottle remain.
result: blocked — by RF1, launches 1 and 3 (`gamelib-launch-1.log`, `gamelib-launch-3.log`, `notes.log` ITEM 5, DIAG, F6). No non-Steam CrossOver game stayed running long enough to press Stop. Trash Goblin, Play twice (18:57:18Z, 18:57:32Z), `engine=crossover reason=cx-healthy`, then `launch deadline cancelled (launcher-exited)` 1 to 2 s later with no wine or game process left (7 `launcher-exited` lines in launch 1). Deviation (operator decision 18:59:48Z): the item moved to Caravan SandWitch (Amazon, own bottle), which exited the same way (nile `Process exited with code 1`). Launch 3: the one CrossOver launch right after the pinned-to-crossover restore ran normally (19:11:49Z to 19:12:08Z) but the operator closed it before Stop was pressed; the next two (19:13:52Z, 19:14:03Z) dropped again. Stop's 87-65 route was never exercised live.

### 6. Wine manager installs a never-installed release and the list follows
expected: Install on the named never-installed entry downloads with progress and toasts, `tools/wine/<version>` appears with no temporary sibling, the row shows installed without a restart or a tab switch, Remove flips it back the same way, gamelib.log has no IPC argument rejection for `installWineVersion`, and a Wine-Staging-macOS install either creates its `-DXMT` copy or logs the DXMT skip line.
result: pass — launch 1, entry Wine-11.18 (P5 (e); no Wine-11.19 entry exists) (`gamelib-launch-1.log`, `notes.log` ITEM 6). Install showed progress and the start and finish toasts; the log carries the start, finish and removed lines (18:50:10Z to 18:51:11Z); the row flipped to installed without a restart or a tab switch, and Remove flipped it back with the removal toast. 0 `GAMELIB_IPC_INVALID_ARGS` lines for `installWineVersion` in any archive. The DXMT skip line `Not creating DXMT copy of` is present (1, WARNING, path written as `~`; `winemac.so` lacks the macdrv metal exports), so the half scores on the line; a checksum-absent warning was logged. After Remove: `tools/wine/` back to `Wine-11.21` and `Wine-Staging-macOS-latest`, 0 temporary entries; the stored Wine-11.18 entry `isInstalled=false`, `hasUpdate=false`, `installDir` empty.

### 7. Removing a game's bottle leaves its sibling byte-identical
expected: The uninstall dialog of the named game offers an enabled toggle that names the game's own bottle; with it on, the uninstall removes that bottle and nothing else, so the sibling's bottle, marker and files equal the P4 record; a refusal shows the removal-refused notice instead; and the toggle's disabled state (a game on the shared default prefix) is legible in the Midnight Mirage, Gruvbox Dark and Dracula themes.
result: issue — launch 4, Trash Goblin with its bottle, operator-approved before the action (`gamelib-launch-4.log`, `notes.log` ITEM 7). The dialog control is right: its toggle reads "Remove this game's bottle: GameLib-legendary-54f7949350c949c6a2c47f12e7b15636", enabled, and the amber risk warning appears when it is on. NOT MET: the uninstall with the toggle on was refused before the bottle route ran: "Couldn't uninstall Trash Goblin / The folder is a protected location ... / Nothing was deleted.", `[safety] uninstall refused: is-protected-root` (1, 19:20:22Z), 0 `removePerGameBottle:` and 0 `Removed the game bottle` lines (RF4). The refusal notice works; the removal half was never exercised. Pressing Cancel in the dialog first removed the game's Steam shortcut (RF3). Sibling compare with the app closed and P2 clean: Caravan SandWitch's bottle 1902 files, `sibling-after.sha` equal to the retaken `sibling-before.sha` (0 diff lines, both sha256 `883fdc1fd0e3589b...`), marker kind crossover; Trash Goblin's bottle intact (2434 files), marker kind crossover. The three-theme legibility of the disabled toggle was not runnable: no installed game shows the disabled toggle (Racine, the planned case, is missing on disk; Bloody Hell has its own prefix), so `disabledContrast.test.ts` is the only evidence for that half.

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

Sinks are `gamelib.log` unless stated. Authored by 87-60 at HEAD `b81419c02`, when the shell's `build_ctx` called no `with_log`, so
`ctx.log` was `None` and none of these reached a log (87-59's deferred engine-log gap). 87-69 Task 1 re-grepped every row at the
shipped gap source (`release/v0.13.1` `97d6d2052`, whose production code is `07b194604`) and resolved it: 87-61 wired a
`ShellEngineLog` (`engine_dispatch.rs:309`, `:329`) that writes each crate line to `gamelib.log` as a `[Shell]` line through
the redactor, and the literal-survival tests in `src-tauri/src/engine_log.rs` name the rows below. Each row's Status is its
resolution; the grep evidence is in `## Pre-run re-check`. For a row that must be ABSENT the re-check also confirmed the
presence case still logs.

| Literal | Emitter (as shipped) | Sink | Status |
|---|---|---|---|
| `Engine: <key> launch blocked before pre-flight while offline (<arm>)` with `<arm>` `crossover-missing` (or `restore-needs-pin`), a WARNING line (the offline gate's warning, item 1). The `Engine: <key> ` prefix is `Step::warn`'s | `step.warn` at `launch/step.rs:578-581`, the arm text from `arm.as_str()` | `gamelib.log` as a `[WARNING] [Shell]` line via 87-61's engine log | REACHABLE as amended: the emitter moved from `:529-532` to `:578-581` and the written line carries the `Engine: <key> ` prefix; the gate logic is unchanged by 87-63 |
| `Engine: <key> offline gate: request-offline=<b> context-online=<b> on-bottle=<b> override=<id> crossover-missing=<b> current-pin-installed=<b> marker=<kind\|none> restore-needs-pin=<b> verdict=<blocked:<arm>\|proceeds>` (the gate's reading, an INFO line written whenever either offline signal says offline; item 1's discriminating evidence for F1, added by 87-63) | `Step::note` and `offline_gate_line`, `launch/step.rs:364` and the call before the refusal | `gamelib.log` as an `[INFO] [Shell]` line | REACHABLE as an added row (87-63 postdates the contract). It is the F1 discriminator: `request-offline=false` is the TS caller, `request-offline=true context-online=true` is a lost `engine_set_online`, `verdict=proceeds` names the layer that let the launch through |
| `[engine-notice] key=<k> tag=engine-download-failed dispatched=in-app-dialog+notify dialog-frame-sent=<b> display=pending`, then `[engine-notice] key=<k> tag=engine-download-failed display=confirmed` or `display=unconfirmed` (the refusal's display lines, items 1 and 2) | `launch/dialogs.rs:188` (pending) and `settled_line` `:71` (confirmed or unconfirmed, with a trailing `elapsedMs=<n>` or `timeout=<n>`) | `gamelib.log` as `[Shell]` | REACHABLE as amended: the pending line carries `dialog-frame-sent=<b>` between `dispatched=` and `display=`, which the contract's text omitted; the redacted form keeps `key=` and `tag=` (`key` is not a redacted key) |
| `Engine: downloading <name> <version>`, `Engine: verifying <name>`, `Engine: extracting <name>` for `<name>` `wine` and `dxvk` (six lines for a first-need pin download; item 2) | `fallback/ensure.rs:608`, `:644`, `:666` (`env.info`) | `gamelib.log` as `[Shell]` | REACHABLE as amended: `<kind>` in the contract is the artifact name `wine` or `dxvk`, and the lines have no `Engine: <key>` prefix |
| `Engine: <key> launch deadline fired (` and `Engine: <key> launch deadline notice surface=in-app pushed=<b> raise=false`, plus `[engine-notice] key=<k> tag=launch-deadline-unconfirmed dispatched=notify raise=false` (the 180 s hold, item 3; the notice line must show `raise=false`) | `launch/deadline.rs:250` and `:288`; `launch/dialogs.rs:207` with `NOTICE_TAG` `launch-deadline-unconfirmed` (`deadline.rs:43`) | `gamelib.log` as `[Shell]` | REACHABLE as amended. A fourth line, `Engine: launch deadline fired for key <k> after <ms> ms (no game process seen)` (`deadline.rs:223`), has no `(` after `fired` and is not the literal: count the parenthesised form only. A log line proves intent, not that nothing raised the window: the frontmost-application observation scores the no-raise |
| `Not creating DXMT copy of <version>: <path> <reason>; missing ...` (the DXMT skip line, item 6; the path is redacted to `~`) | `gamelib-wine` `tools/dxmt.rs:144-147` (`log_warn`, text `Not {action} DXMT copy of ...` with `action` `creating` on an install) | `gamelib.log` as `[WARNING] [Shell]` | REACHABLE as amended: a WARNING line whose path part reads `~`. If the install creates a `-DXMT` copy instead, the line is absent and the half scores on the copy |
| the bottle-removal lines: on a failing or declined step `removePerGameBottle: <fixed text> "<bottle>"...` from the engine (`bottles/remove_per_game.rs:211-324`, seven `warn` sites, `[WARNING] [Shell]`); on the route's success `Removed the game bottle` (`utils/uninstaller.ts:187`, `[INFO] [Backend]`); on a route failure `removePrefix: the per-game bottle removal did not answer` or `... gave an unreadable answer` (`:168`, `:176`, `[WARNING] [Backend]`) (item 7) | 87-66 in `gamelib-engine` bottles; 87-70's `removeOwnBottle` in `uninstaller.ts` | `gamelib.log` as `[Shell]` (engine lines) or `[Backend]` (route lines) | REACHABLE as amended: the exact texts exist. A refused removal logs the engine `removePerGameBottle:` line (the in-use, guard-declined and unsafe cases) and shows the notice. The success path is still scored by the bottle directory and the sibling bytes, never by a log line or a log absence; `Removed the game bottle` corroborates it |
| `GAMELIB_IPC_INVALID_ARGS` for channel `installWineVersion` (**ABSENT**, item 6) | the renderer's `IpcValidationError` frame as `[ERROR][Frontend] Installing <version> failed: IpcValidationError: [GAMELIB_IPC_INVALID_ARGS] ... 'installWineVersion'` (`WineItem/index.tsx:77` logs it; `wine_dispatch.rs` `parse_wine_version` raises it) | `gamelib.log` | REACHABLE: 87-62 defaults only the absent `isInstalled`, `hasUpdate` and `installDir`; a wrong-typed value (`"isInstalled": "yes"`, `installDir: 1`, an over-long `installDir`) is still rejected with `0.<key>` `invalid_type` or `too_big` (`wine_dispatch.rs` tests at `:1608-1621`, `:1669-1681`), so the absence stays falsifiable. The presence case is measured: 87-59's `gamelib-launch-3-wine.log` carries it at 21:30:20-21:30:40 |
| `store frame rejected` and `refused a store write:` (**ABSENT**, items 4 and 6; the engine notices and the wine-downloader store are written through the same host) | `store_dispatch.rs:449` (`WARN: store frame rejected: <reason>`) and `store_native.rs:423` (`WARN: native <channel> refused a store write: <kind>`) | `gamelib.log` as `[Shell]` | REACHABLE: both emitters still exist at the gap source, so the absence stays falsifiable |

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

## Pre-run re-check

Run by 87-69 Task 1 on 2026-11-25, before any launch of the gap build. Read-only: nothing was launched, copied, edited or
restored on the operator's profile, bottles or licence, and `/Applications/GameLib.app` is still the signed 0.13.0 build. The
checks are `git grep` and `git show` against the gap build's source and read-only `ls`, `codesign -dv`, `PlistBuddy` and a
key-listing of one store file (names only, no values).

### Gap build identity

The line below is copied verbatim from `87-VALIDATION.md` under `### Phase 87 gap build (87-68)`. Its status is `pending`, not
`blocked`, so the re-run proceeds on the signed build.

Gate (gap build): pending (identities match: signed Phase 87 gap build v0.13.1, run 45455431706, `release/v0.13.1` at 97d6d2052 = main 07b194604 + the version bump, same Identifier, Developer ID leaf, TeamIdentifier S7U223QWXJ and byte-identical designated requirement (sha256 68d712d0...) as the installed signed 0.13.0 build (run 45314401170) and the signed Phase 86 build v0.12.0 (run 45056179067); notarized and stapled; contains every 87-60 to 87-67 and 87-70 gap fix)

- Source under test: `release/v0.13.1` at `97d6d2052fdf92b7f7e28ef584ab4df5674f577d` = main `07b194604` plus one version-bump
  commit. `git diff --name-only 07b194604 97d6d2052` lists exactly `package.json`, `src-tauri/Cargo.lock`,
  `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`. Main's HEAD since then adds only `.planning/` files, so every grep
  below at `97d6d2052` reads the shipped production code. Every path and line number below is at that commit.
- Installed now (read-only): `/Applications/GameLib.app` is `0.13.0`, `Identifier=com.gamelib.shell`,
  `TeamIdentifier=S7U223QWXJ`, `CDHash=18d7ea76c1f0758325b0976c643496d28c3b861d`, the 87-59 build. No GameLib process is running.
  The gap build's `CDHash` is `266b7378d08b90e305efe37d2573270b01b146dd` (87-68's record); P8 re-reads it after the install.

### Literal rows, resolved

Each row of `## Required literals` was re-grepped at the gap source: the emitter exists, it writes through `ctx.log` (wired by
87-61 at `engine_dispatch.rs:309` and `:329`, redacted by `ShellEngineLog::write` at `engine_log.rs:59`) or through
`shell_log`, and the literal survives the redactor (87-61's literal-survival tests in `engine_log.rs`:
`the_refusal_dialog_line_keeps_its_display_pending_literal`, `the_deadline_notice_line_keeps_its_raise_false_literal`,
`the_engine_download_lines_keep_their_literals`, `the_launch_deadline_lines_keep_their_literals`,
`the_offline_gate_warning_keeps_its_literal`, `the_dxmt_skip_line_keeps_its_literal_and_loses_its_profile_path`).

| Row | Item | Resolution | Evidence |
|---|---|---|---|
| offline gate warning | 1 | REACHABLE as amended | emitter `launch/step.rs:578-581` (`step.warn`, arm word from `arm.as_str()`: `crossover-missing` or `restore-needs-pin`), written as `Engine: <key> ` plus the text; the gate fires only when the game is on a bottle, the request says offline and the override is Automatic or CrossOver (`step.rs:557`), and with CrossOver missing and the pin absent the arm is `crossover-missing` (`offline.rs:95-115`). The contract's old line numbers `:529-532` moved; the text did not |
| offline gate reading (added row) | 1 | REACHABLE as an added row | `offline_gate_line` at `launch/step.rs:364`, written by `Step::note` as `Engine: <key> offline gate: request-offline=... verdict=...` whenever either signal says offline, refused or not. This is 87-63's instrument for F1, whose root cause 87-63 did not establish (every layer was green at HEAD); the live line is what names it |
| `[engine-notice] ... display=pending`, then `confirmed` or `unconfirmed` | 1, 2 | REACHABLE as amended | `launch/dialogs.rs:188` (pending, with `dialog-frame-sent=<b>` before `display=`, which the old row omitted), `settled_line` `:71` used at `:122` (`timeout=<n>`) and `:145` (`elapsedMs=<n>`); `key=` is not a redacted key (`engine_log.rs` `is_sensitive_key`: only `username`, `session`, `account`, `accountname`, `login` and the `token`, `password`, `passwd`, `secret`, `apikey`, `api_key`, `authorization`, `cookie` suffixes) |
| `Engine: downloading`, `verifying`, `extracting` | 2 | REACHABLE as amended | `fallback/ensure.rs:608`, `:644`, `:666`; `<kind>` is the artifact name `wine` or `dxvk`, and these lines carry no `Engine: <key>` prefix; a first-need pin download writes six lines |
| `launch deadline fired (` and `notice ... raise=false` | 3 | REACHABLE as amended | `launch/deadline.rs:250` and `:288`, `launch/dialogs.rs:207` with `NOTICE_TAG` `launch-deadline-unconfirmed` (`deadline.rs:43`); armed from `lib.rs:601` through `arm_engine_launch_deadline` (`step.rs:889`). The extra line at `deadline.rs:223` reads `fired for key`, with no `(`, so it is not counted as the literal |
| `Not creating DXMT copy of` | 6 | REACHABLE as amended | `gamelib-wine` `tools/dxmt.rs:144-147`, `log_warn`, `Not {action} DXMT copy of {version}: {winemac_path} {reason}; missing ...`; the home path comes out as `~` (the engine-log test pins it). A `-DXMT` copy scores the half instead if the install makes one |
| bottle-removal lines | 7 | REACHABLE as amended | engine: seven `removePerGameBottle: ...` `warn` sites at `bottles/remove_per_game.rs:211-324` (cxbottle did not finish, unsafe name, in use, guard declined, no CrossOver install, guard now declines, could not remove); route: `Removed the game bottle` at `utils/uninstaller.ts:187` and two WARNING lines at `:168` and `:176`. A successful removal is scored by the directory and the sibling bytes; the route's `Removed the game bottle` line corroborates |
| `GAMELIB_IPC_INVALID_ARGS` for `installWineVersion` (absent) | 6 | REACHABLE | 87-62's `parse_wine_version` (`wine_dispatch.rs:252`) defaults only the absent `isInstalled`, `hasUpdate` and `installDir` (`:241-243`); a wrong-typed or over-long value still answers `0.<key>` `invalid_type` or `too_big` (tests `:1608-1621`, `:1669-1681`), so the presence case can still be emitted and the absence is falsifiable |
| `store frame rejected` and `refused a store write:` (absent) | 4, 6 | REACHABLE | `store_dispatch.rs:449` and `store_native.rs:423` exist at the gap source with the quoted texts, so the absence is falsifiable |

IMPOSSIBLE rows: none. No row needed amending to an observation row. The three 87-59 rows that scored IMPOSSIBLE (the engine
lines, the deadline lines, the DXMT line, all because `ctx.log` was `None`) are REACHABLE now through 87-61's wiring, and the
shell tests that prove the wiring end to end are `an_offline_launch_with_no_engine_is_refused_and_the_gate_warning_reaches_gamelib_log`
(`engine_dispatch.rs`, 87-63) and `a_crate_line_written_during_an_op_reaches_gamelib_log_as_a_shell_warning` (`engine_log.rs`, 87-61).

### Structural reachability rows that were CONDITIONAL, resolved

These resolve the Test 1, 3, 6 and 7 rows of `## Structural Reachability Review` (left as authored; this section supersedes
their CONDITIONAL marks). Each gesture is traced to the component that renders its control, in the state the item assumes.

| Item | Gesture and component | Resolution |
|---|---|---|
| 4 (failed state) | Apply a verb in `screens/Settings/sections/WinetricksSettings/index.tsx` (verbs whose last attempt failed are folded from queue outcomes at `:141`, outcomes read at `:466`) | REACHABLE as amended: 87-64 found a non-zero exit already ends the verb `failed` (the tab renders it), and added one closed rule, `regedit: The file '<path>' was not found`, which ends the verb `failed` even on exit 0 (`winetricks/classify.rs:177`, `install.rs:484`). The offline download verb must exit non-zero for a failed row; see the live re-check list |
| 6 (list follows) | Install on a row of `screens/WineManager/index.tsx`; the list re-reads in `handleWineVersionsUpdated` (`:86-93`, `window.api.handleWineVersionsUpdated`) | REACHABLE: 87-62 queues `wineVersionsUpdated` behind the store host's pending changes (`engine_dispatch.rs:265-303`, `AFTER_STORE_CHANGES`), so the renderer snapshot is patched before the list re-reads. The ordering is proven in tests (`wine_dispatch.rs` `:2070-2105`); the live list following without a restart is the observation |
| 7 (bottle toggle) | `components/UI/UninstallModal/index.tsx`. The toggle is `<ToggleSwitch htmlId="uninstallCheckbox" ...>` at `:278-298`, labelled `gamelib:uninstall.removeBottle` with the bottle name when `bottleName` is set (`:282-286`) and the old `gamepage:box.uninstall.checkbox` prefix label otherwise, `disabled={disableDeleteWine}` (`:294`), shown when `showWineCheckbox` (`:182`: not native, not DLC, not a Steam hand-off). `bottleName` is set only when `window.api.getPerGameBottleName({ runner, appName })` equals the stored `wineCrossoverBottle` (`:110-116`), and `disableDeleteWine` is true only when there is no per-game bottle and the stored prefix equals the default (`:132-135`); the risk warning is `:300-307` and the disabled note `:308` | REACHABLE as amended: the control exists in the state the item assumes (a game whose stored `wineCrossoverBottle` is its per-game name enables the toggle and names the bottle). A game with no `wineCrossoverBottle`, or a different one, on the default prefix reaches the disabled toggle, which is what the three-theme legibility check needs. `getPerGameBottleName` is a native engine channel (`nativeChannels.json:1906`, preload `api/engine.ts:11`) |
| 5 (Stop) | `MainButton.tsx` Stop control while `is.playing` | REACHABLE, unchanged. 87-65 routes a CrossOver overlay's Stop to the bottle's wineserver (`utils.ts` `shutdownWine`) through the guarded `engine_bottle_kill_wineserver` op |

### State the operator's profile is in (read-only)

- The pinned engine IS installed: `~/Library/Application Support/gamelib/tools/steam-engines/` holds
  `wine-staging-11.20` and `dxvk-macOS-v1.10.3-20230507-repack`. Item 1 needs it absent, so the pin must be moved aside at the
  checkpoint, after the P3 `ditto` copy and with the operator's recorded approval. It was not touched here.
- `tools/wine/` holds `Wine-11.21` and `Wine-Staging-macOS-latest`.
- `store/wine-downloader-info.json` (keys listed, no values read out): the `Wine-Staging-macOS` list has 15 entries, 13 with
  no stored `isInstalled` key (the first are `Wine-11.20`, `Wine-11.18`, `Wine-11.17`, `Wine-11.16`, `Wine-11.15`,
  `Wine-11.14`), `Wine-Crossover` has 2 (both without the key), `Game-Porting-Toolkit` has 15 (14 without). So never-installed
  entries exist; the operator names the one for item 6 at P5 and the row must show an Install button.

### Live re-check owed

1. P8 on the installed gap build: `Identifier`, the Developer ID leaf, `TeamIdentifier`, the designated requirement and the
   expected `CDHash` `266b7378...`; a mismatch scores every item `blocked` (D-12).
2. Item 1's F1 discriminator. 87-63 could not reproduce F1 and named no root cause, so item 1 is the first live evidence: read
   the `offline gate:` line in `gamelib-launch-2.log` first. `request-offline=false` is the TS caller, `request-offline=true
   context-online=true` is a lost `engine_set_online`, `verdict=proceeds` with `crossover-missing=false` is the CrossOver verdict
   and `current-pin-installed=true` is the pin check. A refusal without the dialog text "(offline)", or no `offline gate:` line
   at all, scores item 1 `issue` with that reading, not `pass`.
3. The app's monitor reads offline before Play: the `Connectivity: fresh check ... -> offline via <source>` line
   (`connectivityNow.ts:176`) precedes the press; the Wi-Fi menu alone is not proof (Test 6).
4. Item 4's offline Apply ends `failed` only if the chosen download verb exits non-zero offline (or prints the one regedit
   form). A verb that exits 0 offline with no such line scores `issue` with the verb named; it is not a pass.
5. Item 6's list following without a restart or tab switch is a live observation (the ordering is proven in tests only), as is
   Remove flipping the row back.
6. Item 3 needs the P5 title that the matcher cannot see; none is named yet, so item 3 is `blocked` with the gap named if the
   operator names none.
7. Item 7 needs the named game's stored `wineCrossoverBottle` to equal its per-game name (read at the dialog: the toggle names
   the bottle), the dialog opened and cancelled first, and the sibling compare taken with the app closed.
8. The three log rows that were IMPOSSIBLE in 87-59 are scored from `gamelib-launch-N.log` only after the redaction presence
   control passes (a non-engine line carries the home path; the engine selection does not).

## Run record

Run by plan 87-69 with the operator, 2026-11-24 18:43Z to 19:21Z (launch 4 stayed open until the operator quit it; the closing
compare was taken with the app closed, 2026-11-25 about 03:57Z). `gamelib.log` writes the local clock (UTC+13). `$S` is
`gamelib-gate-87r1-2026-11-24T184311Z` under the session scratchpad in `/private/tmp` (P1, mode 0700), never the 87-59 one. The
transcript is `$S/notes.log` (76 lines, 4 `=== GATE LAUNCH N` delimiters), every write `tee -a`.

- **Build (P8):** the signed gap build `0.13.1` installed over the signed 0.13.0 build at 18:49:04Z.
  `Identifier=com.gamelib.shell`, Developer ID Application leaf, `TeamIdentifier=S7U223QWXJ`,
  `CDHash=266b7378d08b90e305efe37d2573270b01b146dd` (equal to 87-68's record), `spctl` accepted, `source=Notarized Developer ID`,
  designated requirement sha256 `68d712d0...` (byte-identical to the 0.13.0 and Phase 86 records). P8 met; every item ran on it.
- **P5 as run:** (a) the non-Steam CrossOver game Trash Goblin (Epic, `GameLib-legendary-54f7949350c949c6a2c47f12e7b15636`);
  (b) the sibling Caravan SandWitch (Amazon, its own `GameLib-nile-...` bottle); (c) the game to uninstall with its bottle: Trash
  Goblin, last (Age of Decadence was rejected as Steam-only, Bloody Hell because its stored `wineCrossoverBottle` is empty and
  its wine type is toolkit); (d) none named, so item 3 is blocked; (e) Wine-11.18 (no Wine-11.19 entry exists). The launch-once
  step was skipped: both gate bottles already existed with `kind=crossover` markers.
- **P3/P4:** the first P3 attempt (18:47:15Z) was discarded because GameLib 0.13.0 was still running during the copy; the copies
  were removed and P3 redone with P2 clean (18:48:18Z): `profile-before/` (5.6G), `bottles-before/` for both gate bottles (667M),
  `steam-engines-before/` (890M), licence existence only (present). P4 `baseline.txt` and `sibling-before.sha` (1900 files, the
  three registry files excluded by name). P7 `no-crossover.sb` copied (sha256 `c3f5c4b43ac04742...`). The 0.13.0 session's logs
  archived as `preexisting-gamelib.log*`.
- **Launches:** 1 plain (pid 67538; items 6, 4, then 5); 2 under `sandbox-exec -f no-crossover.sb` with the pin moved aside
  (pid 18831; item 1 offline, then item 2 online); 3 plain (pid 88966; re-adopt, item 5 re-attempted); 4 plain (pid 37450;
  item 7). P2 was clean before every launch and after every quit (no GameLib, reaper, sidecar or wineserver); each launch's
  `gamelib.log` and `.old` were archived before the next launch.
- **Launch 3 re-adopt:** met. `engine=crossover reason=cx-healthy` (19:11:32Z), marker pinned to crossover, `saveinfo.dat`
  sha256 `7eb70257593da06f...` equal before and after.
- **Operator decisions, recorded in `notes.log` before the actions they cover:** the pin move aside for launch 2 (approved);
  the uninstall of Trash Goblin with its bottle removed (approved); item 5 moved to Caravan SandWitch (18:59:48Z); a diagnostic
  that created an EMPTY `~/Games/GameLib/Prefixes/shared` to test whether the absent `--wine-prefix` broke the launch (approved;
  it did not help and was removed again at 19:01:47Z); `sibling-before.sha` retaken after the diagnostic Caravan run with the app
  closed (1902 files, 2 diff lines against the P4 original, which is kept as `sibling-before-p4.sha`); continuing the gate after
  item 5 blocked; restores: keep.
- **Deviations from the run order:** item 5 ran on the sibling as well as on the named game and was re-attempted in launch 3;
  item 3 did not run (no title); the disabled-toggle legibility check in item 7 was not runnable (no installed game reaches the
  disabled state).

## Findings and observations

Not fixed here (D-06): each goes to a further gap cycle through `/gsd-plan-phase 87 --gaps`. Evidence is in `$S/notes.log` and the
archived logs named in each result; counts and timestamps only.

**Findings (new, for a further gap cycle)**

- **RF1 (was F6), items 5 and 7's premise: CrossOver launches from GameLib exit within 1 to 2 s.** Trash Goblin (legendary,
  18:57Z twice and 19:13:52Z, 19:14:03Z, `launch deadline cancelled (launcher-exited)`) and Caravan SandWitch (nile
  `Process exited with code 1`, 19:00Z to 19:01Z) on `engine=crossover reason=cx-healthy`. Wine-Staging launches work (19:09Z); the
  single CrossOver launch right after the pinned-to-crossover restore (DXVK and overrides removed, stock DLLs restored, the
  restore's wineserver stopped) ran normally. The operator reports it is not intermittent: it is the same pattern as 87-59 (drops
  on CrossOver, works on Wine, then works once on CrossOver). The same nile command run from a shell starts the game, also under
  the sidecar's minimal environment (`env -i`, `PATH=/usr/bin:/bin:/usr/sbin:/sbin`), so the failure is in GameLib's spawn or its
  state between launches, not the bottle or the game. An empty recreated shared prefix did not help. Suspected: the TS launch
  path's CrossOver spawn and what the engine-switch restore resets (`src/backend/launcher.ts` and the CrossOver overlay in
  `src-tauri/crates/gamelib-engine/src/launch/settings.rs`). Existing todo:
  `.planning/todos/pending/2026-11-24-bottled-games-exit-about-one-second-after-the-wine-command.md`.
- **RF2 (was F7), item 1: Play stays on launching after the offline refusal.** The refusal fired, but the backend had already
  logged the launch start and display-sleep prevention (19:05:01Z) and never ended the launch: no `Stopping Display Power Saver`
  until the later online run ended (19:10:00Z). The dialog closed at 19:05:12Z and the button stayed on launching until the
  operator left the page and came back. Suspected: the TS launch caller does not end the launch (status and power-save blocker)
  when the engine step answers blocked (`src/backend/launcher.ts` around the engine-step reply; `GamePage/index.tsx:196`).
- **RF3 (was F8), item 7: Cancel in the uninstall dialog removed the game's Steam shortcut.** At 19:16:59Z, `[Shortcuts]` logged
  the Steam image removal and "Trash Goblin was successfully removed from Steam." with a "Removed from Steam" notification; the
  bottle and the game directory stayed. No runner `Uninstalling` line exists in launch 4, so the uninstall path did not run; a
  `[Frontend]` Warning naming the uninstall Modal was logged the second before. `UninstallModal/index.tsx` has no Steam-shortcut
  path on Cancel. Suspected: the click falling through to the game page's Steam-shortcut control
  (`src/frontend/screens/Game/GamePage/actions/useSteamShortcut.ts` `handleAddToSteam` -> `removeFromSteam`,
  `src/backend/sidecar/shortcutsFlowRegistration.ts:405-412`); not traced.
- **RF4 (was F9), item 7: the bottle removal can never run for a game whose stored prefix is the shared default.** With the
  toggle on, the uninstall was refused `is-protected-root` and nothing was deleted. Cause: in `src/backend/utils/uninstaller.ts`
  (`:385-409`) the D-14 pre-flight `checkRemoval` runs on the stored `winePrefix` (the shared default
  `~/Games/GameLib/Prefixes/shared`) before the 87-70 per-game-bottle route, so every bottle-backed game on the default prefix is
  refused outright. 87-70's SUMMARY flagged this for item 7.
- **RF5, item 1 (UX): the generic offline warning precedes a refusal.** The "game might not play properly offline" warning is
  shown first and is pointless when the launch is about to be refused. Suspected: the TS pre-launch offline prompt runs before the
  engine step's verdict.
- **RF6, item 7 (open, by reading): two removal reasons have no notice wording.** The bottle op answers `in-use` and
  `unsafe-name`, which are not in `REMOVAL_REASONS` (`src/common/types/safety.ts:51`); `noticeReason`
  (`src/backend/utils/uninstaller.ts:131-139`) renders them as `bad-reply`. Not seen live (RF4 stopped the route first).

**Observations (not findings against the items)**

- **O1:** the launcher's `[Legendary] Launching <game>:` line logs the full environment and command, including the raw home path
  and the pinned-engine paths (2 hits in the archives, one line duplicated). It is launcher-origin, pre-existing Heroic-era
  behaviour and outside item 2's engine-origin contract, but it is the one place the redaction does not reach.
- **O2:** an orphaned `steam-bridge-helper-signin` (ppid 1, about 11 h old) from the helperIntegration jest run was found at P2
  and killed: that test can orphan its helper.
- **O3:** ending a shell-started CrossOver game needed `WINEPREFIX=<bottle dir> wineserver -k`; `CX_BOTTLE` alone did not end it.
  87-65's `engine_bottle_kill_wineserver` sets `WINEPREFIX` to the bottle directory
  (`src-tauri/crates/gamelib-engine/src/bottles/lifecycle.rs:121-126`), which matches what worked; it was not exercised live (item 5).
- The disabled bottle toggle's legibility in the three themes is still unproven live (no reachable state; Racine missing on disk,
  the known `library-install-state-disagrees-with-disk` todo).

## Closing inventory

Taken with the app closed and P2 clean (no `gamelib-shell`, sidecar or wineserver process). Restore decision (operator): **keep**,
no restores from the P3 copies.

- **Restored:** nothing.
- **Unchanged:** Caravan SandWitch's bottle (1902 files equal to the retaken `sibling-before.sha`, marker kind crossover); Trash
  Goblin's save (`saveinfo.dat` sha256 `7eb70257...`); the CrossOver licence (existence only, never read or copied).
- **Left changed, the operator's to restore from the P3 copies if wanted:** Trash Goblin's non-Steam Steam shortcut was removed
  (RF3); the pinned engine in `tools/steam-engines` is the fresh launch-2 download (the original directories are in `$S/pin-aside/`,
  890M); Trash Goblin's bottle `user.reg` carries the item 4 font-smoothing change and its `winetricks.log` holds `fontsmooth=bgr`;
  Trash Goblin's marker is kind crossover again, as before the run. Trash Goblin and its bottle are still installed (RF4 refused
  the removal). `tools/wine/` holds the same two versions as before (Wine-11.18 installed and removed).
- **Created and removed:** the empty `~/Games/GameLib/Prefixes/shared` made for the RF1 diagnostic.
- **Installed:** `/Applications/GameLib.app` is the signed 0.13.1 gap build.
- **Captures:** `$S` holds 28 entries, 8.3G (profile, bottle and pin copies, per-launch logs, `notes.log`, the sibling hashes),
  directory mode 0700, never committed; the operator deletes it once Phase 87 is verified.

## Summary

total: 7
passed: 3
issues: 2
pending: 0
skipped: 0
blocked: 2

## Re-run 2 (87-79)

Re-run 2 (`87-RERUN-2-HUMAN-UAT.md`, run by 87-79 on the signed gap build 2, 0.13.2, 2026-11-26) re-scores the results below.
The re-run 1 results above are left as written.

| Re-run 1 result | Re-run 2 item | Re-run 2 result |
|---|---|---|
| item 1 issue (RF2 the launch never ended; RF5 the generic warning first) | 1 (offline refusal) and 2 (the warning's presence case) | 1 pass, 2 pass |
| item 3 blocked (no 180 s hold title) | 5 | blocked (no title, again) |
| item 5 blocked (RF1, CrossOver launches exit) | 3 (launches stay up) and 4 (Stop) | 3 pass, 4 pass |
| item 7 issue (RF3 Cancel removed the shortcut; RF4 is-protected-root) | 6 | pass |
| item 7's disabled-toggle legibility half (not runnable) | 7 | pass, on the Start Minimized fallback surface |
