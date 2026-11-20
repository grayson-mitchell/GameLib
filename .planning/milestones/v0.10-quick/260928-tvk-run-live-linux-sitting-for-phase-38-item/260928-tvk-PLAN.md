---
phase: quick-260928-tvk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py
  - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
  - .planning/ROADMAP.md
  - .planning/todos/pending/ (FAIL branch only, one new todo)
autonomous: false
requirements:
  - QUICK-260928-TVK
estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "38-S04 was observed LIVE on this Linux host (Pop!_OS 22.04, X11, DISPLAY :1) against a dev build whose identity is PROVEN, not labelled: the GameLib window's `_NET_WM_PID` resolves through `/proc/<pid>/exe` to `<repo>/src-tauri/target/debug/gamelib-shell`, and `git status --porcelain -- src src-tauri package.json` was empty at launch. This is the sitting-5 stale-build lesson applied."
    - "The native-installs-OFF precondition is PROVEN ARMED by the sidecar's own line `SteamGame: delegating install for appId <id> via steam://install/<id>` in `~/.local/state/GameLib/logs/gamelib.log`, logged at or after the click second. The emitter is `src/backend/storeManagers/steam/games.ts:1194-1197`. It is reachable only when `isSteamNativeInstallEnabled()` is false (`:1185`). The config file and value that produced OFF are also recorded."
    - "The absence instrument is PROVEN able to see a dialog before the scored click. A positive-control burst over a deliberate 'Install with options…' open gave a changed-area fraction P, and a viewed frame showed the dialog. Without this, a 'nothing opened' result would be the green-check-proving-nothing shape (live-gate Test 4)."
    - "The ledger records what was observed. PASS: `38-S04` is MOVED to `human_verification_discharged`. FAIL: it is MOVED as a FAIL and a todo is filed. Not armed: it stays in `human_verification` with a dated NOT SCORED note. `status: human_needed` is preserved. `ledger-check.cjs` passes, and gsd-core `audit-uat` `by_phase['38']` moves 10 -> 9 on either discharge (it stays flat on not-armed), with `parse_gap_files == 0`."
    - "The origin receipt in `34.13-UAT.md` and the narrative in `38-HUMAN-UAT.md` agree with the ledger. `34.13-UAT.md`'s pre-existing, gate-pinned parse error at its `38-S06` receipt is byte-for-byte unchanged."
    - "No process this task started survives it: no `gamelib-shell`, no `build/main/sidecar.js` node, no `tauri dev`, no vite, and nothing listening on :5173."
    - "No committed evidence file carries a Steam account identifier: no username, avatar, SteamID64, token or password."
  artifacts:
    - ".planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py: X11 window-region burst capture, client-window attribution, frame-diff and self-test. It can be reused for the remaining Linux items `38-S10`/`38-S12`/`38-S16`."
    - ".planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/: window-region PNGs (positive control, pre-click, max-diff, +10s, +20s), `clients-new-windows.txt`, `log-excerpt.txt`"
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md: `38-S04` relocated per the observed outcome; `score:` updated"
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md: `sessions:` entry plus a `## Sitting 6` section"
  key_links:
    - "Primary-half click (`MainButton.tsx:303-329`) -> `GamePage/index.tsx:715-716` `startSteamQuickInstall` -> native OFF gives an empty `listSteamLibraryTargets` (server-gated at `installFlowRegistration.ts:268`) -> no target -> `InstallGameModal.ts:245-253` `installSteamGame`, NEVER `openSteamInstallOptions` (`:275`, the only quick-install path to the dialog) -> backend `games.ts:1189-1198` logs the arming line and calls `shell.openExternal(steam://install/<id>)`. The log line is the machine-side proof of which branch ran."
    - "GameLib window -> `_NET_WM_PID` -> `/proc/<pid>/exe`. This is the only proof that the build under test is HEAD. Sitting 5 was mislabelled without it."
    - "`38-VERIFICATION.md` frontmatter -> strict YAML -> gsd-core `audit-uat`. One unescaped quote drops the whole phase from the audit silently. `ledger-check.cjs` and the `planning-frontmatter-gate.py` ledger walk in `pnpm planning-gates` are the two checks."
---

<objective>
Run Phase 38 item `38-S04` LIVE on this Linux machine and record the true result. The test: Steam
quick install, tauri runtime, native installs OFF, click the PRIMARY half of Install. Expected:
"NOTHING opens — no dialog, modal, overlay or picker, no flash-and-close."

THIS IS A REAL LIVE OBSERVATION, NOT A CODE CHANGE.
- The executor actually launches `pnpm tauri:dev` on this host.
- It actually clicks with `xdotool` (XTEST input, indistinguishable to the app from a mouse).
- It actually captures screenshots with `mss`.
- It actually reads the app's own log.
No source file under `src/` or `src-tauri/` is edited. The deliverables are the evidence plus the
ledger, narrative and origin-receipt updates. This is the FIRST Linux sitting Phase 38 has ever
had. Number it "Sitting 6", after Windows sittings 1-5; the 2026-09-28 spike-evidence entry was
explicitly not a sitting.

DECLARED REAL-PROFILE ARM (CLAUDE.md two-profile rule, half 2). This sitting runs under the
operator's REAL `HOME`, on purpose. A fake HOME cannot run this item:
- `shell.openExternal(steam://install/<id>)` hands off through `xdg-open` to the real Steam
  client. With a faked HOME, the handler would bootstrap a second Steam install into the fake
  profile.
- The operator's Steam sign-in and the real `~/.steam` tree are part of the item's premise.
Consequences, accepted and recorded:
- The first run creates `~/.config/GameLib/` and `~/.local/state/GameLib/logs/` as real,
  persistent profile state. Leave both in place for the remaining Linux items.
- Isolation discipline still applies to every capture. Raw bursts, the `tauri:dev` transcript and
  window dumps go to the session scratchpad and are deleted at cleanup. Only vetted, redacted
  evidence is committed.

