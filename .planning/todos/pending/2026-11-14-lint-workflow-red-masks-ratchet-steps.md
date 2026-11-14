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
