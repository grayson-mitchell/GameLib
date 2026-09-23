---
phase: quick-260923-o2s
plan: 01
status: completed
subsystem: filesystem
tags: [windows, acl, filesystem, jest, write-probe]

# Dependency graph
requires: []
provides:
  - "isWritable_windows as a real write probe (stat -> open('r+') or write-then-unlink), with the ACL-identity match and its single-entry-ACL trap deleted structurally"
  - "The first jest tests isWritable_windows has ever had, incl. a mocked regression case for the exact D:\\SteamLibrary ACL shape and a live opt-in arm"
  - "A recorded, load-bearing comment on isWritable_unix explaining why it stays an F_OK existence check"
  - "The ACL-group-grant todo retired to completed/ with an honest split of what is evidenced here vs left to the phase-38 orchestrator"
affects: [filesystem, steam-install-dialog, download-dialog, phase-38]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real write probe (create zero-byte randomUUID()-suffixed file with { flag: 'wx' }, unlink in a finally whose own failure is swallowed) instead of resolving Windows ACL/group membership in JS"
    - "Deliberately asymmetric isWritable_unix (F_OK existence check) vs isWritable_windows (real write probe), documented in-place at the asymmetry rather than harmonised"
    - "Opt-in live jest describe gated on `process.platform === 'win32' && process.env.GAMELIB_LIVE_WRITE_PROBE === '1'`, skipped by default so CI never touches the real filesystem outside the containment root"

key-files:
  created: []
  modified:
    - src/backend/utils/filesystem/windows.ts
    - src/backend/utils/filesystem/unix.ts
    - src/backend/utils/filesystem/__tests__/windows.test.ts
    - .planning/todos/pending/2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md (deleted, moved to completed/)
    - .planning/todos/completed/2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md (created, with Resolution section)

key-decisions:
  - "Write probe over fs.access(W_OK) or JS-side group resolution -- per the plan's decision record, access(W_OK) only reflects the read-only file ATTRIBUTE on Windows (no ACL check at all), and resolving group membership in JS means reimplementing Windows authorization"
  - "isWritable_unix left byte-for-byte behaviourally unchanged -- findFirstExistingPath's climb loop depends on its F_OK semantics; only a comment was added"
  - "Deviation (Rule 1 - bug): windows.test.ts's 'the probe file is always removed' case originally compared the unlink path against a forward-slash directory literal with a raw startsWith; path.join normalizes to backslash on win32 so that assertion would fail against the real implementation. Fixed to compare via path.dirname/path.normalize before Task 2's GREEN run."
  - "Explanatory comment in windows.ts rewritten to avoid the literal strings 'AccessControlEntry'/'FileSystemRightModify'/'userInfo' so the plan's done-criteria grep (which must return nothing) stays literally true while still explaining the removed single-entry-ACL trap in prose"

patterns-established:
  - "Manual, non-asserting live observation (e.g. C:\\Windows\\System32 writability under a non-elevated shell) recorded in prose rather than as a jest test, when there's no portable fixture for the case"

requirements-completed: [QUICK-260923-o2s]

# Metrics
duration: 9min
completed: 2026-09-23
---

# Quick Task 260923-o2s: Fix isWritable_windows ACL group-grant blindness Summary

**Replaced `isWritable_windows`'s ACL-identity-match (which only ever matched inside the user's own profile) with a real create-and-delete write probe, live-verified on this Windows 11 host: real `D:\SteamLibrary` flipped from FALSE to TRUE through the actual function.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-09-23T05:32:55Z
- **Completed:** 2026-09-23T05:41:33Z
- **Tasks:** 3 completed
- **Files modified:** 4 (3 source/test, 1 todo moved+edited)

## Accomplishments

- Closed the bug the todo measured: `isWritable_windows` matched ACL entries against the individual
  username, which Windows almost never grants directly (it grants through groups like
  `BUILTIN\Users`). The predicate returned `false` for effectively every path outside
  `C:\Users\<name>`, including `D:\SteamLibrary`, which Steam demonstrably writes into.
- `windows.test.ts` got its first-ever `isWritable_windows` coverage: seven mocked cases (any host,
  control-flow only) plus an opt-in live describe. Cases 1 and 2 were RED-proven against the
  unmodified source with the exact failure text captured below.