Facts measured at planning time (2026-09-28, HEAD `7d7a460ba`). Each one is MUTABLE: re-confirm it
at execution and record the executed value where it differs.
- Where `enableSteamNativeInstall` lives. The orchestrator grepped the wrong directory.
  - Under the Tauri sidecar, `app.getPath('appData')` is shimmed to `$XDG_CONFIG_HOME` or
    `~/.config` (`src/backend/sidecar/pathShim.ts:38-58`). `appFolder` is `<appData>/GameLib` with
    a CAPITAL G (`src/backend/constants/paths.ts:24`). So the file is
    `~/.config/GameLib/config.json` (`paths.ts:49`), key `defaultSettings.enableSteamNativeInstall`.
    It is mirrored into `configStore`'s `settings` by `GlobalConfig.setSetting` (`config.ts:387-389`).
  - The runtime default is `false` (`config.ts:376`; `nativeInstallSetting.ts:15` reads it with
    `?? false`).
  - `~/.config/GameLib/` DID NOT EXIST at planning time, so the first launch creates it with
    native installs OFF by default.
  - The lowercase `~/.config/gamelib/` the orchestrator grepped is a different directory, because
    Linux paths are case-sensitive. Unlike macOS, the two spellings are not one inode. It holds
    Chromium files last modified 2026-07-02. It belongs to the Electron-era deb `gamelib` 1.0.0
    installed at `/opt/GameLib/gamelib` (`/usr/bin/gamelib`), and the Tauri build never reads it.
  - The setting is NOT in the webview's localStorage. `useSetting` goes through `SettingsContext`
    to the backend `GlobalConfig`.
- Deep links are a trap on this host.
  - `/usr/share/applications/gamelib.desktop` (the stale Electron deb) claims
    `x-scheme-handler/heroic`.
  - `x-scheme-handler/gamelib` has NO default handler.
  - `x-scheme-handler/steam` resolves to `steam.desktop`.
  - Never `xdg-open` a `gamelib://` or `heroic://` URL. It would reach nothing, or the stale
    Electron build. Navigate by clicking the UI only.
- Process and build state.
  - No `gamelib`/`tauri` process was running.
  - The Steam client was NOT running.
  - `src-tauri/target/debug/` holds deps but no `gamelib-shell` binary, so the first
    `pnpm tauri:dev` compiles the shell. Allow up to 30 minutes.
  - `meta/tauriDevPreflight.cjs` refuses to start if a foreign `gamelib-shell` is running.
- Login state.
  - `/tmp/gamelib-dev-secret-vault.json` was ABSENT. `pnpm tauri:dev` sets
    `GAMELIB_DEV_SECRET_VAULT=1` (`package.json:32`), and the vault lives at
    `tmpdir()/gamelib-dev-secret-vault.json` (`devSecretVault.ts:80,103`).
  - So GameLib has NO Steam sign-in on this host, and the operator must sign in (Task 2).
- Log sink. Sidecar `logInfo` lines go to `~/.local/state/GameLib/logs/gamelib.log`
  (`src/backend/logger/paths.ts:21-23`). They NEVER reach the `tauri:dev` terminal (live-gate
  contract Test 3). The ledger body's step 1 names `~/Library/Logs/...`, which is the macOS path.
- Tooling. Present: `xdotool`, `xprop` and `xwininfo`; Python `mss` 10.2.0, `PIL` 12.3.0 and
  `Xlib`. `DISPLAY=:1`, `XDG_SESSION_TYPE=x11`.
- Ledger.
  - 10 open / 16 discharged / 10 retired. `audit-uat` `by_phase['38'] == 10`,
    `total_items == 429`, `parse_gap_files == 0`.
  - `ledger-check.cjs --open 10 --discharged 16 --retired 10 --human-uat` passes.
  - `38-S04` spans `38-VERIFICATION.md` lines 36-44, followed by three blank lines (45-47).
  - The last discharged entry, `38-E02`, ends at line 430, and the frontmatter closes at 431.
- Census. `ledger-check.cjs --census` gives 80 ok, 2 no-frontmatter, 3 bad.
  - `34.13-UAT.md` fails at `(62:176)`, which is its `38-S06` receipt (unescaped inner quotes).
  - `planning-frontmatter-gate.py`'s `KNOWN_UNPARSEABLE_TERMINAL` pins that failure with status
    `complete`.
  - REPAIRING IT WOULD MAKE THE PIN STALE AND TURN `pnpm planning-gates` RED. Do not touch it.

SCOPE NOTE, to be recorded in the result, not acted on. With native installs OFF, the primary-half
click never evaluates `resolveSteamSectionGating`.
- The decision whether a dialog opens lives in `startSteamQuickInstall`
  (`src/frontend/state/InstallGameModal.ts:234-276`).
- The `platformRow: 'absent'` branch this item's `platform_gate` names
  (`steamSectionGating.ts:203-206`) renders only IF a dialog opens.
- So a PASS observes the Linux quick-install DISPATCH: the no-target branch, `installSteamGame`,
  `shell.openExternal` through `xdg-open`. It does NOT observe the absent-row render. That render
  belongs to `38-S10` (row 7) and to `38-S16`'s Linux half.
- Keep the `platform_gate` field VERBATIM. Only the result states this.

SCORED SURFACE. Only GameLib-owned surfaces are scored: the dev shell's windows, and any in-webview
dialog, modal, overlay or picker. Per D-18, GameLib deliberately delegates Linux Steam installs to
Steam's own client (`34.13-CONTEXT.md` ~line 483). The shipped `contentLightNotice` copy says so
("This installs through Steam's own client"). So a Steam-client window is:
- the EXPECTED handoff, recorded with its WM_CLASS, PID and title;
- NOT counted against the item;
- named explicitly as such in the result, so a reader who disagrees can see it.
Prior precedent is the same: sitting 5's `38-S14(a)` recorded the install "through Steam's own
client" without scoring it.

OUT OF SCOPE (do not score, do not record against):
- `38-S10`, `38-S12`, and `38-S16`'s Linux half, even though the positive control incidentally
  shows the row-7 dialog;
- the native-ON branch;
- any fix to what is observed.
Name the remaining Linux items in the SUMMARY as cheap next candidates, since the instrument now
exists. Do not edit `.planning/STATE.md`: the quick orchestrator records the task.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

