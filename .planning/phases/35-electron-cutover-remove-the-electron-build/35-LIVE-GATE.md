---
phase: 35-electron-cutover-remove-the-electron-build
plan: 19
type: live-gate
status: run
blocking: true
created: 2026-08-30
criteria_total: 21 # sum of criteria 1-21 below; grep -c "^Verdict:" must equal this once run
verdict: FAIL — 17 PASS / 4 FAIL / 0 NOT ATTEMPTED (21 of 21 measured). Criteria 6, 10, 14, 16 FAIL. Criterion 17 was measured 2026-08-30 on the debug-packaged build and scored PASS ON SUBSTANCE — plugin registration and the `updater:default` capability grant are verified (`window.__TAURI__.updater.check` is a `function`, the invoke reaches `plugin:updater|check`, a real HTTP fetch runs); it throws `ReleaseNotFound` only because the configured endpoint 404s (no `latest.json` published at the `updater` tag), and this criterion's own "does not throw" clause is itself wrong for a 404 endpoint — only a 204 resolves to `null`. That clause is therefore recorded as a CONTRACT-EXPECTATION DEFECT, not a code defect. NOTE: all four FAILs trace to pre-existing or upstream-inherited code, NOT to the Electron cutover.
run_date: 2026-08-30
runner: Claude Opus 5 session (gesture execution by the human operator at the keyboard; contract authored by a different session per standing rule D-E)
session_dir: MULTIPLE — see per-criterion notes. /tmp/gamelib-35-19-gate-9XTqHx (criteria 1-9); app relaunched via `open -a` for criteria 10-12 (no stderr capture — see D-35-19-02); /tmp/gamelib-35-19-c13-jaiski (criteria 13-17 window); /tmp/gamelib-35-19-c18-lo8xI8 (criterion 18 restart); /tmp/gamelib-35-19-c20-hXvo5l (criteria 20, 21, 19). ORIGINAL NOTE: app pid 23589 launched 08:50:00, stdout+stderr tee'd. Criterion 1 was observed on an EARLIER instance (pid 21484, 08:34:31, /tmp/gamelib-35-19-gate-sFpgKb) before four relaunches during the Keychain diagnosis in D-35-19-01; criteria 2-21 run on this instance.
---

# Phase 35 Plan 19 — Blocking Live Gate (D-16, REQ-35-20)

**This document is normative.** Task 3's checkpoint cites it by criterion number and must not
paraphrase it. **Author: Task 1 (this document). Runner: Task 3, a different agent/session per
standing rule D-E — the author of a gate contract may never also run it.**

**Discharges D-16.** Phase 34.5 closed on a clean 4 PASS / 0 FAIL measured on a dev build, and
that number said nothing about the artifact — `R-34.5-G1-PKG` (locale files absent from the
bundle) survived three phases invisible to it. This gate is the first measurement of the thing
users actually receive.

## Header

- **Commit:** `fcceb141ec7ccce709641b80266e1f2b1b070a55` (branch `fix/steam-native-install-stability`, authored 2026-08-30). The runner re-records `git rev-parse --short HEAD` at build time — a concurrent session may move this before the gate runs.
- **Date authored:** 2026-08-30
- **Primary build command (release, used for every criterion below EXCEPT criterion 17):**
  ```sh
  pnpm exec vite build && pnpm build:sidecar-sea && pnpm exec tauri build
  ```
  This is a full release build, matching the 35-04 precedent (`GameLib_0.7.0_aarch64.dmg`,
  1m34s, `aarch64-apple-darwin`).
- **Alternate build command (debug-packaged, used ONLY for criterion 17 — see its own `Build:` field for why):**
  ```sh
  pnpm tauri:dev:packaged
  ```
  which runs `pnpm exec vite build && pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri build --debug`.
- **Artifact path (release):** the DMG at `src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg` is the artifact (exact filename depends on the version in `package.json` at build time — currently `0.7.0` — the runner records the real filename, not this value). **`src-tauri/target/release/bundle/macos/` is NOT a source for the `.app`.** Measured 2026-08-30: that directory contained only a `GameLib.app.tar.gz` dated a week earlier that the release build did NOT regenerate, and no `.app` directory at all. Taking the `.app` from there silently measures a stale artifact — the exact `R-34.5-G1-PKG` class of error this gate exists to prevent. Mount the DMG.
- **Artifact path (debug-packaged, criterion 17 only):** `src-tauri/target/debug/bundle/macos/GameLib.app`.
- **Every criterion below is measured against the PACKAGED release `.app` unless its own `Build:` field states otherwise.** `pnpm tauri:dev` (the plain dev-server mode) is banned outright — after plan 35-03 it loads the renderer over HTTP via `devUrl` and never resolves `frontendDist`/`resource_dir()`, so it is structurally incapable of exercising the code path `R-34.5-G1-PKG` lived in.
- **Launch method (required for sinks 2 and 3 below):** the runner launches the packaged `.app` by executing its embedded binary directly from a Terminal, redirected with `tee -a` to a session transcript file — never by double-clicking in Finder. Finder/LaunchServices launches discard the process's stdout/stderr entirely, which is the only channel carrying the two terminal-only log lines this gate depends on (criterion 13's `[shell] response for unknown/timed-out id=... (dropped)` negative check, and any other raw `eprintln!`/`println!` line not routed through `shell_diag()`). Example:
  ```sh
  SESSION_DIR="$(mktemp -d /tmp/gamelib-35-19-gate-XXXXXX)"; echo "$SESSION_DIR"
  "/Applications/GameLib.app/Contents/MacOS/gamelib-shell" 2>&1 | tee -a "$SESSION_DIR/transcript.log"
  ```
  Record `$SESSION_DIR` in this document's `session_dir` frontmatter field.

## Windows/Linux disposition (option-c, decided 2026-08-30)

**This gate closes on macOS plus artifact PRODUCTION only. It does NOT close on a Windows or
Linux smoke launch.** This is a recorded scope reduction against D-16's literal wording, not a
routine deferral. D-16 requires "the CI matrix producing installable artifacts PLUS A SMOKE
LAUNCH" before Windows and Linux count as proven out. `.github/workflows/release-tauri.yml`
builds, signs, and uploads the NSIS installer and the AppImage to a draft release
(`tauri-apps/tauri-action@v1`, last step at line 429) — that step performs no runtime check of
its own. Neither artifact has ever been executed by anything, human or CI, since the Tauri
rearchitecture began. This gate is closing Phase 35 on artifact production alone for the
Windows and Linux legs; the smoke-launch half of D-16 is NOT satisfied by this gate's run.

The smoke-launch follow-up is routed to Phase 38
(`38-deferred-hardware-and-environment-uat-gates-windows-linux-ma`), whose ROADMAP goal already
covers this exact case (UAT items that cannot run on this machine because it lacks the needed
hardware/OS). It is recorded there as two items, split at the platform boundary per Phase 38's
own relocation rules:
- **`38-W04`** — Windows NSIS installer smoke launch.
- **`38-W05`** — Linux AppImage smoke launch.

Both items name this plan (`35-19 Task 2, option-c`) as their origin, per the bidirectional
cross-reference Phase 38's relocation rules require. See `REQUIREMENTS.md` REQ-35-20 for the
matching acknowledgment on the requirement-text side.

## Three log sinks — read before scoring any log-based criterion

This project has three, not two, log destinations, and conflating them is the exact shape of
defect Test 3 exists to catch:

1. **`~/Library/Logs/GameLib/gamelib.log`** — sidecar `logInfo`/`logWarning` lines only (Node
   process). Never carries `[shell]`-prefixed text.
2. **`~/Library/Logs/GameLib/gamelib-shell.log`** — Rust-side lines emitted through the
   `shell_diag()` helper specifically (deep-link decisions, tray About). `shell_diag()` writes to
   BOTH this file AND stderr, so these lines are the only `[shell]` lines that survive a
   Finder-launched (non-terminal) session. **Only `shell_diag()` call sites reach this file** —
   not every `[shell]`-prefixed line in the source does.
