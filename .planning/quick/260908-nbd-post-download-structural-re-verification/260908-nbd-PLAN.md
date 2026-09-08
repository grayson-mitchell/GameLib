---
phase: quick-260908-nbd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/reconcile.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/reconcile.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts
  - .planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md
  - .planning/todos/pending/2026-09-08-steam-installdir-stop-words-stripped.md
  - .planning/STATE.md
autonomous: true
requirements: [NBD-01, NBD-02, NBD-03]
must_haves:
  truths:
    - "A native Steam install whose tree is damaged AFTER the per-file write (clobbered, truncated, replaced by a directory) can no longer earn StateFlags=4 — it falls back to the 1026 verify-handoff."
    - "A genuinely complete install still earns StateFlags=4 — no healthy install regresses to 1026."
    - "A structural mismatch is NAMED in the log (filename, expected, found), never a silent boolean."
    - "reconcilePartialState's sha1 invariant is untouched: no present file is skipped from the download job list on existence+size alone."
    - "A throw inside the new verification fails the run CLOSED to 1026 — it never crashes the install."
  artifacts:
    - path: "src/backend/storeManagers/steam/depot/reconcile.ts"
      provides: "verifyStructuralIntegrity(plan, installRoot) — POST-download, no-sha1 damage detector, plus the shared regularFileShape() helper it and regularFileVerified() both use"
      contains: "verifyStructuralIntegrity"
    - path: "src/backend/storeManagers/steam/depot.ts"
      provides: "the call site inside downloadDepotFiles that ANDs the structural result into allFilesVerifiedThisRun"
      contains: "verifyStructuralIntegrity"
    - path: "src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts"
      provides: "end-to-end proof that a post-write-damaged tree finalizes 1026, and a complete one still finalizes 4"
      contains: "verifyStructuralIntegrity|post-write"
    - path: ".planning/todos/pending/2026-09-08-steam-installdir-stop-words-stripped.md"
      provides: "new todo for the stop-word-stripped installdir lead, with conforming triage frontmatter"
      contains: "ready: code"
  key_links:
    - from: "src/backend/storeManagers/steam/depot.ts downloadDepotFiles"
      to: "src/backend/storeManagers/steam/depot/reconcile.ts verifyStructuralIntegrity"
      via: "await, guarded by runLooksComplete, result ANDed into allFilesVerifiedThisRun"
      pattern: "verifyStructuralIntegrity"
    - from: "src/backend/storeManagers/steam/depot.ts allFilesVerifiedThisRun"
      to: "src/backend/storeManagers/steam/depot.ts canWriteFullOwnership"
      via: "DepotDownloadResult threaded into finalizeToSteam's completeness-gate inputs (already wired)"
      pattern: "allFilesVerified"
---

<objective>
Close the structural half of the StateFlags=4 completeness gate: re-read the install tree AFTER
the download and before granting full ownership.

Purpose: `allFilesVerifiedThisRun = allJobsAttempted && failures.length === 0` (depot.ts:2676)
means only *"every job we ran reported success"*. `downloadSingleFile` does prove content at write
time (whole-file sha1 at depot.ts:1629-1637), so a file is correct **at the moment it is written**
— but nothing re-reads it afterwards. A file written successfully and then clobbered, truncated,
or replaced later in the same run is invisible to the gate, which then writes `StateFlags=4`
(full ownership, Steam runs NO verify pass) over a broken install. The cross-depot-collision fix
(`0a6e5e91b` + `037f0e4d3`) removed one known clobber mechanism; the gate remains structurally
unable to detect any other.

Output: a cheap, no-sha1, type+size re-verification of every planned entry, ANDed into the gate
and failing closed to the 1026 verify-handoff; three discriminating tests; and the source todo
corrected — its central claim is false and must not stay on record as written.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md

Project skill: `Skill("spike-findings-gamelib")` — Steam native depot install + ACF adoption.
Load it only if Task 1's fs semantics need it; the interfaces below are already verified.

Source files (read the cited ranges only — do not re-read a range twice):
- `src/backend/storeManagers/steam/depot/reconcile.ts` — whole file, 174 lines. The module being
  extended. Its header (lines 1-16) states the sha1 invariant that Task 1 must not weaken.