Large files. Read ONLY the ranges named in each task's read_first. `38-VERIFICATION.md` is about
55k tokens, `38-HUMAN-UAT.md` is 698 lines, and `ROADMAP.md` is about 5700 lines. None of them is
@-included, on purpose.

Reusable harness: `.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs`.
Its header documents every flag. The flags used here are `--open/--discharged/--retired`,
`--open-ids`, `--discharged-includes`, `--includes <scope>=<substring>` (split at the first `=`),
`--rev`, `--human-uat` and `--census`. It cross-checks gsd-core's `extractFrontmatter`,
`parseVerificationItems` and live `audit-uat --raw`. Use it as-is; do not modify it.

Discharge precedents to mirror in shape:
- `38-S02`'s discharged entry: `38-VERIFICATION.md` lines 400-409. PASS shape, single-quoted
  `result:` with apostrophes doubled, original fields verbatim after it.
- `38-W06`'s discharged entry: lines 410-419. FAIL shape, "A FAIL DISCHARGES THIS ITEM EXACTLY AS
  LEGITIMATELY AS A PASS".
- `38-S14`'s in-place `sitting_5_2026_09_26` field: line 69. The keep-open shape, used only on the
  NOT SCORED branch.
- `38-HUMAN-UAT.md` `## Sitting 5` (lines 542-664): the narrative shape (Conditions, per-item
  result, honest-limits paragraph).
- `34.13-UAT.md` `38-S02` receipt `outcome:` plus body row `| G-QUICK-WIN | tauri | RELOCATED →
  **PASS in Phase 38 (2026-09-26)** |` (commit `31f881ee0`): the origin walk-back shape.

YAML-writing rules for every value this task adds (from quick 260928-raq):
- Use single-quoted scalars (double every apostrophe) or double-quoted scalars (backslash-escape
  every inner double quote, and write no other backslash). Match the neighbouring field's style.
- Run `ledger-check.cjs` after every edit to `38-VERIFICATION.md`. It prints the parser's line and
  column on failure.
- Write no closing-tag-shaped token (a less-than sign followed by a slash) into any planning file.
  The envelope-tag gate flags them.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer. Launch the HEAD dev build on this Linux host under the declared real-profile arm, and prove every instrument end to end before anything is scored</name>
  <files>.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py</files>
  <precondition>An X11 session is live on `DISPLAY=:1`. `xdotool` and `xprop` are on PATH. `python3 -c 'import mss, PIL, Xlib'` succeeds. `node_modules/js-yaml` is 4.x.</precondition>
  <read_first>
    - .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs lines 1-66 (usage header)
    - meta/tauriDevPreflight.cjs lines 1-40 (what it refuses, and why)
    - src/frontend/state/InstallGameModal.ts lines 217-301 (startSteamQuickInstall and openSteamInstallOptions)
    - src/backend/storeManagers/steam/games.ts lines 1180-1208 (the arming log line)
  </read_first>
  <action>
Step 0. Re-measure the baseline, because it is mutable, and record every value in the SUMMARY.
- Run ledger-check with `--open 10 --discharged 16 --retired 10 --human-uat`, and `--census`.
  - If the counts differ from planning, record the actual counts. Every later count in this plan
    becomes "actual open minus 1 / actual discharged plus 1".
  - Confirm `38-S04` is still in `human_verification` with its `test:` text unchanged:
    `--includes 'open:38-S04:test=LINUX host, tauri runtime'`.
- Record the build and host identity:
  - `git rev-parse --short HEAD`;
  - confirm `git status --porcelain -- src src-tauri package.json` is EMPTY. If it is not, STOP:
    the build would not be HEAD;
  - `uname -a`, `PRETTY_NAME` from `/etc/os-release`, `$XDG_SESSION_TYPE` and `$DISPLAY`.

Step 1. Take the pre-launch census and record it.
- There must be no `gamelib-shell`, no `/opt/GameLib/gamelib` and no `tauri dev` process. Use
  bracketed `pgrep -af` patterns such as `[g]amelib-shell`, so pgrep cannot match its own parent
  shell.
- `ss -Hltn '( sport = :5173 )'` must be empty.
- If something foreign is running, do NOT kill it. STOP and report: it is not this task's process.
- Record whether the Steam client is running (`pgrep -x steam`).
- Record the profile directories: `ls -ld ~/.config/GameLib ~/.config/gamelib`, whether
  `~/.local/state/GameLib/logs/gamelib.log` exists, and the mode of
  `/tmp/gamelib-dev-secret-vault.json` if it exists (`stat -c '%a %n'`). NEVER read the vault's
  contents.

Step 2. Launch the dev build.
- Run it in the background under `setsid`, so the whole tree (pnpm, tauri CLI, cargo, vite,
  gamelib-shell, sidecar node) shares ONE process group.
- Write the group leader's PID to a file in the session scratchpad, and redirect stdout/stderr to a
  scratchpad transcript. Never write under `/tmp` directly and never in the repo.
- The command is `pnpm tauri:dev`, with no env overrides. This is the real-profile arm declared in
  the objective, and it is the same dev path sittings 1-5 used (dev secret vault).
- Poll, bounded to 30 minutes because the first launch compiles the Rust shell, until
  `xdotool search --onlyvisible --name '^GameLib$'` returns a window. Use the harness's until-loop
  or Monitor facility if foreground sleep is blocked.
- If the preflight refuses, or the build fails: record the transcript's reason (paraphrased; no
  paths from the operator's other projects), run the cleanup described in Task 3 step H for this
  process group, and STOP.

Step 3. Prove the build identity.
- For the GameLib window, read `_NET_WM_PID` with `xprop`.
- `readlink /proc/<pid>/exe` MUST equal `/home/graysonmitchell/GameLib/src-tauri/target/debug/gamelib-shell`.
- Also record the sidecar child (`build/main/sidecar.js`) and confirm it is inside the same process
  group.
- If the window PID's exe is anything else, STOP. That is the sitting-5 stale-build trap.

