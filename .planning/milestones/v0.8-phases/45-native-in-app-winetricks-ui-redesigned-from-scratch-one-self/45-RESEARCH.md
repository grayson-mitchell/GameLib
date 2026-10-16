# Phase 45: Native in-app Winetricks UI redesigned from scratch - Research

**Researched:** 2026-10-10
**Domain:** In-app Tauri/Electron-dual-registration UI surface replacing a modal browse panel + a legacy GUI escape hatch; backend-driven install queue; output classification; novice-first information architecture; i18n.
**Confidence:** HIGH (nearly every claim below is a direct `Read`/`grep`/`sed` against the file that will be edited, not a web search — this phase is in-repo surgery, not new-library integration)

## Summary

Phase 45 deletes two things (the Phase 44 `WinetricksBrowse` panel and the `-q --gui` escape
hatch) and builds one thing (a `Winetricks` Settings tab) on top of backend plumbing that mostly
already exists. The three "new mechanism" pieces are: (1) a backend-resident sequential install
queue, for which `installFixes()` in `src/backend/launcher.ts:993-1008` is a working, readable
template — the new queue is that same `for…await Winetricks.install(...)` loop with per-verb
outcome bookkeeping added; (2) backend-side stderr classification, which replaces the single
unconditional `child.stderr.on('data', ...)` handler at `src/backend/tools/index.ts:663-667` that
today sends every line to both `logError` and the user-visible stream undifferentiated; (3) a
derived (not hand-maintained) `needsGui` verb set, computed from which verbs call
`w_download_manual` in the pinned, sha256-verified winetricks script — six verbs, all independently
confirmed by direct read of the script, all of which already sit in categories D-09 hides.

Both IPC transports that register `callTool('winetricks')` must be edited in lockstep —
`src/backend/tools/ipc_handler.ts` (Electron's real `ipcMain`, routed through `backend/ipc`'s
`addHandler`) and `src/backend/sidecar/runnerMiscFlowRegistration.ts` (the Tauri sidecar's own,
separately-registered `ipcMain.handle`, confirmed by that module's own docstring to intentionally
never import the Electron-only handler file). Both currently contain the identical
`case 'winetricks': await Winetricks.run(runner, appName); break` this phase deletes.

The frontend has no existing multi-select/batch-apply UI anywhere in the Winetricks tree today:
`Row/index.tsx` is single-row, single-button, no checkbox, no `selectedVerb` concept — D-10's
checkbox-based batch selection is new frontend surface, not an extension of what's there. The two
tests CONTEXT.md names for porting (`remountSafety.test.tsx`, `winetricksInstallMouseRace.test.tsx`)
both exist on disk in `WinetricksBrowse/__tests__/`, alongside two more
(`WinetricksBrowse.test.tsx`, `rowStates.test.tsx`) not named for porting — treat those two as
retired with the component they cover, confirm with the planner rather than silently dropping them.

**Primary recommendation:** Build the new tab as net-new frontend components under
`src/frontend/components/UI/Winetricks/` (or a sibling directory under `Settings/sections`), wire
it into `GamesSettings/index.tsx` beside the `Wine` tab under the exact `showWineTab && !isCrossover`
gate, extend (never replace) `src/common/winetricks/deriveRowState.ts` and `verbs.ts`, move the
backend queue and stderr classifier into `src/backend/tools/index.ts`'s existing `Winetricks`
object, and delete the GUI hatch from all three places it is registered
(`tools/index.ts Winetricks.run`, `tools/ipc_handler.ts`, `sidecar/runnerMiscFlowRegistration.ts`)
in the same wave so there is never a half-deleted state.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab placement, visibility gate, row rendering | Frontend (Renderer) | — | Pure presentational/interaction logic; `GamesSettings/index.tsx`, `Tools/index.tsx` are renderer-only React |
| Row-state derivation (available/selected/queued/installing/installed/errored) | Common (pure, shared) | Frontend (consumes) | `deriveRowState.ts` is already a pure function imported by the renderer today — extend it, don't fork logic into the component |
| Task-group membership map, curated-8, needs-GUI derivation | Common (pure, shared) | Backend (reads script file) | Membership map (`verbs.ts`) is pure data; needs-GUI derivation requires reading the pinned script file, which only the backend process can do — backend computes the set once, ships it to frontend over existing IPC, frontend never re-derives |
| Batch install queue (sequential `Winetricks.install` per verb) | Backend (Electron main / Tauri sidecar) | — | D-11 explicitly requires this because D-18 keeps the queue alive across a frontend tab unmount; state that must survive a renderer navigation cannot live in renderer memory |
| stderr/stdout classification (curl %, wine fixme/err noise, winetricks warnings, real failures) | Backend | — | The raw lines only exist at the point they're read off the child process (`runWithArgs`'s stdout/stderr handlers in `tools/index.ts`); classifying downstream in the renderer would require re-parsing an already-lossy string stream |
| Environment banner (GPTK / missing deps) | Backend (detects) | Frontend (renders) | `checkDependencies()` already runs backend-side; the banner is backend-reported state rendered passively by the tab |
| Suggested-for-this-game signal gathering (known-fixes, PCGamingWiki) | Backend (existing IPC) | Frontend (consumes) | `getKnownFixes`/`getWikiGameInfo` are already backend IPC handlers; no new data source needed, per CONTEXT.md's own code_context note |
| Winetricks script metadata (publisher/year/media/homepage) | Backend (reads local file) | Common (parser) | Only the backend process has filesystem access to the pinned script at `~/Library/Application Support/GameLib/tools/winetricks`; parsing can be a pure function but must be invoked backend-side |
| Localisation strings | Frontend (consumes via i18next) | — | `gamelib.json` is loaded client-side; no backend involvement beyond the locale JSON files themselves |
| GUI-hatch removal | Backend (2 IPC registration files + `Winetricks.run`) | Frontend (button + state removal) | Must be removed from both IPC transports (Electron `ipc_handler.ts`, Tauri `runnerMiscFlowRegistration.ts`) and the frontend `Tools` card button/mount in the same change |

<phase_requirements>
## Phase Requirements

No Phase 45 requirement IDs exist in `.planning/REQUIREMENTS.md` at research time
`[VERIFIED: .planning/REQUIREMENTS.md — grep for "Phase 45" / "### Phase 45" returned no match]`.
`.planning/ROADMAP.md`'s Phase 45 entry itself states requirements as **TBD**
`[CITED: .planning/ROADMAP.md, Phase 45 entry]`. The planner should mint requirement IDs from
CONTEXT.md's D-01..D-22 decisions directly (each decision below is already a testable unit); there
is no pre-existing REQ-45-* table to map against.

| ID | Description | Research Support |
|----|-------------|------------------|
| (none minted yet) | Planner mints REQ IDs from D-01..D-22 | See `## Validation Architecture` below for a decision→test mapping that can seed the REQ table |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The surface is a new `Winetricks` tab in the per-game Settings tab strip, beside
  `Wine` (`Wine | Winetricks | Other | Advanced | …` in
  `src/frontend/screens/Settings/sections/GamesSettings/index.tsx`). Not a modal, not a dedicated
  route.
- **D-02:** Single column inside the tab's one scroll container, with a sticky bottom action bar
  (`N selected · Apply` at rest, carries run progress while a queue is in flight). No two-pane
  catalog/basket layout. One scroll container only — Phase 44's nested-scroll trap (P-7) must not
  recur.
- **D-03:** Visibility mirrors today's Tools-card gate exactly: shown only for a real installed
  game (not Game Defaults), not on Windows, with a runner, and not when a CrossOver bottle is
  selected (the Wine tab hides `<Tools />` under `!isCrossover`). The Tools card loses its
  `Winetricks` button; `Winecfg` and `Run EXE` stay.
- **D-04:** `src/frontend/components/UI/Winetricks/index.tsx` (the `ProgressDialog` host) and
  `WinetricksBrowse/` are replaced, not adapted. `remountSafety` and `winetricksInstallMouseRace`
  tests encode findings that still apply and should be ported, not deleted.
