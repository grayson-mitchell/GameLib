---
phase: 78-verification-records-and-test-health-after-v0-9
fixed_at: 2026-11-17T00:37:11Z
review_path: .planning/phases/78-verification-records-and-test-health-after-v0-9/78-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 78: Code Review Fix Report

**Fixed at:** 2026-11-17T00:37:11Z
**Source review:** .planning/phases/78-verification-records-and-test-health-after-v0-9/78-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (critical_warning)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: gameEngineDialogs.ts is not covered by the gamesModuleSurface lifted-module ratchet

**Files modified:** `src/backend/storeManagers/steam/__tests__/gamesModuleSurface.test.ts`
**Commit:** b64a65d38
**Applied fix:** Added `gameEngineDialogs.ts` to `LIFTED_OWNERS` and `gameEngineDialogs: 1` to `FORWARD`. That rank is below gameLaunch (2) and gameBridgeLaunch (3), its only importers. A comment records the placement. The suite passes (7/7). A temporary `import ... from './gameLaunch'` in gameEngineDialogs.ts made the forward-only test fail, so the ratchet now catches the cycle the review described. The probe was reverted.

### WR-02: The IN-01 defect is still present in helperProcess.ts probeHealthAndWhoami

**Files modified:** `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts`
**Commit:** 1a52a00bd
**Applied fix:** Changed `socket.once('error', ...)` to `socket.on('error', ...)` and added the same comment the inviteBridge IN-01 fix carries. `finish()` was already idempotent through `settled`. Added the regression test `78 WR-02: a second socket error after the probe settles does not throw`. In it, the first probe socket's `connect` emits an error. Later probes succeed, so `ensureBridgeHelperReady` reaches `ready`. A second `'error'` is then emitted on the destroyed first socket. The test reuses the file's existing `node:net` mock and `FakeSocket`, with no new `jest.mock` and no `this` alias. It failed before the fix with "Unhandled error. (Error: second" and passes after. The full file passes (34/34). backend-di-ceilings shows the same 5 FAIL lines as before the change, all in frontend tests and none touching this file.

### WR-03: The WR-03 source pins pass even without the behavior they pin

**Files modified:** `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts`
**Commit:** 075436e4a
**Applied fix:** Replaced the loose `toContain('SO_SNDTIMEO')`, `toContain('SO_SNDBUF')` and raw `#define` checks with the four regex pins from the review. All four run against the comment-stripped source: the define, the `.tv_usec = GL_SEND_TIMEOUT_USEC` assignment, `setsockopt(...SO_SNDTIMEO` and `setsockopt(...SO_SNDBUF`. The test passes on the current source. It fails if the SO_SNDBUF `setsockopt` line is deleted, and it fails if the define is commented out. bridge_helper.c was restored from a copy after each check.

## Verification

- Ran each touched test file (gamesModuleSurface, helperProcess, and the helperIntegration source-pins test) and all passed.
- `npx prettier --check` passed on all four changed paths.
- `tsc` reported no errors in helperProcess, and eslint reported no errors. One existing no-floating-promises warning remains at helperProcess.ts:272, a line this fix did not touch.
- `graphify update .` was run after the fixes.

---

_Fixed: 2026-11-17T00:37:11Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
