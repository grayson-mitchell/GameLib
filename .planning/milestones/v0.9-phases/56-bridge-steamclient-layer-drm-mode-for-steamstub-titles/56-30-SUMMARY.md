---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 30
subsystem: test-gates
tags: [gap-closure, jest, i18n, sidecar]
requirements: [D-17]
key-files:
  modified:
    - meta/machineFillGamelib.ts
    - meta/i18nCatalogPresenceBaseline.json
    - src/backend/storeManagers/steam/macArchKnownFix.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts
metrics:
  tasks: 2
  completed: 2026-10-29
---

# Phase 56 Plan 30: Gap 7 test-gate closure Summary

10 of the 11 failing tests are fixed. The one still failing is `genI18nGateScope` A-17. I stopped on it under the plan's stop-and-report clause. The 7-suite command reports 1 failed, 385 passed.

## Commits
- 5fbd769a4: deterministic plural order, `isIntelMac` comment, `library.stopTile` presence baseline
- ca4cd8f2d: sidecar containment classification and channel pin
- 022de9cd2: installFlows Test 1b

## Cause per failure
| Failure | Cause | Fix |
|---|---|---|
| machineFillGamelib `pluralCategoriesFor` x3 | The local ICU build orders `resolvedOptions().pluralCategories` non-canonically (ru gave few, many, one, other) | The function now filters `PLURAL_SUFFIXES` (zero, one, two, few, many, other) by membership. The tests are unchanged. |
| lintTranslations REQ-41-02 live tree and R13 baseline | `library.stopTile` was added to English by 78f657b58 with no baseline entry, giving 48 locale pairs | Ran `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. This records the pairs as untranslated, the same way 2fa6c72c9 did for the drm strings. Nothing was added to any ignore list. |
| isIntelMacRemoved | The literal `isIntelMac` in a comment at `macArchKnownFix.ts:31` (a029f1f15) | Reworded the comment. No code changed. |
| testContainment T-34.2-83 | `stdinEofRelease.test.ts` and `steamNativeInstallDefault.test.ts` were never classified | Both added to `STRUCTURALLY_CONTAINED_SUITES` with a rationale comment. Neither spawns a process, and both use mocks or a tmpdir profile only. |
| runnerSliceRegistration containment pin and "exactly 67 handle" count | The plan blamed `dialogDisplayed` (509bcb01b). That channel is a listen-kind in `appShellFlowRegistration`, which this suite does not cover. The real cause is `getGamelibFixStatus` (a2385f6bf, quick 261027-ch9), a new invoke in `enrichmentFlowRegistration`. | Added the channel to `ENRICHMENT_CHANNELS`. Handle count 67 to 68, per-module counts 14 to 15, total 66 to 67, with history clauses in the titles. |
| installFlows Test 1b | `jest.requireActual('backend/utils')` inside the mock factory re-enters the factory through `utils/helperBinaries` and `gog/presence`. `steam/installLocation` therefore got a different `getSteamLibraries` `jest.fn()` than the test arranged, which returned undefined and made `.map` throw. I confirmed this by logging the factory stack and the mock state. | Both stubs are pinned to one shared instance on `globalThis` in the factory. The test's assertions are unchanged. I did not identify which commit created the cycle and did not bisect. `gog/presence.ts` importing `backend/utils` is old, so the trigger may be elsewhere in the graph. |

## RESOLVED (see "A-17 closure (follow-up)" below): genI18nGateScope A-17 (was: stop and report)
- **Differing paths:** the live git derivation yields 283 fork-touched files and the committed `meta/i18nForkTouchedFiles.json` has 258, generated 2026-10-12. The 25 missing paths are all legitimate fork files added since then. They include `DialogHandler/ackWhenVisible.ts` and `MessageBoxModal/*`, `WelcomeModal/*`, `resolveBootLanguage.ts`, `SetupDownloadItem/*`, `SteamBridgeRouteNotice`, `SteamGoOfflineNotice`, `bridgeRouteDisplay`, `gamelibFixDisplay`, `playClickedLatch`, `crossoverInstallRisk`, `steamBridgeRouteLine`, `librarySort`, `useNonSteamLastPlayed`, `Shortcuts.tsx`, `WrappersTable.tsx`, `BottleLaunchWaiting`, `dialogQueue`, `savedZoomBoot` and `SteamSetupDownloads`.
- **Why I did not regenerate:** I ran `pnpm gen-i18n-gate-scope` and measured it. The plan names `gen-i18n-scope:rewrite`, but that targets the hand-curated blocking scope file and the generator refuses it, so I used the routine command. Regenerating fixes A-17 but breaks 4 other tests in the same file:
  - the A-03 declared-debt ratchet gains 25 unscanned files;
  - A0, A2 and A3 hard-code 258.

  Fixing those means editing `meta/__tests__/genI18nGateScope.test.ts` (outside this plan's files) and either declaring 25 more unscanned files as debt or adding them to the blocking hardcoded-string scope. Both are decisions about the i18n gate. I reverted the regeneration, so `meta/i18nForkTouchedFiles.json` is untouched. I did not bisect, because the cause is plain accumulation of new files.
- **Decision needed:** declare the 25 files as debt, or bring them into scope after an audit.

## Deviations
- **[Rule 1] runnerSlice cause corrected:** the real channel was `getGamelibFixStatus`, not `dialogDisplayed`. The plan allowed fixing whichever channel the pin named.
- A-17 is not fixed, as described above.

## Verification
- `pnpm codecheck`, `tsc --noEmit` and prettier on the non-ignored paths are clean.
- The 7-suite jest run is 6 suites green and 1 failed test (A-17).
- Plan 56-27/28/29 files were not touched.

## Self-Check: PASSED (commits 5fbd769a4, ca4cd8f2d, 022de9cd2 exist)

## A-17 closure (follow-up)
Decision: audit into scope, not declared debt.
- Regenerated `meta/i18nForkTouchedFiles.json` with `pnpm gen-i18n-gate-scope` (258 -> 283).
- Audited the 25 new files with `scanScope({ extraFiles })`. 19 had zero violations and were hand-inserted into `meta/i18nGateScope.json` in sorted position (212 -> 231).
- Six files had 48 violations, all false positives (no untranslated user text): `buttonClassName.ts` (CSS class strings), `welcomeState.ts`, `bridgeRouteDisplay.ts`, `steamBridgeRouteLine.ts` (bare dotted i18n key literals), `crossoverInstallRisk.ts` (key plus default pairs in an unrecognised shape), `resolveBootLanguage.ts` (diagnostic message passed to an injected logger). Classification call: dev-only log text and key literals are not user-facing strings, but the gate does not yet exempt those shapes.
- The six are declared as TEMPORARY entries in `DECLARED_UNSCANNED_DEBT`. Todo `.planning/todos/pending/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md` widens the gate (with paired negative fixtures), promotes them, and removes the entries. `meta/hardcodedStringGate.ts` was not changed.
- `genI18nGateScope.test.ts` A0/A2/A3/A4 literals updated 212/258 -> 231/283.
- Verified: the 7-suite command plus `hardcodedStringGate.test.ts` all pass (543 passed, 1 skipped), `tsc --noEmit` clean, `pnpm planning-gates` 12/12, scoped prettier clean.
