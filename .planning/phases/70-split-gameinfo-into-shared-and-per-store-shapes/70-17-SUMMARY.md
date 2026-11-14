---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 17
subsystem: ci-gates
tags: [gap-closure, g1, d-15, ratchet, pre-push, lint-yml]
requires: []
provides:
  - "D-15 narrowing ratchet runs in CI and pre-push even when earlier checks are red"
key-files:
  modified:
    - .github/workflows/lint.yml
    - .husky/pre-push
    - meta/__tests__/gameInfoNarrowingWiring.test.ts
requirements-completed: [ARCH-03, ARCH-03.2]
completed: 2026-11-14
---

# Phase 70 Plan 17: G1 narrowing ratchet unmasking Summary

The GameInfo narrowing ceiling now runs after a red `Lint code.` in CI (guarded `!cancelled() && steps.deps.outcome == 'success'`) and after a red chain in pre-push (own line, statuses combined), each pinned by tests with near-misses.

## Commits

- 30f2c2cd5 fix(70-17): lint.yml step guard
- 3def40c70 fix(70-17): pre-push restructure (chain_status / narrowing_status -> checks_status) + wiring tests

## Details

- pre-push line 2 chain now ends at `pnpm backend-di-ceilings`; the ratchet runs on its own line; a red ratchet alone still fails the push; graphify block unchanged.
- gameInfoNarrowingWiring.test.ts adds `gateUnmasked` + G1 near-miss, a static pre-push pin, and a behavioural suite running the real hook with a stub `pnpm` under `createFakeHomeProfile` (all-green order, red backend-di, red lint, red ratchet, pre-fix-chain near-miss).
- Prettier check on the hook omitted (no extension, vacuous); `bash -n` used instead.
- Task 1 commit holds lint.yml only; its wiring test was committed with Task 2 since the file's pre-push test could not pass until the hook changed.

## Deviations from Plan

None.

## Verification

Five Meta wiring suites (39 tests) and fakeHomeIsolation.test.ts pass; prettier clean on the test and lint.yml.

## Self-Check: PASSED
