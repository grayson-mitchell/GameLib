---
created: 2026-11-16
title: "genI18nGateScope is the one red suite left from the 13 outside Phase 78's four"
area: testing
files:
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
severity: major
platform: any
ready: code
---

## Problem

Quick 261117-pfj fixed 12 of the 13 suites this todo listed (moduleStateCensus, sidecarShutdownFlagSource, tauriShellSource, flowRegistrationCensus, ipcDomainCensus, epicOfflineMode, shimCoverage, shimGenerate, themeTokens, callbackRegistryHost, gamelibCatalogParity, lintTranslations). One remains, and it needs a decision rather than a pin move.

`meta/__tests__/genI18nGateScope.test.ts` has three red tests:

- A-17 anti-rot: the committed `meta/i18nForkTouchedFiles.json` (396 files) lacks 9 files the live git derivation lists: `src/frontend/__mocks__/styleStub.ts`, `src/frontend/dev/noticePreview.ts`, `src/frontend/screens/Game/GamePage/components/Achievements.tsx`, `DotsMenu.tsx`, `HLTB.tsx`, `SteamUpdateButton.tsx`, `src/frontend/screens/Game/GameSubMenu/SteamDirectLaunchButton.tsx`, `src/frontend/screens/Login/loginPaths.ts`, `src/frontend/testUtils/jsdomNoticeEnv.ts`. The earlier note that the committed list had 6 entries the live one lacks was the wrong way round.
- A0 and A2: `meta/i18nGateScope.json` now holds 276 files (quick 261117-p38 hand-added `SteamDirectLaunchButton.tsx`) but the test pins 275 and fixture-derived diffs.

Running `pnpm gen-i18n-gate-scope` fixes A-17 but turns the A-03 ratchet red, because 8 of the 9 new fork-touched files are neither in the hand-curated scope nor in the declared unscanned debt. Each of those 8 has to be either scanned (added to `i18nGateScope.json`, so it must pass the hard-coded-string gate) or declared as debt (which widens a ceiling).

## Solution

Decide per file: scan (add to scope and fix any hard-coded strings) or declare debt with a reason. Then run `pnpm gen-i18n-gate-scope`, move the pinned 275 and 396 counts in the test to the measured values, and confirm `git diff --quiet meta/i18nCatalogPresenceBaseline.json`. Do not widen the declared debt just to get the ratchet green.

## Resolution

Closed 2026-11-17 by quick 261117-pfj (56756396c). User decision: scan the files rather than declare debt. An audit-mode `scanScope({ extraFiles })` over the 8 new fork-touched files found 3 literals. The two "Hidden Achievement" strings in `Achievements.tsx` now read `gamelib:gamepage.hiddenAchievement` (translated into 48 locales). The other 7 files were hand-inserted into `meta/i18nGateScope.json` (scope 283). By a second user decision, `dev/noticePreview.ts`'s one literal, a fixture game title, was allowlisted at expectedCount 1. The allowlist pin moved from 2 to 3, and the file is listed in DEFERRED_FILES and `excluded.deferred`. `meta/i18nForkTouchedFiles.json` was regenerated from a clean tree (404). DECLARED_UNSCANNED_DEBT and `meta/i18nCatalogPresenceBaseline.json` are unchanged. All 13 original suites pass (1253 tests).
