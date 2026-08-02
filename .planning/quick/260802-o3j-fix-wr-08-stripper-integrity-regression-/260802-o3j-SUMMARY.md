---
phase: quick-260802-o3j
plan: 01
subsystem: testing
tags: [jest, typescript, regex, rust, test-infrastructure]

# Dependency graph
requires:
  - phase: 34.2 gap cycle 3
    provides: WR-08 quote-balance guards and their falsifiability-lever discipline
provides:
  - stripRustRawStrings() normalizer in longRunningChannels.test.ts
  - both WR-08 guards made raw-string aware (no longer false-positive on commit 88c2043cc's multi-line r#"..."# literal)
  - 5 new self-tests, including the falsifiability lever proving guard (b) can still fail
affects: [future WR-08 regressions, any test file that copies this stripper pattern (tauriConf.test.ts, tauriShellSource.test.ts)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test-file-local source normalizer functions (stripRustCharLiterals, stripRustRawStrings) composed before per-line splitting, with an explicit inline comment guarding the ordering invariant"

key-files:
  created: []
  modified:
    - src/backend/__tests__/longRunningChannels.test.ts

key-decisions:
  - "Fixed the normalizer, not the assertion — per the WR-08 block's own recorded discipline and the Phase 34.4.1 precedent it cites"
  - "Raw-string stripping runs on FULL source before .split('\\n'), not per-line, because a per-line pass cannot see a multi-line raw string literal"
  - "Replacement blanks non-newline characters rather than deleting the match outright, preserving line count so per-line guard indices stay diagnosable"
  - "Non-identifier boundary required before the raw-string 'r' — main.rs has 14 lines where an ordinary string literal ends in the letter r ('repair', 'com.gamelib.launcher') that would otherwise be eaten up to the next quote"

patterns-established:
  - "A guard-fix must ship with an explicit falsifiability self-test proving the guard can still fail on the original defect class, not merely that the new case passes"

requirements-completed: [WR-08]

# Metrics
duration: ~15min
completed: 2026-08-02
---

# Quick Task 260802-o3j: Fix WR-08 stripper integrity regression Summary

**Added a raw-string-aware normalizer (`stripRustRawStrings`) to `longRunningChannels.test.ts` so the WR-08 quote-balance guards stop false-positiving on `main.rs`'s legitimate multi-line `r#"..."#` diagnostic script, wiring it into both guards ahead of any line-splitting and backing it with 5 new self-tests including an explicit falsifiability lever.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-02T06:19:55Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- `stripRustRawStrings()` removes Rust raw string literals (`r"..."`, `r#"..."#`, `r##"..."##`, ...) with matched-hash-count closing, multi-line support, a mandatory non-identifier boundary guard, and newline-preserving replacement — added as a direct sibling of `stripRustCharLiterals`
- Both WR-08 guards (whole-file and per-line) now call `stripRustRawStrings(loadMainRsCode())` on full source before any `.split('\n')`, with an inline comment protecting the ordering invariant from future refactors
- 5 new self-tests added, including the falsifiability lever the WR-08 history comment demands: a genuinely truncated ordinary `"steam://` literal still reads as ODD after the new normalizer runs
- Verified by hand (not just asserted) that inverting either the boundary guard or the hash backreference trips at least one self-test — see Issues Encountered

## Task Commits

1. **Task 1: Add stripRustRawStrings and wire it into both WR-08 guards** — combined with Task 2 into a single commit (both tasks touch the same file with no meaningful intermediate state to preserve separately)
2. **Task 2: Add five self-tests, including the falsifiability lever** — combined with Task 1
3. **Task 3: Verify scope isolation and commit exactly one file** — `d22fe0df` (fix)

**Plan metadata:** committed separately by the orchestrator (docs commit, not part of this agent's scope per constraints)

_Note: Tasks 1 and 2 were implemented and verified together before a single atomic commit, since they modify the same function/describe-block region and splitting them into two commits would have left an intermediate commit with an unused helper function — no independent value to preserving that midpoint._

## Files Created/Modified
- `src/backend/__tests__/longRunningChannels.test.ts` — added `stripRustRawStrings()` (normalizer + doc comment), wired it into both WR-08 guards, added 5 self-tests

## Decisions Made
- Fixed the normalizer rather than weakening/skipping the failing assertion, following the WR-08 block's own recorded discipline and the Phase 34.4.1 precedent it names
- Task 1 and Task 2 were committed together as one atomic commit rather than two, since Task 2's self-tests are the only thing that proves Task 1's normalizer is both correct and non-vacuous — splitting them would leave an intermediate commit whose "done" state (Task 1 alone) is unverifiable against the falsifiability requirement

## Deviations from Plan

None — plan executed exactly as written. One planning-time synthetic-test detail required hand-correction during execution (see Issues Encountered), which is normal test-authoring iteration, not a deviation from the specified behavior.

## Issues Encountered

**Synthetic multi-line self-test (Task 2, test 1) initially failed on line-count preservation.** The plan's reference synthetic source used a raw-string body line that itself started with `//` after trimming. `loadMainRsCode()` runs BEFORE `stripRustRawStrings()` (by design — see F3 in the plan), and its `stripRustLineComments()` pass deletes any WHOLE line starting with `//`, unaware it is inside a raw-string body — so that body line vanished before the raw-string normalizer ever ran, shifting the line count by one (6 lines received vs 7 expected). Fixed by moving the required `//` sequence to mid-line (`const note = 1; // ...`) instead of line-start, which still exercises "body content genuinely cannot leak" (the trailing-comment-stripping pass truncates it, but the raw-string normalizer's own newline-preserving blank-out is what ultimately proves the body never leaks into the final output) without triggering the unrelated whole-line-comment deletion. This is a test-data correction, not a change to `stripRustRawStrings` itself or to the plan's required semantics — resolved inline during Task 2, no separate commit.

**Falsifiability hand-verification (Task 2's own "done" criterion).** Before finalizing, both required inversions were performed and reverted:
1. Removing the non-identifier boundary guard entirely → self-test 5 ("leaves an ordinary string literal ending in r untouched") failed, correctly reporting real code (`"repair"`, `"com.gamelib.launcher"`) getting eaten.
2. Replacing the `\3` hash backreference with a fixed single-hash closer → self-test 3 (the `r##"..."##` body-containing-`"#`` case) failed, correctly reporting the closer terminating early.
File was restored to the verified-working version after each check and confirmed byte-identical via `diff` before proceeding.

## User Setup Required

None - no external service configuration required.

## Verification Results

- `npx jest src/backend/__tests__/longRunningChannels.test.ts`: **28 tests (1 failing) → 33 tests (all passing)**. Indices 262 and 549 no longer appear in the unbalanced-line report (empty `[]`).
- `npx tsc --noEmit`: clean, exit 0.
- `git diff --cached --name-only` at commit time: exactly `src/backend/__tests__/longRunningChannels.test.ts`.
- `git status --porcelain` post-commit: the five protected paths (`src-tauri/src/main.rs`, `src/backend/__tests__/tauriShellSource.test.ts`, `.planning/debug/epic-login-non-interactive.md`, `.planning/phases/34.5-.../34.5-UNTESTED-ITEMS.md`, `.vscode/settings.json`) remain modified-but-unstaged, untouched by this task.
- Falsifiability: hand-verified both the boundary guard and the hash backreference can trip a self-test when inverted (see Issues Encountered).

## Follow-up Note (F4, out of scope — recorded only)

`src-tauri/src/main.rs` ~line 1171 carries a doc comment on `reveal_post_script` explaining its JS template is assembled from `concat!` single-line pieces specifically because this WR-08 guard previously rejected multi-line raw strings. This fix lifts that constraint — a future cleanup could consolidate `reveal_post_script` into a single `r#"..."#` literal now that the guard is raw-string aware. `main.rs` was not touched by this task (it carries a separate, uncommitted Epic fix) and no action was taken here.

## Next Phase Readiness
- WR-08 regression closed; guard remains falsifiable per the plan's own bar
- No blockers for the separate Epic post-auth fix commit that follows this one

---
*Phase: quick-260802-o3j*
*Completed: 2026-08-02*

## Self-Check: PASSED

- FOUND: `src/backend/__tests__/longRunningChannels.test.ts`
- FOUND: `.planning/quick/260802-o3j-fix-wr-08-stripper-integrity-regression-/260802-o3j-SUMMARY.md`
- FOUND: commit `d22fe0df` in `git log --oneline --all`
- FOUND: `stripRustRawStrings` referenced 10 times in the modified file (definition + 2 wirings + 5 self-tests + doc-comment mentions)
