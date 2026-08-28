# Phase 35 Plan 02 — A/B Retest Protocol (D-18)

**Purpose.** Every parked bug and folded todo below must be run against **both** shells — Electron
and Tauri — while both still build, and the result recorded here. This is the last moment that
question is answerable: plan 35-14 deletes `src/backend/main.ts`, and after that "does this
reproduce under Electron?" becomes permanently unanswerable. This document is **observation only**
— fixing is out of scope and lands in plans 35-09, 35-10, 35-11, informed by what this record says.

**Commit observed at:** `b2047818441aefaf3211be18e63969ce0620e814` (short: `b20478184`)
**Date authored:** 2026-08-28
**Author:** Task 1 of plan 35-02 (autonomous). Task 2 (the actual A/B run) is a blocking
human-verify checkpoint — every `Observed:` and `Verdict:` field below is left blank for the
human operator to fill.

## Both legs are DEV builds

**Both the Electron leg and the Tauri leg observed here are DEV builds** (`pnpm start` and
`pnpm tauri:dev` respectively). Per this phase's standing packaged-not-dev discipline
(`R-34.5-G1-PKG`, D-16), a dev-build observation is evidence about dev behavior ONLY. It is not,
and must not be cited as, evidence about the packaged `.app`/`.exe`/AppImage artifact. The
packaged-artifact gate is D-16's separate blocking live gate (plan 35-19), not this document.

## Harness commands (verbatim from `package.json`, re-confirmed at authoring time)

```
Electron leg: pnpm start       -> electron-vite dev --watch
Tauri leg:    pnpm tauri:dev   -> electron-vite build && pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri dev
```

**Standing hazards that will bite this run, restated from the plan:**

- `pnpm tauri:dev` exits 0 **without replacing** an already-running instance. Kill any running
  GameLib process before each leg (`pkill -f GameLib`, or Activity Monitor) and confirm the new
  process is the one being observed — check the PID.
- Never run bare `tauri dev` — it serves a stale static bundle, not the freshly built one.
- Run the two legs **strictly in sequence**, never simultaneously. Two live instances split the
  `[shell]` log sink (`concurrent-instance-splits-shell-sink`), and Phase 31 D-02 records the two
  builds carry divergent settings state.
- **If plan 35-03 (renderer migration to plain Vite) has already landed** by the time this is run,
  re-confirm both `pnpm start` and `pnpm tauri:dev` still boot to a usable window before observing
  anything, and record the commit actually observed at in place of the one above — the harness
  commands themselves may have changed shape.

## The two log sinks DO NOT overlap — name one per item, always

This project has two independent, non-overlapping evidence sinks. An item whose evidence is
"nothing was logged" is meaningless unless it names which sink was checked — the absence may only
be true in the sink that was read.

