---
phase: quick-261111-n9y
plan: 01
subsystem: humble
tags: [di-ceilings, test-injection, humble-disconnect]
requires: []
provides:
  - "HumbleUser.disconnect(deps) with optional isMac override"
affects: [src/backend/humble/user.ts, src/backend/humble/__tests__/user.test.ts]
key-files:
  modified:
    - src/backend/humble/user.ts
    - src/backend/humble/__tests__/user.test.ts
decisions:
  - "Inject platform via a deps parameter on disconnect(), not a LoginWindowSeam field (touches 2 files instead of ~20)"
status: complete
commits: 2
plan_head_before: ef83fa96c0e7372f89d4b972066eff77c7a38afd
plan_head_after: fc935d0a088e51a19eca510fd8ce3bc5227ec1d5
actuals:
  tokens: 4000
  tasks: 2
  commits: 2
completed: 2026-11-11
---

# Phase quick-261111-n9y Plan 01: Inject humble disconnect platform check Summary

`HumbleUser.disconnect()` now takes an optional `{ isMac }` (defaulting to the real host `isMac`), so the tests inject the platform and the `backend/constants/environment` module mock is gone, bringing the jestMock count for `user.test.ts` back to its baseline of 6.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Tracer: inject platform into disconnect(), drive the two origin tests through it | 1c4b57f92 |
| 2 | Move remaining toggles to injection, delete the mock, pin host default | fc935d0a0 |

## Verification

- `pnpm backend-di-ceilings`: PASS (no shard under `meta/backendDiCeilings/` changed).
- `pnpm jest src/backend/humble/__tests__/user.test.ts`: 89 passed (88 + new host-default test).
- `pnpm tsc --noEmit -p .`: clean. ESLint on the two files: 0 errors (5 pre-existing `require-await` warnings in untouched tests).
- Scoped `npx prettier --check` clean; `loginWindowSeam.ts` unchanged; outside comments no `mockIsMac` or environment module path remains in the test file.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Notes

`graphify update .` was started best-effort and exceeded the 120s tool timeout (left running in background); it is not a gate.

## Self-Check: PASSED

Both commits (1c4b57f92, fc935d0a0) exist; both modified files present.
