---
quick_id: 260921-thi
type: quick
subsystem: testing
tags: [jest, fake-timers, sidecar-rpc, unhandled-rejection, mutation-testing]
requires:
  - phase: none (test-only fix, isolated to storeEmbedWireContract.test.ts)
provides:
  - "fireWithNoRustPeer() helper: gives every no-peer store_embed seam call a real rejection handler"
  - "mutation-proven two-leg regression gate (behavioural + source-shape census) against the leak recurring"
affects: [sidecar-rpc-tests, todo-tracking]
tech-stack:
  added: []
  patterns:
    - "Positive-assertion regression gate for a defect where process.on('unhandledRejection') sees zero (jest intercepts first)"
    - "Two-pass comment stripping (stripSourceComments + per-line stripTrailingLineCommentTs) before a source-shape census regex"
key-files:
  created: []
  modified:
    - src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md
    - .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
key-decisions:
  - "Both regression-gate legs live inside storeEmbedWireContract.test.ts itself, not a new *.test.ts file, to avoid a testContainment.test.ts Block C ledger entry for no gain"
  - "No repo-wide ban on void-ed requestRustInvoke calls: the three sites here were the only ones in the repo; a repo-wide gate would police an empty set"
  - "Leg A asserts a POSITIVE claim (handler received the exact Error) rather than an absence claim, because process.on('unhandledRejection') is structurally blind here"
metrics:
  duration: ~130min
  completed: 2026-09-21
---

# Quick Task 260921-thi: Fix leaked store_embed rustInvoke timer Summary

**Routed three `void`-ed `createRustStoreEmbedSeam()` calls in `storeEmbedWireContract.test.ts` through a new `fireWithNoRustPeer()` handler, closing the leak that let jest misattribute the certain 60s `requestRustInvoke` timeout rejection to whichever unrelated test was mid-flight — backed by a mutation-proven, two-leg regression gate in the same file. Production (`sidecarRpc.ts`, `storeEmbedFlowRegistration.ts`) is untouched.**

## Performance

- **Duration:** ~130 min
- **Tasks:** 3
- **Files modified:** 4 (1 test file with the fix + gate, 1 test file with a containment-ledger note, 2 todo files)

## Production unaffected (explicit statement)

```
$ git diff --quiet src/backend/sidecar/sidecarRpc.ts && echo "sidecarRpc.ts CLEAN"
sidecarRpc.ts CLEAN
$ git diff --quiet src/backend/sidecar/storeEmbedFlowRegistration.ts && echo "storeEmbedFlowRegistration.ts CLEAN"
storeEmbedFlowRegistration.ts CLEAN
```

Both files are byte-unchanged versus `baseline_sha: c10fd00a5`. This was a test-only fix. The
60s timer at `sidecarRpc.ts:392` was **not** re-`unref()`-ed (it already carries its own correct
`unref()` and comment); `RUST_INVOKE_TIMEOUT_MS` was not shortened; `requestRustInvoke` was not
mocked; no global `unhandledRejection` swallow was installed.

## Task Commits

1. **Task 1: route the three no-peer seam calls through a handled helper** — `2fe6c592a`
   (`fix(quick-260921-thi): route no-peer store-embed seam calls through a handled helper`)
2. **Task 2: mutation-proven two-leg regression gate** — `d5089b019`
   (`test(quick-260921-thi): add mutation-proven two-leg gate for the no-peer rustInvoke rejection`)
3. **Task 3: archive the todo, fix F-9's citation** — `c76023e36`
   (`docs(quick-260921-thi): archive the leaked store_embed timer todo and fix F-9's citation`)

## The fix: `fireWithNoRustPeer()`

Final committed implementation (`src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts:90, 135-144`):

```ts
const noPeerSettlements = new Map<string, Promise<Error | null>>()

function fireWithNoRustPeer(pending: unknown, channel: string): void {
  noPeerSettlements.set(
    channel,
    Promise.resolve(pending).then(
      () => null,
      (reason: unknown) =>
        reason instanceof Error ? reason : new Error(String(reason))
    )
  )
}
```