- `isWritable_windows` is now a real write probe: `stat` first (false on ENOENT, preserving
  `getDiskInfo`'s "path does not have to exist" contract), then either `open(path, 'r+')` for an
  existing non-directory or a `randomUUID()`-suffixed zero-byte `writeFile(..., { flag: 'wx' })`
  inside the target directory, unlinked in a `finally` whose own failure cannot change the verdict.
  The `powershell` spawn is gone from the `isWritable` path entirely (`getDiskInfo_windows` still
  uses it, unchanged, for `Win32_LogicalDisk`).
- The single-entry-ACL trap named in the todo's "Watch out" section (`ConvertTo-Json` emitting an
  object instead of an array for a one-entry ACL, throwing into `catch { return false }`) is gone
  structurally: `AccessControlEntry`, `FileSystemRightModify`, and `import { userInfo } from 'os'`
  are deleted from `windows.ts`, not left dormant.
- `isWritable_unix` is unchanged in behaviour; `unix.ts`'s diff is a comment recording why it stays
  an `F_OK` existence check and what breaks (`findFirstExistingPath`) if it is "fixed" to match.
- Live-verified on this real Windows 11 host: real `D:\SteamLibrary` was FALSE pre-fix and is TRUE
  post-fix, through the actual function via an opt-in jest arm (`GAMELIB_LIVE_WRITE_PROBE=1`), with
  no probe file left behind afterward.
- Todo retired to `completed/` with an honest split of what this task evidences (the underlying
  predicate, live-verified) versus what it does not (re-scoring `38-S08`, which belongs to the
  phase-38 orchestrator; observing `DownloadDialog`'s warning text live, which was never done here
  either).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the first tests isWritable_windows has ever had, RED-proven** - `6207eecb3` (test)
2. **Task 2: Replace the ACL identity match with a write probe; record the Unix asymmetry** - `43eb86e92` (fix)
3. **Task 3: Retire the todo** - `1a8dd5194` (docs)

_No separate plan-metadata commit was made; this is a quick task and this SUMMARY.md is the
closing artifact (per the orchestrator's instruction, this file and STATE.md are left unstaged
for the orchestrator to commit)._

## Files Created/Modified

- `src/backend/utils/filesystem/windows.ts` - `isWritable_windows` rewritten as a stat-then-probe
  write check; `AccessControlEntry`, `FileSystemRightModify`, and the `userInfo` import deleted.
  `getDiskInfo_windows` untouched.
- `src/backend/utils/filesystem/unix.ts` - Comment-only change on `isWritable_unix` recording the
  deliberate Unix/Windows asymmetry. No behaviour change.
- `src/backend/utils/filesystem/__tests__/windows.test.ts` - New `describe('isWritable_windows')`
  with seven mocked cases and an opt-in live describe, alongside the pre-existing
  `getDiskInfo_windows` tests (untouched).
- `.planning/todos/completed/2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md` -
  Retired todo, with `status`/`resolved`/`resolved_by` and a `## Resolution (2026-09-23, quick
  260923-o2s)` section.
- `.planning/todos/pending/2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md` -
  Removed (moved to `completed/`).

## Decisions Made

- Followed the plan's decision record verbatim: write probe adopted, `fs.access(W_OK)` and
  JS-side group resolution both explicitly rejected, `isWritable_unix` scope-fenced as unchanged.
- Rewrote the in-code rationale comment in `windows.ts` to describe the removed single-entry-ACL
  trap without using the literal identifier names (`AccessControlEntry`, `FileSystemRightModify`,
  `userInfo`), because the plan's own done-criteria requires
  `grep -n "userInfo\|FileSystemRight\|AccessControlEntry" windows.ts` to return nothing, and an
  earlier draft of the comment would have made that grep self-defeating by naming the very
  identifiers it deleted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a path-separator assumption in my own Task 1 test**
