---
phase: quick-260821-nyh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/reconcile.test.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
  - src/backend/storeManagers/steam/depot.ts
autonomous: true
requirements: [QUICK-NYH-01, QUICK-NYH-02]

must_haves:
  truths:
    - "A resumed native Steam depot install whose reconciler skipped a NON-EMPTY set of files reports a terminal progress percent of 100, not the run-scoped fraction"
    - "The regression test proving that was OBSERVED RED against the unfixed expression, with the actual received value recorded, before the fix was applied"
    - "A resumed install's progress starts at the fraction of plan bytes already on disk, not 0%"
    - "A fresh install (empty reconciled-skip set) reports exactly the same percents it did before this change — the seed is 0 there"
    - "downSpeed/diskSpeed/eta stay RUN-scoped: the seeded bytes never appear in a rate numerator, so a resume does not report a fabricated multi-GB/s disk rate or an ETA collapsed to ~0"
    - "The reconcile fallback path (reconcilePartialState threw, full job list rebuilt) seeds 0 and is byte-identical in behaviour to today"
    - "Nothing about what lands on disk, the reconcile skip decision, mode healing, or the StateFlags=4 decision changes"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot/reconcile.ts"
      provides: "ReconcileResult.skippedBytes — plan bytes the reconciler verified as already present"
      contains: "skippedBytes"
    - path: "src/backend/storeManagers/steam/depot.ts"
      provides: "doneBytes seeded with the reconciled-skip byte total; run-scoped rate/ETA math preserved"
      contains: "reconciledSkippedBytes"
    - path: "src/backend/storeManagers/steam/__tests__/depot.test.ts"
      provides: "Non-vacuous terminal-percent-100 regression test over a non-empty reconciled-skip set"
      contains: "reconciled-skip"
  key_links:
    - from: "src/backend/storeManagers/steam/depot.ts downloadDepotFiles"
      to: "reconcilePartialState().skippedBytes"
      via: "let doneBytes = reconciledSkippedBytes"
      pattern: "reconciledSkippedBytes"
---

<objective>
Make the native Steam depot install's progress numerator and denominator agree on the
same set of bytes, so a RESUMED install starts at the fraction already on disk and can
actually reach 100%.

Purpose: `doneBytes` is run-scoped (only bytes this run writes) while `totalBytes` is
plan-scoped (every file in the plan). They agree on a fresh install and diverge on a
resume. A fully successful resumed install of HUMANKIND (appId 1124300) terminated at a
user-visible **76%** with `StateFlags 4` and all 18,809 files present — the missing 24
points were exactly the reconciled-skip bytes (`reconciledSkipped=15643` of
`totalFiles=18949`: 82.6% of files but only ~24% of bytes, because the skipped files were
the small ones).

Output: `reconcilePartialState` surfaces `skippedBytes`; `downloadDepotFiles` seeds
`doneBytes` (and `lastEmitBytes`) with it, keeping the ETA/rate math run-scoped; plus a
regression test that is SHOWN RED against the current expression first.

Chosen fix direction is option 1 from the todo (seed the numerator). Option 2 (shrinking
`totalBytes`) is explicitly rejected — it would redefine the number as "percent of the
remaining work", which reads wrong against a resumed install's own size.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-08-19-resumed-install-progress-percent-starts-at-zero-and-never-reaches-100.md
  ← AUTHORITATIVE. Read in full before touching code. NOTE: its line numbers were written
    2026-08-19 and HEAD has moved; every line reference in THIS plan was re-verified
    against the current working tree and supersedes the todo's.

Project skills (Steam native depot work auto-loads this):
- `Skill("spike-findings-gamelib")` — Steam native depot install + ACF adoption patterns

Source files (read the cited ranges, do not re-read the whole 3004-line file):
@src/backend/storeManagers/steam/depot/reconcile.ts
  - `ReconcileResult` interface at **38-49** (fields: `jobs` :43, `allFilesVerified` :48)
  - `reconcilePartialState()` at **126-158**: locals at :130-131, per-file verify at
    :139-148, `if (verified) continue` at **:150**, `return { jobs, allFilesVerified }`
    at **:157**
