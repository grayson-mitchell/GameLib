---
phase: quick-260927-tpm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - .planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md
  - .planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md
autonomous: true
requirements:
  - QUICK-260927-TPM
estimate:
  tokens: 95000
  raw_tokens: 60000
  tasks: 2
  confidence: med
must_haves:
  truths:
    - "**The aggregate line's count matches the noun it uses.** `downloadSteamDepots`' `logError` line reports `N file failure(s)` where N is the number of FILE-level failures, not `N+1`. Measured by feeding the exported formatter an array of N file-level records plus one run-level record and asserting the emitted string contains `N file failure(s)` and does NOT contain `N+1 file failure(s)`."
    - "**The run-level record is still in `failures` and every completeness gate still fails closed on it.** `canWriteFullOwnership` with a single run-level-only failure returns `false`. `downloadDepotFiles`' `allFilesVerifiedThisRun` and `allModesApplied` are both `false` on a run whose only failure is run-level. Nothing filters the run-level record out of any gate input - the ONLY consumer that partitions is the aggregate log line."
    - "**The run-level record is surfaced, not dropped.** The corrected line carries a dedicated run-level fragment whenever a run-level record is present, so the honest reason the run stopped (and its `giving up with N file(s) unattempted` count) stays in the log. Pinned in both directions: present when a run-level record exists, ABSENT when only file-level failures exist."
    - "**`first: file=\"...\"` names a file that actually failed.** Derived from the first FILE-level record when one exists, falling back to `failures[0]` only when the run-level record is the sole failure. This closes the case-C misattribution in which the run sentinel currently displaces every real file failure in that fragment."
    - "**The partition reads the property, never the sentinel string.** A synthetic run-level record whose `file` field is an ordinary filename still partitions as run-level. Pinned by a dedicated test arm, and by an exact-count gate that `'(run)'` has exactly ONE non-comment occurrence in `depot.ts` (the push-site value) - no code branches on it."
    - "**The real run produces the array shape the formatter test feeds it.** A `downloadDepotFiles` run driven by an injected virtual-clock `StallTracker` with 32 whole-file-sha1-mismatch files plus a tail yields `failures.length === 33`: exactly 32 records with no `scope` and exactly 1 with `scope === 'run'` whose `file` is the run sentinel. At least one tail file is absent from disk, proving the run genuinely gave up rather than draining the queue. This is what makes the formatter test non-vacuous."
    - "**The pre-existing end-to-end anchor stays green UNMODIFIED.** `depot.test.ts`'s T-D4 test (currently at `:2337`-`:2380`) drives the real `downloadSteamDepots` and asserts the emitted string contains `1 file failure(s)`. It has 1 file failure and 0 run-level records, so the corrected formatter emits the identical substring. It is the proof that the formatter's output is what actually reaches the log; it must NOT be edited to accommodate the change."
    - "**`classifyDepotError`'s input is byte-for-byte unchanged.** The call stays `result.failures[0].cause ?? result.failures[0].error`. The W-2 classification pins in `depot.test.ts` (`:3294` and `:3309`) are untouched and still green. The ordering non-determinism of `failures[0]` is named as a residual, not silently changed - see the `<decision_record>` D-C."
    - "**Shape unchanged.** `DepotDownloadFailure` gains one OPTIONAL field. No function signature's array shape changes, `failures` is not split into two arrays, and no existing required field becomes optional. All four existing producers keep compiling untouched (absent `scope` means file-level, which is correct for every one of them)."
    - "`npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam'` passes with a test count strictly greater than the 1506 at HEAD. `pnpm codecheck` exits 0. `pnpm lint` exits 0 with BOTH ceilings passing. `pnpm find-deadcode` reports `unreachable: 46 OK | used-in-module: 0 OK`. `npx prettier --check` over the two exact written source paths exits 0."
    - "**The RED was measured, not inferred.** Each new assertion is run once against the pre-fix source and its actual failure output recorded in the SUMMARY. A test that cannot be shown red is not a pin."
    - "`pnpm planning-gates` passes at its HEAD count. The todo is moved to `.planning/todos/completed/` with a resolution note naming `260927-tpm` and the commit, and that note is asserted present in the **git index** (`git show :<path>`), not merely in the working tree."
  artifacts:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - .planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md
  key_links:
    - "**The locked decision is TAG, not SPLIT.** Add a property marker to the `DepotDownloadFailure` record so consumers can partition it. Do NOT split `failures` into two arrays. Do NOT change any function signature's array shape. This is consistent with how `.eresult` / `.code` / `isStall` are already used as property markers on this exact path (`installStallWatchdog.ts:51,56,60`; stamped at `depot.ts:2684`). Do not re-open it."
    - "**The run-level record STAYS in `failures`.** It is a real failure. `canWriteFullOwnership` (`depot.ts:1264`) and the three post-loop verdicts (`:2868`, `:2906`, `:2941`) and the error-path entry gate (`:3424`) all read the UNFILTERED array and MUST keep doing so. The marker is a partition key for ONE consumer - the aggregate log line at `:3446` - and an escape hatch for nothing."
    - "**A run-level stall is NOT armable through `downloadSteamDepots`.** Measured at HEAD: its opts are `{ targetSteamappsDir, installdir, os }` - it constructs its own tracker at `depot.ts:2318` (`opts.stallTracker ?? new StallTracker()`) and accepts none from its caller. So the end-to-end harness that already asserts the aggregate string (T-D4, `depot.test.ts:2337`) cannot drive a run-level stall. That measurement, not preference, is why the message construction is extracted into an exported pure function and tested directly. Widening the production orchestrator's signature for a test is scope the locked decision forbids."
    - "**`pnpm find-deadcode`'s `used-in-module` population is at 0 identities, FROZEN, may only shrink, and has NO regeneration command.** A new export from `depot.ts` used ONLY inside `depot.ts` turns it RED with no sanctioned fix but a source change. The new export is deadcode-safe ONLY because `depot.test.ts` imports it - the exact `canWriteFullOwnership` precedent (exported at `:1253`, used internally, imported at `depot.test.ts:47`, in NEITHER baseline). If the test import is ever dropped, the export must be dropped with it."
    - "**`TESTS_CEILING = 638` is EXACT with ZERO headroom** (`meta/lintScoped.cjs:59`; `SRC_CEILING = 1124` at `:58` had 17 of headroom at last measurement). One new lint warning in `depot.test.ts` turns `pnpm lint` red. The documented trap on this exact path: an `async () => { throw ... }` mock costs a `@typescript-eslint/require-await` warning - return an already-rejected promise instead."
    - "**Do NOT drive per-file failures with a rejecting `fetchChunk` mock.** Documented in situ at `depot.test.ts` (the `per-file failure diagnostics` NOTE, currently `~:4036`): `downloadFileChunks` RE-QUEUES a failed chunk until `STALL_TIMEOUT_MS` elapses, so a rejecting mock spins for the full window and OOMs the worker rather than producing one failure. Drive failures by whole-file sha1 mismatch (`sha_content` deliberately wrong, `fetchChunk` RESOLVING), which is what every existing failure test in the file does."
    - "**`git mv` commits HEAD content and drops unstaged edits.** Make the resolution-note edit, then `git add` it, then run the gates, then commit - in ONE sequence - and assert the note is in the INDEX with `git show :<path>`, never with a working-tree grep. A plain `mv` of a planning file can crash a planning gate until the move is staged."
    - "**`.planning/todos/` is prettier-IGNORED** (measured this session: the todo path reports `{ \"ignored\": true, \"inferredParser\": null }`). A `--check` over it exits 0 while matching zero files. Task 2 states that vacuity explicitly and OMITS the check rather than carrying a green that proves nothing. `.planning/todos/completed/` is also deliberately exempt from the todo frontmatter gate, so the frontmatter keys need no change on move."