Step 4. Write `linux_sitting_capture.py` in this quick task's directory.
- Dependencies: Python 3, `mss`, `PIL`, `Xlib`, and `subprocess` calls to `xdotool`/`xprop` only.
  No network.
- Put a header comment stating that it exists for Phase 38 Linux sittings and naming its
  subcommands.
- Subcommands:
  - `find`: print the window id, PID, `/proc/<pid>/exe` and geometry of the visible `^GameLib$`
    window. Get the geometry from `xdotool getwindowgeometry --shell`. `grab`, `burst` and click
    coordinates all use this SAME geometry, so decoration offsets cancel out.
  - `selftest`: run `find`. Assert that the exe ends with `src-tauri/target/debug/gamelib-shell`.
    Grab the window region once and assert it is not blank: pixel standard deviation above a small
    threshold, and more than one distinct colour. Measure the achievable burst rate over 2 seconds
    and assert it is at least 10 frames per second. Print one `PASS`/`FAIL` line per check and exit
    non-zero on any FAIL.
  - `grab --out FILE`: write one window-region PNG.
  - `clients`: print every top-level client from the root `_NET_CLIENT_LIST`, with window id, PID,
    `/proc/<pid>/exe`, `WM_CLASS` and `_NET_WM_NAME`.
  - `burst --out DIR --pre S --seconds N [--click X,Y]`:
    - capture window-region frames as fast as possible into DIR; each filename carries epoch
      milliseconds;
    - on every iteration, also read `_NET_CLIENT_LIST`, and append any window id not present
      before the burst to `DIR/clients.jsonl` with its PID, exe, WM_CLASS, title, first-seen and
      last-seen epoch ms. This catches a transient top-level window that flashes and closes;
    - with `--click`, run `xdotool windowactivate --sync` on the GameLib window, then after `--pre`
      seconds run `xdotool mousemove --sync X Y click 1`, and write the click's epoch ms to
      `DIR/click.json`;
    - print the achieved frame rate and the median inter-frame interval.
  - `diff DIR [--flag F]`: for every frame, compute the fraction of pixels whose summed absolute RGB
    difference from the FIRST frame exceeds 48. Print the maximum fraction, the frame at the
    maximum, and every frame whose fraction exceeds F.

Step 5. Run `selftest` and record its output: the achieved fps and the frame interval.
- If the grab is blank (a WebKitGTK compositing or dmabuf blank window), stop the process group.
  Relaunch once with `WEBKIT_DISABLE_DMABUF_RENDERER=1` and record it as a deviation.
- If it is still blank, STOP: the absence instrument cannot see the surface it must score.

Step 6. Locate the log sink. `~/.local/state/GameLib/logs/gamelib.log` must now exist and have
been written since launch (check its mtime). This file, not the terminal, is the sink for the
arming line.

Step 7. Record where the native-install setting persists, and its value. This answers the
orchestrator's open question.
- Run `grep -rl enableSteamNativeInstall ~/.config/GameLib` to list the files. For each file,
  extract ONLY that key's value with a Python json read. Print nothing else from the file.
- If the key is absent, record "absent, so the runtime default `false` applies (`config.ts:376`,
  `nativeInstallSetting.ts:15`)".
- If it is `true`, turn it OFF through the GameLib UI: Settings, the toggle "Download Steam games
  directly in GameLib" (`EnableSteamNativeInstall.tsx:22-31`), using `xdotool` clicks derived from
  a viewed `grab`. Re-read the value. Record the ORIGINAL value, so Task 3 can restore it.
- Never hand-edit `config.json` while the app runs, because `GlobalConfig` flushes over it.
- State in the SUMMARY that `~/.config/gamelib/` (lowercase) is the Electron-era deb's profile and
  is not read by this build.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item && python3 $Q/linux_sitting_capture.py selftest && test -s "$HOME/.local/state/GameLib/logs/gamelib.log" && node .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs --open 10 --discharged 16 --retired 10 --human-uat --includes 'open:38-S04:test=LINUX host, tauri runtime' && npx prettier --file-info $Q/linux_sitting_capture.py | grep -Eq '"ignored":[[:space:]]*true'</automated>
  </verify>
  <done>
- The dev build window is up. Its PID's exe is proven to be `src-tauri/target/debug/gamelib-shell`.
- The capture instrument is proven non-blank, with a measured frame rate of at least 10 fps.
- The log sink is located and live.
- The native-install setting's file, key and value are recorded (OFF).
- The baseline counts are re-measured.
- The prettier line in verify proves the new `.py` sits under a prettier-ignored tree (`.planning`,
  and prettier has no Python parser), so no formatter check applies to it. The verify says so
  instead of running a vacuous `--check`.
- The app is LEFT RUNNING for Task 2.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Operator signs in to Steam inside the running GameLib dev window, and has the Steam client running and signed in</name>
  <action>
The executor first checks whether this is already satisfied, because the state is mutable: grab
the GameLib window and view it. If the Library already lists owned Steam games AND
`pgrep -x steam` shows the client running, record that and continue without pausing.

Otherwise, pause for the operator. Signing in to Steam needs the operator's credentials and a Steam
Guard or mobile-app QR approval. Claude cannot do either.
  </action>
  <instructions>
Already done by the executor: the HEAD dev build is running as a proven-identity `gamelib-shell`,
native Steam installs are confirmed OFF, and every capture instrument is self-tested.

Please do these, in the GameLib dev window that is open now:
1. Sign in to Steam from GameLib's store login screen, by QR or credentials. Wait until the
   Library lists your Steam games. This is the first GameLib Tauri sign-in on this machine; the
   token lands in the dev vault at `/tmp/gamelib-dev-secret-vault.json`, mode 0600.
2. Start the Steam client (if it is not already running) and make sure it is signed in. The
   install click hands off to it through `steam://install`.
3. Optional: name a SMALL Steam game you own that is NOT installed on this machine. Otherwise the
   executor picks one. Steam will show its own install dialog. The executor cancels it after the
   observation, so nothing should download.

