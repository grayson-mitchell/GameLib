---
phase: 78-verification-records-and-test-health-after-v0-9
reviewed: 2026-11-17T00:09:41Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .github/workflows/lint.yml
  - .husky/pre-push
  - meta/__tests__/backendDiCeilingsWiring.test.ts
  - meta/__tests__/boundaryWiring.test.ts
  - meta/__tests__/gameInfoNarrowingWiring.test.ts
  - meta/__tests__/steamLineCeilingWiring.test.ts
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/knownFixReport.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/inviteBridge.test.ts
  - src/backend/storeManagers/steam/bridge/inviteBridge.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/storeManagers/steam/gameEngineDialogs.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 78: Code Review Report

**Reviewed:** 2026-11-17T00:09:41Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

The review covered `git diff 27eefe657..HEAD` for the 15 listed files. The reviewer ran six suites: the four wiring tests, inviteBridge and gamesModuleSurface. All 79 tests passed.

- **lint.yml / pre-push:** The un-masking is correct. All six steps after `Lint code.` have the `!cancelled() && steps.deps.outcome == 'success'` guard. The hook records codecheck's status on line 2, and every later check runs `|| checks_status=1`. There is no errexit. Graphify still runs only when every check passed.
- **gameEngineDialogs.ts:** The three functions moved byte-for-byte. Their imports (`i18next`, logger, `notify`/`showDialogBoxModalAuto`, `sendGameStatusUpdate`, the `CrossoverPreflight`/`EngineSelection` types, `type SteamGame`) match what they used in gameLaunch.ts, and gameLaunch.ts still uses each of those imports. No test mocks `../gameLaunch` to stub the moved functions, so no mock was silently lost.
- **IN-01 fix in inviteBridge.ts:** Correct.
- **No blockers.** The defects found are:
  - the new module is not enforced by the module-surface ratchet;
  - the IN-01 defect is still present in a sibling file;
  - the WR-03 "pins" can be satisfied without the behavior they claim to pin.

## Warnings

### WR-01: gameEngineDialogs.ts is not covered by the gamesModuleSurface lifted-module ratchet

**File:** `src/backend/storeManagers/steam/__tests__/gamesModuleSurface.test.ts:41-55, 117-131` (new module `src/backend/storeManagers/steam/gameEngineDialogs.ts:12`)
**Issue:** gameEngineDialogs.ts is a lifted cluster: it takes `steamGame` as a free-function argument and has `import type SteamGame from './games'`. But it is not in `LIFTED_OWNERS` or `FORWARD`. As a result:
- Nothing checks that its `./games` import stays type-only.
- Nothing checks that it re-exports nothing.
- Its sibling edges are filtered out by `name in FORWARD`, so the forward-only order is not enforced in either direction.

A later edit could add `import { notifyCrossoverRequired } from './gameLaunch'` to gameEngineDialogs.ts and create a gameLaunch <-> gameEngineDialogs CJS cycle, and the test would stay green. The module's own header says "Imports forward only", but no test enforces it.
**Fix:**
```ts
const LIFTED_OWNERS = [
  ...
  'gameEngineDialogs.ts',
  'gameLaunch.ts',
  ...
]
const FORWARD: Record<string, number> = {
  ...
  gameEngineDialogs: 1, // below gameLaunch (2) and gameBridgeLaunch (3); imports no game* sibling
  gameLaunch: 2,
  ...
}
```

### WR-02: The IN-01 defect is still present in helperProcess.ts probeHealthAndWhoami

**File:** `src/backend/storeManagers/steam/bridge/helperProcess.ts:186` (sibling of the fix at `src/backend/storeManagers/steam/bridge/inviteBridge.ts:65`)
**Issue:** The IN-01 fix changed `socket.once('error', ...)` to `socket.on('error', ...)` in `controlRoundTrip`. The same pattern exists in `probeHealthAndWhoami`: `socket.once('error', () => finish(...))` followed by `socket.destroy()` in `finish`. A second `'error'` after the first one is consumed has no listener there, so it becomes an uncaught `ERR_UNHANDLED_ERROR` in the sidecar. Plan 03 only fixed the one call site named in the 58 review.
**Fix:** In helperProcess.ts:186, use `socket.on('error', () => finish({ healthOk, authOk, whoamiOk: false }))`, since `finish` is already idempotent through `settled`. Add a test that emits a second error, modelled on the inviteBridge IN-01 test.

