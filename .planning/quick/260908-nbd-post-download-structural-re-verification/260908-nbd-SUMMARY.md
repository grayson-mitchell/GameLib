---
phase: quick-260908-nbd
plan: 01
type: execute
status: complete
commits:
  - 5f0f37112 "fix(260908-nbd): close the structural half of the StateFlags=4 completeness gate"
  - 744f93d65 "test(260908-nbd): RED-first coverage for the structural re-verification gate"
  - a0fded944 "docs(260908-nbd): correct the false GameLib-authorship claim on the ACF todo, file the installdir stop-word lead"
  - 563658f52 "docs(260908-nbd): delete the installdir stop-word todo -- the observation was a display artifact"
---

# 260908-nbd: post-download structural re-verification — SUMMARY

## What shipped

**Task 1 (`5f0f37112`)** — `verifyStructuralIntegrity(plan, installRoot)` added to
`src/backend/storeManagers/steam/depot/reconcile.ts`: a post-download, no-sha1
type+size re-check of every planned file entry (Directory/Symlink/zero-size/regular
dispatch, matching `reconcilePartialState`'s own shape). A new shared helper
`regularFileShape()` was extracted out of `regularFileVerified` so both functions
define "what a correct regular file on disk looks like" in exactly one place;
`reconcilePartialState`'s sha1 check is byte-unchanged after it. Mismatches are
capped for logging at 10 (`MISMATCH_REPORT_CAP`) but `mismatchCount` is never
capped. Wired into `downloadDepotFiles` in `depot.ts`: the structural result is
ANDed into `allFilesVerifiedThisRun`, and a thrown error (e.g. `PathTraversalError`)
or any mismatch resolves to `false` — fails closed to `StateFlags=1026`, never an
unproven `4`.

**Task 2 (`744f93d65`)** — 8 new unit tests in `reconcile.test.ts` (complete tree,
master.dat-as-directory shape, wrong-size, missing, non-regular entries, >10-mismatch
capping, no-sha1 boundary, sha1-invariant contrast) and 4 new end-to-end tests in
`depot.finalize.test.ts` driving the real `downloadSteamDepots` orchestrator with
real fs: empty-directory damage (the observed 38410 shape), truncation damage,
no-regression on an identical undamaged two-file plan, and no-regression on a
complete plan containing non-regular (Directory/zero-size) entries.

**Task 3 (`a0fded944`)** — corrected
`.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md`
in place (not moved to `completed/`): its central claim — that GameLib wrote the
two damaged ACFs — is false; both are Steam-written. Retitled, `severity: critical`
→ `major`, kept `platform: any` / `ready: live-gate`, kept the "Cleanup still owed"
section verbatim. Filed
`.planning/todos/pending/2026-09-08-steam-installdir-stop-words-stripped.md`
(`severity: medium`, `platform: any`, `ready: code`) for the apparent
installdir/on-disk-name stop-word-stripping divergence — **that todo was
deleted again in `563658f52`: the observation was a display artifact and the
divergence does not exist.** See the correction note at the end of this
SUMMARY. `.planning/STATE.md` was
updated with a new `last_activity` entry via the Edit tool only (no `gsd-sdk
state.*` verb used) and is **deliberately left uncommitted** in the working tree.

## Deviation: a test-path bug, not a plan defect

The first draft of E2E tests 1 and 2 simulated post-write damage at
`join(dir, 'a.bin')`. That is wrong: `downloadDepotFiles` resolves every plan file
under `installRoot = resolve(targetSteamappsDir, 'common', installdir)`
(`depot.ts:2117-2121`), so the real file lived at
`join(dir, 'common', 'SomeGame', 'a.bin')`. The mocked `fetchChunk`'s
`waitForFileWritten` poll could never find the file at the wrong path, so it hit
its own internal 3000ms timeout, rejected, and `downloadFileChunks`' retry loop
(`stallTracker && !stallTracker.hasStalled()`) requeued the same chunk and retried
forever — well past Jest's 5000ms test timeout, and the accumulating orphaned
retries/timers are the direct cause of the V8 heap-OOM crash observed mid-run.
Fixed with a `gameFile(name)` helper resolving the correct path; re-ran clean,
12/12, no timeout, no OOM, no unusual memory behavior on a full 37-suite run
afterward (a benign "worker process has failed to exit gracefully" note appears on
the full-directory run both before and after this fix and traces to
`lzmaNativeSeaRealBuild.test.ts`, not to anything touched by this task — confirmed
by running `depot.finalize.test.ts` alone with `--detectOpenHandles`, which shows
no leak warning at all).

## RED proof — B-1 and B-2 (genuine, exact assertion text observed)

Held the commit constant, varied the tree per project convention (never
`git checkout --`): `git show 5f0f37112^:src/backend/storeManagers/steam/depot.ts >
src/backend/storeManagers/steam/depot.ts`, ran the two new damage tests, restored
with `git show 5f0f37112:...depot.ts > ...depot.ts` (`git diff --stat` empty
afterward — byte-identical).

Pre-fix run (`npx jest --selectProjects Backend --testPathPattern
"steam/__tests__/depot.finalize" -t "test 1|test 2"`): **2 failed, 10 skipped, 12
total.** Both failures were genuine `toMatch` assertion mismatches, not
module-resolution errors:

```
Expected pattern: /"StateFlags"\s+"1026"/
Received string:  "\"AppState\"
{
    ...
    \"StateFlags\"        \"4\"
    ...
```

(test 1, line 512, and test 2, line 545 — same pattern, same received value,
`"StateFlags" "4"` where `"1026"` was expected). Confirms the new checks are
load-bearing: without Task 1's fix, both simulated-damage scenarios still earn an
unproven `StateFlags=4`.

## B-3 / B-4 — both directions, as required

`test 3` (no-regression, identical undamaged two-file plan) and `test 4`
(no-regression, complete plan with non-regular entries) were run against the same
pre-fix tree (`-t "test 3|test 4"`): **2 passed, 10 skipped.** Combined with the
post-fix run (all 12 pass), this proves the new structural check is narrow — the
no-regression guards do not depend on the new check being present to pass, so the
check does not accidentally widen what counts as "damaged."

## Test counts

- `reconcile.test.ts` + `depot.finalize.test.ts` alone: 31 passed (19 + 12), 0
  failed.
- Full steam suite (`--testPathPattern "steam/__tests__/"`, 37 suites): **1400
  passed, 2 skipped (pre-existing), 1402 total** — measured identically before and
  after Task 2's tests were added (no regressions).
- `tsc --noEmit`: clean.
- `eslint` on `depot.ts` and `reconcile.ts`: 0 errors. `eslint` on the two test
  files: 0 errors, 38 warnings — all pre-existing warning classes
  (`no-unsafe-*`, `unbound-method`, `require-await`) already present throughout
  this test file's established mock patterns before this task; no new class of
  warning introduced.
- `prettier --check` on all four touched files: clean.
- `pnpm planning-gates`: 9/9 passed, both before and after the STATE.md edit.

## What remains unproven

**The live gate is entirely unrun.** Nothing in this task observed a real Steam
install, real network I/O, or the real CDN. `verifyStructuralIntegrity` is proven
correct at the unit level and proven to force the right fallback through the real
`downloadSteamDepots` orchestrator against a real filesystem with every
Steam/network seam mocked — it has **not** been proven against a live Steam
client. The source todo's own discriminating live run (plant a non-empty directory
at `master.dat`, install on the native path, expect `ENOTEMPTY` + failure + `1026`)
is unchanged and still owed; this task did not attempt it, per the constraint that
the live gate is not this task's to close. The todo stays `OPEN` at
`ready: live-gate`.

