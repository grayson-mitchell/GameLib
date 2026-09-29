---
phase: quick-260929-ata
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py
  - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
  - .planning/ROADMAP.md
  - .planning/todos/pending/ (FAIL branch only, one new todo)
autonomous: false
requirements:
  - QUICK-260929-ATA
estimate:
  tokens: 140000
  raw_tokens: 140000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "38-S10 was observed LIVE on this Linux host (Pop!_OS 22.04, X11, DISPLAY :1) against a dev build whose identity is PROVEN: the GameLib window's `_NET_WM_PID` resolves through `/proc/<pid>/exe` to `src-tauri/target/debug/gamelib-shell`, and `git status --porcelain -- src src-tauri package.json` was empty at launch."
    - "Each of the five region facts (platform row, library dropdown, wine section, free-space line, content-light notice) has its OWN recorded verdict and its OWN evidence line. None is inferred from another and none from a single screenshot glance."
    - "Row 7's arming is PROVEN, not assumed: native installs OFF is read from `~/.config/GameLib/config.json` AND corroborated by WHICH notice string rendered (`contentLightNotice`, not `contentLightSingleLibraryNotice`; `SteamDialog/index.tsx:539-547`)."
    - "The ledger records what was observed: PASS or FAIL moves `38-S10` to `human_verification_discharged`; NOT SCORED leaves it open with a dated note. Counts are the LIVE baseline measured at execute time, minus/plus one. `ledger-check.cjs` passes and audit-uat `by_phase['38']` drops by exactly one on discharge."
    - "No process this task started survives it, including the sidecar in its own process group. No committed evidence carries a Steam account identifier."
  artifacts:
    - ".planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py: AT-SPI text-tree dump plus region-signature counter, the second independent instrument"
    - ".planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/: baseline.env, window-region PNGs, region-checks.txt, atspi-dialog-subtree.txt, burst-summary.txt"
    - "38-VERIFICATION.md: `38-S10` relocated per the observed outcome; `score:` updated"
    - "38-HUMAN-UAT.md: `sessions:` entry plus a `## Sitting 7` section"
  key_links:
    - "`resolveSteamSectionGating` (`steamSectionGating.ts:172-303`) -> `InstallModal/index.tsx:511` `platformRowMode` -> `platformSelection()` returns null at `:591-593` for `'absent'`; `SteamDialog/index.tsx:482-549` mounts the wine notice, library `SelectField`, free-space `afterSelect` and content-light `.infoBox` from the same verdict."
    - "`window.platform` is derived in the webview from `navigator.platform` (`src/preload/tauriAttach.ts:77`): anything neither mac nor windows becomes `'linux'`, which is the `hostPlatform` input the `'absent'` branch keys on."
    - "`38-VERIFICATION.md` frontmatter -> strict YAML -> gsd-core `audit-uat`. One unescaped quote drops Phase 38 from the audit silently; `ledger-check.cjs` and `pnpm planning-gates` are the checks."
---

<objective>
Run Phase 38 item `38-S10` LIVE on this Linux machine as Sitting 7 and record the true result.

The item, verbatim from `38-VERIFICATION.md` (lines 36-44 at planning time):
- test: "Section-gating matrix row 7 on a LINUX host, tauri runtime — native installs OFF, or ON
  with <=1 library."
- expected: "The platform row does NOT render at all (D-18); library dropdown, wine section and
  free-space line ALL ABSENT; content-light notice PRESENT (D-20/Q6). All four checked
  independently."
- platform_gate: `steamSectionGating.ts:182-207`. Keep that field VERBATIM when relocating.

THIS IS A LIVE OBSERVATION, NOT A CODE CHANGE. The executor launches `pnpm tauri:dev`, clicks with
`xdotool`, captures with the EXISTING capture instrument, reads the accessibility tree with a new
small AT-SPI probe, and records. No file under `src/` or `src-tauri/` is edited. Number this sitting
"Sitting 7", continuing after Linux Sitting 6 (quick `260928-tvk`).

SCORED SURFACE. The rendered content of the Steam "Install with options…" dialog (`SteamDialog`,
opened through the `SteamInstallCaret` menu or the GameCard context menu). The executor OPENS the
dialog, observes it, and CLOSES it. It NEVER clicks Install inside the dialog, so nothing is handed
off to Steam and nothing downloads.

