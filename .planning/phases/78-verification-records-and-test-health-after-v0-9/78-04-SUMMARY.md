---
phase: 78-verification-records-and-test-health-after-v0-9
plan: 04
subsystem: ci-gates
tags: [lint-workflow, pre-push, husky, wiring-tests, DEBT-06]
requires: []
provides:
  - un-masked lint.yml ratchet steps
  - non-masking .husky/pre-push
affects: [lint.yml, .husky/pre-push, meta wiring tests]
key-files:
  modified:
    - .github/workflows/lint.yml
    - .husky/pre-push
    - meta/__tests__/backendDiCeilingsWiring.test.ts
    - meta/__tests__/gameInfoNarrowingWiring.test.ts
    - meta/__tests__/steamLineCeilingWiring.test.ts
    - meta/__tests__/boundaryWiring.test.ts
decisions:
  - "Pre-push uses `cmd || checks_status=1` per line (codecheck captures $? on line 2); no errexit."
metrics:
  tasks: 2
  files: 6
completed: 2026-11-17
---

# Phase 78 Plan 04: Un-mask CI and pre-push checks Summary

A red check in lint.yml or `.husky/pre-push` no longer hides the others: all six steps after `Lint code.` carry the `!cancelled() && steps.deps.outcome == 'success'` guard, and the hook runs all nine checks and exits nonzero if any failed.

## Commits

- cf4ee93e9: lint.yml guards on Prettier, Find dead code, Module boundaries, Steam file line ceiling, plus shared comment
- 68faaaf98: rewritten pre-push hook and the four updated wiring tests

## Test-first evidence

Before the YAML edit, the four new `gateUnmasked` cases (prettier, find-deadcode, boundaries, steam-line-ceiling) failed. The pre-push static pin failed against the old hook. The hook was rewritten before the gameInfoNarrowing stub-pnpm `it.each` was run, so those cases were not seen red individually. The old masking is covered by the `PRE_78_CHAIN` near-miss, which still shows a red lint hiding prettier.

## Verification

- 59 tests pass across the five meta files (including tsconfigMeta); `bash -n .husky/pre-push` OK; prettier --check clean on lint.yml and the four tests; `meta/lintScoped.cjs` unchanged; zero `&& pnpm` in the hook; line 2 holds `pnpm codecheck`.
- graphify update run.

## Deviations from Plan

- The pre-push static pin in backendDiCeilingsWiring.test.ts was rewritten in the Task 1 test pass (it is the same file) and committed with Task 2; Task 1's commit holds only lint.yml, since the file's pre-push assertion could not pass until the hook changed.

## Known Stubs

None.

## Self-Check: PASSED
