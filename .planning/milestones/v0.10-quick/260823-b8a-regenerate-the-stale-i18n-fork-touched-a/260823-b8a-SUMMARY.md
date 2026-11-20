---
quick_id: 260823-b8a
status: complete
date: 2026-08-23
---

# Quick Task 260823-b8a — Summary

## What changed

Commit `8292d0b89`. The A-17 ANTI-ROT guard in `meta/__tests__/genI18nGateScope.test.ts` is
green again, and the whole `meta/` suite is clean for the first time in days.

`meta/i18nForkTouchedFiles.json` had been regenerated on 2026-08-21 at 185 files. 13 more had
accrued since — from Phase 37, the 34.2 gap cycles, and two of this session's own quick tasks
(`InstallProgress.ts` from `260822-uri`, `steamTileState.ts` from `260822-vov`).

## Why this is not just "run the generator"

Running `pnpm gen-i18n-gate-scope` alone is the documented known-bad move: it took the suite
**1 failure → 5** on two previous attempts. The artifact's file *count* is pinned in four other
assertions, and its *content* is the operand of a second ratchet — and **none of those tests
mention the generator**, so nothing points back from the new failures to the cause.

The blast radius was measured *before* touching anything, then re-verified after:

| Pin | Before | After |
|---|---|---|
| `toBe(185)` ×4 (count) | 185 | **198** |
| `toBe(162)` (curated scope) | 162 | **162 — unchanged, verified** |
| `DECLARED_UNSCANNED_DEBT` (A-03 ratchet) | 23 entries | **36** |

All 13 new files are outside the curated `i18nGateScope.json`, so all 13 land in the debt
register. The merged array was asserted sorted, unique, and free of overlap with the existing
23 before writing.

## Verification — by test delta, not by the target test

```
before   1 failed / 21 passed suites    1 failed / 1 skipped / 520 passed / 522 total
after    0 failed / 22 passed suites        1 skipped / 521 passed / 522 total
```

That comparison is the whole point: a minimal-looking artifact diff is *not* evidence of a safe
regen, because the blast radius lives in the pins rather than the diff. Re-running only the
guard being fixed would have shown "success" while four other tests went red.

Also checked:

- `meta/i18nGateScope.json` **byte-identical** — md5 `3111e151…` before and after, and
  `git diff --stat` empty for it. The plain generator prints that it left the hand-curated file
  alone; that claim was verified rather than trusted.
- The artifact diff is exactly the 13 paths plus a `generatedAt` bump — nothing else moved.
- `pnpm exec jest src/frontend src/common` — 2016 passed, unchanged.
- `prettier --check` clean on both changed files.
- Only `meta/` files in this commit; `git commit --only` used, so the concurrent session's 14
  uncommitted entries were not absorbed.

## Not done / notes

- **`meta/i18nGateScope.json` and `meta/i18nGateAllowlist.json` deliberately untouched.** The
  curated scope is the BLOCKING hardcoded-string gate's input, and the allowlist is a deferral
  register carrying blocking reasons — not a false-positive suppressor.
- **The 13 files are now declared debt, not scanned.** Adding them to `DECLARED_UNSCANNED_DEBT`
  records that they are fork-touched and outside the string gate's scope; it does not put them
  under the gate. Widening the curated scope is a separate, blocking decision.
- **This will rot again.** The artifact is a snapshot of a `git diff` against the upstream
  merge-base, so every new fork-touched frontend file re-reds the guard. The cost is now known
  and small provided the pins move with it.
- `gameDetailsImportGate.test.ts`'s sha256 pin on `settingsFlowRegistration.ts` is still red —
  untouched, owned by the concurrent session that has that file modified in the working tree.
