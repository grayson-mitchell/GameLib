---
phase: quick-261103-wci
plan: 01
status: complete
requirements: [D-07]
commits: [a378feecb, d43f83c50, 96fbba595]
---

# Quick 261103-wci: Steam overlay on the Phase 59 fallback engine

Plain-env overlay injection (DYLD_INSERT_LIBRARIES + Steam* ids) on the Wine-Staging + DXVK fallback engine. No clone, re-sign or runner swap. Fail-open.

## Tasks

1. `a378feecb` overlayLaunch.ts: shared `overlayEnvValues` builder; `buildOverlayCxTokens` derives from it (output unchanged); new `buildOverlayEnvVars`, `prepareOverlayEnv`, `mergeOverlayEnvVars`, `OverlayLaunchPayload`, exported `EnvVar`. 38 tests pass.
2. `d43f83c50` games.ts: `prepareTcpOverlay` fallback branch returns `{kind:'env'}` and logs `overlay=env reason=fallback-engine (D-07)`; `fireBridgeWineLaunch` env branch merges vars, sets `overlayInjected`, no runner restore. Tests added in games.test.ts.
3. `96fbba595` 60-UAT.md: item 8 marked skipped (superseded), item 9 live gate `result: pending`.

## Verification

- jest games.test.ts + overlay tests: pass. Whole steam dir: 117 suites passed, 4447 tests passed.
- `pnpm codecheck`: pass. eslint: 0 errors (pre-existing warnings only). prettier --check on the four .ts files: clean. `grep overlay=skipped reason=fallback-engine src/`: empty.
- 60-UAT.md grep checks pass; file is prettier-ignored.
- Live gate (UAT item 9) NOT run; needs the operator. Todo left in pending/.

## Deviations

- [Rule 3] The "launch through SteamGame.launch" test route cannot use a pinned engine, because `selectLaunchEngine` replaces the selection. The known-fix/runner-stands test calls `fireBridgeWineLaunch` directly with an env payload (permitted by the plan).
- The pre-existing "fallback engine after an overlay launch ends the clone wineserver" test needed a default `prepareOverlayEnv` mock (ok, empty vars) in the describe's beforeEach; the test body is unchanged.
- Narrowing in `fireBridgeWineLaunch`: the CrossOver branch is `overlay?.kind === 'cx-env'` (type narrowing); behaviour unchanged.

## Self-Check: PASSED