- `src/backend/storeManagers/steam/depot.ts`
  - `1119` — `sha1File` (do not use it in the new function).
  - `1178-1221` — `DepotDownloadResult` + `canWriteFullOwnership`. **Do not modify either.**
  - `1626-1638` — the existing per-file post-write sha1 check. This is *why* the new check needs
    no sha1: content is already proven at write time; the residual risk is post-write damage.
  - `2140-2185` — the `reconcilePartialState` call site (start of `downloadDepotFiles`). `plan`
    and `installRoot` are both in scope for the whole function body.
  - `2617` — `const allJobsAttempted = queue.length === 0`.
  - `2637-2673` — `allModesApplied` derivation + the `executableClaimedByManifest` warning. **The
    log shape and tone Task 1's new warning must mirror.**
  - `2673-2679` — the `return { ... allFilesVerifiedThisRun ... }`. The insertion point is
    immediately above it.
- `src/backend/storeManagers/steam/__tests__/reconcile.test.ts` lines 1-55 — the transitive-mock
  block Task 2's unit tests reuse verbatim.
- `src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts` lines 1-100 (header + mock
  strategy), `144-213` (`makeFakeClient` / `setupPlanPlumbing`), `301-333` (**Test D** — the
  existing "genuine complete run still earns StateFlags=4" case; the model for Task 2's
  end-to-end tests and the existing regression guard).

<interfaces>
Already true in the tree — verified at planning time, do not re-derive.

`src/backend/storeManagers/steam/depot/reconcile.ts`
```typescript
const DIRECTORY_FLAG = 64
const SYMLINK_FLAG   = 512
async function directoryVerified(dest: string): Promise<boolean>
async function symlinkVerified(dest: string, linktarget?: string): Promise<boolean>
async function zeroSizeVerified(dest: string): Promise<boolean>   // stat + isFile + size===0
async function regularFileVerified(dest: string, file: DepotPlanFile): Promise<boolean>
//   stat -> isFile -> size === Number(file.size) -> sha1File(dest) === expectedSha(file)
export async function reconcilePartialState(plan, installRoot): Promise<ReconcileResult>
```

`src/backend/storeManagers/steam/depot.ts`
```typescript
export const FAILURE_LOG_CAP = 10          // line 94 — reuse this cap, do not mint a second one
export function sha1File(path: string): Promise<string>
export function resolveContainedPath(root: string, filename: string): string  // throws PathTraversalError
// inside downloadDepotFiles, all in scope at the insertion point:
//   plan, installRoot, jobs, failures, allJobsAttempted, opts.signal
```

`src/backend/storeManagers/steam/depot/pathCollisions.ts` — `resolveDepotPathCollisions` is called
at `depot.ts:894` inside `buildDepotPlan` and **mutates `depot.files` in place**
(`pathCollisions.ts:154`). So the plan `downloadDepotFiles` receives is already
collision-resolved: an auto-resolved size-0 Directory entry losing to a real file is *gone* from
the plan and can never produce a false structural mismatch. Only `report.unresolved` collisions
(two chunked entries on one path, symlink-vs-file) survive in the plan — see gotcha 3.

**Declared-list gate — does NOT apply here.** `testContainment.test.ts`'s Block C set-equality
gate (T-34.2-83) is scoped to `src/backend/sidecar/__tests__/`. This plan adds no file to that
directory and touches only existing suites in
`src/backend/storeManagers/steam/__tests__/`, which has no analogous registry. No registration
step is needed.
</interfaces>

<gotchas>
Standing findings this plan is built on. Violating any of them ships a green test that proves
nothing, or regresses every healthy install to 1026.

1. **`reconcilePartialState`'s sha1 step is load-bearing and must survive Task 1's refactor.**
   Its header calls it *"the single most important correctness rule in this file"*. Task 1
   extracts the *shape* half of `regularFileVerified` into a shared helper; if the extraction
   drops or short-circuits the `sha1File` call that follows it, a present-but-wrong-content file
   would be skipped from the download job list — a silent-corruption regression far worse than
   the bug being fixed. `reconcile.test.ts`'s existing cases guard this; they must stay green
   *without modification*.

