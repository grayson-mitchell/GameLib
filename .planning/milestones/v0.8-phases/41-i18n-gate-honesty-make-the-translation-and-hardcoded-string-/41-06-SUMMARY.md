---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
plan: 06
subsystem: testing
tags: [i18n, jest, lint, gate-honesty, error-handling]

# Dependency graph
requires:
  - phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string- (41-01 through 41-05)
    provides: meta/lintTranslations.ts's REQ-41-01/REQ-41-02 rewrite and 41-VERIFICATION.md's two blocker findings (GAP-1, GAP-2)
provides:
  - "A corrupt en/<namespace>.json is a named, counted hard failure at both read sites (lintTranslations() and missingPairs()), never an uncaught CorruptCatalogError"
  - "Every skip of the presence-baseline drift check emits a named findings entry (corrupt-English, non-canonical path, absent baseline); the only silent branch is the D-15 !isForkOwned(namespace) scope decision"
  - "LintOptions.baselinePath is injectable, defaulting to the committed PRESENCE_BASELINE_PATH, so the absent-baseline boundary is testable without touching the committed artifact"
  - "readCatalogs() (the unguarded helper that produced GAP-1) deleted"
affects: [41-07, future i18n-gate work touching meta/lintTranslations.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-namespace try/catch around a corrupt-catalog read, mirroring checkLanguage()'s existing CorruptCatalogError handling, applied to BOTH English-read call sites"
    - "Every skip branch in a gate loop pushes a named findings entry identifying what was skipped and why; the one deliberate silent branch (ownership scope, D-15) is commented as a scope decision, not an availability statement"
    - "Injectable dependency path (opts.baselinePath) to test an absent-artifact boundary without touching the real committed file"

key-files:
  created: []
  modified:
    - meta/lintTranslations.ts
    - meta/__tests__/lintTranslations.test.ts

key-decisions:
  - "GAP-2's fix is a findings entry, not a hardFailure -- a hardFailure on every non-canonical fixture run would re-break R1/R3/R4/R7 the way the original unconditional wiring did in plan 41-05"
  - "readCatalogs() deleted outright rather than fixed in place -- it had exactly one call site (the buggy one) and leaving an exported helper that propagates CorruptCatalogError unfiltered is the same trap that produced GAP-1"
  - "R1 and R3 strengthened (partition findings, assert the skip diagnostic present, re-assert the original claim over the remainder) rather than weakened or having the new diagnostic suppressed to keep them quiet"

requirements-completed: [REQ-41-01, REQ-41-02]

# Metrics
duration: unknown (original execution stalled before recording; see Deviations)
completed: 2026-09-06
---

# Phase 41 Plan 06: i18n gate honesty — GAP-1/GAP-2 blocker closure Summary

**Both corrupt-English-catalog crash sites in `meta/lintTranslations.ts` now report a named hard failure instead of throwing, and every presence-baseline drift-check skip now emits a named finding instead of silence.**

## Performance

- **Duration:** Unknown — the original executing agent stalled before writing this SUMMARY and its transcript (including timing) is lost. See "Deviations from Plan" below.
- **Completed:** 2026-09-06 (this continuation agent's session)
- **Tasks:** 2 (both from the plan)
- **Files modified:** 2 — `meta/lintTranslations.ts`, `meta/__tests__/lintTranslations.test.ts`

## Accomplishments

- GAP-1 (REQ-41-02) closed: both unguarded English-catalog reads (`lintTranslations()`'s per-namespace English read, and `missingPairs()`'s English read) now catch `CorruptCatalogError` and route it into a counted `hardFailures` entry, mirroring `checkLanguage()`'s existing corrupt-locale handling. `readCatalogs()`, the unguarded helper that produced the bug, is deleted (zero remaining call sites).
- GAP-2 (REQ-41-01) closed: the two remaining silent `continue` branches in the presence-baseline drift loop (non-canonical `localesPath`, absent baseline file) each now push a named `findings` entry identifying the namespace and the skip reason. Combined with the corrupt-English-catalog skip added for GAP-1, every skip in the loop now emits except the one deliberate `!isForkOwned(namespace)` scope decision (D-15), which carries an explanatory comment.
- `LintOptions.baselinePath` added as an optional field, defaulting to the committed `PRESENCE_BASELINE_PATH`, letting the absent-baseline boundary be tested via a scratch path injected through `opts` rather than by disturbing the real committed artifact.
- R1 and R3 (pre-existing fixture tests) were deliberately strengthened rather than weakened: both now partition `result.findings` on the new skip diagnostic, assert it is present exactly once, and re-assert their original zero-findings-otherwise claim over the remainder.
- Five new tests added: R16, R17, R18, R19a/R19b, R20a/R20b (8 new `it(...)` blocks total, netting the same +7 test count the plan targeted, since R1 and R3 were modified in place rather than added).

## Task Commits

Both task commits were made by the original (stalled) executor and independently verified correct by this continuation agent before it re-performed the RED proofs below:

1. **Task 1: A corrupt English catalog is a named hard failure at both read sites, never a crash** — `46b8693df` (fix) — 2 files changed, 191 insertions(+), 48 deletions(-)
2. **Task 2: Every remaining drift-check skip emits a named finding, and the baseline path is injectable** — `ce95fb576` (fix) — 2 files changed, 146 insertions(+), 9 deletions(-)

**Plan metadata:** this commit (docs: complete plan) — see below.

_Both commits' own messages already contain detailed RED/GREEN narration (RED test names, corrupt-English handling, skip-diagnostic behavior, and the 794/8310/1018 measurements) written by the original executor before it stalled. This SUMMARY corroborates that content with independently re-run proofs (below) rather than repeating it uncritically._

## Files Created/Modified

- `meta/lintTranslations.ts` — guarded English-catalog reads at both call sites (`lintTranslations()`, `missingPairs()`); deleted `readCatalogs()`; added `corruptEnglishNamespaces` tracking and its drift-skip branch; added `LintOptions.baselinePath` (optional, injectable); replaced the compound silent `continue` in the drift loop with two separately-named skip branches (non-canonical path, absent baseline), leaving `!isForkOwned(namespace)` as the one commented, deliberate silent branch.
- `meta/__tests__/lintTranslations.test.ts` — added R16, R17, R18 (Task 1); added R19a/R19b/R20a/R20b under a new `describe('presence baseline drift skip diagnostics ...')` block (Task 2); strengthened R1 and R3 to partition on and assert the new skip diagnostic.

## Decisions Made

- GAP-2's fix is a `findings` entry, never a `hardFailure` — an unconditional hard failure on every non-canonical-path fixture run would re-break R1/R3/R4/R7 the same way plan 41-05's original unconditional wiring did (see `<design_notes>` in `41-06-PLAN.md`).
- `readCatalogs()` was deleted outright (not patched) because it had exactly one call site — the buggy one — and its continued existence as an unguarded, exported helper was itself the trap.
- R1 and R3 were strengthened (partition findings → assert skip diagnostic present exactly once → assert original claim over the non-skip remainder), never weakened or had the new diagnostic suppressed to keep them quiet.

## Re-performed RED Proofs (this continuation agent, 2026-09-06)

**Why this section exists:** the agent that authored commits `46b8693df` and `ce95fb576` stalled before writing this SUMMARY, and its transcript — including whatever RED output it originally observed for R16–R20a — is lost. Rather than transcribing unverifiable claims into a committed record, this continuation agent independently re-applied each sabotage described in the plan, captured the actual failure output itself, and then reverted the sabotage by hand. The `git diff --stat` was confirmed empty (no diff at all against the committed source) after every revert, before this SUMMARY was written.

Each proof below was run in isolation: one sabotage applied, the named test(s) run via `npx jest --selectProjects Meta --runInBand -t "<name>"`, output captured, then the file hand-reverted to the exact committed text before moving to the next sabotage.

### R16 + R18 (shared sabotage): remove the try/catch around the English read in `lintTranslations()`

Sabotage: replaced the guarded per-namespace English-catalog read loop with an unguarded `readCatalog(opts.localesPath, 'en', namespace)` call (no try/catch, no `corruptEnglishNamespaces` tracking).

Observed RED (verbatim, both tests failed the same way — an uncaught exception propagating out of the test body):

```
● lintTranslations (REQ-41-02) › REQ-41-02 R16: a corrupt English catalog is a named hard failure, not a crash

  CorruptCatalogError: en/gamelib.json is not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)

    at readCatalog (meta/lintTranslations.ts:158:11)
    at lintTranslations (meta/lintTranslations.ts:600:29)
    at meta/__tests__/lintTranslations.test.ts:192:38
    at withFixtureLocales (meta/__tests__/lintTranslations.test.ts:35:5)
    at Object.<anonymous> (meta/__tests__/lintTranslations.test.ts:187:5)

● lintTranslations (REQ-41-02) › REQ-41-02 R18: a corrupt English catalog produces a named drift-skip finding, not silence

  CorruptCatalogError: en/gamelib.json is not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)

    at readCatalog (meta/lintTranslations.ts:158:11)
    at lintTranslations (meta/lintTranslations.ts:600:29)
    at meta/__tests__/lintTranslations.test.ts:233:38
    at withFixtureLocales (meta/__tests__/lintTranslations.test.ts:35:5)
    at Object.<anonymous> (meta/__tests__/lintTranslations.test.ts:228:5)

Test Suites: 1 failed, 36 skipped, 1 of 37 total
Tests:       2 failed, 1017 skipped, 1019 total
```

Both R16 and R18 genuinely go RED under this sabotage — neither is vacuous. Sabotage reverted by hand; `git diff --stat meta/lintTranslations.ts` confirmed empty afterward.

### R17: remove the try/catch around `missingPairs()`'s English read

Sabotage: replaced `missingPairs()`'s guarded `try { enCatalog = readCatalog(...) } catch { enCatalog = null }` with an unguarded direct assignment.

Observed RED (verbatim):

```
● lintTranslations (REQ-41-02) › REQ-41-02 R17: missingPairs() returns [] instead of throwing when the English catalog is corrupt

  CorruptCatalogError: en/gamelib.json is not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)

    at readCatalog (meta/lintTranslations.ts:158:11)
    at missingPairs (meta/lintTranslations.ts:330:43)
    at meta/__tests__/lintTranslations.test.ts:218:26
    at withFixtureLocales (meta/__tests__/lintTranslations.test.ts:35:5)
    at Object.<anonymous> (meta/__tests__/lintTranslations.test.ts:213:5)

Test Suites: 1 failed, 36 skipped, 1 of 37 total
Tests:       1 failed, 1018 skipped, 1019 total
```

R17 genuinely goes RED — not vacuous. Sabotage reverted by hand; `git diff --stat` confirmed empty afterward.

### R19a: make the absent-baseline skip `continue` silently again

Sabotage: removed the `result.findings.push(...)` call from the `if (!existsSync(baselinePath))` branch, leaving a bare `continue`.

Observed RED (verbatim):

```
● presence baseline drift skip diagnostics (REQ-41-01, gap-closure 41-06) › R19a: an absent (injected) baseline path emits exactly one named skip finding

  expect(received).toHaveLength(expected)

  Expected length: 1
  Received length: 0
  Received array:  []

    at Object.<anonymous> (meta/__tests__/lintTranslations.test.ts:571:21)

Test Suites: 1 failed, 36 skipped, 1 of 37 total
Tests:       1 failed, 1018 skipped, 1019 total
```

R19a genuinely goes RED — not vacuous (it fails on the missing finding, exactly the defect class it exists to catch, not on an unrelated assertion). Sabotage reverted by hand; `git diff --stat` confirmed empty afterward.

### R20a: make the non-canonical-path skip `continue` silently again

Sabotage: removed the `result.findings.push(...)` call from the `if (!isCanonicalLocalesPath)` branch, leaving a bare `continue`.

Observed RED (verbatim):

```
● presence baseline drift skip diagnostics (REQ-41-01, gap-closure 41-06) › R20a: a non-canonical localesPath emits exactly one named skip finding for the fork-owned namespace

  expect(received).toHaveLength(expected)

  Expected length: 1
  Received length: 0
  Received array:  []

    at meta/__tests__/lintTranslations.test.ts:608:21
    at withFixtureLocales (meta/__tests__/lintTranslations.test.ts:35:5)
    at Object.<anonymous> (meta/__tests__/lintTranslations.test.ts:599:5)

Test Suites: 1 failed, 36 skipped, 1 of 37 total
Tests:       1 failed, 1018 skipped, 1019 total
```

R20a genuinely goes RED — not vacuous. Sabotage reverted by hand; `git diff --stat` confirmed empty afterward.

### Non-vacuity conclusion

All five sabotage cycles (R16, R17, R18, R19a, R20a) produced genuine RED output when applied against the current committed source, and none of them papered over an already-passing assertion — each failed on precisely the behavior it claims to prove. No test in this set is vacuous. After all five cycles, `git diff --stat` was empty and a full re-read of `meta/lintTranslations.ts` confirmed byte-for-byte identity with the committed `ce95fb576` state (git reported no diff at all, not merely a stat of zero lines).

## Re-performed GREEN Measurements (this continuation agent, 2026-09-06)

Re-run after the tree was confirmed clean (no sabotage applied):

- `npx jest --selectProjects Meta --runInBand`: **37 suites, 1018 passed, 1 skipped, 1019 total.** Matches the plan's target exactly (baseline at `97a9fdca8` was 1011/1/1012 → +7 tests, 0 regressions). Header confirmed to read `Meta` (case-sensitive project selector).

Measurements below were reported by a prior orchestrator step and are carried forward here (not independently re-run by this continuation agent, since this task's scope was narrowly the RED-proof re-performance and SUMMARY authorship — re-running them would have been redundant given the orchestrator's own measurement already matches the plan's target exactly and the source tree is unchanged):

- `pnpm codecheck`: exit 0, clean.
- `pnpm lint-translations:gamelib`: exit 0, `lint-translations[gamelib]: 794 findings, 0 hard failures` — unchanged from baseline.
- `git status --porcelain` on `meta/i18nCatalogPresenceBaseline.json`, `meta/i18nForkTouchedFiles.json`, `meta/i18nGateScope.json`, `public/locales/`: all empty.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`: byte-identical to a pre-plan snapshot.

## Deviations from Plan

### Process deviation (not a Rule 1-4 code deviation)

**The original executing agent for this plan stalled before writing `41-06-SUMMARY.md`, and its transcript is lost.** Both task commits (`46b8693df`, `ce95fb576`) are correct and complete — verified independently by reading their diffs and by re-running the full test suite — but the RED-proof records the plan mandates (verbatim failure output for R16, R17, R18, R19a, R20a) were never captured anywhere durable, because the agent that would have recorded them never reached the SUMMARY-writing step.

**Resolution:** a continuation agent (this one) was spawned specifically to close that gap. It did not redo the source work — `meta/lintTranslations.ts` and `meta/__tests__/lintTranslations.test.ts` were not modified in any lasting way — but independently re-applied each of the five sabotages named in the plan, ran the corresponding test(s), captured the actual observed failure output above, and reverted every sabotage by hand before writing this document. `git diff --stat` was confirmed empty (in fact `git diff` produced zero output at all against the committed tree) after the last revert and before this file was written.

This is disclosed here plainly rather than presenting the RED proofs above as having been captured during the original execution run. They were not — they were captured by this continuation agent, after the fact, against the already-committed source.

### Auto-fixed Issues

None — no code changes were made by this continuation agent. Its only file-changing actions were five temporary, fully-reverted sabotage edits to `meta/lintTranslations.ts` (each reverted before the next was applied), verified to leave zero net diff.

---

**Total deviations:** 1 process deviation (stalled original executor, RED proofs re-performed by continuation agent). No code deviations (Rules 1-4 did not apply — no bug, missing functionality, blocker, or architectural question arose during this continuation work).
**Impact on plan:** None on the shipped source. The plan's required RED-proof evidence now exists, sourced from an agent that actually observed it, rather than from a lost transcript.

## Issues Encountered

None during this continuation agent's work. All five sabotage/revert cycles behaved exactly as the plan predicted; no test was found vacuous.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Both verification blockers (GAP-1, GAP-2) from `41-VERIFICATION.md` are closed, source-verified, and now have a durable RED-proof record.
- `meta/lintTranslations.ts` is in the state both task commits left it: guarded at both English-catalog read sites, every drift-check skip named except the one deliberate D-15 ownership branch, and `baselinePath` injectable.
- Plan 41-07 (review-derived, gap_closure) can proceed independently; nothing in this plan blocks it.

---
*Phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-*
*Completed: 2026-09-06*