- **D-05:** Three tiers, top to bottom: (1) `Suggested for this game`, open; (2) hand-named,
  plain-language task groups (working names: `Runtimes & frameworks`, `DirectX & graphics`,
  `Fonts`, `Media & codecs`, `Wine settings`); (3) `Everything else`, collapsed, with search.
  Upstream's five raw category headers (`DLLS 328` etc.) are gone.
- **D-06:** `Suggested for this game` is never empty. Sources, in display order: game-specific
  known-fixes verbs (`readKnownFixes`/`getKnownFixes`), verbs derived from PCGamingWiki
  `direct3DVersions` (e.g. `9` → `d3dx9`), then the curated 8 (`CURATED_WINETRICKS_VERBS`) under a
  `Commonly needed` heading. When no per-game signal exists, the group shows the curated 8 alone.
- **D-07:** Task-group membership is a hand-maintained map in `src/common/winetricks/verbs.ts`
  (same discipline as the curated constant: unit-tested against the committed parser fixture). A
  verb in a task group also appears in `Everything else`; groups are shortcut views, not a
  partition. Exact group names/membership are the UI-SPEC's and planner's call within D-05's
  working set.
- **D-08:** Family-level descriptions, keyed by verb prefix, roughly 12-15 strings: `vcrun*`,
  `dotnet*`, `d3dx*`/`d3dcompiler*`, `dxvk*`, fonts (`corefonts`, `tahoma`, …), `xact`/`xinput`,
  `physx`, `vb*run`, media/codecs (`wmp*`, `quartz`, `mf`), and the kept settings verbs. Every row
  in `Suggested` and the task groups shows its family sentence; `Everything else` rows show the
  upstream `title`. Rows also show `publisher · year` where the script provides them. Per-verb
  descriptions and upstream-only text were rejected. Reversibility: costly (48 hand-filled locale
  entries per string; re-keying later re-bills the whole fill).
- **D-09:** Hidden entirely: the `apps` category (57), the `benchmarks` category (8), `annihilate`,
  and the interactive tool launchers filed under `settings` (`winecfg`, `regedit`, `taskmgr`,
  `explorer`, `uninstaller`, `winecmd`, `shell`, `folder`, …). Kept: install-shaped settings verbs
  (`fontsmooth=*`, `videomemorysize=*`, `csmt=*`, `vd=*`, …) under their own task group.
- **D-10:** A real checkbox selects an available row. An installed row has no checkbox: its slot
  renders a check icon plus `Installed`, and the row is not selectable. A tick means exactly one
  thing — will be installed when `Apply` is pressed — never a status badge. Pre-ticked-and-locked
  installed rows and glyph-less tap-to-toggle rows were rejected.
- **D-11:** Apply runs a GameLib-driven queue: `Winetricks.install` once per verb, in selection
  order — the pattern `installFixes()` in `src/backend/launcher.ts` already uses. Each verb keeps
  its own `installing-winetricks-component` start/end events and its own `progressOfWinetricks`
  stream. A single `winetricks -q a b c` invocation was rejected (attribution would depend on
  parsing `Executing w_do_call` lines). Accepted cost: winetricks' own startup per verb.
  Reversibility: costly — the queue must live in the backend because of D-18 (the tab unmounts
  mid-run); moving it later means re-cutting the IPC surface.
- **D-12:** A failure does not stop the queue. Verb 2 of 5 failing leaves verbs 3-5 running; the
  failed row shows `Install failed` with `Retry`, the others reach `Installed`, and the sticky bar
  ends with a summary of the shape `4 installed · 1 failed`. Stop-at-first and dependency-aware
  stopping were rejected.
- **D-13:** Selection is locked while a run is in flight. Checkboxes disable, the bar shows
  progress, and a `Cancel remaining` control drops the not-yet-started verbs; the in-flight verb
  finishes. Appending to a running queue was rejected (no backend queue exists today; deferred).
- **D-14:** Per-row phase word plus the sticky bar; the raw log behind a disclosure. The running
  row shows a short phase derived from classified output — `Downloading 42%` (from curl progress
  lines), `Installing…`, `Done`; the bar reads `Installing 2 of 5 · <family title>`. The classified
  log stays available under `Show details`, collapsed by default. Nothing is red unless a real
  error occurred. Bar-only and always-visible-log were rejected.
- **D-15:** Output classification happens in the backend, at the seam that today sends every
  stderr line to both `logError` and `appendMessage` (`src/backend/tools/index.ts` `runWithArgs`,
  the `child.stderr.on('data')` handler). Classes the frontend must distinguish: curl progress (→
  percentage, never logged at ERROR), wine `fixme:`/`err:` noise (→ details log only, not red),
  winetricks' own warnings (→ environment banner, D-16), real failures (→ row `Install failed` +
  red in details). The measured 846 `[ERROR]` lines per session, 40% of them noise, is the number
  this decision exists to remove.
- **D-16:** One persistent, non-red environment banner at the top of the tab whenever the backend
  has reported an environment warning for this bottle: the macOS GPTK "wine 7.7 is unsupported
  upstream" notice gets copy saying it is expected and harmless; missing dependencies
  (`cabextract`, `7z`, `unzip`, `curl`, `zenity` per `checkDependencies`) say what to install. Never
  auto-dismisses, never styled as an error. Details-only and per-run dismissible notices were
  rejected.
- **D-17:** The `Open Winetricks GUI` hatch is removed outright: the button, `Winetricks.run`, the
  `['-q', '--gui']` invocation, the `callTool({tool:'winetricks'})` route in
  `src/backend/tools/ipc_handler.ts`/`runnerMiscFlowRegistration.ts`, and the `guiOpen` state. The
  hand-written 8-verb `NEEDS_GUI_WINETRICKS_VERBS` list is retired in favour of a set derived from
  the verbs that call `w_download_manual` in the pinned script (`20260125-next`, sha256
  `f35c2973…`), asserted by a test against that script. All six such verbs (`foobar2000 utorrent
  3dmark03 3dmark06 stalker_pripyat_bench unigine_heaven`) are in categories D-09 hides anyway;
  `fontxplorer` and `ubisoftconnect` are `apps` and hidden too. Live arm owed: confirm
  `gdiplus_winxp` (`media="manual_download"` but ordinary `w_download`, in the visible `dlls`
  category) installs unattended under `-q`. Reversibility: costly.
- **D-18:** A run outlives navigation. Switching tabs or leaving Settings mid-run neither warns nor
  cancels; the backend queue continues, and on return the tab rebuilds row states from the live
  install events plus a fresh `winetricksListInstalled` read. The game page's existing
  `label.winetricks` ("Installing Winetricks Packages") status is reused so progress is visible
  elsewhere. Warn-before-leaving and cancel-on-leave were rejected.
- **D-19:** D-08 and D-17 need per-verb fields `list-all` does not emit (`publisher`, `year`,
  `media`, `conflicts`, `homepage`, and the `w_download_manual` signal). Researcher decides whether
  to parse `w_metadata` blocks from the already-downloaded script (no wine invocation) or extend
  `winetricksListParse.ts`; constraint is no additional wine invocation on tab open beyond today's
  `list-all`. **Researcher's answer: parse the pinned script file directly — see Architecture
  Patterns below.**
- **D-20:** New strings go in `public/locales/en/gamelib.json`, never `translation.json`. The
  48-locale fill is a dedicated task inside this phase, hand-filled (`machine-fill-gamelib` is dead
  under the gateway key), gated on `lintTranslations` and `gamelibCatalogParity` going green — same
  stance as Phase 44 D-08/D-10. Of the 13 frozen `winetricksBrowse` keys, reuse those that still
  apply (`installedTag`, `installFailedTag`, `retry`, `cachedTag`, `curatedGroup`,
  `searchPlaceholder`, `zeroResultHeading`, `clearSearch`, `resultsHeading_*`, `emptyHeading`,
  `emptyBody`); `needsGuiTag` and `installingRow` lose their surface. `translation.json`'s
  `winetricks.openGUI` loses its only consumer. Removing a key touches 47 `translation.json` dirs
  vs 49 `gamelib.json` dirs and `_one` plural forms are load-bearing — grep every consumer first.
