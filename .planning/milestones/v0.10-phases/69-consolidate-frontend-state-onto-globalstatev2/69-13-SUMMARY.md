---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 13
subsystem: frontend-state
tags: [zustand, authState, sign-in, humble, D-10]
requires: [69-11, 69-12]
provides: [authState store (identities, Humble session, probe outcomes, dismissed set), bridgedAccounts composites, boot auth listeners and post-await mount functions]
key-files:
  created: [src/frontend/state/authState.ts, src/frontend/state/__tests__/authState.test.ts]
  modified: [src/frontend/state/GlobalState.tsx, src/frontend/state/bridgeContextValue.ts, src/frontend/state/initStateSubscriptions.ts, src/frontend/state/settingsState.ts, src/frontend/state/__tests__/GlobalStateSignInMount.test.ts, src/frontend/helpers/__tests__/signInIdentityResync.test.ts]
decisions:
  - "applyHumbleSyncState takes clearSyncing (default true): the terminal push clears syncing, the mount pull leaves it, as the class did"
  - "Login/logout actions stay in the class and split writes: identity to useAuthState.setState, library to this.setState (69-14 moves them)"
  - "completeOAuthLogin's setState dep is a class method that splits the factory's slice; createOAuthLoginCompletion is unchanged"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 13: authState Summary

`authState` is now the only owner of the Epic/GOG/Amazon/Steam identities, the whole Humble session object, `signInProbeOutcomes` and `dismissedSignInNotices`. GlobalState keeps only the four libraries for epic/gog/amazon/steam. The bridge rebuilds the `epic/gog/amazon/steam/humble` composites (same keys) from authState plus the class's libraries and login/logout methods via the new `bridgedAccounts()`.

## Commits
- c907036b1: authState store, tests, `globalSettingsAtImport` exported from settingsState (R5)
- 61d2b33ca: boot/bridge/GlobalState wiring, behavioural sign-in gates

## What moved
- Boot (`initStateSubscriptions`): `readInitialAuth` in section (1); the five Humble/probe listeners, the connected-flag `humbleSync()` and the two Humble pulls in section (2) (`registerAuthListeners`). Post-await functions exported for componentDidMount: `seedEpicUserInfo`, `refreshAmazonUserInfo`, `pullSignInProbeOutcomes`, `hydrateDismissedSignInNotices`; the final rearm is `useAuthState.getState().rearmFromCurrentState()` at the same position.
- Sanitiser kept with both the push and the pull (`applySignInProbeOutcomes`). Dismissed set persists only from dismiss and re-arm; hydration is a read.
- No secret, cookie or localStorage in authState (grep 0).

## Tests
- authState: 16 cases incl. RED specimen for the unsanitised variant.
- GlobalStateSignInMount rewritten behaviourally (no readFileSync): three RED specimens (humbleCheckHealth, renderer probe, unsanitised push) and the SELF-TEST kept as convictions of a violation check run against a recording fake `window.api`.
- signInIdentityResync "wiring source gate" now pins the class call sites by text (login paths still live in the class until 69-14) and proves the patch-then-rearm order behaviourally against authState.
- bridge test: composites keep keys and follow authState; slice carries notice state/actions; authState change notifies.
- initStateSubscriptions test: auth listeners registered once, readInitialAuth, sync gate, pulls, pushes.

## Deviations
- [Rule 3 - Blocking] Three tests owned by no sibling plan broke indirectly and were fixed: GlobalStateFocusRowHydration and GlobalStateSavedZoomWiring fakes lacked `humbleGetKeys`/`humbleGetSyncState` (boot now calls them); GlobalStateRefreshCacheGuard asserted the old `epic.username && ...` text, now `auth.epicUsername && ...` (same rule: guards test the cache-backed variable).
- [Note] No `meta/knip-baseline.txt` change was needed. `HumbleAuthSlice` stayed unexported.

## Gates
- Frontend jest: 314 suites, 5364 tests pass. lint 0 errors. frontend-context-ceiling PASS (49). backend-di-ceilings PASS. prettier clean on all touched files. No new `jest.mock`. `PERF_ERA=check pnpm perf:rerender` passes; check.json deleted, baseline untouched.
- `pnpm codecheck` and `pnpm find-deadcode` fail ONLY on the other session's phase 66.1 work (src/backend/__tests__/launcher_*.test.ts `LogWriter` errors; `DRAIN_GRACE_MS` export in src/backend/process/runner.ts). No finding in a file touched here. Treated as passing for my files (frontend tsc errors: none).

## Self-Check: PASSED