Do NOT click Install on any game yourself. The executor takes the scored click, so that it is
captured.
  </instructions>
  <verification>The executor re-runs `linux_sitting_capture.py find`: the same PID and the same exe as Task 1. A fresh `grab` it views shows Steam games in the Library. `pgrep -x steam` returns a PID.</verification>
  <resume-signal>Type "signed in" (optionally followed by a game title), or describe what blocked you.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Take the scored primary-half click with a positive-control-calibrated burst, score it honestly, clean up every process, and record the result in the ledger, the narrative and the origin receipt</name>
  <files>.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md, .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md, .planning/ROADMAP.md, .planning/todos/pending/ (FAIL branch only)</files>
  <precondition>Task 2's resume signal has been received. `linux_sitting_capture.py find` still reports the Task 1 PID with exe `src-tauri/target/debug/gamelib-shell`.</precondition>
  <reversibility rating="reversible">Every ledger move is between two arrays in one file. Moving the entry back, and re-running ledger-check with the old counts, fully reverses it. On FAIL, the operator may prefer the `38-S08` keep-open precedent over the `38-W03`/`38-W06` discharge-as-FAIL precedent.</reversibility>
  <read_first>
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx lines 301-410 (the primary half vs the SteamInstallCaret)
    - 38-VERIFICATION.md lines 1-12, 36-47 and 398-431 only
    - 38-HUMAN-UAT.md lines 1-34 and 542-698 only
    - 34.13-UAT.md lines 36-50 and the single line starting `| G-QUICK-LINUX | tauri |`
    - ROADMAP.md: the single line starting `**Items: 10 OPEN as of 2026-09-28`
  </read_first>
  <action>
A. Re-confirm the state, because it is mutable.
- Same PID and exe as Task 1.
- Choose the target: a Steam game that is owned, visible in the Library, and NOT installed.
  - Confirm `appmanifest_<appId>.acf` is absent from every library path in
    `~/.steam/debian-installation/steamapps/libraryfolders.vdf` that exists on disk.
  - Prefer a small game.
  - Record its title and appId.
- Record the Steam client state.
- Navigate to the game's page ONLY by clicking in the UI: `xdotool` clicks at coordinates read off a
  viewed `grab`, plus the window origin from `find`. No `gamelib://` or `heroic://` URL, ever.

B. Positive control. This is Test 4, absence-observability, and it must come BEFORE the scored
click. Once the scored click starts an install, the caret unmounts.
- Open "Install with options…" under `burst --pre 0.5 --seconds 4`.
  - Route: the `SteamInstallCaret` beside the Install button (`MainButton.tsx:362-402`), then its
    menu item.
  - Fallback route: right-click the Library GameCard ("Install with options…",
    `GameCard/index.tsx:386-402`).
  - Where the route needs two clicks, perform the first click before the burst and let `--click`
    take the one that opens the dialog.
- Run `diff` on that burst. Record the maximum fraction P. VIEW the max frame and confirm it shows
  the dialog.
- Close it with its Cancel button, then view a `grab` to confirm it is gone.
- If P is below 0.10, or the viewed frame does not show the dialog, the instrument cannot see a
  dialog. The item is NOT SCORED (see F).
- This control does NOT score `38-S10` or `38-S16`. Record nothing against them.

C. The scored click.
- Take a fresh `grab` and view it. Identify the PRIMARY half of Install: the button face, NOT the
  caret. Compute its centre in absolute coordinates.
- Save a `clients` dump as the baseline.
- Run `burst --pre 0.5 --seconds 6 --click X,Y`.
- At +10s and at +20s after the click, take a `grab` still and a `clients` dump.
- Do not touch the Steam client's windows until the +20s capture is done.

D. Analysis.
- Run `diff` on the scored burst with `--flag` set to P/2.
- VIEW, at minimum: the first pre-click frame, the max-diff frame, EVERY flagged frame, and both
  stills.
- Attribute every window in `clients.jsonl` and in the +10s/+20s dumps that was not in the baseline:
  - GameLib-owned when its PID is the Task 1 shell PID, or a process inside this task's process
    group;
  - Steam-client-owned otherwise (typically `WM_CLASS` steam or steamwebhelper). These are
    recorded, not scored (see the objective's SCORED SURFACE).

E. Arming proof.
- From `gamelib.log`, extract the lines stamped from the click's second through +20s.
- The line `SteamGame: delegating install for appId <appId> via steam://install/<appId>` MUST be
  present, for the chosen appId. It is emitted only when native installs are OFF (`games.ts:1185`).
  Its presence also proves the degrade branch (`InstallGameModal.ts:275`, the only quick-install
  route to the dialog) was not taken. The two are mutually exclusive at `:263-275`, and the
  no-target branch at `:245-253` never reaches the degrade at all.
- Also note, verbatim, any line containing
  `34.13 installSteamGame: the install dispatch REJECTED` and any ERROR line in that window.

F. Score. Exactly one outcome applies.
- PASS, when ALL of these hold:
  - the arming line is present;
  - the positive control proved the instrument (P at least 0.10, dialog seen);
  - no viewed frame shows a GameLib dialog, modal, overlay, picker, error dialog, or any partial
    or flashing one;
  - `clients.jsonl` never recorded a GameLib-owned new window.
- FAIL, when any GameLib-owned surface opened, however briefly. Record exactly what opened, and
  its frame timestamps. Do NOT retry to get a different answer. The item's own discipline is to
  record the first observation.
- NOT SCORED, when the arming line is absent (the branch never ran) or the positive control
  failed. An unarmed "nothing opened" is not a pass.

The result must state these honest limits:
- The measured frame interval bounds the shortest flash the burst can see. The structural
  argument in E covers the quick-install dialog path, not an unrelated overlay.
- The evidence is machine-side. No operator eyeball was collected during the click.
- The scope note from the objective: native OFF never evaluates `resolveSteamSectionGating`.

G. Steam side. After the +20s capture, if Steam's own install dialog opened, cancel it (not
scored), so nothing downloads. Confirm the appmanifest is still absent. If a download started
anyway, leave it for the operator and record it.

H. Cleanup. ALWAYS run this, including after any STOP in any task.
- If Task 1 turned native installs OFF from an original `true`, restore it through the UI first,
  and re-read the value.