The five facts, each with its code anchor and the text signature that identifies it. Confirm every
signature against `public/locales/en/*.json` at execute time with a Python json read; the catalogue
is the source of truth, and a drifted catalogue value replaces the fragment listed here.
1. Platform row, expected ABSENT. `platformSelection()` at `InstallModal/index.tsx:590-631`: a MUI
   `SelectField`, htmlId `platformPick`, label `game.platform` in `gamepage.json` ("Select Platform
   Version to Install") plus a colon. It returns null for `'absent'` (`:591-593`). The platform
   ICONS beside the title in the dialog header (`SteamDialog/index.tsx:419-426`,
   `InstallModal__platformIcon`) are NOT the platform row. Do not score them. Record them as seen.
2. Library dropdown, expected ABSENT. `SteamDialog/index.tsx:491-529`: `SelectField` htmlId
   `steamLibraryPick`, label `gamelib:steam.install.libraryPickerLabel` ("Choose Steam library").
3. Wine section, expected ABSENT. Three signatures, all must be absent:
   - the `WineSelector` at `InstallModal/index.tsx:670-708`, whose labels include "Show Wine
     settings", "WinePrefix", "CrossOver Bottle" and "Wine version" (match case-insensitively);
   - the `sharedBottleNotice` `.infoBox` at `SteamDialog/index.tsx:482-490` ("used for every Steam
     game that needs a bottle");
   - the slot's pending occupant `EligibilityLoadingRow` ("Checking install options"), which
     should never mount on Linux because `shouldProbeEligibility` returns false there
     (`steamEligibilityProbe.ts:86-92`).
4. Free-space line, expected ABSENT. The library dropdown's `afterSelect` at
   `SteamDialog/index.tsx:500-516`: "Space Available" (`install.disk-space-left` in
   `gamepage.json`) followed by "<free> free of <total>".
5. Content-light notice, expected PRESENT. The `.infoBox` at `SteamDialog/index.tsx:530-549`.
   With native OFF it shows `gamelib:steam.install.contentLightNotice` ("This installs through
   Steam's own client… Turn on native Steam installs in Settings…"). With native ON it shows
   `contentLightSingleLibraryNotice` ("There's only one Steam library on this system…"). WHICH
   one rendered is recorded as arming evidence. Exact-copy scoring and the `.infoBox` container
   check belong to `38-S16`'s Linux half and are NOT scored here.

Two instruments, applied to each fact separately:
- VISUAL: window-region PNGs from
  `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`.
  Reuse it AS-IS, by path. Do not copy or modify it. Its subcommands are `find`, `selftest`,
  `grab`, `clients`, `burst` and `diff`.
- TEXT TREE: the new `atspi_dialog_probe.py` written in Task 1. It reads the AT-SPI accessibility
  tree the running app exposes. At planning time, `gi.repository.Atspi` and `pyatspi` both
  imported, the a11y bus was live and listed 18 apps, and `GTK_MODULES=gail:atk-bridge` was set.
  Whether WebKitGTK exposes the dialog's web content through it is UNPROVEN. Task 1 smoke-tests
  it, and Task 3 gives it its own positive and negative control. If it cannot be proven, record it
  as UNAVAILABLE with the reason and score on the visual instrument alone. That is not a STOP.

DECLARED REAL-PROFILE ARM (CLAUDE.md two-profile rule, half 2). This sitting runs under the
operator's REAL `HOME`, on purpose. The justification is stated for THIS item, not inherited:
- The item needs an owned, not-installed Steam game in a signed-in GameLib Library. That session
  lives in the real profile: `~/.config/GameLib/`, deliberately left in place after sitting 6,
  plus the dev vault `/tmp/gamelib-dev-secret-vault.json` (mode 0600). A fake HOME would show an
  empty Library and force a fresh operator sign-in into a disposable profile.
- The arming condition, `defaultSettings.enableSteamNativeInstall`, is the operator's real
  setting. The real `~/.steam` tree is what `getSteamLibraries()` reads on this host.
- Sitting 6's primary justification, the `shell.openExternal` hand-off through `xdg-open` to the
  real Steam client, does NOT carry over. This sitting never clicks Install, so that leg is never
  exercised. Say so in the record.
- Isolation still applies to every capture. Raw bursts, whole-window AT-SPI dumps (which can
  contain the account name) and the `tauri:dev` transcript go to the session scratchpad, and are
  deleted at cleanup. Only vetted, redacted evidence is committed.

Facts measured at planning time (2026-09-29, HEAD `ecd214a6f`). EVERY ONE IS MUTABLE. Re-measure at
execution and record the executed value.
- Ledger: 9 open / 17 discharged / 10 retired. audit-uat `by_phase['38'] == 9`,
  `total_items == 428`, `parse_gap_files == 0`.
- Census: 80 ok, 2 no-frontmatter, 3 bad. `34.13-UAT.md` still fails at its pinned `(62:176)`.
  Quick `260929-9qr` edited this ledger after sitting 6, so do not trust any count written here.
- Processes: no `gamelib-shell`, sidecar or `tauri dev` was running. The Steam desktop client WAS
  running (`pgrep -x steam`). That is contrary to the orchestrator's note, and it is not needed by
  this item either way.
- Profile: `~/.config/GameLib/` exists. The dev vault exists at mode 0600. Never read its contents.
- Log sink: `~/.local/state/GameLib/logs/gamelib.log`. `logInfo` lines never reach the terminal.
- Deep-link trap: `gamelib://` has no handler, and `heroic://` belongs to the stale Electron deb at
  `/opt/GameLib`. Navigate by clicking the UI only.
- The sidecar (`build/main/sidecar.js`) runs in its OWN process group, not the `setsid` group
  (sitting 6 deviation 1). A docked devtools panel can appear in the dev window. F12 and
  Ctrl+Shift+I did not close it; only its own close button did (sitting 6 deviation 2).

ROW-7 ARM SCOPE. Row 7 on Linux is `!libraryDropdown`: native OFF at any library count, or native
ON with at most one library. This host registered four `libraryfolders.vdf` paths in sitting 6, so
native ON here would almost certainly be row 8 (`38-S12`). The OFF arm is therefore the row-7 arm
this host can produce. The item's "or" wording makes one arm sufficient, unlike `38-S14`, whose
`test:` says "Run BOTH sub-cases". The identically-worded row-5 item `38-S06` discharged on one
observation. The result states this.

OUT OF SCOPE (do not score, do not record against): `38-S12` (do NOT toggle native installs ON to
reach row 8); `38-S16`'s Linux half; `38-S14`; clicking Install in the dialog; any fix to what is
observed. Do not edit `.planning/STATE.md`: the quick orchestrator records the task.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

Large files. Read ONLY the ranges named in each task's read_first. `38-VERIFICATION.md`,
`38-HUMAN-UAT.md`, `34.13-UAT.md` and `ROADMAP.md` are not @-included, on purpose.

Precedents to mirror in shape, adapting the content:
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/260928-tvk-PLAN.md` and
  its SUMMARY: the launch, identity-proof, cleanup and records discipline.
- `38-VERIFICATION.md`'s `38-S04` discharged entry, the LAST entry of
  `human_verification_discharged`: the result-writing shape.
- `38-S06`'s discharged entry (the row-5 twin of this item): "All five checks scored
  INDEPENDENTLY", with each region named with its verdict.
- `38-S14`'s `sitting_5_2026_09_26` field: the keep-open shape, used on the NOT SCORED branch only.
- `38-HUMAN-UAT.md`'s `## Sitting 6` section: the narrative shape.
- `34.13-UAT.md`'s `38-S04` receipt `outcome:` and its body row
  `| G-QUICK-LINUX | tauri | RELOCATED → **PASS in Phase 38 (2026-09-28)** |`: the walk-back
  shape.

YAML-writing rules for every value this task adds (from quick 260928-raq):
- Use single-quoted scalars (double every apostrophe) or double-quoted scalars (backslash-escape
  every inner double quote, and write no other backslash). Match the neighbouring field's style.
- Run `ledger-check.cjs` after every edit to `38-VERIFICATION.md`.
- Write no closing-tag-shaped token (a less-than sign followed by a slash) into any ledger value.

Reusable harness: `.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs`.
Its header, lines 1-66, documents the flags. Use it as-is.

Tooling quirk from sitting 6: a long inline `&&` verify chain sometimes returned a bare "Exit code
1" with no output through the Bash tool. Copy each verify block into a script in the session
scratchpad and run it with `bash`.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer. Re-measure the live baseline, launch the HEAD dev build under the declared real-profile arm, prove identity and both instruments end to end, and check live whether Steam sign-in is already usable</name>
  <files>.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py, .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/baseline.env</files>
  <precondition>An X11 session is live on `DISPLAY=:1`. `xdotool` and `xprop` are on PATH. `python3 -c 'import mss, PIL, Xlib, gi'` succeeds. `src-tauri/target/debug/gamelib-shell` exists, so the launch is an incremental build.</precondition>
  <read_first>
    - .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs lines 1-66
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py lines 1-35 (subcommands; `find` prints JSON with `pid`, `x`, `y`, `width`, `height`)
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/260928-tvk-SUMMARY.md lines 100-126 (the two process-hygiene deviations and the verify-chain quirk)
  </read_first>
  <action>
Step 0. Re-measure the baseline. It is mutable, so this task authorizes nothing from the planning
snapshot.
- Run ledger-check with `--human-uat` and whatever counts the live file holds. Start with
  `--open 9 --discharged 17 --retired 10`. If it fails on a count, read the actual counts from its
  FAIL lines and re-run until it passes.
- Confirm `38-S10` is still open, with `--includes 'open:38-S10:test=LINUX host, tauri runtime'`.
  If `38-S10` is no longer in `human_verification`, STOP and report. Someone else has already
  moved it.
- Run `--census`. Confirm `34.13-UAT.md` is still reported at `(62:176)`.
- Write `evidence/baseline.env` in this quick task's directory. It holds plain `KEY=value`
  lines, no secrets:
  - `O`, `D` and `R`: the live counts;
  - `OPEN_IDS`: the comma-separated live open ids, in array order;
  - `AUDIT38` and `TOTAL`: from the ledger-check audit-uat lines;
  - `CENSUS_BAD`: the census's bad count;
  - `PRE_SHA`: `git rev-parse --short HEAD`;
  - `SDATE`: `date +%F`;
  - `SKEY`: `sitting_7_` followed by `SDATE` with its hyphens turned into underscores.
  Every later count in this plan means "these values", and discharge means `O-1` and `D+1`.
- Confirm `git status --porcelain -- src src-tauri package.json` is EMPTY. If not, STOP: the
  build would not be HEAD.
- Record `uname -a`, `PRETTY_NAME` from `/etc/os-release`, `$XDG_SESSION_TYPE` and `$DISPLAY`.

Step 1. Take the pre-launch census.
- Use bracketed `pgrep -af` patterns (`[g]amelib-shell`, `[b]uild/main/sidecar.js`, `[t]auri dev`)
  so pgrep cannot match its own parent shell.
- `ss -Hltn '( sport = :5173 )'` must be empty.
- If a foreign GameLib process is running, do NOT kill it. STOP and report.
- Record `pgrep -x steam` (informational only), `ls -ld ~/.config/GameLib`, and the vault's mode
  via `stat -c '%a %n'`. Never read the vault.

Step 2. Launch.
- Run `pnpm tauri:dev` with NO env overrides (the real-profile arm), in the background, under
  `setsid`.
- Save the group leader PID to the session scratchpad. Send the transcript there too, never to
  `/tmp` directly and never into the repo.
- Poll, bounded to 15 minutes, until `xdotool search --onlyvisible --name '^GameLib$'` returns a
  window. Use Monitor or an until-loop if a foreground sleep is blocked.
- If the preflight refuses or the build fails, record the paraphrased reason, run Task 3 step H's
  cleanup for this run, and STOP.

Step 3. Prove the identity and map the process tree.
- Run `python3 <capture> find`. Its `pid` MUST resolve through `readlink /proc/<pid>/exe` to
  `/home/graysonmitchell/GameLib/src-tauri/target/debug/gamelib-shell`. Otherwise STOP.
- With `ps -o pid,pgid,sid,args`, record the `setsid` PGID AND the sidecar's
  (`build/main/sidecar.js`) PID and PGID.
- Do NOT assume the sidecar shares the group. Sitting 6 measured that it does not.
- Save both group ids to the scratchpad for cleanup.

Step 4. Clear stray UI and self-test the visual instrument.
- `grab` the window and VIEW it. If a docked devtools panel is visible, close it with a coordinate
  click on the panel's OWN close button, then re-grab and view to confirm.
- Run `python3 <capture> selftest`. Record its fps and frame interval.
- If the grab is blank, relaunch once with `WEBKIT_DISABLE_DMABUF_RENDERER=1` and record that as a
  deviation. If it is still blank, STOP.

Step 5. Write `atspi_dialog_probe.py` in this quick task's directory.
- Dependencies: Python 3 and `gi.repository.Atspi` only. No network.
- Header docstring: it exists for Phase 38 Linux sittings as a text-tree instrument that is
  independent of pixels, and it names its subcommands.
- Subcommands:
  - `dump --pid PID --out FILE [--max-nodes 40000]`:
    - Select the AT-SPI desktop children whose `get_process_id()` is PID. If there are none, fall
      back to those whose name contains "gamelib" case-insensitively.
    - Walk each one depth-first, catching per-node exceptions.
    - For every node, write one JSON line: index path, depth, role name, name, the Text-interface
      content if present (capped at 500 characters), and `in_dialog`. `in_dialog` is true when the
      node or an ancestor has role name `dialog`. Also record the node's own ordinal among
      dialog-role ancestors.
    - Print a summary: the matched apps (name and pid only), nodes visited, dialog-role nodes
      found, and whether the walk was truncated.
  - `regions --dump FILE --title T`:
    - Count case-insensitive substring hits over name and text, separately inside and outside
      dialog subtrees.
    - The labelled signature groups: `platform_row`, `library_dropdown`, `wine_section` (all
      three sub-signatures from the objective), `free_space_line`, `content_light_off`,
      `content_light_single`, and `title` (T).
    - Also print a role-name histogram of the dialog subtree, and the count of `combo box`-role
      nodes inside it.
  - `smoke --pid PID`: run `dump` into a temp file, then print one `PASS`/`FAIL` line each for:
    at least one app matched; more than 20 nodes; and at least one node carrying non-empty text
    beyond window chrome, which proves the walk reached web content.
- Wrap every invocation in `timeout 150`.

Step 6. Smoke-test the text instrument.
- Run `timeout 150 python3 <probe> smoke --pid <shell pid>`.
- PASS: record it.
- FAIL: record the text instrument as UNAVAILABLE, with the failing line. Do not relaunch or
  reconfigure accessibility to chase it; that is outside this item. Task 3 then uses the visual
  instrument alone.

Step 7. Confirm the log sink. `~/.local/state/GameLib/logs/gamelib.log` must exist, with an mtime
since launch.

Step 8. Record the native-install setting.
- Read ONLY the key `defaultSettings.enableSteamNativeInstall` from `~/.config/GameLib/config.json`
  with a Python json read, and print nothing else from the file. If the key is absent, record that
  the runtime default `false` applies.
- If it is `true`: record the ORIGINAL value, then turn it OFF through the UI (Settings, toggle
  "Download Steam games directly in GameLib"), using `xdotool` clicks derived from a viewed
  `grab`. Re-read the value to confirm. Task 3 restores it.
- Never hand-edit `config.json` while the app runs.

Step 9. Check whether Steam sign-in is already usable. This is a LIVE check, and it decides whether
Task 2 pauses.
- `grab` and VIEW the Library. It must list owned Steam games, including at least one that is NOT
  installed and whose game page offers Install with the caret.
- Record `pgrep -x steam` too. The Steam desktop client is NOT required by this item, because
  nothing is handed off to it.
- Write `SIGNED_IN=yes` or `SIGNED_IN=no` to the scratchpad.

Leave the app RUNNING for Tasks 2 and 3.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h && C=.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && . $Q/evidence/baseline.env && python3 $C selftest && test -s "$HOME/.local/state/GameLib/logs/gamelib.log" && node $L --open $O --discharged $D --retired $R --human-uat --open-ids $OPEN_IDS --includes 'open:38-S10:test=LINUX host, tauri runtime' && python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" $Q/atspi_dialog_probe.py && for f in $Q/atspi_dialog_probe.py $Q/evidence/baseline.env; do npx prettier --file-info $f | grep -Eq '"ignored":[[:space:]]*true' || { echo "not prettier-ignored: $f"; exit 1; }; done</automated>
  </verify>
  <done>
- The dev window is up, and its PID's exe is proven to be `src-tauri/target/debug/gamelib-shell`.
- Both process groups (the `setsid` group and the sidecar's own) are recorded.
- No devtools panel is docked.
- `selftest` passes. The text instrument is either smoke-PASSED or recorded UNAVAILABLE with a
  reason.
- The native-install value and its source are recorded, and it is OFF.
- `baseline.env` holds the LIVE counts that every later check uses.
- `SIGNED_IN` is decided from a viewed grab.
- Both new files sit under the prettier-ignored `.planning` tree, which the verify proves with
  `--file-info` instead of running a vacuous `--check`.
- The app is left running.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Only if Task 1 found Steam sign-in NOT usable, the operator signs in to Steam inside the running GameLib dev window</name>
  <action>
CHECK AND SKIP FIRST. The state is mutable.
- Re-run `find`: same PID and exe as Task 1.
- `grab` and VIEW the window. If the Library lists owned Steam games including a not-installed one
  (Task 1 step 9 `SIGNED_IN=yes`, re-confirmed now), record "already signed in, checkpoint
  skipped" and continue to Task 3 WITHOUT pausing.
- Otherwise pause for the operator. Steam sign-in needs their credentials and a Steam Guard or QR
  approval, and Claude can do neither.
  </action>
  <instructions>
Already done: the HEAD dev build is running with its identity proven, native Steam installs are
confirmed OFF, and the capture instruments are self-tested.

In the GameLib dev window that is open now:
1. Sign in to Steam from GameLib's store login screen, by QR or credentials. Wait until the Library
   lists your Steam games.
2. Optional: name an owned Steam game that is NOT installed on this machine. Otherwise the executor
   picks one.

You do NOT need the Steam desktop client for this item: nothing is installed. Do NOT open any
install dialog yourself. The executor opens it under capture.
  </instructions>
  <verification>`find` reports the Task 1 PID and exe. A fresh viewed `grab` shows Steam games in the Library.</verification>
  <resume-signal>Type "signed in" (optionally followed by a game title), or describe what blocked you.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Open "Install with options…" under capture, check each of the five region facts independently on both instruments, score honestly, clean up every process, and record the result in the ledger, the narrative and the origin receipt</name>
  <files>.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md, .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md, .planning/ROADMAP.md, .planning/todos/pending/ (FAIL branch only)</files>
  <precondition>Steam sign-in is usable: Task 2 was skipped on a live check or its resume signal arrived. `find` still reports the Task 1 PID with exe `src-tauri/target/debug/gamelib-shell`.</precondition>
  <reversibility rating="reversible">Every ledger move is between two arrays in one file. Moving the entry back and re-running ledger-check with the baseline.env counts reverses it. On FAIL the operator may prefer the `38-S08` keep-open precedent.</reversibility>
  <read_first>
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx lines 415-565 (what each region renders)
    - src/frontend/screens/Library/components/InstallModal/index.tsx lines 586-631 (platformSelection)
    - src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts lines 182-303
    - 38-VERIFICATION.md: lines 1-12; the `38-S10` entry (grep `id: "38-S10"`, about 9 lines plus the blank after it); the `38-S04` discharged entry through the closing fence
    - 38-HUMAN-UAT.md: lines 1-40 and the `## Sitting 6` section to the end of file
    - 34.13-UAT.md: the receipt block containing `to_item: "38-S10"`, and the single line starting `| G-ROW-7 | tauri |`
    - ROADMAP.md: the FIRST line starting `**Items: ` (grep -n, then read that line only)
  </read_first>
  <action>
A. Choose the target and navigate by clicking only.
- The target must be a Steam game that is owned, visible, and NOT installed. Confirm its
  `appmanifest_<appId>.acf` is absent from every library path in
  `~/.steam/debian-installation/steamapps/libraryfolders.vdf` that exists on disk.
- Prefer WazHack (264160), for continuity with sitting 6, if it still qualifies and its page offers
  Install with the caret. Record the title and appId.
- For the SUMMARY only (a `38-S12` readiness note; nothing is scored or toggled), also record how
  many of those library paths exist on disk.
- Navigate with `xdotool` clicks at coordinates read off a viewed `grab`. No `gamelib://` or
  `heroic://` URL, ever.

B. Negative control, with the dialog CLOSED.
- On the game page, take a `grab` (`pre-open.png`) and a `clients` baseline.
- If the text instrument is available, run `dump` into the scratchpad, then `regions --title
  <title>`. Record the counts: expected 0 dialog-role nodes, or no dialog subtree containing a
  `content_light_off` hit.

C. Open the dialog under capture.
- Route: the `SteamInstallCaret` beside Install, then "Install with options…". Click the caret
  BEFORE the burst, and let the burst's `--click` take the menu item. Fallback route: right-click
  the Library GameCard, then "Install with options…".
- Run `burst --out <scratch>/open --pre 0.5 --seconds 4 --click X,Y`. Record the fps, the median
  interval and the click epoch.
- After the burst, wait 2 more seconds, then take `grab` `dialog-settled.png` and a `clients` dump.
- VIEW `dialog-settled.png`. The WHOLE dialog must be in view: title row, close X, body, and the
  footer INSTALL button, with no scrollbar inside the body. If it is clipped, the absence claims
  are not observable. Resize or scroll, recapture, and record the deviation.
- Crop the dialog with PIL to `dialog-crop.png`, and VIEW it at full resolution.

D. Transient check. The claim is "does NOT render at all", so a flash counts.
- Copy the burst frames from the first one showing the dialog onward into `<scratch>/settle/`.
  Add `dialog-settled.png` there, named `frame_0000000000000.png` so it sorts first.
- Run `diff <scratch>/settle --flag 0.005`. Every frame now reports its deviation from the settled
  dialog.
- Frames inside the MUI Slide open-transition window, the first ~400 ms after the dialog first
  appears, are expected to deviate. VIEW every flagged frame AFTER that window, plus the max frame.
- If any of them shows a platform-row, dropdown, wine or free-space region, or a "Checking install
  options" row, that is a transient render. Record its frame timestamps.

E. Text-tree check. Only if the instrument is available.
- With the dialog open, run `dump` and then `regions --title <title>`.
- The instrument is VALID only if all of these hold: at least one dialog-role node exists; inside
  it, `title` is at least 1 and `content_light_off` is at least 1; the role histogram includes a
  push button whose name is the Install label; and step B's closed control had no dialog subtree
  containing `content_light_off`.
- When VALID, each region's text verdict is its in-dialog count. ABSENT means 0, and PRESENT means
  at least 1.
- If no dialog-role node exists but the notice fragment goes from 0 closed to at least 1 open,
  whole-tree counts are admissible. The rule is then: PRESENT when the open count exceeds the
  closed count, and ABSENT when the open count is 0.
- Anything else makes the instrument INVALID for this sitting. Record why.
- Save ONLY the dialog-subtree lines (role plus text) and the three `regions` tables as
  `atspi-dialog-subtree.txt`. Whole-window dumps stay in the scratchpad.

F. Per-region verdicts. Record each of the five facts on its OWN line in `region-checks.txt`, with
these columns:
- region;
- expected;
- the visual observation: what was looked for (the label text and control shape from the
  objective) and what the crop shows at that position;
- the text-tree in-dialog count, or UNAVAILABLE;
- the transient result;
- the verdict.
Then:
- Record which notice string rendered. `contentLightNotice` (the "Turn on native Steam installs in
  Settings" clause) corroborates native OFF as the dialog saw it. `contentLightSingleLibraryNotice`
  means `nativeInstallOn` was true, and the item is NOT SCORED.
- Record the header platform icons as seen, marked NOT the platform row.
- Close the dialog with its header X. `grab` and view to confirm it is gone. Do NOT click Install.
- From `gamelib.log`, extract the lines from the open second through +10s containing `SteamDialog`,
  `SteamGame`, `34.13` or `ERROR` into `log-excerpt.txt`. Write "no matching lines" if there are
  none.

G. Score. Exactly one outcome applies. Do not retry to get a different answer.
- PASS when ALL of these hold:
  - identity is proven;
  - native OFF is proven by config AND the notice string;
  - the whole dialog was in view;
  - the platform row, library dropdown, wine section (all three sub-signatures) and free-space
    line are each ABSENT on the visual instrument, AND on the text instrument when it is VALID;
  - the content-light notice is PRESENT on both;
  - no transient render was found.
- FAIL when any one region contradicts its expectation on EITHER instrument, including a transient
  render or a text-tree hit inside the dialog that the pixels do not show (mounted but not
  visible). Record exactly what was seen, and where.
- NOT SCORED when the dialog could not be opened, native OFF could not be proven, the dialog could
  not be brought fully into view, or the visual instrument failed.

The result must state these honest limits:
- The free-space line is nested in the dropdown's `afterSelect` (`SteamDialog/index.tsx:500-516`).
  Its check is an independent OBSERVATION but not an independent code path.
- `wineSection` requires `isMac` (`steamSectionGating.ts:264-265`), so the wine verdict confirms
  that the render agrees with a by-construction false.
- `hostPlatform` = `'linux'` is established by source (`src/preload/tauriAttach.ts:77`) and by the
  host. It is not read from the running webview. The observed absent row itself excludes `darwin`
  and `win32`.
- Only the native-OFF arm of row 7 was run (see the objective's ROW-7 ARM SCOPE).
- The burst interval bounds the shortest detectable flash.
- The text instrument sees what WebKitGTK exposes to AT-SPI, not the DOM.
- There was no operator eyeball.
- The `shell.openExternal` leg was not exercised.

H. Cleanup. ALWAYS run this, including after any STOP in any task.
- If Task 1 turned native installs OFF from an original `true`, restore it through the UI and
  re-read the value.
- Send `kill -TERM` to the negative `setsid` PGID AND, separately, the sidecar's recorded PGID.
  Before signalling the sidecar group, confirm with `ps -o pid,args -g <pgid>` that it holds only
  this run's sidecar.
- Wait up to 20 seconds, then `kill -KILL` whatever remains of either group.
- Verify that bracketed-pattern `pgrep -af` finds no `[g]amelib-shell`, `[b]uild/main/sidecar.js`
  or `[t]auri dev`, and no `[v]ite` whose args contain this repo's path. `ss -Hltn '( sport =
  :5173 )'` must be empty. Record the final census.
- Do NOT stop the Steam client. Do NOT read or delete the dev vault.
- Delete the scratchpad bursts, dumps and transcript once the evidence is copied out.

I. Evidence. Write it into this quick task's `evidence/`, next to `baseline.env`.
- PNGs: `pre-open.png`, `dialog-settled.png`, `dialog-crop.png`, and, when flagged,
  `transient-<ms>.png`.
- `region-checks.txt`, `atspi-dialog-subtree.txt` (or one line stating UNAVAILABLE and why), and
  `log-excerpt.txt`.
- `burst-summary.txt`: fps, interval, click epoch, the settle-diff max with its frame, the
  post-transition flagged frames, and any `clients.jsonl` new windows with PID, exe basename,
  WM_CLASS and title. None is expected, because the dialog is in-webview.
- Privacy gate:
  - VIEW every PNG. Crop or drop any that shows an account name, avatar, SteamID or e-mail.
  - No text file may contain a 17-digit run, or a case-insensitive `refresh.?token`,
    `access.?token` or `password`.
  - Check window titles and the AT-SPI lines for account names.

J. Records. Use scoped Edits only; never Write an existing file. Substitute the RESULT word (PASS
or FAIL), `SDATE`, the counts from `baseline.env`, `PRE_SHA` and the measured values.

`38-VERIFICATION.md`, on PASS or FAIL:
- Remove the whole `38-S10` entry, from `  - id: "38-S10"` through its `prior_state:` line, plus
  ONE following blank line. Exactly one blank line must remain between the preceding entry's last
  line and the next `  - id:`.
- Append the entry at the END of `human_verification_discharged`, directly after the last entry's
  `prior_state:` line (`38-S04`'s at planning time) and before the closing fence.
- Field order: `id`, then `result`, then every original field VERBATIM in its original order:
  `test`, `expected`, `why_human`, `blocked_by`, `platform_gate`, `origin_phase`, `origin_item`,
  `prior_state`.
- `result` is single-quoted, with apostrophes doubled. It opens
  `<RESULT> -- sitting 7, <SDATE>, LINUX (the second Linux sitting).` and states:
  - the host and session;
  - the build `pnpm tauri:dev` DEBUG at `<PRE_SHA>`, identity PROVEN via PID and `/proc/<pid>/exe`;
  - the real-profile arm, in one sentence, including that the openExternal leg was not exercised;
  - the game title and appId, and the route used to open the dialog;
  - native OFF: its file and value, plus the notice string that rendered;
  - ALL FIVE verdicts, each named, each with its visual observation and its text-tree count, in
    the `38-S06` style ("All five checks scored INDEPENDENTLY: …");
  - the header-icons note;
  - the transient check (fps, interval, post-transition flagged count);
  - the text-instrument validity, with its positive and negative control;
  - the row-7 arm scope;
  - the honest limits from G;
  - that `38-S16`'s Linux half, `38-S12` and `38-S14` were not scored;
  - the evidence directory path;
  - `quick 260929-ata`.
- A FAIL result additionally quotes what rendered, names the todo by filename, and cites the
  `38-W03`/`38-W06` discharge-as-FAIL precedent (reversible to the `38-S08` keep-open precedent).
- `score:` is single-quoted, so double every apostrophe you write.
  - Replace `<O> relocated items OPEN, <D> discharged` with the `O-1` and `D+1` values.
  - Insert `; sitting 7, <SDATE> (LINUX): `38-S10` <RESULT>, closed via quick `260929-ata``
    immediately before the FIRST `), <R> retired.` in the field.
  - Insert a history clause immediately before the FIRST ` (Was ` in the field. It opens
    `(Was <O> until <SDATE>, when quick `260929-ata` DISCHARGED `38-S10` <RESULT> from sitting 7
    --`, gives the one-line reason, and ends
    `Confirmed at the tool: gsd-core audit-uat `by_phase["38"]` moved <AUDIT38> -> <AUDIT38-1> and total_items <TOTAL> -> <measured>, which is the check that the array still parses -- a FLAT count after a removal would mean the edit did not register or the array failed to parse.)`
    followed by a single space.
- On NOT SCORED instead: leave the entry in place. Insert a double-quoted `<SKEY>:` field directly
  after its `id:`, stating NOT SCORED, why, and what was observed. No count changes, no `score:`
  edit, and no 34.13 or ROADMAP edit.

`38-HUMAN-UAT.md`:
- Frontmatter: append one double-quoted `sessions:` string,
  `Sitting 7 -- <SDATE>, Linux (Pop!_OS 22.04, X11), tauri dev build `<PRE_SHA>`, identity proven by PID -- 38-S10 <RESULT>`.
- Set `updated:` to `<SDATE>`. Leave `source:` unchanged: `--human-uat` asserts exactly 3 entries.
- In the `## Current Test` bracket paragraph, use a multi-line `old_string` spanning from
  `see the "## Sitting 6" section` to the closing `artifacts.]`. Insert one sentence before the
  `]`: Sitting 7, the second Linux sitting, scored `38-S10` <RESULT>; the ledger now holds the new
  counts; see the "## Sitting 7" section below. Wrap it to match the surrounding lines.
- Append at the end of the file a section headed
  `## Sitting 7 — <SDATE>, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `<PRE_SHA>``.
  It contains:
  - Conditions: the identity proof, the real-profile arm and exactly which parts of sitting 6's
    justification carry over, native OFF with its evidence, whether Task 2 was skipped, the Steam
    client state (informational), and the two instruments with their self-test and control
    results;
  - the five-row region table from `region-checks.txt`;
  - the transient check;
  - the notice-string arming note;
  - the header-icons note;
  - the result;
  - an honest-limits paragraph;
  - a line that `38-S12`, `38-S14` and `38-S16`'s Linux half were NOT scored;
  - the artifact paths.
- THE NEW SECTION MUST CONTAIN NO `### <number>.` heading, and NO line starting at column 0 with
  `expected:` or `result:`.

`34.13-UAT.md`, on PASS or FAIL only:
- Replace the `outcome:` of the receipt whose `to_item` is `"38-S10"`. Use a multi-line
  `old_string` from `to_item: "38-S10"` through its `outcome: "open — not yet run in phase 38"`,
  because that literal repeats in the file.
- The new value is double-quoted, with NO inner double quotes and NO backslashes. It opens
  `DISCHARGED <RESULT> <SDATE> by quick 260929-ata (Phase 38 sitting 7, Linux, Pop!_OS 22.04, tauri dev build <PRE_SHA>).`
  and gives one or two sentences with the five verdicts.
- In the body table, change `| G-ROW-7 | tauri | RELOCATED |` to
  `| G-ROW-7 | tauri | RELOCATED → **<RESULT> in Phase 38 (<SDATE>)** |`.
- THE FILE-LEVEL CENSUS CANNOT SEE THIS EDIT. The frontmatter already stops parsing at the pinned
  `(62:176)` error, which is BEFORE this receipt. So validate the edited receipt in isolation with
  the js-yaml one-liner in verify. Do NOT touch the pinned `38-S06` error: repairing it turns
  `pnpm planning-gates` red with a stale pin.

`ROADMAP.md`, on PASS or FAIL only:
- Locate the FIRST line starting `**Items: ` (the current count paragraph).
- Insert a new paragraph and a blank line before it. It opens
  `**Items: <O-1> OPEN as of <SDATE> (sitting 7), plus <D+1> DISCHARGED and <R> RETIRED**`
  (quick `260929-ata`). In two to four sentences it records the second Linux sitting and the
  `38-S10` result, and points to `38-HUMAN-UAT.md`'s `## Sitting 7`.
- In the same Edit, append ` (historical, superseded by the sitting-7 count above)` directly
  after the old paragraph's bold span.

Todo, on FAIL only: `.planning/todos/pending/<SDATE>-<short-slug>.md`.
- Frontmatter keys, in this order:
  - `created: <SDATE>`;
  - a single-quoted `title` naming what rendered;
  - `found_during: Phase 38 sitting 7 (quick 260929-ata)`;
  - `severity: major` (D-18/D-20 section gating is broken on Linux; downgrade only with a
    vocabulary-table reason);
  - `platform: linux` immediately after;
  - `ready: live-gate` immediately after;
  - `area: steam-install`;
  - `files`: the code anchors.
- Body: what rendered, verbatim, with evidence file names; a mechanism hypothesis LABELLED as a
  hypothesis; and re-verification by re-running this sitting's steps C-G.
- Values must be bare and lowercase.

K. Validate everything BEFORE committing. Do not edit `.planning/STATE.md`.

L. Commit in ONE Bash invocation.
- `git add` the exact paths: the probe script, `evidence/`, the three phase files, `ROADMAP.md`,
  and the todo on FAIL.
- Check that `git diff --cached --name-only` lists only those paths, then commit.
- Message: `docs(quick-260929-ata): Phase 38 sitting 7, second Linux sitting -- 38-S10 <RESULT>`.
  End it with this session's attribution lines.
- Every path is under the prettier-ignored `.planning` tree. The verify proves that with
  `--file-info`; no vacuous `--check` is run.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && P38=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma && U=.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md && . $Q/evidence/baseline.env && NEW_IDS=$(echo "$OPEN_IDS" | tr , '\n' | grep -vx 38-S10 | paste -sd, -) && node $L --open $((O-1)) --discharged $((D+1)) --retired $R --human-uat --open-ids "$NEW_IDS" --discharged-includes 38-S10 --includes 'discharged:38-S10:result=260929-ata' --includes 'discharged:38-S10:result=sitting 7' --includes 'discharged:38-S10:result=src-tauri/target/debug/gamelib-shell' --includes 'discharged:38-S10:result=INDEPENDENTLY' --includes 'discharged:38-S10:test=LINUX host, tauri runtime' --includes 'discharged:38-S10:platform_gate=steamSectionGating.ts:182-207' --includes "top:score=$((O-1)) relocated items OPEN, $((D+1)) discharged" --includes "top:score=(Was $O until $SDATE" && if node $L --open $O --discharged $D --retired $R >/dev/null 2>&1; then echo 'NEGATIVE CONTROL DID NOT FAIL'; exit 1; fi && node $L --rev $PRE_SHA --open $O --discharged $D --retired $R --includes 'open:38-S10:test=LINUX host, tauri runtime' >/dev/null && node $L --census --expect-bad $CENSUS_BAD | grep -F '34.13-UAT.md' | grep -qF '(62:176)' && node -e 'const y=require("js-yaml"),L=require("fs").readFileSync(process.argv[1],"utf8").split("\n"),i=L.findIndex(l=>l.includes("to_item: \"38-S10\""));const o=y.load(L.slice(i-2,i+5).join("\n"));if(!/^DISCHARGED (PASS|FAIL) /.test(o[0].outcome)){console.error("receipt outcome not parsed as DISCHARGED");process.exit(1)}' $U && grep -q '^| G-ROW-7 | tauri | RELOCATED → \*\*' $U && grep -q '^## Sitting 7 — ' $P38/38-HUMAN-UAT.md && ! awk '/^## Sitting 7 — /{s=1} s' $P38/38-HUMAN-UAT.md | grep -Eq '^(### [0-9]+\.|expected:|result:)' && grep -q "Items: $((O-1)) OPEN as of $SDATE" .planning/ROADMAP.md && ls $Q/evidence/dialog-settled.png $Q/evidence/region-checks.txt >/dev/null && ! grep -Eq '[0-9]{17}' $Q/evidence/*.txt $Q/evidence/baseline.env && ! grep -Eiq 'refresh.?token|access.?token|password' $Q/evidence/*.txt && test -z "$(pgrep -af '[g]amelib-shell|[b]uild/main/sidecar.js|[t]auri dev')" && test -z "$(ss -Hltn '( sport = :5173 )')" && pnpm -s planning-gates && for f in $P38/38-VERIFICATION.md $P38/38-HUMAN-UAT.md $U .planning/ROADMAP.md $Q/evidence/region-checks.txt; do npx prettier --file-info $f | grep -Eq '"ignored":[[:space:]]*true' || { echo "not prettier-ignored: $f"; exit 1; }; done</automated>
  </verify>
  <done>
- `38-S10` was scored from a proven-identity HEAD dev build with native OFF proven twice (config
  plus the rendered notice string).
- Each of the five region facts carries its own verdict and its own evidence, on the visual
  instrument and, when valid, the text instrument, plus a transient check.
- PASS or FAIL: the entry was MOVED to `human_verification_discharged` with every original field
  verbatim.
  - The counts are `O-1`/`D+1`/`R` from the LIVE baseline, and audit-uat `by_phase['38']` dropped
    by exactly one with `parse_gap_files` 0.
  - The old counts FAIL on the live file (negative control), while `PRE_SHA`'s blob still shows
    `38-S10` open.
  - `34.13-UAT.md`'s receipt parses in isolation as DISCHARGED, and its pinned `(62:176)` error is
    unchanged.
  - `38-HUMAN-UAT.md` has the sessions entry and a parser-safe `## Sitting 7`.
  - ROADMAP's count paragraph is current.
  - On FAIL, a CI-valid todo exists.
- On NOT SCORED, run the alternative verify instead:
  `. $Q/evidence/baseline.env && node $L --open $O --discharged $D --retired $R --human-uat --includes "open:38-S10:$SKEY=NOT SCORED"`,
  plus the census, privacy, process and planning-gates checks above. There is no 34.13 or ROADMAP
  edit.
- No process from this run survives, including the sidecar's own group. Nothing listens on :5173.
- The Steam client and the dev vault are untouched.
- Committed evidence passes the privacy gate. `pnpm planning-gates` is green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| live app, real profile -> committed repo evidence | Screenshots, AT-SPI text and window titles from the operator's real Steam session cross into a public repo |
| running binary -> recorded build identity | What ran can differ from what the record claims (the sitting-5 stale-build incident) |
| ledger edit -> gsd-core audit-uat | One YAML slip silently removes Phase 38 from the audit; `34.13-UAT.md` is already unparseable before the edited receipt, so the file census cannot see a new error there |
| this task's process tree -> the operator's desktop | The dev servers and a separately-grouped sidecar can outlive the task |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260929-ata-01 | Information disclosure | evidence PNGs, `atspi-dialog-subtree.txt`, window titles | high | mitigate | Captures are window-region only. Every PNG is VIEWED and cropped or dropped if it shows an account name, avatar, SteamID or e-mail. Only DIALOG-subtree AT-SPI lines are committed; whole-window dumps, which can carry the account name, stay in the scratchpad and are deleted. The verify fails on any 17-digit run or on `refresh.?token`/`access.?token`/`password`. |
| T-260929-ata-02 | Information disclosure | `/tmp/gamelib-dev-secret-vault.json` | medium | accept | This is the by-design DEV-ONLY vault, mode 0600 (`devSecretVault.ts:110-114`), on a single-user host. It is never read, printed or copied; only its mode is recorded. It is left in place for `38-S12`/`38-S16`. |
| T-260929-ata-03 | Repudiation / Tampering | recorded build identity | high | mitigate | `_NET_WM_PID` -> `/proc/<pid>/exe` must equal `src-tauri/target/debug/gamelib-shell`; the tree is clean for `src src-tauri package.json` at launch; `PRE_SHA` is recorded; no deep links are used. |
| T-260929-ata-04 | Tampering | `38-VERIFICATION.md` / `38-HUMAN-UAT.md` / `34.13-UAT.md` frontmatter | high | mitigate | `ledger-check.cjs` checks counts from the LIVE baseline, ids, includes, `parseVerificationItems` and live `audit-uat`. There is a negative control on the old counts and a `--rev` check on the pre-task blob. The 34.13 receipt is parsed IN ISOLATION with js-yaml, because the file-level parse stops at the pinned `(62:176)`, which is before it. `pnpm planning-gates` runs, and the new HUMAN-UAT section is grep-checked for item-shaped lines. |
| T-260929-ata-05 | Denial of service | orphaned `gamelib-shell`, sidecar and vite processes | medium | mitigate | Both the `setsid` PGID and the sidecar's own PGID are recorded at launch and killed TERM then KILL. The sidecar group is confirmed to be this run's before signalling. The verify asserts no bracketed-pattern match and an empty :5173. Cleanup runs on every STOP path. |
| T-260929-ata-06 | Tampering | operator's native-install setting | low | mitigate | If it had to be turned OFF, the original value is recorded and restored through the UI before teardown. `config.json` is never hand-edited while the app runs. Native ON is never set by this task. |
| T-260929-ata-07 | Tampering | Steam-side state | low | mitigate | Install is never clicked inside the dialog, so no `steam://install` hand-off occurs and nothing downloads. The Steam client is never stopped or driven. |
</threat_model>

<verification>
- Task 1 verify: `selftest` passes; the log sink exists; ledger-check passes on the LIVE
  `baseline.env` counts with `38-S10` still open; the probe script parses; both new files are
  proven prettier-ignored.
- Task 2: skipped on a live check, or the operator's resume signal, re-checked with `find` plus a
  viewed `grab`.
- Task 3 verify: the discharge-path command above, or the NOT SCORED alternative in its done block.
- Across the whole task: audit-uat `by_phase['38']` moves exactly `AUDIT38 -> AUDIT38-1` on
  discharge and stays flat on NOT SCORED. `total_items` is recorded before and after.
</verification>

<success_criteria>
- The ledger states a true, evidenced result for `38-S10`: PASS or FAIL and discharged, or NOT
  SCORED and left open. It is backed by a proven build identity, a doubly-proven native-OFF arm,
  and five independently-recorded region verdicts on two instruments plus a transient check.
- Phase 38 stays audit-visible with `status: human_needed`, and every count agrees across the
  ledger, `audit-uat`, `38-HUMAN-UAT.md`, `34.13-UAT.md` and ROADMAP.md.
- Nothing from this run is left running. Nothing committed identifies the operator's Steam account.
- The SUMMARY records:
  - every re-measured baseline value from `baseline.env`;
  - whether Task 2 was skipped;
  - the text instrument's validity and why;
  - the fps, interval and settle-diff result;
  - the `38-S12` readiness note (library paths existing on disk);
  - `38-S12` and `38-S16`'s Linux half as next candidates.
</success_criteria>

<output>
Create `.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/260929-ata-SUMMARY.md` when done.
</output>
