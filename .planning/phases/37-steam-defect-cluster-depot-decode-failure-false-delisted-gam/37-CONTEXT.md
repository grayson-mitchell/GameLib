# Phase 37: Steam defect cluster — depot decode failure, false-delisted games, and install-error reporting - Context

**Gathered:** 2026-08-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A defect cluster, not a feature. Every item is an open todo in `.planning/todos/pending/`,
re-verified live at HEAD on 2026-08-22.

**Already closed by live gates — do not re-plan:** 37-01, 37-08, 37-09, 37-11.

**Open and in scope:** 37-02 (decode failure misreported as a dropped connection), 37-03
(store-availability flag used as a library-visibility filter), 37-04 (empty game title on the
install-failure dialog), 37-05 (abort-controller lookup miss), 37-06 (platform-precedence
timestamp unbounded from above), 37-10 (apostrophe installdir rejected as hostile).

**Dropped from the phase during discussion:** 37-07 (startup filesystem orphan scan). See D-01.

**Phase-wide constraint, carried from ROADMAP.md:** no `Migration` may be used as a repair
path. `MigrationSystem` is dead code under Tauri — `applyMigrations()` is wired only into
Electron's `app.whenReady()`, so a new `Migration` ships as a silent no-op. Any repair of
already-written state must self-heal at the READ boundary.

This discussion clarified HOW to implement six open defect fixes. It did not add capability.

</domain>

<decisions>
## Implementation Decisions

### Orphan scan (37-07) — DROPPED

- **D-01:** 37-07 does not ship. Nothing goes into the app; the user cleans up the residue by
  hand after 37-10 lands. Driven by measurement, not preference: the scan's signal ratio is
  **1.2%** — 425 MB of real GameLib residue against 35.6 GB of directories it would flag. The
  external user population it would serve is **empty by construction**, because the `260821-rb5`
  breadcrumb fix shipped 2026-08-21 and any future user's first install postdates it.
  Remove the plan slot; keep the todo filed as won't-do-now, not as pending work.

### Installdir rejection (37-10)

- **D-02:** `sanitizeInstalldir` decides acceptability by **containment validation against the
  install root** (mirroring `resolveContainedPath`), **plus** a narrow explicit denylist: path
  separators, `..`, leading/trailing dots, control characters. Apostrophes and ordinary
  filename punctuation pass. Do **not** simply widen the `SAFE_INSTALLDIR` character class —
  the check exists to stop a hostile PICS response escaping the install root, and a widening
  without a RED traversal test trades this defect for a worse one.
- **D-03:** Both callers keep the single shared funnel. One validator, one call path.
- **D-04:** The two fallback triggers **split**, because they are different events wearing one
  code path today:
  - a **containment violation** is a security event → **ABORT the install**, message names the
    rejected value, no silent fallback write;
  - an **absent or unresolved** installdir keeps the `app_<id>` fallback (it must not hard-fail
    an install) but logs at WARNING and surfaces in the install result.
- **D-05:** `app_8930` / `app_25900` / `app_257350` — 16.2 GB of working but mis-named installs
  — are **left alone**. Their ACF `installdir` values match their directory names exactly
  (verified from `appmanifest_*.acf`), so they work; the only harm is a non-portable layout. No
  ACF-rewrite code, and no incursion into Phase 23's manifest-write path.

### Failure copy and affordances (37-02, 37-04)

- **D-06:** A **structured field drives the UI**. The classifier returns a
  retryability/action signal alongside `{key, message}`. "Retry to continue." comes **out of
  the message strings entirely** — affordances stop being encoded in translated prose.
- **D-07:** The auth case (plan-build aborting with no stored refresh token) gets its own
  message plus a **"Sign in to Steam"** affordance. Retryable causes keep Retry. Today the auth
  failure hits the generic branch because no pattern matches it.