@src/backend/storeManagers/steam/depot.ts
  - plan-build `totalBytes` summation at **:794-799** (`entry.files.reduce((sum, f) => sum + Number(f.size), 0)`)
  - `healReconciledFileModes()` at **:1881**
  - `downloadDepotFiles`: `installRoot` at **:1953-1957**
  - reconcile call + fallback try/catch at **:1985-2012**, destructure at **:1993**
  - `const totalBytes = plan.totalBytes` at **:2016**
  - `let doneBytes = 0` at **:2039**, `let lastEmitBytes = 0` at **:2041**
  - log-stats percent at **:2144-2145**
  - `emitProgress` at **:2235**: throttle delta **:2236-2237**, `lastDiskSpeed` rolling
    rate **:2258-2262**, `lastEmitBytes = doneBytes` **:2264**, ETA
    **:2270-2273**, WR-03 clamped user-facing percent **:2292-2297**,
    `bytes: getFileSize(doneBytes)` **:2298**
  - `doneBytes += disk` accumulation at **:2365**
  - final census `reconciledSkipped: finalCensus.totalFiles - jobs.length` at **:2426**
@src/backend/storeManagers/steam/__tests__/depot.test.ts
  - the download/progress describe: `dir = mkdtempSync(...'gamelib-depot-test-')` at
    **:3062**, `sha1Hex` helper at **:3087**
  - existing multi-depot percent test at **:3252**
  - existing WR-03 clamp test at **:3854** ← the new test goes immediately AFTER this one
@src/backend/storeManagers/steam/__tests__/reconcile.test.ts (257 lines — unit coverage for reconcilePartialState)
</context>

<interfaces>
<!-- Contracts the executor needs. Do NOT go exploring for these. -->

CURRENT (src/backend/storeManagers/steam/depot/reconcile.ts:38-49):

  export interface ReconcileResult {
    jobs: ReconcileJob[]
    allFilesVerified: boolean
  }

NEW contract this plan creates (Task 2 defines it, depot.ts consumes it):

  export interface ReconcileResult {
    jobs: ReconcileJob[]
    allFilesVerified: boolean
    /** Summed `Number(file.size)` of every plan entry the reconciler verified as
     *  already present and therefore EXCLUDED from `jobs`. Uses the identical
     *  expression buildDepotPlan uses for `plan.totalBytes` (depot.ts:799), so
     *  `skippedBytes <= plan.totalBytes` holds by construction. 0 on a fresh
     *  install. */
    skippedBytes: number
  }

VERIFIED — `reconcilePartialState` has exactly ONE production consumer
(`src/backend/storeManagers/steam/depot.ts:1993`) plus `reconcile.test.ts`. Existing
callers destructure `.jobs` / `.allFilesVerified`, so adding a field breaks nothing.
`library.ts`'s startup-resume path calls `healReconciledFileModes` only, NOT
`reconcilePartialState`.

Existing test harness facts (do not re-derive):
- `depot.test.ts`'s download describe uses a REAL tmpdir (`mkdtempSync`) and passes
  `{ targetSteamappsDir: dir, installdir: 'SomeGame', hosts: HOSTS }`, so
  `installRoot === join(dir, 'common', 'SomeGame')` (depot.ts:1953-1957). `node:fs` is
  NOT mocked there — a file written to that path is really read back by the reconciler.
- `fetchChunk` is mocked; `sendFrontendMessage('progressUpdate', payload)` calls are the
  assertion surface (see :3293 / :3879 for the exact filter idiom).
- `sha1Hex(buf)` helper already exists at :3087 in that describe's scope.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the terminal-percent-100 regression test and OBSERVE IT RED against the unfixed expression</name>
  <files>
