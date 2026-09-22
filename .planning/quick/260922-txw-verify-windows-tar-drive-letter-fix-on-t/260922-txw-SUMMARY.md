---
phase: quick-260922-txw
plan: 01
subsystem: tooling
tags: [windows, tar, gnu-tar, unquote, drive-letter, verification, todos]
status: complete

requires: []
provides:
  - "meta/downloadHelperBinaries.ts's -f drive-letter fix (fb9f0d458) CONFIRMED on a real Windows 11 box: negative control (pre-fix fd7d085fb copy) reproduces 'Cannot connect to C: resolve failed'; the post-fix functions list AND extract correctly, including the :138 relocation trap (separate absolute destDir, and a caller-relative destDir)"
  - "a SECOND, previously-unknown tar defect found and fixed live during this verification: GNU tar's default --unquote behaviour unescapes backslash sequences inside the -C operand (\\b/\\a in resolve('public/bin/arm64/darwin')), breaking extraction independently of the -f fix -- fixed with a small pure toTarPathOperand() helper, mutation-proven"
  - "the tar todo closed WITH A RESIDUAL (tag-push/CI-PATH/signing carried forward); a Layer B forced real download-helper-binaries run classified T-SYMLINK, appended as new evidence to the existing symlink todo rather than filed as a duplicate"
affects: [windows-single-instance-guard-and-gamelib-deep-link-registration, windows-release-leg-tar-drive-letter, windows-packaged-build-symlinks, windows-code-signing]

tech-stack:
  added: []
  patterns:
    - "toTarPathOperand(p, separator=path.sep): forward-slash a resolved absolute path before handing it to GNU tar as a -C operand -- a no-op on POSIX, PATH-agnostic, defends against --unquote's backslash-escape-sequence unescaping (a different GNU tar mechanism from the -f drive-letter remote-host parsing the sibling fix defends against)"
    - "Mutation-proof by hand: temporarily replace the fix under test with the pre-fix shape (identity function, or the literal old argv), observe the specific new test go RED with the expected error/diff, then restore and reconfirm GREEN -- done twice this session (the pure helper, and the real extractTarGz -C argv against real tar)"

key-files:
  created: []
  modified:
    - meta/downloadHelperBinaries.ts
    - meta/__tests__/downloadHelperBinaries.test.ts
    - meta/__tests__/tarDriveLetterSafety.test.ts
    - .planning/todos/completed/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md
    - .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md
    - .planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md

key-decisions:
  - "The orchestrator's live root-cause finding (GNU tar --unquote escape-sequence unescaping of the -C operand, not MSYS argv mangling as the prior executor theorized) was treated as authoritative and superseded the plan's original 'verification only, no product code' scope -- a real second defect existed and was fixed in this session, not just measured."
  - "The pre-existing tarDriveLetterSafety.test.ts fixture-builder bug (its own tar -czf call reproduced the exact pre-fix -f shape) was fixed in the SAME commit as the -C fix rather than left as a new pending todo, because it was fixed in the same session it was discovered -- deviating from the plan's Task 4 instruction to file a new todo for it (that instruction assumed the defect would be measured-but-not-fixed)."
  - "Decision rule for closing the tar todo (Layer A negative control reproduced AND all Layer A post_* PASS AND Layer B is NOT T-TAR) held on all three counts, so the todo was closed WITH A RESIDUAL per the plan's adopted recommendation, carrying the tag-push/CI-PATH-measurement/signing gaps into the signing todo rather than holding the tar todo open for them."
  - "Layer B's T-SYMLINK result was appended as NEW dated evidence to the existing symlink todo (2026-09-22-...-symlinks.md) rather than filed as a new todo, per the plan's explicit anti-duplication instruction -- the mechanism (GNU tar Windows symlink-creation failure without privilege) is the same class as that todo's Layers 0-1, even though this run's specific shape (0 links created at all) differs from the prior session's shape (links created but mistyped)."
  - "PowerShell legs (Layer A Step 3, Task 3's PowerShell jest run) were explicitly skipped -- this agent has no PowerShell tool, only a Git Bash tool -- and recorded as NOT DONE rather than silently omitted."

requirements-completed: [QUICK-260922-TXW]