All three call sites (`open`, `setBounds`, `navigate`) now read
`fireWithNoRustPeer(createRustStoreEmbedSeam().<method>(...), <CHANNEL>)` — no `void` operator, no
`as unknown as Promise<void>` cast on `setBounds` (the `pending: unknown` parameter adopts
`setBounds`'s lying `void`-declared-but-actually-promise return at runtime via `Promise.resolve`).
Passing the promise in argument position (not a bare statement) satisfies
`@typescript-eslint/no-floating-promises` structurally, with no `void` operator or
`eslint-disable` needed.

## Regression gate: both legs, passing by assertion name

```
$ npx jest --selectProjects Backend --runInBand src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
PASS Backend src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
  store-embed wire contract — the sidecar emits exactly what the Rust parsers accept
    ✓ store_embed_open emits the fixture payload verbatim (object, not positional) (3 ms)
    ✓ store_embed_set_bounds emits the fixture payload verbatim (object, not positional)
    ✓ store_embed_navigate emits the fixture payload verbatim (object, not positional) (1 ms)
    ✓ the fixture is the shared artifact the Rust side reads — its arms must not drift
  regression gate: the leaked store_embed rustInvoke rejection now has a handler (2026-09-21)
    ✓ Leg A (behavioural, POSITIVE): the no-peer store_embed_open call is caught by a handler, not left floating (1 ms)
    ✓ Leg B (source-shape census): every createRustStoreEmbedSeam call in this file routes through fireWithNoRustPeer, and no void-ed seam call survives

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        0.673 s, estimated 1 s
```

**Leg A** (behavioural, positive): `jest.useFakeTimers()`, fires `store_embed_open` through
`fireWithNoRustPeer`, `jest.advanceTimersByTime(60_000)`, awaits the recorded settlement, asserts
`toBeInstanceOf(Error)` and the exact message `'rustInvoke timed out after 60000ms:
store_embed_open'`. This is a POSITIVE claim (a handler received the specific Error) — it does
**not** assert on `process.on('unhandledRejection')`, because that listener sees **zero** here:
jest intercepts the rejection first and attributes it to whichever test is mid-flight, which is
the exact defect this file exists to fix. An absence-based gate would have been green against the
pre-fix code.

**Leg B** (source-shape census): reads this file's own source off disk via `readFileSync`, strips
comments in two passes (`stripSourceComments` then per-line `stripTrailingLineCommentTs`, since
the first pass alone leaves a trailing `//` comment on a code line intact by design), collapses
whitespace across the *whole string* (not per line, because `open(...)` spans five physical
lines), then asserts:
- zero matches for `/\bvoid\s+\(?\s*createRustStoreEmbedSeam\s*\(/g` (the optional `(` is
  load-bearing — the historical `setBounds` shape was `void (createRustStoreEmbedSeam()...`)
- `handledSeamCalls.length === totalSeamCalls.length`
- `totalSeamCalls.length >= 3` (anti-vacuity floor, so the gate cannot pass by the seam
  disappearing from the file entirely)

## Mutation Proof 1 (M1): restore a void-ed call site

Reverted the `navigate` call site back to `void createRustStoreEmbedSeam().navigate(...)` (via
`cp` from a scratchpad copy, never `git checkout --` or `git stash`). Full actual red output:

```
FAIL Backend src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
  store-embed wire contract — the sidecar emits exactly what the Rust parsers accept
    ✓ store_embed_open emits the fixture payload verbatim (object, not positional) (2 ms)
    ✓ store_embed_set_bounds emits the fixture payload verbatim (object, not positional)
    ✓ store_embed_navigate emits the fixture payload verbatim (object, not positional) (1 ms)
    ✓ the fixture is the shared artifact the Rust side reads — its arms must not drift
  regression gate: the leaked store_embed rustInvoke rejection now has a handler (2026-09-21)
    ✓ Leg A (behavioural, POSITIVE): the no-peer store_embed_open call is caught by a handler, not left floating (1 ms)
    ✕ Leg B (source-shape census): every createRustStoreEmbedSeam call in this file routes through fireWithNoRustPeer, and no void-ed seam call survives (1 ms)

  ● regression gate: the leaked store_embed rustInvoke rejection now has a handler (2026-09-21) › Leg B (source-shape census): every createRustStoreEmbedSeam call in this file routes through fireWithNoRustPeer, and no void-ed seam call survives

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 3

    - Array []
    + Array [
    +   "void createRustStoreEmbedSeam(",
    + ]

      300 |     const voidedSeamCalls =
      301 |       collapsed.match(/\bvoid\s+\(?\s*createRustStoreEmbedSeam\s*\(/g) ?? []
    > 302 |     expect(voidedSeamCalls).toEqual([])
          |                             ^
      303 |
      304 |     const totalSeamCalls = collapsed.match(/createRustStoreEmbedSeam\(/g) ?? []
      305 |     const handledSeamCalls =

      at Object.<anonymous> (src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts:302:29)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 5 passed, 6 total
Snapshots:   0 total
Time:        0.622 s, estimated 1 s
```

**Verdict: M1 PASSED its purpose.** Leg B went RED, citing the exact reintroduced
`"void createRustStoreEmbedSeam("` string. Leg A and all 4 wire-contract tests stayed GREEN
through the mutation — proving Leg B is the leg that actually detects a reintroduced `void`-ed
call, and that Leg A does not falsely fire on it. Reverted back to the committed state via `cp`
from the fixed scratchpad copy; confirmed clean with `git diff --stat` (no diff) before
proceeding.

## Mutation Proof 2 (M2): strip the helper's handler

Stripped `fireWithNoRustPeer`'s `.then(...)` handler (reduced it to firing the promise with no
rejection handler attached, reproducing the pre-fix shape). Full actual red output:

