---
quick_id: 260825-qdy
slug: clear-the-7-repo-wide-eslint-errors-bloc
date: 2026-08-25
type: chore
description: >
  Clear the last 7 repo-wide eslint errors so `pnpm lint` exits 0 and stops being one of the two
  gates failing `.husky/pre-push`. All 7 are in 4 test files; none is dirty in the working tree,
  so none collides with the concurrent 34.16 / 08.1 session.
tasks: 4
---

# 260825-qdy — the last 7 lint errors

## Measured state

`pnpm lint` → **exit 1, 7 errors / 4125 warnings** (measured by redirect, never a piped exit code
— `tail`'s status is what made this look green before). `pnpm codecheck` → **exit 0**.
`pnpm prettier` → **exit 1, 30 files** (separate problem, out of scope here).

Memory recorded 53 errors on 2026-08-13 and described the count as *growing*. It is now 7 — that
record is stale and most of this cleanup has already been done by someone else. This is the last
mile.

Only `severity === 2` is counted. The 4125 warnings are not errors and do not fail the gate.

## The 7, and why each is what it is

| File | Line | Rule | Nature |
|---|---|---|---|
| `steam/__tests__/depotPrimitives.test.ts` | 371 | `no-require-imports` | **Redundant** — the file already imports `node:zlib` twice (`deflateRawSync` at :6, `zlibNs` at :7) |
| `steam/__tests__/installLocation.test.ts` | 15 | `no-unused-vars` | `resolve` is genuinely unused; its only other appearances are inside a test-title **string** (:303) and a **comment** (:460) |
| `steam/__tests__/platformPrecedence.test.ts` | 272,273,274,277 | `no-unnecessary-type-assertion` | The enclosing `if` already narrows each field via `!== undefined`, so TS knows the type |
| `EmptyLibrary/__tests__/index.test.tsx` | 84 | `no-require-imports` | **The suppression names the wrong rule** — see below |

### The EmptyLibrary one is not a lint violation, it is a dead suppression

Line 83 reads `// eslint-disable-next-line @typescript-eslint/no-var-requires`. The rule that
actually fires is `@typescript-eslint/no-require-imports`; `no-var-requires` was superseded and no
longer exists. **ESLint does not error on an unknown rule name in a disable comment**, so the
suppression sits there looking effective and suppresses nothing.

The `require` itself is **deliberate and must stay**: it is a lazy require placed after the
`jest.mock('react', ...)` factory above it, so that the mock is in force when `../index` is
evaluated. Converting it to a static import would hoist it above the mock and break the test. The
fix is to name the rule that exists, not to restructure the test.

## Tasks

### Task 1 — `depotPrimitives.test.ts:371`

**Action:** `require('node:zlib').inflateRawSync(body)` → `zlibNs.inflateRawSync(body)`. No new
import: `import * as zlibNs from 'node:zlib'` is already at :7 and already used at :288.

**Verify:** suite passes; the assertion still expects a `Z_DATA_ERROR` throw.

### Task 2 — `installLocation.test.ts:15`

**Action:** `import { join, resolve } from 'node:path'` → `import { join } from 'node:path'`.
Confirm first that no *code* reference exists — a `grep` matching a test title or a comment is not
a usage, which is exactly what makes this look risky when it is not.

**Verify:** suite passes; `tsc --noEmit` clean.

### Task 3 — `platformPrecedence.test.ts:272-277`

**Action:** drop `as boolean` ×3 and `as number` ×1. Do **not** widen the enclosing `if` — the
narrowing it performs is what makes the assertions unnecessary, so removing a clause would turn
these into real errors.

**Verify:** `tsc --noEmit` exit 0 is the real gate here; eslint's claim that an assertion is
unnecessary is derived from the type checker, so tsc must agree after the edit.

### Task 4 — `EmptyLibrary/__tests__/index.test.tsx:83`

**Action:** correct the disable comment to `@typescript-eslint/no-require-imports` and say in it
why the `require` is deliberate, so the next reader does not "fix" it into a static import.

**Verify:** suite passes; eslint reports 0 errors for the file.

## Acceptance

- `pnpm lint` exits **0**, measured by redirect and by reading the printed summary, never a piped
  exit code
- `pnpm codecheck` still exits 0
- The four suites pass
- No behavioural change: every edit is an import, a type assertion, or a comment

## Out of scope

- The 4125 warnings. Not errors, not gating.
- `pnpm prettier`'s 30 files — the other failing pre-push gate. Formatting must never ride along
  in a behavioural or chore commit, and one of the 30 (`test-results/.last-run.json`) is untracked
  junk that should be gitignored instead.
- Anything in the concurrent session's dirty set (34.16, the 08.1 review work).