3. **The terminal transcript** (`tee`'d stdout/stderr of a terminal-launched process) — every
   `eprintln!`/`println!` line, including the `[shell]`-prefixed ones that do NOT go through
   `shell_diag()` (for example the response-dropped warning at `main.rs:7089`, used by criterion
   13). This sink exists ONLY if the app was launched from a terminal per the Header's launch
   method — it captures strictly more than sink 2, never less, but requires the terminal launch.

## Run order — derived from the Test 5 pairing sweep (see `## Contract review`)

Criteria are numbered in the order they must be run. Do not reorder. Rationale for each ordering
constraint is recorded in the Contract review section below; this list is the operative sequence.

1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 -> 19 -> 20 -> 21

**Governing principle:** every criterion that quits or relaunches the app performs that quit/relaunch
itself, as part of its own gesture sequence, rather than relying on a previous criterion's ending
state — so a BLOCKED or skipped criterion cannot strand a later one. The two exceptions, stated
explicitly where they occur, are criteria 10-12 (a deliberate chain: cold start, then warm reuse of
the same instance, then a third gesture against that same instance) and criteria 18-19 / 20-21 (each
restart-survival criterion must immediately precede its own store's logout criterion, or the logout
criterion's precondition — "the session survived a restart before logout" — is not met).

**Verdict vocabulary (used in every `Verdict:` field below):** `PASS`, `FAIL`, `BLOCKED`,
`NOT ATTEMPTED`. A criterion that could not be reached is `NOT ATTEMPTED`, never `PASS` — a pass
covering an unreachable surface is a recorded failure shape in this project.

---

## Criteria

### 1. Install and first launch

What: The packaged `.app` mounts/copies and launches without crashing.
Build: packaged (release)
Preconditions: No prior GameLib installation state is required, but if one exists, it does not
prevent this criterion from being scored — this criterion is about the artifact launching, not
about a clean-machine state.
Gesture sequence: Build per the Header's release command. Mount the DMG (`hdiutil attach` or
double-click), copy `GameLib.app` to `/Applications`, eject the DMG. Launch via the terminal method
in the Header (`Contents/MacOS/gamelib-shell`, `tee`'d). Wait 10 seconds.
Sink: terminal transcript (crash would show a Rust panic or a segfault signal; absence of
either, plus a visible window, is the positive signal).
Expected: The app launches, a window appears, and the process is still running after 10 seconds
(`ps aux | grep GameLib` shows the process; no crash reporter dialog).
Observed:
Built from source at HEAD via `pnpm exec vite build && pnpm build:sidecar-sea && pnpm exec tauri
build`; DMG `GameLib_0.7.0_aarch64.dmg` (530 MB, 2026-08-30 08:09:37) mounted and `GameLib.app`
copied to `/Applications` at 08:18. Install confirmed fresh: bundle mtime `Aug 30 08:18` (the
prior resident was a Jul 27 build and was removed), `CFBundleExecutable=gamelib-shell`, both
`gamelib-shell` (232 MB) and `gamelib-sidecar` (169 MB) present and dated 08:18.
Launched from Terminal per the Header method: pid 21484 at 08:34:31 on ttys004, parent
`/bin/zsh -il`, fd 1 and fd 2 both on a pipe to `tee -a`. Window opened normally. Process was
still alive at 3m54s elapsed — far past the 10-second bar — with no Rust panic, no segfault
signal and no crash reporter dialog. Its child sidecar was the BUNDLED
`/Applications/GameLib.app/Contents/MacOS/gamelib-sidecar` (pid 21497), not a repo dev sidecar.
NOTE: four macOS Keychain prompts appeared on this launch. Investigated and resolved as NOT a
defect — see `deferred-items.md` `D-35-19-01`. It is the "Allow" vs "Always Allow" distinction;
no criterion covers Keychain, so it is ledgered rather than scored here.
Verdict: PASS

### 2. Locale artifact populated in the bundle

What: `Contents/Resources/build/locales/en/` exists inside the artifact and is populated — the
artifact-level half of the `R-34.5-G1-PKG` defect this gate exists to catch.
Build: packaged (release) — static file check, no launch required, can run before or after
criterion 1.
Preconditions: None.
Gesture sequence:
```sh
ls -la "/Applications/GameLib.app/Contents/Resources/build/locales/en/"
ls "/Applications/GameLib.app/Contents/Resources/build/" | grep -c "^"
ls "/Applications/GameLib.app/Contents/Resources/public" 2>&1
```
Sink: direct filesystem `ls` output (not a log).
Expected: The `en/` directory lists multiple `.json` files with non-zero sizes (the 35-04
precedent recorded 4 files). The third command — checking for `Contents/Resources/public`, the OLD
(pre-fix) asset root — returns "No such file or directory": the negative control proving the
artifact does not carry the stale root alongside the new one.
Observed:
```
total 208
drwxr-xr-x@  6 graysonmitchell  admin    192 Aug 30 08:18 .
drwxr-xr-x@ 51 graysonmitchell  admin   1632 Aug 30 08:18 ..
-rw-r--r--@  1 graysonmitchell  admin   9319 Aug 30 08:18 gamelib.json
-rw-r--r--@  1 graysonmitchell  admin  19113 Aug 30 08:18 gamepage.json
-rw-r--r--@  1 graysonmitchell  admin    700 Aug 30 08:18 login.json
-rw-r--r--@  1 graysonmitchell  admin  69538 Aug 30 08:18 translation.json
5
ls: /Applications/GameLib.app/Contents/Resources/public: No such file or directory
```
All four locale files present with non-zero sizes, matching the 35-04 precedent of 4 files.
`Resources/build/` holds 5 entries. The negative control returned `No such file or directory`,
so the artifact does NOT carry the stale pre-fix `public` asset root. All three file mtimes are
`Aug 30 08:18`, the DMG-install time of the artifact under gate.
Verdict: PASS

### 3. Translated strings render and a language switch works

What: The UI shows real translated text (not raw i18n keys), and switching the language in
Settings actually changes displayed strings — the specific consequence `R-34.5-G1-PKG` half (a)
would have caused, and the one criterion in this document that would have caught the original
defect by itself.
Build: packaged (release)
Preconditions: App running (criterion 1 complete).
Gesture sequence: Open the app (already running from criterion 1). Visually confirm English UI
text renders as words, not as `translation:some.key.path`-shaped strings. Open Settings -> General
-> Language, switch to a second installed language (e.g. Spanish, `es`), confirm at least three
visible UI strings change language. Switch back to English.
Sink: none — this is a visual/UI observation, screenshot required.
Expected: Real English text on first launch; a visible language change after switching; no raw
i18n keys anywhere in the observed screens.
Observed:
Operator report: UI rendered real English words on first launch — no raw
`translation:some.key.path`-shaped strings observed. Switched the language to Spanish in
Settings; the language changed as expected, with the left-hand menu observed updating to Spanish.
Measured on the packaged release build, app pid 23589.
LIMITATION, recorded rather than smoothed over: the operator reported the left menu changing
rather than enumerating three specific strings, and no screenshot was captured despite this
criterion's `Sink:` line requiring one. The observation is a genuine language switch and is scored
PASS on that basis, but it is weaker evidence than the contract asked for. A left-nav that
re-renders in Spanish does demonstrate the bundled locale files resolving at runtime, which is
the `R-34.5-G1-PKG` half this criterion exists to prove.
Verdict: PASS

### 4. Library renders and a game launches

What: The library view populates with owned titles, and a title already installed locally
launches successfully.
Build: packaged (release)
**Preconditions (Test 6 — pre-existing external state, must be true BEFORE this criterion, not
created by it):** at least one store account is already authenticated on the test machine (session
persisted from a prior login, not created in this gate) with a non-empty owned-games list, AND at
least one title from that library is already installed locally before the gate begins. **Record
which store and which title** in `Observed:` — this criterion proves nothing if the precondition is
unmet, per Test 6.
Gesture sequence: Open the Library view (default view on launch, or navigate to it). Confirm
game tiles render with artwork/titles. Select the already-installed title, click Play/Launch.
Sink: none — UI observation. A screenshot of the populated library and a note of what happened
after clicking Launch (the external game process starting, or an error) both count as evidence.
Expected: The library shows more than zero tiles; the selected title launches (its own process
starts, observable via `ps aux` or the title's own window appearing).
Observed:
Precondition satisfied (Test 6): store = **Steam**, pre-existing authenticated session from a
prior login, not created during this gate. Title launched = **Humankind**, already installed
locally before the gate began.
Library rendered approximately **40 tiles**. Operator report: "it launched fine, steam opened and
ran the game" — the Steam client came up and started the title, i.e. an external process did
start, which is this criterion's positive signal.
CORROBORATION LIMIT, recorded rather than glossed: by the time the orchestrator checked, the
operator had quit both the game and Steam, so no independent post-hoc confirmation was possible —
`pgrep humankind` and `pgrep Steam` both returned nothing, and no launch line appears in any of
the six session transcripts. This criterion therefore rests on the operator's direct observation
of the Steam client opening and running the game, which is exactly what the `Sink:` line
("UI observation ... a note of what happened after clicking Launch") admits as evidence. Scored
PASS on that basis.
Verdict: PASS

### 5. Tray: menu opens, About opens the About window

What: Clicking the system tray icon opens a menu, and the "About GameLib" item opens the About
window.
Build: packaged (release)
Preconditions: App running, `noTrayIcon` is false (default) so the tray icon is present.
Gesture sequence: Click the GameLib tray icon in the macOS menu bar. Confirm the menu lists at
least Show/Hide, a recent-games section, About GameLib, and Quit. Click "About GameLib".
Sink: `gamelib-shell.log` — a failure path logs a WARN line (`tray About: no 'main' window to
reach window.api.showAboutWindow -- skipping`, or `tray About: eval failed (...) -- About window
not opened`) through `shell_diag()`, so this file's ABSENCE of either WARN line, plus the About
window actually appearing, is the positive evidence.
Expected: Menu opens with the items listed; About window appears; no WARN line for `tray About`
in `gamelib-shell.log`.
Observed:
Operator restarted the app with the tray-icon setting changed to visible (app pid 25984,
09:14:11, session `/tmp/gamelib-35-19-gate-cXKR3z`). Tray menu opened on RIGHT-click; "About
GameLib" opened the About window. Both directly observed.
**THE LOG HALF OF THIS CRITERION IS VACUOUS AND IS NOT COUNTED AS EVIDENCE.** The expected
condition "no WARN line for `tray About` in `gamelib-shell.log`" can be neither satisfied nor
falsified by this build: `gamelib-shell.log` was last written 2026-08-29 19:35:25 by a DEBUG run
(`GAMELIB_SHELL_EXE=.../target/debug/gamelib-shell`) and NO packaged run has ever appended to it.
Root cause measured in `src-tauri/src/main.rs`: the DEV sidecar-spawn path calls `shell_diag()`
(:6919, :6935), which writes to stderr AND the file, while the PACKAGED path at :6967, :6981
emits the same text via plain `eprintln!("[shell] ...")`, which reaches stderr only. Repo-wide:
15 `shell_diag(` call sites against 55 `eprintln!("[shell]"` sites. The file's emptiness is
therefore guaranteed independently of whether a `tray About` warning occurred — an absence-check
with no positive control, which is the defect class this contract's own Test 4
(absence-observability) exists to catch, found at run time rather than at review time.
Scored PASS on the DIRECTLY OBSERVED half only: menu opened with the expected items, About window
appeared. Whether `shell_diag()` reaches the file at all in a packaged build remains UNPROVEN.
Criteria 10-12 exercise the deep-link path, which the Header documents as a `shell_diag()` call
site, and are the positive control for that question. If sink 2 is still empty after those, it is
dead for packaged builds and this criterion's log half must stay discounted. See
`deferred-items.md` `D-35-19-02`.
**CORRECTION, added 2026-08-30 after criterion 10 ran.** The positive control has now been run and
it FALSIFIES the premise above. Criterion 10 produced real `shell_diag()` writes to sink 2 from a
packaged build (`on_open_url fired with 1 url(s)`, `delivered OS deep link to sidecar: ok`, file
2336 -> 2456 bytes at 10:26:15). `shell_diag()` therefore DOES reach the file when packaged; sink 2
is NOT dead. The tray-About WARN lines this criterion checks for are `shell_diag()` call sites, so
their ABSENCE IS MEANINGFUL after all, and this criterion's log half is genuine corroboration
rather than a vacuous check. The verdict is unchanged (PASS) and was already correct on the
directly observed half; what was wrong was the reasoning that discounted the log half. Recorded
rather than silently edited, because the discounting was itself a stated finding.
Verdict: PASS

### 6. Tray: a recent-game entry launches

What: The tray menu's recent-games section lists the title launched in criterion 4, and
clicking it launches that title directly from the tray, without opening the main window.
Build: packaged (release)
Preconditions: Criterion 4 has completed (a game has been launched at least once this session,
so it appears in "recent").
Gesture sequence: Click the tray icon, locate the recent-games entry for the title launched in
criterion 4, click it.
Sink: none — UI observation (the title's process starting).
Expected: The title launches again, without requiring the main window to be shown first.
Observed:
The tray's recent-games section did NOT list HUMANKIND (the criterion-4 title). Investigated
rather than scored on the symptom.
`~/Library/Application Support/gamelib/store/config.json` -> `games.recent` holds 19 entries.
HUMANKIND is present but at **position 6 of 19**, and the tray renders only the first 5
(`max_recent_games` = 5; the transcript's own line reads `tray recent games: seeded 5 entries from
disk (limit 5)`). So it is excluded by one place. It should have been at position 1 -- it had been
launched an hour earlier.
**ROOT CAUSE, established by a controlled A/B on this machine in this session, not inferred:**
| Launch | `store/config.json` written | Outcome |
| ------ | --------------------------- | ------- |
| Endless Sky (`runner: gog`), launched + quit | YES, 09:38:05 | tracking fires |
| HUMANKIND (Steam), launched + quit TWICE | NO -- mtime still 09:38:05 at 09:45 | never recorded |
Launching a Steam title never records it as a recent game; a GOG title does. The store's only
write before the GOG test was 09:14:12, which is the app RESTART, not the 08:50-09:10 Humankind
launch.
**Mechanism:** `addRecentGame()` has exactly ONE call site, `src/backend/launcher.ts:320`, and it
sits AFTER the play session ends -- inside the block computing `finishedPlayingDate` and session
playtime. Steam titles launch by handing off to `steam://rungameid/`, so GameLib has no child
process to await and that completion block is never reached. This is an architectural consequence
of protocol-handoff launching, not obviously a regression introduced by this phase; the tray
recent-games surface itself is plan 35-06's work, but the tracking gap sits in the backend launch
path. WHERE IT WAS INTRODUCED IS NOT ESTABLISHED HERE and must not be assumed.
**Second, separate problem noted while measuring** -- not scored, recorded so it is not lost:
every GOG entry carries a `runner` field while every Steam entry has NO `runner` at all. The tray
has a dedicated `trayResolveRunner` channel precisely because its entries carry only
`{appName, title}` and the `launch` handler refuses to guess a runner (T-34.5-46-03's
confused-deputy guard). So a runner-less Steam entry may not be launchable from the tray even when
it IS displayed. Criterion 6 could not reach the click step to test this, so it remains untested.
This is a FAIL, not a NOT ATTEMPTED: the contract reserves NOT ATTEMPTED for an unmet precondition
that is a test-machine gap. Criterion 4 completed, so the stated precondition held; the
expectation then failed for a PRODUCT reason.
Verdict: FAIL

### 7. Tray: `exitToTray` re-verified at close time (not just a startup snapshot)

What: With `exitToTray` enabled in Settings, closing the main window (the red-dot close
button/Cmd+W) keeps the app running in the tray rather than quitting; Quit from the tray menu then
fully exits. This re-verifies a defect fixed in `caa84b46b` (35-06-SUMMARY: "must be re-verified" —
the fix reads the setting's CURRENT value at close time, not a value snapshotted at startup).
Build: packaged (release)
Preconditions: App running. Enable `exitToTray` in Settings AFTER the app has already started
(this is the point of the criterion — the setting is toggled mid-session, not set before launch).
Gesture sequence: With the app already running (from criterion 1), open Settings and enable
"Exit to tray" (`exitToTray`). Close the main window via its close control. Confirm the process is
still running (`ps aux | grep GameLib`) and the tray icon is still present. Click the tray icon ->
Quit. Confirm the process has exited (`ps aux | grep GameLib` shows nothing).
Sink: none required beyond `ps aux` — this is a process-liveness check, not a log-based one.
Expected: After closing the window, the process survives (tray-resident). After Quit from the
tray, the process exits fully.
Observed:
Toggled MID-SESSION as the criterion requires: app pid 25984 had been running since 09:14:11;
"Exit to tray" was enabled in Settings WITHOUT restarting, then the main window was closed via its
close control.
After the close: pid 25984 STILL ALIVE (`ps` state `S+`, 38m12s elapsed) and its bundled sidecar
still running; operator confirmed the tray icon still present in the menu bar. This is the half
that would have caught the `caa84b46b` regression -- the mid-session value was honoured at close
time rather than a startup snapshot being used.
After tray -> Quit: pid 25984 EXITED, `pgrep MacOS/gamelib-shell` returned nothing, AND
`pgrep MacOS/gamelib-sidecar` returned nothing -- no orphaned Node process left holding app state.
The transcript's final line is `[shell] sidecar terminated on exit`, a clean teardown rather than
an abandoned child.
INCIDENTAL EVIDENCE captured in this session's transcript, recorded because it bears on criterion
6 and would otherwise be lost:
```
[shell] tray recent-game launch: using the runner persisted on the entry (no lookup needed)
[shell] tray recent-game launch: dispatched to the sidecar: ok
```
A tray recent-game entry WAS launched successfully during this session, taking the
runner-persisted-on-the-entry path -- i.e. a GOG entry, which carries a `runner` field. This
confirms the tray's launch path works for runner-bearing entries. It does NOT test the
runner-LESS Steam entries flagged in criterion 6, which would instead need the
`trayResolveRunner` lookup; that path remains untested.
`gamelib-shell.log` (sink 2) STILL unwritten by any packaged run -- unchanged at 2026-08-29
19:35:25 through this criterion. Consistent with `D-35-19-02`; sink 2's positive control is still
pending at criteria 10-12.
Verdict: PASS

### 8. Tray: `startInTray` re-verified

What: With `startInTray` enabled, the app starts with its main window hidden (not force-shown),
re-verifying a defect fixed in `918d2afb3` gated on `is_visible()` (35-06-SUMMARY: "must be
re-verified").
Build: packaged (release)
Preconditions: `startInTray` enabled in Settings (set during criterion 7's session, before
quitting).
Gesture sequence: With `startInTray` already enabled (from criterion 7) and the app fully
quit (criterion 7's Quit step), relaunch via the terminal method in the Header. Do not click the
dock icon or otherwise reveal the window. Wait 5 seconds.
Sink: terminal transcript — the fix path logs `[shell] startInTray: main window starts hidden`
(a raw `eprintln!`, terminal-only per the sinks note above — this line will NOT appear in
`gamelib-shell.log`). The failure path logs a WARN variant (`could not hide the main window (...)
-- starting visible`, or `no 'main' window to hide -- starting visible`).
Expected: No main window visible after launch; the transcript contains
`[shell] startInTray: main window starts hidden` and neither WARN variant.
Observed:
Relaunched from a clean quit (criterion 7's tray Quit) into a fresh terminal session
`/tmp/gamelib-35-19-gate-gGFHIa`, app pid 28828. `startInTray` confirmed `true` on disk before the
run, alongside `exitToTray: true`, `noTrayIcon: false`, `darkTrayIcon: true`, and `maxRecentGames`
ABSENT (so the limit defaults to 5 -- independently confirming criterion 6's arithmetic that
HUMANKIND at position 6 was excluded by exactly one place).
All three stated conditions hold: no main window appeared; the transcript carries
`[shell] startInTray: main window starts hidden`; and NEITHER WARN variant is present (no
`could not hide the main window (...) -- starting visible`, no `no 'main' window to hide`).
**OBSERVATION NOT COVERED BY THIS CRITERION, recorded and ledgered rather than dropped:** the
operator reported that although no GameLib window appeared, the macOS Space visibly switched away
from the one they were working in. Their reasoning is correct as stated -- an app starting
minimised should produce no screen change at all. Diagnosed to a mechanism rather than left as an
impression: `src-tauri/tauri.conf.json`'s `main` window declares NO `visible` key, so it defaults
to TRUE and Tauri creates the window SHOWN; the `startInTray` path then calls `window.hide()`
after the fact (`main.rs:7815`). No `ActivationPolicy` is set anywhere in `main.rs`, so the app
runs as a Regular (Dock-participating) app and macOS activates it, switching Spaces to wherever
the window appeared, before it is hidden. "Starts hidden" is therefore true by observation time
and false at creation time. See `deferred-items.md` `D-35-19-03`.
Scored PASS because every condition this criterion states is satisfied, and the Space switch is
outside what it asks. The gap is in the contract's coverage, not in the verdict.
Verdict: PASS

### 9. `darkTrayIcon` is a platform-conditional display, not a NOT-HONOURED control

What: Per 35-06-SUMMARY, all four tray settings (`noTrayIcon`, `exitToTray`, `startInTray`,
`darkTrayIcon`) ended up HONOURED — there is no NOT-HONOURED tray setting on this platform for the
plan's "each NOT HONOURED control is ABSENT from Settings" instruction to apply to. The one
platform-specific case is `darkTrayIcon`: macOS adapts the tray icon's appearance automatically, so
the release notes state the toggle "isn't shown" on macOS specifically (not that it's unhonoured —
it's hidden because macOS makes the choice moot).
Build: packaged (release)
Preconditions: App running, window visible (reveal via tray -> Show if hidden from criterion 8).
Gesture sequence: Open Settings and locate the tray settings section. Look for a "Dark tray
icon" control.
Sink: none — UI observation.
Expected: No "dark tray icon" control is present in Settings on this macOS build. (This is the
one negative/absence UI check in this document; there is no log-based positive control available for
a UI element's absence, so this criterion is scored by direct visual inspection only — recorded here
explicitly rather than silently treated as equivalent to the log-based absence criteria elsewhere.)
Observed:
Operator inspected Settings on the packaged macOS build and found NO "dark tray icon" control.
Sections checked, stated explicitly because an absence claim is only as good as the search behind
it: **General** and **Appearance**.
**POSITIVE CONTROL SUPPLIED, closing this criterion's own stated weakness.** This criterion warns
that it is the document's only UI absence check with no log-based control available. A code-level
control was therefore established, so the absence is not merely "nothing was found":
- `UseDarkTrayIcon` IS MOUNTED in the settings tree at
  `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx:62` -- i.e. in **General**,
  precisely the section the operator searched. The control is not hidden in some section that
  went unchecked.
- `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx` returns `<></>` under `if (isMac)`
  and otherwise renders a real `ToggleSwitch`. The absence on macOS is therefore the PLATFORM GATE
  firing, not the component being absent, unrendered, or broken.
Together these distinguish the two outcomes the criterion needs to tell apart: a
platform-conditional display (what is happening) versus a NOT-HONOURED control that simply is not
there (what would be a defect). A bare "I did not see it" could not have separated them.
Rationale confirmed in the component's own comment: on macOS `tray_image()` returns the AppKit
TEMPLATE silhouette regardless of `dark` (`main.rs:83-93`), so the toggle would be a "lying
affordance" -- the exact thing D-05 exists to remove. Hidden rather than deleted because it does
real work on Windows and Linux, with the `darkTrayIcon` config key deliberately retained. That key
is indeed still present and set to `true` in this machine's config, with no macOS UI exposing it,
which is the documented intent rather than a leak.
Verdict: PASS

### 10. Deep link: cold start

What: With the app fully quit, an external `gamelib://` URL launches a fresh instance.
Build: packaged (release)
Preconditions: App fully quit (this criterion's own first gesture step, not inherited from a
previous criterion — see Run order governing principle above).
Gesture sequence: Quit GameLib fully if running (tray -> Quit; confirm via `ps aux`). From a
Terminal, run:
```sh
open "gamelib://launch?appName=<the appName of the title launched in criterion 4>"
```
Wait 10 seconds.
Sink: `gamelib-shell.log` (via `shell_diag`) — expect `on_open_url fired with 1 url(s)` after
the app finishes launching.
Expected: GameLib launches (a fresh process), and the named title is invoked (either it launches
directly or the main window opens focused on it, per the app's existing `gamelib://launch` handling).
Observed:
Run in two stages because the first attempt was defeated by TEST-MACHINE STATE, not by the product.
**Stage 1 -- scheme routing, environment fault (NOT scored against the product).** With the app
fully quit, `open "gamelib://launch?appName=1124300"` returned exit 0 and did NOTHING: no process,
no crash report, and neither sink moved. Cause: SIX bundles claimed the `gamelib:` scheme in
LaunchServices, and FOUR pointed at paths that no longer exist -- three unmounted DMG volumes
(`/Volumes/dmg.6zgNKA`, `dmg.KH3iXi`, `dmg.ze1mXG`) plus an OLD ELECTRON-ERA build at
`dist/mac-arm64/GameLib.app`. The URL was being routed to a bundle that is not there. Repaired by
unregistering the debug build and re-registering `/Applications/GameLib.app` via `lsregister`.
This is dev-machine debris; a clean install would carry one claimant. Recorded, not scored.
**Stage 2 -- forced to the app under test, and the product fault appears.**
`open -a /Applications/GameLib.app "gamelib://launch?appName=1124300"` launched pid 30743. The
shell handled the URL correctly, proven in sink 2:
```
1788042374 pid=30743 on_open_url fired with 1 url(s)
1788042375 pid=30743 delivered OS deep link to sidecar: ok (983ms)
```
The OS event arrived, was recognised, and was delivered to the sidecar. Everything up to the
handoff works.
**THE TITLE WAS NEVER INVOKED.** `gamelib.log` for the same second:
```
[WARNING]: [Legendary]: Requested game 1124300 was not found in library
[ERROR]:   [Nile]: Could not find game id 1124300 in user's library
[ERROR]:   [Nile]: Could not get game info 1124300, returning empty object
[ERROR]:   [ProtocolHandler]: Could not receive game data for 1124300!
```
`1124300` is HUMANKIND's Steam appid -- the criterion-4 title, present in this machine's library
and installed locally. This criterion's Expected is "the named title is invoked (either it
launches directly or the main window opens focused on it)". It was not invoked; the protocol
handler gave up.
**CAUSE NOT ESTABLISHED -- two live hypotheses, deliberately not collapsed into one:**
1. A Steam lookup gap. `findGame` (`protocol.ts:181-198`) loops `RUNNERS.options` when no runner
   is supplied. `libraryManagerMap` (`storeManagers/index.ts:14-21`) DOES include `steam`, so
   Steam is presumably tried -- but only Legendary and Nile logged failures, so whether the Steam
   manager was consulted and returned empty, or was skipped, is NOT proven by these logs.
2. A hydration race. The deep link was delivered 983ms after launch. This project already carries
   a deferred `steam-cache-hydration` concern; if the Steam library is not yet loaded at that
   moment, `findGame` would correctly find nothing in a library that is merely not ready.
The two demand different fixes and the record must not guess between them.
**Related, and probably the same underlying shape as criterion 6:** Steam entries carry no
`runner` (criterion 6), and a runner-less Steam deep link cannot be resolved here. Steam titles
appear to be second-class on both the tray and deep-link paths.

**RESOLUTION APPENDED WHILE RUNNING CRITERION 11 -- the two hypotheses recorded above are now
settled. Verdict unchanged (FAIL); only the cause changes.**
This criterion originally left the cause open between (a) a Steam lookup gap and (b) a hydration
race, because the deep link arrived 983ms after a COLD start and this project carries a deferred
`steam-cache-hydration` concern. Criterion 11 supplied the controlled test that was missing here:
it varied ONE variable at a time against a WARM instance.
| deep link (warm, same instance 30743) | result |
| - | - |
| `appName=1829678475` Endless Sky, `runner: gog` | `[Backend]: Launching Endless Sky` -- gogdl invoked, title RUNS |
| `appName=1124300` HUMANKIND, Steam | `[ProtocolHandler]: Could not receive game data for 1124300!` -- identical to the cold failure |
Warm+GOG succeeds; warm+Steam fails exactly as cold+Steam did. **Cold-vs-warm is not the variable
and hydration is not the cause -- hypothesis (b) is DEAD.** The variable is the runner.
**Mechanism, read from source, not inferred:** `src/backend/protocol.ts:15` declares
`const RUNNERS = z.enum(['legendary', 'gog', 'nile', 'sideload'])`. `findGame()`'s fallback loop
iterates `RUNNERS.options`, so it probes exactly those four -- while
`src/backend/storeManagers/index.ts` registers SIX managers (`sideload, gog, legendary, nile,
zoom, steam`). **`steam` is absent from the enum, so the Steam manager is never consulted.** This
matches the logs exactly: the 10:37:21 block logs Legendary, Nile and Gog probes and NO `[Steam]`
line at all. (`zoom` is also absent, but Zoom is a dropped platform and is not a finding.)
**NOT a Phase 35 regression.** `git blame -L 15,15 src/backend/protocol.ts` -> `7ba121ec5f
Mathis Droege 2025-01-10`, an upstream Heroic commit predating GameLib's Steam work entirely. The
Electron cutover did not cause this. It remains a FAIL because this gate scores observed product
behaviour, not blame. Logged as D-35-19-05.
**Converges with criterion 6.** Two independent failures now share one shape: Steam titles are
second-class on runner-resolution paths that work for GOG (criterion 6: Steam entries carry no
`runner` and are never recorded as recent; this criterion: Steam is not in the runner enum at all).
They are DISTINCT defects in different files -- not one bug -- but they should be fixed together.
Verdict: FAIL

### 11. Deep link: warm reachability, single-instance guard holds

What: With the app already running (from criterion 10), a second external `gamelib://` URL
reaches the SAME running instance rather than starting a second process.
Build: packaged (release)
Preconditions: App running (criterion 10's launched instance). Record its PID before this
gesture.
Gesture sequence:
```sh
ps aux | grep -i "GameLib.app/Contents/MacOS/gamelib-shell" | grep -v grep
open "gamelib://launch?appName=<a different owned appName, or the same one>"
sleep 3
ps aux | grep -i "GameLib.app/Contents/MacOS/gamelib-shell" | grep -v grep
```
Sink: `gamelib-shell.log` — a second `on_open_url fired with 1 url(s)` line, OR (if delivered via
the Unix single-instance socket rather than a second `on_open_url` callback) the socket accept log.
Expected: Exactly one `GameLib` process both before and after — the PID is unchanged. Per
F-34.4.2-15, a second instance would split the `[shell]` sink; this criterion's whole point is
confirming that does not happen.
Observed:
Run in two stages because stage 1 could not be scored.

**Stage 1 -- the contract's literal gesture, bare `open "gamelib://..."`: NOT SCORABLE (vacuous).**
Machine state first: at the start of this criterion FIVE bundles still claimed `gamelib:` --
`/Volumes/dmg.6zgNKA`, `/Volumes/dmg.KH3iXi`, `/Volumes/dmg.ze1mXG`, `dist/mac-arm64/GameLib.app`
(all four DEAD paths, `[ -e ]` false) and `/Applications/GameLib.app`. Criterion 10's `lsregister`
rebuild had NOT purged them. Unregistered the four dead paths individually (`lsregister -u`),
leaving exactly one claimant: the app under test.
Fired `open "gamelib://launch?appName=1829678475"` (Endless Sky, `runner: gog` -- "a different
owned appName" per the contract). PID before 30743, PID after 30743, exit 0.
**That PID result is VACUOUS and is NOT recorded as the guard holding.** Both sinks were silent:
`gamelib-shell.log` stayed at 2456 bytes (no second `on_open_url`, no socket-accept line) and
`gamelib.log` mtime stayed at 10:26:20 with no `ProtocolHandler]: Received ...1829678475` line.
The URL never reached the app. "No second process" is equally consistent with "the guard held" and
"nothing arrived at all", so it discriminates nothing.

**Stage 2 -- delivery path substituted to `open -a /Applications/GameLib.app "gamelib://..."`,
the same substitution criterion 10 used. SCORED. Guard holds, non-vacuously.**
| | before | after |
| - | - | - |
| PID | 30743 | 30743 (unchanged, exactly one process) |
| `gamelib-shell.log` | 2456 B | 2574 B -- `on_open_url fired with 1 url(s)`, `delivered OS deep link to sidecar: ok (5ms)` |
| `gamelib.log` | 6092 B | 9002 B -- `[ProtocolHandler]: Received gamelib://launch?appName=1829678475` |
The URL demonstrably ARRIVED at the already-running instance AND no second process spawned. That
is the criterion's expectation, and per F-34.4.2-15 the `[shell]` sink did not split. Warm delivery
took **5ms** vs criterion 10's **983ms** cold. Endless Sky then actually launched (`[Backend]:
Launching Endless Sky (1829678475)`, gogdl invoked) -- so the warm path is end-to-end live, not
merely reachable.

**Stage 1's non-delivery is NOT scored against the product, and is NOT resolved.** Discriminator
run: re-registered the surviving bundle (`lsregister -f -R /Applications/GameLib.app`) and repeated
the bare gesture with exactly ONE claimant. Both sinks stayed flat (2693 B / 9860 B) across a 9s
wait. So it is not the stale-claimant contamination. The product's own half of the contract IS
correct and was verified: `Contents/Info.plist` declares `CFBundleURLSchemes: [gamelib]` under
`CFBundleIdentifier com.gamelib.shell`. Whether bare-scheme routing (what a real user gets clicking
a `gamelib://` link in a browser) is broken in the product or is residue of this machine having
carried six claimants cannot be settled here. Logged as D-35-19-04 for a clean-machine retest; it
must not be folded into this PASS.

**Bonus result -- this criterion COLLAPSED criterion 10's open hypothesis pair.** See criterion 10.
Verdict: PASS (guard holds; delivery-path substitution recorded, bare-scheme routing unresolved)

### 12. Deep link: a foreign scheme is rejected, no payload logged

What: A URL with a scheme other than `gamelib://` handed to the same mechanism is rejected, and
the rejection log carries only a byte count — never the payload (T-34.5-G6-25 / T-35-26).
Build: packaged (release)
Preconditions: App running (criterion 11's instance). **Positive control (Test 4):** criteria
10-11 already proved, on this exact binary and this exact run, that `on_open_url` fires and
`shell_diag` reaches `gamelib-shell.log` for an ACCEPTED url — so an absence of a dispatch line here
is attributable to real rejection, not a broken probe.
Gesture sequence:
```sh
open "https://example.invalid/not-a-gamelib-link?token=SHOULD-NOT-APPEAR-IN-ANY-LOG"
```
(Note: macOS may not route an arbitrary `https://` URL to GameLib's `on_open_url` at all, since
GameLib is not registered for `https`. If `open` instead launches the default browser, that is
itself evidence of the negative case at the OS-routing level, and should be recorded as such — this
sub-case is why Preconditions calls out the positive control from 10-11 as the confirmation that the
probe mechanism itself is not broken.)
Sink: `gamelib-shell.log`.
Expected: No `on_open_url fired` line attributable to this URL (either because macOS never
routed it to GameLib, or because it routed and `deep_link_decision` returned `Reject`). If routed and
rejected, the exact log line is
`rejected OS deep-link payload (failed protocol_url_arg validation), bytes=<N>` — the literal string
`SHOULD-NOT-APPEAR-IN-ANY-LOG` must not appear anywhere in `gamelib-shell.log` or the terminal
transcript.
Observed:
Run in two stages. Stage 1 is the contract's literal gesture and is the weak sub-case the
Preconditions anticipated; stage 2 is the one that actually exercises the rejection path.

**Stage 1 -- `open "https://example.invalid/not-a-gamelib-link?token=SHOULD-NOT-APPEAR-IN-ANY-LOG"`.**
Exit 0. `gamelib-shell.log` flat at 2693 B and `gamelib.log` flat at 9918 B across a 7s wait.
macOS routed the URL to the default browser and never handed it to GameLib -- exactly the sub-case
the criterion text calls out. **This is real evidence at the OS-routing level and nothing more: it
exercises ZERO product code.** Recorded, not leaned on.

**Stage 2 -- the foreign URL forced INTO the bundle (`open -a /Applications/GameLib.app <url>`),
so `on_open_url` -> `deep_link_decision` -> `protocol_url_arg` actually runs.** Three distinct
foreign schemes, all against the same warm instance 30743:
| # | URL handed in | shell-log result | logged `bytes=` | true URL len |
| - | - | - | - | - |
| 2a | `https://example.invalid/not-a-gamelib-link?token=<TOKEN>` | `on_open_url fired` then reject | **77** | **77** |
| 2b | `notgamelib://launch?token=<TOKEN>` | `on_open_url fired` then reject | **54** | **54** |
| 2c | `gamelibx://launch?token=<TOKEN>` (prefix-confusion probe) | `on_open_url fired` then reject | **52** | **52** |
Every one produced the contract's exact literal string:
`rejected OS deep-link payload (failed protocol_url_arg validation), bytes=<N>`.

**The byte count is REAL, not a constant.** All three counts match the true length of the URL as
handed in, exactly. A hard-coded or zeroed count would have been indistinguishable from a correct
one on a single sample; three differing payloads discriminate it.

**No payload leaked.** `SHOULD-NOT-APPEAR-IN-ANY-LOG`: 0 hits in `gamelib-shell.log`, 0 in
`gamelib.log`, 0 across a recursive `grep -rl` of the whole `~/Library/Logs/GameLib/` tree, and 0
in the session transcript dir. A separate search for the scheme fragments themselves
(`example.invalid`, `notgamelib`, `gamelibx`) also returned nothing anywhere -- so it is not merely
the query string being stripped; no part of the rejected URL is written.

**The rejection holds at the SHELL boundary.** `gamelib.log` stayed byte-identical at 9918 B with
mtime unmoved across all three rejections. The payload never crossed the JSON-RPC pipe into the
sidecar -- consistent with `protocol_url_arg` failing at its first `starts_with` check, before
`tauri::Url::parse` is ever reached (`src-tauri/src/main.rs:6670`). PID unchanged at 30743
throughout; no foreign URL spawned an instance.

**Positive control (Test 4) satisfied, and by a stronger route than the contract asked for.** The
contract planned to lean on criteria 10-11 having proved `shell_diag` reaches the file. That still
holds, but stage 2 did not need it: these rejections produced their OWN affirmative log lines, so
this is not an argument from absence at all.

**One half of the check is VACUOUS and is not counted.** The contract also requires the token be
absent from "the terminal transcript". The transcript at `session_dir` was last written 09:14 and
belongs to pid 23589; the instance under test (30743) was launched via `open -a` during criterion
10, so its stderr is not captured anywhere. Its clean grep therefore proves nothing about this
instance. This is the D-35-19-02 residual (the 55 `eprintln!` sites reach stderr only). It does not
weaken the verdict: the reject emitter is `shell_diag`, which is file-backed, and the file shows
the lines directly.
Verdict: PASS

### 13. `openDialog` long-running channel: a picker open past 90 seconds still completes

What: The native file/folder picker used by e.g. move-install stays open indefinitely without
the sidecar invoke being dropped at a wall-clock bound. This is the sole `35-AB-RETEST.md` item
recorded `TAURI-ONLY` / `BLOCKS D-16 GATE` (item 3, `openDialog` missing from
`LONG_RUNNING_CHANNELS`) — fixed in `d980559b7` and already discharged once by live re-observation
per that document's own closing note; this criterion re-discharges it against the packaged release
artifact specifically, which the prior discharge was not measured against.
Build: packaged (release)
Preconditions: App running. A move-install (or any flow that opens the native folder picker) is
reachable from the UI.
Gesture sequence: Trigger a flow that opens the native folder picker (e.g. "Move" on an
installed title). Leave the picker open, untouched, for at least 95 seconds (timed). Then select a
folder and confirm.
Sink: terminal transcript. **Positive control (Test 4):** the failure signature this criterion
exists to catch is a specific, known line —
`[shell] response for unknown/timed-out id=<N> (dropped)` — a raw `eprintln!`, terminal-only (does
NOT reach `gamelib-shell.log`; see the sinks note above). Its absence over a 95+ second wait is the
evidence, made meaningful because the exact failing line is named in advance, not "no output".
Expected: No `response for unknown/timed-out id=... (dropped)` line in the transcript; the move
proceeds normally after the 95+ second wait (no "failed to install" or similar error toast).
Observed:
**The sink had to be rebuilt before this could be scored at all.** Criteria 10-12 ran on pid 30743,
which was launched via `open -a` and captures NO stderr. This criterion's failure signature is a raw
`eprintln!` that by design does not reach `gamelib-shell.log`, so on that instance an absent line
would have proved nothing (the D-35-19-02 residual). The app was quit and relaunched with
stdout+stderr redirected to `/tmp/gamelib-35-19-c13-jaiski/transcript.log`, pid 56564.
**Positive control, verified before starting:** the transcript captured 10 `[shell]` lines at
startup (`spawning sidecar (packaged)`, `startInTray: main window starts hidden`, `tray recent
games: seeded 5 entries`, ...). The sink demonstrably carries the exact output class the failure
signature belongs to, so its absence is now meaningful.

**Timing is MEASURED, not estimated.** t0 recorded at 10:52:57 the moment the picker was reported
open; the confirm click landed at 10:55:20 per `gamelib.log`. **Picker held open 143 seconds** --
well past the 90s bound under test and the contract's 95s floor.
(An intermediate reading of 75s was taken while the picker was still open and is NOT the measurement;
the folder had been highlighted but not confirmed.)

**CLAUSE 1 of Expected -- PASS, and NOT by absence alone.** Zero hits for
`response for unknown`, `timed-out`, or `(dropped)` across the whole transcript. More importantly,
the invoke demonstrably COMPLETED: the backend received the selected destination and acted on it --
`[Gog]: Error moving Endless Sky to /Users/graysonmitchell/GameLib/GameLibMoveTestFixture rsync: ...`.
**A dropped invoke would have produced no rsync invocation at all.** The downstream failure is
therefore itself positive proof that the dialog result crossed the channel after 143 seconds. This
is affirmative evidence, not an argument from silence.
=> `35-AB-RETEST.md` item 3 (`openDialog` missing from `LONG_RUNNING_CHANNELS`, `TAURI-ONLY` /
`BLOCKS D-16 GATE`, fixed in `d980559b7`) is **re-discharged against the packaged release artifact**,
which is what this criterion existed to add over the prior discharge.

**CLAUSE 2 of Expected -- FAILED, for a cause with NO relationship to this criterion.** The move
did not proceed; an "Error Moving Game" toast appeared:
`rsync: unrecognized option '--no-human-readable'`.
Root cause (established, not inferred): macOS 26.5.2 ships **openrsync** at `/usr/bin/rsync`
(`openrsync: protocol version 29 / rsync version 2.6.9 compatible`), not GNU rsync -- Apple swapped
the implementation as of Sequoia. `src/backend/utils.ts:1224-1231` passes flags openrsync does not
implement. Tested individually against the system binary:
| flag | openrsync |
| - | - |
| `--archive`, `--compress`, `--remove-source-files` | OK |
| `--no-human-readable` | **REJECTED** |
| `--info=name,progress` | **REJECTED** |
**Two flags fail, not one** -- a one-flag fix surfaces the next error immediately. `git blame` puts
these at `c62820dc3e Mathis Droege 2024-03-26`, upstream Heroic, predating both this phase and
Apple's rsync swap. **Not a Phase 35 regression.** It would fail identically with the picker open
for 0 seconds, so it does not bear on the long-running-channel question.
Logged as D-35-19-07. A second, worse defect found while reading that code is logged as D-35-19-08.

**No data was lost, and this was checked rather than assumed** -- `--remove-source-files` was in the
argument list. `Endless Sky.app` intact at 419M / 7368 files; destination directory empty. openrsync
exits **1** on the usage error, and the code's guard is `if (code !== 1)`, so the error branch was
taken before any transfer began.

**Scoring note, stated explicitly rather than resolved silently:** the verdict below scores the
criterion's SUBJECT (the long-running channel), which passed on affirmative evidence. The Expected's
second clause did fail. It is recorded as a FAIL of that clause and carried as its own defect rather
than folded away, so a reviewer sees both and can overturn this call if they read the contract more
strictly.
Verdict: PASS (channel not dropped over 143s, proven affirmatively; Expected's move-success clause FAILED for an unrelated pre-existing cause — D-35-19-07)

### 14. `installed.json` watcher: a library refresh follows an external write

What: Editing `installed.json` on disk (outside the app) triggers a library refresh without
requiring an app restart.
Build: packaged (release)
Preconditions: App running, at least one Legendary (Epic)-tracked title installed (so
`installed.json` exists and is non-empty).
Gesture sequence: Locate the Legendary `installed.json` (typically under
`~/Legendary/installed.json` or the configured Legendary config path). With the app's Library view
open and visible, externally touch the file — e.g. `touch <path>/installed.json` or make a trivial
whitespace edit and save — from a Terminal, NOT through the app.
Sink: `gamelib.log` (sidecar `logInfo`) — expect the line
`installed.json updated, refreshing library`.
Expected: Within ~500ms-1s of the external write (the watcher's debounce), `gamelib.log` gains
the line above, and the Library view visibly refreshes (a flicker/re-render, or an actual data
change if the edit was substantive).
Observed:
Precondition met: `installed.json` present and non-empty (1138 B, one installed Legendary title,
`Iris` / Phoenix Point) at
`~/Library/Application Support/gamelib/legendaryConfig/legendary/installed.json`.
Run on the criterion-13 instance, pid 56564. File backed up before any write and byte-verified
restored afterwards.

**BACKEND HALF -- PASS, and proven further than the contract asked.**
1. `touch` at 11:00:19.867 -> `(11:00:19) [INFO]: [Legendary]: installed.json updated, refreshing
   library`. Sub-second, inside the contract's ~500ms-1s window.
2. **Attributable, not ambient noise:** the count of that line in this log was **0** before the
   gesture.
3. **The DEBOUNCED refresh actually EXECUTES.** This needed its own probe: the log line is emitted
   inside the `watch` callback BEFORE the 500ms `setTimeout`, so on its own it proves only that the
   watcher fired -- a debounced call that never ran, or threw, would look identical. Wrote
   deliberately malformed JSON; the log then produced
   `Corrupted installed.json file, cannot load installed games SyntaxError: Expected property name
   or '}' in JSON at position 2`. That string is emitted from INSIDE
   `LegendaryLibrary.refreshInstalled()` (`storeManagers/legendary/library.ts:141`), so the
   deferred call demonstrably ran and parsed the file. File restored and re-verified immediately.

**Debounce COALESCING was measured but is INCONCLUSIVE -- recorded, not claimed either way.** Six
rapid malformed writes yielded only 2 watcher events, not 6. macOS FSEvents coalesces upstream of
`fs.watch`, so the app's own 500ms debounce cannot be isolated by this method. No claim is made
about it.

**UI HALF -- FAIL. This is the verdict.**
First observation was CONFOUNDED and is discarded: `installed.json` was emptied, the tester saw
nothing, then logged in to Epic (not previously logged in) and only then saw Phoenix Point listed
as not-installed. A fresh post-login library load reads the same emptied file, so "not installed"
had two possible causes and discriminates neither.
Clean re-run with the confound removed -- tester logged in and viewing the Library, nothing else
intervening: `Iris` restored to `installed.json` at 11:14:59, watcher line fired at 11:14:59,
backend state updated. **The Library view did NOT update. The tester had to perform a manual
refresh before Phoenix Point showed as installed again.**
This also retro-explains the first observation: the post-login load, not the watcher, produced that
screen.

**Mechanism (read from source, not inferred):** the watcher's refresh is
`() => libraryManagerMap['legendary'].refreshInstalled()`
(`sidecar/installedJsonWatcher.ts:86`). `refreshInstalled()` rebuilds `installedGames` in memory
and sends **no frontend message**. Every other library-mutating path in the backend explicitly
notifies the renderer -- `sendFrontendMessage('refreshLibrary', 'legendary')` at
`storeManagers/legendary/games.ts:767` and `:1067`, and the equivalent in `sideload/library.ts:77`
and `nile/games.ts:512`. The watcher path is the one that does not. Backend truth and rendered
truth therefore diverge until something else triggers a re-render.

**NOT a Phase 35 regression -- the port was faithful.** The pre-cutover Electron implementation
(`git show 5643c7583^:src/backend/main.ts`, lines 1037-1049) is behaviourally identical: same log
line, same 500ms `setTimeout`, same bare `refreshInstalled()`, same absence of any frontend
message. Origin is upstream Heroic `82ec176c7` (2022-11-22). `0da9898bf` (35-10) ported it to the
sidecar verbatim and thereby carried the defect forward intact -- the known
"verbatim upstream port ships silent defects" shape, and this criterion is what surfaced it.
Logged as D-35-19-09.

Scored FAIL because Expected requires BOTH clauses and names the visible refresh explicitly, and
here the failing clause IS the criterion's subject -- the point of watching the file is that the
user sees the change. (Contrast criterion 13, where the failing clause was unrelated to that
criterion's subject and the verdict was PASS.) The app-restart wording is separately satisfied: no
restart was needed, but a manual refresh was.
Verdict: FAIL

### 15. Wake lock: display assertion during game play

What: Launching a game creates a macOS display-sleep-prevention assertion labelled
`GameLib: a game is running`, released when the game exits.
Build: packaged (release)
Preconditions: App running, a title installed and launchable (reuse criterion 4's title).
Gesture sequence: In one terminal, start polling:
```sh
watch -n2 'pmset -g assertions | grep -A1 "GameLib: a game is running"'
```
In the app, launch the title. Wait for the game to report "running". Then quit the game.
Sink: `pmset -g assertions` output, pasted verbatim (held and released states both).
Expected: While the game runs, `pmset -g assertions` shows an assertion with the exact label
`GameLib: a game is running`. After the game exits, a subsequent `pmset -g assertions` no longer
shows it.
Observed:
Title substituted, recorded not silent: the contract says "reuse criterion 4's title", which was
HUMANKIND (Steam). Steam launches hand off to `steam://rungameid/` and, per criterion 6, never reach
`launcher.ts`'s post-session block -- which is exactly where the wake-lock RELEASE lives
(`launcher.ts:292`). Scoring the wake lock against that path would conflate it with the known Steam
lifecycle gap. Endless Sky (GOG) used instead; it satisfies Preconditions ("a title installed and
launchable"). The Steam case is NOT covered here and remains untested.

**FIRST RUN VOIDED -- test contamination created by this gate run, not a product fault.** The first
attempt showed the game running with NO assertion and no acquire log line, which reads as a clean
FAIL. It was not. `ps -o lstart` showed Endless Sky pid 43015 started **10:36:48** -- the criterion-11
deep-link launch, owned by instance pid 30743, which this run KILLED at 10:48 to rebuild the
transcript for criterion 13. The game was orphaned (reparented to `launchd`, PPID 1) and still
running. The instance that would have held the assertion was dead, so its absence was fully
explained. Orphan terminated, clean baseline re-established (no game processes,
`PreventUserIdleDisplaySleep 0`, zero `Preventing display from sleep` lines in this instance's log),
and the run repeated. **The re-run's launch was verified correctly parented: gogdl 34624 -> 56573,
the sidecar under test.**

**HELD STATE (verbatim, `pmset -g assertions`, 11:29:42; game pid 34629 confirmed running):**
```
pid 56568(gamelib-shell): [0x0003d4d2000193fe] 00:00:22 PreventUserIdleSystemSleep named: "GameLib: a download is in progress"
pid 56568(gamelib-shell): [0x0003d4d3000593ff] 00:00:22 PreventUserIdleDisplaySleep named: "GameLib: a game is running"
pid 56568(gamelib-shell): [0x0003d4d2000593fd] 00:00:22 PreventUserIdleDisplaySleep named: "GameLib: a game is running"
```
`PreventUserIdleDisplaySleep 1`. Backend logged `(11:29:19) [INFO]: [Backend]: Preventing display
from sleep`, one second before the assertion appeared.

**RELEASED STATE (verbatim, 11:52:03; Endless Sky and gogdl both confirmed EXITED):**
```
(no GameLib rows)
```
`PreventUserIdleDisplaySleep 0`. Exact-label counts fell 2 -> 0 and 1 -> 0. Backend logged
`Stopping Display Power Saver Blocker` at 11:50:10 and 11:51:38.

**Contract's Expected -- BOTH clauses MET.** The exact label `GameLib: a game is running` is present
while the game runs and absent after it exits. That is this criterion's subject and it passes.
D-08 / REQ-35-06 (Phase 35 Plan 08's claim that the wake lock stopped being a Phase-33 no-op that
returned `-1` and held nothing) is **discharged live**: a real IOKit assertion was observed held and
released.

**TWO anomalies beyond the contract, both real, neither fatal to the verdict:**
1. **The display assertion is taken TWICE for one game.** One logged acquire produced two distinct
   IOKit handles, because two independent sites each take their own: `launcher.ts:190` and the
   `lock` IPC handler at `sidecar/appShellFlowRegistration.ts:305`. Logged as D-35-19-10.
2. **A SYSTEM assertion labelled `GameLib: a download is in progress` is held during gameplay with
   nothing downloading.** That is `prevent-app-suspension`, taken by the `lock` handler's
   `!playing` branch (`appShellFlowRegistration.ts:301`). The label is user-visible in `pmset` and
   states something false. Logged as D-35-19-11. Bears on criterion 16, which measures that exact
   assertion -- **criterion 16 must establish a clean baseline first or it will read this one as
   its own result.**
Both released cleanly, so the leak risk they create did not materialise in this run.

**A code-read PREDICTION that this run did NOT test, recorded so it is not mistaken for a finding:**
`launcher.ts` assigns `powerDisplayId` in exactly one place (`:190`) and never resets it to `null`
after `powerSaveBlocker.stop()` (`:294`), while the acquire is guarded by `if (!powerDisplayId)`.
That predicts the launcher's own display assertion is taken only ONCE per app session. The
`lock`/`unlock` pair does NOT share the bug -- `unlock` correctly sets `powerId = undefined` and
`displaySleepId = undefined` -- so a second launch would still get ONE assertion from the IPC path
rather than none. Degraded, not broken. **Only one launch was performed this session, so this is
untested and must not be reported as observed.** Logged as D-35-19-12.
Verdict: PASS (exact label held during play and absent after exit; two non-fatal assertion anomalies logged separately)

### 16. Wake lock: system assertion during a download, and the F-35-08-A carry-forward check

What: Starting a download creates a system-sleep-prevention assertion labelled
`GameLib: a download is in progress`, released on completion. This criterion ALSO carries forward a
known-open defect from the dev-build wake-lock gate (`35-08-LIVE-GATE.md`, `F-35-08-A` /
`D-35-08-02`): a running GAME was there observed to ALSO hold a system-labelled assertion, which is
mislabelled (a game holding a system-class assertion under the download's label). That gate was
measured on a DEV build (`pnpm tauri:dev`); this is the first measurement of the same behaviour on a
packaged artifact.
Build: packaged (release)
Preconditions: App running, criterion 15 complete (so the operator already has the polling
pattern set up) OR restarted for this criterion. At least one title queued for download (or
re-download an already-installed title if no new title is available — record which).
Gesture sequence: Start (or restart) polling:
```sh
watch -n2 'pmset -g assertions | grep -B1 -A1 "GameLib: a"'
```
Start a download. While it runs, separately launch the criterion-4/15 title again (a SECOND,
simultaneous assertion source) and capture the full `pmset -g assertions` output while BOTH are
active, specifically checking whether the running game ALSO shows a `GameLib: a download is in
progress`-labelled assertion (the F-35-08-A signature) in addition to its own
`GameLib: a game is running` one. Then stop the game and let the download finish; confirm both
assertions clear.
Sink: `pmset -g assertions` output, pasted verbatim, captured at least twice: once with both
game and download active, once after both have ended.
**Expected (best case):** exactly one `GameLib: a game is running` assertion while the game runs and
exactly one `GameLib: a download is in progress` assertion while the download runs, both cleared
afterward — no cross-labelled assertion.
**If F-35-08-A reproduces on this packaged build:** record it as observed, verdict FAIL for the
"no cross-contamination" half of this criterion specifically (per the plan's "do not soften a FAIL"
constraint) — do not silently treat this as expected just because it was already known from the dev
build.
Observed:
Title used, per the contract's "record which": **Child of Light (Steam, appId 256290)**,
uninstalled and re-downloaded (native depot download, 68 files). Baseline verified CLEAN before
starting -- both label counts 0, no game running -- which criterion 15 established as mandatory,
since a running game alone produces a download-labelled assertion.

**TIMELINE (measured, from `pmset` polling and `gamelib.log`):**
| time | event | `a game is running` | `a download is in progress` |
| - | - | - | - |
| 12:06:44 | Child of Light queued | 0 | 0 |
| 12:06:45 | download starts | 0 | **1** |
| 12:08:04 | Endless Sky launched | **1** | 1 |
| 12:09:33 | `Finished Installation of 256290`, badge flipped installed | 1 | **1** |
| 12:10:49 | (76s after download ended, game still up) | 1 | **1** |
| 12:11:20 | game quit -> `Stopping Display Power Saver Blocker` | 0 | 0 |

**DOWNLOAD HALF -- PASS.** With a download running and no game, exactly ONE correctly-labelled
system assertion and ZERO display assertions:
```
pid 56568(gamelib-shell): [0x0003dd9800019591] 00:00:13 PreventUserIdleSystemSleep named: "GameLib: a download is in progress"
```
`PreventUserIdleSystemSleep 1`, `PreventUserIdleDisplaySleep 0`. Download confirmed genuinely live
(`downloadDepotFiles: first bytes written after 151ms`, chunk-stream stats at 45% / 56%).

**F-35-08-A REPRODUCES ON THE PACKAGED ARTIFACT. This is the verdict.** The download finished at
12:09:33. At 12:10:49 -- **76 seconds later, with nothing downloading** -- the assertion was still
held:
```
pid 56568(gamelib-shell): [0x0003dd9800019591] 00:04:05 PreventUserIdleSystemSleep named: "GameLib: a download is in progress"
pid 56568(gamelib-shell): [0x0003dde6000595bb] 00:02:46 PreventUserIdleDisplaySleep named: "GameLib: a game is running"
```
It cleared only when the GAME exited, at 12:11:21 -- outliving the download it names by ~108
seconds. Per the contract's explicit instruction not to soften this because it was already known
from the dev build: recorded as observed, FAIL.

**A DIAGNOSTIC REFINEMENT the dev-build gate did not have.** The handle (`0x0003dd9800019591`) and
elapsed time (`00:04:05` at 12:10:49, i.e. since 12:06:44) are IDENTICAL to the assertion taken when
the DOWNLOAD started. So this is not the game taking a second, spurious assertion on top -- it is the
DOWNLOAD's own assertion never being released, because `unlock()` fires only when `pendingOps`
reaches 0 and the running game holds it above 0. `powerId` is shared state whose lifetime is governed
by `pendingOps`, not by the download. In criterion 15 (game alone, no download) the game itself took
it; here the download took it and the game extended it. Same mechanism, two surfaces.
**NOT threat T-35-31:** both assertions cleared on game exit; nothing outlived the app.

**THE CONTRACT'S OWN GESTURE CANNOT DETECT F-35-08-A. Recorded because it would mislead a re-runner.**
With both game and download active the counts were 1 and 1 -- which reads as the stated "best case".
That is an ARTEFACT: the `lock` handler's guard is `!playing && !isSleepBlocked`, and the download
had already set `isSleepBlocked`, so the game's spurious acquire was suppressed. The
cross-contamination is INVISIBLE in precisely the simultaneous configuration this criterion
prescribes for finding it. The two configurations that DO expose it are (a) a game running with no
download -- criterion 15 -- and (b) letting the download finish while the game keeps running, which
is what was done here. A future re-run must not conclude "no cross-labelled assertion" from a
simultaneous capture alone.

**D-35-19-12 CONFIRMED LIVE -- promoted from prediction to observation.** Criterion 15 recorded, as
an explicitly UNTESTED code-read prediction, that `launcher.ts` never resets `powerDisplayId` and so
acquires only once per app session. This criterion's game launch was the SECOND of the session and
produced:
- `"Preventing display from sleep"` lines in this instance's log: **1 total** (11:29:19, criterion
  15's launch). The 12:08:04 launch did NOT log it.
- display assertions while playing: **1**, versus criterion 15's **2**.
Exactly the predicted behaviour, including the predicted severity -- degraded, not absent, because
the `lock`/`unlock` pair resets its own ids correctly and still supplied one assertion. Display sleep
was still prevented.

Also confirmed: the duplicate display assertion (D-35-19-10) is visible in the ORIGINAL dev-build
capture at `35-08-LIVE-GATE.md:84-86` (two `PreventUserIdleDisplaySleep` lines, `dispCount=1`), so it
is not new to the packaged build -- that gate simply did not call it out.
Verdict: FAIL (download half PASSES; the "no cross-contamination" half FAILS — F-35-08-A reproduces on the packaged artifact)

### 17. Updater: endpoint configured, plugin registered, a check reaches "up to date" without erroring

What: The Tauri self-updater's endpoint is configured and a `check()` call completes without
throwing (no real update is expected to exist — there is no `latest.json` published release yet;
the assertion is that the call resolves cleanly, not that it finds an update).
Build: packaged, DEBUG variant (`pnpm tauri:dev:packaged` / `tauri build --debug`) —
**deliberately NOT the release build used by every other criterion in this document.** Contract
review finding (Test 1, origin/scheme reachability): `src-tauri/Cargo.toml`'s `tauri` dependency
declares features `["tray-icon", "image-png", "unstable"]` — the `devtools` feature is ABSENT. Per
Tauri's own feature semantics, `devtools` is auto-enabled on debug builds regardless of this flag,
but on a `--release` build (the primary build this gate otherwise uses) DevTools is unreachable
without it. No UI control anywhere in this codebase triggers an update check (grep-confirmed: zero
imports of `@tauri-apps/plugin-updater` under `src/`, despite it being a declared dependency and a
granted capability) — the only reachable invocation path is a manually-typed DevTools console
command, which requires the debug-packaged variant specifically. This is recorded as a genuine
contract-authoring finding, not silently worked around: **this one criterion measures a different
artifact than the rest of this document, and that difference is the finding, not an oversight.**
Preconditions: App running (debug-packaged build).
Gesture sequence: Launch the debug-packaged `.app` per the Header's alternate build/artifact
path. Open DevTools (right-click in the window -> Inspect Element, available because this is a debug
build). In the console, TYPE (never paste — DevTools console paste is inert in this project per
standing gotcha) the following, character by character:
```js
await window.__TAURI__.updater.check()
```
Press Enter. Record the returned value or thrown error verbatim.
Sink: DevTools console output (visual/copy from the panel), plus `gamelib.log`/terminal for any
Rust-side plugin error if one surfaces there instead.
Expected: The call resolves (does not throw), returning either `null`/`undefined` (no update
available/endpoint reachable, current version is latest) or an update object — either resolves
cleanly. A network/connectivity error reaching `github.com` is a legitimate environment-dependent
outcome and should be recorded as such rather than conflated with a code defect; a `command not
found: updater` / "unknown property" style error would indicate the capability grant or plugin
registration itself is broken, which IS a code defect.
Observed:
**MEASURED 2026-08-30 on the debug-packaged build.** Console transcript, verbatim:

```
> await window.__TAURI__.updater.check()
< undefined
(x) Could not fetch a valid release JSON from the remote

> typeof window.__TAURI__.updater.check
< "function" = $2
```

Applying this criterion's OWN discriminator: this is **not** a `command not found` / "unknown
property" style error. `window.__TAURI__.updater.check` resolves to a `function`, the invoke reached
`plugin:updater|check`, and the plugin ran a real HTTP fetch. **Plugin registration and the
`updater:default` capability grant are therefore VERIFIED — that is the thing this criterion exists
to establish, and it holds.**

The rejection is endpoint STATE, not a code defect. Measured independently and BEFORE the run, so it
could not be back-fitted to the result: `curl` against the configured endpoint
`https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json` returns **HTTP
404** (no release published at the `updater` tag). `tauri-plugin-updater` 2.10.1
`src/updater.rs:507-512` handles a non-success status by logging WITHOUT setting `last_error`, so the
loop falls through to `updater.rs:528` `remote_release.ok_or(Error::ReleaseNotFound)?`, whose Display
string (`src/error.rs:24-26`) is exactly the observed text.

**Expectation defect in this criterion's own text, recorded rather than papered over.** The Expected
field asserts the call "resolves (does not throw), returning either `null`/`undefined` ... (no update
available)". That is WRONG for this endpoint state: a missing `latest.json` does not produce a clean
resolve, it produces a THROWN `ReleaseNotFound`. Only an endpoint returning **204 No Content**
resolves to `null` (`updater.rs:485-487`). The criterion's "What" section already concedes "there is
no `latest.json` published release yet", so the author expected a clean resolve from a state that
cannot produce one. The throw observed here is the CORRECT behaviour of the shipped plugin against a
404, not a regression.

Scope limits, stated so this is not read as more than it is:
- Debug-packaged artifact (`tauri build --debug`), NOT the release `.app` the other 20 criteria used
  — as this criterion's own Build field requires. Says nothing about the release build.
- The build required a THROWAWAY updater signing key exported into the environment only
  (`TAURI_SIGNING_PRIVATE_KEY`); no committed file was changed, and `plugins.updater.pubkey` was left
  alone. The bundler additionally warned "configured to create updater artifacts but no
  updater-enabled targets were built", so whether the absent key would have BLOCKED this build was
  never actually tested — the earlier claim that criterion 17 was "blocked" on signing is UNPROVEN.
- The happy path (an endpoint serving a valid signed `latest.json`) is still unmeasured. Nothing here
  exercises download, signature verification, or install.
- `startInTray` was temporarily flipped false to let the debug build's auto-`open_devtools()` fire
  (`main.rs:8161` declines to open DevTools on a hidden window), then restored; the live config was
  byte-compared against its backup afterwards and is IDENTICAL.

Gesture deviation, recorded for honesty: the criterion prescribes right-click -> Inspect Element.
That is NOT the route used, and it is not available — `main.rs:8138` states outright that "the dev
webview exposes no right-click inspect on macOS", and the same block force-opens DevTools on any
visible window in a debug build, so the inspector was already open. Input was delivered as synthetic
key events (typed character-by-character, never pasted, per the standing paste-is-inert gotcha).
A first console session silently accepted submitted input WITHOUT executing it (`1+1` and a
`document.body.style.background="red"` control both submitted and produced no result and no side
effect) after that session had been undocked and used for a Timelines recording and a snippet; a
freshly relaunched session evaluated the same control correctly (`"red" = $1`) and produced the
transcript above. Treat a console that echoes input without a result row as WEDGED, not as a finding
about the app.
Verdict: PASS on substance (plugin registered, capability granted, endpoint configured, call reaches
the updater and returns a plugin-domain result) — with the criterion's literal "does not throw"
clause NOT met, because that clause is itself wrong for a 404 endpoint. No code defect found.

### 18. Humble: session survives a restart (precondition for criterion 19)

What: An existing Humble login persists across an app restart — the specific fact that makes
the subsequent logout criterion meaningful (Test 6: a logout test proves nothing if the "logged in"
state it destroys was never durable to begin with).
Build: packaged (release)
Preconditions: Already logged into Humble on this machine from a prior session (external state,
not created by this gate — record whether this precondition holds; if this machine has never had a
Humble login, this criterion and criterion 19 are `NOT ATTEMPTED`, not `FAIL`).
Gesture sequence: Confirm Humble shows as logged in (Settings/Accounts, or the Humble library
tab populated). Fully quit GameLib (tray -> Quit). Relaunch (terminal method). Re-check the same
Humble logged-in indicator.
Sink: none — UI observation.
Expected: Humble still shows as logged in after the restart, with no re-authentication prompt.
Observed:
**PRECONDITION HOLDS (Test 6 -- pre-existing external state, NOT created by this gate).** The Humble
login predates this gate run: the very first instance of this session read both slots from the
keyring at startup rather than establishing them. So criteria 18 and 19 are live, not
`NOT ATTEMPTED`.

**PRE-RESTART** (instance pid 56568, started 10:48:57):
| slot / check | value |
| - | - |
| `humble-session` | `keyring_get ok present=true len=208` |
| `humble-csrf` | `keyring_get ok present=true len=29` |
| Humble sync | `gamekeys=32 fetched=7/7 frozen=25 ok=7 schema_error=0 denied=0 expired=0` |
| UI, Accounts tab | tester confirmed **logged in** |
`denied=0 expired=0` with `fetched=7/7 ok=7` is the load-bearing part: the Humble SERVER accepted
these credentials. Token presence alone would not distinguish a valid session from a stale string
sitting in the keyring.

**FULL QUIT** via tray -> Quit. Verified genuinely full, not just window-closed: `pgrep` returned no
`gamelib-shell` and no `gamelib-sidecar`, the supervising process reported **exit code 0**, and all
GameLib power assertions dropped to 0.

**POST-RESTART** (fresh instance -- shell pid 40548, sidecar 40555, launched 12:21):
| slot / check | value |
| - | - |
| `humble-session` | `keyring_get ok present=true len=208` (12:21:49) |
| `humble-csrf` | `keyring_get ok present=true len=29` (12:21:51) |
| Humble sync | `gamekeys=32 fetched=7/7 frozen=25 ok=7 schema_error=0 denied=0 expired=0` (12:21:54) |
| UI, Accounts tab | tester confirmed **logged in** |
Byte-for-byte identical to pre-restart, from a process that did not exist when the pre-restart
reading was taken -- so the tokens came from the keyring, not from surviving memory.

**NO RE-AUTHENTICATION PROMPT, established objectively rather than from recall.** The two
`keyring_get` calls completed in **21ms** and **4ms**. A macOS Keychain dialog requires human
approval and cannot resolve on that timescale -- for contrast, a prompting read earlier in this
session logged `elapsed=1373ms`. **The tester then independently confirmed "did not get a prompt during
restart"** -- so this is corroborated two ways, by instrument timing and by direct observation,
which agree. The distinction was drawn deliberately before asking: a Keychain dialog would be a
keyring-ACL artefact and would NOT fail this criterion, whereas a Humble login form would. Neither
appeared.

**One recorded non-signal.** A grep for re-auth/denial keywords returned hits, but they are FALSE
POSITIVES -- it matched the literal field names `is_expired` and the phrase "no extractable
expiration" inside Humble's own order payloads, not any denial. The authoritative values are
`denied=0 expired=0`. Recorded so a later reader does not mistake those lines for evidence of
trouble.

Criterion 19's premise is therefore established: the "logged in" state it will destroy is durable
across a restart, so destroying it will mean something.
Verdict: PASS

### 19. Humble: logout requires credentials to log back in

What: After logging out of Humble, attempting to log in again requires entering credentials
(the session was genuinely cleared, not merely hidden in the UI). **This criterion is placed LAST
among the store-account criteria (18-19-20-21) deliberately** — it destroys Humble session state
that criterion 4's library-populated precondition might have depended on, per the Test 5 pairing
sweep below.
Build: packaged (release)
Preconditions: Criterion 18 passed (session confirmed to survive a restart) immediately before
this gesture.
Gesture sequence: From the still-logged-in state (criterion 18's end state), log out of Humble
via Settings/Accounts. Then attempt to open the Humble login flow again (the embedded login
window/webview).
Sink: none — UI observation (the login form/webview requiring credential entry, vs. silently
re-authenticating from a leftover session).
Expected: The login window/webview requires the operator to enter credentials again — no silent
re-auth.
Observed:
**RUN ORDER — deviation from the literal Preconditions, matching the criterion's own stated intent.**
Preconditions say criterion 18 passed "immediately before this gesture", but this criterion's own
What says it is "placed LAST among the store-account criteria (18-19-20-21) deliberately". Those two
cannot both be satisfied. It was run LAST — after 20 and 21 — honouring the stated intent. The
substance of the precondition held and in fact strengthened: criterion 20's restart (12:35)
intervened, and Humble came back live through it.

**THE DESTROYED STATE WAS PROVEN LIVE, not merely present.** Twenty minutes before the logout, at
12:35:07 on the current instance:
```
SidecarKeyringSlotStore(humble-session).getToken(): keyring_get ok present=true len=208 elapsed=14ms
SidecarKeyringSlotStore(humble-csrf).getToken():    keyring_get ok present=true len=29  elapsed=5ms
Humble sync finished: gamekeys=32 fetched=7/7 frozen=25 ok=7 schema_error=0 denied=0 expired=0
```
`fetched=7/7 ok=7 denied=0 expired=0` is the HUMBLE SERVER accepting the restored session. Combined
with criterion 18, the session survived TWO full quit/relaunch cycles and was server-validated after
both. **This is what makes the logout meaningful (Test 6), and it is the part criterion 21 could not
establish for Epic.**

**LOGOUT RESULT** (12:55:24, instance shell 73586 / sidecar 73592):
```
SidecarKeyringSlotStore(humble-session).clearToken(): keyring_delete ok
SidecarKeyringSlotStore(humble-csrf).clearToken():    keyring_delete ok
Humble disconnect: cookie census before(total=9, matched=0, verdict=SUPPORTED_NONEMPTY)
                                  after(total=9, matched=0, verdict=SUPPORTED_NONEMPTY)
Humble disconnect: cleared 0 humblebundle.com cookie(s)
Humble disconnect: cleared storage — localStorage=0, sessionStorage=0, indexedDB=0, caches=0, serviceWorkers=0
```
Both keyring slots — the ACTUAL credential store for Humble, which keeps its session cookie as a
keyring token rather than in the webview jar — were deleted.

**THE ZERO HERE IS NON-VACUOUS, AND THE PRODUCT PROVES IT ITSELF.** `cleared 0 humblebundle.com
cookie(s)` would normally be uninterpretable — indistinguishable between "none present" and "the
probe is broken". The census resolves it in place: `verdict=SUPPORTED_NONEMPTY` with `total=9` states
that the cookie API worked AND the jar was non-empty, so `matched=0` genuinely means no Humble
cookies existed. **This is exactly the anti-vacuity control criterion 21's four non-primary Epic
domains LACKED** (see D-35-19-15, where the same bare zero had to be argued down to "none present"
from outside the product). Worth carrying into the Epic path as a pattern.

**AUTHORITATIVE RESULT: the login flow ASKED FOR CREDENTIALS.** The tester re-opened the Humble
login after logout and was required to enter credentials. No silent re-auth from a surviving
keyring token or cookie. That is this criterion's stated Expected, met.

**STRENGTH RELATIVE TO CRITERION 21 — recorded so the two PASSes are not read as equivalent.** This
result is the stronger of the pair on all three axes:
| | criterion 19 (Humble) | criterion 21 (Epic) |
| - | - | - |
| precondition | genuine pre-existing external state, predates this gate run | gate-created during criterion 14 |
| destroyed session proven server-accepted | **YES** (`denied=0 expired=0`) | NO (D-35-19-13: Epic never contacted) |
| zero-clear counts disambiguated by the product | **YES** (census verdict) | NO (bare zeros, argued externally) |

Cost incurred and flagged to the tester in advance: Humble has no login API, so re-authentication
requires the embedded webview and a reCAPTCHA
([[humble-has-no-login-api-webview-is-mandatory]]).
Verdict: PASS

### 20. Epic: session survives a restart (precondition for criterion 21)

What: Same shape as criterion 18, for Epic. This criterion, together with criterion 21, is the
live re-run of the previously-standing `34.6` Step 8 FAIL and 35-09's own outstanding Task 3
(`35-09-SUMMARY.md`: "Task 3 (blocking human-verify, live 34.6 Step 8 re-run) OUTSTANDING",
`35-VALIDATION.md` row `35-09-03`: "credentials required again after logout | manual |
human-check, 34.6 Step 8 re-run | n/a | pending"). This gate's criteria 20-21 DISCHARGE that
outstanding item — it is not a new requirement invented here.
Build: packaged (release)
Preconditions: Already logged into Epic on this machine from a prior session (external state; if
absent, criteria 20-21 are `NOT ATTEMPTED`).
Gesture sequence: Confirm Epic shows as logged in. Fully quit GameLib. Relaunch. Re-check the
same indicator.
Sink: none — UI observation.
Expected: Epic still shows as logged in after the restart.
Observed:
**PRECONDITION DEVIATION -- stated plainly, not glossed.** This criterion requires Epic to be logged
in "from a prior session (external state)". It was NOT. `user.json` mtime is **11:13:45 today**,
i.e. the tester logged into Epic DURING criterion 14 of this same gate run, to make that criterion's
library observable. So the Test 6 guarantee this precondition exists to provide is not satisfied by
its letter.
**Why the criterion is still run rather than marked NOT ATTEMPTED:** the durability it asks about has
since been demonstrated empirically. The session has now survived TWO full quit/relaunch cycles --
criterion 18's restart (12:21) and this criterion's own (12:35) -- with the credential file
byte-identical each time. Witnessing the creation AND the survival is arguably stronger than
inheriting opaque prior state. A reviewer who disagrees should downgrade this to NOT ATTEMPTED; the
facts to make that call are recorded here.

**RESTART EVIDENCE.** Pre-quit instance shell 40548; post-restart instance shell 73586, sidecar
73592 (12:35:04). Full quit verified: no `gamelib-shell`, no `gamelib-sidecar`.
| check | pre-quit | post-restart |
| - | - | - |
| `user.json` mtime | Aug 30 11:13:45 | Aug 30 11:13:45 |
| `user.json` size | 6218 | 6218 |
| `sha256` (first 24) | `26cf94497019fd98179e773b` | `26cf94497019fd98179e773b` |
| access token | present, len 4290, `expires_at` in the future | unchanged |
| refresh token | present, len 1127, `refresh_expires_at` 2027-08-30 | unchanged |
| UI, Accounts tab | tester: **logged in** | tester: **logged in**, library populated |
The credential file was not rewritten, so nothing was silently re-authenticated behind the restart.

**LIVE-SESSION VALIDITY IS NOT PROVEN -- this is materially weaker than criterion 18's Humble
result, and must not be read as equivalent.** Criterion 18 could point at
`fetched=7/7 ok=7 denied=0 expired=0`, i.e. the Humble SERVER accepting the restored credentials.
There is no counterpart here: on BOTH restarts the app logged
`Epic is Offline right now, cannot update game list!` and served the library from cache
(`Game list updated, got 15 games & DLCs` sourced from `assets.json`). Epic's servers were never
contacted with these tokens. What is proven is that the credentials PERSIST and the UI reports
logged-in; what is NOT proven is that Epic would accept them.
**A populated library is not evidence either way** -- those 15 entries are cached, and would render
identically with dead tokens.

**ROOT CAUSE of the offline warning -- it is NOT an Epic outage, and NOT an auth failure.** Traced
rather than assumed:
- Epic's own status API, queried live during this criterion, reports `Epic Games Store
  status=operational` (as do Fortnite and Rocket League).
- `isEpicServiceOffline()` (`src/backend/utils.ts:203`) is a SERVICE-STATUS check, not an auth check.
  Its first line is `if (!isOnline()) return true`, and its `catch` returns `false` -- so a network
  error could not produce this warning.
- `isOnline()` is `status === 'online'` (`src/backend/online_monitor.ts:144`).
- Startup ordering in this session's log is decisive:
  ```
  line 12  (12:35:04) [Connection]: Connectivity: check-online
  line 20  (12:35:04) [Legendary]:  Refreshing Epic Games...
  line 24  (12:35:04) [Backend]:    Epic is Offline right now, cannot update game list!
  line 28  (12:35:04) [Connection]: Connectivity: online
  ```
The Epic refresh runs while connectivity is still `'check-online'`, so `isOnline()` is false and the
function returns "offline" WITHOUT EVER QUERYING Epic. A startup race. Reproduced on both restarts
(12:21:49 and 12:35:04), and no later refresh retries -- there is exactly one `Refreshing Epic Games`
per session. Logged as D-35-19-13. `git blame` puts `online_monitor.ts` at upstream Heroic
`79f40b79b3` (2022-10-04): **pre-existing, not a cutover regression.**

**Consequence for criterion 21, flagged in advance:** its premise ("the session being destroyed is
live") rests on token persistence only, not on server acceptance. That is a weaker footing than
criterion 19 has for Humble, and criterion 21's write-up must say so.

Incidental finding recorded while measuring: **`gamelib.log` is TRUNCATED on every app start**, not
appended. Any cross-session log comparison in this gate must be taken from the per-session capture,
not from a single accumulated file.
Verdict: PASS (credentials persist byte-identical across a full restart and the UI reports logged in; live-session validity UNPROVEN — see D-35-19-13 — and the precondition deviation is recorded above)

### 21. Epic: logout requires credentials to log back in (discharges the standing `34.6` Step 8 FAIL)

What: After Epic logout, the login window requires credentials again. Per `35-09-SUMMARY.md`,
the fix (`EPIC_COOKIE_DOMAINS`/`EPIC_COOKIE_HOSTS`, five apex domains, `FATAL_WIPE_STEP =
clearEpicCookies`) clears cookies across every Epic-owned sign-in domain the shared webview touched,
not just the primary one — `35-AB-RETEST.md` had independently found 6 live residual cookies
(`EPIC_LOGIN_ID`/`_epicSID`/`_tald`/`EPIC_DEVICE`) surviving the old logout across non-primary Epic
domains before this fix.
Build: packaged (release)
Preconditions: Criterion 20 passed immediately before this gesture. **This is the LAST criterion
in the run order** — nothing later in this document depends on Epic remaining logged in.
Gesture sequence: From the still-logged-in state (criterion 20's end), log out of Epic via
Settings/Accounts. Attempt to open the Epic login flow again.
Sink: none — UI observation.
Expected: The login window requires credential entry again — no silent re-auth via a leftover
cookie on any of the five Epic-owned domains.
Observed:
**STATIC INVARIANT CHECKED FIRST (T-35-41 paired-list drift).** The fix's whole reach depends on
`EPIC_COOKIE_HOSTS` (`storeManagers/legendary/user.ts:43`) matching `EPIC_COOKIE_DOMAINS`
(`src-tauri/src/main.rs:3189`) entry for entry; the code comments warn that drift either way is a
silent half-fix. Compared mechanically: both are
`['epicgames.com','fortnite.com','unrealengine.com','twinmotion.com','metahuman.com']`, 5 vs 5,
identical INCLUDING order. Invariant holds.
(A first comparison reported a mismatch. That was a FAULT IN THE CHECK, not the code -- the regex
expected `= [` while Rust declares `= &[`. Corrected and re-run before anything was concluded;
recorded so the false reading is not mistaken for a finding.)

**PRE-LOGOUT** (instance shell 73586, sidecar 73592): `user.json` present, 6218 B, sha256 prefix
`26cf94497019fd98179e773b`, `displayName: soreluel`, access_token len 4290, refresh_token len 1127.
UI: logged in, library populated.

**LOGOUT RESULT.** `user.json` **REMOVED** outright. Per-domain output:
```
(12:45:46) Legendary logout: cleared 6 epicgames.com cookie(s) (measured post-removal delta)
(12:45:46) Legendary logout: cleared 0 fortnite.com cookie(s) (measured post-removal delta)
(12:45:46) Legendary logout: cleared 0 unrealengine.com cookie(s) (measured post-removal delta)
(12:45:46) Legendary logout: cleared 0 twinmotion.com cookie(s) (measured post-removal delta)
(12:45:46) Legendary logout: cleared 0 metahuman.com cookie(s) (measured post-removal delta)
(12:45:46) Legendary logout: Epic cookie clear removed 6 cookie(s) across 5 Epic-owned domain(s)
(12:45:46) Legendary logout: cleared storage — localStorage=3, sessionStorage=0, indexedDB=0, caches=0, serviceWorkers=0
```
All five domains were ACTUALLY ATTEMPTED, so the paired list is exercised at runtime, not merely
declared. Note the counts are a **"measured post-removal delta"** rather than a trusted return value
from the delete call -- the right construction given this project's finding that wry's cookie delete
can report success without deleting (`wry-cookie-delete-lies-about-deleting`). The number is
observed, not claimed.

**AUTHORITATIVE RESULT: the login flow ASKED FOR CREDENTIALS.** Tester re-opened the Epic login
after logout and was required to enter credentials. No silent re-auth from a leftover cookie on any
Epic-owned domain. This is the criterion's stated Expected, and it is met.
=> **The standing `34.6` Step 8 FAIL is DISCHARGED**, and with it 35-09's outstanding Task 3
(`35-09-SUMMARY.md`: "Task 3 (blocking human-verify, live 34.6 Step 8 re-run) OUTSTANDING") and
`35-VALIDATION.md` row `35-09-03` ("credentials required again after logout | pending"). This gate
was the designated discharge route for that item; it is not a new requirement invented here.

**LIMITATION -- the multi-domain reach of the fix is NOT proven by this run. Recorded because the
headline result hides it.** The defect `35-AB-RETEST.md` Item 7 measured was `EPIC_DEVICE` and
friends surviving on the NON-PRIMARY domains (`.fortnite.com`, `.twinmotion.com`,
`.unrealengine.com`, `.metahuman.com`) -- which is the entire reason the list was widened beyond
`epicgames.com`. In this run those four domains held **0 cookies each**, so nothing was there to
survive and nothing was cleared from them. The four `=0` results mean "none present", NOT "would
have been cleared if present". Only `epicgames.com` (6 cookies) exercised an actual removal.
Why: the Epic session under test was created fresh during criterion 14 via the embedded webview and
evidently never visited the ancillary Epic properties that seed those cookies. A stronger re-test
would first browse an Epic-owned non-primary domain in the login webview to seed them, then log out.

**PREMISE CAVEAT inherited from criterion 20, carried forward as promised there.** Criterion 20
could prove Epic credential PERSISTENCE but never server ACCEPTANCE (D-35-19-13: the startup race
means Epic was never contacted). So, strictly, "asked for credentials" is consistent with two
stories: the logout worked, or the tokens were already dead and the logged-in UI was a local
illusion. The first is much better supported -- `user.json` existed with an unexpired access token
and a year-valid refresh token, the UI reported logged in with a populated library, and the logout
produced a definitive local state change (file removed, 6 cookies measured away) -- but this
criterion rests on a weaker foundation than criterion 19 does for Humble, where the server
demonstrably accepted the restored session. Recorded rather than smoothed over.
Verdict: PASS (credentials required after logout; discharges 34.6 Step 8 and 35-09 Task 3 — multi-domain reach unexercised, see limitation above)

---

## Contract review

Run before Task 3 executes anything. Recorded here at authoring time (Task 1), per standing rule
D-E — the author checks the contract, the author does not run it.

**Test 1 — origin/scheme reachability.** Every gesture sequence above is reachable from where the
operator stands (a Terminal plus the running app's own UI), with one deliberate, explicitly-flagged
exception: criterion 17's DevTools-console gesture is unreachable on the release build (`devtools`
Cargo feature absent), so criterion 17 is scoped to the debug-packaged build instead, recorded
plainly in its own `Build:` field rather than silently written as if it worked on the release
artifact. Criterion 12's `https://` gesture may not even route to GameLib at all (macOS is not
registered for that scheme) — this is handled as a documented sub-case in the criterion itself, not
treated as a hidden assumption.

**Test 2 — concurrency reachability.** No criterion requires two mutually-exclusive states to hold
simultaneously. Criterion 16 deliberately runs a game AND a download at the same time — that is the
point of the criterion (reproducing F-35-08-A requires both), not an accidental impossibility, and
both a game launch and a download can genuinely coexist in this app.

**Test 3 — log-line emitter reachability with a named sink.** Every log-based criterion (5, 8, 10,
11, 12, 13, 14) names one of the three sinks defined in the sinks section above, and states which of
the three it is — including the two cases (5 and 12) where the emitter is `shell_diag()`-routed
(`gamelib-shell.log`) versus the one case (13) where it is a raw, terminal-only `eprintln!` that
does NOT reach `gamelib-shell.log`. Getting sink 2 vs sink 3 wrong for criterion 13 specifically
would make that criterion silently unfalsifiable (a raw `eprintln!` line, launched via Finder,
reaches nowhere at all) — this is exactly the class of defect Test 3 exists to catch, and the Header
mandates a terminal launch specifically because criterion 13 needs it.

**Test 4 — absence-observability.** Every criterion asserting an absence carries a positive control:
criterion 12 (foreign scheme rejected) relies on criteria 10-11 having already proven, on the same
binary and the same run, that `on_open_url` -> `shell_diag` -> `gamelib-shell.log` works for an
ACCEPTED url; criterion 13 (no dropped-response line) names the EXACT failing line in advance rather
than asserting generic silence, so a broken transcript-capture setup would show as "line never
appears in 95+ seconds of otherwise-populated transcript" versus "no transcript at all" — visibly
different failure shapes. Criterion 9 (darkTrayIcon control absent from Settings) is the one purely
UI-level absence claim with no log-based positive control available, and is called out explicitly as
such in its own text rather than left implicit.

**Test 5 — requirement-interaction reachability (state-mutating pairs).** Pairs considered:
- **(7, 8):** criterion 7 ends with the app quit (its own Quit gesture); criterion 8 needs the app
  quit as a precondition and reuses that ending state directly (`startInTray` was also enabled
  during criterion 7's session, before the quit) — compatible by construction, not by luck.
- **(8, 9):** criterion 8 ends with the main window HIDDEN (that is the property being tested);
  criterion 9 needs Settings visible. Resolved by an explicit "reveal via tray -> Show if hidden"
  step in criterion 9's own gesture sequence.
- **(9, 10):** criterion 9 leaves the app running; criterion 10 (cold start) needs the app fully
  quit. Resolved by criterion 10 performing its own quit gesture rather than depending on any prior
  criterion's ending state (the Run order's governing principle).
- **(10, 11, 12):** a deliberate chain, not an accidental coupling. Criterion 10 ends with the app
  freshly launched (via the deep link); criterion 11 uses that exact running instance to prove warm
  single-instance reachability; criterion 12 reuses the same instance again for the rejection case.
  This chain is stated explicitly as the one place in this document where a later criterion
  intentionally depends on an earlier one's ending state.
- **(4, 19) and (4, 21):** criterion 4's "library populated" precondition may, on the actual test
  machine, be satisfied by the Humble or Epic account specifically. Criteria 19 and 21 (logout)
  destroy that store's session. Resolved by placing BOTH logout criteria last in the run order —
  after every other criterion that could depend on library population — so a store's logout can
  never invalidate a precondition an earlier criterion already scored.
- **(18, 19) and (20, 21):** each logout criterion's precondition ("the session survived a restart
  BEFORE the logout, or the item proves nothing" — the plan's own Test 6 requirement) is only
  satisfiable if its restart-survival sibling ran immediately before it. Enforced by direct adjacency
  in the run order; criterion 19 explicitly cites "immediately before this gesture" and so does 21.
- **(15, 16):** both wake-lock criteria may want to reuse the same `pmset -g assertions` polling
  setup; criterion 16 restates it explicitly rather than assuming criterion 15's terminal is still
  open, since criterion 15 may have been scored `BLOCKED`/`NOT ATTEMPTED` (no game available) without
  stopping the run.

No criterion above destroys a precondition another EARLIER criterion in the run order still needs —
every dependency arrow in the pairs above points from an earlier criterion to a later one.

**Test 6 — pre-existing external state.** Every criterion with a real precondition states it
explicitly and instructs the runner to record whether it holds, rather than assuming it: criterion 4
(a store already logged in, a title already installed), criteria 18/20 (a store already logged in
from a PRIOR session, not created by this gate), criterion 14 (a Legendary-tracked title installed
so `installed.json` is non-empty), criteria 15/16 (a launchable, installed title). Where a
precondition might not hold on the actual test machine, the criterion's own text states the correct
verdict is `NOT ATTEMPTED`, not `FAIL` — an unmet premise is a gap in test-machine setup, not a
product defect, and conflating the two would misattribute a FAIL.

**Test 7 — UI-level gesture reachability.** Cross-checked against `35-06-SUMMARY.md`'s NOT HONOURED
list: that list is EMPTY (all four tray settings ended up HONOURED), so no criterion above asks the
operator to toggle a control that plan 35-06 removed. Criterion 9 is written specifically to assert
the ONE platform-conditional absence that does exist (`darkTrayIcon` hidden on macOS) rather than
inventing a NOT-HONOURED item that does not exist. Criterion 6 (recent-game tray entry) and criterion
19/21 (logout via the existing Settings/Accounts UI) are both gestures the current UI actively
supports per the release notes ("It lists your recent games — click one to launch it directly").

**Carry-in check (`35-AB-RETEST.md`):** exactly one item in that document was marked `TAURI-ONLY`
with a pre-committed `BLOCKS D-16 GATE` severity call — item 3, `openDialog` missing from
`LONG_RUNNING_CHANNELS`. It was fixed in `d980559b7` and discharged once already by live
re-observation (that document's own closing section: "Plan 35-19's gate therefore inherits no
blocking item from this document"). Criterion 13 above re-discharges it specifically against the
packaged release artifact, which the prior discharge was not measured against — recorded here so the
carry-in is traceable rather than silently dropped.
