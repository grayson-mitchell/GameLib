---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 24
subsystem: frontend-state
tags: [zustand, boot, cleanup, ratchet]
requires: ["69-20", "69-21", "69-22", "69-23"]
provides:
  - BootSequence + runPostMountBoot (post-mount boot tail)
  - GlobalState, ContextProvider, bridge and D-12 ratchet deleted
affects: [69-25, 69-26]
key-files:
  created:
    - src/frontend/state/BootSequence.tsx
  modified:
    - src/frontend/state/initStateSubscriptions.ts
    - src/frontend/index.tsx
    - src/frontend/types.ts
    - src/frontend/state/accountHooks.ts
    - src/frontend/state/__tests__/steamSyncStatusWiring.test.ts
    - meta/rerender/seam.tsx
  deleted:
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/ContextProvider.tsx
    - src/frontend/state/bridgeContextValue.ts
    - meta/frontendContextCeiling.cjs (+ state.json, 2 tests, 3 wiring points)
decisions:
  - "ContextType replaced by a narrow AccountSlices interface in types.ts (the shapes accountHooks builds); RefreshOptions removed."
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 69 Plan 24: Delete the class, the context and the ratchet

The componentDidMount tail now runs from `runPostMountBoot()` in `initStateSubscriptions.ts`, triggered once by a stateless `BootSequence` (`useLayoutEffect`) that replaced `<GlobalState>` in `index.tsx`; GlobalState, ContextProvider, the bridge and the D-12 ratchet are gone.

## Commits
- 5e4d6215e: runPostMountBoot + BootSequence; GlobalState, bridgeContextValue (+test) and ratchet state.json deleted
- 07b61fa94: ContextProvider, ContextType, ratchet script/tests and package.json / .husky/pre-push (line 2 stays line 2) / lint.yml wiring removed in one commit (D-12); comment sweep
- ab1979990: harness seam rewritten

## What changed
- `runPostMountBoot` keeps the 69-19 recorded order and awaits verbatim, ending with `window.api.frontendReady()`; once-guarded. `bootSequenceEffect()` is a second once-guard; `__resetInitStateSubscriptionsGuardForTests` resets both. Tests (no jest.mock) cover the order, frontendReady last, single run, and double effect call.
- `GlobalStateFramelessRefresh` A4 now asserts the store directly (the bridge no longer exists).
- `steamSyncStatusWiring` W4 is now: libraryState declares the `steamSyncStatus` type (source) and its default is `'idle'` (via `useLibraryState.getState()`), with a RED proof (type removed, or non-idle default, both convicted).
- `framelessWindowCopy` asserts no `useContext(` instead of no `ContextProvider` text; `filterFocusRow` test stub identifiers renamed.
- Comment-only mentions of `GlobalState.tsx` / `ContextProvider` / `bridgeContextValue` were swept across about 60 files under src/ (excluding src/backend); additional files beyond the plan's list are all comment edits plus the two test renames above. `grep -rnE "GlobalState\.tsx|ContextProvider|bridgeContextValue" src | grep -v src/backend` returns nothing; `grep -rn ContextProvider src/` returns nothing at all in src/ (D-11: no test wrapper or shim existed).
- Unused imports left in types.ts by the removal were dropped; one pre-existing unused import (`resetAllStores` in FilterCollectionList.test.tsx, from 69-22) fixed for lint.
- Harness (`PERF_ERA=check`) through the real boot path (initStateSubscriptions + BootSequence): toggleAppearance Library 1 / GameCard 100, gameStatusPush 3 / 200, dialogOpenClose 0 / 0, libraryRefreshPush 2 / 200 (non-zero; Library does not subscribe to the dialog store). check.json and smoke.json deleted; baseline.json untouched.

## Not changed (recorded)
- src/backend/** still has 7 comment mentions of `GlobalState.tsx` (other session's tree). meta/ keeps historical mentions (`hardcodedStringGate.ts`, `isIntelMacRemoved.test.ts` comments) and `meta/i18nGateScope.json` / `i18nForkTouchedFiles.json` entries naming the deleted files (meta tests unaffected). No backendDiCeilings frontend shard was empty/changed. knip baseline needed no change (PASS).

## Deviations
- [Rule 3] ContextType could not simply be deleted: accountHooks.ts typed its builders off `ContextType[...]`. Introduced `AccountSlices` (just those eight shapes) in types.ts and retargeted accountHooks.
- [Rule 3] Task 3 was edited after Task 2's codecheck, so the intermediate commit (5e4d6215e) left seam.tsx importing deleted modules until ab1979990 (seam is outside tsconfig; harness only).

## Gates
- Frontend jest: 315 suites / 5427 tests pass. Meta jest: only the 5 known failures (gamelibCatalogParity, genI18nGateScope, lintTranslations, logSecretGate, x86CallbackWineHarness). codecheck passes for my files (it flickered once on other-session steam/stores edits and then passed). find-deadcode PASS. steam-line-ceiling PASS. planning-gates PASS.
- Other-session noise: `pnpm lint` error in src/backend/storeManagers/steam/library/refresh.ts (unused `steamMetadataStore`); `pnpm backend-di-ceilings` "shrank" for steam `launchDispatch.test.ts`. Neither is a file I touched.
- Not run: optional `pnpm tauri:dev` cold launch, full pre-push chain beyond the above.

## Known Stubs
None.

## Self-Check: PASSED
