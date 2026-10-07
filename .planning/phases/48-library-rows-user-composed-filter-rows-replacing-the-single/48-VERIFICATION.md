---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
verified: 2026-10-07T12:00:00Z
status: human_needed
score: 7/8 must-haves verified (R1-R7 from 48-SPEC.md; R3 split into R3-core and R3-gamepad)
covered_files: []
covered_digest: "unavailable: verification.fingerprint is not exposed by the installed gsd-sdk/gsd-tools bridge (Unknown command: verification); not hand-written"
behavior_unverified: 1
overrides_applied: 1
overrides:
  - must_have: "libraryTopSection: recently_played_installed yields Recently-played focus row with installed-only semantics"
    reason: "Operator ruling in 48-05 Task 1: persisted shape has no modifier slot; recency kept, installed-only dropped; installed-only reachable via the grid's Installed view"
    accepted_by: "operator (48-05 plan checkpoint)"
    accepted_at: "2026-10-05T17:36:51+13:00"
re_verification:
  previous_status: gaps_found
  previous_score: 6/7 requirements verified (R7 failed at runtime)
  gaps_closed:
    - "R7 / AC: libraryTopSection favourites (or recently_played) yields the matching focus row on first upgraded launch (CR-01, closed by 48-07, proven by a real-read-path test and live by UAT item 3)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory: []
behavior_unverified_items:
  - truth: "R3 / AC: Gamepad focus moving past the last visible card scrolls that card into view"
    test: "With a controller connected (activeController set) on a Recently-played strip that overflows, move gamepad focus rightwards past the last fully visible card"
    expected: "The newly focused card ends fully inside the track (scrollLeft changes; card right edge <= track right edge)"
    why_human: "The D-06 scroll handler is mounted only when activeController is set (FocusRowStrip/index.tsx:123-143). The only test is a source-regex (focusRowStripSource.test.ts:195), not a behavioural one. UAT item 5's controller half is BLOCKED (no controller connected); its keyboard proxy showed a scripted .focus() on the last rendered card left it 74px past the track edge with scrollLeft unchanged, and cards past index 5 are empty shells until scrolled in"
human_verification:
  - test: "R3-gamepad: gamepad focus past the last visible card (see behavior_unverified_items)"
    expected: "Card scrolled fully into view; focus can reach cards beyond the first rendered page"
    why_human: "SPEC R3 acceptance criterion; no controller was available for UAT item 5 and no behavioural test exists"
  - test: "Real-pointer reach of the forward/back chevrons over an edge card (UAT item 4 hover finding)"
    expected: "With the pointer moved onto a chevron from ABOVE/BELOW/INSIDE the strip (through an edge card, so the card is :hover with transform 1.05 and z-index 2 against the control's z-index 1), elementFromPoint at the chevron centre returns the control (or the click advances scrollLeft), not the card"
    why_human: "UAT clicked the controls with element.click(), which bypasses hit-testing (48-UAT.md Protocol, Operator actions replaced). 48-08 recorded 'whether the control stays clickable in that state was not probed'. By the CSS alone (control z-index 1, .gameCard:hover z-index 2, same stacking context) the hovered card covers the control, so a pointer arriving through the card may hit the card instead; UI-SPEC says the control is 'reachable by pointer'. Unproven either way, one real-pointer probe settles it"
  - test: "Chevron contrast fix re-measure (UAT item 4 / gap 1) after any CSS change"
    expected: "Re-run the 40-combination measurement (10 themes x BRIGHT/DARK card x 2 edges); decide the bar"
    why_human: "Pixel measurement; 12/40 combinations reach 3:1 today, minimum 1.005 (gruvbox_dark). See Follow-up section for why this is not a locked-requirement gap"
  - test: "Divider-label contrast fix re-measure (UAT item 7 / gap 3) after any token change"
    expected: ">= 4.5:1 in all ten themes (dracula 4.25 and nord-light 1.52 fail today)"
    why_human: "Pixel measurement over real themes; not a locked requirement (see Follow-up section)"
