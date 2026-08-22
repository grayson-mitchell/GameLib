---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
verified: 2026-08-22T18:30:00Z
status: passed
score: 15/15 truths verified (G-01 closed after verification, in 57416750e)
overrides_applied: 0
gaps:
  - truth: "REQ-37-02 / D-10: the new noStorePage tri-state facet inherits the chip row, the group badge, AND zero-result handling — the same three things showHidden/showNonAvailable get"
    status: RESOLVED
    reason: >-
      The chip row (FilterChipRow/index.tsx + chipLabels.ts), the group badge
      (MORE_FILTER_KINDS + describeActiveFilters + selectionCount.ts), and
      clearAllFilters are all correctly extended to cover noStorePage (verified
      by direct source read; clearAllFilters was the one the live gate caught
      and fixed in 6cada93a7). The one inheritance point NOT extended is
      EmptyLibrary/index.tsx's LIB-09 context-aware empty-state message: it
      branches on `showHidden === 'only'` and `showNonAvailable === 'only'`
      to render a specific "No hidden games" / "No non-available games"
      message, but has no equivalent branch for `noStorePage === 'only'`.
      Selecting "No store page only" on a library with zero delisted games
      (or after external state changes) falls through to the generic "The
      current filters produced no results" message instead of a dedicated
      one. This does not hide any game and does not affect the phase's core
      goal clauses (a/b/c) — Dead Island's live-gate visibility, launchability
      and filterability are all independently confirmed — but it is a literal
      unmet clause of a must_have truth recorded in 37-03b-PLAN.md's own
      frontmatter, and nothing in any SUMMARY or the code review flagged it.
    resolution: >-
      CLOSED 2026-08-22 in commit 57416750e, after this report was written.
      EmptyLibrary now branches on noStorePage === 'only' and renders
      "No games without a store page in your library" from a new
      gamelib:library.no_no_store_page_games key (gamelib: namespace per
      37-03b's convention and D-06, not the upstream translation.json).
      The branch block was reworked to an explicit `onlyCount`, so the
      multi-'only' union case is deliberate rather than emergent. Six tests
      added -- the first EmptyLibrary has ever had -- which RENDER the
      component rather than scanning its source, covering each tri-state
      alone plus the two- and three-way unions. Mutation-checked: removing
      the new branch fails exactly one test and leaves the other five green.
    artifacts:
      - path: "src/frontend/screens/Library/components/EmptyLibrary/index.tsx"
        issue: "RESOLVED — noStorePage === 'only' branch added (57416750e)"
      - path: "src/frontend/screens/Library/components/EmptyLibrary/__tests__/index.test.tsx"
        issue: "RESOLVED — new behavioural gate, mutation-checked"
    missing:
      - "Add an `else if (noStorePage === 'only' && showHidden !== 'only' && showNonAvailable !== 'only')` branch rendering a dedicated message (e.g. a new `library.no_delisted_games` / 'No games without a store page' key), mirroring the existing showHidden/showNonAvailable branches"
      - "A regression test for EmptyLibrary (none currently exist for this component) covering all three tri/bi-state 'only' messages, including the new one"
human_verification: []
---

# Phase 37: Steam defect cluster — depot decode failure, false-delisted games, and install-error reporting — Verification Report

**Phase Goal:** Close seven open Steam defects surfaced by the 34.13 UAT gate on 2026-08-21 real
install attempts: (a) a native depot install for a mac-depot title either succeeds or fails with a
message naming the actual cause, (b) no owned, non-delisted game is hidden from the library by a
flag nothing can clear, (c) a failure surface names the game it is talking about.

**Verified:** 2026-08-22T18:30:00Z (HEAD `f7287f330`)
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (a) A depot chunk that fails to DECODE is never reported as "Steam servers dropped the connection" | ✓ VERIFIED | `depotErrors.ts`'s `/failed after \d+ attempts/` term removed from the network alternation (D-08); decode-stage exhaustion carries `.code` via `fetchChunk`'s `finalErr` and is caught by a dedicated `decodeFailed` branch checked before the CDN/connection alternation. Test `depot.test.ts:3036` ("classifies as decodeFailed, NOT connectionDropped") passes. |
| 2 | (a) Genuine network exhaustion (ECONNRESET/ETIMEDOUT/CDN `<status>`/fetch failed/no content servers) still classifies as `connectionDropped` — the over-correction guard | ✓ VERIFIED | `depot.test.ts:3053` ("a bare ECONNRESET still classifies as connectionDropped with action retry (genuine-network regression guard)") passes; `depot.test.ts:3004` (D-UAT-08, ECONNRESET-with-no-eresult through the decrypt-key wrapper) passes. Ran both live: green. |
| 3 | (a) An auth abort (no CM connection at plan-build) gets its own message + a "Sign in to Steam" affordance that actually navigates, not a dead button (D-07) | ✓ VERIFIED (code); advisory click-through not exercised | `depotErrors.ts` returns `action: 'signIn'` on the `/no authenticated Steam CM connection/i` branch → `downloadmanager/utils.ts:382` builds a `buttons: [{action: 'steamSignIn'}]` array only when `installErrorAction === 'signIn'` → `DialogHandler/index.tsx:19-20` maps `case 'steamSignIn': return () => navigate('/login')`. Traced end-to-end by direct source read; unit test `utils.test.ts:303` pins the button shape. The live click-through (37-02 Task 4) is `gate="advisory"`, explicitly non-blocking by the plan's own contract, and was recorded "not observed this session" in 37-02-SUMMARY.md — an accepted terminal state per the plan, not re-litigated here. |
| 4 | (a) The classifier reads `.code`/`.eresult` off the ORIGINAL error object, not a pre-flattened string (D-08 landmine) | ✓ VERIFIED | `depot.ts:2443` pushes `{file, error: err.message, cause: err}` into `failures[]`; both `depot.ts:3016` and `:3067` classify `result.failures[0].cause ?? result.failures[0].error` / the thrown `err` directly — the original object, never the flattened string alone. |
| 5 | (b) No owned, non-delisted game is hidden by a flag nothing can clear — BOTH enforcement points removed in one change (D-15) | ✓ VERIFIED | `SteamGame.isGameAvailable()` (`games.ts:2755-2773`): the LIB-07 delisted gate is gone, comment reads "SUPERSEDED by REQ-37-02 D-15". `filterEngine.ts`: the `game.runner === 'steam' && !!game.is_delisted` clause is removed from `isNonAvailableGame` (comment at line 242 confirms removal) and replaced by an independent `isNoStorePageGame` local used only by the new `noStorePage` tri-state, never folding into `nonAvailableGames`. |
| 6 | (b) Console Mode lifts the same forced-hide on a second screen (D-13) | ✓ VERIFIED | `ConsoleMode/selectors.ts` comment: "REQ-37-02 / D-13: GAP-B `!g.is_delisted` exclusion below is REMOVED." `ConsoleMode/index.tsx`'s `activateGame` (lines 248-263) has no `is_delisted` early return left. |
| 7 | (b) Live case: Dead Island (91310) appears in the grid, launches, appears in console mode, hides only when the user actively selects `hide` | ✓ VERIFIED (live gate) | 37-03b-SUMMARY.md records a 9/9 human-check pass against a real `pnpm tauri:dev` session: header 384→375 under `hide` (exactly the 9 known titles), console mode renders Dead Island, card shows normal install/launch affordances (launch itself untestable — i386 binary on arm64 host, a hardware fact not a code defect). One real defect found live ("Clear all" not clearing the new chip) and fixed in `6cada93a7`, re-tested green. |
| 8 | (b) `is_delisted` detection is unchanged; no migration clears the stored flags | ✓ VERIFIED | `games.ts:648-665` write logic untouched (`delistedInfo`, the `!existing.is_delisted && !depotSignalCaptured(cached)` gate, the "MUST NOT set is_delisted here" comment on the network-blip path all intact). No `Migration` file added anywhere in the diff. |
| 9 | (b) The new "No store page" tri-state facet's mirrors (`MORE_FILTER_KINDS`, `describeActiveFilters`, the chip-removal switch, `clearAllFilters`) all carry the sixth kind — no missed mirror | ✓ VERIFIED (3/4 known mirrors) — 1 gap found (see below) | `MORE_FILTER_KINDS` (`selectionCount.ts:39-52`) includes `noStorePage`; `describeActiveFilters` (`filterEngine.ts:499-504`) emits its descriptor; `FilterChipRow/index.tsx`'s `removeFilter` switch (line 150) and `chipLabels.ts` (line 159) both have a `noStorePage` case; `clearAllFilters` (`Library/index.tsx:990`) calls `handleNoStorePage('off')` — this was the mirror the live gate caught and fixed (`6cada93a7`). **A FOURTH mirror was found incomplete by this verification: `EmptyLibrary/index.tsx`'s zero-result context-aware messaging has no `noStorePage === 'only'` branch — see Gaps.** |
| 10 | (b) Install-with-options doors stay closed for delisted games (D-14) | ✓ VERIFIED | `steamInstallOptionsEntry.ts` still gates all three affordances on `!isDelisted` (lines 72, 81, 113) — unchanged. |
| 11 | (b) Stale doc comment/term correction: `gameCount.ts`'s `!game.is_delisted` term and `hooks/constants.ts:156`'s "keeps hiding it regardless" comment | ✓ VERIFIED | No `is_delisted` reference remains in `gameCount.ts`; `hooks/constants.ts:155-156` now reads "no delisted OR clause — so dropping a delisted game's entry here DOES make it [disappear]", consistent with the new behaviour. `Library/index.tsx:958-961`'s I-01 comment (review finding) also corrected to drop "non-delisted". |
| 12 | (c) A failed Steam install always names a game — `title` falls back to `appName`, never an empty string | ✓ VERIFIED | `resolveQueueElementTitle` (`downloadmanager/utils.ts:53-60`) returns `title \|\| appName`; both `installQueueElement` and `updateQueueElement` funnel through it. Test suite `utils.test.ts:778-825` (`REQ-37-03`) asserts on the RENDERED dialog message (not the options object), confirming `dialogArg.message` contains the appid and never matches `/installation of\s+failed/i`. |
| 13 | A terminal Steam install failure no longer logs the misleading "Aborting not possible. Could not find a matching abort controller" ERROR, and a user-initiated cancel is unaffected | ✓ VERIFIED | `hasAbortController` (`aborthandler.ts:80-82`) gates `downloadmanager/utils.ts:336`'s terminal-error branch — `callAbortController` is only invoked when a controller is genuinely registered; otherwise an honest WARNING naming the appName is logged instead. Test `utils.test.ts:848-889` exercises both the RED-then-GREEN miss case and the user-cancel pin (registered controller still aborts, no miss logged) plus an ordering pin on `downloadqueue.ts`'s synchronous `callAbortController` → `.stop(false)` sequence. |
| 14 | `resolvePlatformWrite` bounds `platformsCapturedAt` from above as well as below, and validates the INCOMING `capturedAt` the same way (D-17, symmetric) | ✓ VERIFIED | `platformPrecedence.ts`: `MAX_CLOCK_SKEW_MS` (24h) + `isPlausibleCapturedAt` applied to BOTH `existingCapturedAt` (line ~163) and `capturedAt` (IN-01, same predicate, clamped to `now` rather than persisted). 23/23 tests in `platformPrecedence.test.ts` pass, including the named D-17 bidirectional pin. |
| 15 | A legitimate PICS installdir with ordinary punctuation (apostrophe) is used as-is; a containment violation ABORTS the install (never a silent fallback), and the raw untrusted candidate reaches the log but NOT the user-facing dialog (C-01 fix) | ✓ VERIFIED | `installLocation.ts`'s `sanitizeInstalldir`: denylist no longer includes plain punctuation, containment check via `resolve`/`relative` against `steamapps/common`, throws `UnsafeInstalldirError` on violation. `games.ts:1640-1649`: catches `UnsafeInstalldirError`, logs the raw candidate at WARNING, but returns `error: classifyDepotError(err).message` (the classified, generic "unsafe file path" copy) — NOT `err.message`. Test `games.test.ts:2163` ("T-37-01/T-37-03/C-01") drives this through `SteamGame.install()` itself (the actual production path, not an isolated classifier call) and asserts the raw candidate is absent from `result.error` but present in the `logWarning` call. |

**Score:** 14/15 truths fully verified, 1 partial (truth #9 — see Gaps).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/storeManagers/steam/depotErrors.ts` | Cause-based classification, structured `action` field, decode/auth branches | ✓ VERIFIED | All branches present, action field on every return, tests green |
| `src/backend/storeManagers/steam/depot.ts` | Both classifier call sites pass original error/cause | ✓ VERIFIED | `:3016`, `:3067` |
| `src/backend/storeManagers/steam/games.ts` | `isGameAvailable()` LIB-07 gate removed; `classifyDepotError` called on `UnsafeInstalldirError` path | ✓ VERIFIED | Confirmed both |
| `src/frontend/screens/Library/filterEngine.ts` | `isNonAvailableGame` delisted clause removed; `noStorePage` tri-state added | ✓ VERIFIED | |
| `src/frontend/screens/Library/components/EmptyLibrary/index.tsx` | Zero-result handling for the new facet (per D-10) | ✗ STUB (incomplete) | No `noStorePage` branch — see Gaps |
| `src/backend/downloadmanager/utils.ts` | `title` fallback, `hasAbortController` gate, `signIn` button wiring | ✓ VERIFIED | All three present and tested |
| `src/backend/storeManagers/steam/platformPrecedence.ts` | Symmetric upper/lower bound on both timestamps | ✓ VERIFIED | |
| `src/backend/storeManagers/steam/installLocation.ts` | Containment + narrow denylist, split fallback triggers | ✓ VERIFIED | |
| `src/frontend/components/UI/DialogHandler/index.tsx` | `steamSignIn` → `navigate('/login')` | ✓ VERIFIED | No dedicated test file exists for this component (pre-existing gap, not introduced by phase 37) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `depot.ts` (both call sites) | `classifyDepotError` | passes `cause ?? error` / thrown `err` | ✓ WIRED | |
| `games.ts` (`UnsafeInstalldirError` catch) | `classifyDepotError` | `classifyDepotError(err).message` | ✓ WIRED | Fixed in `f7287f330` (C-01); confirmed by production-path test |
| `downloadmanager/utils.ts` | `hasAbortController`/`callAbortController` | gate-before-call | ✓ WIRED | |
| `downloadmanager/utils.ts` (buttons) | `DialogHandler` (`steamSignIn`) | `action: 'steamSignIn'` string contract | ✓ WIRED | Traced by source read across the IPC/dialog boundary |
| `FilterMoreGroup` / chip row / `selectionCount.ts` | `filterEngine.ts`'s `noStorePage` state | `MORE_FILTER_KINDS`, `describeActiveFilters`, switch cases | ✓ WIRED | |
| `EmptyLibrary/index.tsx` | `filterEngine.ts`'s `noStorePage` state | (none) | ✗ NOT WIRED | Component never reads `noStorePage` from `LibraryContext` at all |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| REQ-37-01 | 37-02 | Decode failure misreported as dropped connection | ✓ SATISFIED | Truths 1-4 |
| REQ-37-02 | 37-03a, 37-03b | Nine owned games permanently flagged delisted and hidden | ⚠ PARTIAL | Truths 5-11 verified; truth 9's EmptyLibrary mirror incomplete |
| REQ-37-03 | 37-04 | Install-failed dialog renders an empty game title | ✓ SATISFIED | Truth 12 |
| REQ-37-04 | 37-05 | Abort-controller missing on terminal Steam install failure | ✓ SATISFIED | Truth 13 |
| REQ-37-05 | 37-06 | Platform-precedence timestamp has no upper bound | ✓ SATISFIED | Truth 14 |
| REQ-37-06 | 37-10 | Apostrophe installdir rejected as hostile | ✓ SATISFIED | Truth 15 |

No orphaned requirements: REQUIREMENTS.md's Phase 37 block mints exactly REQ-37-01..06, and all six are claimed by exactly one plan each (per the documented offset mapping). `37-07`'s would-be requirement was never minted (D-01, correctly recorded).

**Documentation note (non-blocking):** `.planning/REQUIREMENTS.md` lines 983-988 still show unchecked `- [ ]` boxes for REQ-37-01 through REQ-37-06, while the summary table at lines 281-286 marks all six "Complete". This is a bookkeeping inconsistency in the requirements doc, not a code defect — flagged for whoever next edits that file, not treated as a gap here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/frontend/screens/Library/components/EmptyLibrary/index.tsx` | 46-60 | Missing case in a manually-mirrored state machine (the same class of defect this phase already fixed 3 times elsewhere: `MORE_FILTER_KINDS`, `describeActiveFilters`, `clearAllFilters`) | ⚠ Warning | See Gaps — does not hide any game, degrades empty-state copy only |
| `src/frontend/screens/Library/components/GameCard/index.tsx` | 329 | WR-01 (code review) fixed in substance (runner guard added) but by duplicating the predicate inline rather than exporting/reusing `filterEngine.ts`'s local `isNoStorePageGame` (which itself is still unexported, module-private) — the drift risk the review warned about is mitigated for now but not structurally closed | ℹ Info | No current behavioral defect; same class of drift this repo has been bitten by before (`chipLabels.ts` `PRESET_UNCATEGORIZED` precedent cited in the review) |
| `meta/i18nForkTouchedFiles.json` | — | Pre-existing red suite (`genI18nGateScope.test.ts`), short by 10 files, 1 of which (`DialogHandler/index.tsx`) belongs to phase 37 | ℹ Info | Confirmed pre-existing via full `npx jest` run (1 failed / 6518 passed / 3 skipped, same single suite red before and unrelated to any phase-37 file's behavior) — not a phase 37 regression, but outstanding artifact debt as already recorded in `deferred-items.md` |

No `TBD`/`FIXME`/`XXX` debt markers found in any file touched by this phase's SUMMARYs.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Decode-stage failure classifies as decodeFailed, not connectionDropped | `npx jest depot.test.ts -t "37-02 Task 2"` | 4 passed | ✓ PASS |
| Bare ECONNRESET still classifies as connectionDropped | (same run) | passed | ✓ PASS |
| C-01 fix: `SteamGame.install()` never leaks raw PICS candidate to `InstallResult.error` | `npx jest games.test.ts -t "C-01"` | 1 passed | ✓ PASS |
| Install-failure dialog always names a game (title fallback) | `npx jest utils.test.ts` (34 tests) | 34 passed | ✓ PASS |
| Abort-controller miss no longer logs spurious ERROR; user-cancel unaffected | (same run) | passed | ✓ PASS |
| Platform precedence upper/lower bound, symmetric validation | `npx jest platformPrecedence.test.ts` | 23 passed | ✓ PASS |
| Installdir containment/denylist, apostrophe passes | `npx jest installLocation.test.ts` | all passed | ✓ PASS |
| `tsc --noEmit` across the whole project | `npx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Full suite regression check | `npx jest` (whole repo) | 315/316 suites, 6518/6522 tests passed, 1 pre-existing failure (`genI18nGateScope`), 3 skipped | ✓ PASS (no phase-37 regression) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files exist in this repository and no plan/SUMMARY/VALIDATION document for this phase references a probe script. This phase's non-vacuity discipline is unit-test RED/GREEN pairs plus one live human gate (37-03b Task 4), both verified directly above.

### Human Verification Required

None outstanding that require escalation. Two previously-identified items are already correctly recorded as non-blocking/accepted by their own governing documents and are not re-opened here:

1. **37-02 Task 4 (auth-branch live click-through)** — `gate="advisory"`, plan's own acceptance criteria treat "not observed this session" as a valid terminal state (discharged in 37-02-SUMMARY.md). Independently confirmed correct by source-code trace (see truth #3) even though the live click was not exercised.
2. **Dead Island (91310) actual launch** — untestable on this hardware (`Mach-O executable i386` on an arm64 host; Rosetta 2 is x86_64-only). The live gate verified the launch AFFORDANCE (normal install/launch controls render, no `notAvailable` styling), which is the only observable thing possible here. This is a hardware fact, not a code defect.

### Gaps Summary

Fourteen of fifteen observable truths are fully verified against the actual codebase, with production-path tests (not isolated-function tests) for the two places this phase's own code review found the same class of defect previously (C-01's `classifyDepotError` reachability, and the live-gate-caught `clearAllFilters` mirror). All three requirement clauses in the phase goal — (a) depot failures name their real cause, (b) no owned game is permanently hidden by an unclearable flag, (c) failure dialogs always name a game — are demonstrated true in the codebase, not merely claimed in a SUMMARY.

One gap was found by this verification that no SUMMARY or the code review caught: `EmptyLibrary/index.tsx`'s zero-result messaging — explicitly promised by D-10 ("it inherits the chip row, the group badge and zero-result handling") and recorded as a literal must_have truth in `37-03b-PLAN.md`'s own frontmatter — was not extended to the new `noStorePage` facet. This is the fourth instance of the "manually-mirrored list can drift" defect class this phase already fixed three times elsewhere (`MORE_FILTER_KINDS`, `describeActiveFilters`, `clearAllFilters`), just in a component (`EmptyLibrary`) nobody's plan, SUMMARY, or the code review mentioned by name. It does not hide any game and does not block the phase's core goal — Dead Island's visibility, launchability and filterability are all independently confirmed live — but it is a real, unmet clause of a locked decision (D-10) and a plan-declared must_have, so it is reported as a gap rather than smoothed into an info note.

---

*Verified: 2026-08-22T18:30:00Z*
*Verifier: Claude (gsd-verifier)*