```
/Users/graysonmitchell/Projects/GameLib/src/backend/sidecar/sidecarRpc.ts:339
                reject(new Error(`rustInvoke timed out after ${RUST_INVOKE_TIMEOUT_MS}ms: ${channel}`));
                       ^

Error: rustInvoke timed out after 60000ms: store_embed_open
    at /Users/graysonmitchell/Projects/GameLib/src/backend/sidecar/sidecarRpc.ts:339:24
    at callTimer (/Users/graysonmitchell/Projects/GameLib/node_modules/@sinonjs/fake-timers/src/fake-timers-src.js:744:24)
    at doTickInner (/Users/graysonmitchell/Projects/GameLib/node_modules/@sinonjs/fake-timers/src/fake-timers-src.js:1312:29)
    at doTick (/Users/graysonmitchell/Projects/GameLib/node_modules/@sinonjs/fake-timers/src/fake-timers-src.js:1393:20)
    at Object.tick (/Users/graysonmitchell/Projects/GameLib/node_modules/@sinonjs/fake-timers/src/fake-timers-src.js:1401:20)
    at FakeTimers.advanceTimersByTime (/Users/graysonmitchell/Projects/GameLib/node_modules/@jest/fake-timers/build/modernFakeTimers.js:94:19)
    at Object.advanceTimersByTime (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-runtime/build/index.js:2027:26)
    at Object.<anonymous> (/Users/graysonmitchell/Projects/GameLib/src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts:255:10)
    at Promise.then.completed (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/utils.js:298:28)
    at new Promise (<anonymous>)
    at callAsyncCircusFn (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/utils.js:231:10)
    at _callCircusTest (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/run.js:316:40)
    at _runTest (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/run.js:252:3)
    at _runTestsForDescribeBlock (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/run.js:126:9)
    at _runTestsForDescribeBlock (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/run.js:121:9)
    at run (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/run.js:71:3)
    at runAndTransformResultsToJestFormat (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapterInit.js:122:21)
    at jestAdapter (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapter.js:79:19)
    at runTestInternal (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-runner/build/runTest.js:367:16)
    at runTest (/Users/graysonmitchell/Projects/GameLib/node_modules/jest-runner/build/runTest.js:444:34)

Node.js v26.2.0
```

**Verdict: M2 PASSED its purpose.** With the handler stripped, Leg A goes RED by crashing the
whole process — reproducing the *exact* original diagnostic shape (`Error: rustInvoke timed out
after 60000ms: store_embed_open`, thrown from `sidecarRpc.ts:339` during
`jest.advanceTimersByTime`) that this task exists to fix. Reverted back to the committed state via
`cp` from the fixed scratchpad copy; confirmed clean and green afterward (61/61 tests passing in
the full sidecar directory).

**Asymmetry, as predicted by the plan:** M1 (restored `void`) reds only Leg B (a source-shape
defect Leg A cannot see because the promise still settles and is still handled by the helper at
the other two call sites). M2 (stripped handler) reds only Leg A (a behavioural defect Leg B
cannot see because the source text still reads `fireWithNoRustPeer(createRustStoreEmbedSeam(...)`
— the helper's *internals* are outside Leg B's static-text scope). Neither leg alone would have
caught both mutations; both are required.

## Lint: before/after, both scopes, against fixed ceilings

`pnpm lint` (`meta/lintScoped.cjs`) enforces `SRC_CEILING = 1124`, `TESTS_CEILING = 638` — both
exact and unpadded. Tests scope had **zero** headroom going in (638/638 measured baseline).

| Checkpoint | production (ceiling 1124) | tests (ceiling 638) | result |
|---|---|---|---|
| before Task 1 | 1119 | 638 | PASS / PASS |
| after Task 1 | 1119 | 638 | PASS / PASS |
| after Task 2 | 1119 | 638 | PASS / PASS |
| final (post Task 2, re-verified) | 1119 | 638 | PASS / PASS |

Zero new warnings in either scope at any checkpoint. `TESTS_CEILING` was not raised.

## `pnpm codecheck`

```
$ pnpm codecheck
> tsc --noEmit
```

Exit 0, no output.

## `pnpm planning-gates`

```
11/11 planning gates passed.
```

## `pnpm test:ci` — one run, evidence not a claim

Per the plan's evidence standard: this single green run is supporting evidence, **not** proof the
flake is gone (the original defect was duration-dependent and could not reliably repro in a
normal-length run; the load-bearing evidence is the mutation proofs above, not this run).