2. **Never sha1 in the new function.** It runs after every install. A 1315-file / 3.5 GB title
   (718850) would be re-hashed end-to-end on every completion. ~1315 `stat()` calls is the budget.

3. **An `unresolved` path collision now forces 1026.** Two chunked entries claiming one path
   cannot both be satisfied on disk, so at least one will structurally mismatch. This is the
   correct, honest answer (the plan is genuinely ambiguous and `pathCollisions.ts` deliberately
   refuses to guess a winner), but it IS a behaviour change: such a title previously got a `4`.
   Say so in the doc comment.

4. **Case-insensitive filesystems are the one residual false-positive risk.** `normalizePath` in
   `pathCollisions.ts` is deliberately case-sensitive, so `Master.dat` and `master.dat` are not
   reported as colliding — yet on APFS/NTFS they are one inode, and one of the two will show the
   wrong size. Do not attempt to fix this here. It is why the mismatch list must name filenames:
   a live false-fail has to be diagnosable from the log alone.

5. **`resolveContainedPath` throws `PathTraversalError`.** The new function must not let that (or
   any other throw) escape into the download path. Task 1's call site wraps it and fails closed.

6. **Fail-closed fixes have twice recreated a fail-open one level over** (project memory:
   `fixing-a-fail-open-gate-can-create-its-sibling`). The new code has exactly one default:
   an error, a throw, or any mismatch ⇒ `false`. There is no branch that resolves to `true` on
   incomplete information.

7. **`resetMocks: true` strips `jest.mock()` factory implementations before every test.**
   Re-implement in `beforeEach` — the existing suites already do.
</gotchas>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add verifyStructuralIntegrity and wire it into the completeness gate, failing closed</name>
  <files>src/backend/storeManagers/steam/depot/reconcile.ts, src/backend/storeManagers/steam/depot.ts</files>
  <action>

**(a) `reconcile.ts` — extract the shape check so the two callers cannot drift.**

Split `regularFileVerified`'s non-content half into a small shared helper. Both the existing
sha1-gated path and the new structural path call it, so a future change to "what a correct
regular file looks like on disk" lands in one place:

```typescript
type ShapeFailure = 'missing' | 'not-a-file' | 'wrong-size'

async function regularFileShape(
  dest: string,
  file: DepotPlanFile
): Promise<{ ok: true; size: number } | { ok: false; reason: ShapeFailure; foundSize?: number }> {
  let st
  try { st = await stat(dest) } catch { return { ok: false, reason: 'missing' } }
  if (!st.isFile()) return { ok: false, reason: 'not-a-file' }
  if (st.size !== Number(file.size)) return { ok: false, reason: 'wrong-size', foundSize: st.size }
  return { ok: true, size: st.size }
}
```

`regularFileVerified` becomes: call `regularFileShape`; on `!ok` return false; **then** the
existing, byte-unchanged sha1 block (`const got = await sha1File(dest); return got ===
expectedSha(file)`) with its existing Pitfall-1/T-23-07 comment intact. Gotcha 1.

**(b) `reconcile.ts` — add the new exported function.**

```typescript
export type StructuralFailureReason =
  | 'missing' | 'not-a-file' | 'wrong-size' | 'not-a-directory' | 'bad-symlink' | 'error'

export interface StructuralMismatch {
  filename: string
  reason: StructuralFailureReason
  expectedSize?: number
  foundSize?: number
}

export interface StructuralVerifyResult {
  ok: boolean
  checked: number
  mismatchCount: number          // TOTAL, not the reported length
  mismatches: StructuralMismatch[]  // bounded to MISMATCH_REPORT_CAP
}

export async function verifyStructuralIntegrity(
  plan: DepotPlan,
  installRoot: string
): Promise<StructuralVerifyResult>
```