duration: ~35min (this continuation session, post-handoff from the prior executor's Task-1-partial state)
completed: 2026-09-22
---

# Quick Task 260922-txw: Verify Windows Tar Drive-Letter Fix on This Windows Box Summary

**Fixed a second, live GNU-tar `--unquote` escape-sequence defect in the `-C` operand (found during this verification, not anticipated by the plan), then ran the full negative-control-then-positive Layer A harness and a forced real Layer B `download-helper-binaries` run on this Windows 11 box, closing the drive-letter tar todo with a residual and appending T-SYMLINK evidence to the sibling symlink todo.**

## Performance

- **Duration:** ~35 min (this continuation session)
- **Tasks:** all continuation-session work completed (fix + tests, Layer A, Layer B, jest, gates, todos, this SUMMARY)
- **Files modified:** 3 source/test files (1 fix commit), 3 todo markdown files (1 `git mv`'d to `completed/`)

## Accomplishments

**Root cause superseded and fixed.** The prior executor's "MSYS argv mangling" theory for the post-fix extraction failure was replaced by the orchestrator's measured finding: GNU tar's default `--unquote` behaviour unescapes backslash escape sequences (`\t \b \a \n \r \f \v`, octal) inside every operand, including `-C`. The real `destDir`, `resolve('public/bin/arm64/darwin')`, contains `\b` (from `...\bin\...`) and `\a` (from `...\arm64\...`) — GNU tar reads those as control characters instead of path separators. Measured directly on this host: the same backslash `-C` operand fails (exit 2, "Cannot open: No such file or directory"); the identical path with forward slashes succeeds (exit 0). This is a DIFFERENT mechanism from the `-f` drive-letter remote-host parsing `fb9f0d458` already fixed — `-C` is still never remote-parsed, that part of the original reasoning stands; it just did not anticipate `--unquote`.

**Fix shipped, `86ed30f42`.** Added `toTarPathOperand(p, separator = path.sep)` — a small pure helper (`p.split(separator).join('/')`, identity on POSIX) — applied to the resolved `-C` operand in `extractTarGz`. Not `--no-unquote` (GNU-only, bsdtar rejects it, same reason `--force-local` was rejected for `-f`) and not a hardcoded System32 tar path (PATH-agnostic by design, matching the existing `-f` remedy). Rewrote `extractTarGz`'s docblock to state the real mechanism and keep the `-f` basename rationale intact.

**Tests, same commit:**
- Pure unit coverage for `toTarPathOperand` (win32-shaped input, POSIX input, no-separator input) in `meta/__tests__/downloadHelperBinaries.test.ts`. **Mutation-proven, not merely present:** with `toTarPathOperand` temporarily replaced by an identity function, the win32-shaped test went RED (`Expected: "C:/x/public/bin/arm64/darwin"`, `Received: "C:\\x\\public\\bin\\arm64\\darwin"`); restored, all 3 tests GREEN. The existing `-C` argv pin was updated to route its expectation through the same helper.
- `meta/__tests__/tarDriveLetterSafety.test.ts`: its own `buildFixtureArchive` helper spawned `tar -czf <absolute C:\... path> -C <fromDir> <entry>` with NO `cwd` — the exact pre-fix `-f` shape. **Measured directly** (reverted temporarily, then restored): under GNU tar 1.35 on this host it fails in `beforeAll` with `fixture tar -czf failed (exit 2): tar (child): Cannot connect to C: resolve failed`, taking all 6 tests in the file down with it. Fixed to `cwd` + `basename`, same shape as the functions under test.
- Added a new case extracting into a destDir whose segments include `"bin"` and `"arm64"` — the real production hazard shape. **Mutation-proven against the real functions and real tar**, not just the pure helper: reverted the `-C` fix to the pre-fix absolute-with-native-separators shape, re-ran, and observed RED with the exact production error text: `tar: C\:\...\public\bin\arm64\darwin: Cannot open: No such file or directory`, exit 2 — and, as a bonus, a PRE-EXISTING test in the same file (`resolves a RELATIVE destDir...`) also went RED on the SAME pre-fix shape, because its `relativeCwdDir` mkdtemp path happened to contain `\n` (from `p57-relcwd-.../nested`), unescaping to a literal newline. Restored the fix; both tests GREEN again.

**Layer A (isolated, offline, Git Bash) — negative control reproduced, positive proven, `:138` relocation trap closed.** Built a symlink-free fixture archive, drove the pre-fix (`fd7d085fb`) and post-fix (HEAD, including this session's own `-C` fix) `listTarEntries`/`extractTarGz` over it:

```
TXW-RESULT tar=GNU
  pre_list=FAIL:tar -tzf failed (exit 2): tar (child): Cannot connect to C: resolve failed
  pre_extract=FAIL:tar extraction failed (exit 2): tar (child): Cannot connect to C: resolve failed
  post_list=PASS
  post_extract_abs=PASS
  post_extract_rel=PASS
```

Harness exit code 0 (all required conditions met). Temp files (`meta/_txw_harness.ts`, `meta/_txw_prefix_downloadHelperBinaries.ts`) deleted at end of task; `git status --porcelain` identical to the pre-task baseline afterward. **PowerShell leg skipped this session — no PowerShell tool available to this agent** (orchestrator's stated fallback).

**Layer B (real, forced `pnpm download-helper-binaries`, Git Bash, HEAD with both tar fixes) — classified T-SYMLINK, public/bin restored byte-for-byte.** `public/bin` moved aside (rename, not copy), `.release_tags`'s `__darwin_layout` forced to a fresh marker, then a real forced re-download of all `legendary`/`gogdl`/`nile` assets (all platforms, not just darwin). Result: exit 1, verbatim:

```
Error: tar extraction failed (exit 2): tar: gogdl/_internal/Python: Cannot create symlink to
'Python.framework/Versions/3.12/Python': No such file or directory
tar: gogdl/_internal/Python.framework/Python: Cannot create symlink to 'Versions/Current/Python': No such file or directory
tar: gogdl/_internal/Python.framework/Resources: Cannot create symlink to 'Versions/Current/Resources': No such file or directory
tar: Exiting with failure status due to previous errors
```

No `tar -tzf failed` line anywhere — `:89` listing passed for all three darwin archives; extraction (`:138`) got past the `-f`/`-C` argv entirely (`gogdl/gogdl` and 61 files landed) before failing specifically on the 3 `Python.framework` symlink entries. `legendary`/`nile` show 0 files (the top-level `Promise.all` race — the process exited as soon as `gogdl` rejected, before their downloads completed). Link-type counts in the run tree before restore: `SYMLINK: 0`, `SYMLINKD: 0`, `JUNCTION: 0` (a pure creation failure, a different shape from the pre-existing hand-repaired tree's earlier "created but mistyped" finding). Developer Mode IS enabled in the registry (`AllowDevelopmentWithoutDevLicense = 0x1`), but `whoami /priv` for this session does NOT list `SeCreateSymbolicLinkPrivilege` — likely enabled after this session's logon, not yet propagated to the process token.

**Restore verified four ways, all matched the pre-run snapshot exactly:** `sha256sum -c` on `.release_tags` (OK), full `find public/bin | sort` listing (clean diff), `dir /AL /S` symlink listing for `public/bin/arm64/darwin` (clean diff, ignoring header/free-space lines), `git status --porcelain` (clean diff). The interrupted run-tree backup (`txw-bin-run`) was deleted only after all four checks passed.

**Jest, Git Bash, both Meta suites:** `tarDriveLetterSafety.test.ts` + `downloadHelperBinaries.test.ts` — 2 suites / 59 tests, all PASS post-fix. PowerShell leg skipped, same reason as Layer A.

**Gates:**
- `pnpm codecheck` (`tsc --noEmit`): exit 0, no output. **Scope note:** `tsconfig.json`'s `include` is `["src"]` only (per quick-260922-n7s) — `meta/` is NOT typechecked by this gate at all; its only type coverage is `ts-jest` inside the Meta jest project, exercised above.
- `pnpm lint` (`node meta/lintScoped.cjs`): 0 errors, 638 pre-existing warnings (none new; `meta/` files ARE covered by this gate — 17 warning lines under `meta/` in the full run, none in the files this task touched). `production: PASS | tests: PASS`.
- `pnpm planning-gates` (`python meta/runPlanningGates.py`; `python3` is the WindowsApps Store stub on this box, `python` used, both recorded): 11/12 passed. The one failure, `planning-envelope-tag-gate.py` on `260922-p57-PLAN.md`, is the pre-existing known finding — not touched, not fixed.

**Todo closure.** All three decision-rule conditions held (negative control reproduced, all Layer A `post_*` PASS, Layer B is NOT T-TAR) — the tar todo was `git mv`'d to `completed/` with `status: completed`, `resolved: 2026-09-22`, `resolved_by: quick-260922-txw`, a PARTIAL RETRACTION note placed inline next to its original "`-C` ... passed through verbatim" claim (still true about remote-parsing; incomplete about `--unquote`), and a full dated `## Resolution` section (host, decision rule, both new defects found+fixed, Developer Mode measurement, two-profile-rule statement, verdict table, explicit NOT DONE/NOT MEASURED list). The signing todo gained a `## Carried residual` section naming the tag-push/CI-PATH/extraction-landed checks for the first real Windows tag push. The symlink todo gained a dated `## Evidence from quick 260922-txw` section with the T-SYMLINK classification, link-type counts, and the Developer Mode measurement — NOT a new todo, per the plan's anti-duplication instruction.

## Task Commits

1. **Fix + tests: forward-slash the `-C` operand to survive GNU tar's `--unquote`** — `86ed30f42` (fix)
2. **Todos: close tar todo with residual, append symlink evidence, carry signing residual** — `8f2d1c1be` (docs)
3. **Fix a staging gap in commit 2** — `b57fb96b3` (docs)

_Layer A and Layer B were measurement-only (per plan design): the two `meta/_txw_*` harness files were created, run, and deleted within the task, never staged; `public/bin` was moved aside and restored, net change zero, nothing to stage._

**Staging gap, caught and fixed same-session (`b57fb96b3`):** `git mv` on the tar todo ran BEFORE the frontmatter/RETRACTION/Resolution edits were applied to its working-tree content, so it staged a pure rename of the PRE-edit file (`status: OPEN`, no Resolution section) into `completed/`. The subsequent edits landed on disk but were never re-`git add`ed before commit `8f2d1c1be`, so that commit's diff for the tar todo shows `similarity index 100%`, zero content change. Caught by re-running the self-check's `grep` against the file's committed blob (not just the working tree) after the fact. Fixed with a follow-up commit (`b57fb96b3`) staging the already-correct working-tree content — no new edits, no `--amend` (per this repo's git protocol: always a new commit). Verified post-fix: `git status --porcelain` clean, `git diff 8f2d1c1be^ HEAD -- <path>` shows the full 122-line addition, `todo-frontmatter-gate.py` still passes.

## Files Created/Modified

- `meta/downloadHelperBinaries.ts` — Added `toTarPathOperand()`; `extractTarGz` now forward-slashes its resolved `-C` operand before handing it to `spawn('tar', ...)`; rewrote the function's docblock to state the real `--unquote` mechanism.
- `meta/__tests__/downloadHelperBinaries.test.ts` — Pure unit tests for `toTarPathOperand` (mutation-proven); updated the existing `-C` argv pin to route through the same helper.
- `meta/__tests__/tarDriveLetterSafety.test.ts` — Fixed `buildFixtureArchive`'s own pre-existing `-f` bug (cwd+basename); added a real-tar extraction case into a `bin`/`arm64`-segmented destDir, mutation-proven against the real functions.
- `.planning/todos/completed/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` — Moved from `pending/`. `status: completed`, `resolved`/`resolved_by` added. Inline PARTIAL RETRACTION note plus a full dated `## Resolution` section appended.
- `.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md` — Appended `## Carried residual` section.
- `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` — Appended `## Evidence from quick 260922-txw` section.

## Decisions Made

See `key-decisions` in frontmatter above (orchestrator root-cause supersession; same-session fixture-builder fix instead of a new todo; todo closure decision rule; T-SYMLINK evidence appended not duplicated; PowerShell legs skipped and recorded as NOT DONE).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug, escalated by explicit orchestrator instruction beyond the plan's original scope] Fixed the `-C` operand's GNU-tar `--unquote` escape-sequence hazard**
- **Found during:** orchestrator's live root-cause investigation of the prior executor's post-fix extraction failure, before this continuation session began.
- **Issue:** `extractTarGz`'s `-C` operand was left in native OS separator form; GNU tar's default `--unquote` unescapes backslash sequences inside it, corrupting real Windows destDirs containing `\b`/`\a`.
- **Fix:** Added `toTarPathOperand()`, applied to the resolved `-C` operand.
- **Files modified:** `meta/downloadHelperBinaries.ts`, `meta/__tests__/downloadHelperBinaries.test.ts`, `meta/__tests__/tarDriveLetterSafety.test.ts`.
- **Verification:** Mutation-proven twice (pure helper identity-mutant, and the real `extractTarGz` `-C` argv against real GNU tar) — both RED-then-GREEN, recorded verbatim above.
- **Committed in:** `86ed30f42`.

**2. [Rule 1 — Bug, in test infrastructure, fixed rather than filed as a new todo per explicit instruction] Fixed `tarDriveLetterSafety.test.ts`'s own fixture-builder `-f` bug**
- **Found during:** the same investigation (planner finding 1 in the original plan correctly predicted this).
- **Issue:** `buildFixtureArchive` passed an absolute `-f` archive path with no `cwd` — the exact pre-fix production shape — so it died in `beforeAll` under GNU tar on Windows.
- **Fix:** Changed to `cwd` + `basename`, matching the functions under test.
- **Files modified:** `meta/__tests__/tarDriveLetterSafety.test.ts` (same commit as #1).
- **Verification:** Measured RED (all 6 tests failing with the exact predicted error) before the fix, GREEN after, both reverted/restored cleanly.
- **Committed in:** `86ed30f42`.

---

**Total deviations:** 2 auto-fixed (both Rule 1 — real bugs with bounded blast radius, both explicitly directed by the orchestrator's superseding instructions rather than discovered independently mid-task).
**Impact on plan:** Both fixes were necessary for the verification to mean anything — Layer A/B would otherwise have exercised a still-broken `-C` path and a self-defeating test harness. No scope creep beyond what the orchestrator's instructions explicitly directed. The plan's own "no product code, no test code" framing was written before the `-C` defect was known to exist; it does not apply to this continuation.

## Issues Encountered

- **`pnpm exec jest --selectProjects Meta <pattern>` silently ignored a bare positional `testPathPattern` in this pnpm/Jest/Windows combination** (ran all 43 suites instead of 1) until a literal `--` was inserted before the pattern (`pnpm exec jest --selectProjects Meta -- <pattern>`), after which filtering worked exactly as expected (`--listTests` confirmed). Not a defect in the fix or tests — a local invocation quirk, worked around, not filed as a todo (no repo-code involvement, not reproducible without knowing this operator's exact toolchain).
- No PowerShell tool available to this agent — Layer A Step 3 and Task 3's PowerShell jest leg are explicitly NOT DONE, recorded as such in the tar todo's Resolution rather than silently skipped.
- **A `git mv` / staging-order bug lost the tar todo's content edits from its first docs commit** — see "Staging gap" under Task Commits above. Caught by re-checking the committed blob (not just the working tree) before finishing, fixed with a same-session follow-up commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The tar todo is closed. Its residuals (tag-push, CI-runner `where tar`, signing) are carried into the signing todo and will be observed for free on the first real Windows tag push.
- The symlink todo (`2026-09-22-...-symlinks.md`) remains open and now carries a second, independently-measured T-SYMLINK data point from this session — still needs its own fix (Direction section: scope darwin runners out of non-darwin builds, or pass correct link types to `symlinkSync`).
- Windows code signing remains blocked on certificate purchase (`ready: human`), unrelated to anything in this task.
- The other three `spawn('tar', ...)` sites named in the tar todo's census remain unaudited-by-execution (not reachable on the Windows leg per the existing census; unchanged by this task).

## Self-Check: PASSED

- FOUND: `meta/downloadHelperBinaries.ts` exports `toTarPathOperand`
- FOUND: commits `86ed30f42`, `8f2d1c1be`, `b57fb96b3` in `git log --oneline -5`
- FOUND: `.planning/todos/completed/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md`
- MISSING: `.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` (expected — moved to `completed/`)
- FOUND (checked against the COMMITTED blob, `git show b57fb96b3:<path>`, not just the working tree — this is what caught the staging gap): `status: completed`, the `## Resolution (2026-09-22` heading, and 2 occurrences of `PARTIAL RETRACTION` all present in the completed tar todo's committed content.
- FOUND: `.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md` contains `## Carried residual (2026-09-22, quick 260922-txw)`
- FOUND: `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` contains `## Evidence from quick 260922-txw`
- FOUND: `meta/_txw_harness.ts` and `meta/_txw_prefix_downloadHelperBinaries.ts` do NOT exist (temp files correctly deleted)
- FOUND: `git status --porcelain` is CLEAN except the two pre-existing untracked entries (phase-46 `.gitkeep`, this task's own directory) — no `public/bin` changes, no stray `meta/_txw_*`, nothing left uncommitted
- FOUND: `todo-frontmatter-gate.py` still reports `OK: 21 pending todo(s)` after the follow-up commit

---
*Plan: quick-260922-txw*
*Completed: 2026-09-22*

## Orchestrator addendum — PowerShell leg + CRLF fix (`e24acc402`)

PowerShell resolves System32 bsdtar 3.8.8. Under it, `tarDriveLetterSafety` was 1 failed / 5 passed:
bsdtar lists with CRLF and `listTarEntries` split on `'\n'`, leaving `\r` on every entry. That
also let a trailing `..\r` entry past the traversal check. Fixed with `split(/\r?\n/)`, plus a
mocked CRLF traversal case that is mutation-proven (1 failed / 53 passed on the old split,
60/60 fixed). Both tar suites are green in both shells. Nine other Meta suites fail under
PowerShell on this box (listed in the tar todo addendum); they were not investigated and are
unrelated to this task. Prettier drift left by `86ed30f42` is fixed in the same commit.