---

# Phase 48: Focus Row Verification Report (re-verification)

**Phase Goal:** The single lane above the games grid stops being a four-option dropdown buried in Settings and becomes a **focus row** chosen from the Games tier-2 panel, pickable from any view, collection, store or runnability value, rendered as a horizontal strip that fills the available width; the `Recent Games to Show` number setting is removed and the row is sized to what fits.
**Verified:** 2026-10-07
**Status:** human_needed
**Re-verification:** Yes, after gap closure (48-07, 48-08). HEAD `c255b3a6e`, branch `quick-261002-b63`.

## Requirement IDs

R1-R7 are phase-local, defined in `48-SPEC.md`. `.planning/REQUIREMENTS.md` carries only a pointer. Plan frontmatter cross-reference: 48-01 [R2,R3], 48-02 [R1,R3,R4,R5], 48-03 [R2], 48-04 [R3], 48-05 [R7], 48-06 [R6], 48-07 [R7,R1] (gap_closure), 48-08 [R1,R2,R3,R6,R7] (gap_closure). Every one of R1-R7 is claimed by at least one plan; none is orphaned. R6 is read as amended by the 2026-10-04 operator ruling (control and dead-code removal only; the storage bound was dropped).

## Goal Achievement

### Observable Truths

| # | Truth (48-SPEC.md) | Status | Evidence |
|---|--------------------|--------|----------|
| R1 | One persisted `{kind,value}` selection, or off, survives restart | VERIFIED | `handleFocusRow` writes through `window.api.setSetting` (`GlobalState.tsx:816-818`); real-read-path test `focusRowFirstLaunchHydration.test.ts` case "R1: collection pick written through real setSetting listener seeds unchanged on next launch" passes; UAT item 2 (live): pick `Test`, quit, relaunch, header `Test` over a 2-card strip; clear, relaunch, no strip, mirror `null` |
| R2 | FOCUS ROW section in Games tier-2 panel, single-select, clearable, fixed group order, no collections group when empty | VERIFIED | `FilterFocusRow` mounted in `Header/index.tsx:35`; `filterFocusRow.test.tsx` passes; UAT item 7 live: collapsed by default, dividers read Views, Collections, Store, Runnability in DOM order, long collection name ellipsises with full `title`, no `gamelib:` text. (Divider colour contrast is a separate finding, see Follow-up) |
| R3-core | One horizontal strip, fixed 156px, max 20, forward control reveals remainder, no affordance when content fits, zero-match renders nothing, grid unchanged | VERIFIED | `FocusRowStrip/index.css` (`.focusRowTrack` overflow-x auto, `.gameList` flex nowrap, `> * {flex: 0 0 156px}`); `FOCUS_ROW_MAX_CARDS=20`; `focusRowOverflow.test.ts`, `focusRowStripSource.test.ts` pass; mounted at `Library/index.tsx:1159`. UAT item 6 live: 20 cards, one row (height equals card height), no title overflow at 1280px. UAT item 5 live (non-controller clauses): forward enabled, three clicks reached `scrollWidth`, forward `disabled` at `scrollLeft+clientWidth >= scrollWidth-1` (boundary probed -2/-1/0), back enabled once scrolled; a 2-card and a 1-card pick render zero `.focusRowStrip__control`. Clicks were `element.click()` (see human item on pointer reach) |
| R3-gamepad | Gamepad focus past the last visible card scrolls it into view | PRESENT_BEHAVIOR_UNVERIFIED | Handler present and gated on `activeController`; source-regex test only; live gate BLOCKED (no controller). Routed to human verification |
| R4 | Independent of filters except hidden games | VERIFIED | `selectFocusRowGames` builds a fresh engine state from defaults plus the pick alone; `passesHiddenLaneFilter` applied last; `focusRowSelectors.test.ts` passes (incl. the held-out "no filter combination alters contents" backstop) |
| R5 | recentlyPlayed by recency, everything else by title, stable tie-break on `app_name` | VERIFIED | `focusRowSelectors.ts` ordering; `focusRowSelectors.test.ts` passes (incl. 0-game and 1-game backstop) |
| R6 (amended) | `Recent Games to Show` control and its dead code removed | VERIFIED | `git ls-files` finds no `MaxRecentGames` / `LibraryTopSection` component or `RecentlyPlayed/index`; `git grep -i maxRecentGames -- src` returns 0 hits; `getRecentGames` is `async () => configStore.get('games.recent', [])` (`recent_games.ts:6`), no parameters; no new writer to `games.recent`; UAT item 1 live: neither label in the General page text, gap equals the modal inter-row gap |
| R7 | `Library Top Section` removed; one-time migration; clear-then-relaunch does not restore | VERIFIED (CR-01 closed) | See below |

