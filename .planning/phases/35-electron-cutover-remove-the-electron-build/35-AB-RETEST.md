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

**Electron leg — Observed:**

**Tauri leg — Observed:**

**Verdict:**

**Severity if TAURI-ONLY:** BLOCKS D-16 GATE. This is a core library-correctness defect directly
inside D-16's explicit gate scope ("install, launch, library, login"). A title that disappears
after an ordinary install/uninstall cycle on the packaged artifact is not acceptable to ship
silently, and 34.13 already accepted 7 items open-not-discharged once before — this should not
become an eighth.

**Notes:** This is the ONLY item in this document with a debug ledger of its own; do not
summarize from memory when driving the repro — the ledger's 2026-08-27 section is authoritative
over its own older, superseded sections (each explicitly marked superseded in the file itself).
Static analysis is recorded as exhausted; only a live, logged reproduction advances this one.

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

**Electron leg — Observed:**

**Tauri leg — Observed:**

**Verdict:**

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

**Electron leg — Observed:**

**Tauri leg — Observed:**

**Verdict:**

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

**Electron leg — Observed:**

**Tauri leg — Observed:**

**Verdict:**

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

**Electron leg — Observed:**

**Tauri leg — Observed:**

**Verdict:**

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

**Electron leg (sub-item a, EOS dialog) — Observed:**
[fill in]

**Electron leg (sub-item b, path-rejection dialog) — Observed:**
[fill in]

**Tauri leg (sub-item a, EOS dialog) — Observed:**
[fill in]

**Tauri leg (sub-item b, path-rejection dialog) — Observed:**
[fill in]

**Verdict:** (one verdict covering both sub-items; if they diverge, say so in Notes and pick the
verdict for the more severe sub-item)

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

**Electron leg — Observed:**

**Tauri leg — Observed:**

**Verdict:**

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
