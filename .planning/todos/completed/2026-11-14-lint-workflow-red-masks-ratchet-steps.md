---
created: 2026-11-14T00:00:00.000Z
title: 'Lint workflow is red on main (ESLint 661-warning ceiling) and masks the later ratchet steps'
area: tests
files:
  - .github/workflows/lint.yml
  - .husky/pre-push
severity: major
platform: any
ready: code
---

## Problem

Measured 2026-11-14 during quick 261114-2gg. `Lint code.` has been red on main since `a58e3e3e8` (2026-11-13) with "ESLint found too many warnings (maximum: 661)". GitHub skips every step after a failed one, so `Prettier code.`, `Find dead code`, `Module boundaries` and `Steam file line ceiling` were skipped on every such run. `.husky/pre-push` chains the same ratchets with `&&` and has the same masking order. Quick 261114-2gg un-masked only `Backend DI ceilings`; the others still hide behind the red ESLint step, so drift in any of them is invisible while Lint stays red.

## Solution

Bring ESLint back under its warning ceiling by that ratchet's own rules (lower warnings, do not raise the ceiling), then decide deliberately whether the other ratchet steps get the same `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}` treatment as `Backend DI ceilings` in `lint.yml`. Note a stale `.eslintcache-src` can make a local count disagree with CI; re-run cold first.

## Resolution (Phase 78, 2026-11-17)

ESLint red was cleared before Phase 78 by 0a09ba886 / 45bf78590 (quick 261114-2tv) and e6172b935 / 0ba954760 (79-38). Proven cold at the Phase 78 proof head a96dab654: `node meta/lintScoped.cjs` with both caches deleted prints `production: PASS | tests: PASS` (production 957 warnings against SRC_CEILING 1130, tests 566 against TESTS_CEILING 661, 0 errors). Ceilings were not touched.

The un-masking (D-16b) landed in Plan 78-04: cf4ee93e9 guards the Prettier, Find dead code, Module boundaries and Steam file line ceiling steps in `lint.yml` with `!cancelled() && steps.deps.outcome == 'success'`, and 68faaaf98 rewrites `.husky/pre-push` so it runs every check and exits nonzero if any failed. A red step no longer hides the others.

Un-masking exposed two reds that had been hiding behind it; Plan 78-05 fixed one and left one open. Fixed: gameLaunch.ts at 1131 lines (steam line ceiling, a96dab654) and an `@typescript-eslint/no-this-alias` error in inviteBridge.test.ts (18f56e464). Still open: the `backend-di-ceilings` jestMock ratchet, filed in `.planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md`.

Evidence: `.planning/phases/78-verification-records-and-test-health-after-v0-9/78-TEST-HEALTH.md`.