- **D-21:** Verification = component tests + one live gate, and the live gate spot-checks one light
  and one dark theme. The live gate must observe: a real multi-verb Apply on a real bottle running
  to completion with the tab staying mounted through every start/finish transition; one induced
  failure continuing the queue (D-12); the environment banner visible on macOS GPTK (D-16); the
  `gdiplus_winxp` arm (D-17). Tokens: no `--navbar-*` or `--text-hover` consumption on this surface;
  use `--accent`/`--success`/`--danger` aliases, never raw `--status-*`; every custom property
  carries a fallback chain.
- **D-22:** Phase 44 bookkeeping. `ROADMAP.md:5351` already reads `⛔ SUPERSEDED BY PHASE 45
  (2026-09-18)`. Whatever remains in `STATE.md`, `44-LIVE-GATE.md` (`status: in-progress`) and
  `44-VALIDATION.md` (`status: draft`) is closed by **hand-edit only** — never via `gsd-sdk
  state.*`/`roadmap.*`/`phase.complete`/`query commit`, which previously truncated ~99,000 chars of
  STATE.md.

### Claude's Discretion

- Where the search field sits within `Everything else` (and whether it also filters the task
  groups), the ≥2-character threshold, and ordering inside `Everything else` (Phase 44 D-14's
  parser order is the default).
- The exact task-group names and membership map (within D-05/D-07), and the exact family-prefix
  table (within D-08).
- The backend queue's IPC shape (one `winetricksInstallMany`-style invoke carrying the ordered
  list, versus the frontend driving sequential sends), subject to D-11's backend-resident
  constraint and D-18.
- `Cancel remaining` semantics for the in-flight verb (finish vs kill) — default is finish.
- How `conflicts` metadata (e.g. `vcrun2019` vs `vcrun2022`) is surfaced at Apply time, if at all in
  this phase.
- File/module layout under the new tab, and how the pure seams in `src/common/winetricks/` are
  extended (`deriveRowState` gains `selected`/`queued` inputs; `needsGui` becomes derived).

### Deferred Ideas (OUT OF SCOPE)

- Appending to a running queue (ticks during a run join the tail) — rejected for this phase; needs
  a queue with a `queued` row state and a `Cancel` that understands it.
- A game-page shortcut into the tab and a launch-failure prompt linking to it — both offered as
  entry points and not chosen; the second needs a launch-outcome hook.
- CrossOver bottles and always-visible-with-explanation — rejected visibility options; revisit only
  with a tested CrossOver path.
- Dependency-aware stop on failure using `conflicts`/`w_call` metadata — rejected; upstream
  metadata is unreliable in both directions.
- Winecfg / Run EXE moving into the new tab — not discussed; stays on the Tools card.
- Per-verb descriptions beyond the family level — rejected on localisation cost; revisit if a
  specific family sentence proves misleading for one verb.
</user_constraints>

## Standard Stack

No new external packages. This phase is entirely in-repo: existing `winetricks` shell script
(already downloaded/pinned per-user at `~/Library/Application Support/GameLib/tools/winetricks`),
existing React/MUI/FontAwesome frontend stack, existing Node backend. `## Package Legitimacy Audit`
is not applicable and is omitted below per the template's own instruction to state absence
explicitly rather than silently omit.

**No `npm install` step for this phase.**

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────── Renderer (React, per-game Settings) ───────────────┐
│  GamesSettings/index.tsx                                           │
│    <Tabs>  Wine | Winetricks(NEW) | Other | Advanced | ...          │
│                 │                                                   │
│                 ▼                                                   │
│   New Winetricks tab component tree                                 │
│     - Suggested group (always open)                                 │
│     - 5 task groups (collapsed, FilterFacetGroup-pattern disclosure)│
│     - Everything else (collapsed, search ≥2 chars)                  │
│     - Sticky bottom bar (selection count / in-flight / done summary)│
│     - Log disclosure (160px fixed, own scroll, outside main scroll) │
│                 │  ▲                                                │
│      checkbox ticks│  │ IPC events: installing-winetricks-component,│
│      Apply/Cancel  │  │ progressOfWinetricks, winetricksInstalled   │
│                 ▼  │                                                │
└─────────────────┼──┼──────────────────────────────────────────────┘
                   │  │  preload/api/wine.ts (makeHandlerInvoker /
                   │  │  makeListenerCaller / frontendListenerSlot)
┌──────────────────▼──┴──────────────── Backend (Electron main /    ─┐
│                                         Tauri sidecar, DUAL reg.)   │
│  ipc_handler.ts (Electron ipcMain)        wineToolsFlowRegistration │
│  runnerMiscFlowRegistration.ts (sidecar)  .ts (sidecar)             │
│       winetricksInstall (send) ──────────────┐                      │
│       winetricksAvailable (invoke)            │                     │
│       winetricksInstalled (invoke)            ▼                     │
│                                     Winetricks.install() [SINGLE-   │
│                                     FLIGHT TODAY — queue wraps this] │
│                                          │                           │
│                                          ▼                           │
│                              runWithArgs() spawns `winetricks -q X` │
│                                   stdout ──► appendMessage (keep)    │
│                                   stderr ──► CLASSIFY (new, D-15)    │
│                                          │        │                  │
│                                          ▼        ▼                  │
│                              progressOfWinetricks  logError (backend │
│                              (classified payload)   only, unchanged) │
└──────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
       ~/Library/Application Support/GameLib/tools/winetricks (pinned
       script, sha256-verified) — source of w_metadata (publisher/year/
       media/homepage/w_download_manual) AND the executable itself
```

### Recommended Project Structure

```
src/frontend/components/UI/Winetricks/              # tab-body components (new tree; old
├── index.tsx              # replaces today's ProgressDialog host — becomes                 ← replaced
│                            the tab's top-level state owner (installing, logs, selection)
├── SuggestedGroup/        # always-open group (D-06)
├── TaskGroup/             # one collapsible group, 5 instances (D-05/D-07), COPIES the
│   └── index.tsx          # FilterFacetGroup *pattern* under this tab's own CSS scope —
│                           # never imports NavShell/components/FilterFacetGroup directly
├── EverythingElseGroup/   # collapsed, search ≥2 chars
├── Row/                   # extend existing Row/index.tsx with a checkbox trailing slot
├── StickyBar/             # rest / in-flight / done states (D-02/D-11-14)
├── LogPanel/              # 160px fixed, own scroll (D-14)
├── EnvironmentBanner/     # D-16
└── __tests__/
    ├── remountSafety.test.tsx         # ported from WinetricksBrowse/__tests__/
    └── winetricksInstallMouseRace.test.tsx  # ported from WinetricksBrowse/__tests__/

src/common/winetricks/
├── verbs.ts               # EXTEND: add task-group membership map (D-07), keep
│                           # CURATED_WINETRICKS_VERBS; retire hand-written NEEDS_GUI_* list
├── deriveRowState.ts       # EXTEND: add selected/queued inputs
└── metadata.ts             # NEW (researcher recommendation) — parses w_metadata blocks
                            # from the pinned script; pure function, backend calls it

src/backend/tools/
├── index.ts                # EXTEND: Winetricks.install queue wrapper, stderr classifier
│                           # in runWithArgs; DELETE Winetricks.run
├── winetricksListParse.ts  # unchanged (list-all parser) — metadata.ts is additive, not a
│                           # replacement, since D-19 forbids a second wine/script invocation
│                           # beyond today's list-all but reading the already-downloaded
│                           # script file is not a wine invocation
├── ipc_handler.ts           # DELETE the 'winetricks' case in callTool
└── __tests__/winetricksListParse.test.ts  # extend fixtures if metadata.ts is colocated here