Walk `plan.depots[].files[]` with the identical dispatch `reconcilePartialState` uses — same
`resolveContainedPath(installRoot, file.filename)` containment discipline (never `path.join`,
T-23-08), same `DIRECTORY_FLAG` / `SYMLINK_FLAG` / zero-size branch order — and reuse
`directoryVerified`, `symlinkVerified` and `zeroSizeVerified` unchanged. Regular files go through
`regularFileShape` only. Record a `StructuralMismatch` per failure, push to `mismatches` only
while `mismatches.length < MISMATCH_REPORT_CAP` (`= 10`, matching depot.ts's `FAILURE_LOG_CAP` —
declare it locally with a comment naming that precedent), but always increment `mismatchCount`.
`ok = mismatchCount === 0`. Let `resolveContainedPath`'s `PathTraversalError` propagate — the
caller fails closed on it (gotcha 5); do not swallow it here.

Give it a doc comment that makes the distinction from `reconcilePartialState` impossible to
misread. It must state, in substance:

  - **This is a POST-download damage detector, NOT a content check, and NEVER a substitute for
    `reconcilePartialState`'s sha1 gate.** That function decides what may be *skipped from the
    download job list* — a decision that requires sha1, per this file's header invariant. This one
    runs *after* every planned file has already been written **and** whole-file-sha1-verified by
    `downloadSingleFile` (depot.ts:1629-1637), and asks a different question: *is what we wrote
    still there, and still the right shape?*
  - **Why no sha1**: content was proven at write time; the residual risk is post-write damage
    (a later job clobbering an earlier file, a truncation, a file replaced by a directory) which
    type+size catches at ~1 `stat()` per entry. Re-hashing a 3.5 GB install on every completion
    is not affordable (gotcha 2).
  - **What it therefore cannot catch**: content corrupted in place at the *same size* by
    something outside this process. Named honestly so nobody reads this as a full verify.
  - The `unresolved` path-collision consequence from gotcha 3.

**(c) `depot.ts` — the call site.**

Add `verifyStructuralIntegrity` to the existing `./depot/reconcile` import. Insert immediately
after the `allModesApplied` / `executableClaimedByManifest` block (~line 2672) and immediately
before the `return {`:

```typescript
const runLooksComplete =
  allJobsAttempted && failures.length === 0 && !opts.signal?.aborted
let structurallyVerified = true
if (runLooksComplete) {
  try {
    const structural = await verifyStructuralIntegrity(plan, installRoot)
    structurallyVerified = structural.ok
    if (!structural.ok) {
      logWarning(
        `downloadDepotFiles: appId=${plan.appId} post-download structural ` +
          `re-verification found ${structural.mismatchCount} of ` +
          `${structural.checked} planned entries damaged or missing — failing ` +
          `closed to StateFlags=1026 instead of an unproven StateFlags=4: ` +
          structural.mismatches
            .map((m) => `"${m.filename}" ${m.reason} (expected=${m.expectedSize} found=${m.foundSize})`)
            .join('; '),
        LogPrefix.Steam
      )
    }
  } catch (err) {
    structurallyVerified = false
    logWarning(
      `downloadDepotFiles: appId=${plan.appId} post-download structural ` +
        `re-verification threw — failing closed to StateFlags=1026: ${String(err)}`,
      LogPrefix.Steam
    )
  }
}
```

and change the returned field to:

```typescript
allFilesVerifiedThisRun:
  allJobsAttempted && failures.length === 0 && structurallyVerified,
```

Comment the placement and the guard, covering:

  - **Why it runs here and not at the top**: `reconcilePartialState` runs at the START of
    `downloadDepotFiles` as the job-list builder (~line 2160) and never again. This is the only
    point at which the tree is in its final state — after the job loop, after
    `healReconciledFileModes`, after every per-file mode application.
  - **Why `runLooksComplete` guards it (the cancelled-path decision)**: a cancelled or failed run
    already fails `canWriteFullOwnership` via `outcome` / `failures` / `allJobsAttempted`, so its
    `allFilesVerifiedThisRun` value cannot change the ACF that gets written — running ~1315
    `stat()`s there would be pure waste, and its per-file failures are already logged individually
    at the loop's catch. The check therefore runs **only on the runs that would otherwise be
    granted `4`**, which is exactly the population it exists to police. It is a strict tightening:
    no run that previously got `1026` can now get `4`.
  - **Fail-closed contract**: mismatch ⇒ false, throw ⇒ false, unguarded run ⇒ the pre-existing
    `false` from `allJobsAttempted`/`failures`. No branch resolves to `true` on incomplete
    information (gotcha 6).

