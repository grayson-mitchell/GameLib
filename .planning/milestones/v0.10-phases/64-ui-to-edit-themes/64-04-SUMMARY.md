---
phase: 64-ui-to-edit-themes
plan: 04
subsystem: ui
tags: [themes, custom-themes, zustand, validation, css-custom-properties, settings-store]

requires:
  - phase: 64-02
    provides: "BUILTIN_TOKENS, builtinSeed, isBuiltInThemeKey, LIVE_DERIVED_TOKENS, NON_COLOUR_TOKENS"
  - phase: 64-03
    provides: "configStore.setChecked (confirmed write) and the CustomTheme type with the allow-listed customThemes key"
  - phase: 64-01
    provides: "parseColour and normaliseColour"
provides:
  - "customTheme.ts: custom:<id> identity, resolveThemeKey, makeCopy, a total capped parseCustomThemes, cleanTokens, validateThemeName, nextCopyName, newCustomThemeId"
  - "validate.ts: validateColourInput, isValidGradient (deny-list then CSS.supports, fail closed), isValidTokenValue"
  - "applyTheme.ts: applyTheme(body, key, customs, fallback), behind window.setTheme"
  - "settingsState customThemes slice with duplicateTheme, renameCustomTheme, deleteCustomTheme, saveCustomThemeTokens"
affects: [64-05, 64-06, 64-07, theme gallery, theme editor, Save and Delete UI]

actuals:
  tokens: 19180
  tasks: 3
  commits: 7
plan_head_before: c15454318d15bd5af8d3d71e327a5fee3b5ec4fe
plan_head_after: 39bbb2961cb4c12103b624a56a507b8b24402ebe

tech-stack:
  added: []
  patterns:
    - "One resolver (resolveThemeKey) answers which theme a key is; the body class is derived from the resolution, never compared against defaultThemes by callers"
    - "Custom theme = base built-in class plus every stored token as an inline custom property on body; the previous theme's inline properties are removed on every switch"
    - "Every custom-theme setter looks the id up in customThemes first, so a built-in key or unknown id is refused before any write"
    - "Save awaits configStore.setChecked and changes state only on a confirmed write"
    - "Persisted value is parsed totally at the boundary (per-entry try/catch, caps, canonical colours) and the same cleanTokens runs on Save"

key-files:
  created:
    - src/frontend/customThemes/customTheme.ts
    - src/frontend/customThemes/validate.ts
    - src/frontend/customThemes/applyTheme.ts
    - src/frontend/customThemes/__tests__/applyTheme.test.ts
    - src/frontend/customThemes/__tests__/customTheme.test.ts
    - src/frontend/customThemes/__tests__/validate.test.ts
    - src/frontend/state/__tests__/customThemesState.test.ts
  modified:
    - src/frontend/index.tsx
    - src/frontend/state/settingsState.ts
    - src/frontend/components/UI/ThemeSelector/index.tsx
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Promoted the theme key to one resolver (resolveThemeKey); window.setTheme no longer compares against defaultThemes and no longer assigns the whole body className, so isRTL, keyboardNav and controllerLayout survive a switch"
  - "Save and the boot parser share one cleanTokens, so a token Save accepts is a token the next boot keeps (names must match --[a-z0-9-]+ and be in the known universe; colours stored canonical)"
  - "A copy of a built-in is named from the caller-supplied format closure; the store passes the built-in key as the 'source part' for over-length shortening, which only matters for a custom source name"
  - "The window.setTheme body of the titlebar overlay tail is unchanged"

requirements-completed: [THEME-02]

coverage:
  - id: D1
    description: "Duplicate stores a frozen token copy of a built-in or custom theme (base kept) and does not apply it"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/state/__tests__/customThemesState.test.ts#duplicates a built-in as a frozen token copy without applying it"
        status: pass
    human_judgment: false
  - id: D2
    description: "A custom theme applies app-wide as its base class plus inline token properties; switching clears them; unknown keys fall back; other body classes survive; every gallery key round-trips to exactly one built-in class"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/applyTheme.test.ts#applyTheme"
        status: pass
    human_judgment: true
    rationale: "jsdom proves the body class and inline properties; whether the real WKWebView paints the custom theme app-wide is a live check (Plan 10)"
  - id: D3
    description: "parseCustomThemes is total (500 random structures, hostile getter), capped, canonicalising, and drops bad token names, values and gradients"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/customTheme.test.ts#parseCustomThemes never throws"
        status: pass
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/validate.test.ts#isValidGradient"
        status: pass
    human_judgment: false
  - id: D4
    description: "Rename, delete (with fallback to the base built-in) and awaited Save report the real outcome; built-in keys and unknown ids are refused with zero writes"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/state/__tests__/customThemesState.test.ts#built-in themes are immutable through the store"
        status: pass
      - kind: unit
        ref: "src/frontend/state/__tests__/customThemesState.test.ts#saveCustomThemeTokens"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 04: Custom themes as data, applied over their base class Summary