src/backend/sidecar/
├── runnerMiscFlowRegistration.ts  # DELETE the 'winetricks' case in callTool (sidecar copy)
└── wineToolsFlowRegistration.ts   # unchanged registration shape for winetricksInstall/
                                    # winetricksAvailable/winetricksInstalled — extend payload
                                    # shape if the queue needs a new invoke (Claude's Discretion)
```

### Pattern 1: Backend-resident sequential install queue

**What:** A `for (const verb of verbs) { await Winetricks.install(runner, appName, verb) }` loop
that lives in the backend process so it survives the renderer tab unmounting (D-18).
**When to use:** The batch Apply action (D-11).
**Example — the exact pattern already shipping in this codebase:**
```typescript
// Source: src/backend/launcher.ts:993-1008 (installFixes) — read directly this session
const knownFixes = readKnownFixes(appName, runner)
if (!knownFixes) return
if (knownFixes.winetricks) {
  sendGameStatusUpdate({ appName, runner, status: 'winetricks' })
  for (const winetricksPackage of knownFixes.winetricks) {
    await Winetricks.install(runner, appName, winetricksPackage)
  }
}
```
`[VERIFIED: src/backend/launcher.ts:993-1008]` — quoted verbatim from a direct `Read` this
session. The D-11 queue is this loop, extended to (a) accept an ordered list from the renderer
instead of `knownFixes.winetricks`, (b) record each verb's outcome (installed/failed) rather than
discard it, (c) support "drop not-yet-started verbs" for `Cancel remaining` (D-13), and (d) not
stop on a failure (D-12, unlike `installFixes` which has no failure handling to stop on in the
first place).

### Pattern 2: Backend-side output classification (replaces the frontend's substring classifier)

**What:** D-15 requires classification to move from the frontend's generic `ProgressDialog` (which
does a case-insensitive `' err'` / `' warn'` substring test on every line) to the backend, at the
exact point raw lines are read off the child process.
**Current code being replaced/extended, read directly this session:**
```typescript
// Source: src/frontend/components/UI/ProgressDialog/index.tsx:68-89 (the classifier D-15 retires)
// line.toLowerCase().includes(' err') -> 'log-error'
// line.toLowerCase().includes(' warn') -> 'log-warning'
// else -> 'log-info'
```
```typescript
// Source: src/backend/tools/index.ts:663-667 (the firehose D-15 replaces) — read directly
// child.stderr.on('data', (data) => { logError(data, ...); appendMessage(data) })
// -- EVERY stderr line goes to BOTH logError and the user-visible stream, unconditionally,
// with no classification at all.
```
`[VERIFIED: src/backend/tools/index.ts:663-667 and src/frontend/components/UI/ProgressDialog/index.tsx:68-89]`
The new classifier lives at the first site (backend) and must be able to distinguish, per D-15: curl
progress lines (→ percentage), wine `fixme:`/`err:` noise (→ details-only, never red), winetricks'
own warnings (→ feed the environment banner, D-16), and real failures (→ row `Install failed`).
`attributeProgressEvent()` in `src/common/winetricks/deriveRowState.ts` already does a related
`' err'`-substring check on progress payloads to attribute errors to the currently-installing verb
— that function's job (attribution) is distinct from classification (severity), but both consume
the same raw line stream, so the new classifier's output shape should be designed to flow through
`attributeProgressEvent` without a second parse pass.

### Pattern 3: `w_metadata` parsing for publisher/year/media/homepage/w_download_manual (D-19)

**What:** `winetricksListParse.ts`'s `parseWinetricksListAll()` only extracts `{verb, title,
category, cached}` from `list-all` stdout — confirmed by direct read of the parser (109 lines) and
of `WinetricksComponent`'s type definition.
`[VERIFIED: src/common/types.ts:859-864]` — quoted verbatim:
```typescript
WinetricksComponent {
  verb: string
  title: string
  category: string
  cached: boolean
}
```
D-19 resolves the "no second wine invocation" constraint by having the backend read the
**already-downloaded script file** (no process spawn) and regex-extract each `w_metadata` block.
Confirmed directly against the pinned script (sha256 `f35c29737ca08a583569e6a3752d52fbe23333c5acfad5f16c4177d25eaf3f4b`,
exact match to CONTEXT.md's `f35c2973…`
`[VERIFIED: ~/Library/Application Support/GameLib/tools/winetricks, shasum -a 256]`):
```bash
# Example w_metadata block, read verbatim this session via sed -n at the real script
# load_gdiplus_winxp()'s metadata header:
w_metadata gdiplus_winxp dlls \
    title="MS GDI+" \
    publisher="Microsoft" \
    year="2009" \
    media="manual_download" \
    file1="WindowsXP-KB975337-x86-ENU.exe" \
    installed_file1="${W_SYSTEM32_DLLS_WIN}/gdiplus.dll"