src/backend/storeManagers/steam/__tests__/depot.test.ts
  </files>
  <behavior>
    New test in the download/progress describe (immediately after the WR-03 test at :3854),
    named to state the property, e.g.:

      'a resumed install whose reconciler skipped a NON-EMPTY set of files still reports a
       terminal percent of 100 (todo 2026-08-19: run-scoped numerator vs plan-scoped denominator)'

    Shape:
    - `skippedBuf = Buffer.from('S'.repeat(99))` (99 bytes), `chunkBuf = Buffer.from('x')` (1 byte).
    - Pre-write the skipped file to disk BEFORE calling downloadDepotFiles:
      `mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })` then
      `writeFileSync(join(dir, 'common', 'SomeGame', 'already.bin'), skippedBuf)`.
    - `fileSkipped: { filename: 'already.bin', size: 99, sha_content: sha1Hex(skippedBuf),
      chunks: [{ sha: 's-skip', cb_original: 99, offset: 0 }] }`
      — size AND sha1 must match the bytes on disk, or reconcile will not skip it.
    - `fileFetched: { filename: 'fetch.bin', size: 1, sha_content: sha1Hex(chunkBuf),
      chunks: [{ sha: 's-fetch', cb_original: 1, offset: 0 }] }`
    - `plan.totalBytes = 100` — the HONEST sum (99 + 1). It must NOT be artificially
      inflated the way the :3252 test's 400 is, or 100% would be unreachable for an
      unrelated reason and the test would prove nothing.
    - Both files in ONE depot is sufficient; the multi-depot denominator property is
      already covered at :3252.

    Assertions (all three required):
    1. ANTI-VACUITY — the skip set really is non-empty: `fetchChunk` was called exactly
       ONCE, and never with a chunk sha of 's-skip'. If reconcile did not skip
       `already.bin`, this fails and the percent assertion below would be vacuously
       satisfiable by a fresh-install path.
    2. The LAST `progressUpdate` payload's `progress.percent === 100`.
    3. `progress.eta` is still `''` or `HH:MM:SS`, and `progress.downSpeed` /
       `progress.diskSpeed` are finite numbers — guards the rate/ETA regression the
       seeding could otherwise introduce.

    Expected RED behaviour against unfixed code: `doneBytes` reaches 1, `totalBytes` is
    100, so the terminal percent is `Math.round(1/100*100)` = **1**. The failure must read
    as expected 100, received 1.
  </behavior>
  <action>
Add ONLY the test in this task. Do NOT touch `reconcile.ts` or `depot.ts` yet — the whole
point of this task is a recorded red observation, and a test that has never been seen fail
proves nothing here (standing project lesson: a grep/test assertion must be shown to fail
against a known-bad input; and a gate can be non-vacuous, correctly computed, and still
measure the wrong property).

Place it inside the existing describe that owns `dir` (setup at :3062) so the tmpdir
lifecycle and the `sendFrontendMessage` mock wiring are inherited. Reuse the in-scope
`sha1Hex` at :3087 — do not add a second helper. Import `mkdirSync`/`writeFileSync` from
`node:fs` only if they are not already imported in that file (`mkdtempSync` is imported at
:29, so extend that import rather than adding a new statement).

Run the test and CAPTURE the failing output verbatim. Paste the actual jest failure lines
(the `Expected: 100` / `Received: 1` pair and the test name) into the task's SUMMARY and
into the commit message body. A summary that says only "test failed as expected", without
the received value, does not discharge this task.

Commit the RED test on its own so the red state is in history:
`test(quick-260821-nyh): RED — resumed install with non-empty reconciled-skip set terminates at 1%, not 100%`
  </action>
  <verify>
1. `pnpm test -- src/backend/storeManagers/steam/__tests__/depot.test.ts -t "reconciled-skip"`
   → the new test FAILS, and the output contains `Expected: 100` with a Received value
   strictly less than 100 (expected: 1).
2. The anti-vacuity assertion (fetchChunk called once) PASSES within that run — i.e. the
   test fails on the percent assertion, NOT on the skip-set assertion. If it fails on the
   skip assertion instead, the fixture is wrong (size/sha mismatch, or the file was written
   to the wrong path) and the red observation is invalid — fix the fixture and re-run
   before proceeding.
3. The rest of `depot.test.ts` still passes (only the one new test is red).
4. `git log -1` shows the red test committed with the captured failure output in the body.
  </verify>
  <done>
The regression test exists, has been OBSERVED failing against the current unfixed
expression with the actual received percent recorded verbatim, its anti-vacuity assertion
passed in that same run, and the red state is committed.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Surface skippedBytes from reconcile, seed doneBytes with it, keep rate/ETA run-scoped — test goes green</name>
  <files>