- **Found during:** Task 2 (running Task 1's tests GREEN against the rewritten `windows.ts`)
- **Issue:** "the probe file is always removed" asserted
  `unlinkPath.startsWith(targetDir)` where `targetDir` was the forward-slash literal
  `'C:/SteamLibrary'`. `path.join` normalizes separators to backslash on win32
  (`join('C:/SteamLibrary', '.gamelib-write-probe-...')` -> `C:\SteamLibrary\.gamelib-write-probe-...`),
  so the raw string-prefix check would have failed against the real implementation even though the
  implementation itself was correct.
- **Fix:** Compare via `path.dirname(unlinkPath)` against `path.normalize(targetDir)` instead of a
  raw string prefix.
- **Files modified:** `src/backend/utils/filesystem/__tests__/windows.test.ts`
- **Verification:** Test passes post-fix; re-ran the full mocked+live arm afterward, all green.
- **Committed in:** `43eb86e92` (Task 2 commit, alongside the source rewrite it verifies)

**2. [Rule 3 - Blocking] Corrected the jest scoping command to avoid running the entire Backend suite**
- **Found during:** Task 1's RED-proving step
- **Issue:** The plan's literal verify command, `npx jest --selectProjects Backend utils/filesystem`,
  has `--selectProjects` swallow `utils/filesystem` as a second (nonexistent) project name rather
  than treating it as a test-path pattern, so the command silently runs all 220 Backend suites
  instead of the intended file. This is a pre-existing Jest CLI quirk in the plan's verify text, not
  something introduced by this task.
- **Fix:** Used `npx jest --selectProjects Backend --testPathPattern utils/filesystem` (and
  `.../windows` for the narrower live-arm runs) to scope correctly, matching the intent of the
  verify block ("mocked arm green on any host" / "live arm green on THIS Windows 11 box") rather
  than its literal, mis-scoped text.
- **Files modified:** None -- command-line correction only, no plan or source text changed.
- **Verification:** Scoped runs show exactly `windows.test.ts` (and `unix.test.ts`, its suite
  sibling) rather than all 220 suites.
- **Committed in:** N/A (execution-time correction, no file change)

---

**Total deviations:** 2 auto-fixed (1 bug in my own new test, 1 blocking CLI-scoping correction)
**Impact on plan:** Both were necessary to get an honest GREEN/RED read on exactly the files this
plan touches. No scope creep -- `steamSectionGating.ts` and `38-VERIFICATION.md` were not touched,
and `isWritable_unix`'s diff remains comment-only.

## Issues Encountered

- Running the plan's literal (unscoped) verify command during Task 1's RED-proving step also
  surfaced 29 unrelated, PRE-EXISTING suite failures elsewhere in the Backend project (e.g.
  `wine/manager/downloader/__tests__/utilities/rest.test.ts`'s path-separator assertion,
  `sidecarRejectionGuard.test.ts`'s 5s timeout, `unzip.test.ts`'s 5s timeout,
  `lzmaNativeSeaRealBuild.test.ts`'s worker-serialization crash). These are out of this task's
  scope per the SCOPE BOUNDARY rule (not caused by this task's changes, not touched by it) and were
  not investigated or fixed. Once scoped correctly with `--testPathPattern utils/filesystem`, the
  only pre-existing failure visible in that narrower run is `unix.test.ts`'s "Works with nested
  path" case, which fails because `path.join` produces a backslash path on this Windows host where
  the test expects a forward-slash `/foo/bar` -- also pre-existing and unrelated to this task's
  change (this task did not touch `unix.test.ts` or `getDiskInfo_unix`).

## RED-Proof (Task 1, against the unmodified `windows.ts`)

Scoped run: `npx jest --selectProjects Backend --testPathPattern utils/filesystem`

**Case 1 -- "group-granted directory is writable" (mocked, D:\SteamLibrary ACL shape):**
```
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
  at windows.test.ts:129:19
```

**Case 2 -- "single-entry ACL does not produce a false negative" (mocked):**
```
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
  at windows.test.ts:161:19
```

**Case 3 -- "nonexistent path stays false":** PASSED pre-fix (green on both sides of the fix, by
design -- contract-preservation, not RED evidence).

**Case 4 -- "a refused write is not writable":** PASSED pre-fix, for an incidental reason not
predicted by the plan's blanket "tests 3-7 will also fail" note: the pre-fix code performs a REAL
(unmocked) `powershell` spawn against `C:/Program Files` on this host, and the real ACL for that
path also lacks a per-user ACE for `grays` (consistent with the todo's own measurement table for
`C:\Program Files (x86)\Steam`), so it independently returns `false` -- coincidentally matching the
test's expectation. Recorded honestly rather than retro-fit into the RED story.

**Case 5 -- "the probe file is always removed":**
```
expect(jest.fn()).toHaveBeenCalledTimes(expected)
Expected number of calls: 1
Received number of calls: 0
  at windows.test.ts:217:25
```

**Case 6 -- "an unlink failure cannot change the verdict":**
```
expect(received).resolves.toBe(expected) // Object.is equality
Expected: true
Received: false
  at windows.test.ts:234:76
```

**Case 7 -- "an existing non-directory is probed without mutation":**
```
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
  at windows.test.ts:252:19
```

**Live arm (`GAMELIB_LIVE_WRITE_PROBE=1`, scoped to `windows.test.ts`), pre-fix:**
```
isWritable_windows › live (opt-in, real Windows ACLs) › D:\SteamLibrary is writable
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
  at windows.test.ts:274:19
```
The sibling case, "a nonexistent path under D:\SteamLibrary is not writable", passed pre-fix
(expected `false`, matching the unchanged existence contract).

## GREEN-Proof (Task 2, against the rewritten `windows.ts`)

Mocked arm: 9 passed, 2 skipped (live, not opted in) -- all seven `isWritable_windows` cases green.

Live arm (`GAMELIB_LIVE_WRITE_PROBE=1`), post-fix:
```
isWritable_windows › live (opt-in, real Windows ACLs) › D:\SteamLibrary is writable  PASS
isWritable_windows › live (opt-in, real Windows ACLs) › a nonexistent path under D:\SteamLibrary is not writable  PASS
```
11/11 passed. Confirmed via PowerShell (`Get-ChildItem -Filter '.gamelib-write-probe-*'`) that no
probe file was left behind in `D:\SteamLibrary` after the run.

## Honesty About Reach

**Runs on any host (mocked, proves control flow only):** all seven cases in the mocked describe.
They prove that a group-only ACL (the exact `D:\SteamLibrary` shape) and a single-entry ACL no
longer produce a false `false`, and that the `powershell` spawn is gone -- but they say **nothing**
about how Windows actually adjudicates an ACL, because `fs.promises` is fully mocked in that arm.

**Needed this real Windows box, and is the evidence that matters:** the opt-in live describe.
Real `D:\SteamLibrary` returning `TRUE` post-fix (after returning `FALSE` pre-fix, matching the
todo's own measurement) is the only evidence in this task that touches real Windows authorization.

**Proven by neither, and not claimed as more than it is:** the "genuinely unwritable" case. Covered
mocked via the EPERM-rejection case (case 4/"a refused write is not writable"), and observed
manually and non-assertively against `C:\Windows\System32` in Task 2: elevation was checked first
(`net session`, exit code `2` -- not elevated), then a hand-rolled script mirroring the exact probe
algorithm (stat -> `writeFile(..., { flag: 'wx' })` -> unlink-in-finally) against that path returned
`RESULT: false (write rejected): EPERM`. This was NOT run through the jest suite or asserted as a
test -- it is a recorded manual observation, per the plan's explicit instruction not to turn it into
a flaky elevation-dependent test.

**Symptom 2 from the todo** (`DownloadDialog`'s "Warning: path might not be writable") was never
observed live when the todo was filed, and is not observed live here either -- the todo's
Resolution section says so explicitly rather than implying it is confirmed fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The underlying `isWritable_windows` predicate is fixed and live-verified on this host. Re-scoring
  `38-S08` (the Steam dialog's free-space line, `SteamDialog/index.tsx:493-497`) is explicitly the
  phase-38 orchestrator's job, not this task's -- `steamSectionGating.ts` and
  `38-VERIFICATION.md` were deliberately left untouched, as scoped.
- `DownloadDialog`'s "Warning: path might not be writable" (the todo's Symptom 2) still has not
  been observed live on any Windows run; a future sitting should confirm it renders correctly now
  that `validPath` will be `true` for group-granted install paths.

## Self-Check

- `src/backend/utils/filesystem/windows.ts` contains `randomUUID`: verified via
  `grep -n randomUUID` (PASS).
- `src/backend/utils/filesystem/__tests__/windows.test.ts` contains
  `describe('isWritable_windows'`: verified via `grep -n "describe('isWritable_windows'"` (PASS).
- `src/backend/utils/filesystem/unix.ts` contains `findFirstExistingPath`: unchanged from before
  this task, present (PASS).
- `.planning/todos/completed/2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md`
  exists and contains `resolved_by: quick-260923-o2s`; the `pending/` copy does not exist: verified
  via `test -f` / `test ! -e` (PASS).
- Commit `6207eecb3` exists: `git log --oneline` shows it.
- Commit `43eb86e92` exists: `git log --oneline` shows it.
- Commit `1a8dd5194` exists: `git log --oneline` shows it (HEAD).
- `grep -n "userInfo\|FileSystemRight\|AccessControlEntry" windows.ts` returns nothing: confirmed
  (exit code 1, no matches).
- `pnpm codecheck` (both tsc projects): clean, 0 errors.
- `pnpm lint`: `production: PASS | tests: PASS`, 0 errors (638 pre-existing warnings, none in the
  files this task touched).
- `python meta/runPlanningGates.py`: 12/12 gates passed.
- `git diff --diff-filter=D --name-only` on each task commit: no unexpected deletions.

## Self-Check: PASSED
