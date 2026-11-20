---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 15
subsystem: frontend-state
tags: [zustand, authState, D-09, D-11, D-12]
requires: [69-14, 69-11]
provides: [8 auth-only consumers on authState]
key-files:
  modified: [src/frontend/screens/Login/components/OAuthLogin/index.tsx, src/frontend/screens/Login/components/SIDLogin/index.tsx, src/frontend/screens/Login/components/SteamLogin/index.tsx, src/frontend/screens/WebView/components/HumbleLoginSurface.tsx, src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx, src/frontend/components/UI/HumbleExpiryToast/index.tsx, src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx, src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx]
decisions:
  - "signInStateParity compares canonicalised expressions (alias table) so the notice (flat authState fields) and the still-context Login/index stay compared as same-value/same-key; 69-23 can drop the aliases when Login/index converts"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 15: auth-only consumers Summary

Eight auth-only consumers (OAuthLogin, SIDLogin, SteamLogin, HumbleLoginSurface, HumbleOriginInfo, HumbleExpiryToast, StoresPanel, LibrarySignInNotice) read `authState` (StoresPanel also `uiState.handleRedeemKeyDialog`) instead of ContextProvider. The notice passes identical values to `collectSignInInputs`/`resolveSignInStates`. None read a `.library` member.

## Commits
- 6164f9f14: Login, WebView, Game consumers
- c43a59fbf: LibrarySignInNotice, StoresPanel, HumbleExpiryToast

## Ratchet
frontend-context-ceiling 49 -> 41 (8 shard entries removed, screens-login shard deleted). backendDi: humbleExpiryToastSuppression jestMock 6 -> 5 (ContextProvider mock removed). No jest.mock added.

## Deviations
- [Rule 3] Two tests owned by no sibling plan fixed: `components/UI/NavShell/__tests__/destinationCoverage.test.tsx` (seeds authState/uiState in setContext) and `screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts` (source gate now expects `await humbleLogin(result)`).
- signInStateParity: alias canonicalisation and retargeted red-proof specimens (anti-vacuity kept: dropped-field and divergent-expression specimens still convict).
- StoresPanel test: the "humble is undefined" case was removed (authState.humble is always defined).

## Out-of-scope test breakage
None.

## Gates
Frontend jest 315 suites / 5376 tests pass; lint 0 errors; codecheck passes; both ceilings PASS; prettier clean. `pnpm find-deadcode` fails only on `DRAIN_GRACE_MS` in src/backend/process/runner.ts (other-session 66.1 noise).

## Self-Check: PASSED