```
`[VERIFIED: ~/Library/Application Support/GameLib/tools/winetricks, sed -n over the gdiplus_winxp block]`
A pure parser for this shape belongs in `src/common/winetricks/` (new `metadata.ts`) so it is
unit-testable against a committed fixture, same discipline as `winetricksListParse.ts`; only the
**call site** that reads the script file from disk needs to be backend-side.

**Field coverage (directly measured against the pinned script, 567 `w_metadata` lines total):**
title 587, publisher 435, year 434, media 433, installed_file1 348, installed_exe1 45, homepage 42
occurrences of the field name `[VERIFIED: ~/Library/Application Support/GameLib/tools/winetricks,
grep -oE counts]`. This is close to, but not byte-identical to, ROADMAP.md's cited 580/434/433/
431/347/45/42 — the small deltas are most likely a methodology difference in the grep (my count
counts the field-name token itself, not distinct verbs), not a contradiction; both counts agree on
the qualitative point D-08 relies on: most verbs have a title, roughly 3/4 have publisher/year/
media, under a third have a resolvable installed-file marker, and homepage is rare (42/567).

### Pattern 4: Deriving the needs-GUI set from `w_download_manual` callers (D-17)

**What:** Confirmed directly by grep over the pinned script: exactly six verbs call
`w_download_manual` — `3dmark03 3dmark06 foobar2000 stalker_pripyat_bench unigine_heaven utorrent`
`[VERIFIED: ~/Library/Application Support/GameLib/tools/winetricks, grep -B30 "w_download_manual"
piped through w_metadata-line extraction]` — an exact match to CONTEXT.md D-17's six-verb claim and
to the ROADMAP's folded finding (c). All six are in `apps`/`benchmarks` categories D-09 already
hides.

**`fontxplorer` and `ubisoftconnect` do NOT call `w_download_manual`** — both use ordinary
`w_download` and are only reachable via silent-install flags in their function bodies, confirmed by
reading the function bodies directly (not just the `w_metadata` header, closing a gap left open
earlier this session):
```bash
# Source: pinned winetricks script, load_fontxplorer() — read verbatim via sed -n
load_fontxplorer()
{
    w_download https://web.archive.org/web/.../Font_Xplorer_122_Free.exe <sha256>
    w_try_cd "${W_CACHE}/fontxplorer"
    w_try "${WINE}" Font_Xplorer_122_Free.exe ${W_OPT_UNATTENDED:+/S}
    w_killall "explorer.exe"
}
# Source: pinned winetricks script, load_ubisoftconnect() — read verbatim via sed -n
load_ubisoftconnect()
{
    w_download https://ubistatic3-a.akamaihd.net/orbit/launcher_installer/UbisoftConnectInstaller.exe
    w_try_cd "${W_CACHE}/${W_PACKAGE}"
    w_try "${WINE}" UbisoftConnectInstaller.exe ${W_OPT_UNATTENDED:+ /S}
}
```
`[VERIFIED: ~/Library/Application Support/GameLib/tools/winetricks, load_fontxplorer and
load_ubisoftconnect function bodies — read directly this session]`. Both are hidden by D-09's
`apps` category hide anyway, so this does not change the derived needs-GUI set, but it does confirm
CONTEXT.md's parenthetical claim ("fontxplorer and ubisoftconnect are apps and hidden too") is
accurate and that the derivation rule (callers of `w_download_manual`) is the right one — these two
verbs are a silent-install-flag pattern, not a GUI-required pattern, and must NOT be added to the
derived needs-GUI set by a future maintainer who sees them lacking an `installed_exe1`/
`installed_file1` marker and assumes they need one.

### Anti-Patterns to Avoid

- **Re-deriving the needs-GUI set by hand, or by any heuristic other than `w_download_manual`
  callers.** D-17 explicitly retires the hand-written list for exactly this reason — it drifts
  silently from the script's actual behavior.
- **Classifying output in the frontend.** D-15 is explicit that classification is a backend
  concern; the frontend should only ever receive an already-classified payload shape, never a raw
  line it has to re-parse.
- **Importing `NavShell/components/FilterFacetGroup` directly instead of copying its pattern.**
  This codebase has been burned twice by exactly this (`Dropdown` styling leaking into its panel's
  contents; the unscoped `.MuiTabs-root` leak in 34.10) — UI-SPEC's own "Component carry-forward
  note" names this risk explicitly for this phase's task-group headers, which visually imitate
  `FilterFacetGroup` but must live under this tab's own CSS scope and must not consume the
  `--navbar-*` chain that component's real styling uses on its home surface.
- **A single `winetricks -q verb1 verb2 verb3` invocation for "efficiency."** D-11 explicitly
  rejected this: per-verb attribution would require parsing `Executing w_do_call` lines out of a
  merged stream, which is strictly worse than today's single-flight-per-verb model.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential multi-verb install with per-item outcome | A new async queue abstraction from scratch | `installFixes()`'s `for…await` loop pattern in `launcher.ts:993-1008`, extended | Already proven, already uses the exact `Winetricks.install` single-flight primitive; a new abstraction risks reintroducing the single-flight race the existing guard already closes |
| needs-GUI verb detection | A hand-maintained list (what D-17 retires) or a heuristic on `media="manual_download"` (proven unreliable — `gdiplus_winxp`/`protectionid` both set it without needing a GUI) | Grep the pinned script for `w_download_manual` callers at build/test time, assert via a committed test, derive the runtime set from that | Only `w_download_manual` callers are the real GUI-required set; `media` field is noise (confirmed directly: `gdiplus_winxp`'s `media="manual_download"` uses ordinary `w_download`, not `w_download_manual`) |
| Disclosure/collapsible group header with caret + count badge | A new disclosure component | Copy `FilterFacetGroup`'s *contract* (real `<button aria-expanded>`, caret rotation, count badge, `--neutral-05` border) under this tab's own CSS scope | The underlying primitive already exists and is already accessible; re-implementing risks missing the `aria-expanded` requirement or the CSS-scope lesson |
| Mousedown→click race protection on checkboxes/buttons | A new event-handling scheme | The mousedown-capture + `suppressNextClick` technique `winetricksInstallMouseRace.test.tsx` already encodes | UI-SPEC's own Interaction Contract item 2 says this is independent of the specific trigger mechanism and must be carried forward unchanged |

**Key insight:** almost nothing in this phase is a genuinely new technical problem — it is
re-assembling existing, individually-proven primitives (`Winetricks.install`, `deriveRowState`,
`FilterFacetGroup`'s pattern, `installFixes()`'s loop) into a new UI shape. The risk surface is
therefore mostly in the *wiring* (both IPC registration files, the CSS-scope discipline, the
survive-navigation state rebuild) rather than in any single new algorithm.

## Common Pitfalls

### Pitfall 1: Editing only one of the two IPC registration paths

**What goes wrong:** `callTool('winetricks')` is registered identically in TWO places —
`src/backend/tools/ipc_handler.ts` (Electron's real `ipcMain`, via `backend/ipc`'s `addHandler`)
and `src/backend/sidecar/runnerMiscFlowRegistration.ts` (the Tauri sidecar's own direct
`ipcMain.handle` call). Deleting the route from only one leaves it reachable from whichever runtime
still has it.
**Why it happens:** The sidecar module's own docstring states its curated import graph
deliberately never reaches `tools/ipc_handler.ts` — the duplication is intentional architecture,
not an oversight, so a search that stops at the first hit misses the second.
**How to avoid:** Grep both files for `'winetricks'` (the `case` label) before considering the
deletion complete; the plan's verify step should assert neither file contains the string
`Winetricks.run` afterward.
**Warning signs:** A live-gate test that still shows a GUI launching after the button is removed
from the UI (the sidecar path was left intact).

### Pitfall 2: Breaking the remount-safety invariant when building the new tab

**What goes wrong:** The retired `index.tsx`'s mount condition for `WinetricksBrowse` is `!declined`
**only** — never gated by `installing` or any revalidation flag. The comment at
`src/frontend/components/UI/Winetricks/index.tsx:226-233` documents this explicitly as a historical
bug fix (`366e719bb`) that was only half-closed once already (covered the `installing` trigger, not
the post-install revalidation trigger). The new tab inherits D-18's stronger requirement (survive
full navigation, not just an install starting) — the same mistake is easy to reintroduce if the new
component's mount condition is written fresh without consulting that history.
**Why it happens:** It is intuitive to think "don't show the list while revalidating," but doing so
unmounts and remounts a list the user may be mid-interaction with.
**How to avoid:** Port `remountSafety.test.tsx` first, make it pass against the new component
before writing new mount-gating logic, and keep the gate to `!declined` only.
**Warning signs:** A row the user just ticked silently loses its selection after an install starts
or finishes.

### Pitfall 3: `media="manual_download"` is not a reliable GUI-required signal

**What goes wrong:** A future maintainer "fixing" the needs-GUI derivation might reach for the
`media` field since it reads like it means "needs manual intervention." Confirmed directly:
`gdiplus_winxp` and `protectionid` both set `media="manual_download"` but use ordinary `w_download`
(auto-downloadable), while the real needs-GUI signal is specifically a call to
`w_download_manual`. `fontxplorer` and `ubisoftconnect` set `media="download"` (not
`manual_download`) yet still rely on `${W_OPT_UNATTENDED:+/S}` silent-install flags rather than
`w_download_manual` — three different field/behavior combinations for what looks like one concept.
**Why it happens:** The field name is misleadingly close to the actual mechanism name.
**How to avoid:** Derive exclusively from `w_download_manual` call sites (D-17's explicit rule);
do not special-case on `media`.
**Warning signs:** A verb like `gdiplus_winxp` incorrectly loses its checkbox (CONTEXT.md's "live
arm owed" item exists specifically to confirm this verb installs unattended and should keep its
checkbox).

### Pitfall 4: Sorted-JSON key insertion changes the wrong diff line

**What goes wrong:** Inserting a new key that sorts last in a JSON object changes the *previous*
line's trailing comma, so a diff reads as `2 changed, 1 added` rather than the `1 added, 0 changed`
a reviewer expects.
**Why it happens:** `gamelib.json`'s keys are kept alphabetically sorted; JSON has no trailing-comma
syntax, so the line before the new last key must gain a comma.
**How to avoid:** Expect and accept the two-line diff for every alphabetically-last insertion;
don't treat it as an accidental edit.
**Warning signs:** A code-review tool or gate that asserts "exactly N lines added" fails on an
otherwise-correct locale fill.

### Pitfall 5: `translation.json` key removal touches more locales than `gamelib.json`

**What goes wrong:** D-20 requires removing `winetricks.openGUI` from `translation.json`.
`translation.json` exists in 47 locale directories; `gamelib.json` exists in 49
`[CITED: CONTEXT.md D-20, which cites this exact count and pairs it with the `_one` plural-form
load-bearing warning]`. Assuming the two catalogs' locale directory sets are identical when writing
a bulk removal script will silently skip or error on the 2-directory delta.
**Why it happens:** `gamelib.json` is the newer catalog (added for Phase 44+) and was rolled out to
2 more locale directories than `translation.json` ever had.
**How to avoid:** Grep every consumer of the key being removed first, across all locale dirs
actually present for that specific catalog file, before writing the removal; do not assume locale
dir parity between the two catalogs.
**Warning signs:** A removal script exits 0 but a stale key remains in 2 locales, or errors on 2
locales it assumed would have the file.

## Code Examples

### Reading today's single-flight install primitive (verbatim)

```typescript
// Source: src/backend/tools/index.ts:765-793 (Winetricks.install) — read directly this session
// Single-flight guard via module-global `installingComponent` string; sends
// 'installing-winetricks-component' with the verb name on start, '' on finish.
```
`[VERIFIED: src/backend/tools/index.ts:765-793]`

### Today's visibility gate the new tab must mirror (D-03)

```typescript
// Source: src/frontend/screens/Settings/components/Tools/index.tsx:24 — read directly
if (isDefault || isWindows || !runner) return <></>
```
`[VERIFIED: src/frontend/screens/Settings/components/Tools/index.tsx:24]` — the new tab's gate is
this condition's negation, ANDed with the Wine tab's own `!isCrossover` guard (which is enforced by
the Wine `TabPanel`'s parent block, not by `Tools` itself).

### Today's row component has no multi-select concept (confirms D-10 is net-new)

```typescript
// Source: src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:20-27 — read
// directly this session
type Props = {
  component: WinetricksComponent
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
  onInstall: (verb: string) => void
  onOpenGui: () => void
}
```
`[VERIFIED: src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:20-27]` — no
`selected`/`onToggleSelect` prop exists today; `onOpenGui` is the exact callback D-17 removes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Modal `ProgressDialog` host + grouped browse-with-search panel | Native in-tab surface, three-tier IA | This phase (45), supersedes Phase 44 (`ROADMAP.md:5351`, superseded 2026-09-18) | No modal; the P-7 nested-scroll trap structurally cannot recur because there is no competing fixed-height box inside the primary scroll |
| Per-row single Install button | Checkbox-based batch selection + sticky-bar Apply | This phase (D-10/D-11) | Install semantics move from "click = install now" to "tick = will install on Apply" |
| Hand-written 8-verb needs-GUI list | Derived from `w_download_manual` callers in the pinned script | This phase (D-17) | Removes drift risk; a future winetricks script update can only ever change the derived set via the actual mechanism, not via someone forgetting to update a list |
| `-q --gui` escape hatch to upstream's own zenity GUI | Removed outright | This phase (D-17) | The 5-second self-dismissing-warning defect (Phase 44 history) is eliminated with the hatch |
| Frontend substring (`' err'`/`' warn'`) output classification | Backend-side classification at the stderr read site | This phase (D-15) | Removes the 846-lines-per-session / 40%-noise `[ERROR]` log problem the roadmap measured |

**Deprecated/outdated:**
- `src/frontend/components/UI/Winetricks/WinetricksBrowse/` (whole tree): retired by D-04, replaced
  wholesale, not refactored.
- `NEEDS_GUI_VERBS_LIST`/`NEEDS_GUI_WINETRICKS_VERBS` in `src/common/winetricks/verbs.ts`: retired
  by D-17 in favour of the derived set.
- `winetricksBrowse.needsGuiTag` and `winetricksBrowse.installingRow` locale keys: lose their
  surface per D-20.
- `translation.json`'s `winetricks.openGUI`: loses its only consumer per D-17/D-20.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | New `metadata.ts` parser for `w_metadata` blocks should live under `src/common/winetricks/`, called from the backend, rather than being folded directly into `winetricksListParse.ts` | Architecture Patterns, Pattern 3 | Low — purely a file-organization choice; either placement satisfies D-19's "no extra wine invocation" constraint. Planner may choose differently without re-researching. |
| A2 | The `task-group` field-coverage counts I measured (title 587 / publisher 435 / year 434 / media 433 / installed_file1 348 / installed_exe1 45 / homepage 42) differ slightly from ROADMAP.md's cited 580/434/433/431/347/45/42 due to grep methodology, not a real discrepancy in the underlying script | Pattern 3 | Low — both counts support the same qualitative conclusion (D-08's "roughly 12-15 family strings, not 1,900 per-verb strings" reasoning); if the exact counts matter for a specific task's acceptance criteria, re-measure with the planner's exact intended methodology before locking a number into a plan |
| A3 | `gamelibCatalogParity` (D-20's required-green gate) refers to `meta/__tests__/gamelibCatalogParity.test.ts`, confirmed to exist and to be a D-08/D-09/D-10-era parity gate over every committed `gamelib.json`, run via the standard `test:ci`/jest invocation, not a separately-named npm script | Validation Architecture | Low — confirmed by direct `Read` of the test file's own docstring; flagged `[ASSUMED]` only because I did not exhaustively confirm there is no *additional* npm script alias wrapping it |
| A4 | The backend queue's IPC shape (new `winetricksInstallMany` invoke vs. frontend driving sequential `winetricksInstall` sends) is left to the planner per CONTEXT.md's own "Claude's Discretion" list — this research does not pick one | Architecture, Pattern 1 | Medium — the choice affects testability (an invoke-based queue is easier to assert completion on than N sequential send-kind calls, since `winetricksInstall` is confirmed send-kind/fire-and-forget) and should be decided at planning time, not assumed here |

**If this table is empty:** N/A — see rows above. All claims not listed here were confirmed by
direct `Read`/`grep`/`sed` against the file in question this session, or are verbatim quotes from
CONTEXT.md/UI-SPEC.md (tagged `[CITED: ...]` where they describe the UI-SPEC's own `[ASSUMED]`-note
decisions, e.g. the 4 unresolved UI-SPEC probe rows, which are UI-SPEC's own open items, not this
research's).

## Open Questions

1. **The 4 unresolved UI-SPEC probe rows (planner must carry as stated assumptions per the UI-SPEC's own text)**
   - What we know: UI-SPEC.md's probe table (80 rows, 76 resolved, 4 unresolved) explicitly flags
     these four as open, verbatim: (a) E4 Task groups, empty state — "whether a task group with
     zero members in the loaded catalog hides its header or renders it with a `0` badge"; (b) E9
     Log disclosure, empty state — "what the expanded log panel shows before any run has produced
     output"; (c) E9 Log disclosure, partial state — "whether log lines survive navigating away and
     back while a run is in flight"; (d) E10 Whole-tab list states, partial — "what renders when
     the catalog resolves but the `winetricksListInstalled` read fails."
     `[VERIFIED: .planning/phases/45-.../45-UI-SPEC.md:300,340,344,352 — quoted verbatim, read directly this session]`
   - What's unclear: UI-SPEC.md itself states these are open decisions, not gaps in my research —
     the planner must pick a default for each and record it as an assumption, per the UI-SPEC's own
     instruction ("Planner must treat as assumption").
   - Recommendation: default (a) to "hide the header" (consistent with D-06's "never show an empty
     group" spirit, even though D-06 is specifically about Suggested); default (b) to "a single
     placeholder line" (consistent with the Loading list-state's "no skeleton rows" precedent);
     default (c) to "log lines do NOT survive navigation" (consistent with D-18's own text, which
     says row state is rebuilt from live events + a fresh read but "says nothing about log
     history" — treating silence as "does not survive" is the more conservative reading since it
     requires no new persistence mechanism); default (d) to "rows render as Available with no
     Installed badges" (fail-open on the read, not fail-closed to an empty state, since the catalog
     itself did load).

2. **Backend queue IPC shape (Claude's Discretion item, not resolved by this research)**
   - What we know: `winetricksInstall` today is send-kind (`makeListenerCaller`, no return value,
     confirmed via `src/preload/api/wine.ts` grep), and sidecar send-kind channels are already a
     documented "fails silently" risk in this codebase (CONTEXT.md's own code_context note).
   - What's unclear: whether the D-11 queue should be driven by one new invoke-kind channel
     carrying the whole ordered verb list (observable completion, cleaner failure semantics) or by
     the frontend issuing N sequential `winetricksInstall` sends and relying entirely on the
     existing event stream for completion/failure signal.
   - Recommendation: prefer the invoke-based shape — it gives the renderer a clear "queue accepted"
     acknowledgment distinct from "a verb's install finished," closing the silent-failure gap this
     codebase has already been burned by once (per the `logSendHandlerReached`/`logSendFailure`
     observability pattern already present in `wineToolsFlowRegistration.ts`'s `winetricksInstall`
     registration, read directly this session). Final call is the planner's per CONTEXT.md.

3. **Exact task-group names/membership and family-prefix table (Claude's Discretion, UI-SPEC already drafted one)**
   - What we know: UI-SPEC.md already contains a fully worked family-prefix table (13 rows, 5
     groups) and verbatim copy for each — `Runtimes & frameworks` (`vcrun*`, `dotnet*`, `vb*run`),
     `DirectX & graphics` (`d3dx*`/`d3dcompiler*`, `dxvk*`, `physx`, `xact`/`xinput`), `Fonts`
     (`corefonts`, `tahoma`, …), `Media & codecs` (`wmp*`, `quartz`, `mf`), `Wine settings`
     (`fontsmooth=*`, `videomemorysize=*`, `csmt=*`, `vd=*`).
     `[VERIFIED: .planning/phases/45-.../45-UI-SPEC.md Copywriting Contract section — read directly this session]`
   - What's unclear: whether this table is final or still open to planner revision — CONTEXT.md
     marks the exact table as "the planner's call within D-05's working set," while UI-SPEC.md
     presents it as settled copy with locale keys already assigned.
   - Recommendation: treat UI-SPEC's table as the default and only revise it if the planner finds a
     verb that doesn't fit any of the 5 prefixes cleanly during implementation — revising it late
     would re-bill locale keys already assigned.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test | ✓ | v26.2.0 | — |
| npm | Package scripts | ✓ | 11.13.0 | — |
| Jest | Unit/component tests | ✓ | 29.7.0 | — |
| `wine` CLI (dev machine) | Live gate only, not CI | ✗ (not on this research machine) | — | Live gate must run on a machine/profile with Wine + the pinned winetricks script already downloaded; not required for unit-test-level verification |
| `winetricks` CLI (dev machine) | Live gate only, not CI | ✗ (not on this research machine) | — | Same as above — the pinned copy already lives under the app's own `tools/` dir on a real GameLib install, not the bare dev shell |
| graphify CLI | Codebase orientation (CLAUDE.md mandate) | ✓ | — | `graphify-out/graph.json` present and queried this session despite `.planning/config.json`'s `graphify.enabled: false` — the CLI works independently of that config key |

**Missing dependencies with no fallback:** none — the two missing CLIs (`wine`, `winetricks`) are
only needed for the D-21 live gate, which runs on a real app install/profile, not this research
or planning environment.

**Missing dependencies with fallback:** `wine`/`winetricks` unavailable here; the live gate is
explicitly out of this research's and the planner's unit-test scope (D-21 already separates
"component tests" from "one live gate").

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 `[VERIFIED: npx jest --version, run directly this session]` |
| Config file | `jest.config.js` (5 projects: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`) `[VERIFIED: jest.config.js, read directly this session]` |
| Quick run command | `npx jest <path-to-test-file>` |
| Full suite command | `npm run test:ci` → `jest --maxWorkers=2 --silent` `[VERIFIED: package.json scripts, grep'd directly this session]` |

