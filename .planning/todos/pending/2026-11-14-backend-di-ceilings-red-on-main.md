---
created: 2026-11-14T00:00:00.000Z
title: 'backend-di-ceilings fails on main: 20 new jest.mock suites with no baseline, games.test.ts grew 47 -> 48'
area: tests
files:
  - meta/backendDiCeilings.cjs (704-735, the check)
  - meta/backendDiCeilings/sidecar.json (and the sibling shards)
  - src/backend/storeManagers/steam/__tests__/games.test.ts
severity: medium
platform: any
ready: code
---

## Problem

From 66.4-REVIEW WR-01. `node meta/backendDiCeilings.cjs` (`pnpm backend-di-ceilings`) exits 1 at HEAD
with 21 failures:

- `grew: src/backend/storeManagers/steam/__tests__/games.test.ts 48 > baseline 47 (jestMock)`.
- 20 x `new violation: ... has N (jestMock) and no baseline entry`, including `updateBridge.test.ts`,
  `updateDetection*.test.ts`, `updateDispatch.test.ts`, `updateNative.test.ts`,
  `bridgeUpdateFollowUps.test.ts`, `checkGameUpdates.test.ts` and several frontend tests.

These suites came from phases 74 and 75 and from quick tasks, after 66.4 flipped the jest.mock
ratchet. The gate either doesn't run in CI, or it runs and its failures are ignored, so the ratchet
has drifted unnoticed.

## Solution

- Per D-16, drop the `jest.mock` calls from those suites by injecting deps. Where that is not
  practical, add baseline entries in a commit that names the introducing commits. Do not raise
  ceilings silently.
- Bring `games.test.ts` back to 47 (or justify 48 in the baseline commit).
- Wire `pnpm backend-di-ceilings` into the CI step that runs `pnpm planning-gates`, so drift turns CI
  red. Check first whether it is already in `.github/workflows/test.yml`.
- Done when `node meta/backendDiCeilings.cjs` exits 0 and CI runs it.