### WR-03: The WR-03 source pins pass even without the behavior they pin

**File:** `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts:2210-2211`
**Issue:**
- `expect(src).toContain('SO_SNDBUF')` is satisfied by the `getsockopt(c, SOL_SOCKET, SO_SNDBUF, ...)` call at bridge_helper.c:3165 alone. If the `setsockopt(... SO_SNDBUF ...)` on line 3166 were deleted, the test would still pass.
- `expect(raw).toContain('#define GL_SEND_TIMEOUT_USEC 250000')` checks the raw source, not the comment-stripped one. So `// #define GL_SEND_TIMEOUT_USEC 250000` would pass.
- Nothing checks that the constant is actually applied (`sndTimeout.tv_usec = GL_SEND_TIMEOUT_USEC`, line 3156).

These are the "pin-only" assertions Plan 03 used to close WR-03, so the record overstates what is protected.
**Fix:**
```ts
expect(src).toMatch(/#define GL_SEND_TIMEOUT_USEC 250000\b/)
expect(src).toMatch(/\.tv_usec\s*=\s*GL_SEND_TIMEOUT_USEC/)
expect(src).toMatch(/setsockopt\([^;]*SO_SNDTIMEO/)
expect(src).toMatch(/setsockopt\([^;]*SO_SNDBUF/)
```

## Info

### IN-01: Wiring test headers still say "pre-push hook line 2"

**File:** `meta/__tests__/backendDiCeilingsWiring.test.ts:5`, `meta/__tests__/boundaryWiring.test.ts:3`, `meta/__tests__/steamLineCeilingWiring.test.ts:4`
**Issue:** The file docblocks still describe the gate as wired on "the pre-push hook line 2". After Phase 78, line 2 holds only `pnpm codecheck`, and each gate has its own `|| checks_status=1` line.
**Fix:** Change these to "its own `|| checks_status=1` line in the pre-push hook".

### IN-02: engineDialogs.ts points to the old location of showEngineDialog

**File:** `src/backend/engine/engineDialogs.ts:3`
**Issue:** The comment says "A port of Steam's `showEngineDialog` (steam/gameLaunch.ts)". The function now lives in `steam/gameEngineDialogs.ts`.
**Fix:** Update the path in the comment.

### IN-03: The new IN-01 test shadows the module-level `sockets`

**File:** `src/backend/storeManagers/steam/bridge/__tests__/inviteBridge.test.ts:107` (shadows `let sockets` at line 41)
**Issue:** `const sockets: Socket[] = []` inside the test has the same name as the module-level server-socket array that `afterEach` destroys. The behavior is correct today, but the shared name makes it easy to push to or assert on the wrong array.
**Fix:** Rename it to `clientSockets`.

### IN-04: Duplicated, loosely matched pre-push and lint.yml assertions across four wiring tests

**File:** `meta/__tests__/backendDiCeilingsWiring.test.ts:55-66, 138-149`; `meta/__tests__/boundaryWiring.test.ts:59-70`; `meta/__tests__/gameInfoNarrowingWiring.test.ts:102-115`; `meta/__tests__/steamLineCeilingWiring.test.ts:65-74`
**Issue:**
- Four files repeat the same structural checks: line 2 contains codecheck, no `&& pnpm`, and the line-order comparisons.
- `gateUnmasked` uses substring `includes`. A guard such as `!cancelled() && steps.deps.outcome == 'success' && success()` would pass it but re-mask the step.

The behavioural stub-pnpm suite in gameInfoNarrowingWiring.test.ts is the real proof.
**Fix:** Put the pre-push structure checks in one shared helper. In `gateUnmasked`, compare the guard with exact equality: `cond.replace(/\s+/g,' ').trim() === "${{ !cancelled() && steps.deps.outcome == 'success' }}"`.

---

_Reviewed: 2026-11-17T00:09:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