- **D-08:** The `failed after \d+ attempts` term is **removed from the network alternation
  entirely**. It describes the *shape* of a failure, not its cause. `fetchChunk`'s exhaustion
  wrapper carries the underlying cause forward so the classifier branches on WHY retries ran
  out. Genuine network exhaustion still matches `ECONNRESET` / `ETIMEDOUT` / `CDN \d` etc.
- **D-09:** For 37-04 the **fallback ships** — `title` falls back to `appName` (the appid),
  never an empty string. The root cause of the empty `title` is investigated but is **NOT a
  gate**. If the cause widens the phase, record a todo rather than holding 37-04 open.

### Delisted facet, placement and label (37-03)

Product decision already recorded in the todo and not re-litigated here: `is_delisted` is
demoted from a forced hide to **user-driven filterable state**, detection is CORRECT and
unchanged, and there is **no migration** (the stored flags are accurate — all nine genuinely
return `success: false`, with a passing control).

- **D-10:** The filter is a **tri-state row inside the existing "More filters" group**
  (`FilterMoreGroup`), beside "Show Hidden" and "Show non-Available games". No new facet group.
  It inherits the chip row, the group badge and zero-result handling; it costs one new
  descriptor kind added to `MORE_FILTER_KINDS`.
- **D-11:** The three states are **`off` / `only` / `hide`** — NOT the neighbours'
  `off`/`show`/`only`. Neutral `off` means *not filtering*: delisted games are visible, no
  descriptor is emitted, no chip appears. Clicking the row cycles to `hide` (the old forced
  behaviour, now opt-in); the "only" button isolates them.

  **Why the neutral had to move:** `describeActiveFilters` emits a descriptor whenever a
  tri-state is `!== 'off'`. A "Show delisted" row defaulting to `'show'` would put a chip in the
  chip row and "1 selected" on the group badge for every user on a virgin library, with zero
  action taken. The alternative — a per-row exception suppressing the descriptor at `'show'` —
  was rejected because `selectionCount.ts`'s header comment relies on that rule being uniform,
  and this repo has already been bitten by a second implementation of "what counts as active"
  drifting from the first.
- **D-12:** The row label and the card badge both read **"No store page"**. That is literally
  what Steam's `success: false` means and is true for all nine without PICS. It also survives
  the deferred option-3 refinement: if PICS later separates genuinely-withdrawn from
  never-listed, "No store page" becomes the parent term and "Delisted" can be added underneath
  as a narrower row.

  Rejected: keeping "Game no longer available". Two of the nine (`Starbound - Unstable` 367540,
  `Rust - Staging Branch` 700580) are **branch entries that were never listed** — "no longer
  available" asserts a claim the data cannot support, and with nothing hidden the badge becomes
  the primary signal rather than a footnote.

  **Implementation trap:** the badge already renders
  `t2('library.delisted', 'Game no longer available')` at `GameCard/index.tsx:537`. Changing the
  `t()` **default argument** is a silent no-op once the key exists in the catalog. This rename
  needs a **NEW key**.
- **D-13:** **Console mode lifts too.** `ConsoleMode/selectors.ts:22` drops delisted games from
  the grid and `ConsoleMode/index.tsx:253`'s `activateGame` early-returns on `is_delisted`. That
  is the same forced-hide defect on a second screen — without this, Dead Island is visible and
  launchable in the library and still invisible in console mode.
- **D-14:** **The "Install with options…" doors stay CLOSED.** `steamInstallOptionsEntry.ts`
  gates all three on `!isDelisted`, and 34.13 review C-04 closed the third one deliberately.
  Native depot install reads PICS, not the store page, so install may well work for the eight
  uninstalled titles — but that is **UNVERIFIED**, and re-opening a door that was closed on
  purpose without first proving a delisted install succeeds would trade this defect for a worse
  one. File a todo to measure it (see Deferred).