- Send `kill -TERM` to the negative process-group id. Wait up to 20 seconds, then `kill -KILL` the
  group if anything remains.
- Verify, with bracketed patterns, that `pgrep -af` finds no `[g]amelib-shell`,
  `[b]uild/main/sidecar.js`, `[t]auri dev` or `[v]ite` process from this run, and that
  `ss -Hltn '( sport = :5173 )'` is empty. Record the final census.
- Do NOT stop the Steam client; the operator owns it.
- Do NOT read or delete the dev vault. Record only its mode.
- Delete the scratchpad bursts, dumps and `tauri:dev` transcript once the evidence below is copied
  out.

I. Evidence. Write it into `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/`.
- PNGs, all window-region only: `positive-control-max.png`, `scored-pre-click.png`,
  `scored-max-diff.png`, `scored-plus10s.png`, `scored-plus20s.png`.
- `clients-new-windows.txt`: window id, PID, exe basename, WM_CLASS and title for every
  non-baseline window, plus `click.json`'s epoch ms and the fps and interval.
- `log-excerpt.txt`: ONLY the lines, from the click second through +20s, that contain `SteamGame`,
  `installSteamGame` or `ERROR`.
- Privacy gate:
  - VIEW every PNG. Crop out (with PIL) or drop any PNG that shows a Steam or GameLib account name,
    avatar, SteamID or e-mail.
  - The text files must contain no 17-digit run and no case-insensitive match for `refresh.?token`,
    `access.?token` or `password`. Redact any such hit.
  - Check window titles for account names.

J. Records. Use scoped Edits only; never Write an existing file. Use the unique anchors named here.
Substitute the RESULT word (PASS or FAIL) and the measured values.

`38-VERIFICATION.md`, on PASS or FAIL:
- Remove the whole `38-S04` entry, from `  - id: "38-S04"` through its `prior_state:` line, together
  with the three blank lines after it. Exactly one blank line should remain between `38-W05`'s last
  line and `  - id: "38-S10"`.
- Append the entry at the END of `human_verification_discharged`, directly after `38-E02`'s
  `prior_state:` line and before the closing fence. The arrays are in arrival order.
- Field order: `id`, then `result`, then every original field VERBATIM in its original order
  (`test`, `expected`, `why_human`, `blocked_by`, `platform_gate`, `origin_phase`, `origin_item`,
  `prior_state`).
- `result` is a single-quoted scalar with apostrophes doubled, like `38-S02`'s. It opens
  `RESULT -- sitting 6, 2026-09-28, the FIRST LINUX SITTING` and states:
  - host and session: Pop!_OS 22.04, X11;
  - the build: `pnpm tauri:dev` DEBUG at `<sha>`, identity PROVEN via PID and
    `/proc/<pid>/exe` = `src-tauri/target/debug/gamelib-shell`, not labelled;
  - the real-profile arm, in one clause;
  - the game title and appId;
  - native OFF: the file and value found (or absent, so the default applies), plus the arming line
    verbatim, with its code anchors;
  - the positive control's P;
  - the scored max fraction, fps and frame interval;
  - the window attribution, with Steam-client windows listed and the reason they are not scored;
  - the scope note;
  - the honest limits;
  - the evidence directory path;
  - `quick 260928-tvk`.
- A FAIL result additionally:
  - quotes what opened;
  - names the todo by filename;
  - says it was discharged on the `38-W03`/`38-W06` precedent that an observed FAIL discharges the
    item, with re-verification after the fix carried by that todo;
  - says it is reversible to the `38-S08` keep-open precedent if the operator prefers.
- `score:` is single-quoted, so double every apostrophe you write.
  - Replace `10 relocated items OPEN, 16 discharged` with `9 relocated items OPEN, 17 discharged`.
  - Replace the anchor `closed via quick `260926-a1l`), 10 retired.` with the same text, but
    insert `; sitting 6, 2026-09-28 (LINUX, the first Linux sitting): `38-S04` RESULT, closed via quick `260928-tvk``
    before its `), 10 retired.`.
  - Insert a clause IMMEDIATELY BEFORE the unique text `(Was 11 until 2026-09-28`. It opens
    `(Was 10 until 2026-09-28, when quick `260928-tvk` DISCHARGED `38-S04` RESULT from sitting 6`
    and states the one-line reason. It ends with
    `Confirmed at the tool: gsd-core audit-uat `by_phase["38"]` moved 10 -> 9 and total_items A -> B, which is the check that the array still parses -- a FLAT count after a removal would mean the edit did not register or the array failed to parse.) `.
  - Use the measured A and B values.
- On NOT SCORED instead: leave the entry in place. Insert a double-quoted
  `sitting_6_2026_09_28:` field directly after its `id:`, stating NOT SCORED, why, and what was
  observed. Change no count; `score:` gets no edit. Then skip the `34.13-UAT.md` and ROADMAP edits
  below.

`38-HUMAN-UAT.md`:
- Frontmatter: append one double-quoted `sessions:` string:
  `Sitting 6 -- 2026-09-28, Linux (Pop!_OS 22.04, X11), tauri dev build <sha>, identity proven by PID -- 38-S04 RESULT`.
- Leave `updated:` (already 2026-09-28) and `source:` unchanged.
- In the `## Current Test` bracket paragraph, insert one sentence directly before the text
  `the artifacts.]` ends it (line 33). The sentence records sitting 6 as the first Linux sitting,
  gives the 38-S04 result, gives the new ledger counts, and points to the new section by its
  heading text.
- Append a new section at the end of the file. Heading:
  `## Sitting 6 — 2026-09-28, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `<sha>``.
  Its contents:
  - Conditions: build identity proof; the real-profile arm and why; a first GameLib Tauri run on
    this host, which created `~/.config/GameLib`; the native-OFF location and value; the Steam
    client state; the operator sign-in in Task 2; the Linux log path
    `~/.local/state/GameLib/logs/gamelib.log`.
  - The positive control.
  - The result, with the arming line verbatim.
  - The window attribution.
  - The scope note.
  - An honest-limits paragraph.
  - The evidence file paths.
  - A line that `38-S10`, `38-S12` and `38-S16`'s Linux half were NOT scored.
