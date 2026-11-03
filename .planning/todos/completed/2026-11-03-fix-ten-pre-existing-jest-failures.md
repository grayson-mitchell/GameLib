---
created: 2026-11-03T12:00:00.000Z
title: "Fix the ten jest suites failing on main before phase 59 round 6"
area: test-suite
files:
  - src/backend/__tests__/cargoFeatures.test.ts
  - meta/__tests__/lintTranslations.test.ts
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - meta/__tests__/logSecretGate.test.ts
  - src/backend/storeManagers/steam/clientSetup.ts:280
  - meta/__tests__/buildLsteamclient.test.ts
  - src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts
  - src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts
  - src/backend/sidecar/__tests__/steamFlows.test.ts
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  - src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
severity: major
platform: any
ready: code
---

## Problem

During phase 59 gap-closure round 6, a full `npx jest` run on main had 10 failing suites
(11–13 tests). The same suites fail identically at `3f470bceb` and `75d82bee3`, both before
round 6, so they came from earlier work. The operator chose to run re-UAT 6 first and fix
these separately (2026-11-03).

| Suite | Cause seen |
| --- | --- |
| `cargoFeatures` | Cargo.lock gained 9 crates from the gilrs gamepad reader (`70f7022af`, quick-261031-mj9): cfg_aliases, gilrs, gilrs-core, inotify, inotify-sys, libudev-sys, nix, objc2-io-kit, vec_map |
| `lintTranslations` (2 tests, incl. `comparePresenceBaseline` R13) | 3,984 gamelib keys across all locales are neither localised nor in the baseline (e.g. `reportProblem.*`, `box.quit.bridgeHosting`, `consoleMode.steamClientSetupHandOff`) |
| `genI18nGateScope` A-17 | committed `meta/i18nForkTouchedFiles.json` no longer equals the live git derivation (the derivation returns 30 fewer entries) |
| `logSecretGate` (2 tests) | `clientSetup.ts:280` logs `stderr.trim()` unreduced, added by `3f0df053c` (quick-261102-0yc) |
| `buildLsteamclient` source gate | a packaging script now mentions `buildLsteamclient`, which the gate says must be unreachable from the shim build and CI |
| `steamInstallOptionsEntry` C3 | GameCard/index.tsx no longer contains `label: t('button.install')` |
| `appShellLayout` | GamesList/index.tsx no longer matches `/main\.content/` (scroll-container migration gate) |
| `steamFlows` Test C, `skeletonFlows` Test 2 | `openExternal` is undefined in the sidecar Steam launch flow |
| `getDefaultLegendarySavePathRefresh` | suite fails to load: `platform_1.app.getAppPath is not a function` (mock is missing `getAppPath`) |

## Decisions already made (operator, 2026-11-03)

- **Cargo pin:** accept the 9 gilrs crates. Add them to `EXPECTED_LOCKFILE_CRATE_NAMES`.
- **i18n:** regenerate the presence baseline so these keys are recorded as untranslated
  (English fallback). Do not translate them now.

## Solution

Fix each row on its own merits. For each gate failure, decide whether the gate or the code is
the thing that drifted, and do not loosen a gate just to make it pass (the logSecretGate,
buildLsteamclient and appShellLayout rows each guard a specific defect). Finish with a green
full `npx jest` run.