### Phase Requirements → Test Map

No REQ-45-* IDs exist yet (see `<phase_requirements>` above); the table below maps CONTEXT.md's
locked decisions directly, which the planner can use to mint REQ IDs.

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|---------------------|-------------|
| D-03 | Tab visibility mirrors Tools-card gate exactly | unit/component | `npx jest src/frontend/screens/Settings/sections/GamesSettings` (new test file needed) | ❌ Wave 0 |
| D-04 | Remount safety (`!declined`-only gate) survives on the new component | component | `npx jest .../__tests__/remountSafety.test.tsx` (ported) | ✅ exists today in `WinetricksBrowse/__tests__/`, needs porting |
| D-04 | Mousedown-capture + `suppressNextClick` on new row controls | component | `npx jest .../__tests__/winetricksInstallMouseRace.test.tsx` (ported) | ✅ exists today, needs porting |
| D-07/D-17 | Task-group membership map / derived needs-GUI set stay in sync with the committed parser fixture | unit | `npx jest src/backend/tools/__tests__/winetricksListParse.test.ts` (extend) | ✅ exists, needs new assertions |
| D-10/D-11 | Checkbox selection → Apply drives a sequential backend queue | unit (backend) + component (frontend) | `npx jest src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts` (extend) `[VERIFIED: file exists, found via `find`]` | ✅ exists, needs extension for multi-verb queue |
| D-12 | A failure mid-queue does not stop remaining verbs | unit (backend) | extend `winetricksInstallLifecycle.test.ts` | ❌ new assertions needed |
| D-13 | Selection locked during run; `Cancel remaining` drops not-yet-started verbs | component | new test file under the new tab's `__tests__/` | ❌ Wave 0 |
| D-15 | Backend classifies stdout/stderr lines into curl%/noise/warning/error | unit (backend) | new test file for the classifier, colocated with `tools/index.ts` | ❌ Wave 0 |
| D-17 | Derived needs-GUI set matches the 6 `w_download_manual` callers in the pinned script | unit | assert-against-script test (new), modeled on `winetricksListParse.test.ts`'s fixture discipline | ❌ Wave 0 |
| D-18 | Row state rebuilds correctly on tab remount mid-run | component | extend `remountSafety.test.tsx` | ✅ base file exists, needs new case |
| D-20 | `gamelib.json` locale fill passes lint + parity | gate (not jest) | `npm run lint-translations:gamelib` and `npx jest meta/__tests__/gamelibCatalogParity.test.ts` `[VERIFIED: meta/lintTranslations.ts:290 references this test file; meta/__tests__/gamelibCatalogParity.test.ts confirmed to exist and read directly this session]` | ✅ both exist |
| D-21 (light/dark token check) | No `--navbar-*`/`--text-hover` consumed on this surface | lint/manual | `grep -rn "navbar-\|text-hover" src/frontend/components/UI/Winetricks*/` over new files, zero hits expected | n/a — a grep check, not a test file |

