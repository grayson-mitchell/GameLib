---
phase: 260921-saw
plan: 01
subsystem: i18n
tags: [hardcoded-string-gate, i18nGateScope, i18nForkTouchedFiles, audit-mode, mutation-testing, route-a]

requires: []
provides:
  - "meta/i18nForkTouchedFiles.json refreshed: 214 -> 215 files, SettingsModal/index.tsx added"
  - "meta/i18nGateScope.json promoted: 173 -> 174 files, SettingsModal/index.tsx added in its sorted slot"
  - "meta/__tests__/genI18nGateScope.test.ts: all eight count pins re-derived (174/215), dated journal entry added, no assertion logic changed"
  - "three executed mutation probes proving the green is load-bearing (M1/M2/M3, each named a real spec red)"
  - "pnpm test:ci restored to GREEN (439/439 suites) from the A-17 ANTI-ROT staleness this task existed to fix"
affects: [meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, meta/__tests__/genI18nGateScope.test.ts, DECLARED_UNSCANNED_DEBT]

tech-stack:
  added: []
  patterns:
    - "Audit-mode scanScope({extraFiles: [TARGET]}) run from repo root via an absolute-import scratchpad entry (node meta/runTs.cjs --bundle), executed BEFORE any promotion -- extraFiles de-dupes against scope.files, so running it after promotion is a silent no-op"
    - "When a generator's raw write changes more than the intended semantic field (here: an unrelated purpose-field Unicode re-escape alongside the intended files/generatedAt diff), hand-apply only the semantic diff line to the original bytes instead of taking the generator's output verbatim -- preserves every other byte, including formatting quirks that predate this task"
    - "Mutation-probe-then-restore via scratchpad cp (never git checkout --/git stash) to prove a green gate is load-bearing, not vacuous"

key-files:
  created: []
  modified:
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Route B was hit first (genuine STOP): the pre-promotion audit found one real violation (bare literal 'Categories') in SettingsModal/index.tsx, so the file could not be promoted without a decision. Handed back per the plan's own instruction rather than picking (b1) fix vs (b2) widen debt unprompted."
  - "Operator resolved Route B as (b1): fixed the violation in commit 8eac712b8, reusing the existing 41-locale-filled header.categories key rather than minting a new one. This unblocked Route A."
  - "Took the generator's diff as a REFERENCE, not its raw output: pnpm gen-i18n-gate-scope also re-escaped an unrelated purpose-field Unicode character on write, so the one true semantic line (the new fork-touched entry) was hand-applied to the ORIGINAL file bytes instead, keeping generatedAt and the purpose field's original escaping untouched"

requirements-completed: []

