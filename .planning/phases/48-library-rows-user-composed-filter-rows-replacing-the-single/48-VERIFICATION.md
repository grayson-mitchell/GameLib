---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
verified: 2026-10-05T00:00:00Z
status: gaps_found
score: 6/7 requirements verified (R7 failed at runtime)
covered_files: []
covered_digest: "unavailable: verification.fingerprint is not exposed by the installed gsd-sdk/gsd-tools bridge (Unknown command: verification); not hand-written"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps:
  - truth: "R7 / AC: `libraryTopSection: favourites` (or recently_played) yields the matching focus row on first upgraded launch"
    status: failed
    reason: >
      The pure seed function and its backend call site exist and are unit-tested, but the migrated value never
      reaches the renderer. GlobalState seeds `focusRow` from the renderer-side `configStore` 'settings' mirror
      (GlobalState.tsx:57,490), which is written only by `GlobalConfig.setSetting` and `writeConfig` (both spread
      the OLD mirror). `getSettings()` migrates only the in-memory/config.json object. No renderer path reads
      the migrated value (`requestAppSettings` is never consulted for `focusRow`). Confirmed on the operator's
      real profile: `store/config.json` settings has `libraryTopSection: 'recently_played'` and NO `focusRow`
      key, so the first upgraded launch renders no focus row. This silently drops the user's old lane.
    artifacts:
      - path: "src/frontend/state/GlobalState.tsx"
        issue: "line 57 `globalSettings = configStore.get_nodefault('settings')`, line 490 `focusRow: globalSettings?.focusRow ?? null`; no hydration from the migrated backend value"
      - path: "src/backend/config.ts"
        issue: "migrateFocusRowSelection result (line 332) lands only in this.config/config.json; setSetting (406-407) spreads the old mirror, so the seed never enters the mirror"
      - path: "src/common/__tests__/focusRowMigration.test.ts"
        issue: "tests the pure function only; no test drives the real read path (legacy fixture -> context `focusRow`), which is why the gap is invisible to the suite"
    missing:
      - "Hydrate renderer `focusRow` from the migrated value: either `window.api.requestAppSettings()` in GlobalState componentDidMount (guarded by isValidFocusRowSelection), or have the backend write the derived `focusRow` into the configStore 'settings' mirror when it first derives it"
      - "A test that drives legacy `{ libraryTopSection: 'recently_played' }` through the real path to the context-exposed `focusRow`"
human_verification:
  - test: "Settings -> General after the 48-06 deletions"
    expected: "Neither `Library Top Section` nor `Recent Games to Show` renders, and no visible gap/hole is left where they sat (48-06 SUMMARY, Open observations)"
    why_human: "Frontend jest has no CSS engine and mounts nothing; a deleted block that reads fine in source can still leave a layout hole"
  - test: "Persistence round trip (R1) with a collection pick, then quit and relaunch the built app"
    expected: "Same collection is still the focus row after relaunch; clearing it and relaunching does not restore it"
    why_human: "Unit-proven only; round trip through the real config.json + store mirror is owed (48-05 SUMMARY, Live gate owed)"
  - test: "R7 migration live gate (after the CR-01 gap is fixed): pre-upgrade profile with `libraryTopSection: favourites`, then `recently_played`, then `disabled`"
    expected: "favourites -> Favourites strip on first launch; recently_played -> Recently-played strip; disabled -> no strip; after the user clears the row, relaunch does not bring it back"
    why_human: "Needs a real upgraded profile through the real store/config files (48-05 SUMMARY, Live gate owed)"
  - test: "Strip chevron legibility over real artwork at both edges in all 10 themes; no collision with the card corner radius/hover outline at 156px"
    expected: "Chevron readable (contrast measured, not eyeballed) and clear of the card corner and outline"
    why_human: "Contrast and collision claims need pixel measurement; no CSS engine in jest (48-04 SUMMARY, Live gate owed 1-2)"
  - test: "Back control appears and forward control disables at true end of travel; gamepad focus past the last visible card scrolls it into view"
    expected: "Back mounts once scrolled; forward is `disabled` at the end; controller focus brings the card fully into view"
    why_human: "rAF/scroll/ResizeObserver never run under jest node env; needs the live app and a controller (48-04 SUMMARY, 3)"
  - test: "Narrowest supported window width and longest title in the test library (UI-SPEC E4/E7)"
    expected: "No title overflows card bounds or overlaps a neighbour; a long title on a 156px card clips with overflow hidden, no ellipsis/line-clamp"
    why_human: "Layout claim; no CSS engine in jest (48-04 SUMMARY, Live gate owed 4-5)"
  - test: "FOCUS ROW panel section: long collection name ellipsis, the four sub-group headers read as sub-structure, section reads in all themes"
    expected: "Long names ellipsis with the full label on hover; groups Views / Collections / Store / Runnability visibly separated"
    why_human: "Not claimed by 48-03 (frontend jest has no CSS engine)"