Do **not** touch `canWriteFullOwnership`, `finalizeToSteam`, or `measureInstalledBytes`. The
existing threading already carries `allFilesVerifiedThisRun` into the gate.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5; npx jest --selectProjects Backend --testPathPattern "steam/__tests__/(reconcile|depot|depot.finalize|pathCollisions|flagsCensus)" 2>&1 | tail -25</automated>
  </verify>
  <done>`verifyStructuralIntegrity` is exported from `reconcile.ts` with the POST-download/NOT-a-substitute doc comment; `regularFileVerified` still performs its sha1 check after the extracted shape helper; `downloadDepotFiles` ANDs the result into `allFilesVerifiedThisRun` behind `runLooksComplete` with both failure paths logging and resolving `false`; `tsc` clean; the pre-existing steam depot suites green (name any pre-existing red WITH the sha it was measured at — "pre-existing" is a claim about a chosen baseline).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED-first tests — the discriminating case is an INCOMPLETE install</name>
  <files>src/backend/storeManagers/steam/__tests__/reconcile.test.ts, src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts</files>
  <behavior>

Write these BEFORE Task 1's `depot.ts` edit lands (or revert that edit into a scratch tree to
prove RED — **hold the commit constant and vary the TREE**, `git show <sha>:<path> >`, never
`git checkout --`, which fires this repo's post-checkout hook). A RED run must produce a genuine
assertion failure (`Expected "1026" ... Received "4"`), not a module-resolution error. Record both
directions.