---

<objective>
Correct the one diagnostic-log miscount named as a residual under specialist review finding I-1 of
`.planning/debug/resolved/depot-stall-bound-did-not-fire.md`: `downloadSteamDepots`' aggregate
error line reports `${result.failures.length} file failure(s)`, and since `62f916e58` that array
also carries the RUN-level stall record - so it reads N+1 for N failed files.

Purpose: a counter that does not mean what its name says, in a repo that has been burned
repeatedly by trusting a counted population. It is a miscount in a diagnostic log, not a
behavioural defect - and the fix must stay that narrow.

Output: an optional `scope` marker on `DepotDownloadFailure`, a corrected and more informative
aggregate line, three test arms that would have caught the miscount plus a fail-closed pin, and
the todo closed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md
@.planning/debug/resolved/depot-stall-bound-did-not-fire.md

Project skill: `Skill("spike-findings-gamelib")` - Steam depot work.

Read these exact regions of `src/backend/storeManagers/steam/depot.ts` before editing (do not read
the whole 3500-line file; these are the only regions in scope):

- `:1211`-`:1240` - `interface DepotDownloadFailure` and `interface DepotDownloadResult`
- `:1253`-`:1270` - `canWriteFullOwnership` (the gate that MUST keep failing closed)
- `:2640`-`:2710` - the run-level stall push (the `runStallRecorded` latch, the `StallError`
  construction, `file: '(run)'`)
- `:2770`-`:2805` - the per-file catch push and the `FAILURE_LOG_CAP` logging caps
- `:3420`-`:3460` - `downloadSteamDepots`' aggregate `logError` line (the defect)
- `:101` (`FAILURE_LOG_CAP = 10`), `:115` (`describeDepotFailure`), `:992` (`FILE_CONCURRENCY = 32`)

And of `src/backend/storeManagers/steam/__tests__/depot.test.ts`:

- `:2337`-`:2385` - the T-D4 end-to-end anchor that drives real `downloadSteamDepots` and asserts
  `'1 file failure(s)'`. DO NOT EDIT IT. It is the proof the formatter's output reaches the log.
- `:3765`-`:3800` - `VirtualClockStallTracker` (window 36 ticks, zero-byte files, all succeed)
- `:3930`-`:4030` - `ReadDrivenStallTracker` and the W-1 arm asserting the stall does NOT fire
- `:4030`-`:4060` - the `per-file failure diagnostics` NOTE and `mismatchedPlan()` helper: the
  documented way to produce a per-file failure

And `src/backend/storeManagers/steam/depot/stallTracker.ts:57`-`:90` - `hasStalled(now)` is
`now - lastProgressAt > stallTimeoutMs`, a STRICT `>`.
</context>

<census>
## Live census, measured this session at HEAD `ee06a3713` (2026-09-27)