**Score:** 7/8 truths verified (R3 counted as R3-core and R3-gamepad); 1 present, behavior-unverified (R3-gamepad).

### R7 re-check (the prior blocker)

The prior failure was real: the migrated value was derived in `getSettings()` but the renderer seeded only from the `store/config.json` `settings` mirror. Now:

- `seedFocusRowFromMirror` (`focusRowMigration.ts`) reads the mirror synchronously at module scope (`GlobalState.tsx:64`, state at `:497`) and reports `needsMigratedValue` when the mirror has no `focusRow` key.
- `componentDidMount` (`GlobalState.tsx:1494`) calls `hydrateFocusRowSelection` once, which calls the real `requestAppSettings` and applies and persists the value through the one setter (`setSetting`), always writing (null included) so the key becomes present and the seed cannot run again.
- Backend `config.ts:332` migrates from the RAW `defaultSettings` object (ordering-trap comment at `:326-330`), so the factory default `focusRow: null` cannot mask a legacy value.
- A user pick made while the IPC is in flight wins (`hasUserPicked` is checked after the await, `GlobalState.tsx:813-818`).
- Present-but-invalid `focusRow` now yields `null` and never reaches the legacy switch (WR-02); `kind:'view'` with an unknown view is rejected (WR-01).
- Test `focusRowFirstLaunchHydration.test.ts` runs the REAL `backend/config`, `key_value_stores`, `store_backend`, `settingsFlowRegistration` and `focusRowMigration`, including a control case reproducing the pre-fix outcome. It passes. It is not mock-only.
- Live (UAT item 3): leg A recently_played yields the strip on launch 1, `focusRow = {view, recentlyPlayed}` written, strip on launch 2; leg B favourites yields the Favourites strip and written value; leg C disabled yields no strip and `null` written; leg D clear then relaunch, no strip in 98 frames, file stays `null`. Caveat recorded by the operator: leg A is a re-arm (the as-found profile was consumed by an auto-relaunched dev instance). Legs B-D and the real-read-path test are independent of that caveat, so R7 does not rest on leg A alone. One accepted one-time pop-in on the first upgraded launch (async hydration); no empty-Library frame observed at ~7 fps capture.
- The `recently_played_installed` acceptance criterion is carried as PASSED (override) per the operator ruling; not re-litigated.

### Acceptance-criteria prohibition cross-check

| Criterion | Status | Note |
|-----------|--------|------|
| MUST NOT: hidden game in focus row | VERIFIED | `passesHiddenLaneFilter` applied last; tested |
| MUST NOT: delete stored `games.recent` entries | VERIFIED | structural: no writer added in this phase |
| MUST NOT: write `games.customCategories` | VERIFIED | focus-row code only reads `listCategories()` |
| MUST NOT: raw i18n key as visible name | VERIFIED | live UAT item 7: no `gamelib:` text; labels via `gamelib.json` keys |
| Persisted deleted-collection selection renders no strip, no crash | VERIFIED | selectors test; zero-match renders null |
| Clearing then relaunching does not restore the old setting | VERIFIED | `null` present wins; live leg D |
| Grid output unchanged | VERIFIED (static + suite) | grid path unmodified; orchestrator full jest 10,344 pass |