```
Started (UTC): 2026-09-21T09:42:35Z
Exit code: 0
Wall-clock duration: 237s (jest-reported: 236.076s)

Test Suites: 439 passed, 439 total
Tests:       2 skipped, 8858 passed, 8860 total
Snapshots:   0 total
Time:        236.076 s
```

```
$ grep -n 'rustInvoke timed out' test-ci-final.log
(no matches — grep exit code 1)
```

The string `rustInvoke timed out` does not appear anywhere in this run's full log. Absence is the
signal reported here, not the exit code — this run was green for the ordinary reason (all
8858 tests passed), and the absence of the leaked-timer diagnostic string is the additional,
separately-checked fact being recorded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Leg B's own test title miscounted itself**

- **Found during:** Task 2, first implementation of the census test
- **Issue:** The `it()` title string for Leg B originally contained the literal substring
  `createRustStoreEmbedSeam()` (with parens), which Leg B's own regex counted as a 5th,
  unhandled occurrence (4 real call sites handled vs. 5 total counted), failing the test against
  correct code.
- **Fix:** Renamed the test title to drop the trailing `()`:
  `'Leg B (source-shape census): every createRustStoreEmbedSeam call in this file routes through fireWithNoRustPeer, and no void-ed seam call survives'`.
- **Files modified:** `src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts`
- **Verification:** `grep -n 'createRustStoreEmbedSeam('` shows exactly 5 matches (4 real call
  sites incl. Leg A's, plus 1 harmless comment reference that the comment-stripping passes
  remove before the census runs); Leg B then passes.
- **Committed in:** `d5089b019` (Task 2 commit)

No other deviations. Tasks 1 and 3 executed exactly as planned.

### Self-correction (not a deviation, not committed)

While investigating an unrelated pre-existing "Jest did not exit one second after test run" exit
code during a full Backend-project run (see below), a `cp` restore from stale scratchpad `.orig`
copies (captured before Task 1 began, not just before Task 2) accidentally reverted both files to
their pre-Task-1 state in the working tree. This was caught before any commit: restored Task 1's
committed state via `git show HEAD:<path> > <path>` (not `git checkout --`, per the plan's
explicit prohibition on firing the post-checkout hook), re-applied Task 2's edits from a fresh
read, and re-verified all checks matched prior results exactly. Fresh, correctly-scoped scratchpad
backups were then captured for use in M1/M2. No committed work was affected.

### Pre-existing issue confirmed out of scope

A full Backend-project `jest` run exits 1 with a "Jest did not exit one second after test run
completed" warning, both with this task's fix applied and against the original unfixed files (a
control run restricted to `src/backend/sidecar/__tests__/` reproduced the identical message
against the unmodified baseline). This is a separate, already-known, already-filed issue (see
`.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` and
MEMORY.md's "`test:ci` RED, ZERO failures" entry) — out of scope for this task per the plan's
`evidence_standard_for_test_ci` section, which names this exact scenario.

## Files Created/Modified

- `src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts` — the fix (`fireWithNoRustPeer`
  helper, 3 call sites routed through it) + the 2-leg mutation-proven regression gate
- `src/backend/sidecar/__tests__/testContainment.test.ts` — amended classification paragraph
  noting the file's new `fs.readFileSync` of its own source text, with precedent references
- `.planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md`
  — moved from `pending/`; `## What is NOT known, stated plainly` replaced with `## Resolved`
- `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` —
  citation repointed from the `pending/` to the `completed/` path of the above todo

## Issues Encountered

None beyond the two items documented above (a self-caught-and-corrected revert accident that
never reached a commit, and a pre-existing, separately-filed "Jest did not exit" issue confirmed
out of scope). Both are recorded for completeness, not as open problems.

## Next Phase Readiness

This closes `.planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md`
fully — no follow-up work is implied. `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`
remains open and unaffected (it covers a different, broader, still-undetermined RPC-timeout
co-occurrence question; this task's fix removes one confirmed contributing mechanism from its
scope, and its citation to this todo now points at the correct `completed/` path).

## Self-Check

```
$ [ -f src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts ] && echo FOUND
FOUND
$ [ -f src/backend/sidecar/__tests__/testContainment.test.ts ] && echo FOUND
FOUND
$ [ -f .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md ] && echo FOUND
FOUND
$ [ ! -f .planning/todos/pending/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md ] && echo "CONFIRMED MOVED"
CONFIRMED MOVED
$ git log --oneline --all | grep -q 2fe6c592a && echo FOUND
FOUND
$ git log --oneline --all | grep -q d5089b019 && echo FOUND
FOUND
$ git log --oneline --all | grep -q c76023e36 && echo FOUND
FOUND
```

## Self-Check: PASSED

---

*Quick task: 260921-thi*
*Completed: 2026-09-21*