- THE NEW SECTION MUST CONTAIN NO `### <number>.` heading and NO line starting at column 0 with
  `expected:` or `result:`. gsd-core's UAT parser would read either as an item, and `audit-uat`
  would then report a `parse_gap`.

`34.13-UAT.md`, on PASS or FAIL only:
- Replace the `outcome:` of the receipt whose `to_item` is `"38-S04"`. Use a multi-line
  `old_string` that spans from `to_item: "38-S04"` to its
  `outcome: "open — not yet run in phase 38"`, because that outcome literal occurs 4 times in the
  file.
- The new value is double-quoted, with no inner double quotes and no backslashes. It starts
  `DISCHARGED RESULT 2026-09-28 by quick 260928-tvk (Phase 38 sitting 6, the first Linux sitting, Pop!_OS 22.04, tauri dev build <sha>).`
  and summarises the observation and the arming line in one or two sentences.
- In the body table, change `| G-QUICK-LINUX | tauri | RELOCATED |` to
  `| G-QUICK-LINUX | tauri | RELOCATED → **RESULT in Phase 38 (2026-09-28)** |`.
- Do NOT touch the `38-S06` receipt's pre-existing parse error. It is pinned in
  `planning-frontmatter-gate.py`, and a repair turns the gate red with a stale pin.

`ROADMAP.md`, on PASS or FAIL only:
- Insert one paragraph and a blank line immediately before the paragraph starting
  `**Items: 10 OPEN as of 2026-09-28, plus 16 DISCHARGED and 10 RETIRED**`. It opens
  `**Items: 9 OPEN as of 2026-09-28 (sitting 6, later the same day), plus 17 DISCHARGED and 10 RETIRED**`
  (quick `260928-tvk`). In two to four sentences it records the first Linux sitting and the
  `38-S04` result, and points to `38-HUMAN-UAT.md`'s `## Sitting 6` section.
- In the same Edit, append ` (historical, superseded by the sitting-6 count above)` directly after
  the bold `**Items: 10 OPEN as of 2026-09-28, plus 16 DISCHARGED and 10 RETIRED**`. This matches
  the house pattern.

Todo, on FAIL only: `.planning/todos/pending/2026-09-28-<short-slug>.md`.
- Frontmatter, in CLAUDE.md order: `created: 2026-09-28`, a single-quoted `title` naming what
  opened, `found_during: Phase 38 sitting 6 (quick 260928-tvk)`, `severity: major` (D-22's
  no-force-open contract is broken on Linux; downgrade only with a stated reason from the
  vocabulary table), `platform: linux` immediately after, `ready: live-gate` immediately after,
  `area: steam-install`, and a `files` list of the code anchors.
- Body:
  - what opened, verbatim, with frame timestamps;
  - the arming line;
  - a mechanism hypothesis LABELLED as a hypothesis;
  - the re-verification step, which is to re-run `38-S04`'s observation with
    `linux_sitting_capture.py`.
- Values must be bare and lowercase.

K. Validate everything BEFORE committing. Do not edit `.planning/STATE.md`.