deferred: []
advisory: []
---

# Phase 48: Focus Row Verification Report

**Phase Goal:** The single lane above the games grid becomes a focus row chosen from the Games tier-2 panel, pickable from any view, collection, store or runnability value, rendered as a horizontal strip that fills the available width, with the `Recent Games to Show` setting removed and the row sized by what fits.
**Verified:** 2026-10-05
**Status:** gaps_found
**Re-verification:** No, initial verification

## Requirement IDs

R1 to R7 are phase-local, defined in `48-SPEC.md` section Requirements. `.planning/REQUIREMENTS.md` has no R1-R7 entries (expected, noted, not reported as missing). R6 is read as amended by operator ruling: only the control and dead-code removal counts, the "bound `games.recent` at 20" half is out of scope.

## Goal Achievement

### Observable Truths

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| R1 | One persisted `{kind, value}` focus-row selection, or off, survives restart | VERIFIED (code) | `FocusRowSelection` in `common/types.ts:185-186`; `focusRow` on `AppSettings`; `handleFocusRow` (`GlobalState.tsx:804-806`) calls `window.api.setSetting({appName:'default', key:'focusRow', value})`; `setSetting` handler (`settingsFlowRegistration.ts:160-177`) writes it with no key allow-list that would drop it; `GlobalConfig.setSetting` writes both mirror and config.json. Round trip against the real app is owed (human item 2). |
| R2 | FOCUS ROW section in the Games tier-2 panel, single-select, clearable, fixed group order, collections omitted when none | VERIFIED | `FilterFocusRow/index.tsx` mounted in `Header/index.tsx:295-296`. Groups render Views, Collections (only if `categories.length>0`), Store, Runnability in that fixed order. `selectFocusRow` clears on re-click of the active `{kind,value}`. All labels via `gamelib:` keys that exist in `public/locales/en/gamelib.json:202-205,218`; collection names rendered as text. `filterFocusRow.test.tsx` passes. |
| R3 | One-row horizontal strip, fixed 156px cards, max 20, forward/back controls, zero-match renders nothing | VERIFIED (code) | `FocusRowStrip/index.css`: `.focusRowTrack` `overflow-x:auto`, `.gameList` flex nowrap, `> * {flex: 0 0 156px}`. `FOCUS_ROW_MAX_CARDS = 20`, applied by `ordered.slice(0, 20)`. Controls mount only when `canScrollForward/Back`. `if (!hasGames) return null`. Reuses `GamesList`. Mounted at the old lane position in `Library/index.tsx:1159`. Real layout/scroll/gamepad behavior is owed live (human items 4-6). |
| R4 | Focus row independent of every filter except hidden-games | VERIFIED | `selectFocusRowGames` builds a fresh `FilterEngineState` from `DEFAULT_FILTER_ENGINE_STATE` plus the pick alone; live filters are structurally absent from its parameter list. Final `passesHiddenLaneFilter` is the single hidden authority. `focusRowSelectors.test.ts` passes. Grid path unchanged: `libraryToShow` still computed by the existing engine (focus row only inserted above). |
| R5 | recentlyPlayed ordered by recency, all others by title; identical titles stable | VERIFIED | `selectFocusRowGames` sorts by `deps.recentAppNames` index for the recentlyPlayed view, else `focusRowTitleComparator` (leading-`THE ` stripped `localeCompare`, then `app_name` tie-break). Covered in `focusRowSelectors.test.ts` (passes). |
| R6 | `Recent Games to Show` control removed with the dead code behind it (amended) | VERIFIED | `MaxRecentGames.tsx` and `RecentlyPlayed/index.tsx` absent. `git grep -i maxRecentGames -- src` returns zero hits. `getRecentGames` takes no parameters; `limited` branch gone (`recent_games.ts:6`). `git grep` for `getRecentGames({` and `limited:` returns nothing. The only writer, `setRecentGames`, is unchanged (unbounded, as before): prohibition on deleting stored `games.recent` entries satisfied by absence of any new writer. |
| R7 | `Library Top Section` control removed; old value seeds the new selection once on first upgraded launch | FAILED | Control half VERIFIED: `LibraryTopSection.tsx` deleted, no `LibraryTopSection` consumer left in `src` (the type is kept declared only for the migration read). Seed half FAILED at runtime: see Gaps. `migrateFocusRowSelection` is correct and wired in `config.ts:332` (and correctly reads the RAW defaultSettings, not the merged object), but the renderer never receives it. |

