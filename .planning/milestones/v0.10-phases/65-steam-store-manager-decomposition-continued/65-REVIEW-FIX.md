---
phase: 65-steam-store-manager-decomposition-continued
fixed_at: 2026-11-08T00:00:00Z
review_path: .planning/phases/65-steam-store-manager-decomposition-continued/65-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 65: Code Review Fix Report

**Fixed at:** 2026-11-08
**Source review:** .planning/phases/65-steam-store-manager-decomposition-continued/65-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (CR-01, WR-01, WR-02; scope `critical_warning`, so IN-01 to IN-04 are not included)
- Fixed: 3
- Skipped: 0

Verification for each fix: `node -c`, `npx prettier --check` scoped to the two changed paths (neither is prettier-ignored), and `npx jest meta/__tests__/steamLineCeiling.test.ts`. The suite went from 13 to 28 tests, all passing. `node meta/steamLineCeiling.cjs` still prints `PASS (169 files scanned, 0 allowlisted over 1000)` on the real tree.

## Fixed Issues

### CR-01: A baseline entry at or under the ceiling lets an over-ceiling file grow without limit

**Files modified:** `meta/steamLineCeiling.cjs`, `meta/__tests__/steamLineCeiling.test.ts`
**Commit:** 2099d4065
**Applied fix:** In the first loop of `evaluate`, a file whose entry is at or under the ceiling is now held to the plain ceiling, the same as a file with no entry. The baseline loop now reports an at-or-under-ceiling entry whatever the file's current size, and its message says an entry cannot cap a file. The stale line-88 comment is replaced, which also covers the line-88 half of IN-03. New tests: `evaluate({a:1000},{a:1001})` and `evaluate({a:500},{a:5000})` each return both an `over ceiling` and a `remove a from the baseline` failure, and `evaluate({a:1000},{a:1000})` returns the removal failure.
**Status:** fixed: requires human verification (this is a logic change to the gate's conditions)

### WR-01: Naming any file `*.generated.*` takes it out of the gate

**Files modified:** `meta/steamLineCeiling.cjs`, `meta/__tests__/steamLineCeiling.test.ts`
**Commit:** 770a9d2b0
**Applied fix:** Removed the `name.includes('.generated.')` skip. A new `GENERATED_EXEMPT` set (`bridge/shimExports.generated.ts`, relative to the steam root) is passed to `collectFiles` as an `exempt` set of root-relative paths. A new `staleExemptions(root, exempt)` fails for a listed path that is no longer a file, and `main` runs it. The exemption applies only to the default scan; a `--root` scan exempts nothing, so the CLI fixtures are unaffected. New tests: a file renamed to `*.generated.*` is scanned, an exempted path is skipped, a stale exemption is flagged, and the shipped list matches the real tree.
**Status:** fixed

### WR-02: A non-numeric `--min-files` silently disables the anti-vacuity floor

**Files modified:** `meta/steamLineCeiling.cjs`, `meta/__tests__/steamLineCeiling.test.ts`
**Commit:** 919e0c1b1
**Applied fix:** Replaced `argValue` with a pure, exported `parseArgs(argv)`. It returns `{ error }` in two cases: `--root`, `--baseline` or `--min-files` is given with no value (it is the last argument, empty, or followed by another `--flag`), or `--min-files` is not a positive integer. On an error, `main` prints `FAIL: <error>` and exits 1. New tests: `parseArgs` rejects `x`, `0`, `-1`, `1.5` and `NaN`, and rejects each flag given with no value. A CLI test checks that `--min-files x` exits 1.
**Status:** fixed

---

_Fixed: 2026-11-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
