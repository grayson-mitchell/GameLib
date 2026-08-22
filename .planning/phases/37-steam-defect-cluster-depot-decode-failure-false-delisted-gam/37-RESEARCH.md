# Phase 37: Steam defect cluster — depot decode failure, false-delisted games, and install-error reporting - Research

**Researched:** 2026-08-22
**Domain:** Existing GameLib codebase (Steam depot pipeline, Library filter engine, DownloadManager UI) — a defect-fix phase, not a new-technology phase. No new libraries are introduced.
**Confidence:** HIGH

## Summary

This is a six-defect fix cluster inside an existing, heavily-instrumented Steam integration. Every
defect already has a filed todo with `resolves_phase: 37` and a `planned_as` slot, and
`37-CONTEXT.md` already locks the product-level decisions (D-01 through D-17). This research does
not re-decide anything CONTEXT.md settled; it (a) re-verifies every file:line landmark CONTEXT.md
cites still holds at HEAD, (b) closes the three unknowns CONTEXT.md left open, and (c) maps each
of the six defects to its concrete implementation surface (files touched, reusable primitives,
existing test coverage, and cross-defect ordering constraints).

All canonical file:line references in `37-CONTEXT.md`'s `<canonical_refs>` section were
re-verified against HEAD on 2026-08-22 and hold exactly, with two immaterial one-line drifts noted
below (`utils.ts:317` not `:316`; `depot.ts` call sites at `:2991`/`:3036` not the CONTEXT-implied
adjacent lines — both within normal grep noise, not evidence of a stale plan).

**Primary recommendation:** Implement the six defects as six independent plans (37-02, 37-03,
37-04, 37-05, 37-06, 37-10), each touching a small, already-identified file set, reusing existing
primitives (`resolveContainedPath`, `ChunkDecodeError`/`isDecodeStageError`,
`countDescriptorsOfKind`, `triState()`). The one hard sequencing constraint is D-15: 37-03's
backend (`games.ts` `isGameAvailable()`) and frontend (`filterEngine.ts`) clauses MUST land in the
same change — a frontend-only fix traps Dead Island harder than doing nothing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Depot chunk decode/decompress classification (37-02, 37-08 groundwork) | API/Backend (Node sidecar) | — | `depot/decompress.ts` runs in the sidecar's Node process; decode-stage errors never touch the renderer directly |
| Depot download failure classification & copy (37-02) | API/Backend | Browser/Client (renders `.message`) | `depotErrors.ts` is backend-only; the renderer only ever sees the already-classified string via IPC |
| Installdir sanitization/containment (37-10) | API/Backend | — | `installLocation.ts` runs entirely in the sidecar before any filesystem write; no renderer involvement |
| Install-failure dialog title (37-04) | API/Backend (source of `title`) | Browser/Client (renders dialog) | `getGameInfo()` resolves `title` in the backend; the renderer (`utils.ts`, itself backend-side IPC glue) just interpolates it |
| Abort-controller lifecycle (37-05) | API/Backend | — | Entirely inside `aborthandler.ts` / `games.ts` / `downloadqueue.ts`, all backend/sidecar modules |
| Platform-precedence timestamp bound (37-06) | API/Backend | — | `platformPrecedence.ts` is a dependency-free pure module; no renderer involvement |
| Delisted-game filter facet (37-03) | Browser/Client (filter UI) | API/Backend (`isGameAvailable()` gate) | The facet itself is a client-side filter-engine change; the FORCED (D-15) backend clause removal is what actually unhides the game — both tiers own half the fix |

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on a Rust/Tauri shell. GameLib is an independent project — **do
  not** raise "deviates from upstream Heroic" as a concern anywhere in plans or code comments (also
  confirmed dead by the standing memory note `heroic-mergeability-constraint-dead`).
- Steam auth approach (steam-user/steam-session) is settled and not in scope for this phase — no
  auth-flow changes are needed for these six defects; D-07's "Sign in to Steam" affordance only
  *surfaces* an existing no-refresh-token condition, it does not touch the auth library itself.
