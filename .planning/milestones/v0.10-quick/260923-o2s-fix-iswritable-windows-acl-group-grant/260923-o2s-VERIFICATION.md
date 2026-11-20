---
phase: quick-260923-o2s
verified: 2026-09-23T06:15:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Quick Task 260923-o2s: Fix isWritable_windows ACL group-grant blindness Verification Report

**Task Goal:** Fix `isWritable_windows`, which returned FALSE for every path outside the user's
own profile, hiding disk space and showing a false "path might not be writable" warning on Windows
installs.

**Verified:** 2026-09-23T06:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from PLAN.md frontmatter `must_haves.truths`)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Returns TRUE for a group-granted-only ACL dir (the `D:\SteamLibrary` shape) | VERIFIED | `windows.ts:77-117` is a real `stat`→`writeFile`/`unlink` probe with no ACL parsing left. Orchestrator's independent live probe on this host: `D:/SteamLibrary -> true`. Mocked regression test "group-granted directory is writable" passes and asserts `spawnSpy` was never called. |
| 2 | Returns FALSE for a nonexistent path | VERIFIED | `windows.ts:79-85` catches any `stat` rejection and returns `false`. Orchestrator's live probe: `D:/definitely-not-here-xyz -> false (ENOENT)`. Test "nonexistent path stays false" passes and asserts `writeFile` was never called. |
| 3 | Returns FALSE when the write is refused (EPERM/EACCES) | VERIFIED | `windows.ts:107-116`: `writeFile` rejection → `false`. Orchestrator's live probe: `C:/Windows/System32 -> false (EPERM)`. SUMMARY separately records a manual, non-elevated, non-asserted System32 observation matching this. |
| 4 | Probe file always unlinked in `finally`; unlink failure changes neither verdict nor throws | VERIFIED | `windows.ts:112-116`: `finally { await unlink(probePath).catch(() => undefined) }`. Test "an unlink failure cannot change the verdict" (EBUSY rejection) resolves `true`, not a rejection. |
| 5 | No `powershell` spawn on the `isWritable` path | VERIFIED | `isWritable_windows` contains zero references to `genericSpawnWrapper`; only `getDiskInfo_windows` still calls it (unchanged, different function). Test asserts `spawnSpy).not.toHaveBeenCalled()`. |
| 6 | `AccessControlEntry`, `FileSystemRightModify`, `userInfo` import structurally deleted | VERIFIED | `grep -n "userInfo\|FileSystemRight\|AccessControlEntry" src/backend/utils/filesystem/windows.ts` run independently here returns nothing (exit code 1). |
| 7 | `isWritable_unix` byte-for-byte unchanged; `findFirstExistingPath` still depends on F_OK | VERIFIED | `git diff 3ce26e255 1a8dd5194 -- unix.ts` run independently here shows only 12 added comment lines above `isWritable_unix`; the function body (`access(path).then(...)`) is untouched. |
| 8 | `unix.ts` carries a comment recording why the two platforms deliberately diverge | VERIFIED | `unix.ts:34-45` states F_OK vs. real-writability reasoning and the `findFirstExistingPath` dependency, matching the plan's required content (a, b, c not required here — condensed but covers the substance). |
| 9 | `windows.test.ts` covers `isWritable_windows` for the first time | VERIFIED | `describe('isWritable_windows', ...)` present at `windows.test.ts:73`, alongside the pre-existing `getDiskInfo_windows` describe. |
| 10 | Every new mocked test asserting NEW behaviour was RED-proven, failure text recorded verbatim | VERIFIED (with a disclosed exception) | Cases 1, 2, 5, 6, 7 in SUMMARY.md carry verbatim jest `Expected/Received` failure text with file:line. Case 3 is correctly labeled contract-preservation (not RED evidence, by design). Case 4 ("a refused write is not writable") is NOT true RED — it PASSED pre-fix by coincidence (real unmocked `powershell` spawn against `C:\Program Files` also happened to return false) — but SUMMARY discloses this explicitly rather than retro-fitting a RED story, which is exactly what the plan's own task text anticipated ("record what they actually print; do not retro-fit a story onto them"). No dishonesty found. |
| 11 | SUMMARY states honestly which tests are mocked vs. live, and does not present mocked results as real-ACL evidence | VERIFIED | SUMMARY's "Honesty About Reach" section and the test file's own `describe` comments (`windows.test.ts:74-79`, `263-269`) both draw this line explicitly. |
| 12 | Todo moved from `pending/` to `completed/`; `python meta/runPlanningGates.py` still passes | VERIFIED | `ls .planning/todos/pending/2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md` → No such file. `completed/` copy exists with `resolved_by: quick-260923-o2s`. `python meta/runPlanningGates.py` run independently here: 12/12 gates passed. |