The line numbers in the todo body (`:1228 :2596 :2602 :2673 :2711 :2746 :3229`) are from a
PREDATING census and have shifted. They are superseded by this table and MUST NOT be reused. This
census - not STATE.md, not the todo, not the debug session - is the edit authority for this plan.

Command: `grep -rn "failures\.length" src/ --include='*.ts' --include='*.tsx'` (population: all
tracked `.ts`/`.tsx` under `src/`, test files INCLUDED).

### `failures.length` in `depot.ts` - 11 hits, 3 of them prose comments

| line | what it is | disposition |
|---|---|---|
| 1008 | prose comment | unchanged |
| **1264** | `canWriteFullOwnership`: `opts.failures.length === 0` | **UNCHANGED - must keep failing closed** |
| 2601 | prose comment | unchanged |
| 2791 | `failures.length <= FAILURE_LOG_CAP` | named residual, unchanged (D-D) |
| 2797 | `failures.length === FAILURE_LOG_CAP + 1` | named residual, unchanged (D-D) |
| 2845 | prose comment | unchanged |
| **2868** | `allModesApplied` verdict | **UNCHANGED** |
| **2906** | `runLooksComplete` verdict | **UNCHANGED** |
| **2941** | `allFilesVerifiedThisRun` verdict | **UNCHANGED** |
| **3424** | `if (result.failures.length)` - error-path entry gate | **UNCHANGED** (a run-level-only failure must still enter the error path) |
| **3446** | `${result.failures.length} file failure(s)` | **THE DEFECT - the only site corrected** |

Outside `depot.ts`, `failures.length` hits are unrelated local variables and are NOT in scope:
`src/backend/humble/user.ts:1054`, `src/frontend/screens/Library/components/InstallModal/__tests__/steamSectionGating.test.ts:394` and `:400`.
Test-file prose references: `depot.test.ts:3616`, `:5525`.

### `DepotDownloadFailure` - producers and readers

Command: `grep -rn "DepotDownloadFailure" src/ --include='*.ts' --include='*.tsx'` - 22 hits.

Producers (4 arrays / 3 push kinds):
- `:2113` `healReconciledFileModes` - mode-application failures. **FILE-level.**
- `:2251` `downloadDepotFiles`' own `failures` array declaration
- **`:2696` the run-level stall push** (`file: '(run)'`, `cause: StallError`) - the ONLY run-level
  producer in the codebase
- `:2774` the per-file catch push. **FILE-level.** (The per-file traversal/sha1 producer noted at
  `:2210` and `~:1471` throws and lands here.)

Readers: `:1229` (`DepotDownloadResult.failures`), `:1257`/`:1264` (`canWriteFullOwnership`),
`:2997` (`finalizeToSteam` opts), `:3424`/`:3435`/`:3446`/`:3448`/`:3451` (`downloadSteamDepots`).
Type imported by tests at `depot.test.ts:63`, `:1743`, `:1793`, `:1797`.

### The `'(run)'` sentinel - 2 live sites, zero predicates

Commands: `grep -rn "'(run)'" src/ --include='*.ts'` and the double-quoted form.
- `depot.ts:2696` - the value
- `depot.ts:2688` - prose comment about it (the I-1 note)
- `depot.test.ts:4016` - a comment quoting a RED measurement
- (`jestGlobalSetup.test.ts:99` `existsSync(run)` is an unrelated variable named `run` - not a hit.)

**Nothing anywhere branches on the string.** That is the property the new marker must preserve.

### The `isStall` property-marker precedent this fix copies

`installStallWatchdog.ts:51` (`isStall: true`), `:56`-`:60` (`isStallError()` predicate), `:122`.
Consumed at `downloadmanager/utils.ts:277` and in `depotErrors.ts`'s W-2 branch. Stamped onto the
run-level error at `depot.ts:2684`.

### Other measured facts

- `FILE_CONCURRENCY = 32` (`depot.ts:992`) - un-exported DELIBERATELY per review I-2. The test
  hardcodes 32 with a comment naming the coupling, exactly as the two existing harnesses do.
- `FAILURE_LOG_CAP = 10` (`depot.ts:101`, exported). `describeDepotFailure` exported at `:115`.
- `stallTracker = opts.stallTracker ?? new StallTracker()` at `:2318`; `runStallRecorded` latch
  declared at `:2577`.
- `StallTracker.hasStalled(now)` is `now - lastProgressAt > stallTimeoutMs` - STRICT `>`.
- `downloadSteamDepots` opts are `{ targetSteamappsDir, installdir, os }` - **no `stallTracker`**.
- `meta/deadcode-baseline-used-in-module.txt` is at **0 identities**, frozen, may only shrink, no
  regeneration command. `meta/deadcode-baseline-unreachable.txt` is 158 lines / 46 identities.
- `meta/lintScoped.cjs:58`-`:59`: `SRC_CEILING = 1124`, `TESTS_CEILING = 638`.
- `npx prettier --file-info` (prettier 3.7.4), measured one path per invocation because the flag
  refuses multiple files (`[error] Cannot use --file-info with multiple files`):
  - `src/backend/storeManagers/steam/depot.ts` -> `{ "ignored": false, "inferredParser": "typescript" }`
  - `src/backend/storeManagers/steam/__tests__/depot.test.ts` -> `{ "ignored": false, "inferredParser": "typescript" }`
  - the todo `.md` under `.planning/todos/pending/` -> `{ "ignored": true, "inferredParser": null }`