**Score:** 6/7 requirements verified.

### R7 trace (orchestrator lead 1: CONFIRMED)

1. Renderer state: `focusRow: globalSettings?.focusRow ?? null` (`GlobalState.tsx:490`), where `globalSettings = configStore.get_nodefault('settings')` (`:57`), the hydrated snapshot of `store/config.json` `settings`.
2. Writers of that mirror: only `GlobalConfig.setSetting` (`config.ts:406-407`, spreads `configStoreSettings || config`) and `writeConfig` (`utils.ts:1812-1814`, spreads the existing mirror). `grep` for `configStore.set('settings'` finds no third writer. The backend `language.ts:71` boot-path `setSetting('language')` also spreads the existing mirror and adds no `focusRow`.
3. `getSettings()`'s migrated `focusRow` goes to `this.config` and, on flush, to `config.json` `defaultSettings`, not to the mirror. No frontend code calls `requestAppSettings()` for `focusRow` (`git grep focusRow` shows only the mirror read).
4. Evidence on the real profile (`~/Library/Application Support/gamelib/store/config.json`): `settings.libraryTopSection = 'recently_played'`, `'focusRow' in settings === false`. On first launch of this build the renderer yields `focusRow = null`: no strip. The one case that would work (profile with NO `settings` mirror at all, where `setSetting` falls back to merged `config`) is not the upgrade case and still only lands on the NEXT launch, after the renderer already read null.
5. The user's old lane silently disappears; once they pick/clear, the key is written and the symptom vanishes, which hides the defect.

Result: R7's acceptance criteria "`libraryTopSection: favourites` yields Favourites focus row on first upgraded launch" and the `recently_played` equivalent are not met in the actual code path. This matches code review CR-01 (still `open` in `48-REVIEW-DISPOSITION.md`).

### Acceptance-criteria and prohibition cross-check

| Criterion | Status | Note |
|-----------|--------|------|
| Zero-match / deleted-collection pick renders no strip, no crash | VERIFIED | `isValidFocusRowSelection` + `if (!hasGames) return null`; collection/store/runnability stale values match zero games |
| Stale `{kind:'view', value:<unknown>}` | WARNING | WR-01: validator accepts any non-empty string for `view`; `passesView` default returns true, so an unlabelled strip of the first 20 titles renders. Not a crash; SPEC edge row only requires "no crash" for deleted collection/signed-out store, so recorded as a warning rather than a gap |
| `recently_played_installed` yields "installed-only semantics" | DEVIATION (accepted by operator in 48-05) | Maps to plain `recentlyPlayed` view; installed-only qualifier dropped (`focusRowMigration.ts:58-66`, 48-05 SUMMARY "operator ruling: recency"). SPEC AC text not met literally. The ruling is recorded in the plan, but there is no `overrides:` entry. See override suggestion below |
| Clearing then relaunching does not restore the old setting | VERIFIED in the unit layer; WR-02 weakens the guarantee | A present `null` wins (`focusRowMigration.ts:79-81`); but a present-but-INVALID `focusRow` falls through to legacy `libraryTopSection` (WR-02), contradicting the "present key permanently disarms" contract |
| MUST NOT: hidden game in focus row | VERIFIED | `passesHiddenLaneFilter` applied last; tested |
| MUST NOT: delete `games.recent` entries / write `games.customCategories` | VERIFIED | No new writer in `recent_games.ts`; focus row code only reads `customCategories.listCategories()` |
| MUST NOT: raw i18n key as visible name | VERIFIED | Panel and strip labels use `tGamelib(key, default)` with keys present in `gamelib.json`; no `gamelib:` key leaks as text. Store label from `RunnerToStore[...]` has no fallback (IN-03, info) |
| Grid output unchanged | VERIFIED (static) | Grid code path unmodified aside from removing the two old lanes; 48-06 SUMMARY reports Backend 5160 and Frontend 3293 tests green; orchestrator reports 470/472 suites in the post-merge full run |