**Score:** 12/12 truths verified (11 clean, 1 verified-with-disclosed-exception that does not rise to a gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/utils/filesystem/windows.ts` | real write probe, ACL matching removed, contains `randomUUID` | VERIFIED | Contains `randomUUID` (line 4, 105); rewritten `isWritable_windows` is a stat→open/writeFile probe. |
| `src/backend/utils/filesystem/__tests__/windows.test.ts` | first `isWritable_windows` tests incl. group-granted-ACL regression | VERIFIED | `describe('isWritable_windows'` present; 7 mocked cases + 2 live cases (gated). |
| `src/backend/utils/filesystem/unix.ts` | recorded reason Unix stays an existence check | VERIFIED | Contains `findFirstExistingPath`; new comment block explains the asymmetry. |
| `.planning/todos/completed/2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md` | retired todo with resolution | VERIFIED | Contains `resolved_by: quick-260923-o2s` and a `## Resolution (2026-09-23, quick 260923-o2s)` section. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `windows.ts isWritable_windows` | `fs/promises writeFile` + `unlink` on a probe file | write-then-delete inside the target directory | VERIFIED | `writeFile(probePath, '', { flag: 'wx' })` at line 108, `unlink(probePath)` at line 115, matching pattern `writeFile\(|unlink\(`. |
| `index.ts isWritable` | `shellFilesFlowRegistration.ts checkDiskSpace validPath` | `validPath: pathIsWritable` | VERIFIED | `grep -n "validPath" shellFilesFlowRegistration.ts` → line 333: `validPath: pathIsWritable,`. This file has zero diff across the task's three commits (`git diff --stat 3ce26e255 1a8dd5194 -- shellFilesFlowRegistration.ts` is empty) — the plan correctly scoped this as a pre-existing, untouched consumer, not something this task needed to wire. |

### Behavioral Spot-Checks / Test Execution (run independently in this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Scoped filesystem suite | `npx jest --selectProjects Backend --testPathPattern utils/filesystem` | `windows.test.ts`: 10 passed, 2 skipped (live, not opted in), PASS. `unix.test.ts`: 1 pre-existing, unrelated failure ("Works with nested path", backslash-vs-forward-slash on this Windows host) — confirmed this task's diff never touches `unix.test.ts`. | PASS (matches orchestrator's independent measurement) |
| Type check | `pnpm codecheck` | Clean, no output, exit 0 (both `tsc --noEmit` and `tsc -p tsconfig.meta.json --noEmit`) | PASS |
| Planning gates | `python meta/runPlanningGates.py` | 12/12 gates passed | PASS |
| Deleted-identifier grep | `grep -n "userInfo\|FileSystemRight\|AccessControlEntry" windows.ts` | No matches (exit 1) | PASS |
| unix.ts diff shape | `git diff 3ce26e255 1a8dd5194 -- unix.ts` | 12 added comment lines only, zero behavioral lines changed | PASS |
| Scope fence | `git diff --stat 3ce26e255 1a8dd5194` | Exactly 4 files: `windows.ts`, `unix.ts`, `windows.test.ts`, the todo (completed/ add, 47 lines). No `steamSectionGating.ts`, no `38-VERIFICATION.md`. | PASS |
| Pending todo removed | `ls .planning/todos/pending/...md` | No such file | PASS |

No contradictions found against the orchestrator's independently-measured real-host results
(`D:/SteamLibrary -> true`, `C:/Program Files (x86)/Steam -> true`, `C:/Windows/System32 -> false
(EPERM)`, `C:/Users/grays -> true`, `C:/Users/grays/Projects/GameLib -> true`,
`D:/definitely-not-here-xyz -> false (ENOENT)`).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QUICK-260923-o2s | 260923-o2s-PLAN.md | Fix `isWritable_windows` ACL group-grant blindness | SATISFIED | All must-haves above verified against source, independently of SUMMARY.md's narrative. |

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in `windows.ts`, `unix.ts`, or the
new test cases. No stub returns (`return null`/`return {}`/hardcoded empty) in the modified
production code — every branch of `isWritable_windows` performs a real filesystem operation.

### Focus-Item Findings (from the verification brief)

1. **must_haves satisfied in source** — yes, all 12 truths and 4 artifacts verified directly
   against the current tree, not against SUMMARY's description of it.
2. **Mocked-vs-real boundary honesty in the shipped test file** — confirmed. The mocked `describe`
   is explicitly titled `'mocked (any host, proves control flow only)'` with a block comment
   disclaiming ACL evidence; the live `describe` is titled `'live (opt-in, real Windows ACLs)'`
   and is the only block whose comment claims real-authorization evidence. No test name or comment
   overstates the mocked arm.
3. **`afterEach(() => jest.restoreAllMocks())` presence** — confirmed present at
   `windows.test.ts:81-88`, inside the mocked `describe`, with a comment explicitly naming why
   (`resetMocks: true` does not restore spies). This is load-bearing exactly as described in the
   brief and is correctly placed.
4. **RED-proof honesty** — verbatim jest failure text present for cases 1, 2, 5, 6, 7. Case 3 is
   correctly labeled as deliberately non-RED (contract preservation). Case 4 is disclosed as an
   incidental pre-fix PASS rather than retro-fitted into a false RED narrative — this is the
   correct, honest behavior the brief was checking for, not a violation of it.
5. **Scope fences** — `steamSectionGating.ts` and `38-VERIFICATION.md` do not appear in the task's
   3-commit diff (`git diff --stat 3ce26e255 1a8dd5194`). Todo fully moved: `pending/` copy absent,
   `completed/` copy present and complete.
6. **Two documented deviations** — both present in SUMMARY.md under "Deviations from Plan": (1) a
   win32 path-separator bug in the executor's own new test, fixed in the test file itself,
   committed alongside Task 2; (2) the `--selectProjects`/`--testPathPattern` CLI correction,
   explicitly recorded as "Files modified: None — command-line correction only, no plan or source
   text changed." Verified true: no plan or source file carries this text change.
7. **Symptom 2 (`DownloadDialog` false warning)** — SUMMARY does not claim it as observed or
   verified anywhere; both the SUMMARY's "Honesty About Reach" section and the retired todo's
   Resolution section state plainly it was never observed live and is not claimed as confirmed
   fixed by this task.

### Human Verification Required

None. This task's evidence chain (mocked control-flow tests + an opt-in live arm actually run on
this Windows 11 host, independently re-run during this verification) is sufficient without further
human action. Symptom 2 (`DownloadDialog`'s warning) remains genuinely unobserved, but the SUMMARY
and todo already disclose this as future work rather than claiming it as done — there is nothing
to adjudicate.

### Gaps Summary

No gaps. All 12 must-have truths, all 4 required artifacts, and both key links verified directly
against the current source tree. The scoped test suite, `pnpm codecheck`, and
`python meta/runPlanningGates.py` were re-run independently in this verification session (not
taken from SUMMARY.md) and match the SUMMARY's claims. The one notable nuance — Case 4 in the RED
proof not actually achieving RED, for a disclosed incidental reason — does not constitute a gap:
the plan's own task text anticipated this possibility, and the executor reported it honestly rather
than fabricating failure text, which is precisely the behavior the must-have was designed to
require.

---

_Verified: 2026-09-23T06:15:00Z_
_Verifier: Claude (gsd-verifier)_
