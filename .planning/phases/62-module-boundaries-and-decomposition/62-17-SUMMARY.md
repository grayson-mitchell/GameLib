---
phase: 62-module-boundaries-and-decomposition
plan: 17
subsystem: frontend
tags: [capabilities, frontend, boundaries, ratchet]
requires: [62-16]
provides:
  - FRONTEND_CEILING 136 -> 84; frontend helpers, hooks, state, components/UI, DownloadManager, WebView, Settings have no raw runner literal
  - isStore type-predicate overload (narrowing preserved) and string-subject widening
affects: [62-18, 62-19]
key-files:
  modified:
    - src/common/storeCapabilities.ts
    - src/common/__tests__/storeCapabilities.test.ts
    - meta/boundaryRatchet.cjs
    - src/frontend/helpers/{index,library,reportProblem,steamInstallOptionsEntry,storeDisplayName}.ts
    - src/frontend/hooks/{constants,hasAnticheatInfo,hasStatus}.ts
    - src/frontend/state/{GlobalState.tsx,InstallGameModal.ts,SteamBottleSetup.ts}
    - src/frontend/components/UI/{StoreLogos,UninstallModal}/index.tsx
    - src/frontend/screens/DownloadManager/** (4 files)
    - src/frontend/screens/WebView/** (4 files)
    - src/frontend/screens/Settings/** (6 files)
key-decisions:
  - "isStore gained an overload `<T extends {runner: StoreKey}, K extends StoreKey>(subject: T, store: K): subject is T & {runner: K}` so the five narrowing sites (library.ts, DownloadHero, DownloadManagerItem, Tools, GlobalState sideload, hasAnticheatInfo, handleGamePush chain) keep their union narrowing"
  - "isStore's fallback overload now takes `string` subjects (WebView's runner/store are string-typed); runtime unchanged"
  - "installFlowPredicates.ts NOT created: classification put the compound in common (isHandOffInstall), which state/InstallGameModal now uses"
  - "GamesSettings isSideloaded uses isStore (not !hasStoreCatalog): gameInfo may be undefined and the old check was false then"
  - "hasAnticheatInfo uses isStore (not hasStoreCatalog) to keep gameInfo.namespace narrowing"
  - "storeDisplayName / StoreLogos / LogSettings / useTauriOAuthLogin switches became Partial<Record> lookups; unknown runner still falls to the old default"
requirements-completed: [D-02, D-03, D-04, D-14]
completed: 2026-11-07
---

# Phase 62 Plan 17: frontend shared layers, components, DownloadManager, WebView, Settings Summary

**Three commits lower FRONTEND_CEILING 136 -> 114 -> 106 -> 84; no new capability flag.**

## Tasks
1. helpers + hooks + state, 136 -> 114: `cc0be7c31`
2. components/UI + DownloadManager, 114 -> 106: `4cf1db63d`
3. WebView + Settings, 106 -> 84: `e6df6cb15`

## Notes
- The ratchet counts each switch `case` literal separately, so the removed-site counts (22/8/22) exceed the table row counts; ceilings are the measured values (equality holds each commit).
- `steamInstallOptionsEntry.ts`: only the three comparison expressions changed; header, exports, B4 split untouched.
- `--list` shows no remaining site in any directory this plan owns; the 84 left belong to 62-18/62-19 (screens/Game, Library, ConsoleMode, Humble, Login, ...).

## Deviations from Plan
**[Rule 3 - blocking] isStore overload** needed to keep TypeScript narrowing at literal-check sites (plan did not anticipate it). Added with a test.
**[Rule 1 - test] source-scan retargets** (teeth kept): GlobalStateScopedRefresh, GlobalStateRefreshCacheGuard, WebViewAdtractionGapDeclared, steamEnginePlacement now assert the isStore/hasCapability forms (and their negative controls).

## Verification
codecheck, lint (0 errors), boundaries (frontend 84/84, depcruise clean), find-deadcode, prettier pass. Full jest: only baseline failures (see handback).

## Self-Check: PASSED
