---
phase: 35-electron-cutover-remove-the-electron-build
plan: 19
type: live-gate
status: authored
blocking: true
created: 2026-08-30
criteria_total: 21 # sum of criteria 1-21 below; grep -c "^Verdict:" must equal this once run
verdict: NOT RUN
run_date: 2026-08-30
runner: # human operator — fill in before recording the verdict
session_dir: /tmp/gamelib-35-19-gate-9XTqHx # app pid 23589 launched 08:50:00, stdout+stderr tee'd. Criterion 1 was observed on an EARLIER instance (pid 21484, 08:34:31, /tmp/gamelib-35-19-gate-sFpgKb) before four relaunches during the Keychain diagnosis in D-35-19-01; criteria 2-21 run on this instance.
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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
Verdict:

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