L. Commit in ONE Bash invocation: `git add` the exact paths, check `git diff --cached --name-only`
lists only those paths, then commit. The paths are the capture script, the evidence files, the
three phase files, ROADMAP.md, and on FAIL the todo.
- Message: `docs(quick-260928-tvk): Phase 38 sitting 6, first Linux sitting -- 38-S04 RESULT`.
- End the message with this session's attribution lines.
- Every path is under `.planning/`, which is prettier-ignored. The verify proves that with
  `--file-info` rather than running a vacuous `--check`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && node $L --open 9 --discharged 17 --retired 10 --human-uat --open-ids 38-W04,38-W05,38-S10,38-S12,38-S14,38-S16,38-E01,38-E03,38-E04 --discharged-includes 38-S04 --includes 'discharged:38-S04:result=260928-tvk' --includes 'discharged:38-S04:result=FIRST LINUX SITTING' --includes 'discharged:38-S04:result=SteamGame: delegating install for appId' --includes 'discharged:38-S04:result=src-tauri/target/debug/gamelib-shell' --includes 'discharged:38-S04:test=LINUX host, tauri runtime' --includes 'top:score=9 relocated items OPEN, 17 discharged' --includes 'top:score=(Was 10 until 2026-09-28' && if node $L --open 10 --discharged 16 --retired 10 >/dev/null 2>&1; then echo 'NEGATIVE CONTROL DID NOT FAIL (old counts still pass)'; exit 1; fi && node $L --rev 7d7a460ba --open 10 --discharged 16 --retired 10 --includes 'open:38-S04:test=LINUX host, tauri runtime' >/dev/null && node $L --census --expect-bad 3 | grep -F '34.13-UAT.md' | grep -qF '(62:176)' && grep -q '^| G-QUICK-LINUX | tauri | RELOCATED → \*\*' .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md && grep -q '^## Sitting 6 — 2026-09-28, Linux' .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md && grep -q 'Items: 9 OPEN as of 2026-09-28' .planning/ROADMAP.md && ls $Q/evidence/*.png >/dev/null && ! grep -Eq '[0-9]{17}' $Q/evidence/*.txt && ! grep -Eiq 'refresh.?token|access.?token|password' $Q/evidence/*.txt && test -z "$(pgrep -af '[g]amelib-shell|[b]uild/main/sidecar.js|[t]auri dev')" && test -z "$(ss -Hltn '( sport = :5173 )')" && pnpm -s planning-gates && for f in .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md .planning/ROADMAP.md; do npx prettier --file-info $f | grep -Eq '"ignored":[[:space:]]*true' || { echo "not prettier-ignored: $f"; exit 1; }; done</automated>
  </verify>
  <done>
- `38-S04` was scored from a proven-identity HEAD dev build. The positive control proved the
  instrument, and the arming log line proved native installs OFF.
- PASS or FAIL: the entry was MOVED to `human_verification_discharged` with a result that carries
  every measured value and every honest limit. The ledger parses. `audit-uat` `by_phase['38']`
  moved 10 -> 9, `parse_gap_files` is 0, and `status` is still `human_needed`. The old counts FAIL
  on the live file (negative control), while the pre-task blob still shows `38-S04` open.
- `34.13-UAT.md`'s receipt and body row are walked back. Its pinned `(62:176)` error is unchanged,
  and the census still reports 3 bad.
- `38-HUMAN-UAT.md` has the sessions entry and the `## Sitting 6` section, and gsd-core still
  reports no parse gap.
- ROADMAP's count paragraph is current.
- On FAIL: a todo exists with frontmatter the CI gate accepts.
- On NOT SCORED: run the alternative verify instead. The item stays open with a
  `sitting_6_2026_09_28` note, and the counts stay 10/16/10: `node $L --open 10 --discharged 16 --retired 10 --includes 'open:38-S04:sitting_6_2026_09_28=NOT SCORED'`,
  plus the census, process, privacy and planning-gates checks above. There is no 34.13 or ROADMAP
  edit.
- No process from this run survives, and nothing listens on :5173.
- Committed evidence passes the privacy gate.
- `pnpm planning-gates` is green. Every written path is proven prettier-ignored, so no vacuous
  `--check` was run.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| live app, real profile -> committed repo evidence | Screenshots, window titles and log lines from the operator's real Steam session cross into a public repo |
| running binary -> recorded build identity | What actually ran can differ from what the record claims (the sitting-5 stale-build incident) |
| ledger edit -> gsd-core audit-uat | One YAML syntax slip silently removes the whole Phase 38 backlog from the audit |
| this task's process tree -> the operator's desktop | Dev servers and the sidecar can outlive the task |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260928-tvk-01 | Information disclosure | evidence PNGs and txt files | high | mitigate | Captures are window-region only (never full screen, so Steam-client windows are attributed by `xprop` text, not pixels). Every PNG is VIEWED before commit, and any account name, avatar, SteamID or e-mail is cropped or the file dropped. The log excerpt is limited to lines containing `SteamGame`/`installSteamGame`/`ERROR` from the click second through +20s. The verify fails on any 17-digit run or on `refresh.?token`/`access.?token`/`password`. |
| T-260928-tvk-02 | Information disclosure | `/tmp/gamelib-dev-secret-vault.json` (plaintext Steam refresh token) | medium | accept | This is the by-design DEV-ONLY vault, the same path sittings 1-5 used. Its 0600 mode is enforced at `devSecretVault.ts:110-114`, and the host is the operator's single-user machine. The executor never reads, prints or copies it, and records only its mode. It is left in place so the remaining Linux items (`38-S10`/`38-S12`/`38-S16`) need no re-sign-in. |
| T-260928-tvk-03 | Repudiation / Tampering | recorded build identity | high | mitigate | The window `_NET_WM_PID` must resolve through `/proc/<pid>/exe` to `src-tauri/target/debug/gamelib-shell`, the tree must be clean for `src src-tauri package.json` at launch, and the sha is recorded. `meta/tauriDevPreflight.cjs` refuses a foreign shell. No deep links are used (`gamelib://` has no handler; the stale Electron deb owns `heroic://`). |
| T-260928-tvk-04 | Tampering | `38-VERIFICATION.md` / `34.13-UAT.md` / `38-HUMAN-UAT.md` frontmatter | high | mitigate | `ledger-check.cjs` checks counts, ids, includes, gsd-core `parseVerificationItems` and live `audit-uat` (`by_phase['38']` 10 -> 9, `parse_gap_files` 0). There is a negative control on the old counts. The `planning-frontmatter-gate.py` ledger walk runs via `pnpm planning-gates`. The census asserts `34.13-UAT.md`'s pinned error is still exactly `(62:176)`. The new HUMAN-UAT section forbids `### N.` headings and column-0 `expected:`/`result:` lines. |
| T-260928-tvk-05 | Denial of service | orphaned `gamelib-shell`/sidecar/vite processes | medium | mitigate | Launch under `setsid` with the process-group id recorded, and kill the group with TERM then KILL. The verify asserts no bracketed-pattern `pgrep` match and an empty `ss` on :5173. Cleanup runs on every STOP path too. |
| T-260928-tvk-06 | Tampering | operator's real GameLib settings | low | mitigate | If native installs had to be turned OFF, the original value is recorded and restored through the UI before teardown. `config.json` is never hand-edited while the app runs. |
</threat_model>

<verification>
- Task 1 verify: `selftest` passes (identity, non-blank, at least 10 fps), the log sink exists, the
  baseline ledger-check passes, and the capture script is proven prettier-ignored.
- Task 2: the operator's resume signal, re-checked by `find` plus a viewed `grab` plus
  `pgrep -x steam`.
- Task 3 verify: the discharge-path command above, or the NOT SCORED alternative given in its done
  block.
- Across the whole task: `audit-uat` `by_phase['38']` moves exactly 10 -> 9 on discharge and stays
  flat on NOT SCORED. Record `total_items` before and after (429 -> 428 expected on discharge).
</verification>

<success_criteria>
- The ledger states a true, evidenced result for `38-S04`: PASS or FAIL, discharged, or NOT SCORED
  and left open. It is backed by a proven build identity, a proven-armed native-OFF branch, and a
  positive-control-calibrated absence instrument.
- Phase 38 stays audit-visible with `status: human_needed`, and every count agrees across the
  ledger, `audit-uat`, `38-HUMAN-UAT.md`, `34.13-UAT.md` and ROADMAP.md.
- Nothing from this run is left running. Nothing committed identifies the operator's Steam account.
- The SUMMARY records:
  - the setting-location finding (capital-G `~/.config/GameLib/config.json`; lowercase
    `~/.config/gamelib/` is the stale Electron deb's profile);
  - every re-measured baseline value;
  - the fps, frame interval, P and the scored max fraction;
  - the remaining Linux items as next candidates.
</success_criteria>

<output>
Create `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/260928-tvk-SUMMARY.md` when done.
</output>