**A — unit, in `reconcile.test.ts`** (new `describe('verifyStructuralIntegrity', ...)`, reusing
the file's existing transitive-mock block and real-tmpdir convention verbatim):

  1. complete tree — every planned entry present with the right type and exact size ⇒
     `ok === true`, `mismatchCount === 0`, `checked === <plan file count>`.
  2. a planned regular file present as an **empty directory** ⇒ `ok === false`, one mismatch with
     `reason: 'not-a-file'` and the right `filename`. *(The observed 38410 `master.dat` shape.)*
  3. a planned regular file present but **short** ⇒ `reason: 'wrong-size'`, `foundSize` reported.
  4. a planned regular file **absent** ⇒ `reason: 'missing'`.
  5. Directory(64), Symlink(512) and zero-size entries all satisfied correctly ⇒ `ok === true`.
     Guards against the new branches false-failing on the three non-regular entry kinds.
  6. more than 10 mismatches ⇒ `mismatches.length === 10` **and** `mismatchCount === <the real
     total>`. The cap must not corrupt the count.
  7. **no sha1** — a file with correct size but WRONG CONTENT ⇒ `ok === true`. This is not a
     loophole, it is the documented boundary, and pinning it is what stops a future reader
     "fixing" the function into an unaffordable full verify. Reference the doc comment.
  8. **the sha1 invariant survives the refactor** — `reconcilePartialState` over that same
     wrong-content/right-size file still returns `allFilesVerified === false` and pushes a job.
     The existing cases in this file already cover it; add this one explicitly adjacent to case 7
     so the *contrast between the two functions* is on record in one place.

**B — end-to-end, in `depot.finalize.test.ts`** (new describe block, modelled on Test D at line
301 and using `setupPlanPlumbing` / `makeFakeClient`):

The tests must produce damage that occurs **after** a successful, sha1-verified write — otherwise
the run fails for a different reason and measures nothing. Two mechanisms are already ruled out:
planting an empty directory *before* the run is repaired by `clearStaleDirectoryAtFilePath`, and
short-writing a file trips `downloadSingleFile`'s own post-write sha1. **Use a two-file plan and
have the mocked `fetchChunk` for file B damage file A's already-written destination** — this is
precisely the real cross-depot-clobber mechanism, and it leaves `failures` empty and every job
attempted, which is exactly the state that used to earn a `4`.

  1. **`master.dat` shape** — file A's destination is `rm`'d and replaced with an **empty
     directory** while file B downloads. Expect: zero failures recorded, and the finalized ACF
     matches `/"StateFlags"\s+"1026"/` and NOT `/"StateFlags"\s+"4"/`.
  2. **truncation** — file A is truncated to a shorter length while file B downloads. Same
     assertions.
  3. **no regression** — the identical two-file plan with a benign `fetchChunk` (no damage) still
     finalizes `/"StateFlags"\s+"4"/`. **This is the test that guards the failure mode Task 1 most
     risks** — a check that fails everything would satisfy tests 1 and 2 while silently forcing
     every healthy install in the product to 1026. It must be in the same describe block as them,
     over the same plan, so the two cannot diverge. The existing Test D (line 301) is the
     single-file version of this guard and must also stay green, unmodified.
  4. **non-regular entries in a complete plan** — a plan carrying a Directory(64) entry and a
     zero-size entry alongside a real file, downloaded cleanly, still finalizes
     `/"StateFlags"\s+"4"/`. Directly guards gotcha-3-adjacent false-failing on the entry kinds
     that have no bytes to compare.

Assert `logWarning` was called with a message naming the damaged filename in test 1 — a silent
boolean would make the next live failure undiagnosable, which is the reason the result type
carries detail at all.
  </behavior>
  <verify>
    <automated>npx jest --selectProjects Backend --testPathPattern "steam/__tests__/(reconcile|depot.finalize)" 2>&1 | tail -25; npx prettier --check src/backend/storeManagers/steam/depot/reconcile.ts src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/reconcile.test.ts src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts</automated>
    <manual>RED proof recorded in the SUMMARY for at least B-1 and B-2: the pre-fix tree, the assertion text observed (`Received "4"`), and the tree restored byte-identical afterwards (`git diff --stat` empty).</manual>
  </verify>
  <done>Both suites green; B-3 and B-4 green in BOTH directions (they must pass pre-fix too — a new test that only passes after the fix proves the fix fires, a new test that passes in both proves the fix is narrow, and this plan needs both); the RED proofs for B-1/B-2 are genuine assertion failures, recorded with their exact text.</done>
</task>

<task type="auto">
  <name>Task 3: Correct the todo record, dispose it, and file the installdir lead</name>
  <files>.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md, .planning/todos/pending/2026-09-08-steam-installdir-stop-words-stripped.md, .planning/STATE.md</files>
  <action>

**(a) Correct the source todo IN PLACE.** Its central claim is false and cannot stay on record as
written — a wrong premise on a `critical` todo deters the right fix (project memory:
`a-todos-trap-warnings-rot-faster-than-its-premise`). Rewrite the title and prepend a dated
correction section stating plainly:

  - **Neither `appmanifest_38410.acf` nor `appmanifest_718850.acf` was written by GameLib.**
    Both carry Steam-only fields `buildAppManifestText` has never emitted: `StagingSize`,
    `LastPlayed`, `DownloadType`, `UpdateResult`, `BytesToStage`, `BytesStaged`, `TargetBuildID`,
    `AllowOtherDownloadsWhileRunning`, `ScheduledAutoUpdate`, `MountedConfig` (GameLib writes
    `MountedDepots`), plus `dlcappid` sub-keys and, on 718850, an `InstallScripts` block.
    GameLib's field set is a fixed 15-field list, unchanged since `523e92565` (2026-07-17,
    verified with `git show`). **Steam wrote both `StateFlags=4` values.**
  - **The identifying heuristic in "Measured 2026-09-07" is wrong.** `BytesToDownload` /
    `BytesDownloaded` are written by the real Steam client too, so "presence ⇒ GameLib-written"
    does not hold, and the 19-ACF sweep built on it does not establish authorship for any row.
  - **Item 1 is REFUTED at source level.** `SizeOnDisk` is `measureInstalledBytes(installRoot)`
    (depot.ts ~2748), a real recursive on-disk file-size sum — not a manifest-derived sum. The
    "Suspected mechanism" section's byte-exact coincidence with `InstalledDepots` is a property of
    a Steam-written manifest, not evidence about GameLib's writer. **No fix; none was made.**
  - **Item 3 is ANSWERED.** 718850's tree at `common/Age of Wonders Planetfall` is 1315 files /
    3,560,381,799 bytes / 24 empty dirs, matching the recorded measurement. Its (Steam-written)
    ACF's `installdir` is `"Age Wonders Planetfall"` — no "of" — which does not match the on-disk
    directory name. That divergence is a NEW and separate lead, split to its own todo (see (c));
    it is explicitly NOT investigated here.
  - **Item 2 is ANSWERED BUT REJECTED AS SPECIFIED.** Cross-checking measured bytes against a
    summed manifest total needs an arbitrary tolerance: spike 001 established that the summed
    total legitimately OVERSHOOTS a complete multi-depot install (by 236 MB in the recorded case),
    so a byte-total comparison would produce false 1026 fallbacks on healthy installs — the exact
    failure mode `finalizeToSteam`'s own doc comment already warns against. **Superseded by the
    structural check this task shipped**, which compares per-entry type and exact size instead of
    an aggregate and therefore needs no threshold.
  - **What DID ship, and what it does not prove.** Name the commit(s). State that
    `verifyStructuralIntegrity` closes the structural half of the gate at the desk, and that no
    live run has yet observed the fail-closed path — the discriminating live gate in the
    "2026-09-08" section is unchanged and still owed.

