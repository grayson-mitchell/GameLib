---
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
plan: 02
subsystem: humble
tags: [typescript, humble, electron-store, provenance, additive-schema-widening]

# Dependency graph
requires: []
provides:
  - "HumbleLocalRedeemedRecord — exported provenance-carrying record type for humble_local_redeemed.json"
  - "markRedeemed stamps source: 'user' on every explicit-action mark"
  - "ClaimAnnotation.redeemedSource — IPC-exposed provenance, defaulting missing legacy source to 'user'"
  - "D-77 Undo gate re-check: redeemedAt is provenance-independent, confirmed against HumbleKeyRow/index.tsx:116"
affects: [42-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive optional-field schema widening on a persisted electron-store record (source?: 'user' | 'ownership-exact'), read with a hardcoded-safe default rather than a file migration"
    - "Read-once-then-derive in getClaimAnnotations (single store.get(), two derived fields) instead of two independent store reads"

key-files:
  created: []
  modified:
    - src/backend/humble/electronStores.ts
    - src/common/types/humble.ts
    - src/backend/humble/library.ts
    - src/backend/humble/__tests__/library.test.ts

key-decisions:
  - "Missing `source` on an existing local-redeemed record reads as 'user', never 'ownership-exact' — the safer default per the T-42-06 threat disposition (every pre-Phase-42 record was written by the explicit action)."
  - "No record at all -> redeemedSource: undefined (distinct from the 'user' default for an existing-but-source-less record) — mirrors how redeemedAt is already undefined in that case."
  - "getClaimAnnotations reads humbleLocalRedeemedStore.get(composite) into a single local, then derives both redeemedAt and redeemedSource from it, per the plan's explicit instruction not to call .get() twice."

patterns-established:
  - "Provenance discriminator on a local-only overlay store, read with a documented can-never-default-to-the-riskier-value rule — the shape plan 42-03's ownership-exact writer will reuse."

requirements-completed: [REQ-42-04]

# Metrics
duration: ~25min
completed: 2026-09-08
---

# Phase 42 Plan 02: Provenance-widened local-redeemed record + ClaimAnnotation Summary

**Additively widened the `humble_local_redeemed` persisted record with an optional `source: 'user' | 'ownership-exact'` provenance field, wired `markRedeemed` to stamp `'user'`, and exposed it through `getClaimAnnotations` with a missing-field default to `'user'` — read-side only, no `'ownership-exact'` writer yet (that's plan 42-03).**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 4 (all pre-existing; no new files)

## Accomplishments

- `HumbleLocalRedeemedRecord` is now an exported, documented interface (promoted from an inline `CacheStore` type parameter) carrying `redeemedAt: number` and an additive `source?: 'user' | 'ownership-exact'`. The pre-existing D-04/WR-01 comment block above the store is untouched — the new interface and its own D-42-01 doc comment sit above it.
- `markRedeemed` (the sole writer) now stamps `source: 'user'` on every explicit-action mark. `undoRedeemed` is unchanged — it deletes the record regardless of provenance, exactly as before.
- `ClaimAnnotation.redeemedSource?: 'user' | 'ownership-exact'` is a new optional field, additive alongside the two existing optional fields (`revealedAt`, `redeemedAt`).
- `getClaimAnnotations` reads the local-redeemed record once per key and derives: `redeemedAt: record?.redeemedAt` and `redeemedSource: record ? (record.source ?? 'user') : undefined`. A legacy record with no stored `source` reads as `'user'`; no record at all reads as `undefined` on both fields.
- RED was captured before each implementation step, for both tasks — see below.

## Task Commits

Each task was committed as a RED test commit followed by a GREEN implementation commit (tdd="true"):

1. **Task 1 RED — pin markRedeemed/undoRedeemed provenance** - `71ca3bdd7` (test)
2. **Task 1 GREEN — widen the record, stamp source: 'user'** - `eead66848` (feat)
3. **Task 2 RED — pin getClaimAnnotations provenance + D-77 re-check** - `53fd473f5` (test)
4. **Task 2 GREEN — expose redeemedSource on ClaimAnnotation** - `f86756878` (feat)

_No plan-metadata commit was made per this executor's explicit instructions — .planning/STATE.md and .planning/ROADMAP.md are owned by the orchestrator and were left untouched._

## Captured RED Output (Task 1)

The `source: 'user'` assertion failed against the current code (the two other new assertions — legacy-record round-trip and undo-deletes-a-source-'user'-record — already passed unchanged, since neither depends on the new field):

```
FAIL src/backend/humble/__tests__/library.test.ts
  ● HumbleLibrary › HumbleLibrary.markRedeemed() / undoRedeemed() (D-77, realigned by 14-07) › D-42-01: markRedeemed stamps source: 'user' on the persisted record

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 0

      Object {
        "redeemedAt": Any<Number>,
    -   "source": "user",
      }

Tests:       1 failed, 4715 skipped, 2 passed, 4718 total
```

## Captured RED Output (Task 2)

Four of the six new `getClaimAnnotations` assertions failed against the current code (the undefined-case and the redeemedAt-regression-pin already passed, since neither reads the not-yet-existing `redeemedSource` field):

```
HumbleLibrary.getClaimAnnotations() — D-42-01 provenance
  ✕ emits redeemedSource: 'user' for a record written by markRedeemed
  ✕ emits redeemedSource: 'user' for a legacy record with no source field (missing-field default)
  ✕ emits redeemedSource: 'ownership-exact' for a record seeded with that source
  ✓ emits redeemedSource: undefined and redeemedAt: undefined when there is no local-redeemed record
  ✓ redeemedAt is emitted with the same value regardless of source (D-77 Undo gate re-check)
  ✕ every emitted annotation carries exactly revealedAt/redeemedAt/keyindexResolved/redeemedSource

Tests:       4 failed, 111 skipped, 5 passed, 120 total
```

## D-77 Undo Gate Re-check (CONTEXT.md-mandated finding)

**No existing consumer of `redeemedAt` would behave differently for an `'ownership-exact'` record.** Checked `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:116` directly: the Undo affordance gates on `claimAction.redeemedAt !== null` alone — it never reads `redeemedSource` (the prop type at `:13` is still `redeemedAt: number | null`, untouched by this plan). Since `getClaimAnnotations` emits `redeemedAt` with the identical value regardless of `source` (pinned by the new regression test), the gate fires identically for a user-marked and an ownership-inferred REDEEMED key. `src/frontend/screens/Humble/Keys/Waiting/index.tsx:224` was also checked — it reads only `annotation?.redeemedAt`, likewise unaffected.

## Files Created/Modified

- `src/backend/humble/electronStores.ts` — promoted the inline `{ redeemedAt: number }` type parameter on `humbleLocalRedeemedStore` to the exported `HumbleLocalRedeemedRecord` interface with an additive `source?: 'user' | 'ownership-exact'`. Store name (`'humble_local_redeemed'`) and the existing D-04/WR-01 comment block are unchanged.
- `src/backend/humble/library.ts` — `markRedeemed` now writes `{ redeemedAt: Date.now(), source: 'user' }`. `getClaimAnnotations` reads the local-redeemed record once and derives both `redeemedAt` and `redeemedSource` from it, with a docblock addition recording the D-77 re-check finding above.
- `src/common/types/humble.ts` — `ClaimAnnotation` gains the optional `redeemedSource` field with a doc comment.
- `src/backend/humble/__tests__/library.test.ts` — widened the `localRedeemedData` test-double type to admit the optional `source` field; added 3 tests to the existing `markRedeemed()/undoRedeemed()` describe block and a new `getClaimAnnotations() — D-42-01 provenance` describe block with 6 tests (4 provenance cases, 1 regression pin, 1 security pin).

## Decisions Made

- Followed the plan's literal spec throughout: interface shape, doc-then-interface placement above (not inside) the preserved D-04/WR-01 block, single-read-then-derive in `getClaimAnnotations`, and the missing-field-defaults-to-`'user'`-never-`'ownership-exact'` rule.
- No new frontend file was touched, matching the plan's explicit instruction — `Waiting/index.tsx` and `HumbleKeyRow/index.tsx` keep reading only the three pre-existing fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/verification-noise] One new eslint warning from a plain-object `toEqual` assertion mixing `expect.any(Number)` with a literal string**
- **Found during:** Task 1, after writing the RED test `D-42-01: markRedeemed stamps source: 'user' on the persisted record`
- **Issue:** `expect(localRedeemedData.get(...)).toEqual({ redeemedAt: expect.any(Number), source: 'user' })` triggered a new `@typescript-eslint/no-unsafe-assignment` warning not present in the pre-plan baseline (verified via a throwaway `git worktree` checked out at the commit immediately preceding this plan's work: baseline was 94 warnings in this file, my version was 95). Existing uses of `expect.any(Number)` elsewhere in the same file are all wrapped in `expect.objectContaining(...)`, which does not trigger the rule; a bare object literal does.
- **Fix:** Split the assertion into two: `expect(record?.redeemedAt).toEqual(expect.any(Number))` + `expect(record?.source).toBe('user')`, matching the pattern already used for the `getClaimAnnotations` provenance tests (`annotations[...].redeemedAt`).
- **Files modified:** `src/backend/humble/__tests__/library.test.ts`
- **Verification:** Re-ran eslint scoped to the four changed files and diffed rule-counts against the same pre-plan baseline worktree — 0 new warnings after the fix (was 1 before). Test suite re-run: 120/120 still passing.
- **Committed in:** `71ca3bdd7` (the fix was made before the RED commit, so RED and this fix are in the same commit — no separate follow-up commit was needed)

**2. [Observation, not fixed — pre-existing plan-verify-script bug] The plan's `<verify>` grep for the D-04 comment fails on the ORIGINAL, unmodified file**
- **Found during:** Task 1 verification
- **Issue:** The plan's automated verify command includes `grep -v '^\s*[/*]' src/backend/humble/electronStores.ts | grep -q "D-04"`. This strips every line starting with `//` (all comments in this file use `//`, not `/* */`), so it can never match "D-04" since every D-04 mention in the file lives inside a `//` comment. Reproduced against a `git stash`-restored copy of the pre-plan file: the same command exits 1 there too, proving this is not something Task 1 broke.
- **Not fixed:** out of scope — this is the plan's own verify script, not source code; the substantive requirement it was checking for ("the D-04 exemption comment survives") was confirmed by inspecting `git diff src/backend/humble/electronStores.ts`, which shows the pre-existing comment block is untouched (only the new interface was inserted above it).
- **Files affected:** none (verification-script observation only)

## Known Stubs

None. This plan is read-side and writer-of-`'user'`-only, as scoped — it deliberately does not write any `'ownership-exact'` record yet (that is plan 42-03's job, called out explicitly in the plan objective).

## Threat Flags

None. This plan's threat register (T-42-05 information disclosure, T-42-06 tampering, T-42-07 repudiation, T-42-SC package-manager) covers the full surface touched — no new endpoints, auth paths, or trust-boundary-crossing schema changes were introduced beyond what the register already accounts for. The T-42-05 security pin (`Object.keys(...).sort()` on every emitted annotation) is a passing test, confirmed in the GREEN run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 42-03 (D-42-02 auto-settle) can now write `{ redeemedAt: Date.now(), source: 'ownership-exact' }` directly against the `HumbleLocalRedeemedRecord` type this plan exported, and the read side (`getClaimAnnotations`, `ClaimAnnotation.redeemedSource`) already understands and correctly surfaces that value — verified by the `'ownership-exact'`-seeded test case in Task 2.
- No blockers.

---
*Phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin*
*Completed: 2026-09-08*

## Self-Check: PASSED

- FOUND: `src/backend/humble/electronStores.ts`
- FOUND: `src/common/types/humble.ts`
- FOUND: `src/backend/humble/library.ts`
- FOUND: `src/backend/humble/__tests__/library.test.ts`
- FOUND: `.planning/phases/42-humble-key-platform-identity-evidenced-key-type-table-drivin/42-02-SUMMARY.md`
- FOUND commit `71ca3bdd7` (Task 1 RED)
- FOUND commit `eead66848` (Task 1 GREEN)
- FOUND commit `53fd473f5` (Task 2 RED)
- FOUND commit `f86756878` (Task 2 GREEN)
- FOUND commit `64fd260ba` (SUMMARY.md)