src/backend/storeManagers/steam/depot/reconcile.ts,
src/backend/storeManagers/steam/depot.ts,
src/backend/storeManagers/steam/__tests__/reconcile.test.ts
  </files>
  <behavior>
    reconcilePartialState now returns `skippedBytes`:
    - fresh install / nothing on disk → `skippedBytes === 0`
    - every plan entry verified → `skippedBytes === plan.totalBytes`
    - partial → the summed `Number(file.size)` of exactly the entries that hit the
      `if (verified) continue` branch (:150), using the SAME expression plan-build uses
      at depot.ts:799, so `skippedBytes <= plan.totalBytes` holds by construction
    - Directory/Symlink/zero-size verified entries contribute their own `Number(file.size)`
      (typically 0) — no special-casing, because plan-build did not special-case them either

    downloadDepotFiles:
    - `doneBytes` starts at `reconciledSkippedBytes`, so `percent` means "bytes of the plan
      present on disk / plan bytes" at every one of its three consumers
      (log stats :2144-2145, throttle delta :2236-2237, WR-03 clamped bus percent :2292-2297)
    - `lastEmitBytes` ALSO starts at `reconciledSkippedBytes`, so the first emit window's
      delta is the bytes written in that window, not the whole seed
    - the ETA's cumulative average rate stays RUN-scoped (bytes this run / elapsed), so a
      resume does not report a fabricated rate or a near-zero ETA on its first emit
    - the reconcile-failure fallback (:1996-2012, full job list rebuilt) seeds 0 —
      behaviourally identical to today
    - `remaining = totalBytes - doneBytes` (:2272) now correctly means "plan bytes not yet
      on disk" — an intended improvement, not a regression
    - `bytes: getFileSize(doneBytes)` (:2298) now reports plan bytes on disk, consistent
      with the percent beside it — intended
    - the WR-03 clamp (:2296) STAYS. `skippedBytes <= totalBytes` makes the seed itself
      safe, but written bytes can still overshoot, which is the case that comment describes.
  </behavior>
  <action>
**reconcile.ts** — add `skippedBytes: number` to `ReconcileResult` (:38-49) with the doc
comment from `<interfaces>`. Add `let skippedBytes = 0` beside the locals at :130-131. At
the `if (verified) continue` branch (:150) accumulate before continuing:

    if (verified) {
      skippedBytes += Number(file.size)
      continue
    }

Return it at :157. Use `Number(file.size)` verbatim — `size` may be a string or bigint-ish
from the manifest, and this is the exact coercion `plan.totalBytes` was built with
(depot.ts:799). Do NOT use `file.chunks` sizes; they are compressed/original chunk sizes
and would not sum to the same denominator.

**depot.ts** — at the reconcile call site (:1985-2012), hoist a
`let reconciledSkippedBytes = 0` beside the `let jobs` declaration and set it from the
successful branch:

    const reconciled = await reconcilePartialState(plan, installRoot)
    jobs = reconciled.jobs
    reconciledSkippedBytes = reconciled.skippedBytes

Leave the `catch` fallback untouched — `reconciledSkippedBytes` stays 0 there, which is
correct because that path re-downloads everything.

At :2039-2041 seed both counters and record the run baseline:

    // quick-260821-nyh: `doneBytes` means "plan bytes present on disk", NOT "bytes this
    // run wrote" — it is seeded with the reconciler's skip total so the numerator and the
    // plan-scoped `totalBytes` denominator measure the SAME set. Without this a resumed
    // install starts at 0% and terminates short of 100% (HUMANKIND 1124300 finished a
    // fully successful resume reading 76%). `runStartBytes` keeps the ETA's rate
    // numerator run-scoped; `lastEmitBytes` is seeded so the first emit window's delta is
    // this window's writes, not the whole seed.
    const runStartBytes = reconciledSkippedBytes
    let doneBytes = reconciledSkippedBytes
    ...
    let lastEmitBytes = reconciledSkippedBytes

At :2271 make the cumulative-average rate run-scoped:

    const avgBytesPerSec = elapsedSec > 0 ? (doneBytes - runStartBytes) / elapsedSec : 0

Do NOT touch :2272 (`remaining`) or :2273 (`etaSec`) — with a run-scoped rate and a
plan-scoped remaining, the ETA now correctly estimates the REMAINING work at the CURRENT
run's rate. Do NOT touch :2258-2262 (`lastDiskSpeed`) — it is already a
`doneBytes - lastEmitBytes` window delta and both terms shift by the same constant.

Do NOT change: the census at :2426, `healReconciledFileModes`, the reconcile skip decision,
mode application, or anything in the finalize/StateFlags path. This change is
reporting-only per the todo's explicit scope.

**reconcile.test.ts** — add unit coverage for the new field: `skippedBytes === 0` when
nothing is on disk, and the correct partial sum when some entries verify. Assert the
partial SUM (a specific number), not merely `> 0` — a `> 0` assertion would pass against
an implementation that counted files instead of bytes, which is precisely the
file-count-vs-bytes confusion the todo warns about (82.6% of files was only ~24% of bytes).

Commit:
`fix(quick-260821-nyh): GREEN — seed doneBytes with reconciled-skip bytes so a resumed Steam install reaches 100%`
  </action>
  <verify>
