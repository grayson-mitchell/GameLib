---
phase: quick-260929-hgm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs
  - .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
  - .planning/ROADMAP.md
  - .planning/todos/pending/ (FAIL or unscored-anomaly branch only, at most one new todo per branch)
autonomous: false
requirements:
  - QUICK-260929-HGM
estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "38-S12 was observed LIVE on this Linux host (Pop!_OS 22.04, X11, DISPLAY :1) against a dev build whose identity is PROVEN: the GameLib window's `_NET_WM_PID` resolves through `/proc/<pid>/exe` to `src-tauri/target/debug/gamelib-shell`, and `git status --porcelain -- src src-tauri package.json` was empty at launch."
    - "Row 8's arming (hasChoice) is PROVEN independently of the dialog, immediately before the scored open: `defaultSettings.enableSteamNativeInstall` reads `true` from `~/.config/GameLib/config.json`, AND `steam_library_replica.cjs` (a line-for-line replica of `getSteamLibraries()` at `src/backend/utils.ts:671-692`, with the same `@node-steam/vdf` parser, the same `/usr/share/steam` sentinel and the same `existsSync` filter) reports COUNT >= 2. The dialog corroborates it: its library options equal the replica's paths, and neither content-light notice renders."
    - "Each of the four scored facts (platform row ABSENT, library dropdown PRESENT, wine section ABSENT, free-space line PRESENT) has its OWN recorded verdict and its OWN evidence line on both instruments. None is inferred from another, and none comes from a single screenshot glance."
    - "The operator's native-install setting ends the task at its recorded ORIGINAL value, proven by a read of `config.json` after the UI restore. It was ON only between Task 3 step A and step I."
    - "The ledger records what was observed. PASS or FAIL moves `38-S12` to `human_verification_discharged`; NOT SCORED leaves it open with a dated note. Counts are the LIVE baseline measured at execute time, minus or plus one. `ledger-check.cjs` passes, and audit-uat `by_phase['38']` drops by exactly one on discharge."
    - "No process this task started survives it: not the `setsid` group, not the sidecar's own group, and not the idle inhibitor. No committed evidence carries a Steam account identifier. No install was dispatched, native or otherwise."
  artifacts:
    - ".planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs: read-only replica of getSteamLibraries() plus the free-space probe's preconditions. It is the arming instrument that does not depend on the dialog."
    - ".planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/: baseline.env, library-replica.txt, the settings toggle-row crops, window-region PNGs, region-checks.txt, atspi-dialog-subtree.txt, burst-summary.txt, log-excerpt.txt"
    - "38-VERIFICATION.md: `38-S12` relocated per the observed outcome; `score:` updated"
    - "38-HUMAN-UAT.md: `sessions:` entry plus a `## Sitting 8` section"
  key_links:
    - "`resolveSteamSectionGating` (`steamSectionGating.ts:172-303`): `hasChoice = nativeInstallOn && libraryCount > 1` (`:199`), `libraryDropdown = !wineSection && hasChoice` (`:279`), `freeSpaceLine = libraryDropdown` (`:284`), `contentLightNotice = !isMac && !libraryDropdown` (`:293`). `platformRow` is `'absent'` off darwin and win32 (`:203-206`), and `platformSelection()` returns null for it (`InstallModal/index.tsx:590-593`)."
    - "The dialog derives `nativeInstallOn` AND `libraryCount` from ONE IPC list (`InstallModal/index.tsx:368-402`, `:423`, `:451`). The sidecar handler `installFlowRegistration.ts:267-268` returns `[]` unless `isSteamNativeInstallEnabled()` (`nativeInstallSetting.ts:14-16`, a live GlobalConfig read) holds; otherwise it returns `listSteamLibraryTargets()` (`installLocation.ts:84-91`), which calls `getSteamLibraries()` (`utils.ts:671-692`) on every call."
    - "The free-space line is the dropdown's `afterSelect` (`SteamDialog/index.tsx:500-516`). It renders only when `checkDiskSpace` (`shellFilesFlowRegistration.ts:316-338`) returns `validPath && validFlatpakPath` for the default library's `steamapps` dir (`installTarget.ts:44-49`, `:114-120`)."
    - "`38-VERIFICATION.md` frontmatter -> strict YAML -> gsd-core `audit-uat`. One unescaped quote drops Phase 38 from the audit silently; `ledger-check.cjs` and `pnpm planning-gates` are the checks."
---

<objective>
Run Phase 38 item `38-S12` LIVE on this Linux machine as Sitting 8, and record the true result.

The item, verbatim from `38-VERIFICATION.md` (lines 36-44 at planning time):
- test: "Section-gating matrix row 8 on a LINUX host, tauri runtime — hasChoice (native installs ON
  and >1 library)."
- expected: "The platform row does NOT render (D-18); library dropdown PRESENT; wine section
  ABSENT; free-space line PRESENT. All four checked independently."
- blocked_by: "machine switch + setup -- boot the Linux machine (OWNED and available), then register
  a SECOND Steam library on it". Keep this VERBATIM when relocating. It is history, even though this
  sitting shows the registration step is not needed on this host (see ARMING below).
- platform_gate: `steamSectionGating.ts:182-207`. Keep that field VERBATIM when relocating.

THIS IS A LIVE OBSERVATION, NOT A CODE CHANGE. The executor launches `pnpm tauri:dev`, clicks with
`xdotool`, and captures with the TWO EXISTING instruments, which it reuses AS-IS by path and does
not copy or modify. It measures library arming with one new, small, read-only replica script. The
ONLY state it changes outside the repo is the operator's `enableSteamNativeInstall` setting. That
setting is flipped through the Settings UI immediately before the scored open and restored the
same way afterwards. No file under `src/` or `src-tauri/` is edited. Number this sitting "Sitting
8", continuing after Sitting 7 (quick `260929-ata`).

SCORED SURFACE. The rendered content of the Steam "Install with options…" dialog (`SteamDialog`,
opened through the `SteamInstallCaret` menu). The executor OPENS the dialog, observes it, opens the
library select's menu once to read its options, and CLOSES everything. It NEVER clicks Install,
neither inside the dialog nor the primary half on the game page. So nothing is handed off to Steam
and nothing downloads.

