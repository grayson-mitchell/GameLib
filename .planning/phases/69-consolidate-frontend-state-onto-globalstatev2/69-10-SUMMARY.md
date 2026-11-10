---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 10
subsystem: frontend-state
tags: [zustand, settingsState, bridge, boot-module]
requires: [69-06]
provides: [settingsState store (16 fields, 16 setters), selectIsRTL, boot-module zoom/focusRow, settings side-effect subscriptions]
key-files:
  created: [src/frontend/state/settingsState.ts, src/frontend/state/__tests__/settingsState.test.ts]
  modified: [bridgeContextValue.ts + test, initStateSubscriptions.ts + test, GlobalState.tsx, GlobalStateSavedZoomWiring.test.ts, GlobalStateFocusRowHydration.test.ts]
decisions:
  - "ContextType has no primaryFontFamily/secondaryFontFamily fields, so the bridge slice omits them; only the setters are bridged"
  - "focusRowMirrorSeed and the import-time globalSettings read live in settingsState (R5 timing preserved); GlobalState keeps its own globalSettings for dismissedSignInNotices (moves in 69-13)"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 10: Settings slice onto settingsState Summary

The settings/theme/appearance slice (language, theme, zoom, fonts, tile toggles, sidebar, changelog flags, experimental features, dialog/animation flags, focusRow) is owned by `settingsState`. Setters keep the class's configStore keys and write order, with no persist middleware. `isRTL` is derived by `selectIsRTL`. Phase 64's custom-theme state has its home (D-13).

## Commits
- ae25f5d5a: settingsState store + 18-case test
- df4267287: bridge, boot module, GlobalState shrink, two gate rewrites

## What moved
- GlobalState: 16 fields, 16 setters, focusRowPickedThisSession, zoomTimer, zoom/focusRow blocks in componentDidMount, the isRTL/sidebar/hide_changelogs/last_changelog writes in componentDidUpdate (`updates` and the sleep block kept). The tail font lines became `applySavedFonts()` at the same position.
- initStateSubscriptions: section (1) applies `readInitialSettings()`, then `applySavedZoomAtBoot` and focusRow hydration run before any listener, and section (3) calls `registerSettingsSideEffects()`.
- Bridge slice carries all moved fields, `isRTL`, and the setters.

## Gate rewrites
GlobalStateSavedZoomWiring and GlobalStateFocusRowHydration are now behavioural (no readFileSync), each with near-miss/anti-vacuity self-tests.

## Deviations
- [Note] The plan says hydration "never writes via setSetting". `hydrateFocusRowSelection` writes the value back once on purpose (it makes the key present). The test asserts exactly that, and zero hydration writes when the user picked first.
- initStateSubscriptions.test needed document/getComputedStyle/localStorage stubs and a storeGet/setZoomFactor-aware fake api now that section (1) reads settings.

## Gates
Frontend jest (312 suites, 5330 tests), codecheck, lint (0 errors, production and tests ceilings PASS), find-deadcode (no knip-baseline change), frontend-context-ceiling, backend-di-ceilings all exit 0; prettier clean. `PERF_ERA=check pnpm perf:rerender` passes; check.json deleted, baseline untouched. No new jest.mock.

## Out-of-scope test breakage
None.

## Self-Check: PASSED