1. RED→GREEN on the SAME test, same command as Task 1:
   `pnpm test -- src/backend/storeManagers/steam/__tests__/depot.test.ts -t "reconciled-skip"`
   → now PASSES. Record both readings in the SUMMARY as a pair: "Task 1 red: Expected 100,
   Received 1 → Task 2 green: pass". A bare "test passes" does not discharge this.
2. Fresh-install regression: the pre-existing percent tests still pass unchanged, proving
   the seed is 0 when nothing is skipped —
   `pnpm test -- src/backend/storeManagers/steam/__tests__/depot.test.ts`
   (the :3252 SUMMED-denominator test must still assert `percent === 1`, and the :3854
   WR-03 clamp test must still pass).
3. `pnpm test -- src/backend/storeManagers/steam/__tests__/reconcile.test.ts` passes,
   including the new exact-sum `skippedBytes` assertions.
4. `pnpm test -- src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts` passes
   — it drives downloadDepotFiles end to end into finalizeToSteam, so it is the closest
   guard that the StateFlags=4 path is untouched.
5. `pnpm codecheck` (`tsc --noEmit`) is clean. THIS STEP IS MANDATORY AND NON-SKIPPABLE:
   ts-jest in this project is TRANSPILE-ONLY, so a green jest run says NOTHING about a type
   error introduced by the new `ReconcileResult` field or the seeded locals.
6. `grep -n "skippedBytes" src/backend/storeManagers/steam/depot/reconcile.ts` and
   `grep -n "reconciledSkippedBytes\|runStartBytes" src/backend/storeManagers/steam/depot.ts`
   both return hits, and `git diff` touches no file outside the four in `files_modified`.
  </verify>
  <done>
`reconcilePartialState` returns a byte-accurate `skippedBytes`; `downloadDepotFiles` seeds
`doneBytes` and `lastEmitBytes` with it while the ETA rate stays run-scoped; the Task 1
test is green on the same command that showed it red; the fresh-install percent tests, the
reconcile unit tests, the finalize end-to-end test, and `pnpm codecheck` are all clean.
  </done>
</task>

</tasks>

<verification>
Goal-backward check — does this plan deliver "a resumed Steam depot install reports honest
progress and reaches 100%"?

- The 0%-start half: `doneBytes` starts at the plan bytes already on disk, so the first
  emit reports the real resumed fraction. ✓
- The never-reaches-100 half: numerator and denominator are now both plan-scoped, so the
  terminal reading is 100 (clamped). Directly asserted by the Task 1 test. ✓
- Anti-vacuity: the test's skip set is non-empty AND that non-emptiness is itself asserted
  (`fetchChunk` called exactly once), so the test cannot pass by silently degenerating into
  a fresh-install case — the one scenario the todo names as unable to distinguish the two
  implementations. ✓
- Red-before-green: Task 1 is a standalone task whose `done` field requires an OBSERVED
  failure with the received value recorded, committed separately. Task 2's `verify` names
  the red→green pair explicitly, not "test passes". ✓
- Measuring the right property: the assertion is on the terminal `progress.percent` from
  the actual `sendProgressUpdate`/`progressUpdate` payload the UI consumes — the real
  user-visible surface — not on an internal counter that merely correlates with it. ✓
- Type safety despite transpile-only ts-jest: `pnpm codecheck` is a named, non-skippable
  verify step. ✓
- Scope discipline: reporting-only. The reconcile skip decision, mode healing, finalize,
  and StateFlags=4 are explicitly listed as untouched, and `depot.finalize.test.ts` is run
  as the guard. ✓
- Collateral consumers: all three consumers of the percent expression (log stats :2144,
  throttle delta :2236, WR-03 bus percent :2292) receive the seeded value consistently, and
  the two derivations that must stay run-scoped (`avgBytesPerSec`, the `lastDiskSpeed`
  window) are each handled explicitly rather than left to chance. ✓

Residual risk accepted: the log-stats percent at :2144-2145 is unclamped (unlike the bus
percent at :2296). The seed cannot cause an overflow there (`skippedBytes <= totalBytes` by
construction), and the pre-existing overshoot case is unchanged, so this is deliberately
left alone as out of scope.

On completion, move
`.planning/todos/pending/2026-08-19-resumed-install-progress-percent-starts-at-zero-and-never-reaches-100.md`
to `.planning/todos/completed/` and set `status: CLOSED`.
</verification>