### Behavioral spot-checks (Step 7b)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration, selectors, panel section, strip source, overflow, engine wiring | `npx jest --silent` on the 6 phase suites | 6 suites, 172 tests pass | PASS |
| R6 greps | `git grep -i maxRecentGames -- src`; `getRecentGames(\s*{`; `limited:` | 0 hits each | PASS |
| R7 real read path | inspect real `store/config.json` | no `focusRow` key, legacy `libraryTopSection` present | FAIL (see gap) |

Pre-existing flakes (orchestrator lead 3): `fakeHomeIsolation` and `appShellFlows` failures under parallel load are in files this phase did not touch (neither appears in the phase's `files_reviewed_list`); not counted against the phase. I did not re-run the full suite.

### Requirements Coverage

| Requirement | Source | Status | Evidence |
|-------------|--------|--------|----------|
| R1 | 48-SPEC (not in REQUIREMENTS.md) | SATISFIED (live round trip owed) | see truth table |
| R2 | 48-SPEC | SATISFIED | see truth table |
| R3 | 48-SPEC | SATISFIED (live layout owed) | see truth table |
| R4 | 48-SPEC | SATISFIED | see truth table |
| R5 | 48-SPEC | SATISFIED | see truth table |
| R6 (amended) | 48-SPEC + 48-06 operator ruling | SATISFIED | see truth table |
| R7 | 48-SPEC | BLOCKED (seed never reaches renderer) | see gap |

All seven IDs are accounted for. `.planning/REQUIREMENTS.md` carries no R1-R7 entries, so there are no orphaned or unclaimed IDs to report there.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `GlobalState.tsx` | 57, 490 | Renderer seeds a migrated setting from a mirror the migration never writes | BLOCKER | R7 gap (above) |
| `common/focusRowMigration.ts` | 26-49 | `view` value not checked against the four known views (WR-01) | WARNING | Unlabelled arbitrary-games strip on stale/hand-edited value |
| `common/focusRowMigration.ts` | 84-96 | Present-but-invalid `focusRow` re-consults legacy field (WR-02) | WARNING | Cleared row can resurrect after a corrupt value |
| `public/locales/*/translation.json` (47 files) | n/a | Orphaned `setting.library_top_*` / `setting.maxRecentGames` keys (IN-01) | INFO | Deliberate (SPEC Constraints, three removal traps); todo filed in 48-05 |
| `Library/index.tsx:211,217`, `FocusRowStrip/index.tsx:53`, `meta/hardcodedStringGate.ts:760` | n/a | Stale comments naming deleted files (IN-02) | INFO | Cosmetic |
| `FocusRowStrip/index.tsx:186`, `FilterFocusRow/index.tsx:~127` | n/a | Unchecked `RunnerToStore[...]` lookup (IN-03) | INFO | Fragile typing only |
| `common/types.ts:~182` | n/a | Stale `FocusRowSelection` doc comment (IN-04) | INFO | Cosmetic |

No `TBD|FIXME|XXX` debt markers were introduced that I found in the files reviewed (the review reports none).

### Gaps Summary

One blocker. R7's persistence/seed half does not work end to end: the migration logic is correct and tested in isolation, but the renderer reads `focusRow` from a store mirror that the migration never updates, so every upgraded profile that has ever written a setting (including the operator's own) starts with no focus row, silently losing its old Recently-played/Favourites lane. This is exactly the failure that a unit test of `migrateFocusRowSelection` cannot see. Fix by hydrating `focusRow` from `requestAppSettings()` (validated) in `GlobalState`, or by writing the derived value into the mirror when it is first derived, and add a test that drives a legacy fixture through the real read path.

The two warnings (WR-01, WR-02) are small hardening changes to `common/focusRowMigration.ts` and `focusRowSelectors.ts` and are best folded into the same closure plan, since WR-02 directly affects R7's "clearing does not restore" guarantee.

### Suggested override (operator ruling, not applied by the verifier)

The `recently_played_installed` deviation looks intentional and is recorded in `48-05-PLAN.md` / `48-05-SUMMARY.md`. To formally accept it, add to this frontmatter:

```yaml
overrides:
  - must_have: "libraryTopSection: recently_played_installed yields Recently-played focus row with installed-only semantics"
    reason: "Operator ruling in 48-05 Task 1: persisted shape has no modifier slot; recency kept, installed-only dropped; installed-only reachable via the grid's Installed view"
    accepted_by: "operator (48-05 plan checkpoint)"
    accepted_at: "2026-10-05"
```

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