- `npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam'` resolves (project
  `displayName: 'Backend'`, `src/backend/jest.config.js:5`). HEAD baseline from the debug session's
  own battery: **44 suites, 1506 tests**. The `worker process has failed to exit gracefully`
  warning is PRE-EXISTING - reproduce it at HEAD before attributing it to this change.
</census>

<decision_record>
## D-A. Marker shape: `scope?: 'run'`

Add one OPTIONAL field to `DepotDownloadFailure`:

```
scope?: 'run'
```

Absent means file-level. That default is correct for all three existing file-level producers
without touching one of them, and a future producer that forgets the field defaults to the safe
majority meaning rather than to a special case. A string union rather than a boolean so a future
third scope (depot-level, say) is expressible without a second boolean fighting the first.

## D-B. The `'(run)'` sentinel: KEEP it, and make `scope` the sole discriminant

The plan was asked to reason either way, so both ways:

**Against keeping it.** Two encodings of one fact is a maintenance trap, and this exact sentinel
has already shipped a bug - review I-1 found `file: queue[0]?.file.filename ?? '(run)'` naming an
UNATTEMPTED file as the failing one, with a dead `??` branch.

**For keeping it.** The two are not the same layer. `file` is a required `string` that must hold
SOMETHING, and a run-level event has no filename; `'(run)'` is the display placeholder for an
absent field. `scope` is the machine-readable discriminant. Removing the sentinel forces either
`file: ''` - strictly worse for an operator reading `first: file=""` - or making `file` optional,
which is a widening of an exported interface with four producers and five readers and exactly the
shape change the locked decision forbids.

**Decision: keep both. `scope` is the ONLY thing any code may branch on.** Mitigations for the
trap, both required: (1) an in-situ comment at the push site stating that `scope` is the
discriminant and `'(run)'` is display-only, and (2) a test arm proving a run-level record whose
`file` is an ordinary filename still partitions as run-level - i.e. proving nothing greps the
string. Plus the exact-count gate in Task 1's `<verify>`.

## D-C. `failures[0]` ordering: the classifier input does NOT change

Three orderings are reachable, read off the code rather than assumed:

- **(A) Tracker already stalled at construction.** The run-level record is `failures[0]` and the
  only element. There is already a test for this shape (the review's `coverage gap` arm).
- **(B) Per-file failures land before the window elapses.** `failures[0]` is file-level; the
  run-level record lands later.
- **(C) The window elapses with files in flight but none failed yet.** A worker's top-of-loop
  consult pushes the run-level record as `failures[0]`; the in-flight files then drain through
  their own per-chunk guards and append file-level records AFTER it.

So `failures[0]` is genuinely non-deterministic. What this plan does about it:

- **`classifyDepotError`'s input stays `result.failures[0].cause ?? result.failures[0].error`,
  byte-for-byte unchanged.** It decides the user-facing error string, which is outside the locked
  scope (only the aggregate LOG line is in scope). Preferring `fileFailures[0]` would regress W-2
  in case C - a stalled run whose in-flight files then failed with `ECONNRESET` would classify as
  `connectionDropped` instead of `stalled`. Preferring the run-level record would change case B's
  user-facing message. Neither is a log-line correction. The non-determinism is recorded as a
  named residual and gets a follow-up todo (Task 2).
- **`first: file="..."` IS re-derived** - from the first FILE-level record when one exists, falling
  back to `failures[0]` when the run-level record is the sole failure. Different fragment, different
  contract: `first:` answers "which file failed", and I-1 already established that naming a
  non-failing entry there is a bug. In case C the sentinel currently displaces every real file
  failure in that fragment, destroying the only per-file detail the line carries.
- **The run-level record is surfaced by its own fragment** whenever one is present. This is what
  keeps the classifier's actual input visible in the same line even though `first:` may now name a
  different record, and it carries the honest `giving up with N file(s) unattempted` count. An
  operator can reconstruct the whole picture from one line: the file count, the classification key,
  the first real file failure, and the run-level reason.

## D-D. `FAILURE_LOG_CAP` (`:2791`/`:2797`): observed, deliberately NOT changed

Once the run-level record is in the array, a still-in-flight worker's per-file catch reads a length
inflated by one, so the cap trips one per-file failure early. Not fixed, on three grounds:
(1) the locked scope is the aggregate line only; (2) a cap is a throttle, not a count claim - its
whole magnitude is one suppressed log line; (3) filtering the array inside a hot catch is O(n) per
failure, i.e. O(n^2) for a 19k-file title, a worse trade than the line it saves.

Recorded in an in-situ comment. **And it repairs an accidental lie:** that cap's existing comment
already asserts "the aggregate at the throw site always reports the true total", which was FALSE
before this fix and becomes TRUE after it. Update the comment to say so rather than leave it.

## D-E. Test seam: ONE new export, because the stall is not armable end-to-end

`downloadSteamDepots` accepts no `stallTracker` (measured - see `<census>`), so the harness that
already asserts the aggregate string cannot arm a run-level stall, and widening the production
orchestrator's signature for a test is scope creep. So the message construction is extracted into
one exported pure function that the log line calls and the test imports.

Deadcode-safe ONLY via the test import (`canWriteFullOwnership` precedent). Non-vacuity anchor: the
pre-existing T-D4 end-to-end test proves the formatter's string is what actually reaches the log.

## D-F. Assumption-delta (advisory; detector returned `{"skipped":true,"reason":"phase_unresolved"}`)

Recorded because the substance applies even though the detector could not resolve a phase section
for a quick task. The `failures` array's member noun pluralises from one kind to two. Primary noun:
`DepotDownloadFailure`, unchanged. Decision: **add-alongside**, deliberately - the locked decision
is tag-not-split precisely so every completeness gate keeps reading ONE unfiltered array and fails
closed. Accepted debt: consumers must partition at the point of use. What would force a later
promote: a third scope, or any consumer needing the two populations as separate typed collections.

## Detectors run at planning time

- `api-coverage.cjs --json` over the task scope -> `{"detected":false,"signals":[]}` (no `skipped`
  key). No external API integration. Checkpoint skipped per its own text; no `COVERAGE.md`.
- `assumption-delta scan --json` -> `{"skipped":true,"reason":"phase_unresolved"}`. Skipped per its
  own text; substance recorded above anyway.
- Schema-push scan: no `prisma/`, `drizzle/`, `supabase/`, `src/collections/`, `src/entities/`,
  `src/db/schema.ts` in the repo. Skipped silently.
</decision_record>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: tag the run-level failure, correct the aggregate line, and pin both with a measured RED</name>
  <files>src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/__tests__/depot.test.ts</files>

  <behavior>
  Write these assertions FIRST and measure each one RED against the pre-fix source before writing
  any production code. Record the actual failure output for each in the SUMMARY - an assertion that
  cannot be shown red is not a pin.

  **A1 - the N+1 pin (the assertion this task exists for).** Feed the new exported formatter an
  array of N file-level records (no `scope`) plus one run-level record (`scope: 'run'`), with a
  known N of at least 2. The emitted string contains `N file failure(s)` and does NOT contain
  `(N+1) file failure(s)`. RED pre-fix: the line reports N+1.

  **A2 - `first:` names a real file.** In the same A1 arm, the `first: file="..."` fragment names
  one of the N file-level records, not the run sentinel - including when the run-level record is
  `failures[0]` (ordering case C). RED pre-fix in the case-C ordering: it names the sentinel.

  **A3 - the run-level record is surfaced, both directions.** With a run-level record present the
  string carries the run-level fragment including its `giving up with ... unattempted` text. With
  ONLY file-level failures the fragment is ABSENT - so it is conditional, not unconditional
  boilerplate. RED pre-fix on the first half: the fragment does not exist.

  **A4 - run-level-only.** An array whose sole member is run-level emits `0 file failure(s)`, still
  carries the run-level fragment, and its `first:` fragment falls back rather than being empty.

  **A5 - the partition reads the property, not the sentinel.** A run-level record whose `file` is
  an ordinary filename (NOT the sentinel) still counts as run-level; a file-level record whose
  `file` happens to equal the sentinel string still counts as file-level. This is the arm that
  proves no code greps the string.

  **A6 - the real run produces that shape.** At `downloadDepotFiles` scope with an injected
  virtual-clock `StallTracker`: `failures.length === 33`, exactly 1 record has `scope === 'run'`
  and its `file` is the sentinel, exactly 32 have no `scope`, and at least one tail file is absent
  from disk. Makes A1-A5 non-vacuous.

  **A7 - fail closed.** `canWriteFullOwnership` with `outcome: 'completed'`, a valid `buildid`,
  `allFilesVerified: true`, `allModesApplied: true` and `failures: [<one run-level record>]`
  returns `false`. And on the run-level-only run at `downloadDepotFiles` scope,
  `allFilesVerifiedThisRun` and `allModesApplied` are both `false`. The marker must not have become
  a filtering escape hatch.
  </behavior>

  <action>
  Source changes, all in `src/backend/storeManagers/steam/depot.ts`:

  1. Add the optional `scope` field to `DepotDownloadFailure` per D-A, with a doc comment in the
     house style of the existing `cause` comment: what absent means, why it is a property marker
     rather than a second array, and a pointer to this quick task id and to review finding I-1.
     Do not touch `file`, `error` or `cause`.

  2. At the run-level stall push (`~:2696`), set the new field on that record. Extend the existing
     I-1 comment block to state that the new field is the discriminant every consumer must branch
     on and that the run sentinel in the `file` position is a display placeholder for an absent
     filename - never a predicate. Per D-B.

  3. Add ONE exported pure function to `depot.ts` that builds the aggregate message string. It
     takes the appId, the failures array, and the already-computed classification key, and returns
     the exact string `logError` emits. Inside it: partition on the new field; report the
     FILE-level count against the `file failure(s)` noun; derive the `first:` fragment from the
     first file-level record, falling back to element 0 when no file-level record exists; and
     append a distinct run-level fragment when and only when a run-level record is present. It may
     use the already-exported `describeDepotFailure`. Give it a doc comment naming D-E's reason it
     is exported at all (the orchestrator accepts no injectable tracker, so this is the only
     testable seam) and the `used-in-module` ratchet consequence if the test import is ever dropped.

  4. Replace ONLY the template literal at `:3446` with a call to that function. Leave the
     `classifyDepotError(result.failures[0].cause ?? result.failures[0].error)` call above it
     untouched, and add a short comment naming D-C: the classifier input is deliberately still
     element 0, the ordering is non-deterministic, and that residual is tracked separately.

  5. At the `FAILURE_LOG_CAP` site (`~:2791`), add a comment recording the off-by-one per D-D with
     its three reasons, and correct that comment's existing claim about the aggregate reporting the
     true total so it says the claim holds as of this change rather than asserting it unqualified.

  Change nothing at `:1264`, `:2868`, `:2906`, `:2941` or `:3424`. No signature's array shape
  changes. Do not split `failures`.

  Test changes, all in `src/backend/storeManagers/steam/__tests__/depot.test.ts`:

  6. Add a `describe` for the formatter carrying arms A1-A5, importing the new export by name
     alongside the existing `canWriteFullOwnership` import. Synthetic arrays only - no harness.

  7. Add the A6 arm. Model it on the existing `VirtualClockStallTracker` class: subclass
     `StallTracker`, advance a virtual clock by a fixed tick on each `hasStalled()` consult, and
     inject it through `downloadDepotFiles`' `stallTracker` opt. Plan: 32 files whose `sha_content`
     is deliberately wrong (so the whole-file check rejects) plus a tail of 8 whose paths you then
     assert absent. `fetchChunk` must RESOLVE, never reject - see the key_links note.

     Choose the window so the first full worker pass does not trip the bound and the first
     second-pass consult does. The grounding: all 32 workers run synchronously to their first await,
     so the first pass makes 32 back-to-back consults before any file can fail, and `hasStalled` is
     a STRICT `>`. **MEASURE this, do not assume it.** Assert the exact population (32 file-level,
     1 run-level, 33 total); if the split comes out differently, retune the window and record the
     measured tick numbers in a comment the way the existing harness does. Add a non-vacuity
     assertion that the clock really crossed the window, in the style of the `ReadDrivenStallTracker`
     arm. Hardcode 32 with a comment naming the `FILE_CONCURRENCY` coupling - it is un-exported
     deliberately per review I-2 and must stay that way.

  8. Add the A7 arms: the `canWriteFullOwnership` unit call, and the two verdict assertions on a
     run-level-only run (reuse or extend the existing already-stalled-at-construction arm's shape).

  Do NOT edit the T-D4 test at `~:2337`-`:2380`. Its `'1 file failure(s)'` assertion must pass
  unchanged - 1 file failure, 0 run-level records - and that is the non-vacuity anchor proving the
  formatter's output reaches the log. If it goes red, the formatter is wrong, not the test.

  Watch the zero-headroom `TESTS_CEILING` (see key_links): no `async` arrow that only throws.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && set -e; echo '=== prettier visibility (proves the --check below is REAL, not vacuous) ==='; for f in src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depot.test.ts; do printf '%s -> ' "$f"; npx prettier --file-info "$f"; npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "UNEXPECTEDLY IGNORED - the check would be vacuous"; exit 1; }; done; echo '=== formatter check over the EXACT written paths (never .) ==='; npx prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depot.test.ts; echo '=== the run sentinel: exactly ONE non-comment occurrence (the push-site value; nothing branches on it) ==='; N=$(grep -v '^[[:space:]]*[/*]' src/backend/storeManagers/steam/depot.ts | grep -c "'(run)'"); echo "non-comment occurrences: $N"; test "$N" -eq 1; echo '=== the five gate lines still read the UNFILTERED array - eyeball for any filter/partition ==='; for L in 1264 2868 2906 2941 3424; do printf '%s: ' "$L"; sed -n "${L}p" src/backend/storeManagers/steam/depot.ts; done; echo '=== typecheck ==='; pnpm codecheck; echo '=== lint, BOTH ceilings (tests ceiling is exact, zero headroom) ==='; pnpm lint; echo '=== deadcode ratchet: expect "unreachable: 46 OK | used-in-module: 0 OK" ==='; pnpm find-deadcode; echo '=== depot suites: total MUST exceed the 1506 measured at HEAD ==='; npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam' 2>&1 | tail -20</automated>
  </verify>

  <done>
  - `DepotDownloadFailure` carries one new optional field; `file`, `error` and `cause` are untouched;
    no function signature's array shape changed; `failures` is not split.
  - The run-level push sets the new field. The five gate sites (`:1264`, `:2868`, `:2906`, `:2941`,
    `:3424`) are byte-identical to HEAD.
  - One new exported pure function builds the aggregate string; `:3446` calls it; the
    `classifyDepotError(...)` call above it is byte-identical to HEAD.
  - Arms A1-A7 all exist and all pass. Each was measured RED against the pre-fix source and its
    actual failure output is recorded in the SUMMARY.
  - The T-D4 test at `~:2337` is unmodified and green.
  - Every command in `<verify>` exits 0. `pnpm find-deadcode` reports `unreachable: 46 OK |
    used-in-module: 0 OK`. The steam suite total is strictly greater than 1506. Any
    `worker process has failed to exit gracefully` warning is reproduced at HEAD before being
    attributed to this change.
  </done>
</task>

<task type="auto">
  <name>Task 2: close the todo, and file the one residual this fix deliberately does not close</name>
  <files>.planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md, .planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md, .planning/todos/pending/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md</files>

  <action>
  Close the actioned todo, in this exact order - the ordering is the point, see below.

  1. `git mv .planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md .planning/todos/completed/`

  2. THEN edit the moved file at its new path, adding a `## Resolution` section that records: the
     quick task id `260927-tpm`; the commit sha; that the chosen shape was the property marker on
     `DepotDownloadFailure` (the todo's own lighter option), NOT an array split; that the run-level
     record deliberately STAYS in `failures` and every completeness gate still fails closed on it;
     the corrected aggregate line's three parts (file-level count, `first:` from the first
     file-level record, a distinct run-level fragment); and the two residuals named-not-closed -
     the `FAILURE_LOG_CAP` off-by-one (D-D, with its three reasons) and the `failures[0]` ordering
     non-determinism feeding `classifyDepotError` (D-C, tracked by the new todo in step 4).
     Also replace the stale seven-site line-number census in the todo's final paragraph - the one
     the todo itself flags as predating the change - with a pointer naming `260927-tpm-PLAN.md`'s
     `<census>` section, so the rotten numbers do not outlive the todo. Same discipline the parent
     debug session applied to its own `ready: human` rationale: rewrite, do not merely tick.

  3. `git add` the moved path AND the deleted pending path, THEN run `pnpm planning-gates`, THEN
     commit - all within one sequence. Doing the edit after the move (step 2 after step 1) is what
     avoids `git mv` committing HEAD content and dropping an unstaged edit; staging before the gate
     run is what avoids a plain move crashing a planning gate. Assert the resolution note is in the
     INDEX with `git show :<path>`, never with a working-tree grep.

  4. File one new todo in `.planning/todos/pending/` for the D-C residual: `classifyDepotError`'s
     input is `result.failures[0]`, whose identity is non-deterministic when a run-level stall
     fires (orderings A/B/C in this plan's `<decision_record>` D-C), so the user-facing error string
     for the same underlying condition depends on arrival order. Include the three orderings, note
     that the aggregate log line now makes the ambiguity visible (both the file count and the
     run-level reason are printed), and name the candidate fix (prefer the run-level record
     deterministically) together with its cost (it changes case B's user-facing message, which is
     why it was out of scope here).

     Per CLAUDE.md the new pending todo MUST carry all three triage keys by hand, in this order
     immediately after each other - the `/gsd-add-todo` template does not emit them and CI goes red
     without them. Values, bare and lowercase: `severity: minor` (a user-facing message that is
     correct-but-arbitrary for one condition), `platform: any`, `ready: code`.
     `.planning/todos/completed/` is deliberately exempt from that gate, so the MOVED file needs no
     frontmatter change.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && set -e; echo '=== prettier: DELIBERATELY OMITTED for this task, and here is the proof it would be vacuous ==='; echo '--- every path this task writes is under .planning/, which .prettierignore covers. A --check over them exits 0 while matching ZERO files: byte-identical output and exit code to a real check. Per CLAUDE.md, omit it rather than carry a green that proves nothing. ---'; for f in .planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md .planning/todos/pending/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md; do printf '%s -> ' "$f"; npx prettier --file-info "$f"; npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*true' || { echo "NOT ignored after all - a real --check IS owed on this path"; exit 1; }; done; echo '=== the move happened: pending gone, completed present ==='; test ! -e .planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md; test -f .planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md; echo '=== the resolution note is in the INDEX, not just the working tree ==='; C=.planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md; INDEXED=$(git show ":$C") || { echo "git show FAILED - the path is not in the index at all; the move was never staged"; exit 1; }; test -n "$INDEXED" || { echo "EMPTY in the index - git mv was not staged with content"; exit 1; }; printf '%s' "$INDEXED" | grep -q '260927-tpm'; printf '%s' "$INDEXED" | grep -q '## Resolution'; echo 'index carries 260927-tpm and a Resolution section: OK'; echo '=== the closed todo now points at this plan census instead of its own stale line numbers ==='; printf '%s' "$INDEXED" | grep -q '260927-tpm-PLAN.md'; echo '=== the new pending todo carries all three triage keys, bare and lowercase, in order ==='; T=.planning/todos/pending/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md; grep -n '^severity: \|^platform: \|^ready: ' "$T"; grep -q '^severity: minor$' "$T"; grep -q '^platform: any$' "$T"; grep -q '^ready: code$' "$T"; echo '=== the todo frontmatter gate and the full planning battery ==='; python3 .planning/todos/todo-frontmatter-gate.py; pnpm planning-gates</automated>
  </verify>

  <done>
  - The todo is at `.planning/todos/completed/` with a `## Resolution` section naming `260927-tpm`
    and the commit sha, and that note is present in the git INDEX (asserted via `git show :<path>`),
    not merely in the working tree.
  - The todo's stale `:1228 :2596 ...` census is replaced by a pointer to this plan's `<census>`.
  - One new pending todo tracks the D-C `failures[0]` ordering residual, carrying
    `severity: minor` / `platform: any` / `ready: code` in that order, bare and lowercase.
  - `python3 .planning/todos/todo-frontmatter-gate.py` is OK. `pnpm planning-gates` passes at its
    HEAD count - any pre-existing failure is reproduced at HEAD and named as pre-existing rather
    than attributed to this task.
  - No prettier check is claimed for this task, and the verify block proves why one would be
    vacuous rather than silently omitting it.
  </done>
</task>

</tasks>

<threat_model>
Security enforcement is active (ASVS level 1, block threshold `high`). This task is a
diagnostic-log correction plus one optional type field in an existing backend module. It adds no
network call, no parser, no filesystem path construction, no IPC surface, no dependency, and no
user input path. The register is short because the surface is, not because it was skipped.

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CDN -> depot download loop | Untrusted remote content and untrusted error text already cross here. This task changes how a failure is COUNTED and LOGGED after that crossing; it introduces no new crossing. |
| depot backend -> log sink | Failure strings, already composed at HEAD from remote error text, are written to the app log. This task changes which fragments are composed, not their provenance. |
| depot backend -> ACF writer (`StateFlags` decision) | The completeness gate deciding `StateFlags=4` vs the safe `1026` verify-handoff reads the `failures` array. This is the one security-relevant boundary the task comes near. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-tpm-01 | Tampering | `canWriteFullOwnership` (`depot.ts:1264`) and the three post-loop verdicts (`:2868`, `:2906`, `:2941`) | high | mitigate | The new marker must not become a filtering escape hatch that lets a stalled run earn `StateFlags=4` and skip Steam's verify pass. Mitigation is structural and pinned: the run-level record STAYS in `failures`, all five gate reads stay byte-identical to HEAD (asserted line-by-line in Task 1's `<verify>`), and arm A7 asserts `canWriteFullOwnership` returns `false` on a run-level-only failure plus both `downloadDepotFiles` verdicts false on that run. |
| T-tpm-02 | Information disclosure | the aggregate `logError` line (`depot.ts:3446`) | low | accept | The new run-level fragment emits `stalledErr.message`, which is composed in-repo from two integers (`msSinceProgress`, `queue.length`) and fixed English - it interpolates no filename, path, URL, token or remote body. The `first:` fragment emits a manifest-relative filename and `describeDepotFailure(...)`, both of which the same line already emits at HEAD. No new class of data reaches the log. |
| T-tpm-03 | Repudiation | the corrected aggregate line | low | mitigate | The defect IS a diagnostic-integrity problem: a count that overstates failed files by one degrades post-incident reconstruction, and this repo has been burned repeatedly by trusting a counted population. Mitigated by making the count match its noun AND keeping the run-level reason in the same line, so no information is traded away for the corrected number. |
| T-tpm-04 | Tampering | supply chain (`npm`/`pip`/`cargo` installs) | n/a | accept | No package is added, removed or upgraded; `package.json` and the lockfile are not in `files_modified`. The Package Legitimacy Gate does not apply and no `[ASSUMED]`/`[SUS]` checkpoint is owed. If execution discovers an install is needed, STOP and re-plan - do not install under this plan. |
</threat_model>

<verification>
Run from the repo root. Nothing here is inferred; every command is actually run and its output
recorded in the SUMMARY.

1. `pnpm codecheck` -> exit 0
2. `pnpm lint` -> exit 0, `production: PASS | tests: PASS`. Report the honest delta against HEAD's
   counts. `TESTS_CEILING = 638` is exact with zero headroom - a single new warning in
   `depot.test.ts` is a hard fail, not a rounding error.
3. `pnpm find-deadcode` -> `unreachable: 46 OK | used-in-module: 0 OK`
4. `npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam'` -> all green, total
   strictly greater than the 1506 measured at HEAD
5. `npx prettier --check` over the two exact written source paths -> exit 0, preceded in the same
   run by the `--file-info` proof that both are `"ignored": false` so the check is real
6. `python3 .planning/todos/todo-frontmatter-gate.py` -> OK
7. `pnpm planning-gates` -> passes at its HEAD count; any pre-existing failure is reproduced at HEAD
   and named as pre-existing
8. `git show :<path>` over the closed todo -> carries `260927-tpm` and a `## Resolution` section

NOT owed and must not be claimed: no live Steam install re-drive. A run-level stall is not
reproducible on demand and everything here is desk work, exactly as the parent debug session was.
The RED->GREEN measurement is the evidence; do not write "verified live".
</verification>

<success_criteria>
- The aggregate line reports the FILE-level count against the `file failure(s)` noun, and the
  run-level record is still surfaced in the same line rather than silently dropped.
- The run-level record stays in `failures`; `canWriteFullOwnership` and all three post-loop verdicts
  still fail closed on it, asserted not assumed.
- One new optional field, one new export, one changed template literal. No array split, no signature
  change, no required field made optional.
- Every new assertion was measured RED against the pre-fix source, with the actual output recorded.
- The pre-existing T-D4 end-to-end test is unmodified and green, anchoring the formatter's output to
  the string that actually reaches the log.
- The todo is closed with its stale census replaced, and the one residual this fix deliberately does
  not close is filed as its own todo rather than left in a commit message.
</success_criteria>

<output>
Create `.planning/quick/260927-tpm-tag-the-run-scoped-depot-stall-failure-s/260927-tpm-SUMMARY.md` when done.

It MUST record, because each is a thing this repo has been burned by asserting without measuring:
- The RED output for every new assertion, quoted verbatim.
- The measured window/tick arithmetic the A6 arm settled on, and the actual `failures` population
  split (expected 32 file-level / 1 run-level / 33 total) - if it differs, the measured numbers.
- The `pnpm lint` production and tests counts before and after, as numbers.
- The steam suite total before and after, as numbers.
- Whether the `worker process has failed to exit gracefully` warning appeared, and whether it was
  reproduced at HEAD before being called pre-existing.
- Both named-not-closed residuals (D-C, D-D) and where each is now tracked.
</output>