- No new packages are required or permitted by this phase's scope — see Package Legitimacy Audit.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase boundary:** A defect cluster, not a feature. Every item is an open todo in
`.planning/todos/pending/`, re-verified live at HEAD on 2026-08-22. Already closed by live gates —
do not re-plan: 37-01, 37-08, 37-09, 37-11. Open and in scope: 37-02, 37-03, 37-04, 37-05, 37-06,
37-10. Dropped during discussion: 37-07 (D-01). **Phase-wide constraint, carried from
ROADMAP.md:** no `Migration` may be used as a repair path — `MigrationSystem` is dead code under
Tauri (`applyMigrations()` is wired only into Electron's `app.whenReady()`); any repair of
already-written state must self-heal at the READ boundary.

- **D-01:** 37-07 (orphan scan) does not ship. Signal ratio measured at 1.2% (425 MB real residue
  vs 35.6 GB flagged); the user population it would serve is empty by construction post-`260821-rb5`
  breadcrumb fix. Keep the todo filed as won't-do-now.
- **D-02:** `sanitizeInstalldir` decides acceptability by **containment validation against the
  install root** (mirroring `resolveContainedPath`), plus a narrow explicit denylist: path
  separators, `..`, leading/trailing dots, control characters. Apostrophes and ordinary filename
  punctuation pass. Do NOT simply widen `SAFE_INSTALLDIR`'s character class.
- **D-03:** Both callers (`installLocation.ts:246`, `library.ts:346`) keep the single shared
  funnel. One validator, one call path.
- **D-04:** The two fallback triggers split: a **containment violation** is a security event →
  ABORT the install, message names the rejected value, no silent fallback write. An **absent or
  unresolved** installdir keeps the `app_<id>` fallback (must not hard-fail an install) but logs at
  WARNING and surfaces in the install result.
- **D-05:** `app_8930` / `app_25900` / `app_257350` (16.2 GB of working, mis-named installs) are
  left alone — their ACF `installdir` matches the directory name exactly, so they work. No
  ACF-rewrite code, no incursion into Phase 23's manifest-write path.
- **D-06:** A structured field drives the UI. The classifier returns a retryability/action signal
  alongside `{key, message}`. "Retry to continue." comes out of the message strings entirely —
  affordances stop being encoded in translated prose.
- **D-07:** The auth case (plan-build aborting with no stored refresh token) gets its own message
  plus a "Sign in to Steam" affordance. Retryable causes keep Retry. Today the auth failure hits
  the generic branch because no pattern matches it.
- **D-08:** The `failed after \d+ attempts` term is removed from the network alternation entirely
  — it describes the shape of a failure, not its cause. `fetchChunk`'s exhaustion wrapper carries
  the underlying cause forward so the classifier branches on WHY retries ran out. Genuine network
  exhaustion still matches `ECONNRESET` / `ETIMEDOUT` / `CDN \d` etc.
- **D-09:** For 37-04, the fallback ships — `title` falls back to `appName` (the appid), never an
  empty string. The root cause of the empty `title` is investigated but is NOT a gate. If it widens
  the phase, record a todo instead of holding 37-04 open.
- **D-10:** The delisted filter is a tri-state row **inside the existing "More filters" group**
  (`FilterMoreGroup`), beside "Show Hidden" and "Show non-Available games". No new facet group. It
  inherits the chip row, the group badge, and zero-result handling; costs one new descriptor kind
  added to `MORE_FILTER_KINDS`.
- **D-11:** The three states are **`off` / `only` / `hide`** — NOT the neighbours' `off`/`show`/
  `only`. Neutral `off` means not filtering: delisted games are visible, no descriptor is emitted,
  no chip appears. Clicking cycles to `hide` (the old forced behaviour, now opt-in); "only" isolates
  them. The neutral had to move because `describeActiveFilters` emits a descriptor whenever a
  tri-state is `!== 'off'` — a `'show'`-default row would put a chip + "1 selected" badge on every
  virgin library with zero action taken. A per-row exception was rejected to keep
  `selectionCount.ts`'s "what counts as active" rule uniform.
- **D-12:** The row label and card badge both read **"No store page"** — literally true for all
  nine without PICS, and survives the deferred option-3 refinement (parent term for a later
  "Delisted" sub-row). Rejected: keeping "Game no longer available" (false for two branch-entry
  titles). **Implementation trap:** the badge renders `t2('library.delisted', 'Game no longer
  available')` at `GameCard/index.tsx:537` — changing the `t()` default argument is a silent no-op
  once the key exists in the catalog (i18next-parser trap). This rename needs a NEW key.
- **D-13:** Console mode lifts too. `ConsoleMode/selectors.ts:22` drops delisted games from the
  grid and `ConsoleMode/index.tsx:253`'s `activateGame` early-returns on `is_delisted` — same
  forced-hide defect on a second screen.
- **D-14:** The "Install with options…" doors stay CLOSED. `steamInstallOptionsEntry.ts` gates all
  three on `!isDelisted` (34.13 review C-04 closed the third deliberately). Whether native depot
  install would actually work for a delisted title is UNVERIFIED — file a todo to measure it,
  don't re-open the doors in this phase.
- **D-15 (FORCED, not discretionary):** `SteamGame.isGameAvailable()`'s LIB-07 delisted gate
  (`steam/games.ts:2711`) MUST be removed in the SAME change as the `filterEngine` clause.
  Removing only the frontend clause does not unhide Dead Island — it traps it harder: once the card
  mounts, `hasStatus`'s effect calls `handleNonAvailableGames` → `isGameAvailable()` still returns
  `false` → the appName is pushed onto `nonAvailableGames` → hidden again by the FIRST clause of
  the same OR. 37-08's reconcile cannot heal this (it only fires when not-installed or available).
- **D-16:** Do NOT route the new facet through `nonAvailableGames`. That list means "an INSTALLED
  game whose install_path went missing," has exactly one writer, and reusing it collides at every
  existing reader.
- **D-17:** Bound `platformsCapturedAt` from ABOVE as well as below, and validate the INCOMING
  `capturedAt` the same way the existing one is validated (WR-02, IN-01). Do NOT "fix" this by
  ranking the two sources — freshest-write-wins was chosen deliberately over "appdetails always
  wins" / "PICS always wins".

### Claude's Discretion

- 37-05's abort-controller lookup miss and 37-06's clock-skew bound: pure-implementation defects
  with no product call inside them. Planner decides the shape, subject to D-17 and to 37-05's
  recorded first check — whether a user-initiated cancel hits the same miss (this research answers
  that: **no**, see Unknown 2 below).
- The mechanical follow-ons of D-10..D-16 are the planner's to sequence: the `!game.is_delisted`
  term in `gameCount.findSilentlyExcludedGames` (`gameCount.ts:133`) goes stale once delisted no
  longer hides, and the doc comment at `hooks/constants.ts:156` (which states the delisted clause
  "keeps hiding it regardless") becomes FALSE and must be corrected in the same change.

### Deferred Ideas (OUT OF SCOPE)

- PICS/appinfo discrimination of "withdrawn" vs "never listed" (todo's option 3) — not urgent once
  nothing is hidden; D-12's "No store page" wording is deliberately the parent term for this later.
- Whether a delisted Steam game can actually be installed from depots — D-14 keeps install doors
  closed pending a separate measurement todo.
- 37-04's root cause (why `title` is empty on the Steam error path) — investigated (see Unknown 1
  below), not gated per D-09; file a todo if it widens.
- 37-07's orphan scan, dropped by D-01 — 425 MB of real residue cleaned by hand.
</user_constraints>

<phase_requirements>
## Phase Requirements

No `REQ-37-*` IDs exist yet in `REQUIREMENTS.md` — this phase was decomposed directly from six
todos rather than from pre-written requirement IDs. The planner should mint `REQ-37-01` through
`REQ-37-06` (mapped to `planned_as` 37-02/37-03/37-04/37-05/37-06/37-10 respectively) when writing
REQUIREMENTS.md, and should be aware that **37-03 semantically supersedes/reverses the existing
`LIB-07` requirement** (marked `[x]` complete, Phase 08.1): `LIB-07` currently reads "Steam's
delisted signal (`is_delisted`) drives the Library 'show non-available' filter — non-available
means delisted, not merely not-installed." D-11 replaces "drives the filter as a forced hide" with
"drives an opt-in tri-state facet, default `off` (visible)." `LIB-08` ("greyed placeholder with
install disabled") is also affected: D-12 changes its copy to "No store page" and D-14 keeps the
install-disabled behavior. The planner should record this supersession explicitly in
REQUIREMENTS.md rather than silently leaving `LIB-07`/`LIB-08` as stale-but-checked.

| ID (planner-assigned) | Description | Research Support |
|----|-------------|------------------|
| REQ-37-01 (37-02) | Decode-stage depot failures must not be misreported as "servers dropped the connection" | See "Don't Hand-Roll" and Per-Defect Surface §37-02 — `isDecodeStageError`/`DECODE_STAGE_ERROR_CODES` already exist; `DepotDownloadFailure.error`'s premature stringification (depot.ts:2426) is the landmine to fix first |
| REQ-37-02 (37-03) | Owned Steam games must never be forced-hidden by store delisting; make it an opt-in tri-state facet with a "No store page" badge | See Per-Defect Surface §37-03 — full file census, RED→GREEN test at `filterEngine.test.ts:169` identified, D-15 backend gate at `games.ts:2711` |
| REQ-37-03 (37-04) | Install-failure dialog must never render an empty game title | See Per-Defect Surface §37-04 — Unknown 1 resolved: async `getGameInfo()` population gap unique to Steam vs. GOG/Legendary's synchronous load |
| REQ-37-04 (37-05) | Terminal install failure must not log a spurious "no matching abort controller" error | See Per-Defect Surface §37-05 — Unknown 2 fully resolved via code-structure trace: registration-timing gap, not a teardown race; user-cancel is NOT affected |
| REQ-37-05 (37-06) | `platformsCapturedAt` precedence must reject values with no upper/sanity bound | See Per-Defect Surface §37-06 — exact validation gap located and confirmed unbounded |
| REQ-37-06 (37-10) | A PICS installdir containing an apostrophe (or other ordinary punctuation) must not be silently redirected to the `app_<id>` fallback | See Per-Defect Surface §37-10 — existing WR-04 test suite covers quote/control-char/colon but not apostrophe; containment-based replacement path identified |
</phase_requirements>

## Standard Stack

No new libraries. This phase modifies existing backend TypeScript modules
(`installLocation.ts`, `depotErrors.ts`, `games.ts`, `platformPrecedence.ts`,
`aborthandler.ts`, `downloadmanager/utils.ts`) and existing frontend TypeScript/React modules
(`filterEngine.ts`, `FilterMoreGroup`, `GameCard`, `ConsoleMode`, `chipLabels.ts`,
`gameCount.ts`, `hooks/constants.ts`). All are already in the dependency tree; `i18next` is the
only "library surface" touched (new translation keys), and it is already wired throughout.

### Alternatives Considered

Not applicable — no library selection decisions exist in this phase.

**Installation:** None required.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero external packages — it is a pure defect-fix phase
against existing code. No `slopcheck`/registry verification was run because there is nothing to
verify. If any plan discovers a need for a new dependency during implementation, it must return to
research before adding it.

## Architecture Patterns

### System Architecture Diagram

```
[Steam CM / PICS / CDN]
        │
        ▼
┌─────────────────────────────┐
│ src/backend/storeManagers/   │
│ steam/depot.ts               │  buildDepotPlan → downloadDepotFiles → per-chunk decode
│  ├─ depot/decompress.ts      │  ChunkDecodeError (5 typed reason codes) ──┐
│  ├─ depotErrors.ts           │  classifyDepotError(err) → {key, message} │ .code preserved
│  └─ installLocation.ts       │  sanitizeInstalldir(candidate, appId) ◄────┘ but DISCARDED
└──────────┬────────────────────┘        before reaching classifyDepotError
           │ InstallResult{status,error:string}   (37-02/37-08 landmine, see below)
           ▼
┌─────────────────────────────┐
│ src/backend/downloadmanager/ │
│ utils.ts (installQueueElement)│ title fallback (37-04), callAbortController (37-05)
│ downloadqueue.ts             │ stopCurrentDownload → callAbortController (sync, no race)
└──────────┬────────────────────┘
           │ IPC (sendFrontendMessage / DMQueueElement — no structured error field today)
           ▼
┌─────────────────────────────┐
│ src/frontend/screens/        │
│ DownloadManager/…/status.ts  │  classifyDMItemStatus — Retry button ALREADY structural,
│                               │  independent of message text (isSteamError && status==='error')
└─────────────────────────────┘

┌─────────────────────────────┐        ┌─────────────────────────────┐
│ steam/games.ts               │        │ frontend/screens/Library/    │
│  fetchMetadataIfNeeded()     │  sets  │ filterEngine.ts              │
│  → is_delisted (CORRECT,     │──flag─▶│  isNonAvailableGame() OR     │  37-03: remove Steam
│    not touched by 37-03)     │        │  clause (37-03 removes it)   │  OR-clause AND the
│  isGameAvailable() LIB-07    │──gate─▶│ FilterMoreGroup (D-10/D-11   │  backend gate — D-15
│  gate at :2711 (37-03 D-15,  │        │  tri-state row)              │  forces same-commit
│  MUST remove in same commit) │        └─────────────────────────────┘
└─────────────────────────────┘
```

### Recommended Project Structure

No new directories or files. Every defect is a modification to an existing module (see
Per-Defect Implementation Surface below for the exact file list per defect).

### Pattern 1: Structured classifier return (D-06/D-08)

**What:** `ClassifiedDepotError` (`depotErrors.ts:18-24`) currently returns only `{key, message}`.
D-06 widens this to carry a retryability/action signal.
**When to use:** Any place a backend classifier feeds a generic UI affordance (Retry button) that
today infers its behavior from message text.
**Example (current shape, to be widened):**
```typescript
// Source: src/backend/storeManagers/steam/depotErrors.ts:18-24 (current, verified at HEAD)
export interface ClassifiedDepotError {
  key: string
  message: string
}
```
**Critical landmine to fix as part of the same change:** `DepotDownloadFailure.error` is typed
`string` (`depot.ts:1045-1048`) and populated via `(err as Error).message` at `depot.ts:2426`,
**discarding `.code`/`.eresult` before `classifyDepotError` is ever called** at the per-file-failure
call site (`depot.ts:~2991`, `classifyDepotError(result.failures[0].error)`). Only the OTHER call
site (`depot.ts:~3036`, inside the `catch` block, `classifyDepotError(err)`) still has the original
Error object. This means **any D-06/D-08 retryability signal that depends on reading `.code` or
`.eresult` off the error will silently never fire on the per-file-failure path** — which is the
path most real depot chunk failures actually take — unless `DepotDownloadFailure.error`'s type is
widened to preserve those fields (or the stringification is deferred past classification).
`isNonRetryableDepotError(err)` (`depotErrors.ts:52`) already demonstrates the exact pattern needed
(`typeof err === 'object'` + `.eresult` read) — it just needs an object, not a string, to work.

### Pattern 2: Containment-based path validation (D-02, 37-10)

**What:** Replace/augment `SAFE_INSTALLDIR`'s character-class regex with containment validation
against the install root, mirroring the existing, already-tested `resolveContainedPath`.
**When to use:** Any place a PICS/external value is used to construct a filesystem path.
**Example:**
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:986 (verified at HEAD, existing primitive)
export function resolveContainedPath(root: string, filename: string): string {
  // resolves filename against root, throws/rejects on any path that would
  // escape root — the exact property D-02 wants for sanitizeInstalldir
}
```
`sanitizeInstalldir` (`installLocation.ts:113`) currently uses a pure regex
(`SAFE_INSTALLDIR = /^[A-Za-z0-9 ._-]+$/`, line 91) with no containment check at all — it rejects
by character class, not by resolved-path escape. D-02 wants the inverse: accept by containment,
reject only path separators / `..` / leading-trailing dots / control chars explicitly.

### Pattern 3: Tri-state facet row (D-10/D-11, 37-03)

**What:** A third tri-state filter row inside `FilterMoreGroup`, reusing `triState()`.
**When to use:** Any new boolean-ish library filter that needs off/isolate/hide semantics.
**Existing pattern to follow (NOT copy verbatim — states differ):**
```typescript
// Source: src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx (verified at HEAD)
// Existing showHidden/showNonAvailable cycle: off -> show -> off (row click), separate
// "only" button. D-11's new facet uses off/only/hide instead of off/show/only — do NOT
// reuse the existing toggle function unmodified; the sub-state semantics differ.
```
`chipLabels.ts`'s existing `showHidden`/`showNonAvailable` switch cases use `'only'`/`'show'`
sub-values; D-11's new case needs distinct `'only'`/`'hide'` sub-cases — not a copy-paste of the
existing pattern.

**Design-system constraint (from `sketch-findings-gamelib` skill, `references/library-filtering.md`,
required reading per CONTEXT.md's canonical refs):** Facet counts computed anywhere in this panel
MUST exclude their own facet (`countFor` skips its own `kind` when filtering) — this is already how
`countDescriptorsOfKind` + `filterEngine.ts` work for the existing tri-states, and the new delisted
row must follow the same rule or its sibling counts will read misleadingly. This was previously a
real, shipped defect (`library-header-counts-union-not-runner` / the 34.11 code-review CR-01 fix
noted in `filterEngine.test.ts`'s SCOPE WARNING comment) — do not reintroduce it for the sixth kind.

### Anti-Patterns to Avoid

- **Widening `SAFE_INSTALLDIR`'s character class by reflex:** the check exists to stop a hostile
  PICS response from escaping the install root via traversal. Simply adding `'` to the allow-list
  without a RED traversal test trades this defect for a worse one (explicitly called out in D-02
  and the todo's own "Test that fails first" section).
- **Changing `t()` default arguments to rename existing labels:** i18next resolves the catalog
  value over the call-site default once a key exists — this is a silent no-op, not a rename. D-12's
  "No store page" label needs a brand-new key, confirmed exact trap at `GameCard/index.tsx:537`.
- **Reusing `nonAvailableGames` for the new delisted facet (D-16):** that list has exactly one
  writer and one meaning ("installed game whose install_path vanished"); a second writer collides
  at every existing reader (`reusing-a-state-field-collides-at-existing-readers`, a recorded
  standing lesson in this codebase).
- **Fixing 37-03 frontend-only:** traps Dead Island harder via the `isGameAvailable()` →
  `handleNonAvailableGames` → `nonAvailableGames` chain (D-15, forced).
- **Writing a `Migration` for any of the six defects:** `MigrationSystem` is confirmed dead code
  under Tauri (`main.ts:412`'s `applyMigrations()` call site is unreachable — `bootstrap.ts` never
  imports `main.ts`, zero matches confirmed by grep). Any state repair must self-heal at the read
  boundary.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path containment validation (37-10) | A second bespoke path-safety regex/algorithm | `resolveContainedPath` (`depot.ts:986`) | Already exists, already tested against traversal cases; a second implementation is a second thing to keep in sync and audit |
| Decode-stage cause propagation (37-02/37-08) | A new error-taxonomy/wrapper for chunk decode failures | `ChunkDecodeError` + `DECODE_STAGE_ERROR_CODES` + `isDecodeStageError` (`depot/decompress.ts:~1219-1263`) | Already built and already unit-tested (`depotPrimitives.test.ts:523-545`) — the D-08 requirement ("thread decode-stage cause through the exhaustion wrapper") is largely ALREADY IMPLEMENTED; the gap is that `depotErrors.ts` doesn't consume it yet, and that `DepotDownloadFailure.error`'s premature stringification (see Pattern 1) would hide it even if it did |
| Tri-state facet UI (37-03) | A new filter-row component | `FilterFacetGroup`/`FilterMoreGroup`'s `triState()` helper | D-10 costs "one more call to an existing local helper, not a new component" per CONTEXT.md |
| Dialog action buttons (D-07's "Sign in to Steam") | A new dialog-button plumbing mechanism | `ButtonOptions` (`src/common/types.ts:35-38`) + `showDialogBoxModalAuto`'s existing `buttons` param (`dialog.ts`) — already wired through `DialogHandler`/`ContextProvider` | The plumbing for an interactive dialog button already exists end-to-end; D-07 only needs a new button definition, not new IPC |

**Key insight:** Every one of the six defects has most of its supporting machinery already built in
this codebase from prior phases (21, 21-06, 23.2, 34.11, 34.13, 34.15). The actual work is
threading existing primitives through the remaining gap, not inventing new mechanisms — the biggest
research finding is *where* those gaps are (see Pattern 1's landmine and the three Unknowns below),
not what to build.

## Common Pitfalls

### Pitfall 1: Fixing 37-03 without D-15's backend gate removal

**What goes wrong:** Removing `filterEngine.ts`'s `(runner === 'steam' && !!is_delisted)` clause
alone appears to fix the bug in the Library grid, but `hasStatus`'s effect still calls
`handleNonAvailableGames`, which calls `isGameAvailable()`, which still returns `false` because of
the untouched gate at `games.ts:2711` — pushing the appName onto `nonAvailableGames`, which is
checked by the FIRST clause of the same `filterEngine.ts` OR. The game re-vanishes through a
different door.
**Why it happens:** Two independent readers of "is this game available" exist (`filterEngine`'s
inline check and `isGameAvailable()`), and only one was the obvious target.
**How to avoid:** Change `games.ts:2711` and `filterEngine.ts:241-249` in the same commit (D-15,
forced).
**Warning signs:** A test or manual check that only exercises the Library grid's initial render
(before `hasStatus`'s effect runs) will falsely appear to pass.

### Pitfall 2: Assuming the abort-controller miss is a teardown race

**What goes wrong:** The symptom log line ("Aborting not possible... after terminal install
failure") reads like a race between two async cleanups. Building a fix around ordering/awaiting
would not address the actual root cause.
**Why it happens:** `createAbortController` is called exactly once, at `games.ts:1573`, as the
FIRST line of the private `runNativeDepotDownload` method. Everything upstream of that call —
`SteamGame.install()`'s `ensurePlatformsCaptured()`, routing decisions, `resolveSteamInstallTarget`'s
PICS/appdetails fetch inside `installLocation.ts` — can throw and reach `utils.ts`'s
unconditional `callAbortController(appName)` (`utils.ts:285`) without a controller ever having been
registered. This fully explains the todo's own "NARROWED" observation (a 1ms plan-build failure
before any download starts still logs the miss).
**How to avoid:** Register the controller earlier (at the top of `installDepotDownload` /
`installNative`, before any pre-download step that can throw) OR make `callAbortController`'s
terminal-error caller check registration state before logging at ERROR (demote to INFO/no-op for
the "never registered" case, since it's expected whenever a plan-build failure precedes any
download).
**Warning signs:** A fix that only touches `runNativeDepotDownload`'s own `finally` block or
`downloadqueue.ts`'s ordering will not close this — the miss originates upstream of both.

### Pitfall 3: Treating 37-06's fix as a ranking change

**What goes wrong:** "Just always trust PICS" or "always trust appdetails" would silently defeat
the entire freshest-write-wins design (D-B, the module's own documented "honesty limit"), and is
explicitly forbidden by D-17.
**Why it happens:** The actual bug is narrower than it sounds — `resolvePlatformWrite` already
validates the EXISTING timestamp's lower bound (`typeof === 'number' && Number.isFinite`,
`platformPrecedence.ts:107-109`) but has **no upper bound at all**, and the INCOMING `capturedAt`
parameter is used completely unvalidated (`platformPrecedence.ts:138`, the `accepted: true` return
path). Both call sites (`games.ts:709`, `platformCapture.ts:176`) pass `Date.now()` directly, so
the incoming value is never externally influenced in practice — the exposure is entirely a
previously-written, unbounded `existingCapturedAt` read back from the untyped on-disk JSON store
(e.g., a clock-skew event during a prior run) that can then win every future comparison forever,
since `Number.isFinite` accepts any absurdly-large finite number.
**How to avoid:** Add a sane upper bound (e.g., reject any timestamp more than N minutes/hours in
the future relative to `Date.now()` at read time) to BOTH `existingCapturedAt` and `capturedAt`,
falling back to "indefinitely old / writable" on violation — the same degrade-gracefully pattern
`hasValidExistingTimestamp` already uses for `NaN`/wrong-type values (documented rationale:
`T-qcn-01` in the module's own threat register comment).
**Warning signs:** `platformPrecedence.test.ts`'s 9 existing tests cover ties, null/undefined,
empty, and NaN-corruption degradation but have NO test for an absurdly-large-but-finite timestamp
— this is a genuine, confirmed test gap (Wave 0, see Validation Architecture below).

## Runtime State Inventory

> Included because 37-03 and 37-10 both touch data written by prior runs (`is_delisted` flags,
> `app_<id>` fallback directories). Not a rename/rebrand phase, but the same "what does code miss"
> discipline applies to these two defects specifically.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `steam_metadata.json` currently carries `is_delisted: true` for 9 live appids (28050, 43160, 91310, 205930, 216390, 218130, 223390, 367540, 700580), verified live on this machine 2026-08-22. | **None** — D-11 explicitly keeps these flags unchanged; only the READ-side policy (filter, not hide) changes. No migration, no data write. |
| Live service config | Steam client itself may hold ACF-adopted state for `app_8930`/`app_25900`/`app_257350` (mis-named installs) that GameLib does not control. | **None for this phase** — D-05 explicitly leaves these alone; out of scope. |
| OS-registered state | None identified — no Task Scheduler/launchd/pm2 state touched by any of the six defects. | None. |
| Secrets/env vars | None — no defect in this cluster touches auth tokens, SOPS keys, or env vars. D-07 only adds a UI affordance pointing at the EXISTING no-refresh-token condition. | None. |
| Build artifacts / installed packages | `app_228280` (47 MB, no manifest at all — true orphan), `app_257350`, `app_25900`, `app_259130` (378 MB duplicate of the ACF-claimed `Wasteland` dir), `app_8930` (7.2 GB) — 17 GB total on this machine, pre-existing from before the `260821-rb5` breadcrumb fix and the fallback logic 37-10 is fixing. | **None from this phase** (D-01 dropped 37-07's orphan scan; user cleans up by hand). 37-10 fixes the code path going forward but does not touch these existing directories. |

**Nothing found in category:** OS-registered state, Secrets/env vars — verified by reviewing every
one of the six todos and CONTEXT.md's decisions; none reference OS-level registration or
credential/env-var names.

## Per-Defect Implementation Surface

### 37-02 — Decode failure misreported as "servers dropped the connection"

- **Files touched:** `src/backend/storeManagers/steam/depotErrors.ts` (classifier regex + return
  shape), `src/backend/storeManagers/steam/depot.ts` (widen `DepotDownloadFailure.error`'s type so
  `.code`/`.eresult` survive to the classifier — see Pattern 1's landmine), possibly
  `src/backend/storeManagers/steam/depot/decompress.ts` (no change expected — `isDecodeStageError`
  already exports what's needed).
- **Reusable primitives:** `isDecodeStageError`, `DECODE_STAGE_ERROR_CODES` (already built,
  already tested — `depotPrimitives.test.ts:523-545`, 100% passing today). `isNonRetryableDepotError`
  demonstrates the exact `.eresult`-reading pattern to extend for `.code`.
- **Existing test coverage:** `depot.test.ts:2922-2945+` (`describe('classifyDepotError', ...)`)
  already covers several branches; no dedicated `depotErrors.test.ts` exists as a standalone file
  — all classifier tests live inside `depot.test.ts`. `depot.test.ts:1015-1018` already asserts
  `result.error` does NOT match `/dropped the connection/i` for a specific sha1-mismatch case —
  this is the exact regression class 37-02 needs to extend to decode-stage failures.
- **Ordering constraint:** Must land before or alongside D-08's regex change (`failed after \d+
  attempts` removal) since both touch the same `classifyDepotError` function; can be one plan.

### 37-03 — Owned games permanently flagged delisted and hidden

- **Files touched (backend):** `src/backend/storeManagers/steam/games.ts` — remove the LIB-07 gate
  at `isGameAvailable()` line 2711 (D-15, forced). Do NOT touch the `is_delisted` write block
  (`:644`) or the `!data` guard (`:659`) — both confirmed correct and explicitly untouched by
  Corrections §1.
- **Files touched (frontend):** `src/frontend/screens/Library/filterEngine.ts` (remove the OR
  clause at `:241-249`, add the new tri-state to `describeActiveFilters`/`DEFAULT_FILTER_ENGINE_STATE`
  around `:392-460`), `src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx`
  (new row, off/only/hide cycle — D-10/D-11), `src/frontend/components/UI/NavShell/components/
  FilterFacetGroup/selectionCount.ts` (`MORE_FILTER_KINDS` — sixth kind), `src/frontend/screens/
  Library/components/FilterChipRow/chipLabels.ts` (new switch case, `'only'`/`'hide'` sub-labels),
  `src/frontend/screens/Library/components/GameCard/index.tsx:537` (new i18next key, not a
  `t()`-default rename — D-12 trap), `src/frontend/screens/ConsoleMode/selectors.ts:22` and
  `ConsoleMode/index.tsx:253` (D-13, second-screen lift), `src/frontend/screens/Library/components/
  LibraryHeader/gameCount.ts:133` (stale `!game.is_delisted` term — Claude's Discretion follow-on),
  `src/frontend/hooks/constants.ts:156` (doc comment becomes false, must be corrected in the same
  change).
- **Reusable primitives:** `triState()` helper in `FilterMoreGroup`, `countDescriptorsOfKind`,
  `describeActiveFilters`.
- **Existing test coverage:** `filterEngine.test.ts:169-183` has an EXISTING test — `'a delisted
  Steam game counts as non-available even when nonAvailableAppNames is empty'` — that currently
  asserts the OLD forced-hide behavior (`expect(result).toHaveLength(0)`). This is a RED→GREEN flip:
  the test must be updated to assert the NEW default-visible behavior as part of this plan, not
  left green-by-accident or silently deleted. `games.test.ts` has `isGameAvailable()` tests at
  lines 6232/6249/6258 covering install/existsSync scenarios but **none covering `is_delisted:
  true`** — confirms the LIB-07 gate is currently untested and needs a new test asserting it no
  longer returns `false` for a delisted-but-installed game.
- **Design constraint:** `sketch-findings-gamelib`'s `references/library-filtering.md` — facet
  counts must exclude their own facet (already the pattern; must not regress for the sixth kind).
- **Live verification (non-negotiable per CONTEXT.md):** Dead Island (91310,
  `appmanifest_91310.acf` present) must appear in the grid, be launchable, appear in console mode,
  and disappear only on active `hide`/other-filter selection. A green suite does not prove this.
- **Ordering constraint:** Backend (D-15) and frontend clauses MUST land in one commit/plan (forced,
  not discretionary).

### 37-04 — Install-failed dialog renders an empty game title

- **Files touched:** `src/backend/downloadmanager/utils.ts` (`title` fallback at `installQueueElement`,
  confirmed line 317 — one-line drift from CONTEXT's cited `:316`, immaterial) — change `const {
  title } = ...getGameInfo()` destructuring to fall back to `appName` when `title` is falsy, per D-09.
- **Root cause (Unknown 1, resolved this session):** `SteamGame.getGameInfo()` (`games.ts:~554`)
  returns `{} as GameInfo` (empty object, so `title` is `undefined`) when BOTH `library.get(this.appId)`
  and the `steamLibraryStore` cache miss. This is a genuine async-population gap unique to Steam:
  `legendary/library.ts:203`'s `getGameInfo(appName, forceReload)` calls `this.loadFile(appName)`
  SYNCHRONOUSLY if `!library.has(appName)`, so GOG/Legendary never hit this race — Steam's
  equivalent synchronous-load fallback does not exist. `gog/games.ts:171` and `legendary/games.ts:91`
  both have an explicit `title: ''` fallback with a `logError` call when their respective
  LibraryManager returns undefined — Steam has neither the sync-load nor the explicit-fallback
  pattern its siblings have.
  **D-09 explicitly does NOT gate this phase on fixing the root cause** — ship the `appName`
  fallback in `utils.ts`, file a follow-up todo for the async-population gap if it's judged worth
  closing structurally (matching GOG/Legendary's pattern) later.
- **Existing test coverage:** No direct test found asserting `installQueueElement`'s title fallback
  behavior — likely a Wave 0 gap (confirm during planning; a unit test mocking a Steam
  `getGameInfo()` cache-miss into `installQueueElement` and asserting the notification uses
  `appName` would close it).

### 37-05 — Abort-controller missing on terminal Steam install failure

- **Files touched:** `src/backend/storeManagers/steam/games.ts` (`installDepotDownload`/
  `installNative` — move `createAbortController` earlier, or another mitigation per planner
  discretion) and/or `src/backend/downloadmanager/utils.ts` (`callAbortController` caller at
  `:285` — could check registration state / demote log level for the "never registered" case) and/or
  `src/backend/utils/aborthandler/aborthandler.ts` (`callAbortController` itself).
- **Root cause (Unknown 2, fully resolved this session via code-structure trace, not
  speculation):** `createAbortController` is registered in exactly ONE place —
  `games.ts:1573`, the first line of the private `runNativeDepotDownload` method, itself called
  from `installDepotDownload` (`games.ts:1528`), itself called from `installNative`
  (`games.ts:1216`) — AFTER `SteamGame.install()`'s pre-download steps (`ensurePlatformsCaptured()`,
  routing decisions, `resolveSteamInstallTarget`'s PICS/appdetails fetch). Any failure thrown in
  this pre-download window propagates to `utils.ts`'s unconditional `callAbortController(appName)`
  (`utils.ts:285`, gated only on `status === 'error'`) with NO controller ever registered — fully
  explaining the todo's own "NARROWED 2026-08-22" observation of a 1ms plan-build failure logging
  the same miss before any download starts.
  **The user-cancel question (explicitly the "first check" CONTEXT.md requires) is answered: NO,
  user-initiated cancel does NOT hit this same miss.** `downloadqueue.ts:373-376`'s
  `stopCurrentDownload()` calls `callAbortController(appName)` and `libraryManagerMap[runner]
  .getGame(appName).stop(false)` synchronously, back-to-back, with no intervening `await` — so by
  the time a user can click Cancel, the download (and therefore its controller registration) is
  already known to exist; there is no registration-timing gap on this path. This is a genuinely
  different, unaffected code path from the terminal-failure path in `utils.ts`.
- **Existing test coverage:** `aborthandler.test.ts` (9 tests, lines 33-113) already covers
  "genuinely unregistered id still logs" (line 33), "registered, not-yet-aborted, found" (line 44),
  the 2026-07-19 double-abort fix (line 54), and "deleted then called IS a genuine miss" (line 72)
  — solid groundwork for testing whichever mitigation is chosen, but none currently test the
  specific "never-registered because failure preceded runNativeDepotDownload" scenario from the
  `games.ts`/`utils.ts` integration layer (that would need a new integration-level test, not just
  an `aborthandler.ts` unit test, since `aborthandler.ts` itself behaves exactly as designed here).

### 37-06 — Platform-precedence timestamp has no upper bound

- **Files touched:** `src/backend/storeManagers/steam/platformPrecedence.ts` (bound both
  `existingCapturedAt` and the incoming `capturedAt` parameter from above, not just below).
- **Exact gap confirmed:** `hasValidExistingTimestamp` (`platformPrecedence.ts:107-109`) checks
  `typeof === 'number' && Number.isFinite(...)` — a LOWER-bound-equivalent sanity check but no
  upper bound (WR-02). The incoming `capturedAt` parameter is used completely unvalidated in the
  `accepted: true` return path (`platformPrecedence.ts:~138`) — no type/finiteness check at all
  (IN-01). Both call sites (`games.ts:709`, `platformCapture.ts:176`) pass `Date.now()` directly
  today, so the practical exposure is a previously-persisted, unbounded `existingCapturedAt` value
  (e.g., from a past clock-skew event) that can win every future comparison forever once written,
  since an absurdly-large-but-finite number passes `Number.isFinite`.
- **Reusable primitives:** None new needed — extend the existing `hasValidExistingTimestamp`
  pattern symmetrically to both timestamps and add an upper-bound check (e.g., reject anything more
  than N ahead of `Date.now()` at read time), degrading to "indefinitely old / writable" on
  violation, matching the module's own documented degrade-gracefully philosophy (`T-qcn-01`).
- **Existing test coverage:** `platformPrecedence.test.ts` — 9 tests covering PICS/appdetails
  precedence, ties, null/undefined/empty existing, and NaN-corruption degradation. **Confirmed gap:
  no test for an absurdly-large-but-finite (or literally future) timestamp** — this is the Wave 0
  test to add.
- **Do NOT:** rank one source over the other (explicitly forbidden by D-17); this is a bounds-check
  fix only.

### 37-10 — Apostrophe installdir rejected as hostile

- **Files touched:** `src/backend/storeManagers/steam/installLocation.ts` (`SAFE_INSTALLDIR` at
  `:91`, `sanitizeInstalldir` at `:113`), possibly a shared import of `resolveContainedPath` from
  `depot.ts` (or a local re-implementation of the same containment logic — planner's call per D-02's
  "mirroring" language, not necessarily a direct cross-module import).
- **Two callers to update via the shared funnel (D-03):** `installLocation.ts:246`
  (`sanitizeInstalldir(await fetchInstalldir(appId), appId)`), `library.ts:346`.
- **Fallback-trigger split (D-04):** containment violation → ABORT install, name the rejected value,
  no silent fallback write (a NEW behavior — today it silently falls back). Absent/unresolved
  installdir → keep `app_<id>` fallback but log at WARNING (today `app_259130`'s trigger — the
  `!candidate` branch — logs NOTHING AT ALL per Correction §3; this must change).
- **Existing test coverage:** `installLocation.test.ts` already has a rich WR-04 test suite
  (lines ~244-308): quote-containing (`Foo"bar`), control-char/newline, Windows drive-relative
  (`C:foo`), and well-formed spaces/dots/dashes/underscores (`Half-Life 2`) — all confirmed exact
  matches at HEAD. **Confirmed gap: no apostrophe-specific test exists** (the exact defect
  character) — this is the "test that fails first" the todo itself calls for and must be added.
  Also confirmed: no existing test exercises the `!candidate` (absent/unresolved) branch's silent
  fallback — needed to prove D-04's "log at WARNING" half.
- **Live installdir evidence (measured, not guessed):** 1 of 18 real ACF installdirs on this
  machine fails today (`Len's Island`, currently INSTALLED via Steam) — do not quote the 36%
  title-based figure, it is confirmed wrong for this defect (colons in titles are stripped by
  Steam's own installdir generation before reaching this code).

## Code Examples

### Existing classifier call-site census (D-06's full census, complete — only 2 sites)

```typescript
// Source: src/backend/storeManagers/steam/depot.ts (verified at HEAD)
// Site 1 — per-file failure path (result.failures[0].error is ALREADY a string,
// .code/.eresult already discarded upstream at depot.ts:2426 — see Pattern 1 landmine):
return {
  status: 'error',
  error: classifyDepotError(result.failures[0].error).message,
  skippedDepots
}

// Site 2 — catch-all path (err is still the original thrown object, .eresult intact):
return {
  status: 'error',
  error: classifyDepotError(err).message,
  skippedDepots
}
```
Both sites currently read ONLY `.message` off the classifier's return — any new field D-06 adds
(retryability/action) needs BOTH call sites updated to actually thread it through `InstallResult`,
and `InstallResult.error` itself (`src/common/types/game_manager.ts:1-40`, confirmed
`{status, error?: string, deferredToSetup?: boolean}`) has no field to carry it today — nor does
`DMQueueElement` (`src/common/types.ts:~704-711`, confirmed `{type, params, addToQueueTime,
startTime, endTime, status?}`, no error/message/key field at all). **D-06 will require widening at
least one of these types**, not just the classifier's return shape.

### Existing structural independence of the Retry button (confirms D-06 is additive, not required for Retry to work today)

```typescript
// Source: src/frontend/screens/DownloadManager/components/DownloadManagerItem/status.ts (verified at HEAD, full file read)
export function classifyDMItemStatus(
  status: DMStatus | undefined,
  runner: Runner,
  current: boolean
): DMItemStatusInfo {
  const finished = status === 'done'
  const isSteamError = runner === 'steam' && status === 'error'
  // ^ already purely structural — status+runner, NOT message text.
  const canceled = !isSteamError && (status === 'error' || (status === 'abort' && !current))
  const showRemoveAction = isSteamError && !current
  return { finished, isSteamError, canceled, showRemoveAction }
}
```
This confirms the DownloadManager queue's Retry affordance ALREADY does not depend on message text
— D-06's structured field is about the *dialog*/copy layer (`depotErrors.ts` → `InstallResult.error`
→ dialog), not the DownloadManager queue item's own Retry button, which was already fixed in an
earlier phase (D-UAT-06/D-UAT-08 comments in `status.ts`).

## State of the Art

Not applicable in the usual sense — this is a defect-fix phase inside an already-current internal
codebase, not an external-library currency question. The relevant "state of the art" is *this
repo's own prior phases* (21, 21-06, 23.2, 34.11, 34.13, 34.15), all of which already built most of
the primitives this phase needs to finish wiring together (see Don't Hand-Roll).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No `REQ-37-*` IDs exist yet in REQUIREMENTS.md; this research recommends the planner mint six new IDs and record LIB-07/LIB-08 as superseded rather than silently stale | Phase Requirements | If the planner instead edits LIB-07/LIB-08 in place without a supersession note, a future reader may not understand why a "Complete" requirement's behavior changed |
| A2 | 37-04's Wave 0 test gap (no existing test for `installQueueElement`'s title fallback) — based on a targeted grep, not an exhaustive test-file read | Per-Defect Surface §37-04 | If a test does exist under a different describe block, the plan would add a redundant test rather than update an existing one — low risk, easily caught in review |
| A3 | The recommended upper-bound mechanism for 37-06 (reject timestamps more than N ahead of `Date.now()`) is a suggested shape, not a value CONTEXT.md locked — the exact N is planner/implementer discretion | Common Pitfall 3 / Per-Defect Surface §37-06 | Choosing too small an N could falsely reject a legitimate near-future write during a real (small) clock skew; too large defeats the point. Low risk either way since D-17 only requires *a* bound exists, not a specific value |

**All other claims in this research are `[VERIFIED: codebase]`** — read directly from source files
at HEAD on 2026-08-22 via `grep -n`/`sed -n` against the actual repository, not from training data
or web sources (this phase has no external-library research surface). No `[CITED]` claims apply
since no official third-party documentation was consulted (nothing external is being installed or
configured).

## Open Questions

1. **What is the correct upper bound for `platformsCapturedAt` (37-06)?**
   - What we know: the lower-bound pattern (`Number.isFinite`) is established; D-17 requires
     symmetry with an upper bound but does not specify a value.
   - What's unclear: whether a fixed offset (e.g., "reject anything > 24h in the future") or a
     different heuristic (e.g., reject anything after the process start time + some slack) is more
     appropriate given this is a locally-generated timestamp, not a network-supplied one.
   - Recommendation: planner/implementer discretion per CONTEXT.md's "Claude's Discretion" section;
     a generous bound (days, not minutes) that only catches genuine corruption/clock-skew rather
     than normal operation is safest, since false-rejection risk (declining a legitimate write)
     is asymmetric with the current bug's risk (a corrupted value winning forever).

2. **Does 37-04's root cause (async `getGameInfo()` population gap) warrant its own follow-up
   todo, or is the `appName` fallback sufficient long-term?**
   - What we know: GOG/Legendary have a synchronous-load pattern Steam lacks; D-09 explicitly
     defers this decision, gating only the fallback.
   - What's unclear: whether the async gap causes other, non-title symptoms elsewhere that would
     justify closing it structurally.
   - Recommendation: file the follow-up todo as part of 37-04's plan per D-09's explicit
     instruction ("If the cause widens the phase, record a todo rather than holding 37-04 open").

## Environment Availability

Skipped — this phase is pure in-repo TypeScript/React code changes with zero new external tool,
service, or runtime dependencies. All required tooling (Node, pnpm, jest, ts-jest) is already
confirmed present and in active use by the existing `pnpm test`/`pnpm test:ci` scripts.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (via `ts-jest` preset) 29.x, multi-project config (`backend`, `common`, `frontend`, `preload`, `meta`) |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest <path-to-specific-test-file> --silent` (e.g., `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts`) |
| Full suite command | `pnpm test:ci` (`jest --runInBand --silent`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-37-01 (37-02) | Decode-stage failure classified distinctly from connection-drop | unit | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t classifyDepotError` | ✅ (extend existing describe block) |
| REQ-37-02 (37-03) | Delisted+installed game visible/launchable by default; `isGameAvailable()` no longer gates on `is_delisted` | unit + live gate | `npx jest src/frontend/screens/Library/__tests__/filterEngine.test.ts` + `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t isGameAvailable`; live: verify Dead Island (91310) renders/launches | ✅ existing files, ❌ new `isGameAvailable`+`is_delisted` case — Wave 0 |
| REQ-37-03 (37-04) | Install-failure title never empty | unit | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts` (confirm file exists during planning) | ❌ likely Wave 0 — targeted grep found no existing title-fallback test |
| REQ-37-04 (37-05) | No spurious abort-controller-miss log on plan-build failure; user-cancel unaffected | unit + integration | `npx jest src/backend/utils/aborthandler/__tests__/aborthandler.test.ts` (existing groundwork) + new integration test at the `games.ts`/`utils.ts` seam | ✅ unit groundwork exists, ❌ integration-level "never registered" case — Wave 0 |
| REQ-37-05 (37-06) | `platformsCapturedAt` rejects absurdly-large/future values from both existing and incoming sides | unit | `npx jest src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts` | ✅ file exists (9 tests), ❌ upper-bound case — Wave 0 |
| REQ-37-06 (37-10) | Apostrophe installdir passes through unchanged; traversal/absolute/separator still rejected | unit | `npx jest src/backend/storeManagers/steam/__tests__/installLocation.test.ts` | ✅ file exists (rich WR-04 suite), ❌ apostrophe-specific case — Wave 0 |

### Sampling Rate

- **Per task commit:** run the single affected test file (quick run command above).
- **Per wave merge:** `pnpm test:ci` (full suite, `--runInBand --silent`).
- **Phase gate:** Full suite green before `/gsd:verify-work`, PLUS the live Dead Island verification
  named non-negotiable in CONTEXT.md's `<specifics>` section — a green suite alone does not close
  37-03 (this repo's ledger records "a live gate beating a green suite three separate times").

### Wave 0 Gaps

- [ ] `filterEngine.test.ts:169-183` — flip the existing "delisted counts as non-available" test
  from asserting forced-hide to asserting default-visible (RED→GREEN by design, not a new file).
- [ ] `games.test.ts` — new test(s) for `isGameAvailable()` with `is_delisted: true` +
  `is_installed: true`, asserting it no longer returns `false`.
- [ ] `platformPrecedence.test.ts` — new test for an absurdly-large-but-finite / future
  `existingCapturedAt`, and one for a corrupted incoming `capturedAt`.
- [ ] `installLocation.test.ts` — new WR-04-style test for an apostrophe-containing installdir
  passing through unchanged, plus a test proving the `!candidate` branch now logs at WARNING
  (Correction §3's "no log at all" gap).
- [ ] `downloadmanager/utils.test.ts` (confirm exact path during planning) — new test for the
  `title` fallback to `appName` when `getGameInfo()` returns an empty object.
- [ ] Integration-level test at the `games.ts` install-flow / `utils.ts` terminal-error seam —
  asserting no `callAbortController`-miss ERROR log when a pre-download step throws before
  `runNativeDepotDownload` is ever reached, and a separate assertion that user-cancel
  (`stopCurrentDownload`) is unaffected.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | 37-10's `sanitizeInstalldir` is exactly a path-injection/traversal control — containment validation against a resolved root (mirroring `resolveContainedPath`), not a character-class allow-list. This is the phase's one genuine security-relevant surface. |
| V2 Authentication | no | No auth-flow changes in this phase; D-07 only surfaces an existing no-refresh-token condition as a UI affordance. |
| V3 Session Management | no | Not touched. |
| V4 Access Control | no | Not touched. |
| V6 Cryptography | no | Not touched. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via externally-supplied PICS `installdir` value escaping the install root | Tampering | Containment validation against a resolved root (D-02) — this is the ONLY change; the existing denylist (separators, `..`, leading/trailing dots, control chars) stays as defense-in-depth, per CONTEXT.md's explicit warning against a naive character-class widening. |

No other STRIDE-relevant pattern applies to this defect cluster — the remaining five defects are
data-correctness/observability bugs (misclassified errors, stale filter state, unbounded timestamp
comparison, empty title, spurious log line), not security boundaries.

## Sources

### Primary (HIGH confidence — direct codebase reads at HEAD, 2026-08-22)
- `.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-CONTEXT.md` — full read, all decisions D-01–D-17
- `.planning/todos/pending/2026-08-21-*.md` (five files) and `2026-08-22-apostrophe-installdir-rejected-as-hostile.md` — full reads
- `src/backend/storeManagers/steam/games.ts`, `depot.ts`, `depotErrors.ts`, `installLocation.ts`, `platformPrecedence.ts`, `library.ts`, `depot/decompress.ts` — targeted full-section reads
- `src/backend/downloadmanager/utils.ts`, `downloadqueue.ts`, `src/backend/utils/aborthandler/aborthandler.ts` — full/targeted reads
- `src/frontend/screens/Library/filterEngine.ts`, `src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx`, `.../FilterFacetGroup/selectionCount.ts`, `src/frontend/screens/Library/components/GameCard/index.tsx`, `.../FilterChipRow/chipLabels.ts`, `src/frontend/screens/ConsoleMode/{selectors,index}.tsx`, `src/frontend/screens/Library/components/LibraryHeader/gameCount.ts`, `src/frontend/hooks/constants.ts` — targeted reads
- All corresponding `__tests__/*.test.ts` files for every module above — grepped for `describe`/`it` block coverage
- `.claude/skills/spike-findings-gamelib/SKILL.md` and `.claude/skills/sketch-findings-gamelib/SKILL.md` + `references/library-filtering.md` — full reads, per CONTEXT.md's required-reading canonical ref
- `.planning/REQUIREMENTS.md` — grepped for `LIB-07`/`LIB-08`/`LIB-09`/`REQ-37`
- `.planning/config.json` — read for `nyquist_validation`/`security_enforcement` (both absent → treated as enabled per default policy)
- `jest.config.js`, `package.json` — read for test commands

### Secondary (MEDIUM confidence)
None — no external documentation or web sources were needed for this defect-fix phase.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no new stack decisions in this phase
- Architecture: HIGH — every architectural claim is a direct read of existing, running code at HEAD
- Pitfalls: HIGH — all three pitfalls are derived from tracing actual call chains, not inference
- Unknowns resolution: HIGH — all three CONTEXT.md-flagged unknowns closed via code-structure evidence, not speculation

**Research date:** 2026-08-22
**Valid until:** Until the next commit touches any of the files listed in Per-Defect Implementation
Surface — this research is a snapshot of HEAD and will drift the moment implementation begins (by
design; the planner should treat line numbers as approximate once plans start executing).
