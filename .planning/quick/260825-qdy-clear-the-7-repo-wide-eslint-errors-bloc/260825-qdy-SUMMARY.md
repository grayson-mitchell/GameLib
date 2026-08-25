---
quick_id: 260825-qdy
slug: clear-the-7-repo-wide-eslint-errors-bloc
date: 2026-08-25
status: complete
type: chore
description: >
  `pnpm lint` now exits 0. The last 7 repo-wide eslint errors are cleared — one of the two gates
  failing `.husky/pre-push`. One of the seven was not a violation at all but a dead suppression
  naming a rule that no longer exists.
files_touched:
  - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
  - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
  - src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts
  - src/frontend/screens/Library/components/EmptyLibrary/__tests__/index.test.tsx
commits:
  - 98a20cb0f
---

# 260825-qdy — the last 7, and one that was never a violation

## The memory was stale in the good direction

Recorded state (2026-08-13): **53 errors / 3460 warnings, and *growing*** — with the note that no
tag could reach GitHub until it cleared. Measured today: **7 errors**. Someone had already done
87% of this. Worth correcting the record rather than re-deriving the old number.

`pnpm lint` → **exit 1, 7 errors** before; **exit 0, 0 errors** after. Measured by redirect and by
reading the printed summary — never a piped exit code, which is the idiom that made this look green
once already.

## Four fixes, and only three were real violations

| File | Rule | What it actually was |
|---|---|---|
| `depotPrimitives.test.ts:371` | `no-require-imports` | **Redundant.** The file already imported `node:zlib` twice — `deflateRawSync` at `:6` and `zlibNs` at `:7`, the latter already used at `:288`. Swapped to `zlibNs.inflateRawSync`; no new import. |
| `installLocation.test.ts:15` | `no-unused-vars` | `resolve` genuinely unused. Its only other appearances are inside a **test-title string** (`:303`) and a **comment** (`:460`) — a grep hit that is not a usage, which is exactly what makes this look risky when it is not. |
| `platformPrecedence.test.ts:272-277` | `no-unnecessary-type-assertion` ×4 | The enclosing `if` narrows each field with `!== undefined`, so TS already knew. Removed; a comment now records that deleting a clause from that condition would make them necessary again. |
| `EmptyLibrary/__tests__/index.test.tsx:83` | `no-require-imports` | **Not a violation — a dead suppression.** See below. |

## The one worth remembering

Line 83 read `// eslint-disable-next-line @typescript-eslint/no-var-requires`. The rule that fires
is `no-require-imports`; `no-var-requires` no longer exists. **ESLint does not error on an unknown
rule name in a disable comment**, so it sat there looking effective and suppressing nothing.

The `require` is deliberate and had to stay: it is lazy, placed *after* the `jest.mock('react', …)`
factory, so the mock is in force when `../index` evaluates. A static import would hoist above the
mock and break the test. So the fix was to name the rule that exists — and to say why the `require`
is there, so the next reader does not "tidy" it into an import.

**Proven load-bearing, not assumed.** Reverting that one comment to the dead rule name brings the
error back: `0 → 1 → 0`, with a byte-exact restore. Without that check, "the error went away" and
"my change is why it went away" are indistinguishable.

## Verification

- `pnpm lint` → **exit 0**, `0 errors, 4121 warnings` (warnings are `severity === 1` and do not
  gate; only `severity === 2` was ever counted)
- `pnpm codecheck` (`tsc --noEmit`) → **exit 0** — the real gate for task 3, since eslint's
  "unnecessary assertion" verdict is derived from the type checker
- Backend: **3 suites / 127 tests** pass · Frontend: EmptyLibrary suite passes
- No behavioural change: every edit is an import, a type assertion, or a comment

## Still blocking `.husky/pre-push`

`pnpm prettier` → **exit 1, 30 files** (25 `src`, 4 `meta`, 1 `test-results`). Deliberately
untouched — formatting must never ride along in a behavioural or chore commit. Note that
`test-results/.last-run.json` is **untracked Playwright output that is not gitignored**, so it is
polluting the gate; gitignoring it is a one-liner and removes one of the 30.

`pnpm codecheck` passes, so after prettier the hook's remaining unknown is
`pnpm i18n --fail-on-update`.
