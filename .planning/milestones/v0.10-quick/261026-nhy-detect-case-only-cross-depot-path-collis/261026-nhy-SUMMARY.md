---
phase: quick-261026-nhy
plan: 01
status: complete
subsystem: steam-depot
tags: [steam, depot, path-collisions, case-insensitive]
key-files:
  modified:
    - src/backend/storeManagers/steam/depot/pathCollisions.ts
    - src/backend/storeManagers/steam/__tests__/pathCollisions.test.ts
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/depot/reconcile.ts
    - src/backend/storeManagers/steam/__tests__/reconcile.test.ts
metrics:
  tasks: 2
  commits: [924a8c264, b67e26e3b]
---

# Quick 261026-nhy: Case-only cross-depot path collisions

Cross-depot collisions are now bucketed on the case-folded path when the destination volume is case-insensitive, and the structural verifier keys its claims the same way, so Wasteland 3-shaped UNRESOLVED pairs take the sha1 fallback instead of StateFlags=1026.

## What changed

- `pathCollisions.ts`: new exports `pathCollisionKey(filename, caseInsensitive)` and `probeCaseInsensitiveVolume(dir, deps)`. The probe is read-only (two stats on the dir and its case-swapped name, comparing dev+ino). Inconclusive results fall back to the platform default (linux false, otherwise true). `resolveDepotPathCollisions(plan, { caseInsensitive })` defaults to false, so existing behaviour is unchanged.
- Buckets that hold only bare directory markers are now silent in both modes: not resolved, not unresolved, no warning. This is a deliberate change to exact-case behaviour (the old test expected `unresolved: ['data']`). It was log-only before.
- Collisions found only under folding log every distinct spelling with its depot ids.
- `depot.ts`: `DepotPlan.caseInsensitivePaths?` is set once per `buildDepotPlan` by a single probe of `opts.targetSteamappsDir` and logged. The plan crosses no serialization boundary.
- `reconcile.ts`: `verifyStructuralIntegrity` builds and looks up `contentClaims` with the same `pathCollisionKey(..., !!plan.caseInsensitivePaths)`.

## Verification

- `npx jest` over pathCollisions and reconcile suites: 2 suites, 49 tests, all pass (the folded reconcile cases actually ran on this macOS tmp dir).
- `npx tsc --noEmit`: clean.
- Scoped eslint and `npx prettier --check` over all five files: clean.

## Deviations from Plan

None. (Minor: the probe test helper returns promises directly rather than using an async arrow, to satisfy `require-await`.)

## Pending operator checks

1. Live gate: reinstall Californium (402060) or Civ V (8930) on this Mac. Expect `case-only collision` log lines and StateFlags=4, no 1026. Not run here.
2. The todo `.planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md` stays in `pending/` until that gate passes.

## Known limitation (unchanged, pre-existing)

`reconcilePartialState` has no per-path map and no case assumption. A collided path (exact-case or case-only UNRESOLVED) has one claim that can never sha1-verify, so it is re-queued for download on each resume. This is shared with exact-case UNRESOLVED collisions and was deliberately not changed.

## Self-Check: PASSED

Commits 924a8c264 and b67e26e3b exist; all five modified files present.