| Sink | What lands there | What never lands there |
|---|---|---|
| `~/Library/Logs/GameLib/gamelib.log` | Sidecar-side `logInfo`/`logWarning`/`logError` calls (`src/backend/logger`) — this is the SAME file under both shells, and it **appends** across launches (never truncates), so both legs' lines accumulate in one file. Note the wall-clock boundary between legs when reading it. | Rust `[shell]`-prefixed lines (Tauri-only); sidecar `console.*` calls (captured nowhere at all, under either shell) |
| Terminal `[shell]` / stdout-stderr scrollback (tee'd transcript, if captured) | Rust-side `[shell]`-prefixed lines (Tauri leg only — there is no Rust shell under Electron); sidecar STDERR, prefixed `[sidecar:err]` | Sidecar `logInfo`/`logWarning` (those go only to `gamelib.log`); sidecar `console.*` (invisible everywhere) |

Renderer-only `console.error`/unhandled-rejection output (visible only in the OS-level DevTools
console under Electron, or the WKWebView inspector under Tauri) is a **third**, even narrower
surface — several items below depend on it and it is named explicitly where relevant.

## Allowed `Verdict:` vocabulary (exactly one of these five, per item)

- **BOTH** — reproduces under both Electron and Tauri.
- **TAURI-ONLY** — reproduces under Tauri, not under Electron.
- **ELECTRON-ONLY** — reproduces under Electron, not under Tauri.
- **NEITHER** — reproduces under neither shell, in both cases genuinely attempted and observed.
- **NOT ATTEMPTED** — the item could not be reached, driven, or exercised under one or both
  shells (a UI affordance doesn't exist, a prerequisite session could not be obtained, etc). **Use
  this, never `NEITHER`, when the item was not actually driven to completion.** A pass over an
  unreachable surface recorded as a clean negative is a recorded failure shape in this project.

## Consolidation note (transparency, not a silent merge)

The plan's `<interfaces>` block names 7 numbered source groups plus, separately, "the Epic-logout
pair … still worth one row" — 8 source groups by a literal count. The plan's own acceptance
criteria and automated verify script require **exactly 7** `## Item ` sections. To satisfy both
without dropping coverage, Item 6 below combines the two smallest, most clearly related items —
the EOS-remove native dialog and the oversized path-rejection dialog — into one section citing
both source files. Both files themselves describe each other as "adjacent," both are `severity:
minor` dialog-presentation issues touching the same `showDialogBoxModalAuto` primitive, and
neither blocks the other's own contract. All 9 source documents remain individually cited
somewhere below; nothing is dropped, only co-located.

---

## Item 1 — Uninstalled game vanishes from library (parked debug bug)

**Source:** `.planning/debug/uninstall-game-vanishes.md`

**Repro steps** (transcribed from the debug doc's own most recent, live-verified recipe —
2026-08-27 "LIVE INSTRUMENTED REPRODUCTION" section — rather than the older, harder-to-reproduce
recipes above it in the file):
1. Have a Steam game installed via a forced Windows-via-bottle install (`forcedWindowsViaBottle:
   true`), or any installed Steam game if a bottled title isn't available. The 2026-08-27 sighting
   used Machinarium (appId 40700).
2. Uninstall the game from the GameLib library view. Confirm the badge flips to "Install" and the
   content directory / `appmanifest_<appid>.acf` are actually removed (this part is known-correct
   and not in question).
3. **Do not restart the app.** Watch the same title in the plain library list view (no search, no
   filters) for roughly 50-60 seconds after the uninstall badge-flip. The 2026-08-27 sighting fired
   exactly 50 seconds after the flip, not immediately — do not conclude "no vanish" from an
   immediate check alone.
4. If the title disappears from the grid, note the timestamp of disappearance relative to the
   badge-flip timestamp. Press Refresh (no filter/view change) and confirm whether it reappears.
5. Cheaper alternative recipe (from the file's earlier, install-side repro): quit the bottle's
   `steam.exe`, move `appmanifest_<appid>.acf` out of the bottle's `steamapps/` (back it up first),
   click Install on the now-"not installed" title — content is already on disk so it completes in
   ~70s downloading nothing — and watch for the same vanish-then-reappear-on-refresh pattern.

**Sink to read:** `~/Library/Logs/GameLib/gamelib.log`. The specific line to grep for is the
2026-08-27 sighting's own emitting probe: `Library: 1 owned Steam game(s) silently excluded from
library grid by stale nonAvailableGames entry: <appid>` (`src/frontend/screens/Library/index.tsx`,
the `reconcileTick`-gated post-heal exclusion guard). Absence of this specific line does not prove
absence of the underlying vanish — the file's own root-cause investigation found the vanish can
occur via more than one candidate mechanism, and this probe only catches the one family it targets.

**Electron leg — Observed:** VISIBLE SYMPTOM DID NOT REPRODUCE; THE INSTRUMENTED CONDITION FIRED
ON ALL THREE UNINSTALLS.

*Visual:* operator drove the uninstall recipe on **two native (non-bottled) Steam installs plus one
`forcedWindowsViaBottle: true` install (Machinarium, appId 40700)** — the configuration of the
2026-08-27 sighting. All three titles **remained in the library grid**. The 50-60 second
post-badge-flip window was held open each time (operator confirmed), so the visual negative is real
rather than the vacuous checked-immediately negative the repro steps warn against. The app was not
restarted between badge-flip and observation.

*Log (`gamelib.log`, preserved as `~/Library/Logs/GameLib/gamelib.log.35-02-ab-electron`):* the
probe line this item names as its evidence **fired every time**, once per uninstall:

```
(15:07:14) Steam: uninstall polling complete for appId 8870  — badge flipped to not-installed
(15:07:34) [ERROR] Library: 1 owned Steam game(s) silently excluded from the library grid
                   by a stale nonAvailableGames entry: 8870                        (+20s)
(15:08:42) Steam: uninstall polling complete for appId 40700 — badge flipped to not-installed
(15:08:57) [ERROR] ... stale nonAvailableGames entry: 40700                        (+15s)
(15:10:34) Steam: uninstall polling complete for appId 40700 — badge flipped to not-installed
(15:10:40) [ERROR] ... stale nonAvailableGames entry: 40700                        (+6s)
```

**RECORD CORRECTION, stated rather than silently overwritten.** This field originally read
"DID NOT REPRODUCE, across three titles" and was written from the operator's visual report ALONE,
without reading the log sink this item's own `Sink to read:` field names. That is exactly the
failure mode the repro steps warn against, committed by the orchestrator rather than the operator —
the operator's observation was accurate; the record built on it was incomplete. The log was
recovered from `gamelib.log.old` (rotated when the Tauri leg booted) one app restart before it
would have been destroyed. The corrected reading changes this item's verdict from `NEITHER` to
`BOTH`.

**Tauri leg — Observed:** IDENTICAL SHAPE — visible symptom absent, instrumented condition fired on
both uninstalls. Operator reported the uninstall working with an "almost instant flip to install
option" and no vanish. Log:

```
(15:49:34) Steam: uninstall polling complete for appId 226840 — badge flipped to not-installed
(15:49:39) [ERROR] ... stale nonAvailableGames entry: 226840                       (+5s)
(15:57:04) Steam: uninstall polling complete for appId 40700  — badge flipped to not-installed
(15:57:08) [ERROR] ... stale nonAvailableGames entry: 40700                        (+4s)
```

**Verdict:** `BOTH` — on the instrumented condition. Six uninstalls across two shells produced six
probe lines, with no exceptions in either direction.

Recorded precisely, because the two halves disagree and the disagreement is the finding: the
**user-visible vanish** reproduced on NEITHER shell, while the **stale `nonAvailableGames` state
the probe detects** reproduced on BOTH, every time, on demand. `BOTH` is the verdict because the
probe is what this item nominated as its evidence; scoring the visual half alone would record
`NEITHER` and retire a live, shared-code defect.

**Why this matters for the cutover:** a defect that reproduces identically on both shells lives in
SHARED code, so it does not die with Electron at plan 35-14 — it ships. The exclusion-to-flip delay
also varies widely (+4s, +5s, +6s, +15s, +20s here; ~50s in the 2026-08-27 sighting), which is
consistent with the visible vanish being a race that the log condition does not fully determine.
That variance is itself evidence against any fix predicated on a fixed timing window.

**Severity if TAURI-ONLY:** BLOCKS D-16 GATE. This is a core library-correctness defect directly
inside D-16's explicit gate scope ("install, launch, library, login"). A title that disappears
after an ordinary install/uninstall cycle on the packaged artifact is not acceptable to ship
silently, and 34.13 already accepted 7 items open-not-discharged once before — this should not
become an eighth.

**Notes:** This is the ONLY item in this document with a debug ledger of its own; do not
summarize from memory when driving the repro — the ledger's 2026-08-27 section is authoritative
over its own older, superseded sections (each explicitly marked superseded in the file itself).
Static analysis is recorded as exhausted; only a live, logged reproduction advances this one.

**Non-reproduction is NOT a fix, and must not be recorded as one.** The Electron leg's clean run
across three titles does not close `.planning/debug/uninstall-game-vanishes.md`. A defect that was
incidentally fixed and a defect that simply did not reproduce on this attempt are indistinguishable
from a single negative run — the same distinction Phase 34.17's paste gate had to draw explicitly.
Seven hypotheses were eliminated on this bug without finding a root cause, so the mechanism remains
unknown and the parked ledger stays open regardless of this row's verdict. What this row DOES
establish is a bound: whatever the mechanism is, it did not fire under Electron on three
consecutive uninstalls including the bottled configuration of the original sighting.

---

## Item 2 — `installed.json` watcher never ported to the Tauri sidecar

**Source (dedupe — cite both):**
`.planning/todos/pending/2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md`
AND `.planning/todos/pending/2026-08-25-installed-json-watcher-not-ported-to-tauri.md`

**Repro steps** (transcribed from the source's own repro, driven via `getDefaultSavePath`/Cloud
Saves Sync — the exact symptom that surfaced this gap during the 34.6 live gate):
1. Have a Legendary (Epic) game installed with cloud-save support (the source used Phoenix Point /
   appName `Iris`).
2. Open the game's context menu -> Settings -> Cloud Saves Sync.
3. If the save-path field is not already populated from a prior session, trigger a fresh legendary
   subprocess write to `installed.json` — e.g. by running an install-adjacent legendary command, or
   simply re-opening the Cloud Saves Sync panel immediately after a fresh install completes.
4. Check whether the save-path field populates on the FIRST attempt (correct) or renders empty with
   an `[ERROR]: [Legendary]: Unable to compute default save path <appName>` line (the reported
   defect — the in-memory `installedGames` Map is stale because nothing calls `refreshInstalled()`).
5. If empty, retry the same panel without restarting the app. The source's own finding: retrying
   does NOT self-heal even two minutes later, because nothing ever refreshes the in-memory map
   short of a full library refresh masking it as intermittent.

**Sink to read:** BOTH sinks, for different evidence. `~/Library/Logs/GameLib/gamelib.log` for the
`[Legendary]: Unable to compute default save path` error line and any
`installed.json updated, refreshing library` line (the presence of the latter is the discharge
signal — its absence after a legendary subprocess writes to `installed.json` is the defect,
per Test 4/absence-observability: this line DOES fire under a correctly-working watcher, so its
absence is a meaningful negative, not a vacuous one). The terminal `[shell]` transcript is not
expected to carry anything for this item — it is a sidecar-side, not shell-side, defect — but note
if anything unexpected appears there too.

**Electron leg — Observed:** `NOT ATTEMPTED` — THE PRECONDITION WAS NEVER MET.

The Cloud Saves Sync save-path field populated and no
`[ERROR]: [Legendary]: Unable to compute default save path` line was produced. **That is not
evidence of anything.** The defect requires the in-memory `installedGames` map to have gone STALE,
which requires a legendary subprocess to WRITE `installed.json` after the map was loaded.
Measured: `~/Library/Application Support/gamelib/legendaryConfig/legendary/installed.json` has an
mtime of **2026-08-24 22:51 — four days before this run.** It was not written on either leg. The
map could not be stale, so the symptom had no opportunity to arise, so a populated field is the
expected outcome under BOTH shells and discriminates nothing.

**RECORD CORRECTION, stated rather than silently overwritten.** This field originally read
"DID NOT REPRODUCE ... confirms the source document's mechanism claim from the working side." That
was wrong twice over: it scored a pass over a surface that was never reached, and it then cited
that pass as positive confirmation of the Electron watcher's mechanism. Neither is supportable. The
error is the orchestrator's, not the operator's, and it is the SECOND instance of the same mistake
in this document (see Item 1) — recording an operator's accurate visual report as a verdict without
first confirming the item's precondition held.

**The absence of `installed.json updated, refreshing library` is likewise NON-EVIDENCE here.** That
line is absent from BOTH legs' logs (0 occurrences each). The source names its absence as the
defect signature — but that reading only holds if a write actually occurred and the watcher failed
to notice. With no write, both shells are correctly silent. An absence is only meaningful against a
stimulus.

**Tauri leg — Observed:** `NOT ATTEMPTED`, same reason, same evidence. Save-path field populated;
0 `Unable to compute default save path`; 0 `installed.json updated`; `installed.json` untouched
since 2026-08-24. Five legendary subprocess invocations ran this boot (16 on the Electron leg), but
none of them wrote the file.

**Verdict:** `NOT ATTEMPTED`

Explicitly NOT `NEITHER`. This document's own constraint states that an item which could not be
reached is `NOT ATTEMPTED`, never "does not reproduce" — and this project has a recorded failure
shape for a `pass` covering an unreachable surface. Scoring this `NEITHER` would retire, on both
shells at once, a defect whose mechanism (`main.ts` hosts the `watch(legendaryInstalled, ...)`
call; plan 35-01's D-17 census confirmed ZERO import edges from the sidecar into `main.ts`) remains
entirely intact and unexamined.

**How to reach it, for whoever drives this next:** the trigger is a legendary subprocess WRITE to
`installed.json` after the in-memory map has loaded — i.e. complete a fresh Epic install, import or
uninstall, then open that game's Cloud Saves Sync panel WITHOUT a full library refresh in between
(a refresh reloads the map and masks the defect, which is what the source means by "masking it as
intermittent"). Verify the precondition by checking `installed.json`'s mtime moved, BEFORE scoring
the observation.

**Severity if TAURI-ONLY:** This item is structurally certain to be TAURI-ONLY before observing —
the source document itself states plainly that `main.ts` (which hosts the `watch(legendaryInstalled,
...)` call) is not in the sidecar's import graph at all, so there is no code path under which this
could reproduce under Tauri only by coincidence; it is Tauri-only by construction. It is expected
to reproduce under Electron NOT at all (Electron's `main.ts` watcher covers it there). Given the
fix already has an owning plan cluster (35-09/35-10/35-11) that lands before the D-16 gate per
D-17's ordering, this does NOT block D-16 on its own — record TAURI-ONLY and move on, but flag
loudly if by the time D-16 runs the fix has not landed.

**Notes:** Per the source's own "generalisation worth acting on" — `main.ts` side effects that are
not IPC handlers (watchers, timers, event subscriptions) are invisible to the channel-by-channel
IPC porting inventory, so a defect like this can exist with a fully green port-coverage gate. Worth
a one-line callout in whichever of 35-09/10/11 owns the fix: sweep `main.ts` for other
`watch(`/`setInterval`/`.on(` side effects that never made the same jump.

---

## Item 3 — `openDialog` missing from `LONG_RUNNING_CHANNELS`

**Source:** `.planning/todos/pending/2026-08-24-opendialog-is-missing-from-long-running-channels-so-every-file-picker-flow-dies-silently.md`

**Repro steps** (transcribed from the source's own live-gate repro):
1. Trigger any flow that opens a native folder/file picker and deliberately deliberate for
   **more than 60 seconds** before picking — `moveInstall` (Move Game from a game's context menu),
   `importGame` (via `ImportDialog`'s `PathSelectionBox`), `changeGameInstallPath`, or the
   install-path picker in the install modal are all named call sites.
2. Leave the OS-native picker open, untouched, for at least 65 seconds.
3. Make a selection in the picker after the 60s mark has passed.
4. Confirm whether the originating action (e.g. the actual move, the actual import) proceeds, or
   silently does nothing.

**Sink to read:** BOTH. Terminal `[shell]` transcript for the Rust-side drop line —
`response for unknown/timed-out id=<n> (dropped)` — which is a `[shell]`-prefixed line and
therefore ONLY reaches the terminal transcript, never `gamelib.log`. Renderer DevTools/WKWebView
inspector console (a third surface, not either main sink) for the unhandled promise rejection,
since the source notes `onMoveInstallYesClick` has no try/catch around the awaited call — this
will NOT appear in `gamelib.log` and will NOT appear in the terminal transcript either.

**Electron leg — Observed:** THE TIMEOUT SYMPTOM DID NOT REPRODUCE — and the run surfaced a
DIFFERENT, PREVIOUSLY UNRECORDED DEFECT in its place. Operator drove `moveInstall` (Move Game),
left the native picker open and untouched for **over 65 seconds**, then made a selection. The
originating action **did not silently die**: it proceeded past the picker and reached the actual
move, which then failed with an app-level error dialog reading:

```
Error Moving Game
rsync: unrecognized option `--no-human-readable'
```

Two separate facts, both worth keeping distinct:

(a) **The >60s picker timeout did NOT fire under Electron.** This is the expected-correct
    behaviour and confirms the source's mechanism claim from the working side — the 60-second
    bound is `INVOKE_TIMEOUT` in `src-tauri/src/main.rs`, a Tauri-transport construct with no
    Electron analog (`ipcMain.handle` has no timeout at all). The action reaching rsync at all is
    positive proof the invoke completed rather than being dropped.

(b) **NEW FINDING — `moveInstall` is broken on this host independently of either shell.**
    `rsync: unrecognized option '--no-human-readable'` is a flag-compatibility failure against the
    system `rsync`, not a transport or timeout failure. It is shared-backend code and therefore
    predicted to reproduce identically under Tauri. This is NOT the defect Item 3 was written to
    observe, and it must not be conflated with it — recorded here because this run is where it was
    seen, and dropping it would lose it. It needs its own todo; it is out of scope for the fix
    plans (35-09/35-10/35-11) that own Item 3's actual symptom.

**Deferred sub-question, answered:** the native picker rendered **dark-themed**, matching the
macOS system appearance. The source flagged a suspected light-themed picker under dark mode as
explicitly unverified. This observation does not discharge that flag — the source deferred it to a
**packaged `.app`**, and this is an unbundled dev build, which is precisely the configuration the
source said could not settle it. Recorded as a dev-build data point only.

**Tauri leg — Observed:** REPRODUCES. The picker opened, the operator left it untouched for 65+
seconds, then selected. The Rust drop line fired in the terminal `[shell]` sink:

```
[shell] response for unknown/timed-out id=4465 (dropped)
```

`gamelib.log` carries **ZERO** `openDialog` / `moveInstall` / `Moving` / `rsync` / `importGame`
lines for this leg — the correct and expected corollary, not a second defect: the invoke was
dropped at the 60s bound, so the renderer's `await` never resolved and the backend work was never
requested. Contrast Electron, where the same 65s wait produced a full backend round-trip that got
as far as spawning `rsync`.

**One divergence from the source document, recorded rather than smoothed over:** the todo's framing
is that these flows "die silently". This run was NOT silent — the operator received a user-visible
**"failed to install"** message. So the observable is a *misleading* error, not an absent one. The
wording is wrong for the action driven (a move/path-selection reported as an install failure), and
the message gives no indication that a 60-second transport bound was the cause. That is arguably
worse for diagnosis than silence, because it misdirects; but "silently dies" should not be repeated
as the symptom description without this qualification.

**Channel membership re-derived at this commit rather than assumed from the todo:**
`src-tauri/src/main.rs:184`'s `LONG_RUNNING_CHANNELS` contains `install`, `updateGame`, `uninstall`,
`checkGameUpdates`, `refreshLibrary`, `getCrossoverIndex`, `repair`, `readConfig`,
`oauthCaptureLogin`, `humbleStartLogin`, `humbleReconnect`, `getInstallInfo` — **`openDialog` is
absent**, so `timeout_for()` returns `Some(INVOKE_TIMEOUT)` = 60s for it. The todo is current, not
stale. Routing also confirmed: `openDialog` is a genuine sidecar invoke channel registered in
`src/backend/sidecar/dialogFlowRegistration.ts` against the shared `openDialogCallback`
(`backend/utils/openDialog.ts`), so it is subject to that bound — it is not a Rust-native dialog
command that would bypass it.

**Verdict:** `TAURI-ONLY`

**BLOCKS D-16 GATE** — carrying forward per this document's closing section. The pre-written
severity call below stands unmodified and is met: `moveInstall` and `importGame` are core,
D-16-scoped install-flow functionality, and this defect breaks them on nothing more exotic than a
user who takes over a minute to choose a folder.

**Severity if TAURI-ONLY:** BLOCKS D-16 GATE. This item is structurally certain to be TAURI-ONLY
before observing — the 60-second bound (`INVOKE_TIMEOUT` in `src-tauri/src/main.rs`) is a
Tauri-shell-specific transport mechanism with no Electron IPC analog; Electron's `ipcMain.handle`
has no timeout at all. `moveInstall` and `importGame` are core, D-16-scoped install-flow
functionality, and this defect makes them silently fail on nothing more exotic than a user who
takes over a minute to pick a folder — an entirely ordinary interaction. Record TAURI-ONLY, but the
severity pre-assessment stands regardless of what the observation confirms.

**Notes:** Two compounding, independently-suggested-fix defects live in the same source: (1) the
picker also discards `title`/`buttonLabel`/`defaultPath`, so it opens in the wrong location with no
context, making a >60s deliberation MORE likely, not less; (2) a third, explicitly-unverified
observation that the picker renders light-themed under a dark-mode macOS system on an unbundled dev
binary — the source itself flags this as needing verification against a packaged `.app`, not a dev
build, and explicitly was NOT checked during that gate run to avoid the sink-splitting hazard of a
second concurrent instance. If time allows during this A/B run, note in this item's `Notes:`
whether the light/dark picker mismatch was also visible, but do not treat its absence as
disproving it — it needs the packaged-artifact check the source itself deferred.

---

## Item 4 — `winetricksInstall` silent no-op / mouse-click-only failure (parked)

**Source:** `.planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md`

**Status as of this writing: PARKED 2026-08-25**, not simply OPEN. The file's own history matters
here — an earlier hypothesis (IPC send-channel transport failure) was fully diagnosed and
**RESOLVED**, then a second hypothesis (a `SearchBar` mousedown-blur focus race) was proposed,
partially fixed, and then **REOPENED same day** when the fix landed in the running bundle and the
symptom persisted anyway. The current, still-unexplained state: **keyboard activation (Tab+Enter)
reaches the handler and runs winetricks correctly end to end; mouse click on the identical row does
not reach the handler at all** — no `mouseup`, no `click`, the row's own React component unmounts
immediately on `mousedown`.

**Repro steps** (transcribed from the source's own settled findings — do not re-litigate the
already-eliminated hypotheses listed in the file under "SETTLED — do not re-investigate"):
1. Open the Winetricks panel for a Wine-based game, search for a component (the source used
   `corefonts`), and confirm the results list renders.
2. Click "Install" on a result row **using the mouse**. Confirm whether anything happens (no log
   line in either sink is the known symptom) versus a genuine winetricks run starting.
3. As a comparison, reach the exact same row and Install action **using only the keyboard** — Tab
   to the row/button, Enter to activate. Confirm whether this DOES start a real winetricks run
   (`Executing w_do_call corefonts`, a download, `Done`).
4. This is deliberately a within-shell input-method comparison as well as a cross-shell one — the
   root cause is currently theorized to live in `Winetricks/index.tsx`'s MUI `Dialog` component
   (nested scroll containers / stacking contexts / focus-modal machinery), which is frontend
   rendering code shared by both shells, not IPC-specific code. It is therefore plausible this
   reproduces under BOTH shells rather than being Tauri-specific — that is exactly the kind of
   fact this A/B run exists to settle.

**Sink to read:** BOTH. `~/Library/Logs/GameLib/gamelib.log` for the `[GAMELIB_SIDECAR_SEND_HANDLER]
winetricksInstall` line (present when the handler is reached; its known absence on the mouse path
is the core symptom) and any `winetricks -q corefonts` invocation lines. Renderer DevTools/WKWebView
inspector console (third surface) for the per-row MOUNT/UNMOUNT probe evidence, if re-instrumented
— see Notes.

**Electron leg — Observed:** Operator reported `pass` — i.e. the Winetricks Install action WORKED
under Electron and the mouse-click no-op did NOT reproduce.

**DISCRIMINATOR CAPTURED — activation was BY MOUSE CLICK** (operator confirmed on follow-up). This
is therefore a genuine Electron-side non-reproduction of the parked symptom on the exact input path
that fails under Tauri, not the keyboard path already known to work on both. It materially narrows
the search: the mouse route reaches the handler under Electron and does not under Tauri, on
frontend code that is otherwise shared.

Reading this correctly matters, because the obvious inference is the wrong one. The source's
current leading theory is a `Winetricks/index.tsx` MUI `Dialog` focus/stacking-context fault in
SHARED frontend code — a theory that predicts BOTH shells fail. This observation contradicts that
prediction, so either the theory is wrong, or something shell-specific modulates it (WKWebView vs
Chromium pointer-event/focus semantics being the obvious candidate, given this project's recorded
`focus-within-popover-unmounts-what-you-click` finding). It does NOT on its own establish which.
Recorded as a constraint on the hypothesis space, not as a diagnosis.

**Tauri leg — Observed:** REPRODUCES on the pure-mouse path, and the operator's workaround supplies
a mechanistic clue the source document does not have.

A bare mouse click on the row did NOT work. What DID work: **press Tab while the row is
highlighted — at which point the mouse pointer visibly CHANGES — and only then does a click
succeed.** The install then ran correctly end to end:

```
(18:48:25) [Backend]: [GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall
(18:48:36-40) [Winetricks]: ... 100%  97.3M ...
(18:48:40) [Winetricks]: Executing .../CrossOver/bin/wine msiexec /quiet /i PowerShell-7.4.11-win-x86.msi ...
```

**Two conclusions, and the second one is new.**

1. **The IPC transport is NOT the fault, confirmed live.** The D-11 observable
   (`[GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall`) fires and real work follows. This
   independently re-confirms the source's already-RESOLVED first hypothesis from the working side,
   on this build, rather than inheriting it.

2. **THE CURSOR NOT CHANGING IS THE FINDING.** A pointer that produces no cursor change over a
   control means the element is not being HIT-TESTED under that pointer — there is no hover state
   to react to. That is a materially different mechanism from the source's current leading theory,
   which is that the row's React component UNMOUNTS on `mousedown`. An unmount-on-mousedown still
   requires the element to be hit-testable first (you must hit it to mousedown on it) and would
   therefore still change the cursor on hover. So the two are distinguishable, and this run points
   away from the recorded theory.

   Recorded as an OBSERVATION, not a diagnosis. What it establishes is that focus state and
   hit-testability are coupled here in a way they are not under Electron — moving keyboard focus
   onto the row is what makes it pointer-reachable. Candidate mechanisms (all unverified, listed so
   the next investigator does not have to re-derive them): an overlay/stacking layer intercepting
   pointer events until focus shifts, a `pointer-events` value that is focus-conditional, or a
   WKWebView-vs-Chromium divergence in hit-testing inside MUI's focus-modal machinery.

**Verdict:** `TAURI-ONLY`

**This kills the source's leading theory as a SOLE explanation.** That theory — a
`Winetricks/index.tsx` MUI `Dialog` focus/stacking fault in SHARED frontend code — predicts BOTH
shells fail. Electron passed on the mouse path (operator confirmed activation was by mouse) and
Tauri fails on it. Shared code cannot explain a divergence between two renderers of that same code
unless something renderer-specific modulates it. The theory is therefore either wrong or
incomplete; this run cannot say which, and does not claim to.

**Severity if TAURI-ONLY:** Does not block D-16 gate on its own — Winetricks is a secondary,
non-core feature not named in D-16's explicit checklist (install, launch, library, login, tray,
deep-link, wake-lock). If the verdict comes back BOTH (reproducing under Electron too), that
sharpens the diagnosis considerably — it would rule out anything Tauri-specific and confirm the
MUI Dialog/stacking-context theory as the more promising lead, which is independently valuable to
whichever plan eventually owns the fix, even though this todo carries no `resolves_phase:`.

**Notes:** The removed instrumentation (pointer-sequence probes `fcec00e9b`, per-row MOUNT/UNMOUNT
probe `df770f3e9`) is NOT restored by this protocol — Task 1 is observation-only and adding
diagnostic code is out of scope for an auto task. If the human operator wants deeper diagnosis
during Task 2, that is their call to make live, but note it as a deviation from pure observation if
done. The one un-taken probe the file itself calls out as the next step — logging `search` and
`searchResults.length` on every `WinetricksSearchBar` render — remains the cheapest next move if
this session has time for it.

---

## Item 5 — About window structurally unreachable under Tauri

**Source:** `.planning/todos/pending/2026-08-22-about-window-is-unreachable-under-tauri.md`

**This item is a reachability observation, not a bug reproduction.** `tauriShowAboutWindow`
(`src/preload/api/tauriChildWindows.ts:139`, confirmed present at this commit) is fully
implemented — it resolves the version string, reuses an existing About window if present, and loads
`public/about.html`. Its only caller anywhere in the tree is Electron's tray menu
(`src/backend/tray_icon/tray_icon.ts:124`, confirmed present at this commit,
`showAboutWindow`/`handleExit` imported from `../utils`). Under Tauri there is currently no tray at
all (D-06 builds one; it may or may not exist yet depending on plan sequencing — check before
driving this item) and therefore no user action reaches `tauriShowAboutWindow`.

**Repro steps:**
1. **Electron leg:** open the system tray icon's context menu. Confirm "About" (or equivalent) is
   present and confirm clicking it opens the About window with a real, non-`0.0.0` version string.
2. **Tauri leg:** attempt to find ANY user-reachable path to the About window — check the tray icon
   (if D-06's Tauri tray has landed by the time this runs), any settings panel, any menu. Record
   whichever is true: (a) a Tauri tray now exists and About is wired into it — reachable; or (b) no
   Tauri tray exists yet, or one exists but About is not wired into it — confirm structurally
   unreachable, i.e. `NOT ATTEMPTED` because there is genuinely nothing to click, not because
   nobody looked.

**Sink to read:** Neither sink is expected to carry evidence for reachability itself — this is a
visual/UI-navigation check. If the Electron leg's About window opens, note whether the version
string reads a real value or `0.0.0` (the source flags this as the T-34.1-17 regression check,
relevant only under Electron since it was never observable under Tauri at all).

**Electron leg — Observed:** REACHABLE AND WORKING. The tray icon's context menu carries an About
entry, clicking it opens the About window, and the version string renders a real value — operator
read **v0.7**, not the `0.0.0` placeholder. This discharges the T-34.1-17 regression check on the
Electron side (the only side on which it was ever observable, since no Tauri route to this window
has ever existed).

**Tauri leg — Observed:** `NOT ATTEMPTED` — STRUCTURALLY UNREACHABLE, confirmed by census rather
than by failing to find it in the UI.

A Tauri tray DOES exist (it shipped in Phase 34.1 Plan 06), so "no tray" is not the reason. Its
menu, re-read at this commit rather than trusted from the source's line numbers, has exactly two
items:

```rust
MenuItemBuilder::with_id("show", "Show GameLib").build(app),
MenuItemBuilder::with_id("quit", "Quit").build(app),
// Deliberately excludes the recent-games submenu, About/Reload/Debug,
// the macOS dock menu, and ...
```

The exclusion is explicit and deliberate in the source comment. Corroborated from the other
direction: `showAboutWindow`'s ONLY callers in the entire tree are `src/backend/tray_icon/
tray_icon.ts:124` (Electron's tray) and `src/backend/main.ts:744`'s `addListener`. There are ZERO
frontend callers, so no settings panel or menu can reach it either.

**A near-miss worth recording, because it would have produced a false PASS.** The operator first
found a surface reading **v0.70** which, when clicked, showed **0.70 release notes** — and that is
NOT the About window. It is the separate version/changelog feature (`GameChangeLog`,
`HideChangelogOnStartup`). `public/about.html` is four lines long and contains no release notes at
all:

```
GameLib
Version: unknown
License: GPL V3
https://github.com/grayson-mitchell/GameLib
```

Scoring the changelog as the About window would have recorded this item as reachable-and-working on
a surface `tauriShowAboutWindow` never renders. Distinguished by reading `about.html`, not by
argument.

**Verdict:** `NOT ATTEMPTED`

Correct per this document's own rule and per the item's own Tauri-leg branch (b): confirm
structurally unreachable, i.e. `NOT ATTEMPTED` because there is genuinely nothing to click, not
because nobody looked. This is the KNOWN, ACCEPTED gap the source predicted — not a fresh finding,
and explicitly not a fresh Tauri-only bug.

**Input for plan 35-06 (wave 2, which builds the real Tauri tray under D-06):** D-05's rule is that
nothing ships an affordance it cannot honour. The Electron tray HAS an About entry that opens a
working window with a real version string (measured v0.7 on this run, not the `0.0.0` regression).
When 35-06 builds out the Tauri tray it must make a deliberate, recorded choice: wire About in, or
state why the Electron entry is being dropped rather than mirrored. Silently shipping a tray that
omits a sibling affordance is the shape D-05 exists to prevent. Note also that `about.html` ships
the literal string `Version: unknown`, so whatever renders it must inject the real version — the
Electron path does; any new path must be checked, not assumed.

**Severity if TAURI-ONLY:** BLOCKS D-16 GATE **conditionally** — D-16's scope explicitly names
"the newly-built tray/deep-link/wake-lock work" as covered. If D-06's Tauri tray has landed and
still omits About by the time of this A/B run, that is itself a D-05 violation ("nothing ships an
affordance it cannot honor" — though here the affordance is simply missing rather than present-but-
broken, the same rule applies to the sibling Electron-only tray entry it should mirror). If no
Tauri tray exists yet at all, this item is expected and not yet actionable — record `NOT ATTEMPTED`
for the Tauri leg and do not treat it as a fresh finding.

**Notes:** `src-tauri/src/main.rs` (per the source, lines ~18/5852 at time of filing — re-grep
before citing, do not trust the line numbers without re-confirming) records "Deliberately out of
scope: recent-games submenu, About/Reload/Debug, macOS dock menu" for Tauri's tray. If that comment
is still current, this item is a known, accepted gap rather than a surprise — record it as such
rather than as a fresh Tauri-only bug.

---

## Item 6 — Dialog styling: EOS-remove native dialog + oversized path-rejection dialog

**Source (two related, adjacent, but distinct minor UI items — cite both):**
`.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
AND
`.planning/todos/pending/2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md`

**Repro steps, sub-item (a) — EOS overlay removal dialog:**
1. Open a Legendary/Epic game with the EOS overlay installed. Trigger "Remove overlay."
2. Confirm the confirmation dialog appears and functions correctly (this part is known-working —
   the bug is purely visual). Observe whether it renders as an OS-native system dialog (unstyled,
   inconsistent with the rest of the app) or as the app's own in-app-styled `Dialog` component.

**Repro steps, sub-item (b) — path-rejection dialog:**
1. In the Import Games flow (`ImportDialog`'s `PathSelectionBox`), type a relative (non-absolute)
   path and submit.
2. Confirm the path is correctly rejected (this part is known-working — G2-3 already PASSED on its
   own contract) and observe the size/shape of the resulting error dialog: the source describes it
   as an oversized "large text window" model rather than a compact, properly-sized error
   presentation.

**Sink to read:** Neither sub-item is expected to need a log sink — both are purely visual/UI
observations. If anything is logged around either action, note it, but a blank Observed field
citing "nothing logged, both sinks checked" is acceptable here specifically because these are
visual checks, not log-driven ones — say so explicitly rather than leaving it ambiguous.

**Electron leg (sub-item a, EOS dialog) — Observed:** REPRODUCES. Precondition satisfied properly —
the operator **installed the EOS Overlay first**, so the Uninstall control was genuinely present
and this is a real observation rather than an unreachable-surface pass. Clicking Uninstall
(Settings → Advanced → EOS Overlay) raised the confirmation from `eos_overlay.ts:161`'s
`dialog.showMessageBox`.

Rendered as an **OS-native macOS alert**, not the app's styled `Dialog`: a dark-background window
(following the system dark appearance) with **no titlebar and no traffic-light buttons**, carrying
No/Yes buttons in **native macOS button styling**. The absent titlebar/traffic lights and the
system button styling are the identifying signature of an `NSAlert`-backed panel — Electron's
`dialog.showMessageBox` maps to exactly that. Confirms the source document's complaint verbatim:
this is visually inconsistent with the rest of the app.

Nothing was logged to either sink for this action; both were checked. That is expected and
acceptable for this sub-item specifically, because it is a purely visual check rather than a
log-driven one.

**Electron leg (sub-item b, path-rejection dialog) — Observed:** NO DIALOG AT ALL — and this
FALSIFIES THIS SECTION'S OWN PRE-WRITTEN PREDICTION. Operator typed the relative path `foo/bar`
into `ImportDialog`'s `PathSelectionBox` and submitted. Result: **no error message, no dialog, the
window simply closed and nothing happened.** Both sinks checked; nothing user-visible was raised.

The oversized large-text dialog this sub-item was written to observe **does not exist under
Electron**. Confirmed by census, not inference: `pathRejectedTitle` / `pathRejectedBodyMove` /
`pathRejectedBodyImport` and their `showDialogBoxModalAuto` call sites appear in **exactly one
source file across the whole tree** — `src/backend/sidecar/installFlowRegistration.ts` (:169, :322,
:445). That is a SIDECAR file, i.e. the Tauri backend path. Electron does not route through the
sidecar, so no Electron code path can raise it.

What the operator saw under Electron is precisely the **pre-34.6-19 behaviour the source todo
describes in its own Problem section**: "before it, a rejected path produced only a `logError` and
a terminal `done` status, which read as the app doing nothing." Plan 34.6-19's fix for the silent
rejection landed on the sidecar side only and was never mirrored into the Electron path.

**Correction to this section's `Notes:` prediction, recorded rather than quietly overwritten.**
The Notes below predict 6(b) will be BOTH "by construction", reasoning that it "uses the app's own
in-app `showDialogBoxModalAuto` primitive, which exists identically under both shells". The
primitive is indeed shared; the CALL SITE is not. Reasoning from a shared primitive to shared
behaviour skipped the question of whether the caller is shared, and it produced the wrong answer.
The correct expectation is that this sub-item is **TAURI-ONLY** — the dialog can only reproduce
where it exists.

**This is not a defect to fix.** Electron is deleted at plan 35-14; a missing dialog on a path
that ceases to exist needs no remediation. Its value here is threefold: it retires a false
"BOTH by construction" prediction, it means the Electron leg CANNOT serve as an appearance
baseline for this dialog, and it is a concrete instance of the Item 2 generalisation — behaviour
that lives in `main.ts`/sidecar asymmetrically is invisible to a channel-by-channel port audit.

**Tauri leg (sub-item a, EOS dialog) — Observed:** REPRODUCES, IDENTICALLY TO ELECTRON. Operator
drove the same route (Settings → Advanced → EOS Overlay → Uninstall) and reported the presentation
as indistinguishable from the Electron leg: an OS-native macOS alert, not the app's styled
`Dialog`. Consistent with the mechanism — `eos_overlay.ts:161` calls `dialog.showMessageBox`
imported from `'electron'`, which under the sidecar resolves through `electronStub.ts` to a native
dialog on both paths. This half's `Notes:` prediction of BOTH by construction HOLDS.

**Tauri leg (sub-item b, path-rejection dialog) — Observed:** THE DIALOG APPEARS — the inverse of
the Electron leg, and the inverse of this section's own prediction. A relative path submitted in
the Import flow produced an app-raised error carrying `pathRejectedBodyImport` verbatim:

> GameLib couldn't import from that location. The source has to be a full folder path with no
> ".." steps in it. Pick the game's folder again.

That is the exact `gamelib.json` string at `installFlowRegistration.ts:445`, confirming the
rejection path runs here and confirming by observation what the Electron leg established by census:
this code is sidecar-only, so Tauri is the ONLY shell on which it can fire. **Tauri is BETTER than
Electron on this surface, not worse** — the sole such case in this document. Under Electron the
same input produced no dialog at all and the window simply closed, which is the pre-34.6-19 silent
failure the source todo describes in its own Problem section.

*Sub-question still open:* the todo's actual complaint is not that the dialog is absent but that it
uses the OVERSIZED "large text window" model for what is a one-line correction. The dialog's
size/shape was not scored on this run. This does not affect the verdict below — which turns on
existence, measured on both shells — but plan 35-11, which owns the fix, needs the size
observation before it can tell a real defect from a resolved one.

**Verdict:** `BOTH` — for sub-item (a), which is the more severe half and therefore sets this
section's verdict per the field's own instruction.

**THE TWO SUB-ITEMS DIVERGE, and the divergence is the finding.** Stated here rather than buried,
because a single verdict cannot carry it:

| | Electron | Tauri | Sub-verdict |
|---|---|---|---|
| (a) EOS remove dialog | native macOS alert | native macOS alert | `BOTH` |
| (b) path-rejection dialog | **no dialog at all** | dialog appears, correct copy | `TAURI-ONLY` |

Sub-item (a) is `BOTH` and its by-construction prediction held: `dialog.showMessageBox` is imported
from `'electron'` and resolves natively on both paths.

Sub-item (b) is `TAURI-ONLY` **in the opposite direction to every other finding in this document** —
the behaviour is PRESENT under Tauri and ABSENT under Electron. It is not a defect to fix on the
Tauri side; it is 34.6-19's fix working exactly as designed on the only shell that loads the code,
while Electron retains the silent failure that fix was written to eliminate. Nothing is owed here,
because Electron is deleted at plan 35-14 and a missing dialog on a path that ceases to exist needs
no remediation.

**The prediction this section made before observing was WRONG for (b) and RIGHT for (a).** The
`Notes:` below predicted BOTH for both halves "by construction", reasoning that (a) calls Electron's
native dialog directly and (b) uses the shared `showDialogBoxModalAuto` primitive. The reasoning
was sound for (a) and unsound for (b): the primitive is shared, but its CALL SITE is not — it lives
only in `src/backend/sidecar/installFlowRegistration.ts`. Left in place with this correction
alongside it rather than overwritten, so the failure mode stays visible: inferring shared behaviour
from a shared primitive without checking whether the caller is shared.

**Severity if TAURI-ONLY:** Does not block D-16 gate. Both sub-items are explicitly recorded by
their own source documents as cosmetic, UI-polish follow-ups, not port defects — the EOS source
notes a genuine styling landmine underneath (the app's own in-app `Dialog` primitive is itself
unstyled at its base state per a prior 2026-08-20 finding, so a naive "just restyle it" fix would
break 25 other dialogs), and the path-rejection source explicitly states "G2-3 itself passed on its
own contract and is not blocked by this."

**Notes:** These two are almost certainly BOTH-reproducing by construction — sub-item (a) calls
Electron's native `dialog.showMessageBox` directly (a ~14-site systemic pattern, not unique to this
call site), and sub-item (b) uses the app's own in-app `showDialogBoxModalAuto` primitive, which
exists identically under both shells. Neither symptom's mechanism is Tauri-port-specific. Record
what is actually observed regardless of this prediction.

---

## Item 7 — Epic logout reports clearing cookies it does not clear

**Source (dedupe — cite both):**
`.planning/todos/pending/2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md`
AND `.planning/todos/pending/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`

**Disposition already fixed by decision, not yet by code:** D-09 (see `35-CONTEXT.md`) already
decided the fix shape — delete the webview data directory wholesale rather than attempt per-cookie
deletion at the wry layer — and that fix lands in plan 35-09. This item is still worth its own row
because it is the standing, unresolved 34.6 live-gate Step 8 FAIL, and because D-18 wants the
pre-fix baseline recorded on both shells before the fix lands and the comparison becomes moot.

**Repro steps** (transcribed from the source's own live-gate repro — requires a REAL authenticated
Epic session, not a mock):
1. Log into Epic Games through the embedded login webview. Confirm the session is real —
   `legendaryConfig/legendary/user.json` should exist after login.
2. Trigger Epic logout from the UI.
3. Read the app's own self-reported result from the log (expect something like "Legendary logout:
   cleared N epicgames.com cookie(s)").
4. **Independently** re-read the actual on-disk cookie jar — on macOS this is
   `~/Library/HTTPStorages/gamelib-shell.binarycookies` for Tauri (wry/WKWebView), or the
   equivalent Electron session cookie store for the Electron leg (confirm the correct path for
   Electron's `session.fromPartition`-backed store before driving that leg — do not assume it is
   the same file). Compare cookie COUNT for `epicgames.com`-scoped cookies before and after
   logout, and check individual named cookies (`EPIC_SESSION_AP`, `EPIC_LOGIN_ID`, `_tald`,
   `EPIC_DEVICE`, `_epicSID`) for value length — do not read or record actual cookie VALUES,
   length only, per the redact-forward discipline below.
5. Confirm whether the app's self-reported count matches the independently-measured delta. The
   known Tauri symptom: self-reports "cleared 8," independent re-read shows 0 removed, all values
   still non-empty length.

**Sink to read:** `~/Library/Logs/GameLib/gamelib.log` for the `Legendary logout: cleared N
epicgames.com cookie(s)` self-report line and the `cleared storage — localStorage=N,
sessionStorage=N` line (the source notes localStorage clearing DOES appear to work even when
cookie clearing does not — record both independently, do not assume one implies the other).

**Electron leg — Observed:** THE CLEARING WORKS. THE SELF-REPORT DOES NOT EXIST. Those are two
separate findings and the inversion between them is the point of this row.

Precondition: real authenticated Epic session, established earlier in the same session.
`legendaryConfig/legendary/user.json` present (6218 bytes) and the `epicstore` partition store
actively written, both confirmed before the logout was driven.

Independent jar measurement — Electron's store is
`~/Library/Application Support/gamelib/Partitions/epicstore/Cookies` (Chromium SQLite), read out of
band via a `cp` + `sqlite3` snapshot taken before and after, NOT from anything the app reported:

| Measure | Before | After |
|---|---|---|
| Total cookies in partition | 13 | **0** |
| `epicgames.com`-scoped | **8** | **0** |
| `.epicgames.com` / `.www.epicgames.com` / `.ecosec.on.epicgames.com` | 5 / 2 / 1 | 0 / 0 / 0 |
| `EPIC_SESSION_AP` value length | 1310 | absent |
| `EPIC_LOGIN_ID` / `_tald` / `EPIC_DEVICE` / `_epicSID` lengths | 96 / 36 / 32 / 32 | all absent |

`legendaryConfig/legendary/user.json` was deleted. The log shows the CLI side completing:
`(15:44:23) [Legendary]: Logging out: ... legendary auth --delete` followed by
`... legendary cleanup`. So Electron's logout genuinely wipes the jar — **8 of 8 Epic cookies
removed, measured, not self-reported.**

**But NO self-report line was emitted, and this is by construction, not by accident.** Neither
`Legendary logout: cleared N epicgames.com cookie(s)` nor
`cleared storage — localStorage=N, sessionStorage=N` appears anywhere in `gamelib.log`; the sink
was live throughout (last write 15:44, the logout itself is in it). Cause confirmed by reading
`src/backend/storeManagers/legendary/user.ts`: the `wipeSteps` array forks on
`getLoginWindowSeam()`. The `seam === null` (Electron) branch is five bare
`session.fromPartition('persist:epicstore')` clear calls — `clearStorageData`, `clearCache`,
`clearAuthCache`, `clearHostResolverCache`, `clearData` — **none of which log anything about
cookies**. The `logInfo('Legendary logout: cleared ...')` call the repro steps ask for lives
exclusively inside the `seam !== null` (Tauri) branch's `clearEpicCookies` step.

**The inversion, stated plainly:** under Electron the wipe SUCCEEDS and is UNREPORTED; under Tauri
it is REPORTED and (per the source) FAILS. Neither shell has ever had both. The consequence for
this row is that the Electron leg is a valid baseline for the *behaviour* but **cannot** be a
baseline for the *log line*, because that line has no Electron code path.

**Why the two implementations legitimately differ** (relevant to plan 35-09, which owns the fix):
Electron gives Epic its own `persist:epicstore` partition, so a blanket partition wipe is safe and
is what it does — the count going 13 -> 0 rather than 13 -> 5 reflects that it also cleared the
partition's non-Epic entries (hcaptcha, unrealengine), which is correct behaviour for a
partition-scoped store. Tauri has ONE shared cookie jar across Humble/GOG/Amazon/Epic
(T-34.4.1-47), so a blanket wipe is forbidden there and the clear must be domain-scoped — which is
precisely the harder path that is failing. D-09's decision to delete the webview data directory
wholesale must therefore reckon with that sharing; a wholesale delete under Tauri is not the
equivalent of Electron's partition wipe, it is broader.

**Redaction applied (T-35-04):** counts and value LENGTHS only. No cookie value was read or
recorded, no account identifier, no `user.json` contents. Separately noted as a distinct
observation, not chased here: the Electron store held these values with `encrypted_value` empty and
`value` populated — i.e. **in the clear on disk** — which is what makes a surviving 1310-byte
`EPIC_SESSION_AP` a security question rather than a cosmetic one.

**Tauri leg — Observed:** THE RECORDED SYMPTOM DID NOT REPRODUCE. A DIFFERENT, ADJACENT DEFECT DID.

App self-report (`gamelib.log`), both lines, recorded independently as the source requires:

```
(19:02:52) Legendary logout: cleared 9 epicgames.com cookie(s) (measured post-removal delta)
(19:02:52) Legendary logout: cleared storage — localStorage=3, sessionStorage=0,
                             indexedDB=0, caches=0, serviceWorkers=0
```

`legendaryConfig/legendary/user.json` deleted. No `domain-scoped cookie clear removed nothing`
warning fired (that warning is emitted when `deleted === 0`).

Independent measurement of `~/Library/HTTPStorages/gamelib-shell.binarycookies`, parsed as
binarycookies (page table -> per-cookie url/name/path/value offsets) so only LIVE records are
counted. `strings(1)` was tried first and DISCARDED as unsound: a binary jar can retain tombstoned
bytes after deletion, so a name appearing in the file is not evidence of a live cookie — it
initially suggested `EPIC_SESSION_AP` might survive, and the structured parse showed it does not.

| Named cookie | After logout |
|---|---|
| `EPIC_SESSION_AP` | **ABSENT** |
| `EPIC_LOGIN_ID` | PRESENT, value length 96 |
| `_tald` | PRESENT, value length 36 |
| `_epicSID` | PRESENT, value length 32 |
| `EPIC_DEVICE` | PRESENT, value length 32 |

Live Epic-scoped survivors: `.epicgames.com` x4, `.www.epicgames.com` x1 (`__cf_bm`),
`.ecosec.on.epicgames.com` x1 (`__cf_bm`) = **6 on `epicgames.com` suffixes**, plus `EPIC_DEVICE`
on `.fortnite.com`, `.twinmotion.com`, `.unrealengine.com` and `.metahuman.com` — Epic-owned
domains that a suffix filter on `epicgames.com` cannot match by construction. Jar total: 62 live
cookies across all stores (Humble 19+1+1, Amazon 8+2, GOG 3+2, etc.), which is the shared-jar
condition T-34.4.1-47 describes and the reason a blanket wipe is forbidden here.

**What this changes:**

1. **The lying report is FIXED and this run confirms it live.** The source's symptom — "self-reports
   cleared 8, independent re-read shows 0 removed" — did NOT reproduce. `deleted` is now a genuine
   post-removal delta (Plan 23), and 9 cookies really did go, including the session bearer.
2. **`EPIC_SESSION_AP` IS GONE.** This is the specific artefact the pre-written severity call names
   as the blocking harm ("a surviving 219-byte `EPIC_SESSION_AP` means a subsequent Epic login
   webview can silently re-authenticate as the previous user"). Measured absent. **That stated
   mechanism is closed.**
3. **NEW DEFECT: the domain-scoped clear is INCOMPLETE, not inert.** Six live `epicgames.com`
   cookies survive a logout that reported success, including `EPIC_LOGIN_ID` (96 bytes) and
   `_epicSID`. This is a different failure from the one on file — partial rather than total — and it
   is invisible to the current instrumentation, because a non-zero `deleted` count suppresses the
   `removed nothing` warning. A count of what was removed cannot detect what was left.

**MEASUREMENT LIMITATION, stated rather than glossed.** No BEFORE snapshot of the Tauri jar was
taken (one was taken for Electron). So the "9 cleared" figure is corroborated only by the
after-state being consistent with it, not independently verified as a delta. What IS independently
established is the after-state: 6 Epic cookies live, `EPIC_SESSION_AP` absent. Any future re-drive
should snapshot the jar before logging out.

**Verdict:** `TAURI-ONLY` — for the incomplete clear.

Precisely: the item AS WRITTEN (a false report) reproduces on NEITHER shell — Electron emits no
report at all, and Tauri's report is now honest. The defect that IS present is Tauri-only and
adjacent: an incomplete domain-scoped clear. Electron's partition wipe took everything (13 -> 0),
because Epic owns its own `persist:epicstore` partition there; Tauri must filter by domain against
a jar shared with Humble/GOG/Amazon, and the filter misses.

**Severity — the pre-written call's STATED MECHANISM IS FALSIFIED, so it is not applied
mechanically.** The call below says BLOCKS D-16 GATE on the grounds of a surviving
`EPIC_SESSION_AP` enabling silent re-authentication. That cookie is measured absent, so that
specific harm does not obtain. The residual is `EPIC_LOGIN_ID` / `_epicSID` / `_tald` /
`EPIC_DEVICE` — identity and device-linkage values, not the session bearer — which is a materially
lower severity than the call anticipated. **This is flagged for the operator's decision rather than
silently downgraded or mechanically escalated**: neither applying a blocking call whose basis is
disproven, nor dropping a pre-committed severity without saying so, would be honest.

**For plan 35-09, which owns the fix (D-09).** Two concrete constraints this run establishes:
(i) D-09's "delete the webview data directory wholesale" would clear all 62 cookies including
Humble/GOG/Amazon — it is NOT the equivalent of Electron's partition wipe and would sign the user
out of three other stores; (ii) any fix must cover Epic-owned domains that are not
`epicgames.com` suffixes (`fortnite.com`, `unrealengine.com`, `twinmotion.com`, `metahuman.com` all
carry a live `EPIC_DEVICE`), and must add an observable for what REMAINS, since a removed-count
cannot detect a partial clear.

**Redaction applied (T-35-04):** cookie names, domains and value LENGTHS only. No cookie value was
read or recorded; no account identifier appears.

**Severity if TAURI-ONLY:** BLOCKS D-16 GATE. This is explicitly security-relevant on a shared
machine (a surviving 219-byte `EPIC_SESSION_AP` session token means a subsequent Epic login webview
can silently re-authenticate as the previous user) and D-16's scope explicitly names "login" as
covered. This item is structurally plausible as TAURI-ONLY — the known mechanism is wry's in-memory
cookie-deletion API reporting success without the on-disk WKWebView store actually being rewritten,
a wry/WebKit-layer defect with no direct Electron analog (Electron's own `session.clearStorageData`/
`cookies.remove` APIs are a different implementation entirely, and Humble's disconnect path was
already proven fixed under the same Rust arm in Phase 34.4.1 — the open question is whether Epic's
specific call path shares that fix or diverges). Even though D-09 already fixed the disposition on
paper, this row exists to confirm the observable baseline before the plan 35-09 fix lands.

**Notes:** **Redact-forward discipline (T-35-04) applies to this item specifically and is
mandatory, not optional.** Before committing any log excerpt or cookie-jar output for this item:
replace the actual Steam ID / Epic account identifier / any cookie VALUE (not just its length) with
`<redacted>`. Quote the log LINE SHAPE (field names, counts, structure), never raw account-linked
payloads. This item exercises a real, credentialed Epic session — treat its evidence accordingly
before it is committed to this public repo.

---

## After completion — carrying the record forward

Any item whose `Verdict:` comes back `TAURI-ONLY` and whose pre-committed `Severity if TAURI-ONLY:`
says BLOCKS D-16 GATE must be named explicitly in the human operator's reply to the orchestrator, so
plan 35-19's gate document can carry it forward. This document does not auto-propagate anything —
the carrying-forward step is a human action at the end of Task 2, not a mechanism.