**Custom themes are stored token data under `custom:<id>`, parsed totally at boot, validated (colours canonical, gradients deny-listed before `CSS.supports`), applied by `applyTheme` as base class plus inline properties on body, and mutated only through settingsState setters that refuse built-ins and await the checked write on Save.**

## Performance

- **Duration:** about 25 min
- **Started:** 2026-11-17T19:00:00Z (approximate)
- **Completed:** 2026-11-17T19:25:00Z
- **Tasks:** 3 (one tracer, two TDD)
- **Files modified:** 13 (7 new, 6 modified)

## Accomplishments

- Task 1 (tracer): `resolveThemeKey`, `makeCopy` and `applyTheme`; `window.setTheme` is now a thin wrapper over `applyTheme(document.body, ...)` and no longer overwrites `document.body.className`; `settingsState` gains `customThemes` (hydrated through `parseCustomThemes`) and `duplicateTheme`. The assumption-delta invariant (all 10 built-ins plus custom fixtures resolve and end with exactly one theme class on body) is a jest case per key. Tracer verified end-to-end before expansion.
- Task 2 (TDD): total parse with caps (50 themes, 256 tokens, 512-char values, 60-char names), id pattern and duplicate-id drop, token name pattern plus known-token universe (so `--__proto__` and `--evil` are dropped), canonical colours, gradient deny-list (`var(`, `url(`, `;`, `{`, `}`, `@`, `!important`, backslash) before `CSS.supports` with a fail-closed default, `validateThemeName`, `nextCopyName`, `newCustomThemeId`. A whole-seed round trip of all 10 built-ins passes `parseCustomThemes` (gradients included, with `supports` injected).
- Task 3 (TDD): `duplicateTheme` limit and naming, `renameCustomTheme`, `deleteCustomTheme` (active theme falls back to its base built-in, else midnightMirage; the shorter array is written before the theme switch), `saveCustomThemeTokens` (awaits `setChecked`; `failed` touches nothing, `applied` re-applies when active, `saved` otherwise). Gate scope updated for the three new modules.

## TDD Gate Compliance

| Task | RED commit | GREEN commit |
| ---- | ---------- | ------------ |
| 2 | `90224fbef` test(64-04): failing tests for total parse, value validation, naming and ids | `dd63c5e50` feat(64-04): total theme parse, colour and gradient validation, naming and ids |
| 3 | `aac8f5c9b` test(64-04): failing tests for custom theme store setters | `d41005cee` feat(64-04): store setters for custom themes |

RED evidence: signature stubs in the RED commits keep the suites compiling (ts-jest type-checks, so a missing export would be INVALID_RED); the target tests then failed on assertions: 32 of 68 for Task 2, 14 of 25 for Task 3, each naming the planned behaviour (for example `drops invalid ids`, `keeps at most 50 themes`, `rejects "" as empty without writing`, `resolves 'applied' and re-applies when the edited theme is active`). Semantic assessment: every failure was an assertion on the planned behaviour, none a load, syntax or fixture fault; tests that already passed against the stubs are the refusal and totality cases a stub satisfies by returning nothing. Run directly with jest, not through `gsd_run check tdd-red-evidence` (the repo does not run with `workflow.tdd_mode`). No REFACTOR commit was needed.

## Task Commits

1. Task 1 (tracer): `be29c5fbb` feat(64-04): duplicate a built-in theme and apply custom themes over their base class
2. Task 2 RED `90224fbef`, GREEN `dd63c5e50`
3. Task 3 RED `aac8f5c9b`, GREEN `d41005cee`
4. Gate scope: `6d5cddb89` chore(64-04): record the custom-theme modules in the i18n gate scope
5. Knip: `39bbb2961` chore(64-04): clear the knip ratchet for the custom-theme exports

`actuals.commits: 7` is the measured `rev-list --count` from the ledger base and all seven are this plan's own commits.

## Files Created/Modified

- `src/frontend/customThemes/customTheme.ts` - key identity, resolver, parse, copy, naming, ids, limits
- `src/frontend/customThemes/validate.ts` - colour and gradient value validation
- `src/frontend/customThemes/applyTheme.ts` - body application of a resolved theme
- `src/frontend/index.tsx` - `window.setTheme` routed through `applyTheme`; local default constant replaced by `DEFAULT_THEME_KEY`
- `src/frontend/state/settingsState.ts` - `customThemes` slice and four setters
- `src/frontend/components/UI/ThemeSelector/index.tsx` - dead `defaultThemes` re-export dropped
- `meta/i18nForkTouchedFiles.json`, `meta/i18nGateScope.json`, `meta/__tests__/genI18nGateScope.test.ts` - gate scope and pins (416 to 419, 295 to 298)
- Four new test files under `src/frontend/customThemes/__tests__/` and `src/frontend/state/__tests__/`

## Decisions Made

