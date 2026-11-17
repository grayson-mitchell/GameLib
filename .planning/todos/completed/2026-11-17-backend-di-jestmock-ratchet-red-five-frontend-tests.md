---
created: 2026-11-17T00:00:00.000Z
title: 'backend-di-ceilings jestMock ratchet is red: five frontend tests added or grown since the last green run'
area: tests
files:
  - meta/backendDiCeilings/frontend-screens-game.json
  - src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx
  - src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx
severity: major
platform: any
ready: code
---

## Problem

Found by Plan 78-05's cold run of `pnpm backend-di-ceilings` at a96dab654 (clean worktree). The `Backend DI ceilings` step of `lint.yml` is un-masked and was already guarded by quick 261114-2gg, so CI Lint is red on this step.

- `NoticeStackTwoToast.test.tsx`: 7 `jest.mock` calls, no baseline entry (quick 261116-s6q, 1c0e59909).
- `steamLoginPollLifecycle.test.tsx`: 4 `jest.mock` calls, no baseline entry (79 review slice C2 and quick 261116-w6t).
- `GameStatus.bottleWaiting`, `.redistSpinner`, `.steamUpdate`: 8 calls against baselines of 7. The extra call is the `../SteamUpdateInfo` stub added with quick 261114-obu; removing it makes the suite fail to load (SteamUpdateInfo pulls its own context and stores).

The contract forbids adding or raising a baseline ("remove it instead"), so the fix is to reduce the mocks, not edit `meta/backendDiCeilings/*.json`.

## Solution

Rewrite these five tests to use fakes passed in through props/context or the existing testUtils helpers instead of `jest.mock`. Cheap first steps: a `moduleNameMapper` stub for `.scss` removes four of the NoticeStack and one of the SteamLogin mocks; the rest need real seams (react-i18next faithful stub is already in `faithfulTranslate`). Plan 78-05 stopped here after one attempt (the SteamUpdateInfo stub cannot simply be dropped).

## Resolution

Resolved by quick 261117-omv. A jest css/scss moduleNameMapper stub replaced the per-test scss mocks; the Login route constants moved to a light `loginPaths.ts` seam so NoticeStackTwoToast needs no Login mock; steamLoginPollLifecycle now uses the real Dialog, store and QR; the GameStatus trio dropped two mocks each and their shard baselines were lowered 7 -> 6.