### Required Artifacts (spot check, three levels)

| Artifact | Status | Details |
|----------|--------|---------|
| `src/common/focusRowMigration.ts` | VERIFIED | substantive (guard, migrate, seed, hydrate); imported by `config.ts:9` and `GlobalState.tsx:50-52` |
| `src/frontend/screens/Library/components/FocusRowStrip/{index.tsx,index.css,focusRowSelectors.ts,focusRowOverflow.ts}` | VERIFIED | mounted `Library/index.tsx:1159`; reuses `GamesList` |
| `src/frontend/components/UI/NavShell/components/FilterFocusRow` | VERIFIED | mounted `Header/index.tsx:35` |
| Deleted: `MaxRecentGames`, `LibraryTopSection`, `RecentlyPlayed/index` | VERIFIED absent | R6/R7 |
| `src/backend/sidecar/__tests__/focusRowFirstLaunchHydration.test.ts` | VERIFIED | real read path |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| FocusRowStrip cards | `selectFocusRowGames(...)` | library state + `games.recent` + `customCategories` | Yes (live captures show real titles/art) | FLOWING |
| Context `focusRow` | mirror seed, else `requestAppSettings()` migrated value | `store/config.json` settings, `config.json` defaultSettings via `GlobalConfig.getSettings()` | Yes (live legs A-D) | FLOWING |

### Behavioral Spot-Checks and Automated Checks

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Phase suites | `npx jest --silent` on `focusRowMigration`, `focusRowFirstLaunchHydration`, `filterFocusRow`, `FocusRowStrip/` (3 suites), `GlobalStateFocusRowHydration` | 7 suites, 171 tests pass | PASS |
| Type check | `pnpm codecheck` (`tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`) | exit 0 | PASS |
| R6 greps | `git grep -i maxRecentGames -- src` | 0 hits | PASS |
| Debt markers | `git diff 752b510f8 HEAD -- src` for added TBD/FIXME/XXX | none | PASS |
| Full jest | not re-run (orchestrator: 10,344 pass; sole non-flake failure `overlayDismiss`, pre-existing, `deferred-items.md`) | n/a | accepted |

Probes: none declared for this phase (Step 7c not applicable).

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| R1 | 48-02, 48-07, 48-08 | SATISFIED | table above |
| R2 | 48-01, 48-03, 48-08 | SATISFIED | table above |
| R3 | 48-01, 48-02, 48-04, 48-08 | SATISFIED except the gamepad clause, which is human-verification (not blocked by evidence of failure) | table above |
| R4 | 48-02 | SATISFIED | |
| R5 | 48-02 | SATISFIED | |
| R6 (amended) | 48-06, 48-08 | SATISFIED | |
| R7 | 48-05, 48-07, 48-08 | SATISFIED (CR-01 closed) | |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `focusRowMigration.ts` `hydrateFocusRowSelection` | WR-03: "never rejects" contract breaks if `onError` itself throws | Warning, not blocking | The only `onError` is `window.api.logError(...)`, a fire-and-forget IPC send; a throw needs the bridge itself to be broken, at which point `requestAppSettings` would already have failed first and the app has larger problems. No must-have depends on it. Disposition `open`; worth a one-line follow-up (wrap `onError` in its own try/catch) |
| Locales (47 files) | IN-01 retired settings strings | Info | Deliberate (SPEC Constraints) |
| Misc | IN-02 stale comments, IN-03 unchecked `RunnerToStore` lookup, IN-04/05/06/07 doc and bookkeeping | Info | None blocks a must-have |
| `config.ts:358` | `libraryTopSection: 'disabled'` retained in factory defaults | Info | Intentional: retained as the migration source field (`types.ts:170` comment); SPEC requires the Settings control gone, not the stored key |