- One resolver for theme identity (assumption-delta decision "promote"): callers never compare a key against `defaultThemes`.
- `cleanTokens` is shared by the boot parser and by Save (see Deviations 1).
- The default `CSS.supports` fails closed, so under jsdom or node no gradient is accepted unless `supports` is injected; the real WKWebView has `CSS.supports`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Save also enforces the token name pattern, the known-token universe and canonical colours**
- **Found during:** Task 3
- **Issue:** The plan says Save keeps tokens passing `isValidTokenValue`. That would let Save store a name the next boot's parser drops (`--evil`), reporting `saved` for data that silently vanishes after a restart, and would store non-canonical colour text.
- **Fix:** Exported `cleanTokens` from `customTheme.ts` (name pattern, universe, `isValidTokenValue`, canonical colour) and used it in both `parseCustomThemes` and `saveCustomThemeTokens`. `isValidTokenValue` is still the value gate inside it.
- **Files modified:** `src/frontend/customThemes/customTheme.ts`, `src/frontend/state/settingsState.ts`
- **Commit:** `d41005cee`

**2. [Rule 3 - Blocking] i18n gate and count pins**
- **Found during:** Task 3 (gate scope)
- **Issue:** `hardcodedStringGate` flagged `'custom:'` in `customTheme.ts` once in scope; `genI18nGateScope.test.ts` pins 295/416, which the plan did not list.
- **Fix:** Declaration-level `i18n-gate-exempt:` marker on `CUSTOM_THEME_PREFIX` (the persisted key prefix, never rendered); updated the pins and added the dated log paragraph, following the 64-02 precedent.
- **Files modified:** `src/frontend/customThemes/customTheme.ts`, `meta/__tests__/genI18nGateScope.test.ts`, the two meta JSON files
- **Commit:** `6d5cddb89`

**3. [Rule 3 - Blocking] knip ratchet findings**
- **Found during:** plan-level `pnpm find-deadcode`
- **Issue:** `defaultThemes` re-exported from `ThemeSelector/index.tsx` lost its only importer (`frontend/index.tsx`); `CUSTOM_THEME_PREFIX`, `MAX_TOKENS_PER_THEME` and `MAX_TOKEN_VALUE_LENGTH` had no importer.
- **Fix:** Removed the dead re-export (the original declaration in `themeLabels.ts` is untouched); the three constants are now exercised by `customTheme.test.ts` rather than tagged `@public`.
- **Files modified:** `src/frontend/components/UI/ThemeSelector/index.tsx`, `src/frontend/customThemes/__tests__/customTheme.test.ts`
- **Commit:** `39bbb2961`

**4. [Rule 3 - Blocking] `window.setTheme` call shape**
- **Found during:** Task 1 acceptance (`grep -c "applyTheme(document.body"` printed 0)
- **Issue:** The call was multi-line after formatting, so the key-link pattern did not match.
- **Fix:** Hoisted the parsed customs into a local so the call fits on one line.
- **Files modified:** `src/frontend/index.tsx`
- **Commit:** `be29c5fbb`

**Total deviations:** 4 auto-fixed (1 Rule 2, 3 Rule 3). **Impact:** none on the delivered contract; Deviation 1 closes a save/restart inconsistency.

## Issues Encountered

- Known pre-existing failures observed and left alone: `pnpm planning-gates` preload-surface-gate (four phase-81 `steamAdoption*` / `steamLaunchWithoutSteamOnce` channels), and the two `NativePort*` findings from `pnpm find-deadcode`. `pnpm codecheck`, `pnpm lint:src` (exit 0), jest over `src/frontend/customThemes`, `src/frontend/state` and `meta/__tests__/genI18nGateScope.test.ts` (755 passed), and the full `hardcodedStringGate` scope case pass; prettier is clean over every written path.
- `duplicateTheme` takes the source's display name only for a custom source; for a built-in it passes the key. The over-length shortening therefore never trims a built-in copy name, which is fine because built-in labels are short, but a long localized label could in principle fall to the plain 60-character slice. Plan 05 supplies the localized `copyName` closure.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-64-10 (total parse, caps, 500-structure test), T-64-11 (name pattern plus universe), T-64-12 (gradient deny-list, fail-closed supports), T-64-13 (id pattern, single fixed key) and T-64-14 (setters refuse non-custom ids, zero-write tests for `nord-light`) are implemented and tested.

## Open review item (carried from the plan)

THEME-02 "unclassified" edge category was left unresolved by design for the verifier.

## Next Phase Readiness

Ready for Plan 05/06: the gallery can offer `Duplicate`, `Rename`, `Delete` and the editor `Save` through `useSettingsState`, and read the active marker through `resolveThemeKey`. Live-check (Plan 10) still owes a real WKWebView confirmation that a custom theme paints app-wide.

## Self-Check: PASSED

- FOUND: all 7 created source and test files and this SUMMARY
- FOUND commits `be29c5fbb`, `90224fbef`, `dd63c5e50`, `aac8f5c9b`, `d41005cee`, `6d5cddb89`, `39bbb2961` (each an ancestor of HEAD)
- Acceptance criteria re-run: `applyTheme(document.body` in `index.tsx` 1; `document.body.className =` 0; `customThemes` in `settingsState.ts` 19; `setChecked('customThemes'` 1; `MAX_CUSTOM_THEMES = 50` 1
