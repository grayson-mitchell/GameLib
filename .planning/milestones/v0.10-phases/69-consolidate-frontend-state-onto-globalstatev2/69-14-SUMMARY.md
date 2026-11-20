---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 14
subsystem: frontend-state
tags: [zustand, authState, libraryState, D-06, D-09, D-10]
requires: [69-13]
provides: [auth login/logout actions in authState, libraryState skeleton with class-installed action slots]
key-files:
  created: [src/frontend/state/libraryState.ts, src/frontend/state/__tests__/libraryState.test.ts]
  modified: [src/frontend/state/authState.ts, src/frontend/state/GlobalState.tsx, src/frontend/state/bridgeContextValue.ts, src/frontend/state/__tests__/authState.test.ts, src/frontend/state/__tests__/bridgeContextValue.test.ts, src/frontend/state/__tests__/GlobalStateSteamLogout.test.ts, src/frontend/state/__tests__/GlobalStateScopedRefresh.test.ts, src/frontend/state/__tests__/GlobalStateRefreshLibraryOrigin.test.ts, src/frontend/helpers/__tests__/signInIdentityResync.test.ts, src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx]
decisions:
  - "libraryState holds only three slots (refreshLibrary, resetRunnerLibrary, setRefreshing); defaults log 'library slot <name> called before GlobalState installed it' and no-op; GlobalState's new constructor installs them once"
  - "authState actions call useLibraryState.getState() at call time; completeOAuthLogin is built once at module scope and splits the factory's slice into identity (set) and library (resetRunnerLibrary)"
  - "bridgedAccounts now takes only the four library arrays; login/logout and completeOAuthLogin come from authState"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 14: auth actions Summary

Epic/GOG/Amazon/Steam/Humble login and logout, `getAmazonLoginData`, `completeOAuthLogin` and `handleSuccessfulLogin` are now authState actions calling the same `window.api` channels in the same order. Library effects go through `useLibraryState` slots which the GlobalState constructor fills until the library wave. `performSteamLogout` is unchanged and its failure dialog is the same.

## Commits
- 11973dfdf: libraryState skeleton + authState actions + tests
- ed0a03fba: GlobalState drops 13 methods and installs slots; bridge, gates and OAuth wiring test rewritten

## Tests
- authState: 13 new action cases (login order, reject-in-finally for epicLogout, non-awaited logoutGOG, Steam confirmed vs unconfirmed with fake timers, Humble confirm gate and exact reset object, completeOAuthLogin).
- Steam-logout gate is now behavioural with two near-miss convictions (stale guard, clears-on-failure). No `readFileSync`.
- useTauriOAuthLogin wiring test drives the real `authState.completeOAuthLogin` with spy slots; `jest.mock` count unchanged (1).

## Deviations
- [Rule 3 - Blocking] Source-text gates owned by no sibling plan retargeted at the moved code: `GlobalStateScopedRefresh` (logout wrappers now read authState; slot reset accepted as "clears own runner"), `GlobalStateRefreshLibraryOrigin` (login-success / steam-login origin counts and the literal-only rule include authState.ts), `signInIdentityResync` wiring gate (store members read from authState.ts, refreshLibrary still from the class).
- [Note] Login tests supply the config-store answers because `handleSuccessfulLogin`'s resync re-reads identity from the stores (unchanged behaviour). Under uninitialised i18next `t` returns no text, so the failure-dialog test asserts button shape, not strings. `meta/knip-baseline.txt` needed no change; `LibraryState` type left unexported to satisfy knip.

## Gates
- Frontend jest: 315 suites, 5377 tests pass. lint 0 errors. frontend-context-ceiling PASS (49). backend-di-ceilings PASS. prettier clean. `PERF_ERA=check pnpm perf:rerender` passes; check.json deleted, baseline untouched.
- `pnpm codecheck` fails only on other-session phase 66.1 work (src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts, storeLayer.test.ts); `pnpm find-deadcode` fails only on `DRAIN_GRACE_MS` in src/backend/process/runner.ts. No finding in a file touched here.

## Self-Check: PASSED