No TBD/FIXME/XXX markers added in the phase's source changes.

## Follow-up (UAT `issue` items): requirement mapping

The decision asked for: do the three UAT gaps belong to the LOCKED requirements?

1. **Chevron contrast (12/40 theme x card x edge combinations reach 3:1; min 1.005 gruvbox_dark).** Maps to NO SPEC requirement. R3 specifies "forward/back controls revealing any that do not fit" with no legibility clause. The 3:1 figure is a bar the 48-08 plan itself adopted (`48-08-PLAN.md` "Bars adopted": "No numeric contrast bar exists in 48-UI-SPEC.md or 48-04-PLAN.md"). It touches UI-SPEC prose only ("stays legible over any artwork", UI-SPEC Forward/back controls). So: UI-SPEC polish / accessibility defect, not a SPEC gap. It is nonetheless a genuine, measured defect (a 1.0:1 chevron is effectively invisible in gruvbox_dark), so it should be filed as a follow-up (todo, fix quick task or a polish phase), not dismissed.
2. **Hovered card paints over the chevron (z-index 2 vs 1).** Maps to R3's "forward control is present and reveals the remainder" only if it makes the control unclickable by a real pointer, which was NOT probed (UAT used `element.click()`). The overlap itself is a UI-SPEC concern (collision with hover outline). I cannot refute or confirm pointer unreachability without an app launch (forbidden here), so it is carried as a human_verification item rather than a gap or a pass. If the probe shows the card swallows the click, it should be promoted to a gap against R3.
3. **Divider labels under 4.5:1 (dracula 4.25, nord-light 1.52).** Maps to NO SPEC requirement. R2 requires listing, group presence and fixed order, all verified live. The 4.5:1 figure is again the 48-08-adopted bar. Follow-up item (a `--text-secondary` swap on `.FilterFocusRow__divider`, nord-light is the severe case).

**Item 5, controller-blocked clause.** Yes, a SPEC requirement needs it: R3's acceptance criterion "Gamepad focus moving past the last visible card scrolls that card into view". It is therefore listed as a human_verification / behavior-unverified item, not as a gap, because there is no evidence of failure, only an unexercised path. The keyboard-proxy observation (focus on a partly clipped last card did not scroll; cards beyond index 5 are unfocusable shells until scrolled in) is a caution worth giving the human tester, but the proxy bypasses the controller-gated handler so it does not by itself prove failure.

## Human Verification Required

1. **Gamepad scroll-into-view (R3).** Test: connect a controller, open an overflowing Recently-played strip, move focus right past the last fully visible card. Expected: the card scrolls fully into view and focus can continue to cards beyond the first rendered page. Why human: controller gated handler, source-regex test only, UAT blocked.
2. **Real-pointer reach of the chevrons.** Test: move the real pointer onto each chevron through an edge card (from above, below and inside) and click. Expected: the click hits the control and scrolls the track. Why human: UAT used DOM `.click()`; CSS suggests a hovered card may cover the control.
3. **Chevron and divider contrast re-measure** after the follow-up CSS changes (not blocking this phase).

## Gaps Summary

No requirement R1-R7 fails. The one prior BLOCKER (R7 first-launch seed never reaching the renderer) is closed: the fix is present, wired through the real read path, regression-tested against real config and store code, and passed live on four legs. Status is `human_needed` rather than `passed` because one SPEC acceptance criterion (R3 gamepad scroll) has never been exercised and one UAT-recorded overlap (hovered card over the chevron) leaves real-pointer reach of the R3 forward control unproven. The three UAT `issue` items are UI-SPEC-level defects against bars adopted by 48-08, mapping to no locked requirement; they should be filed as follow-ups.

---

_Verified: 2026-10-07_
_Verifier: Claude (gsd-verifier)_
