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

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0