**The two damaged installs are untouched.** Native 38410 (`master.dat` still an
empty directory under a `StateFlags=4` manifest) and native 718850 were not
repaired, deleted, or otherwise modified by this task. Repair remains the user's
decision (Steam → "Verify integrity of game files").

**718850's shape** (whether its 13.6 GB shortfall is a genuine download failure or
unowned/unselected DLC depots entering the `selectAllDepots` union) remains
unestablished — this was already true before this task and this task did not
change that.

**The installdir stop-word-stripping observation was WRONG and has been retracted.**
It was filed as a todo in `a0fded944` and deleted again in `563658f52`. Recorded
here rather than erased, because the failure mode is worth keeping:

- **What was claimed.** 718850's ACF carries `installdir "Age Wonders Planetfall"`
  while the tree lives at `common/Age of Wonders Planetfall`, with `7 Days Die`,
  `Amnesia Dark Descent` and `Avadon Black Fortress` as corroborating siblings.
- **What is actually true.** Read back byte-exactly with `od -c`, the ACF contains
  `"installdir"\t\t"Age of Wonders Planetfall"` — matching its on-disk directory
  exactly. The file's mtime is unchanged since `2026-08-18 18:50:51`, so nothing
  rewrote it between the two reads. The three siblings are on disk as
  `7 Days To Die`, `Amnesia The Dark Descent` and `Avadon The Black Fortress`,
  all retaining their stop words, and their ACF `installdir` fields agree
  (`251570` → `7 Days To Die`, `57300` → `Amnesia The Dark Descent`).
- **Where the error came from.** The orchestrator's first `cat` of
  `appmanifest_718850.acf` rendered with ` of ` dropped. The *same* render also
  appeared to drop the file's closing braces; that second anomaly was checked
  (via `cat -et`, which showed the braces present) and the first was not. One
  unreliable render was caught and the identical render was then trusted for a
  different field in the same output.
- **Lesson.** A terminal render is not a read. This whole task exists because a
  todo asserted an authorship mechanism that a byte-level check refuted — and the
  correction then reproduced the same shape by eyeballing a `cat`. Any claim that
  turns on the exact bytes of a file needs `od`/`grep`/`cat -et`, not a visual
  scan of `cat` output.

No stop-word stripping exists in this evidence, and nothing about `installdir`
derivation needs investigating on the strength of it.