The four scored facts, each with its code anchor and the text signature that identifies it. Confirm
every signature against `public/locales/en/*.json` at execute time with a Python json read. The
catalogue is the source of truth, and a drifted catalogue value replaces the fragment listed here.
1. Platform row, expected ABSENT. `platformSelection()` at `InstallModal/index.tsx:590-631`: a MUI
   `SelectField`, htmlId `platformPick`, label `game.platform` in `gamepage.json` ("Select Platform
   Version to Install") plus a colon. The platform ICONS beside the dialog title
   (`SteamDialog/index.tsx:419-426`, `InstallModal__platformIcon`) are NOT the platform row. Do not
   score them. Record them as seen.
2. Library dropdown, expected PRESENT. `SteamDialog/index.tsx:491-529`: `SelectField` htmlId
   `steamLibraryPick`, label `gamelib:steam.install.libraryPickerLabel` ("Choose Steam library")
   plus a colon. Its closed value shows the default library's path, followed by
   `gamelib:steam.install.libraryPrimarySuffix` ("default") in parentheses (`:518-527`).
3. Wine section, expected ABSENT. Three signatures, all of which must be absent:
   - the `WineSelector` mounted from `InstallModal/index.tsx:647-710`, whose labels include "Show
     Wine settings", "WinePrefix", "CrossOver Bottle" and "Wine version" (match case-insensitively);
   - the `sharedBottleNotice` `.infoBox` at `SteamDialog/index.tsx:482-490` ("used for every Steam
     game that needs a bottle");
   - the slot's pending occupant `EligibilityLoadingRow` ("Checking install options"), which should
     never mount on Linux, because `shouldProbeEligibility` returns false there
     (`steamEligibilityProbe.ts:86-92`).
4. Free-space line, expected PRESENT. The dropdown's `afterSelect` at `SteamDialog/index.tsx:500-516`:
   "Space Available" (`install.disk-space-left` in `gamepage.json`), a colon, then
   "<free> free of <total>" (`gamelib:installFlows.diskSpaceFreeOfTotal`), directly under the
   select.

The content-light notice is NOT one of the four. It is arming corroboration.
`contentLightNotice = !isMac && !libraryDropdown` (`steamSectionGating.ts:293`), so on row 8
NEITHER `contentLightNotice` nor `contentLightSingleLibraryNotice` should render.

ARMING. Row 8 has one arm and no "or": native installs ON AND more than one library. Both conjuncts
are proven independently of the dialog, and both are re-proven immediately before the scored open.
- Native ON: the key `defaultSettings.enableSteamNativeInstall` in `~/.config/GameLib/config.json`
  reads `true` after the UI toggle. The sidecar reads the same GlobalConfig live on every call
  (`nativeInstallSetting.ts:14-16`), so no relaunch is needed.
- Library count: `steam_library_replica.cjs`, written in Task 1, replicates `getSteamLibraries()`
  (`utils.ts:671-692`) line for line. That function has FIVE candidates on this host, not four:
  the `/usr/share/steam` sentinel at index 0, plus the four `libraryfolders.vdf` paths. At
  planning time exactly two existed on disk: `~/.steam/debian-installation` and
  `/mnt/PopGames/SteamLibrary`. So COUNT=2 and `hasChoice` arms WITHOUT registering or mounting
  anything. The item's own `blocked_by:` and sitting 7's closing note both assumed that a
  "register a second library" step was needed. On this host it is NOT, and the result says so.
  The sentinel is missing, so the FILTERED list's index 0 (the dropdown's "(default)" entry,
  `installLocation.ts:89`) is `~/.steam/debian-installation`.
- A drive can be unplugged or replugged between planning and execution. Task 1 re-measures the
  count. If it finds 1 or fewer, Task 2 is a blocking operator checkpoint to restore a second
  library. `getSteamLibraries()` runs on every dialog open, so a mount needs no relaunch. If the
  operator declines, the item is NOT SCORED.

DECLARED REAL-PROFILE ARM (CLAUDE.md two-profile rule, half 2). This sitting runs under the
operator's REAL `HOME`, on purpose. The justification is stated for THIS item, not inherited:
- The item needs an owned, not-installed Steam game in a signed-in GameLib Library. That session
  lives in the real profile: `~/.config/GameLib/`, left in place by sittings 6 and 7, plus the dev
  vault `/tmp/gamelib-dev-secret-vault.json`.
- Row 8's library conjunct IS the operator's real Steam state. The replica and the app both read
  the real `libraryfolders.vdf` through the real `defaultSteamPath` (`~/.steam/steam`, a symlink to
  `~/.steam/debian-installation`) and the real mount state of the drives it names. A fake HOME has
  no `config.json` and no `~/.steam`, so the function would take its unfiltered early return, give a
  count of 1, and row 8 could not arm at all.
- The native conjunct lives in the real `config.json`. This sitting CHANGES it, and restores it.
- Sitting 6's justification (the `shell.openExternal` hand-off through `xdg-open`) does NOT carry
  over. This item never clicks Install, so that leg is never exercised. Say so in the record.
- Isolation still applies to every capture. Raw bursts, whole-window AT-SPI dumps (which can
  contain the account name), Settings grabs and the `tauri:dev` transcript go to the session
  scratchpad, and are deleted at cleanup. Only vetted, cropped evidence is committed.

NATIVE-ON HAZARD. While native installs are ON, the PRIMARY half of any Install button starts a real
GameLib depot download into a real library. The game page's Install button also carries
`autoFocus` (`MainButton.tsx:331`), so Enter or Space on the page would press it. Therefore:
- the setting is turned ON as LATE as possible (Task 3 step A) and restored as EARLY as possible
  (Task 3 step I, before any teardown);
- while it is ON, the executor sends no keyboard input to the GameLib window and clicks only the
  caret, the menu item, the select, the already-selected option and the header X;
- Task 3 carries an ACCIDENTAL DOWNLOAD rule.

LOCK RULE (measured in sitting 7, and TRUE AT PLANNING TIME). The GNOME session auto-locks on idle.
A lock curtain produces a non-blank, static grab. It PASSES `selftest`'s non-blank check and looks
like a WebKitGTK freeze. Before every capture step, check
`loginctl show-session <LOCK_SESSION> -p LockedHint --value` and require `no`. If it reads `yes`,
raise a human-action checkpoint asking the operator to unlock. On resume, confirm `no`
independently before clicking anything. Task 1 also starts an idle inhibitor (`gnome-session-inhibit
--inhibit idle`), which changes no setting and ends when its process is killed. Read every
`read_first` range for Task 3 BEFORE Task 1's launch: sitting 7 auto-locked during exactly that
reading gap.

Facts measured at planning time (2026-09-29, HEAD `4a99e1d6b`). EVERY ONE IS MUTABLE. Re-measure at
execution and record the executed value.
- Ledger: 8 open / 18 discharged / 10 retired. The live open ids, in array order:
  `38-W04,38-W05,38-S12,38-S14,38-S16,38-E01,38-E03,38-E04`. audit-uat `by_phase['38'] == 8`,
  `total_items == 427`, `parse_gap_files == 0`.
- Census: 80 ok, 2 no-frontmatter, 3 bad. `34.13-UAT.md` still fails at its pinned `(62:176)`.
- Replica: `defaultSettings.defaultSteamPath` = `~/.steam/steam`, and the vdf exists. Candidates:
  - 0 `/usr/share/steam` MISSING;
  - 1 `~/.steam/debian-installation` EXISTS;
  - 2 `/media/<user>/Games/SteamLibrary` MISSING;
  - 3 `/media/<user>/<uuid>/SteamLibrary` MISSING;
  - 4 `/mnt/PopGames/SteamLibrary` EXISTS.
  So COUNT=2. Both `steamapps` dirs exist, and `FLATPAK_ID` is unset, so the free-space probe
  should report `validPath` and `validFlatpakPath` true for the default library. The two existing
  libraries sit on different drives (`/` and `/mnt/PopGames`).
- Native setting: `false` (key present).
- 7 Days to Die (251570, sitting 7's target, which that sitting never installed): no
  `appmanifest_251570.acf` in either existing library.
- Processes: no `gamelib-shell`, sidecar or `tauri dev` was running, and :5173 was free. The Steam
  client was running (`pgrep -x steam` gave 34061). This item does not need it.
- Session: loginctl session `2` (seat0, x11) had `LockedHint=yes` and `IdleHint=yes`. The operator
  must unlock before execution. `gnome-session-inhibit` is installed and the session bus is
  reachable. A 3-second probe inhibitor listed as `<app-id>: <reason> (idle)` under
  `gnome-session-inhibit -l`, and vanished when it exited.
- Log sink: `~/.local/state/GameLib/logs/gamelib.log`. `logInfo` lines never reach the terminal.
- Deep-link trap: `gamelib://` has no handler here, and `heroic://` belongs to the stale Electron
  deb at `/opt/GameLib`. Navigate by clicking the UI only.
- Process hygiene (sitting 6): the sidecar (`build/main/sidecar.js`) runs in its OWN process group,
  not the `setsid` group. A docked devtools panel can appear, and only its own close button closes
  it.

OUT OF SCOPE (do not score and do not record against):
- `38-S14`, and `38-S16`'s Linux half. Its native-ON branch needs at most one library, which is
  not this host's state.
- Selecting the second library, or checking per-library free-space correctness (D-08).
- Clicking Install anywhere.
- Mounting drives, registering libraries or editing `libraryfolders.vdf` as Claude. Only the
  operator may do that, in Task 2's fallback.
- Any fix to what is observed.
Do not edit `.planning/STATE.md`: the quick orchestrator records the task.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

These are large files. Read ONLY the ranges named in each task's read_first. `38-VERIFICATION.md`,
`38-HUMAN-UAT.md`, `34.13-UAT.md` and `ROADMAP.md` are not @-included, on purpose.

Precedents to mirror in shape, adapting the content:
- `.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/260929-ata-PLAN.md` and its
  SUMMARY: the launch, identity proof, two-instrument scoring, cleanup and records discipline.
- `38-VERIFICATION.md`'s `38-S10` discharged entry, the LAST entry of
  `human_verification_discharged` at planning time: the result-writing shape, including "All five
  checks scored INDEPENDENTLY", which becomes "All four" here.
- `38-S14`'s `sitting_5_2026_09_26` field: the keep-open shape, used on the NOT SCORED branch only.
- `38-HUMAN-UAT.md`'s `## Sitting 7` section: the narrative and region-table shape.
- `34.13-UAT.md`'s `38-S10` receipt `outcome:`, and its body row
  `| G-ROW-7 | tauri | RELOCATED → **PASS in Phase 38 (2026-09-29)** |`: the walk-back shape.

YAML-writing rules for every value this task adds (from quick 260928-raq):
- Use single-quoted scalars (double every apostrophe) or double-quoted scalars (backslash-escape
  every inner double quote, and write no other backslash). Match the neighbouring field's style.
- Run `ledger-check.cjs` after every edit to `38-VERIFICATION.md`.
- Write no closing-tag-shaped token (a less-than sign followed by a slash) into ANY file this task
  writes. The planning-gates envelope-tag check reads every planning file.

Reusable harnesses, used as-is by path:
- `.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs`. Its header,
  lines 1-66, documents the flags.
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`
  (VISUAL): `find`, `selftest`, `grab`, `clients`, `burst`, `diff`.
- `.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py` (TEXT
  TREE): `dump`, `regions`, `smoke`. Its `SIGNATURES` already carries `library_dropdown` ("choose
  steam library") and `free_space_line` ("space available"). Its counts are polarity-neutral: this
  plan reads them as PRESENT when in-dialog is at least 1, where sitting 7 read them as ABSENT at 0.

Tooling quirk from sitting 6: a long inline `&&` verify chain sometimes returned a bare "Exit code
1" with no output through the Bash tool. Copy each verify block into a script in the session
scratchpad and run it with `bash`. A foreground `sleep` may be blocked, so poll with Monitor or an
until-loop.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer. Re-measure the live baseline and both arming conjuncts, launch the HEAD dev build under the declared real-profile arm, prove identity and both instruments end to end, locate the native-install toggle WITHOUT flipping it, and check live whether Steam sign-in is usable</name>
  <files>.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs, .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/baseline.env, .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/library-replica.txt</files>
  <precondition>An X11 session is live on `DISPLAY=:1`. `xdotool`, `xprop`, `loginctl` and `gnome-session-inhibit` are on PATH. `python3 -c 'import mss, PIL, Xlib, gi'` succeeds. `src-tauri/target/debug/gamelib-shell` exists, so the launch is an incremental build. `node_modules/@node-steam/vdf` is installed.</precondition>
  <read_first>
    - .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs lines 1-66
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py lines 1-35 (subcommands; `find` prints JSON with `pid`, `x`, `y`, `width`, `height`)
    - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py lines 1-69 (subcommands and SIGNATURES)
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/260928-tvk-SUMMARY.md lines 100-126 (sidecar process group, devtools panel, verify-chain quirk)
    - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/260929-ata-SUMMARY.md lines 106-127 (the WazHack disqualification and the session-lock diagnosis)
    - src/backend/utils.ts lines 671-692 (the function the replica mirrors)
    - src/backend/storeManagers/steam/installLocation.ts lines 84-91
    - src/backend/utils/filesystem/index.ts lines 29-46 and src/backend/utils/filesystem/unix.ts lines 46-51 (what `validPath`/`validFlatpakPath` mean on Linux)
    - EVERY read_first range of Task 3, read NOW, before Step 4's launch (see LOCK RULE)
  </read_first>
  <action>
Step 0. Session lock and idle inhibitor. Do these BEFORE anything is launched.
- Find this user's seat0 x11 session with `loginctl list-sessions --no-legend`. Record its id as
  `LOCK_SESSION` (it was `2` at planning time).
- `loginctl show-session <LOCK_SESSION> -p LockedHint --value` must read `no`.
- If it reads `yes`, launch NOTHING. Return a human-action checkpoint asking the operator to unlock
  the screen; there is nothing to clean up yet. On resume, independently confirm `no` before Step 1.
  It read `yes` at planning time.
- Start the inhibitor in the background under `setsid`:
  `gnome-session-inhibit --inhibit idle --app-id gsd-260929-hgm --reason "gsd-260929-hgm Phase 38 sitting 8" --inhibit-only`.
  - Save its PID to the session scratchpad.
  - Confirm `gnome-session-inhibit -l` lists `gsd-260929-hgm`.
  - It changes no setting and ends when killed in Task 3 step I.
  - If it will not start, record that as a deviation and continue. The LockedHint checks remain the
    backstop.

Step 1. Re-measure the baseline. It is mutable, so this task authorizes nothing from the planning
snapshot.
- Run ledger-check with `--human-uat`, starting from `--open 8 --discharged 18 --retired 10`. If it
  fails on a count, read the actual counts from its FAIL lines and re-run until it passes.
- Confirm `38-S12` is still open, with `--includes 'open:38-S12:test=LINUX host, tauri runtime'`.
  If `38-S12` is no longer in `human_verification`, STOP and report: someone else has moved it.
- Read the live open ids in array order with a js-yaml read of the frontmatter. Do not guess the
  order; sitting 7's planner guessed it wrong.
- Run `--census`. Confirm `34.13-UAT.md` is still reported at `(62:176)`.
- Write `evidence/baseline.env` in this quick task's directory. It holds plain `KEY=value` lines and
  no secrets:
  - `O`, `D` and `R`: the live counts;
  - `OPEN_IDS`: the comma-separated live open ids;
  - `AUDIT38` and `TOTAL`: from the ledger-check audit-uat lines;
  - `CENSUS_BAD`;
  - `PRE_SHA`: `git rev-parse --short HEAD`;
  - `SDATE`: `date +%F`;
  - `SKEY`: `sitting_8_` followed by `SDATE`, with its hyphens turned into underscores;
  - `LOCK_SESSION`;
  - `ORIG_NATIVE` and `LIB_COUNT`, added in Step 2.
  Every later count in this plan means "these values", and discharge means `O-1` and `D+1`.
- Confirm `git status --porcelain -- src src-tauri package.json` is EMPTY. If it is not, STOP: the
  build would not be HEAD.
- Record `uname -a`, `PRETTY_NAME` from `/etc/os-release`, `$XDG_SESSION_TYPE` and `$DISPLAY`.

Step 2. Record both arming conjuncts' STARTING state. Do this before launch, so the values predate
anything this run does.
- `ORIG_NATIVE`: read ONLY `defaultSettings.enableSteamNativeInstall` from
  `~/.config/GameLib/config.json` with a Python json read, and print nothing else from the file.
  Write `true`, `false` or `absent` (key missing) to `baseline.env`. It was `false` at planning
  time. Do NOT change it in this task.
- Write `steam_library_replica.cjs` in this quick task's directory (Node, CommonJS). Requirements:
  - A header comment stating what it is: the Phase 38 `38-S12` arming instrument, independent of
    the dialog. It replicates `getSteamLibraries()` at `src/backend/utils.ts:671-692` and
    `listSteamLibraryTargets()` at `installLocation.ts:84-91`. It is read-only and prints paths
    only.
  - Read ONLY `defaultSettings.defaultSteamPath` from `~/.config/GameLib/config.json`, located via
    `os.homedir()`, and strip every apostrophe from it as `:673` does. If the key is absent, print a
    line saying a faithful replica is impossible (the runtime default is not read) and exit 2.
  - Build the vdf path as `path.join(<steamPath>, 'steamapps', 'libraryfolders.vdf')`. The
    candidate list starts with the `/usr/share/steam` sentinel.
  - If the vdf is missing, or its parse has no `libraryfolders`, reproduce the function's
    UNFILTERED early return: the result is the sentinel alone, at count 1, even though it may not
    exist. Print which branch fired.
  - Otherwise, parse with `require('@node-steam/vdf').parse`, which resolves upward to the repo's
    `node_modules`. The candidates are the sentinel followed by every `libraryfolders` entry's
    `path`, in object order.
    - Print one line per candidate: index, `EXISTS` or `MISSING`, path.
    - Filter the candidates with `fs.existsSync`.
  - For each surviving library, mirror `listSteamLibraryTargets()`: `steamappsDir` is
    `path.join(<lib>, 'steamapps')`, and `isPrimary` is index 0 of the FILTERED list. Print
    `PROBE <steamappsDir> access=ok|fail primary=true|false`. Use `fs.accessSync` with its default
    mode, exactly as `isWritable_unix` uses `access` (`unix.ts:46-51`).
  - Print `FLATPAK_ID=set` or `FLATPAK_ID=unset`. This is the `isAccessibleWithinFlatpakSandbox`
    input (`filesystem/index.ts:45-46`).
  - Print `COUNT=<n>` as the LAST line, and exit 0.
  - Never read, print or require anything else: no other `config.json` key, nothing under
    `~/.steam` except the vdf, and not the vault.
- Run it. Write its output, under a first line `# Task 1 <ISO time>`, to
  `evidence/library-replica.txt`. Write `LIB_COUNT` to `baseline.env`. It was 2 at planning time.
- If `LIB_COUNT` is 1 or less, write `LIBS_OK=no` to the scratchpad and CONTINUE. Task 2 handles it.
- If `LIB_COUNT` is 3 or more, a registered drive got mounted. It is still row 8; record it and
  continue.
- If the PRIMARY library's `PROBE` reads `access=fail`, record the PREDICTION that the free-space
  line will not render, because `SteamDialog/index.tsx:501-504` requires `validPath`. Continue, and
  do not fix it: scoring decides.

Step 3. Take the pre-launch census.
- Use bracketed `pgrep -af` patterns (`[g]amelib-shell`, `[b]uild/main/sidecar.js`, `[t]auri dev`),
  so pgrep cannot match its own parent shell.
- `ss -Hltn '( sport = :5173 )'` must be empty.
- If a foreign GameLib process is running, do NOT kill it. Stop the inhibitor, STOP and report.
- Record `pgrep -x steam` (informational only), `ls -ld ~/.config/GameLib`, and the vault's mode
  via `stat -c '%a %n'`. Never read the vault.

Step 4. Launch.
- Run `pnpm tauri:dev` with NO env overrides (the real-profile arm), in the background, under
  `setsid`.
- Save the group leader PID to the session scratchpad. Send the transcript there too, never to
  `/tmp` directly and never into the repo.
- Poll, bounded to 15 minutes, until `xdotool search --onlyvisible --name '^GameLib$'` returns a
  window.
- If the preflight refuses or the build fails, record the paraphrased reason, run Task 3 step I's
  process cleanup for this run (there is no setting to restore yet), and STOP.

Step 5. Prove the identity and map the process tree.
- Run `python3 <capture> find`. Its `pid` MUST resolve through `readlink /proc/<pid>/exe` to
  `/home/graysonmitchell/GameLib/src-tauri/target/debug/gamelib-shell`. Otherwise STOP.
- With `ps -o pid,pgid,sid,args`, record the `setsid` PGID AND the sidecar's
  (`build/main/sidecar.js`) PID and PGID. Do NOT assume the sidecar shares the group; sitting 6
  measured that it does not.
- Save both group ids to the scratchpad for cleanup.

Step 6. Clear stray UI and self-test the visual instrument.
- Check LockedHint first. Then `grab` the window and VIEW it.
- If a docked devtools panel is visible, close it with a coordinate click on the panel's OWN close
  button, then re-grab and view to confirm.
- Run `python3 <capture> selftest`. Record its fps and frame interval.
- If the grab is blank (and LockedHint is `no`), relaunch once with
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` and record the deviation. If it is still blank, STOP.

Step 7. Smoke-test the text instrument.
- Run the probe as-is, by path: `timeout 150 python3 <probe> smoke --pid <shell pid>`.
- PASS: record it.
- FAIL: record the text instrument as UNAVAILABLE, with the failing line. Do not relaunch or
  reconfigure accessibility to chase it. Task 3 then scores on the visual instrument alone.

Step 8. Confirm the log sink. `~/.local/state/GameLib/logs/gamelib.log` must exist, with an mtime
since launch.

Step 9. Locate the native-install toggle WITHOUT flipping it.
- Navigate by `xdotool` clicks, at coordinates read off viewed grabs, to Settings. The General
  section hosts `EnableSteamNativeInstall` (`GeneralSettings/index.tsx:48`).
- Find the row titled "Download Steam games directly in GameLib" (`setting.steam-native-install`
  in `translation.json`). VIEW the grab: the toggle's visual state must match `ORIG_NATIVE`.
- Record the toggle's absolute click coordinates, and the route to Settings, in the scratchpad for
  Task 3.
- Do NOT click the toggle. Navigate back to the Library.
- Settings grabs stay in the scratchpad.

Step 10. Check whether Steam sign-in is already usable. This is a LIVE check, and it decides (with
`LIB_COUNT`) whether Task 2 pauses.
- `grab` and VIEW the Library. It must list owned Steam games, including at least one that is NOT
  installed and whose game page offers Install with the caret.
- Record `pgrep -x steam`. The Steam desktop client is NOT required: nothing is handed off to it.
- Write `SIGNED_IN=yes` or `SIGNED_IN=no` to the scratchpad.

Leave the app and the inhibitor RUNNING for Tasks 2 and 3. Native installs remain at `ORIG_NATIVE`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h && C=.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && . $Q/evidence/baseline.env && [ "$(loginctl show-session $LOCK_SESSION -p LockedHint --value)" = no ] && python3 $C selftest && test -s "$HOME/.local/state/GameLib/logs/gamelib.log" && node $L --open $O --discharged $D --retired $R --human-uat --open-ids $OPEN_IDS --includes 'open:38-S12:test=LINUX host, tauri runtime' && node $Q/steam_library_replica.cjs | tail -1 | grep -qx "COUNT=$LIB_COUNT" && grep -qx "COUNT=$LIB_COUNT" $Q/evidence/library-replica.txt && python3 -c "import json,os,sys; d=json.load(open(os.path.expanduser('~/.config/GameLib/config.json'))).get('defaultSettings',{}); o=sys.argv[1]; c=json.dumps(d['enableSteamNativeInstall']) if 'enableSteamNativeInstall' in d else 'absent'; sys.exit(0 if c==o or (o=='absent' and c=='false') else 1)" "$ORIG_NATIVE" && for f in $Q/steam_library_replica.cjs $Q/evidence/baseline.env $Q/evidence/library-replica.txt; do npx prettier --file-info $f | grep -Eq '"ignored":[[:space:]]*true' || { echo "not prettier-ignored: $f"; exit 1; }; done</automated>
  </verify>
  <done>
- The screen is unlocked, and the idle inhibitor is running and listed, or its failure is recorded
  as a deviation.
- The dev window is up, and its PID's exe is proven to be `src-tauri/target/debug/gamelib-shell`.
- Both process groups (the `setsid` group and the sidecar's own) are recorded.
- No devtools panel is docked.
- `selftest` passes. The text instrument is either smoke-PASSED or recorded UNAVAILABLE with a
  reason.
- `ORIG_NATIVE` is recorded from `config.json` and is UNCHANGED. The toggle is located, its visual
  state matches, and its coordinates are saved.
- `steam_library_replica.cjs` exists and reproduces its own recorded `COUNT` on a re-run.
  `LIB_COUNT` is recorded, and `LIBS_OK=no` is noted if it is 1 or less.
- `baseline.env` holds the LIVE counts that every later check uses.
- `SIGNED_IN` is decided from a viewed grab.
- All three new files sit under the prettier-ignored `.planning` tree, which the verify proves with
  `--file-info` instead of running a vacuous `--check`.
- The app is left running.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Only if Task 1 found Steam sign-in NOT usable or fewer than two Steam libraries on disk, the operator restores whichever precondition failed</name>
  <action>
CHECK AND SKIP FIRST. Both preconditions are mutable.
- LockedHint must read `no`. If it reads `yes`, ask for an unlock first, as in Task 1 Step 0.
- Re-run `find`: it must report the same PID and exe as Task 1.
- Re-run `steam_library_replica.cjs` and read its `COUNT`.
- `grab` and VIEW the Library.
- If the Library lists owned Steam games including a not-installed one AND `COUNT` is at least 2,
  record "both preconditions satisfied live, checkpoint skipped" and continue to Task 3 WITHOUT
  pausing.
- Otherwise pause for the operator, presenting only the part(s) that failed. Signing in needs their
  credentials and a Steam Guard or QR approval. Making a drive or library exist is their hardware
  and their Steam configuration. Claude does neither.
  </action>
  <instructions>
Already done: the HEAD dev build is running with its identity proven, both capture instruments are
self-tested, and native Steam installs are still at their original setting (OFF), untouched.

PART A — only if asked: Steam sign-in.
1. In the GameLib dev window that is open now, sign in to Steam from GameLib's store login screen,
   by QR or credentials.
2. Wait until the Library lists your Steam games.

PART B — only if asked: a second Steam library on disk. The item needs at least two of your
registered Steam libraries to exist right now. At planning time these two did:
`~/.steam/debian-installation` and `/mnt/PopGames/SteamLibrary`. Pick ONE of:
1. Mount the drive behind `/mnt/PopGames` again.
2. Connect one of the two external drives Steam already knows about. It mounts under
   `/media/<you>/Games/SteamLibrary`, or the UUID-named `/media/<you>/.../SteamLibrary`.
3. Add a second library in the Steam client (Settings, then Storage). This is the item's original
   setup step, and it changes your real Steam configuration, so only do it if you want to.
No relaunch of GameLib is needed: it re-reads the library list every time the dialog opens.

You may instead reply "decline". The item is then recorded NOT SCORED and stays open.

Do NOT click Install on any game, and do NOT open any install dialog yourself. The executor opens it
under capture, and turns native installs on only for that moment.
  </instructions>
  <verification>`find` reports the Task 1 PID and exe. A fresh viewed `grab` shows Steam games in the Library. The replica's `COUNT` is at least 2, or the operator declined.</verification>
  <resume-signal>Type "signed in", "library ready", both, or "decline", or describe what blocked you.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Arm row 8 by turning native installs ON for this step only, open "Install with options…" under capture, check each of the four facts independently on both instruments, restore the setting, score honestly, clean up every process, and record the result in the ledger, the narrative and the origin receipt</name>
  <files>.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md, .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md, .planning/ROADMAP.md, .planning/todos/pending/ (FAIL or unscored-anomaly branch only)</files>
  <precondition>Either Task 2 was skipped on a live check or its resume signal arrived, so sign-in is usable and the replica `COUNT` is at least 2, or the operator declined (then take the NOT SCORED path, skipping steps A through G and running H through M). `find` still reports the Task 1 PID with exe `src-tauri/target/debug/gamelib-shell`. LockedHint reads `no`.</precondition>
  <reversibility rating="reversible">Every ledger move is between two arrays in one file. Moving the entry back and re-running ledger-check with the baseline.env counts reverses it. The native-install setting is restored through the same UI toggle, and the restore is verified by a read. On FAIL the operator may prefer the `38-S08` keep-open precedent.</reversibility>
  <read_first>
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx lines 195-263 (default selection and the free-space effect) and 415-566 (what each region renders)
    - src/frontend/screens/Library/components/InstallModal/index.tsx lines 368-402, 415-451 and 586-631
    - src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts lines 182-303
    - src/frontend/screens/Library/components/InstallModal/steamEligibilityProbe.ts lines 276-284 (`applyLibraryFetchPending`)
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx lines 325-412 (the autofocused primary Install button, and the caret)
    - 38-VERIFICATION.md: lines 1-12; the `38-S12` entry (grep `id: "38-S12"`, 9 lines plus the blank after it); the `38-S10` discharged entry, which is the last entry, through the closing fence
    - 38-HUMAN-UAT.md: lines 1-40, and the `## Sitting 7` section to the end of the file
    - 34.13-UAT.md: the receipt block containing `to_item: "38-S12"`, and the single line starting `| G-ROW-8 | tauri |`
    - ROADMAP.md: the FIRST line starting `**Items: ` (grep -n, then read that line only)
  </read_first>
  <action>
ACCIDENTAL DOWNLOAD RULE. This applies from step A until the restore in step I.
- If an install or progress state appears for ANY game, cancel it at once with GameLib's own cancel
  control, then VIEW a grab confirming it stopped.
- Record the appId and the time.
- Record whether an `appmanifest_<appId>.acf` or a new `steamapps/common` directory now exists in
  any library the replica listed. Do NOT delete Steam files yourself; list them for the operator in
  the SUMMARY.
- The item is then NOT SCORED, unless steps D through G had already been fully captured.

A. Arm row 8, as late as possible. Check LockedHint first, and confirm `find` still reports the same
PID and exe.
- If `ORIG_NATIVE` is `false` or `absent`:
  - Navigate to Settings by the route saved in Task 1, and click the toggle at the saved
    coordinates.
  - Re-grab and VIEW: the toggle must show ON.
  - Re-read ONLY the key: it must be `true`. If it is not, retry once through the UI. If it is
    still not `true`, the arming is unprovable: record NOT SCORED and go to H.
  - Crop the grab to the toggle row alone as `settings-native-on.png`.
- If `ORIG_NATIVE` is `true`, record "already ON, no toggle", and re-read to confirm it.
- Re-run the replica. Append its output, under `# Task 3 pre-open <ISO time>`, to
  `library-replica.txt`. `COUNT` must be at least 2; otherwise record NOT SCORED and go to H.
- From here until step I, obey the NATIVE-ON HAZARD in the objective. Send no keys to the window.
  Make no click on any primary Install half.

B. Choose the target and navigate by clicking only.
- The target must be a Steam game that is owned, visible and NOT installed. Confirm its
  `appmanifest_<appId>.acf` is absent from every `steamapps` dir the replica listed as EXISTS.
- Prefer 7 Days to Die (251570), for continuity with sitting 7, if it still qualifies and its page
  offers Install with the caret. Otherwise pick another and record why. Record the title and
  appId.
- Navigate with `xdotool` clicks at coordinates read off a viewed `grab`. No `gamelib://` or
  `heroic://` URL, ever.

C. Negative control, with the dialog CLOSED.
- On the game page, take a `grab` (`pre-open.png`) and a `clients` baseline.
- If the text instrument is available, run `dump` into the scratchpad, then `regions --title
  <title>`. Record the counts. Expected: 0 dialog-role nodes, or at least no dialog subtree
  carrying a `library_dropdown` or `free_space_line` hit.

D. Open the dialog under capture.
- Check LockedHint.
- Click the `SteamInstallCaret`, at coordinates from a viewed grab. Then `grab` and VIEW: the caret
  menu must show "Install with options…", and the page must show NO install progress. Anything else
  triggers the ACCIDENTAL DOWNLOAD RULE.
- Run `burst --out <scratch>/open --pre 0.5 --seconds 6 --click X,Y`, with X,Y on the menu item.
  This is 6 seconds, not sitting 7's 4. The dropdown waits on the library IPC round trip, and the
  free-space line waits on a second round trip, to `checkDiskSpace`. Record the fps, the median
  interval and the click epoch.
- Wait 2 more seconds and check LockedHint. Then take `grab` `dialog-settled.png` and a `clients`
  dump.
- VIEW `dialog-settled.png`. The WHOLE dialog must be in view: the title row, the close X, the
  "Choose Steam library:" select, the "Space Available:" line under it, and the footer INSTALL
  button, with no scrollbar inside the body. If it is clipped, the absence claims are not
  observable: resize or scroll, recapture, and record the deviation.
- Crop the dialog with PIL to `dialog-crop.png`, and VIEW it at full resolution.

E. Transient and late-mount check.
- Copy the burst frames from the first one showing the dialog onward into `<scratch>/settle/`. Add
  `dialog-settled.png` there as `frame_0000000000000.png`, so it sorts first.
- Run `diff <scratch>/settle --flag 0.005`.
- Frames in the first ~500 ms after the dialog first appears (the MUI Slide transition) deviate by
  design. VIEW every flagged frame AFTER that window, plus the max frame, and classify each:
  - EXPECTED LATE MOUNT: the dropdown and/or the free-space line are not yet present, while
    everything else matches the settled dialog. Record the first frame each appears in, as ms after
    the dialog first became visible. This is not a failure. While the library fetch is pending,
    `applyLibraryFetchPending` (`steamEligibilityProbe.ts:276-284`) suppresses the content-light
    notice, so the pending dialog should show neither a notice nor a dropdown.
  - SCORED TRANSIENT: any frame showing the platform row or any wine sub-signature (including a
    "Checking install options" row), or a dropdown or free-space line that VANISHES after first
    appearing.
  - UNSCORED ANOMALY: a content-light notice of either copy, at any moment. It is not one of the
    four facts. Record the frames.

F. Text-tree check. Only if the instrument is available.
- After the settle, and before any further click, run `dump` and then `regions --title <title>`.
- The instrument is VALID only if all of these hold:
  - at least one dialog-role node exists;
  - inside it, `title` is at least 1;
  - the dialog-subtree role histogram includes a push button whose name is the Install label;
  - step C's closed control had no dialog subtree carrying a `library_dropdown` or
    `free_space_line` hit.
  Sitting 7's `content_light_off` condition cannot apply here, because row 8 renders no notice.
  Anything else makes the instrument INVALID for this sitting: record why, and score on the visual
  instrument alone. There is no whole-tree fallback here. Every row-8-unique string is itself one
  of the scored facts, so a fallback would be circular.
- When VALID, each fact's text verdict is its in-dialog count. ABSENT means 0, and PRESENT means at
  least 1.
- Supplementary counts, recorded but NOT verdicts: `COMBO_BOX_COUNT`, plus a one-off Python read of
  the open dump that counts in-dialog rows containing "free of", "default", and each library path
  the replica listed.
- Save ONLY the dialog-subtree lines (role plus text), both `regions` tables and the supplementary
  counts, as `atspi-dialog-subtree.txt`. Whole-window dumps stay in the scratchpad.

G. Per-fact verdicts, then arming corroboration.
- Record each of the four facts on its OWN line in `region-checks.txt`, with these columns:
  - region;
  - expected;
  - the visual observation: what was looked for (the label text and control shape from the
    objective) and what the crop shows at that position;
  - the text-tree in-dialog count, or UNAVAILABLE or INVALID;
  - the transient or late-mount result;
  - the verdict.
- Then record the arming corroboration, which is NOT scored, in the same file:
  - Content-light notice: neither copy rendered on either instrument (`content_light_off` and
    `content_light_single` in-dialog are 0), which agrees with `steamSectionGating.ts:293`.
    - If the OFF copy (`contentLightNotice`) rendered INSTEAD of a dropdown, the backend saw native
      OFF. If the single-library copy rendered instead, the IPC list held at most one library while
      the replica held more. Either way the dropdown is ABSENT, which is a FAIL through fact 2,
      with that mechanism recorded.
    - If a notice rendered ALONGSIDE a dropdown, that is impossible by construction. Record it as
      an unscored anomaly.
  - Option list:
    - Click the "Choose Steam library:" select. `grab` and VIEW it as `dropdown-open.png`, and
      record every option label.
    - Expected: exactly the replica's EXISTS paths, in the replica's order, with the first one
      suffixed "(default)".
    - Close the menu by clicking the option that is ALREADY selected, the "(default)" one. MUI
      fires `onChange` only for a changed value, so nothing changes. Never click another option.
    - Re-grab and VIEW: the selected value is unchanged, and the free-space line is still present.
    - A mismatch with the replica is recorded as a discrepancy in the replica's faithfulness, and
      the result says so.
  - `df -h` of the default library's `steamapps` dir, beside the rendered "<free> free of <total>".
    Recorded; unit rounding may differ.
  - The header platform icons, as seen, marked NOT the platform row.
- Close the dialog with its header X. `grab` and view to confirm it is gone. Do NOT click Install.
- From `gamelib.log`, extract the lines from the open second through +10s that contain
  `SteamDialog`, `SteamGame`, `InstallModal`, `34.13` or `ERROR` into `log-excerpt.txt`. Write "no
  matching lines" if there are none. A `34.13-12 InstallModal: Steam library target fetch failed`
  line means the library IPC rejected.

H. Score. Exactly one outcome applies. Do not retry to get a different answer.
- PASS when ALL of these hold:
  - identity is proven;
  - arming was proven at step A (config `true`, and a replica `COUNT` of at least 2);
  - the whole dialog was in view;
  - the platform row and the wine section (all three sub-signatures) are ABSENT on the visual
    instrument, AND on the text instrument when it is VALID;
  - the library dropdown and the free-space line are PRESENT on the visual instrument AND on the
    text instrument when it is VALID, and each stayed present from its first appearance until close;
  - no scored transient was found.
- FAIL when any of the four facts contradicts its expectation on EITHER instrument. That includes:
  a scored transient; an in-dialog text-tree hit for an ABSENT region that the pixels do not show
  (mounted but not visible); and a PRESENT region that the pixels do not show. Record exactly what
  was seen, and where.
  - One carve-out: a PRESENT region that is visible in the pixels but has an in-dialog count of 0
    on a VALID text instrument is NOT a fail of the item. The instrument did not expose it. Score
    that fact on the visual instrument, and state it in the result's limits.
- NOT SCORED when: arming could not be proven (including the operator declining in Task 2); the
  dialog could not be opened; it could not be brought fully into view; the visual instrument
  failed; or the screen stayed locked with no operator to unlock it.

The result must state these honest limits:
- The free-space line is the dropdown's `afterSelect`, and `freeSpaceLine === libraryDropdown` by
  construction (`:284`). Its presence ALSO needs a live `checkDiskSpace` answer for the default
  library, so it is a genuine second observation, but not an independent gating path.
- `wineSection` requires `isMac` (`steamSectionGating.ts:264-265`), so the wine verdict confirms
  that the render agrees with a by-construction false.
- `hostPlatform` = `'linux'` is established by source (`src/preload/tauriAttach.ts:77`) and by the
  host. The observed absent row itself excludes `darwin` and `win32`.
- `libraryCount` was not read from the webview. It is corroborated by the replica and by the
  rendered option list.
- Only the default library selection was observed. Per-library free space (D-08) is not this item,
  and the two unmounted registered libraries were not exercised.
- The burst interval bounds the shortest detectable flash.
- The text instrument sees what WebKitGTK exposes to AT-SPI, not the DOM.
- There was no operator eyeball.
- Nothing was dispatched: neither the `shell.openExternal` leg nor a native download ran.
- Native installs were ON only for this step, and were restored to `ORIG_NATIVE`.

I. Cleanup. ALWAYS run this, including after any STOP in any task. Order matters.
- Restore FIRST, while the app still runs. If step A toggled the setting:
  - navigate to Settings and click the toggle, then VIEW a grab showing it OFF;
  - re-read the key: it must equal `ORIG_NATIVE`. If `ORIG_NATIVE` was `absent`, `false` is the
    runtime default; record that;
  - crop to the toggle row as `settings-native-restored.png`.
- If the app is gone before the restore, relaunch it per Task 1 Steps 4 to 6 under the same arm,
  re-prove its identity, restore through the UI, re-read the key, and continue.
- NEVER hand-edit `config.json`. If the restore still fails, the FIRST line of both the SUMMARY and
  the return message must say that native Steam installs were left ON in the operator's real
  profile, and why.
- Send `kill -TERM` to the negative `setsid` PGID AND, separately, to the sidecar's recorded PGID.
  Before signalling the sidecar group, confirm with `ps -o pid,args -g <pgid>` that it holds only
  this run's sidecar.
- Wait up to 20 seconds, then `kill -KILL` whatever remains of either group.
- Kill the idle inhibitor's PID. `gnome-session-inhibit -l` must list nothing for `260929-hgm`.
- Verify that bracketed-pattern `pgrep -af` finds no `[g]amelib-shell`, `[b]uild/main/sidecar.js`
  or `[t]auri dev`, and no `[v]ite` whose args contain this repo's path. `ss -Hltn '( sport =
  :5173 )'` must be empty. Record the final census.
- Do NOT stop the Steam client. Do NOT read or delete the dev vault.
- Delete the scratchpad bursts, dumps, Settings grabs and transcript once the evidence is copied out.

J. Evidence. Write it into this quick task's `evidence/`, next to `baseline.env` and
`library-replica.txt`.
- PNGs: `settings-native-on.png`, `settings-native-restored.png` (toggle row only), `pre-open.png`,
  `dialog-settled.png`, `dialog-crop.png`, `dropdown-open.png`, and `transient-<ms>.png` for any
  classified flagged frame worth keeping.
- `region-checks.txt`, `atspi-dialog-subtree.txt` (or one line stating UNAVAILABLE or INVALID and
  why), and `log-excerpt.txt`.
- `burst-summary.txt`: the fps, interval and click epoch; the settle-diff max with its frame; the
  post-transition flagged frames with their classification; the late-mount latencies; and any
  `clients.jsonl` new windows with PID, exe basename, WM_CLASS and title. None is expected, because
  the dialog is in-webview.
- Privacy gate:
  - VIEW every PNG. Crop or drop any that shows a Steam account name, avatar, SteamID or e-mail.
  - OS filesystem paths such as `/home/graysonmitchell/...` and `/mnt/PopGames/...` are NOT Steam
    account identifiers, and already appear in committed planning text. They may stay.
  - No text file may contain a 17-digit run, or a hit for the credential regex in this task's
    verify.
  - Check window titles and the AT-SPI lines for account names.

K. Records. Use scoped Edits only; never Write an existing file. Substitute the RESULT word (PASS
or FAIL), `SDATE`, the counts from `baseline.env`, `PRE_SHA` and the measured values.

`38-VERIFICATION.md`, on PASS or FAIL:
- Remove the whole `38-S12` entry, from `  - id: "38-S12"` through its `prior_state:` line, plus
  ONE following blank line. Exactly one blank line must remain between the preceding entry's last
  line and the next `  - id:`.
- Append the entry at the END of `human_verification_discharged`, directly after the last entry's
  `prior_state:` line (`38-S10`'s at planning time) and before the closing fence.
- Field order: `id`, then `result`, then every original field VERBATIM in its original order:
  `test`, `expected`, `why_human`, `blocked_by`, `platform_gate`, `origin_phase`, `origin_item`,
  `prior_state`.
- `result` is single-quoted, with apostrophes doubled. It opens
  `<RESULT> -- sitting 8, <SDATE>, LINUX (the third Linux sitting).` and states:
  - the host and session;
  - the build `pnpm tauri:dev` DEBUG at `<PRE_SHA>`, identity PROVEN via PID and `/proc/<pid>/exe`;
  - the real-profile arm, in one or two sentences, including that the arming reads the operator's
    real Steam libraries, and that nothing was dispatched;
  - the game title and appId, and the route used to open the dialog;
  - ARMING:
    - the native setting's original value, that it was toggled ON through Settings for the scored
      step only, and restored (with the value read back);
    - the replica's COUNT and the paths that EXIST, with the sentinel and the unmounted paths
      named as MISSING;
    - that no library registration was needed, contrary to the item's own `blocked_by:`;
    - the rendered option list;
    - that neither content-light notice rendered;
  - ALL FOUR verdicts, each named, each with its visual observation and its text-tree count, in the
    sitting-7 style ("All four checks scored INDEPENDENTLY: …");
  - the late-mount latencies and the transient check (fps, interval, post-transition flagged
    frames and their classification);
  - the header-icons note;
  - the text-instrument validity, with its controls;
  - the honest limits from H;
  - that `38-S14` and `38-S16`'s Linux half were not scored;
  - the evidence directory path;
  - `quick 260929-hgm`.
- A FAIL result additionally quotes what rendered, names the todo by filename, and cites the
  `38-W03`/`38-W06` discharge-as-FAIL precedent (reversible to the `38-S08` keep-open precedent).
- `score:` is single-quoted, so double every apostrophe you write.
  - Replace `<O> relocated items OPEN, <D> discharged` with the `O-1` and `D+1` values.
  - Insert `; sitting 8, <SDATE> (LINUX): `38-S12` <RESULT>, closed via quick `260929-hgm``
    immediately before the FIRST `), <R> retired.` in the field.
  - Insert a history clause immediately before the FIRST ` (Was ` in the field. It opens
    `(Was <O> until <SDATE>, when quick `260929-hgm` DISCHARGED `38-S12` <RESULT> from sitting 8
    --`, gives a one-to-three-sentence reason (including that the two existing registered
    libraries armed `hasChoice` without a registration step), and ends
    `Confirmed at the tool: gsd-core audit-uat `by_phase["38"]` moved <AUDIT38> -> <AUDIT38-1> and total_items <TOTAL> -> <measured>, which is the check that the array still parses -- a FLAT count after a removal would mean the edit did not register or the array failed to parse.)`
    followed by a single space.
- On NOT SCORED instead: leave the entry in place. Insert a double-quoted `<SKEY>:` field directly
  after its `id:`, stating NOT SCORED, why, what was observed, and the replica COUNT. There is no
  count change, no `score:` edit, and no 34.13 or ROADMAP edit.

`38-HUMAN-UAT.md`:
- Frontmatter: append one double-quoted `sessions:` string,
  `Sitting 8 -- <SDATE>, Linux (Pop!_OS 22.04, X11), tauri dev build `<PRE_SHA>`, identity proven by PID -- 38-S12 <RESULT>`.
- Set `updated:` to `<SDATE>`. Leave `source:` unchanged: `--human-uat` asserts exactly 3 entries.
- In the `## Current Test` bracket paragraph, use a multi-line `old_string` spanning from
  `Sitting 7, the second Linux sitting, scored` through `section below.]`.
  - Replace sitting 7's placeholder phrase "the ledger now holds the new counts" with the actual
    post-sitting-7 counts from ROADMAP's sitting-7 paragraph (8 open, 18 discharged, 10 retired).
  - Before the `]`, add one sentence: Sitting 8, the third Linux sitting, scored `38-S12`
    <RESULT>, so the ledger now holds <O-1> open, <D+1> discharged and <R> retired items; see the
    "## Sitting 8" section below.
  - Wrap it to match the surrounding lines. On NOT SCORED, the sentence says so and names no new
    counts.
- Append at the end of the file a section headed
  `## Sitting 8 — <SDATE>, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `<PRE_SHA>``.
  It contains:
  - Conditions:
    - the identity proof;
    - the real-profile arm, and exactly which parts of earlier sittings' justifications carry over;
    - arming, with the setting's original value, the toggle, the restore and the read-backs;
    - the replica's five candidates, with the note that no registration was needed;
    - whether Task 2 was skipped;
    - the lock and inhibitor handling;
    - the Steam client state (informational);
    - the two instruments, with their self-test and control results;
  - the four-row region table from `region-checks.txt`;
  - the arming-corroboration notes (no content-light notice; the option list);
  - the late-mount and transient check;
  - the header-icons note;
  - the result;
  - an honest-limits paragraph;
  - a line that `38-S14` and `38-S16`'s Linux half were NOT scored;
  - the artifact paths.
- THE NEW SECTION MUST CONTAIN NO `### <number>.` heading, and NO line starting at column 0 with
  `expected:` or `result:`.

`34.13-UAT.md`, on PASS or FAIL only:
- Replace the `outcome:` of the receipt whose `to_item` is `"38-S12"`. Use a multi-line
  `old_string` from `to_item: "38-S12"` through its `outcome: "open — not yet run in phase 38"`,
  because that literal repeats in the file. Leave the receipt's `blocked_by:` as it is: it is
  history.
- The new value is double-quoted, with NO inner double quotes and NO backslashes. It opens
  `DISCHARGED <RESULT> <SDATE> by quick 260929-hgm (Phase 38 sitting 8, Linux, Pop!_OS 22.04, tauri dev build <PRE_SHA>).`
  and gives one or two sentences with the four verdicts, and with the fact that two already
  registered libraries on disk armed it without a registration step.
- In the body table, change `| G-ROW-8 | tauri | RELOCATED |` to
  `| G-ROW-8 | tauri | RELOCATED → **<RESULT> in Phase 38 (<SDATE>)** |`.
- THE FILE-LEVEL CENSUS CANNOT SEE THIS EDIT. The frontmatter already stops parsing at the pinned
  `(62:176)` error, which is BEFORE this receipt. So validate the edited receipt in isolation with
  the js-yaml one-liner in verify. Do NOT touch the pinned error: repairing it turns
  `pnpm planning-gates` red with a stale pin.

`ROADMAP.md`, on PASS or FAIL only:
- Locate the FIRST line starting `**Items: ` (the current count paragraph).
- Insert a new paragraph and a blank line before it. It opens
  `**Items: <O-1> OPEN as of <SDATE> (sitting 8), plus <D+1> DISCHARGED and <R> RETIRED**`
  (quick `260929-hgm`). In two to four sentences it records the third Linux sitting and the
  `38-S12` result, and points to `38-HUMAN-UAT.md`'s `## Sitting 8`.
- In the same Edit, append ` (historical, superseded by the sitting-8 count above)` directly after
  the old paragraph's bold span.

Todos. At most one per branch, each at `.planning/todos/pending/<SDATE>-<short-slug>.md`.
- On FAIL:
  - Frontmatter keys, in this order:
    - `created: <SDATE>`;
    - a single-quoted `title` naming what rendered;
    - `found_during: Phase 38 sitting 8 (quick 260929-hgm)`;
    - `severity: major` (D-18/D-02/D-08 section gating is broken on Linux; downgrade only with a
      vocabulary-table reason);
    - `platform: linux` immediately after;
    - `ready: live-gate` immediately after;
    - `area: steam-install`;
    - `files`: the code anchors.
  - Body: what rendered, verbatim, with evidence file names; a mechanism hypothesis LABELLED as a
    hypothesis; and re-verification by re-running this sitting's steps A to H.
- On an UNSCORED ANOMALY (a content-light notice flash, or a notice rendered alongside the
  dropdown): the same key order, with `severity: medium`, and a body stating that it was NOT
  scored against `38-S12`.
- Values must be bare and lowercase.

L. Validate everything BEFORE committing. Do not edit `.planning/STATE.md`.

M. Commit in ONE Bash invocation.
- `git add` the exact paths: `steam_library_replica.cjs`, `evidence/`, the three phase files,
  `ROADMAP.md`, and any todo. Do NOT add the untracked `.planning/spikes/025-*` files that were
  already present at planning time.
- Check that `git diff --cached --name-only` lists only those paths, then commit.
- Message: `docs(quick-260929-hgm): Phase 38 sitting 8, third Linux sitting -- 38-S12 <RESULT>`.
  End it with this session's attribution lines.
- Every path is under the prettier-ignored `.planning` tree. The verify proves that with
  `--file-info`; no vacuous `--check` is run.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && P38=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma && U=.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md && . $Q/evidence/baseline.env && NEW_IDS=$(echo "$OPEN_IDS" | tr , '\n' | grep -vx 38-S12 | paste -sd, -) && node $L --open $((O-1)) --discharged $((D+1)) --retired $R --human-uat --open-ids "$NEW_IDS" --discharged-includes 38-S12 --includes 'discharged:38-S12:result=260929-hgm' --includes 'discharged:38-S12:result=sitting 8' --includes 'discharged:38-S12:result=src-tauri/target/debug/gamelib-shell' --includes 'discharged:38-S12:result=INDEPENDENTLY' --includes 'discharged:38-S12:test=LINUX host, tauri runtime' --includes 'discharged:38-S12:platform_gate=steamSectionGating.ts:182-207' --includes 'discharged:38-S12:blocked_by=register a SECOND Steam library' --includes "top:score=$((O-1)) relocated items OPEN, $((D+1)) discharged" --includes "top:score=(Was $O until $SDATE" && if node $L --open $O --discharged $D --retired $R >/dev/null 2>&1; then echo 'NEGATIVE CONTROL DID NOT FAIL'; exit 1; fi && node $L --rev $PRE_SHA --open $O --discharged $D --retired $R --includes 'open:38-S12:test=LINUX host, tauri runtime' >/dev/null && node $L --census --expect-bad $CENSUS_BAD | grep -F '34.13-UAT.md' | grep -qF '(62:176)' && node -e 'const y=require("js-yaml"),L=require("fs").readFileSync(process.argv[1],"utf8").split("\n"),i=L.findIndex(l=>l.includes("to_item: \"38-S12\""));const o=y.load(L.slice(i-2,i+5).join("\n"));if(!/^DISCHARGED (PASS|FAIL) /.test(o[0].outcome)){console.error("receipt outcome not parsed as DISCHARGED");process.exit(1)}' $U && grep -q '^| G-ROW-8 | tauri | RELOCATED → \*\*' $U && grep -q '^## Sitting 8 — ' $P38/38-HUMAN-UAT.md && ! awk '/^## Sitting 8 — /{s=1} s' $P38/38-HUMAN-UAT.md | grep -Eq '^(### [0-9]+\.|expected:|result:)' && grep -q "Items: $((O-1)) OPEN as of $SDATE (sitting 8)" .planning/ROADMAP.md && ls $Q/evidence/dialog-settled.png $Q/evidence/dropdown-open.png $Q/evidence/region-checks.txt $Q/evidence/library-replica.txt >/dev/null && ! grep -Eq '[0-9]{17}' $Q/evidence/*.txt $Q/evidence/baseline.env && ! grep -Eiq 'refresh.?token|access.?token|password' $Q/evidence/*.txt && python3 -c "import json,os,sys; d=json.load(open(os.path.expanduser('~/.config/GameLib/config.json'))).get('defaultSettings',{}); o=sys.argv[1]; c=json.dumps(d['enableSteamNativeInstall']) if 'enableSteamNativeInstall' in d else 'absent'; sys.exit(0 if c==o or (o=='absent' and c=='false') else 1)" "$ORIG_NATIVE" && ! gnome-session-inhibit -l 2>/dev/null | grep -q 260929-hgm && test -z "$(pgrep -af '[g]amelib-shell|[b]uild/main/sidecar.js|[t]auri dev')" && test -z "$(ss -Hltn '( sport = :5173 )')" && pnpm -s planning-gates && for f in $P38/38-VERIFICATION.md $P38/38-HUMAN-UAT.md $U .planning/ROADMAP.md $Q/evidence/region-checks.txt; do npx prettier --file-info $f | grep -Eq '"ignored":[[:space:]]*true' || { echo "not prettier-ignored: $f"; exit 1; }; done</automated>
  </verify>
  <done>
- `38-S12` was scored from a HEAD dev build with proven identity. Row 8 was armed and proven
  independently of the dialog, at the scored moment: config `true`, and a replica `COUNT` of at
  least 2. It was corroborated by the dialog's option list and by the absence of any content-light
  notice.
- Each of the four facts carries its own verdict and its own evidence, on the visual instrument
  and, when valid, the text instrument, plus a transient and late-mount check.
- PASS or FAIL: the entry was MOVED to `human_verification_discharged` with every original field
  verbatim, including the historical `blocked_by:`.
  - The counts are `O-1`/`D+1`/`R` from the LIVE baseline, and audit-uat `by_phase['38']` dropped
    by exactly one with `parse_gap_files` 0.
  - The old counts FAIL on the live file (negative control), while `PRE_SHA`'s blob still shows
    `38-S12` open.
  - `34.13-UAT.md`'s receipt parses in isolation as DISCHARGED, and its pinned `(62:176)` error is
    unchanged.
  - `38-HUMAN-UAT.md` has the sessions entry and a parser-safe `## Sitting 8`.
  - ROADMAP's count paragraph is current.
  - On FAIL, a CI-valid todo exists.
- On NOT SCORED, run the alternative verify instead:
  `. $Q/evidence/baseline.env && node $L --open $O --discharged $D --retired $R --human-uat --includes "open:38-S12:$SKEY=NOT SCORED"`,
  plus the census, privacy, native-restored, inhibitor, process and planning-gates checks above.
  There is no 34.13 or ROADMAP edit.
- `enableSteamNativeInstall` reads back as `ORIG_NATIVE`.
- No process from this run survives, including the sidecar's own group and the idle inhibitor.
  Nothing listens on :5173.
- The Steam client, the dev vault and `libraryfolders.vdf` are untouched. No install was
  dispatched.
- Committed evidence passes the privacy gate. `pnpm planning-gates` is green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| live app, real profile -> committed repo evidence | Screenshots, AT-SPI text and window titles from the operator's real Steam session cross into a public repo |
| this task -> the operator's real GameLib settings | `enableSteamNativeInstall` is flipped ON for the scored step, and must come back to its recorded original value |
| native installs ON -> real library disks | While ON, one wrong click or keypress starts a real depot download into a real Steam library |
| running binary -> recorded build identity | What ran can differ from what the record claims (the sitting-5 stale-build incident) |
| ledger edit -> gsd-core audit-uat | One YAML slip silently removes Phase 38 from the audit; `34.13-UAT.md` is already unparseable before the edited receipt, so the file census cannot see a new error there |
| this task's process tree -> the operator's desktop | The dev servers, a separately-grouped sidecar and the idle inhibitor can outlive the task |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260929-hgm-01 | Information disclosure | evidence PNGs, `atspi-dialog-subtree.txt`, window titles | high | mitigate | Captures are window-region only, and the Settings captures are cropped to the toggle row. Every PNG is VIEWED, and cropped or dropped if it shows an account name, avatar, SteamID or e-mail. Only DIALOG-subtree AT-SPI lines are committed; whole-window dumps and Settings grabs stay in the scratchpad and are deleted. The verify fails on any 17-digit run or on the credential regex. OS filesystem paths are explicitly not account identifiers. |
| T-260929-hgm-02 | Information disclosure | `/tmp/gamelib-dev-secret-vault.json`, `~/.steam/steam.token` | medium | accept | This is the by-design DEV-ONLY vault on a single-user host. It is never read, printed or copied; only its mode is recorded. The replica reads only `libraryfolders.vdf` under `~/.steam` and one `config.json` key, never the token file. |
| T-260929-hgm-03 | Tampering | operator's `enableSteamNativeInstall` | high | mitigate | `ORIG_NATIVE` is read before launch, and Task 1 verifies it is unchanged. The setting is flipped through the UI only, as late as step A, and restored FIRST in step I before any teardown, with a read-back. If the app died, it is relaunched to restore; `config.json` is never hand-edited. The Task 3 verify fails unless the key reads back as `ORIG_NATIVE`, and a failed restore must lead both the SUMMARY and the return message. |
| T-260929-hgm-04 | Tampering | accidental native depot download | high | mitigate | Only `games.ts`'s install paths read the flag (`:1121`, `:1185`), so the risk exists only on an Install press. While the flag is ON: no keyboard input reaches the window (the primary Install button is `autoFocus`); only the caret, the menu item, the select, the already-selected option and the header X are clicked; the caret menu is VIEWED before the burst clicks the item; and Install inside the dialog is never clicked. The ACCIDENTAL DOWNLOAD RULE cancels through GameLib's own control and lists leftovers for the operator without deleting Steam files. |
| T-260929-hgm-05 | Repudiation / Tampering | recorded build identity and arming | high | mitigate | `_NET_WM_PID` -> `/proc/<pid>/exe` must equal `src-tauri/target/debug/gamelib-shell`, and the tree must be clean for `src src-tauri package.json` at launch. `PRE_SHA` is recorded, and no deep links are used. Arming is proven by a config read-back plus a committed replica whose output is committed, re-run immediately before the scored open. |
| T-260929-hgm-06 | Tampering | `38-VERIFICATION.md` / `38-HUMAN-UAT.md` / `34.13-UAT.md` frontmatter | high | mitigate | `ledger-check.cjs` checks the LIVE-baseline counts, ids, includes (including the verbatim `blocked_by`), `parseVerificationItems` and live `audit-uat`. There is a negative control on the old counts and a `--rev` check on the pre-task blob. The 34.13 receipt is parsed IN ISOLATION with js-yaml. `pnpm planning-gates` runs, and the new HUMAN-UAT section is grep-checked for item-shaped lines. |
| T-260929-hgm-07 | Denial of service | orphaned `gamelib-shell`, sidecar, vite and inhibitor processes | medium | mitigate | Both the `setsid` PGID and the sidecar's own PGID are recorded at launch and killed TERM then KILL. The sidecar group is confirmed to be this run's before signalling. The inhibitor's PID is recorded and killed. The verify asserts no bracketed-pattern match, an empty :5173, and no `260929-hgm` inhibitor. Cleanup runs on every STOP path. |
| T-260929-hgm-08 | Tampering | Steam-side state (`libraryfolders.vdf`, mounts, the client) | low | mitigate | Claude never edits `libraryfolders.vdf` (Steam rewrites it anyway), never mounts or registers a library, and never stops or drives the Steam client. Only the operator may add a library, in Task 2's fallback, and only by choice. |
| T-260929-hgm-09 | Denial of service | the operator's screen-lock behaviour | low | accept | `gnome-session-inhibit --inhibit idle` suppresses idle-lock only while its process lives. It changes no setting, is killed in step I, and its absence is verified. |
</threat_model>

<verification>
- Task 1 verify: the screen is unlocked; `selftest` passes; the log sink exists; ledger-check passes
  on the LIVE `baseline.env` counts with `38-S12` still open; the replica reproduces `LIB_COUNT`;
  `enableSteamNativeInstall` is still `ORIG_NATIVE`; all three new files are proven
  prettier-ignored.
- Task 2: skipped on a live check of sign-in AND the replica count, or the operator's resume
  signal, re-checked with `find`, a viewed `grab` and a replica re-run.
- Task 3 verify: the discharge-path command above, or the NOT SCORED alternative in its done block.
  Both include the native-restored read-back and the process and inhibitor checks.
- Across the whole task: audit-uat `by_phase['38']` moves exactly `AUDIT38 -> AUDIT38-1` on
  discharge and stays flat on NOT SCORED. `total_items` is recorded before and after.
</verification>

<success_criteria>
- The ledger states a true, evidenced result for `38-S12`: PASS or FAIL and discharged, or NOT
  SCORED and left open. It is backed by:
  - a proven build identity;
  - row-8 arming proven independently of the dialog (config plus replica) and corroborated by it
    (option list, no notice);
  - four independently recorded verdicts on two instruments, plus a transient and late-mount check.
- The operator's native-install setting is back to its original value, and a read proves it.
- Phase 38 stays audit-visible with `status: human_needed`, and every count agrees across the
  ledger, `audit-uat`, `38-HUMAN-UAT.md`, `34.13-UAT.md` and ROADMAP.md.
- Nothing from this run is left running. Nothing committed identifies the operator's Steam account.
  Nothing was installed.
- The SUMMARY records:
  - every re-measured baseline value from `baseline.env`;
  - the replica output from Task 1 and from the pre-open re-run;
  - whether Task 2 was skipped, and why;
  - the lock and inhibitor handling;
  - the text instrument's validity and why;
  - the fps, interval, settle-diff result and late-mount latencies;
  - the native-setting round trip, with its values;
  - `38-S16`'s Linux half and `38-S14` as the remaining Linux and Windows candidates.
</success_criteria>

<output>
Create `.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/260929-hgm-SUMMARY.md` when done.
</output>
