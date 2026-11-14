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

Update 2026-11-14 (quick 261114-1m4): now 22. Quick 261114-1fi (`795e0aaa8`) added
`src/frontend/screens/Game/GamePage/components/__tests__/DotsMenu.disclosure.test.tsx`, which has 8 `jest.mock`
calls and no baseline entry.

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

## Resolved by quick 261114-2gg

- Task 1 (D-16 remove first): tried dropping the unasserted `backend/logger` mock from `autoUpdateAttempts.test.ts` and `checkGameUpdates.test.ts`. Both failed without it (the real logger is not initialised under jest: `heroicLogWriter` is undefined, so a call to `logWarning` throws), so no removals landed and both were restored byte-for-byte and baselined instead.
- Baseline commit `24ce5285e`: 22 live FAIL lines (captured in the quick task's `di-gate-before.txt`), so 21 new `jestMock` entries added and 1 raised; each is named in the commit body with its introducing sha and mocked modules.
- `games.test.ts` 47 -> 48: the +1 is a `../updateLaunchPrompt` mock from `e005430a8` (74-09). `gameLaunch.ts:136` imports `gateBridgeLaunchOnUpdate` statically, so there is no injection seam; removing it needs a production seam in Phase 74 code.
- Root cause of the drift going unseen: the gate was already wired as the last step of `lint.yml` (`dde9d226e`, 66-02), but every Lint run on main from `a58e3e3e8` (2026-11-13) failed first at `Lint code.` ("ESLint found too many warnings (maximum: 661)") and GitHub skipped every later step. Fix in `e485a9bde`: `id: deps` on the install-deps step and `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}` on the `Backend DI ceilings` step, pinned by `meta/__tests__/backendDiCeilingsWiring.test.ts` with a near-miss.
- Deviation from "wire it next to planning-gates": the gate was un-masked in place in `lint.yml` instead. `codecheck.yml` runs planning-gates last behind `pnpm codecheck` and `pnpm check:ipc-contract`, so a copy there would be masked the same way and would run the gate twice. The other masked Lint steps are tracked in `2026-11-14-lint-workflow-red-masks-ratchet-steps.md`.
- Live CI proof is pending the first push: on the next Lint run, `Backend DI ceilings` should show as executed rather than skipped, even if `Lint code.` is red. Locally `node meta/backendDiCeilings.cjs` exits 0.