- **D-15 (FORCED, not discretionary): `SteamGame.isGameAvailable()`'s LIB-07 delisted gate must
  go in the same change.** Removing the `filterEngine` clause alone does not unhide Dead Island —
  it traps it harder. Once the card mounts, `hasStatus`'s effect calls
  `handleNonAvailableGames` → `isGameAvailable()` returns `false` because of the delisted gate at
  `steam/games.ts:2711` → the appName is pushed onto `nonAvailableGames` → the game is hidden
  again by the **first** clause of the same OR. And 37-08's reconcile cannot heal it: that heal
  fires only when the game is not-installed or available, and Dead Island is installed and
  permanently "unavailable". This is the `reusing-a-state-field-collides-at-existing-readers`
  shape — census the READERS, not the writers.
- **D-16:** Do **not** route the new facet through `nonAvailableGames`. That list means "an
  INSTALLED game whose install_path went missing", has exactly one writer, and reusing it
  collides at every existing reader.

### Platform precedence (37-06)

- **D-17:** Carried from ROADMAP.md, restated so it is not re-litigated in planning: bound
  `platformsCapturedAt` from **above** as well as below, and validate the **incoming**
  `capturedAt` the same way the existing one is validated (WR-02, IN-01). **Do NOT "fix" this by
  ranking the two sources** — freshest-write-wins was chosen deliberately over "appdetails
  always wins" / "PICS always wins".

### Claude's Discretion

- 37-05's abort-controller lookup miss and 37-06's clock-skew bound were surfaced as candidate
  discussion areas and the user declined them: both are pure-implementation defects with no
  product call inside them. Planner decides the shape, subject to D-17 and to 37-05's recorded
  first check (whether a **user-initiated cancel** hits the same miss — that is the case where a
  non-aborting download actually matters).
- The mechanical follow-ons of D-10..D-16 are the planner's to sequence: the
  `!game.is_delisted` term in `gameCount.findSilentlyExcludedGames` (`gameCount.ts:133`) goes
  stale once delisted no longer hides, and the doc comment at `hooks/constants.ts:156` — which
  states the delisted clause "keeps hiding it regardless" — becomes FALSE and must be corrected
  in the same change rather than left as a landmine for the next reader.

### Folded Todos

All six open items ARE the phase; each carries `resolves_phase: 37` and a `planned_as` slot:

- `2026-08-21-decode-failure-misreported-as-servers-dropped-the-connection.md` → 37-02
- `2026-08-21-nine-owned-games-permanently-flagged-delisted-and-hidden.md` → 37-03
- `2026-08-21-install-failed-dialog-renders-an-empty-game-title.md` → 37-04
- `2026-08-21-abort-controller-missing-on-terminal-steam-install-failure.md` → 37-05
- `2026-08-16-platform-precedence-timestamp-has-no-upper-bound.md` → 37-06
- `2026-08-22-apostrophe-installdir-rejected-as-hostile.md` → 37-10

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Todos that define the defects (each is the primary spec for its plan)
- `.planning/todos/pending/2026-08-21-decode-failure-misreported-as-servers-dropped-the-connection.md` — 37-02
- `.planning/todos/pending/2026-08-21-nine-owned-games-permanently-flagged-delisted-and-hidden.md` — 37-03. **Read the `⚠ CORRECTION 2026-08-22` section**: the filed cause (transient store response) is DISPROVEN by direct `curl` measurement with a passing control, and the prescribed fix (retry + migration) fails against that evidence. The DECISION section at the bottom is the live scope.
- `.planning/todos/pending/2026-08-21-install-failed-dialog-renders-an-empty-game-title.md` — 37-04
- `.planning/todos/pending/2026-08-21-abort-controller-missing-on-terminal-steam-install-failure.md` — 37-05
- `.planning/todos/pending/2026-08-16-platform-precedence-timestamp-has-no-upper-bound.md` — 37-06
- `.planning/todos/pending/2026-08-22-apostrophe-installdir-rejected-as-hostile.md` — 37-10. **Its own `CORRECTION 2026-08-22` harm #1 is DISPROVEN** — see Corrections below.
- `.planning/todos/pending/2026-08-21-startup-filesystem-orphan-scan-for-pre-breadcrumb-steam-depo.md` — 37-07, DROPPED by D-01
- `.planning/todos/completed/2026-08-16-aborted-depot-residue-has-no-acf.md` — background for the residue measurements

