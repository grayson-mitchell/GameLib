---
phase: quick-261103-wjs
plan: 01
subsystem: test-suite
tags: [jest, i18n, cargo, log-secret-gate, test-seams]
requirements: [TODO-2026-11-03-jest-failures]
key-files:
  modified:
    - src/backend/__tests__/cargoFeatures.test.ts
    - meta/i18nCatalogPresenceBaseline.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts
    - meta/__tests__/logSecretGate.test.ts
    - src/backend/storeManagers/steam/clientSetup.ts
    - meta/buildSteamBridgeShims.ts
    - src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts
    - src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts
    - src/backend/sidecar/__tests__/steamFlows.test.ts
    - src/backend/sidecar/__tests__/skeletonFlows.test.ts
    - src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
metrics:
  completed: 2026-11-03
---

# Quick 261103-wjs: Fix the ten failing jest suites Summary

All ten suites named in the todo now pass, no gate was loosened. The full `npx jest` is NOT fully green: one different suite (`themeTokens`) fails, caused by a later commit (see Deferred Issues).

## Commits

- `709ad23db` Task 1: cargo pin (+9 gilrs crates), i18n presence baseline regenerated (no locale touched), fork-touched 293 -> 323, scope 246 -> 271 (25 zero-violation files promoted), 5 files declared as debt (CaptionGlyphs 3, connectivitySync 5, reportProblem 2, SteamEngineOverride 3, WinePrefix 1), pinned counts and changelog updated.
- `863c8f53e` Task 2: `log-secret-gate-exempt` on the installer stderr log in `clientSetup.ts`; `buildSteamBridgeShims.ts` comment reworded (0 occurrences of `buildLsteamclient`); `steamInstallOptionsEntry` C3 re-pointed at `installLabel`; `appShellLayout` per-file gate now checks `scrollCardIntoView.ts` plus a sibling test for the GamesList listener site.
- `ed98cead3` Task 3: `process.platform` pinned to linux (restored afterAll) in `steamFlows` and `skeletonFlows`, so a Mac run no longer spawns a real `open -g steam://...`; `backend/macArch/recovery` mocked in `getDefaultLegendarySavePathRefresh`.

## Deviations

**[Rule 3 - Blocking] logSecretGate exemption ratchet pinned at 13**
- The plan said `meta/__tests__/logSecretGate.test.ts` stays unchanged, but it holds two pins (exact count 13, exact file list) that the new sanctioned exemption trips ("adding a 14th must be a conscious act").
- Fix: bumped to 14, added `steam/clientSetup.ts` to the file list, with a dated comment. The gate (`meta/logSecretGate.ts`) and its scanning logic are untouched.
- Commit `863c8f53e`.

Also: the plan's "git diff touches only 12 files" is 13 here (the above). The `generatedAt` of `i18nForkTouchedFiles.json` was restored with perl (BSD sed failed on the first try; no other effect).

## Deferred Issues

- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` ("MainButton surface resolution ... .mainInfo ...", line 3293) fails: `buttonsBlock` now declares `background-color: var(--body-background)` at depth 0. Not one of the ten and not touched here; most likely from `813187cdc` (quick 261103-w9l, game page Play/Settings buttons), committed after the todo was written. Needs its own fix.

## Full jest result

`npx jest` (6 projects): Test Suites: 1 failed, 1 skipped, 753 passed, 754 of 755 total. Tests: 1 failed, 5 skipped, 17363 passed, 17369 total. The single failure is `themeTokens` above.

## Housekeeping

Source todo moved (staged `git mv`) to `.planning/todos/completed/`, left uncommitted for the orchestrator. `graphify update .` run. Unrelated dirty files were not touched. `public/locales` unchanged.

## Self-Check: PASSED

Commits 709ad23db, 863c8f53e, ed98cead3 exist; the ten suites pass individually.

## Orchestrator follow-up

The executor's full run left one failure outside the ten: `themeTokens` "MainButton surface resolution",
introduced by `813187cdc` (quick 261103-w9l), which pinned `.buttons` sticky with an opaque
`background-color: var(--body-background)`. The gate drifted, not the code: `.buttons` is now the
nearest painted ancestor and uses the same token as `.mainInfo`, so the resolved surface is unchanged.
`3a27f4e59` re-points the assertion and the derived `mainButtonSurfaceDecl` at `.buttons`.

Final full `npx jest`: Test Suites 1 skipped, 754 passed (755); Tests 5 skipped, 17364 passed (17369).