### Sampling Rate

- **Per task commit:** the single new/extended test file for that task (`npx jest <file>`), plus
  `npx prettier --check <exact paths written>` for any file prettier is NOT configured to ignore
  (see Security/Conventions note below — most new `.ts`/`.tsx` files under `src/` ARE prettier-
  visible; `public/locales/**/gamelib.json` is NOT).
- **Per wave merge:** `npm run test:ci` (full suite, `--maxWorkers=2 --silent`) plus
  `npm run lint-translations:gamelib` for any wave touching locale files.
- **Phase gate:** full suite green, `pnpm planning-gates` green, plus the D-21 live gate (manual,
  one light + one dark theme, on a real profile with Wine/winetricks installed) before
  `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] New component test file for the Winetricks tab's visibility gate (D-03) — mirrors
  `Tools/index.tsx`'s existing gate logic but is currently untested at the tab level.
- [ ] New test file for the stderr/stdout classifier (D-15) — no classifier exists yet to test.
- [ ] New test file (or extension of `winetricksListParse.test.ts`) asserting the derived
  needs-GUI set against a committed script-derived fixture (D-17).
- [ ] New component test file for `Cancel remaining` / selection-lock-during-run (D-13).
- [ ] New or extended fixture covering the `w_metadata` parser (Pattern 3 above), if the planner
  adopts the `metadata.ts` recommendation.
- [ ] 48-locale `gamelib.json` fill task itself (D-20) is a Wave 0-adjacent prerequisite for any
  component test that asserts on rendered copy in a non-English locale, though English-only
  component tests do not block on it.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No auth surface touched by this phase |
| V3 Session Management | No | N/A |
| V4 Access Control | No | Tab visibility is a UX gate (D-03), not a security boundary — any renderer-reachable verb string still flows through the same shape guard as today |
| V5 Input Validation | **Yes** | The verb strings the renderer sends to `Winetricks.install` (and the new batch queue) are renderer-supplied strings reaching a spawned child process. Today's `runWithArgs` builds its argv as `['-q', component]` — an array, not a shell string, so shell-injection via the verb string is not the primary risk; the risk is an arbitrary string reaching `spawn()`'s argv. `assertCommandParts` (`src/backend/sidecar/rendererPathGuard.ts:152-170`) is the existing shape-only guard pattern for a comparable renderer-supplied `commandParts` array on `runWineCommandForGame`, confirmed by direct read `[VERIFIED: src/backend/sidecar/rendererPathGuard.ts:152-170]`. **Recommendation:** the new batch-install IPC channel should validate its verb-list payload is a non-empty array of strings drawn from the backend's own known-verb set (the parsed `list-all` output) before queueing — reject any string not present in that set, rather than trusting the renderer's selection blindly. This is new validation surface this phase introduces (today's single-verb `Winetricks.install` has no such check either, confirmed by direct read of lines 765-793), not an existing control being extended. |
| V6 Cryptography | N/A | The pinned script's sha256 is a supply-chain integrity check already in place (confirmed: `f35c2973…` matches exactly), not something this phase adds or changes |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Renderer sends an arbitrary string as a "verb" to the batch-install queue, which is not a real winetricks verb (e.g. a flag like `--self-update` or a path) | Tampering / Elevation of Privilege | Validate every verb in the batch payload against the backend's own parsed verb set (from `list-all`) before queueing; reject unknown verbs rather than passing them to `spawn()` unchecked — see V5 above, new control this phase should add |
| A malformed/empty batch payload (e.g. `[]`, `null`, non-array) reaches the queue and either does nothing silently or throws uncaught | Denial of Service (soft) | Shape-guard the payload the same way `assertCommandParts` guards `commandParts` — non-array / empty / non-string-element all reject with a typed error before any `spawn()` call |
| The pinned winetricks script itself is tampered with on disk between download and use | Tampering | Out of this phase's scope (the sha256 pin and its verification cadence predate this phase); worth flagging to the planner only if D-19's metadata parser reads the script at a different trust boundary than today's execution path — it does not, since both read the same already-verified file |

## Sources

### Primary (HIGH confidence — direct `Read`/`grep`/`sed` against the actual files this session)

- `src/backend/tools/index.ts` (947 lines, read in full) — `Winetricks` object, `runWithArgs`,
  `install`, `run`, `listAvailable`, `listInstalled`, `checkDependencies`.
- `src/backend/tools/winetricksListParse.ts` (109 lines, read in full) — `parseWinetricksListAll`.
- `src/backend/tools/ipc_handler.ts` (80 lines, read in full) — Electron `callTool` registration.
- `src/backend/sidecar/runnerMiscFlowRegistration.ts` (partial, lines 1-70, 130-175) — sidecar
  `callTool` registration, duplicate of the above.
- `src/backend/sidecar/wineToolsFlowRegistration.ts` (partial, lines 280-360) — sidecar
  `winetricksAvailable`/`winetricksInstalled`/`winetricksInstall` registration.
- `src/backend/sidecar/rendererPathGuard.ts` (171 lines, read in full) — `assertCommandParts`,
  `assertContainedPath`, `assertPlausibleAbsolutePath`.
- `src/common/winetricks/verbs.ts` (78 lines, read in full) — curated verbs, needs-GUI list,
  `resolveCuratedComponents`.
- `src/common/winetricks/deriveRowState.ts` (141 lines, read in full) — row-state precedence,
  `attributeProgressEvent`, `clearVerbError`.
- `src/common/types.ts` (lines 855-945 and 1041-1048) — `WinetricksComponent`, `PCGamingWikiInfo`,
  `KnowFixesInfo`.
- `src/frontend/components/UI/Winetricks/index.tsx` (288 lines, read in full) — the retired
  `ProgressDialog` host and its remount-safety comment.
- `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx` (read lines 1-40 of 273) —
  current single-select row shape.
- `src/frontend/components/UI/ProgressDialog/index.tsx` (99 lines, read in full) — the retired
  substring classifier.
- `src/frontend/screens/Settings/sections/GamesSettings/index.tsx` (267 lines, read in full) — tab
  strip and Wine `TabPanel`.
- `src/frontend/screens/Settings/components/Tools/index.tsx` (111 lines, read in full) — the
  visibility gate D-03 mirrors.
- `src/backend/launcher.ts` (grepped around `installFixes`, lines ~920-1010) — the sequential-
  install pattern D-11 copies.
- `src/backend/knownFixes.ts` (partial, ~60 lines) — `readKnownFixes`.
- `src/backend/wiki_game_info/pcgamingwiki/utils.ts` (143 lines, read in full) —
  `getInfoFromPCGamingWiki`.
- `src/preload/api/wine.ts`, `src/preload/api/misc.ts` (grepped) — IPC invoker/listener wrappers.
- `public/locales/en/gamelib.json`, `public/locales/en/translation.json`, `public/locales/en/gamepage.json` —
  queried via Python JSON traversal and targeted `sed`, confirming key presence/absence and
  resolving the `label.winetricks`/`gamepage:status.winetricks` namespace question (both are real,
  distinct, correctly-namespaced keys; not a discrepancy).
- `~/Library/Application Support/GameLib/tools/winetricks` (the pinned script, 849,574 bytes) —
  sha256 verified, `w_metadata` field counts measured, `w_download_manual` callers enumerated,
  `load_fontxplorer`/`load_ubisoftconnect` function bodies read directly.
- `meta/lintTranslations.ts`, `meta/__tests__/gamelibCatalogParity.test.ts` (partial reads) —
  confirmed the D-20 gate's real file identity.
- `jest.config.js`, `package.json` (scripts section), `.planning/config.json` — build/test/config
  facts.
- `.claude/skills/gamelib-conventions/SKILL.md` (partial, prettier-convention section read in full)
  — the `<verify>`-block prettier rule and which paths are prettier-ignored.
- `.planning/ROADMAP.md` Phase 44 and Phase 45 entries (read in full in a prior turn this session).
- `.planning/phases/45-.../45-CONTEXT.md` (375 lines, read in full) and `45-UI-SPEC.md` (577 lines,
  read in full) — the phase's own decision/design record.
- `.planning/REQUIREMENTS.md` (grepped) — confirmed no Phase 45 REQ IDs exist yet.
- `graphify query "winetricks"` — run directly this session; surfaced `src/backend/wine/manager/utils.ts`
  and `src/backend/backend_events.ts` as graph-adjacent, both checked directly and found to carry no
  Winetricks-specific logic (false-positive proximity via shared community/imports, not a missed
  integration point).

### Secondary (MEDIUM confidence)

- ROADMAP.md's cited `w_metadata` field counts (580/434/433/431/347/45/42) — cross-checked against
  my own direct measurement (587/435/434/433/348/45/42); close but not identical, attributed to
  grep methodology rather than a real discrepancy (see Assumptions Log A2).

### Tertiary (LOW confidence)

- None — this phase required no web search; every claim traces to an in-repo file read this
  session or a prior-session read already captured in CONTEXT.md/UI-SPEC.md/ROADMAP.md.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A (no new packages) — HIGH by default (nothing to get wrong)
- Architecture: HIGH — every integration point (both IPC files, the gate conditions, the queue
  pattern, the classifier replacement site) was confirmed by direct `Read`, not inferred
- Pitfalls: HIGH — each pitfall traces to either a documented historical bug (remount safety) or a
  directly-measured script fact (media field unreliability, w_download_manual caller list)
- Security: MEDIUM — the recommended new validation control (verb allow-list check) is this
  research's recommendation, not an existing pattern already proven in this exact spot; the shape-
  guard pattern it's modeled on (`assertCommandParts`) is itself HIGH confidence

**Research date:** 2026-10-10
**Valid until:** 30 days (stable in-repo domain; re-check sooner only if the pinned winetricks
script is re-downloaded/re-pinned to a new sha256, which would require re-running the
`w_download_manual`/field-count measurements in this document)