**(b) Disposition: the todo stays OPEN, retitled and rescoped.** Apply this and state the
reasoning in the file:

  - Its remaining subject is real and unclosed: the live gate (plant a **non-empty** directory at
    `master.dat`, install on the **native** path, observe `ENOTEMPTY` + failure + `1026`) and the
    cleanup ledger for two named live installs. `ready: live-gate` already says exactly that.
  - Moving it to `completed/` and minting a residue todo would break the `split_from` /
    `debug_session` provenance chain and re-file the same live gate under a new id — and a close
    reads as *answered* when the premise it was opened on has just been shown false. Correct the
    record where it lives.
  - **Change `severity: critical` → `severity: major`.** The `critical` rating rested on "a
    shipped claim that is false" — GameLib writing `4` over a broken install. That is now
    unestablished (both observed ACFs are Steam's) *and* structurally blocked by this task's
    change. What remains — an unproven fail-closed path plus two damaged installs repairable by
    the user — is "a feature is broken or a measurement is silently contaminated". Keep
    `platform: any`, keep `ready: live-gate`. Bare lowercase values, `severity` → `platform` →
    `ready`, in that order (CLAUDE.md).
  - **Keep the "Cleanup still owed" section verbatim.** No code change repairs those two trees;
    repair is the user's decision (Steam → "Verify integrity of game files"). **Plan and perform
    no repair action.** Project memory: a code fix stops recurrence and leaves the damage.

**(c) File the new todo** at
`.planning/todos/pending/2026-09-08-steam-installdir-stop-words-stripped.md`. Frontmatter, with
`severity` → `platform` → `ready` adjacent and in that order, bare lowercase (the
`/gsd-add-todo` template omits all three and `pnpm planning-gates` reds without them):

```yaml
---
created: 2026-09-08
title: "Steam installdir vs on-disk directory name diverge by stop-word stripping — authorship of the on-disk names is UNESTABLISHED"
area: steam-depot
severity: medium
platform: any
ready: code
split_from: .planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/manifest.ts
---
```

Body — evidence only, no conclusions, and it must **state its own limits**:

  - Observed: 718850's Steam-written ACF carries `installdir "Age Wonders Planetfall"` while the
    tree lives at `common/Age of Wonders Planetfall`. Sibling directories under `common/` are
    likewise stop-word-stripped: `7 Days Die`, `Amnesia Dark Descent`, `Avadon Black Fortress`.
  - **NOT established, and must not be assumed:** whether GameLib created any of those directory
    names, or whether Steam itself stores a stripped `installdir` against a full-named directory.
    Both readings fit the evidence. No sweep was run.
  - Why it could matter: `finalizeToSteam` resolves `installRoot` as
    `<steamapps>/common/<opts.installdir>` and writes that same string into the ACF. A divergence
    between the name GameLib creates and the name it records would leave Steam unable to find the
    install — and `measureInstalledBytes` would measure an empty/absent root as `0`.
  - First step (desk-only, hence `ready: code`): trace where `installdir` originates in the plan
    (PICS `config.installdir`? the app name? a sanitiser?) and diff it against the directory name
    actually created, for the three named siblings.
  - **Do not** treat this as a duplicate of the parent todo. Its parent's item 3 is answered; this
    is the residue that answer exposed.

**(d) `.planning/STATE.md`** — prepend a `last_activity` entry following the file's existing
convention (dense, PRIOR ACTIVITY FOLLOWS). It must say, at minimum: what shipped; that the source
todo's title claim was **false** and both ACFs are Steam-written; that item 1 was refuted and item
2 rejected-as-specified with the 236 MB overshoot reasoning; the RED/GREEN measurements from
Task 2 including the both-directions guard; that the live gate is still owed and the todo stays
OPEN at `major`; and that the two damaged installs are untouched. Do **not** invoke any
`gsd-sdk` `state.*` verb — it has corrupted this file repeatedly (standing ban).
  </action>
  <verify>
    <automated>pnpm planning-gates 2>&1 | tail -20; head -20 .planning/todos/pending/2026-09-08-steam-installdir-stop-words-stripped.md; grep -n "^severity:\|^platform:\|^ready:" .planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md</automated>
    <manual>Confirm the "Cleanup still owed" section is present and byte-unchanged, and that nothing under `~/Library/Application Support/Steam` or any `steamapps` tree was modified by this task (`git status` is not a witness for that — state it explicitly).</manual>
  </verify>
  <done>The source todo is corrected, retitled, `severity: major` / `platform: any` / `ready: code`→`live-gate` in the required order, still in `pending/`, with the cleanup ledger intact; the new installdir todo exists with all three triage keys bare and lowercase; `pnpm planning-gates` reports zero rejected pending todos; STATE.md carries the new entry and no `state.*` verb was run.</done>
</task>

</tasks>

<verification>
Whole-task gates, run after Task 3:

```
npx tsc --noEmit -p tsconfig.json
npx jest --selectProjects Backend --testPathPattern "steam/__tests__/" 2>&1 | tail -25
npx eslint src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/depot/reconcile.ts
npx prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/depot/reconcile.ts src/backend/storeManagers/steam/__tests__/reconcile.test.ts src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts
pnpm planning-gates
```

Baselines: measure the steam suite counts BEFORE Task 1 and report both numbers. Any red that
predates this task must be named **with the sha it was measured at** — "pre-existing" is a claim
about a chosen baseline, not a property. Note that `pnpm test:ci` is known RED at head from a
leaked `store_embed_open` timer unrelated to this work, and `pnpm lint` is over its ceiling
(Phase 39 debt) so `.husky/pre-push` will refuse a push; neither is this task's to fix, and
neither may be used to excuse a red introduced here.
</verification>

<success_criteria>
- A post-write-damaged install tree can no longer reach `StateFlags=4`; it falls back to `1026`.
- A complete install — single-file, multi-file, and one carrying Directory/symlink/zero-size
  entries — still reaches `StateFlags=4`.
- The mismatch is named in the log with filename, reason, expected and found size.
- `reconcilePartialState`'s sha1 gate is provably intact (its existing tests green, unmodified,
  plus the explicit contrast case).
- The source todo no longer asserts that GameLib wrote those two ACFs.
- Two live damaged installs on this machine: **untouched**.
</success_criteria>

<risks>
- **Regressing healthy installs to 1026** is the dominant risk and the reason Task 2's B-3/B-4
  must pass in both directions. If any real-world plan shape trips the check, the log names the
  entries — that diagnosability is a requirement, not a nicety (gotcha 4).
- **Cost on large titles**: ~1315 `stat()`s for 718850, once, at the end of a multi-GB download.
  If a future title makes even that material, the fix is batching, never sampling — a sampled
  structural check is a gate that proves nothing.
- **The live gate remains unrun.** This task ships a desk fix. Nothing here observes the
  fail-closed path against real Steam, which is why the todo stays open.
</risks>