### Source files each decision lands in
- `src/backend/storeManagers/steam/installLocation.ts` — `SAFE_INSTALLDIR` at :91, the funnel D-02..D-04 reshape
- `src/backend/storeManagers/steam/depotErrors.ts` — classifier, `failed after \d+ attempts` at :175 (D-06..D-08)
- `src/backend/downloadmanager/utils.ts` — `title` fallback at :317 (D-09)
- `src/backend/storeManagers/steam/games.ts` — `is_delisted` write at :640-656, the `!data` guard at :659 that must NOT change, `isGameAvailable()` LIB-07 gate at :2711 (D-15)
- `src/frontend/screens/Library/filterEngine.ts` — `isNonAvailableGame` at :241-249, `describeActiveFilters` tri-state emission at :447-460, `DEFAULT` state at :398-399 (D-10, D-11)
- `src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx` — the tri-state rows D-10 adds to
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts` — `MORE_FILTER_KINDS`, the manual transcription D-10 must extend
- `src/frontend/screens/Library/components/GameCard/index.tsx:537` — existing delisted badge (D-12's new-key trap)
- `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts` — chip text for the new kind
- `src/frontend/screens/ConsoleMode/selectors.ts:22`, `src/frontend/screens/ConsoleMode/index.tsx:253` — D-13
- `src/frontend/helpers/steamInstallOptionsEntry.ts` — D-14, stays as-is
- `src/frontend/hooks/constants.ts:86-215` — `handleNonAvailableGames` / `reconcileNonAvailableGames`; the comment at :156 goes false under D-15
- `src/frontend/screens/Library/components/LibraryHeader/gameCount.ts:133` — stale `!game.is_delisted` term

### Project-level constraints
- `.planning/ROADMAP.md` § Phase 37 — the no-`Migration` constraint and the 37-02-does-not-depend-on-37-01 sequencing note
- `Skill("spike-findings-gamelib")` — Steam native install + ACF adoption patterns
- `Skill("sketch-findings-gamelib")` — the Games library filter panel design decisions (34.11). D-10's row lives inside that panel; its layout rules are ONLY available through this skill.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FilterFacetGroup` / `FilterFacetRow` and `FilterMoreGroup`'s `triState()` helper: D-10's row is one more call to an existing local helper, not a new component.
- `resolveContainedPath`: D-02's containment validation mirrors an existing, already-tested primitive rather than inventing a second path-safety implementation.
- `ChunkDecodeError` with reason codes already exists in `decompress.ts` — D-08 carries an existing typed distinction through the exhaustion wrapper; it does not invent a taxonomy.
- `countDescriptorsOfKind` + `describeActiveFilters`: the single source of truth for "what is active" (34.11 D-26). D-11 was shaped to keep it uniform.

### Established Patterns
- **i18next-parser only resolves STRING-LITERAL arguments.** A literal key with a non-literal default extracts an EMPTY catalog value, and once a key exists i18next renders the catalog value in preference to the call-site default — the row renders blank. Both arguments must be literal at every new `tGamelib()` call site. `FilterRunnabilityFacet` documents this and carries a dev-only drift check; follow that shape.
- `{{count}}` is reserved by i18next — the group badge interpolates on `{{selected}}` for exactly this reason.
- `MORE_FILTER_KINDS` is a MANUAL transcription of `describeActiveFilters`'s More-filters branches and can drift. `facetSelectionCount.test.ts` is the tripwire; a sixth kind must be added in both places.

### Integration Points
- The delisted change is **backend + frontend in one commit** by construction (D-15). A frontend-only change is not a partial fix — it is a regression that traps the target game.
- `depotErrors.ts` returns `{key, message}` today; D-06 widens that return type, so every consumer of the classifier is a call site to census.
- `GRACE_TICKS` and the uninstall poller share a constant (37-11, already closed) — unrelated to these six, noted so nobody re-opens it.

