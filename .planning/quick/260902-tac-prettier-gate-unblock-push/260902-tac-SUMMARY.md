---
phase: quick-260902-tac
plan: 01
status: complete
date: 2026-09-02
commit: 2f2e6fa22
files_modified:
  - meta/__tests__/loginWindowSeamPredicateRemoved.test.ts
  - src/backend/humble/__tests__/adapter.test.ts
  - src/backend/humble/__tests__/user.test.ts
  - src/backend/humble/adapter.ts
  - src/backend/sidecar/__tests__/humbleFlows.test.ts
  - src/backend/sidecar/__tests__/netStub.test.ts
  - src/backend/sidecar/__tests__/seamBranchParity.test.ts
---

# Quick Task 260902-tac — unblock the push by fixing the prettier gate

Unplanned. Surfaced by `git push --dry-run`, which fires the real `.husky/pre-push` hook without
publishing: the **prettier gate was RED on 7 files**, so every push was being rejected. Fixed with
the gate's own formatter rather than `--no-verify`.

The drift is **pre-existing**, from phase-39 commits (`39-03` `8500bf83b`, `39-04` `1c2a24df1`,
`39-07` `147adc061` and siblings) — not from any of today's quick tasks.

## Formatting-only, proven rather than assumed

`git diff -w` is **not** a valid test for a prettier change: prettier rewraps, moving tokens across
line boundaries, so `-w` still shows differences for a purely cosmetic edit. The real check is
stripping **all** whitespace and comparing against a pre-edit copy.

| file | result |
|---|---|
| `adapter.test.ts`, `user.test.ts`, `adapter.ts`, `humbleFlows.test.ts` | identical modulo whitespace |
| `netStub.test.ts` | quote normalisation only — `"describe(…)"` → `'describe(…)'` |
| `loginWindowSeamPredicateRemoved.test.ts` | quote normalisation only |
| `seamBranchParity.test.ts` | `'…function\'s own `=>`'` → `"…function's own `=>`"` (−1 char = the dropped escape) |

String **contents** never changed. That mattered because two of these files are **text-matching
gates** — `seamBranchParity` finds `wipeSteps` inside an extracted function body by regex, and
`loginWindowSeamPredicateRemoved` matches predicate text — so re-wrapping a regex literal or
requoting a fixture could in principle change what they see. Proven by **running** them: 6 suites,
225 tests, all green.

## The reformat then caused a second, real defect

Caught only by the pre-push lint gate, not by review or by the test suite:

prettier split `const { setLoginWindowSeam } = require(…) as {…}` across two lines in
`humbleFlows.test.ts`. That moved the `require()` from line 1079 to **1080**, while its
`// eslint-disable-next-line @typescript-eslint/no-require-imports` stayed on 1078 — still
suppressing 1079, which no longer contained the require. `pnpm lint` went **0 errors → 1 error**.

**A suppression can be silently defeated by pure reformatting**, with no edit to the comment, the
statement, or the rule. Fixed by moving the comment onto the require's own line (inside the
assignment), a position prettier leaves stable.

## Verification

| Gate | Result |
|---|---|
| 6 affected suites | 225 passed |
| full `pnpm test` | **371/371 suites, 7490 passed, 3 skipped** |
| `pnpm lint` | **4145 problems, 0 errors** — back to baseline (ceiling 4157) |
| `prettier --check .` | clean repo-wide |
| `pnpm i18n --fail-on-update` | passed, and left **no** writes under `public/locales/` (checked — it writes even when it passes) |
| push | `87ad15e8c..2f2e6fa22`, all four pre-push gates green, no `--no-verify` |