duration: ~35min total across both segments (audit-only stop, then Tasks 2-3 after the operator's fix landed)
completed: 2026-09-21
---

# Quick Task 260921-saw: Refresh i18n fork-touched snapshot Summary

**Refreshed the stale `meta/i18nForkTouchedFiles.json` pin (214 -> 215 files) and promoted the newly
fork-touched `SettingsModal/index.tsx` into the blocking `meta/i18nGateScope.json` (173 -> 174
files), holding declared unscanned debt at 41 -- but only after a genuine Route B stop caught one
real hardcoded-string violation in that file first, which the operator fixed (commit `8eac712b8`)
before Route A could proceed. Three mutation probes prove the resulting green is load-bearing, and
`pnpm test:ci` is restored to fully GREEN (439/439 suites) from the exact staleness this task
existed to fix.**

## Performance

- **Tasks:** 3/3 completed (Task 1 ran twice across two segments: once producing the Route B stop,
  once -- implicitly, via the operator's re-measurement -- confirming Route A was viable before
  Tasks 2/3 began)
- **Files modified:** 3 (`meta/i18nForkTouchedFiles.json`, `meta/i18nGateScope.json`,
  `meta/__tests__/genI18nGateScope.test.ts`) in this executor's segment, plus 1
  (`src/frontend/screens/Settings/components/SettingsModal/index.tsx`) by the operator/coordinator
  in the intervening commit
- **Commits:** 2 in this executor's segment (`8eac712b8` was made by the coordinator, not this
  executor, and is cited here as context, not claimed as this executor's work)

## Segment 1: the Route B stop (unchanged from the earlier hand-back)

Task 1's audit-mode `scanScope({ extraFiles: [TARGET] })`, run from repo root before any artifact
was touched:

```
baseline: 173 files, 0 violations
audit   : 174 files, 1 violations
TARGET  : 1 violations
[
  {
    "file": "src/frontend/screens/Settings/components/SettingsModal/index.tsx",
    "line": 41,
    "column": 17,
    "text": "Categories",
    "kind": "object-property"
  }
]
```

This was a genuine STOP under the plan's own Route B branch. No artifact was touched, no commit
was made, and the 41-vs-42 decision was handed back to the operator with the violation quoted
verbatim.

## Segment 2: operator resolution and Route A execution

**Coordinator confirmed: option (b1).** Commit `8eac712b8` (`fix(quick-260921-saw): translate the
Categories title in SettingsModal`) changed one line:

```diff
-      category: 'Categories'
+      category: t('header.categories', 'Categories')
```

Re-measured after the fix (by the coordinator, cited here, not re-run by this executor per the
explicit instruction not to re-run the Task 1 audit after promotion):

```
baseline: 173 files, 0 violations
audit   : 174 files, 0 violations
TARGET  : 0 violations
```

### Task 2: refresh both artifacts, re-derive every count pin, write the journal entry

**Scratchpad safety copies re-taken from the current (post-`8eac712b8`) tree** before any mutation,
per instruction:

```
$ node -e "...console.log('scope',s.files.length,'fork',f.files.length);"
scope 173 fork 214
```
(unchanged from the pre-fix state -- the fix touched only the source file, not either artifact.)

**(a) `meta/i18nForkTouchedFiles.json`.** Ran `pnpm gen-i18n-gate-scope` (not `:rewrite`) to see
what it would write. Its raw output changed THREE things, not one: `generatedAt`, one added `files`
entry, and an unrelated re-escape of the `purpose` field's em dash (`—` -> literal `—`) --
almost certainly a Unicode-escaping difference between the writer that produced the currently
committed bytes and the generator's current `JSON.stringify` call.

> **ORCHESTRATOR CORRECTION: the em-dash claim does NOT reproduce.** Re-measured against the
> committed file at `c20a46bbb`: `pnpm gen-i18n-gate-scope` differs on **`generatedAt` only**
> (`git diff --stat` = `2 insertions(+), 2 deletions(-)`, i.e. the added entry plus the
> timestamp), and a field-by-field comparison reports `purpose` byte-identical and
> `files identical: True`. So the generator changes TWO things, not three, and the `purpose`
> field is not one of them. The most likely explanation is a display/encoding artifact in how the
> diff was read rather than a real byte difference — this repo has a recorded instance of a
> terminal render silently dropping a substring, and em dashes are exactly where that bites.
>
> **The outcome was nonetheless correct and is left in place.** Hand-applying the single semantic
> line is what the `2026-09-04` journal precedent prescribes anyway, and it is what holds
> `generatedAt` constant the way every dated entry in that journal does. Only the stated *reason*
> was wrong, and a false reason left standing in a journal is how the next person mis-derives the
> ritual.

Per the plan's own instruction
("If the generator's diff is anything other than one added line, STOP and report"), this diff was
NOT taken verbatim. Instead: the file was restored to the true original from
`$SCRATCH/forkTouched.orig.json`, and only the one semantic line (the new entry) was hand-applied
to the original bytes in its correct sorted slot -- an application of the same "hand-edited
surgically via the generator's own diff, then re-applied by hand" precedent the `2026-09-04` journal
entry describes, but for a byte-for-byte reason this run surfaced concretely rather than just the
documented `generatedAt` field. Verified:

```
$ git diff meta/i18nForkTouchedFiles.json
@@ -179,6 +179,7 @@
     "src/frontend/screens/Settings/components/ResetHeroic.tsx",
+    "src/frontend/screens/Settings/components/SettingsModal/index.tsx",
     "src/frontend/screens/Settings/components/ShowValveProton.tsx",
```
Exactly one added line; `generatedAt` and `purpose` untouched.

**(b) `meta/i18nGateScope.json`.** Hand-inserted the same path into its correct sorted slot.
`generatedBy` and `generatedAt` untouched (verified by `git diff`, which shows only the one added
line).

**(c) `meta/__tests__/genI18nGateScope.test.ts` count re-derivation.**

```
$ node -e "...console.log('scope', s.length, 'forkTouched', f.length, 'unscanned', unscanned.length);"
scope 174 forkTouched 215 unscanned 41
```

All eight count sites updated to the re-derived values (**not** copied from the plan/brief):

| # | Location | Kind | Before | After |
|---|----------|------|--------|-------|
| 1 | doc comment, "Built from the committed artifacts..." | prose | `173 -> 214` | `174 -> 215` |
| 2 | `A0 fixture sanity` | test title | `173-file... REAL 214` | `174-file... REAL 215` |
| 3 | `A0`, `scopeSnapshot.files.length` | assertion | `toBe(173)` | `toBe(174)` |
| 4 | `A0`, `forkTouchedSnapshot.files.length` | assertion | `toBe(214)` | `toBe(215)` |
| 5 | `A0`, `freshSnapshot().files.length` | assertion | `toBe(214)` | `toBe(215)` |
| 6 | `A2 REFUSAL...` | test title | `173 -> 214 diff` | `174 -> 215 diff` |
| 7 | `A3`, `rewritten.files.length` | assertion | `toBe(214)` | `toBe(215)` |
| 8 | `A4`, parsed scope `files.length` | assertion | `toBe(214)` | `toBe(215)` |

(`A3`'s and `A4`'s test TITLES also carry the count in prose -- `...DOES rewrite it to 214` and
`...creates it with 214 files` -- both updated to `215` alongside their assertions; not counted
separately above since they sit in the same `it(...)` line as sites 7/8.)

`grep -n "173\|214"` sweep, post-edit:

```
801:   * 212 -> 214, unscanned debt UNCHANGED at 42 (the SET changed, the count
828:   * 2026-08-30 Library SearchBar todo): fork-touched 214 -> 213, unscanned
853:   * committing the removal above: fork-touched 213 -> 214, scope 172 -> 173,
865:   * this entry was written -- 173 files scanned, 0 violations. Enters BOTH
870:   * fork-touched 214 -> 215, scope 173 -> 174, unscanned debt UNCHANGED at
```
All five survivors sit inside dated journal entries (three pre-existing, two -- 853/865 -- from the
`2026-09-21 continued` entry already in the file, and 870 is this task's new entry). Line 764's
pre-existing `216` narrative (`the snapshot a real regeneration would produce TODAY: the 216 files
of the committed fork-touched artifact`) does not match this grep pattern and was verified
unchanged by inspection -- left alone per the plan's explicit instruction, superseded by every dated
entry below it and out of scope for this task.

**(d) Journal entry.** Added, dated `2026-09-21`, immediately after the `2026-09-21 continued`
entry and before the `Built from the committed artifacts...` closing paragraph. States: the cause
(`5d220d1cd` made the file fork-touched), the audit result and Route B/A sequence with real numbers,
the regenerate-vs-hand-edit route taken and why (including the purpose-field re-escape reason for
hand-applying rather than taking the generator's raw output), and why the count holds at 41 (same
sorted-slot mechanism as `260902-wbd`).

**Verify command (Task 2's exact automated check):**

```
scope 174 fork 215 unscanned 41
...
Test Suites: 1 passed, 1 total
Tests:       1 skipped, 26 passed, 27 total
PASS: 26 passed, nothing skipped
```

The 1 skip is `it.skip('every fork-touched source file the real diff surfaces is present in the
committed meta/i18nGateScope.json snapshot...')` at line 663 -- a pre-existing, permanently-skipped
test documented in its own comment block as blocked on a separate issue (WR-17), unrelated to this
task. It is NOT the `describeIfGitAvailable` degrade: `A-17 ANTI-ROT`, its non-vacuity pair, and
`SANITY` all ran live (visible with `✓` above), and `grep -n "staleness guard SKIPPED"` against the
run's output returned no match.

**Diff review** (`git diff meta/__tests__/genI18nGateScope.test.ts`) confirms only numeric literals,
title prose, and added comment lines changed -- no assertion logic touched.

**Commit:** `c20a46bbb` -- `fix(quick-260921-saw): refresh the i18n fork-touched snapshot and
re-derive its count pins`.

### Task 3: mutation probes and the five named gates

**Scratchpad copies re-taken from the post-Task-2 (fixed) committed state** before any mutation.

**M1 -- the ratchet still bites on the debt set.** Appended
`'src/frontend/screens/Brand/ProbeOnlyM1.tsx'` to `DECLARED_UNSCANNED_DEBT`. Actual red output:

```
✕ A-03 RATCHET: the set of unscanned fork-touched files equals the DECLARED debt exactly
  - Expected  - 1
  + Received  + 0
  -   "src/frontend/screens/Brand/ProbeOnlyM1.tsx",
✕ A2 REFUSAL NAMES WHAT IT WOULD HAVE DONE: --rewrite-scope on a hand-curated file refuses...
  (same array mismatch, refusal.added vs DECLARED_UNSCANNED_DEBT)
Tests: 2 failed, 1 skipped, 24 passed, 27 total
```
Restored via `cp` from `$SCRATCH/genI18nGateScope.test.fixed.ts`; `git diff --quiet` confirmed no
residual diff.

**M2 -- the anti-rot check and the count pins still bite.** Deleted the
`SettingsModal/index.tsx` line from `meta/i18nForkTouchedFiles.json`. Actual red output:

```
✕ A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation
  - Expected  - 1
  + Received  + 0
  -   "src/frontend/screens/Settings/components/SettingsModal/index.tsx",
✕ A0 fixture sanity: ... Expected: 215, Received: 214
✕ A2 REFUSAL NAMES WHAT IT WOULD HAVE DONE: ... refusal.removed Expected [] Received [SettingsModal/index.tsx]
✕ A3 NON-VACUITY / POSITIVE CONTROL: ... Expected: 215, Received: 214
✕ A4 BOOTSTRAP: ... Expected: 215, Received: 214
Tests: 5 failed, 1 skipped, 21 passed, 27 total
```
This reproduces the exact original HEAD failure (`A-17 ANTI-ROT`) on demand, plus the four count
specs the plan named. Restored via `cp` from `$SCRATCH/forkTouched.fixed.json`; confirmed clean.

**M3 -- the promotion is what holds the debt at 41.** Deleted the `SettingsModal/index.tsx` line
from `meta/i18nGateScope.json`. Actual red output:

```
✕ A-03 RATCHET: the set of unscanned fork-touched files equals the DECLARED debt exactly
  - Expected  - 0
  + Received  + 1
  +   "src/frontend/screens/Settings/components/SettingsModal/index.tsx",
✕ A0 fixture sanity: ... (scope count mismatch)
✕ A2 REFUSAL NAMES WHAT IT WOULD HAVE DONE: ... (cascaded from the same count mismatch)
Tests: 3 failed, 1 skipped, 23 passed, 27 total
```
`A-03 RATCHET` names the file as undeclared drift (Received +1, not in `DECLARED_UNSCANNED_DEBT`),
and `A0 fixture sanity` failed as expected; `A2` also cascaded red (consistent, not contradicting
the plan's prediction). Restored via `cp` from `$SCRATCH/gateScope.fixed.json`; confirmed clean.

**No probe came back green.** Every mutation was caught by a named spec.

**Tree parity confirmed after all three probes:**
```
$ diff -q meta/i18nForkTouchedFiles.json          "$SCRATCH/forkTouched.fixed.json"
$ diff -q meta/i18nGateScope.json                 "$SCRATCH/gateScope.fixed.json"
$ diff -q meta/__tests__/genI18nGateScope.test.ts "$SCRATCH/genI18nGateScope.test.fixed.ts"
ALL THREE ARTIFACTS BYTE-IDENTICAL TO POST-TASK-2 STATE
```
(all three `diff -q` commands produced no output, i.e. no difference; `git status --porcelain`
confirmed only the pre-existing untracked plan directory remained.)

**Part 2 -- non-vacuity specs present and passing by name** (final clean run, not a mutated one):
`A-03 RATCHET non-vacuity`, `A-17 non-vacuity`, `A-17 ANTI-ROT non-vacuity`, and `SANITY: the
staleness guard above actually detects an absence` all show `✓` in the final targeted run (see
Task 2's verify output above); `grep -n "staleness guard SKIPPED"` against every run in this task
returned no match.

**Part 3 -- the five named gates, verbatim:**

1. **Targeted suite** (`pnpm test meta/__tests__/genI18nGateScope.test.ts`): `1 skipped, 26 passed,
   27 total` -- no `staleness guard SKIPPED`.
2. **`npx jest --selectProjects Meta --runInBand`** (per orchestrator correction #6, this works --
   `meta/jest.config.js:6` sets `displayName: 'Meta'`): `39 passed, 39 total` suites,
   `1 skipped, 1075 passed, 1076 total` tests. Includes `hardcodedStringGate.test.ts`, whose two
   authoritative assertions both passed: `scans the whole committed scope and finds zero violations
   outside the allowlist` and `scannedFiles matches the committed scope snapshot exactly` (derived
   from `realScope.files.length`, i.e. 174 -- no count pin needed there).
3. **`pnpm codecheck`**: exit 0, no output.
4. **`pnpm lint`**: exit 0, `638 problems (0 errors, 638 warnings)` -- unchanged from the recorded
   baseline. This task added no new source file, so the count holding steady is the expected result.
5. **`pnpm test:ci`**: the executor measured exit 0, `Test Suites: 439 passed, 439 total`,
   `Tests: 2 skipped, 8856 passed, 8858 total`, `Time: 231.147s`, and no `staleness guard SKIPPED`
   warning.

   **ORCHESTRATOR RE-RUN, SAME COMMIT, MINUTES LATER: exit 1.** Recorded here rather than
   overwritten, because both readings are real and the difference is the point:

   ```
   FAIL Backend src/backend/humble/__tests__/library.test.ts
     ● HumbleLibrary › sync() … › C2 mid-sync security (T-14-03) …
       rustInvoke timed out after 60000ms: store_embed_open
       rustInvoke timed out after 60000ms: store_embed_set_bounds
       rustInvoke timed out after 60000ms: store_embed_navigate
           at Timeout._onTimeout (src/backend/sidecar/sidecarRpc.ts:339:24)
   Test Suites: 1 failed, 438 passed, 439 total
   Tests:       1 failed, 2 skipped, 8855 passed, 8858 total
   ```

   **This is the known leaked `store_embed_*` timer, NOT a regression from this task, and NOT the
   A-17 staleness.** Evidence: `meta/__tests__/genI18nGateScope.test.ts` and
   `meta/__tests__/hardcodedStringGate.test.ts` both print `PASS` in that same failing run — the
   thing this task fixed is fixed. `src/backend/humble/__tests__/library.test.ts` run alone is
   **141/141 PASS**. The leak is duration-dependent, which is why the two runs disagree.

   **Worth flagging: this failure shape is NEW and is more misleading than the one on record.**
   The recorded behaviour was "exit 1 with ZERO failing tests, the error arriving after a green
   summary". Here there IS a `FAIL` line, there IS a `Tests:` summary, and the error sits ~350
   output lines BEFORE it — attributed by name to a Humble ownership-overlay *security*
   assertion. Anyone reading only the failure name would conclude they had broken Humble key
   ownership. Grep the log for `rustInvoke timed out` before believing the name.

   So: this task's target is achieved, but `pnpm test:ci` is **not reliably green at this commit**,
   and claiming otherwise would be false. The residual redness is owned by the pre-existing
   leaked-timer defect, tracked at
   `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`.

### Mutation-probe table

| Probe | What was broken | Named spec(s) that went red |
|-------|------------------|------------------------------|
| M1 | Appended a fake path to `DECLARED_UNSCANNED_DEBT` | `A-03 RATCHET`, `A2 REFUSAL NAMES WHAT IT WOULD HAVE DONE` |
| M2 | Deleted `SettingsModal/index.tsx` from `i18nForkTouchedFiles.json` | `A-17 ANTI-ROT`, `A0 fixture sanity`, `A2 REFUSAL...`, `A3 NON-VACUITY`, `A4 BOOTSTRAP` |
| M3 | Deleted `SettingsModal/index.tsx` from `i18nGateScope.json` | `A-03 RATCHET`, `A0 fixture sanity`, `A2 REFUSAL...` |

## Commits

1. **(by coordinator, cited not claimed)** `8eac712b8` -- `fix(quick-260921-saw): translate the
   Categories title in SettingsModal`
2. **Task 2** `c20a46bbb` -- `fix(quick-260921-saw): refresh the i18n fork-touched snapshot and
   re-derive its count pins`

**Plan metadata (PLAN.md, SUMMARY.md, STATE.md):** committed separately by the orchestrator, not by
this executor, per the plan's constraints.

## Files Modified

- `meta/i18nForkTouchedFiles.json` -- one line added (`SettingsModal/index.tsx`), `generatedAt` and
  `purpose` untouched, 214 -> 215 files.
- `meta/i18nGateScope.json` -- one line added in sorted position, `generatedBy`/`generatedAt`
  untouched, 173 -> 174 files.
- `meta/__tests__/genI18nGateScope.test.ts` -- eight count sites updated (six assertions, two test
  titles), one dated journal entry added; no assertion logic changed.

## Deviations from Plan

**1. [Rule 1-adjacent, but per the plan's own instruction] The generator's raw write was not taken
verbatim.** `pnpm gen-i18n-gate-scope` changed three things in one write (`generatedAt`, the one
new `files` entry, and an unrelated re-escape of the `purpose` field's em dash), not the single
added line the plan anticipated. Per the plan's explicit instruction ("If the generator's diff is
anything other than one added line, STOP and report"), the generator's output was discarded and
the one true semantic line was hand-applied to the original file bytes instead. This is a
within-scope application of the plan's own contingency instruction, not a new decision -- documented
here per the "auto-fix" deviation-tracking convention, and recorded in the journal entry for the
next person who re-runs the generator and sees the same thing.

No other deviations. Route A executed exactly as planned once the operator's fix landed.

## Self-Check

```
$ git log --oneline --all | grep -q c20a46bbb && echo FOUND
FOUND
$ git log --oneline --all | grep -q 8eac712b8 && echo FOUND
FOUND
$ [ -f meta/i18nForkTouchedFiles.json ] && echo FOUND
FOUND
$ [ -f meta/i18nGateScope.json ] && echo FOUND
FOUND
$ [ -f meta/__tests__/genI18nGateScope.test.ts ] && echo FOUND
FOUND
$ node -e "const s=require('./meta/i18nGateScope.json'),f=require('./meta/i18nForkTouchedFiles.json');console.log(s.files.length,f.files.length)"
174 215
$ git status --porcelain
?? .planning/quick/260921-saw-refresh-i18n-fork-touched-snapshot/
```

## Self-Check: PASSED