</code_context>

<specifics>
## Specific Ideas

- **The live verification case is named and non-negotiable:** Dead Island (appid 91310) is
  installed (`appmanifest_91310.acf` present) and currently invisible. After the fix it must
  appear in the grid, be launchable, appear in console mode, and disappear only when the user
  actively selects `hide` or filters elsewhere. **A green suite does not prove this** — this
  repo's ledger records a live gate beating a green suite three separate times.
- The nine-game population is stable and re-measurable: 9 on 2026-07-22, the same 9 on
  2026-08-21, the same 9 on 2026-08-22, with a four-title control returning `success: true` over
  the identical method, spacing and network path.
- Closing 37-03 explains **9** of the 22 games once missing from the rendered library and will
  **not** close that item.

</specifics>

<deferred>
## Deferred Ideas

- **PICS/appinfo discrimination of "withdrawn" vs "never listed"** (the todo's option 3). Would
  stop the badge from claiming a store verdict for branch entries like `Starbound - Unstable` and
  `Rust - Staging Branch`. No longer urgent once nothing is hidden, and D-12's "No store page"
  wording is deliberately the parent term so this can be added underneath later. Not this phase.
- **Whether a delisted Steam game can actually be installed from depots.** D-14 keeps the
  install doors closed because the answer is unverified. File a todo to measure it against one of
  the eight uninstalled titles; if it succeeds, re-opening the doors is a small, evidence-backed
  follow-up.
- **37-04's root cause** — why `title` is empty on the Steam error path. Investigated, not gated
  (D-09). If it widens, it becomes a todo.
- **37-07's orphan scan**, dropped by D-01. The 425 MB of real residue (`app_228280`, 47 MB
  partial Baldur's Gate EE with no ACF anywhere; `app_259130`, 378 MB duplicate of the
  ACF-claimed Wasteland dir) is cleaned by hand.

### Reviewed Todos (not folded)
- 37-07 / `2026-08-21-startup-filesystem-orphan-scan-for-pre-breadcrumb-steam-depo.md` — reviewed
  and deliberately dropped, not deferred to a later phase. Its user population is empty by
  construction.

</deferred>

<corrections>
## Corrections to Filed Records

Recorded so a planner does not re-derive a disproven premise.

1. **37-03's filed cause is DISPROVEN.** "A single transient store response hides an owned game
   forever" cannot produce a result stable across a month and reproducible from a cold `curl`.
   `fetchMetadataIfNeeded`'s `entry?.success === false` branch is doing what it says and its
   distinction from the adjacent `!data` branch is sound. **Do not change it**, and do not write
   a migration clearing `is_delisted` — that would be recording a falsehood.
2. **37-10's `CORRECTION 2026-08-22` harm #1 is DISPROVEN by direct measurement.** The claim was
   that "a 4 KB empty stub is left at the correct name … something creates the correctly-named
   directory before the rejection redirects the write."
   `common/Sid Meier's Civilization V` contains only `installscript.vdf` dated 2026-07-19 11:25 —
   a STEAM-written file, one month BEFORE GameLib's 2026-08-22 Civ V attempt. The other three
   stubs (Civ VII, Tomb Raider, Wasteland 2 DC) contain only `.DS_Store`, mtimes 2026-04-05 to
   2026-05-22. All are Steam-uninstall leftovers; **GameLib created none of them.** The
   duplication-risk-by-that-route argument falls with it. Harms #2 (non-portable layout) and #3
   (`app_*` accumulation) stand.
3. **`app_259130`'s real trigger is not the character class.** It was produced by the
   `!candidate` branch (PICS returned nothing) — `installdir` "Wasteland" passes
   `SAFE_INSTALLDIR` cleanly. That branch returns the fallback **with no log at all**, which is
   what D-04's "surface it" half addresses.

</corrections>

---

*Phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam*
*Context gathered: 2026-08-22*
