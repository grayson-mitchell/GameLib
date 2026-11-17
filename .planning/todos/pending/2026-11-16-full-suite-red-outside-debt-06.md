---
created: 2026-11-16
title: "Full test:ci run has 13 red suites outside Phase 78's four"
area: testing
files:
  - src/backend/__tests__/moduleStateCensus.test.ts
  - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
  - src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - meta/__tests__/callbackRegistryHost.test.ts
  - meta/__tests__/gamelibCatalogParity.test.ts
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/__tests__/lintTranslations.test.ts
severity: major
platform: any
ready: code
---

## Problem

Measured by Plan 78-05 from a clean worktree at a96dab654 (`pnpm test:ci`): 13 suites fail (135 failing tests), 1023 pass, 5 skipped. macArchKnownFixRouting, installFlows, runnerSliceRegistration and testContainment all pass in that run, so DEBT-06 is met; these 13 are the other reds. CI Test is red repo-wide because of them, which hides new regressions.

| Suite | First failure |
| --- | --- |
| meta/__tests__/callbackRegistryHost.test.ts | harness compile failed: `unknown type name 'LONG'` in gl_cb_registry.c:1174 (host C compile of a Windows-typed harness; platform dependent, `[ASSUMED]`) |
| meta/__tests__/gamelibCatalogParity.test.ts | ar: 'steam.bridge.route.missingSymbols' is not a key in en/gamelib.json (orphaned translation) |
| meta/__tests__/genI18nGateScope.test.ts | A-17 anti-rot: committed meta/i18nForkTouchedFiles.json differs from the live git derivation (6 entries) |
| meta/__tests__/lintTranslations.test.ts | 672 hard failures: new keys not localised and not recorded (e.g. ar.gamelib.box.error.launch.epic.credentials) |
| src/backend/__tests__/moduleStateCensus.test.ts | unsanctioned module state: sidecar/steamPollEventRegistration.ts:200 INSTALL_STATE_KINDS new Set, steam/gameUninstall.ts:196 lastNoticeSeq let |
| src/backend/__tests__/sidecarShutdownFlagSource.test.ts | expected substring `on_sidecar_eof(&state.shutting_down` not in the Rust shell source (shell moved) |
| src/backend/__tests__/tauriShellSource.test.ts | WebviewWindowBuilder chain passes `.title(format!` (negative-half source pin vs STORE_EMBED_LINK_POPUP builder) |
| src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts | appShellFlowRegistration.ts registers send 13, table says 14 |
| src/backend/sidecar/__tests__/ipcDomainCensus.test.ts | part-interface total 288, pinned 294 |
| src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts | Test 6c: legendary/games.ts now references `signInProbe` (hit true, expected false) |
| src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts | SHIM_EXPORTED_SYMBOLS vs steam_api.def: SteamAPI_SteamMatchmakingServers_v002 missing (was red before and after Plan 78-03) |
| src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts | 24-CR-02: expected `placed`, got `placed-miss` (same def-versus-export drift) |
| src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts | render-site census: expected 29 .is-link sites, found 34 |

Compared with research's 12 at 19b3cac2c: gone are x86CallbackWineHarness (passed in this run; it took 28 s and may be load sensitive, `[ASSUMED]`); new are moduleStateCensus, sidecarShutdownFlagSource and epicOfflineMode. The other 9 carry over. steamLineCeiling was red in the first run at f526f45f8 and is fixed (a96dab654).

## Solution

Triage per suite; most are pins or censuses that moved when Phase 79 and Phase 80 changed the code they count (census/pin updates by hand, lowering where the count fell), the shim pair needs the SteamMatchmakingServers_v002 export reconciled, and the i18n trio needs the catalogue regenerated. Do not paper over a red by loosening a ceiling.
