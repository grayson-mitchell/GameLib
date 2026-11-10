---
phase: quick-261111-aq4
plan: 01
subsystem: sidecar / shortcuts / gog save sync
tags: [win32, known-folders, pathShim, shortcuts, save-sync, todo-closure]
status: complete
requires:
  - 66.2 readWindowsShellFolder registry lookup (quick 261111-5fw live gate)
provides:
  - "No win32 code path returns or uses a guessed <home>\\Desktop or <home>\\Documents"
affects:
  - src/backend/sidecar/pathShim.ts
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src/backend/save_sync.ts
key-files:
  modified:
    - src/backend/sidecar/pathShim.ts
    - src/backend/sidecar/__tests__/pathShim.test.ts
    - src/backend/shortcuts/shortcuts/shortcuts.ts
    - src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts
    - src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts
    - src/backend/save_sync.ts
    - src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
    - src/backend/sidecar/runnerMiscFlowRegistration.ts
    - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
    - src/backend/sidecar/__tests__/runnerMiscFlows.test.ts
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/sidecar/knownFolders.ts
    - src/backend/process/README.md
  moved:
    - .planning/todos/pending/2026-11-11-66.3-win32-known-folder-sync-fallback.md -> .planning/todos/completed/
decisions:
  - "Outcome (a) of the 66.3 todo: retire the win32 sync fallback. Outcome (b) is ruled out by live evidence."
  - "shortcuts: an unresolved win32 Desktop is a recorded failure (addShortcuts rejects, Start Menu .lnk still written), so the toast is honest."
  - "save sync: a location needing an unresolved <?DOCUMENTS?> is left out, not blanked, so gogdl never receives a guessed folder."
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
plan_head_before: 43724c7b8865e7096fc8985cc54c23331af709bd
plan_head_after: 03ec9f402569a00f8ba9e77a3c436e351632dccd
completed: 2026-11-11
---

# Phase quick-261111-aq4 Plan 01: Retire the win32 pathShim Desktop/Documents guess Summary

On win32 `pathShim.getPath('desktop'|'documents')` now throws a named error pointing at `readWindowsShellFolder`, and both callers (shortcuts, GOG native save sync) use the registry folder or go without it, never a guessed `<home>\Desktop` or `<home>\Documents`.

## Why outcome (a), not (b)

Live evidence from the operator's Windows 11 box on 2026-11-11 (written with `<profile>`, never the username):

- `Test-Path <profile>\Desktop` returned False; `Test-Path <profile>\Documents` returned True.
- `[Environment]::GetFolderPath('Desktop')` returned `<profile>\OneDrive\Desktop`; `'MyDocuments'` returned `<profile>\OneDrive\Documents`.

So the Desktop fallback named a folder that does not exist (a shortcut write fails) and the Documents fallback named a real but wrong folder (GOG native save sync would silently read and write the wrong directory). The fallback is not usable on that host.

## What was built

- **Task 1 (03013f202, tracer):** pathShim `desktop` win32 arm throws. `shortcutFiles` returns no Desktop path on win32 without a registry folder and never calls `app.getPath('desktop')`. `addShortcuts` records an unresolved Desktop as a failure (logError + `failures`), still writes the Start Menu `.lnk`, and rejects naming the Desktop and the registry lookup; if no Desktop shortcut was requested the failed lookup is not a failure. `removeShortcuts` removes the Start Menu `.lnk`, warns, never rejects. The linux and darwin arms keep their behavior (narrowed with `&& desktopFile`).
- **Task 2 (3101d837e):** pathShim `documents` win32 arm throws. `getDefaultGogSavePaths` no longer falls back to `app.getPath('documents')` on win32. The map is typed `Record<string, string | undefined>` (`satisfies ... | undefined`, exhaustiveness over all seven variables kept). After the already-defined check and before substitution, a location whose known variable is unresolved is left out with a `logWarning` naming it. Unknown variables behave as before. `runnerMiscFlowRegistration.ts` comments qualified (comments only).
- **Task 3 (03ec9f402):** the three host-platform tests pinned to linux, comments in `shortcutsFlowRegistration.ts` and the `knownFolders.ts` header corrected, the README hand-off rewritten, todo moved to `completed/` with a `## Resolution (code fix, quick 261111-aq4, 2026-11-11)` section. `graphify update .` was run.

## The two degradation choices

- **Shortcuts: the unresolved Desktop is a failure.** The sidecar's win32 success toast reads "Shortcuts were created on Desktop and Start Menu". A silent skip would make that claim false. Rejecting makes the error toast show, while `shortcutsExistOnDisk` still answers true from the Start Menu `.lnk` that was written.
- **Save sync: leave the location out, do not blank it.** The returned list reaches gogdl `save-sync` verbatim (CloudSavesSync.tsx -> gog/games.ts `syncSaves`), so an empty or guessed path would become the folder gogdl syncs. The Settings Sync Saves Retry button re-queries.

## Regression baseline (Task 1, unmodified tree) versus final

| Suite | Baseline | Final |
| --- | --- | --- |
| sidecar/__tests__/knownFolders.test.ts | PASS | PASS |
| sidecar/__tests__/pathShim.test.ts | FAIL (4 tests) | FAIL (same 4 tests) |
| sidecar/__tests__/runnerMiscFlows.test.ts | PASS | PASS |
| __tests__/getDefaultLegendarySavePathRefresh.test.ts | PASS | PASS (3 new tests) |
| shortcuts/__tests__/addShortcutsOutcome.test.ts | PASS | PASS (new win32 cases) |
| shortcuts/__tests__/shortcutsExistsFallback.test.ts | PASS | PASS |
| shortcuts/__tests__/removeShortcutsOutcome.test.ts | PASS | PASS (new win32 case) |
| sidecar/__tests__/shortcutsFlows.test.ts | FAIL (1 test) | FAIL (same 1 test) |

Totals: baseline 5 failed / 4 skipped / 137 passed; final 5 failed / 4 skipped / 146 passed. Nothing new fails.

The 5 pre-existing failures are Windows-host environment artifacts that no part of this change touches, and none was "fixed":

- Two `pathShim.test.ts` cases (desktop and documents "under the redirected home") and the one `shortcutsFlows.test.ts` containment case assert `x.startsWith(realHomeAtSetup) === false`. On this box the jest containment home lives under the real profile's `AppData\Local\Temp`, so the prefix holds.
- Two `pathShim.test.ts` linux-arm cases (the `homedir()/Desktop` fallback and the `user-dirs.dirs` one) compare a `/`-joined string with a `\`-joined one, which differs on a Windows host.

CI is ubuntu-only, where these pass. The two pathShim "under the redirected home" cases and the shortcutsFlows containment case, now pinned to linux, still fail on this Windows box for the prefix reason, so the pinning cannot show them green here, but they no longer depend on the win32 arm.

## Other gates

- `npx tsc --noEmit`: clean. `pnpm backend-di-ceilings`: PASS (jestMock=2363, 447 files; no shard JSON changed). `pnpm planning-gates`: 12/12. `npx prettier --check` over the exact `src/**` paths (including `src/backend/process/README.md`): clean. `npx eslint`: 0 errors (only pre-existing warnings).
- **No `jest.mock` site was added** (DI ceiling). The registry-success arm of `addShortcutsOutcome.test.ts` uses `jest.spyOn(gracefulFs, 'existsSync')`, which is not a census site, to answer the one existence check for the registry Desktop `.lnk`. That path is outside the containment home and is never created on disk. The GOG tests live in the existing legendary test file for the same reason, and the file was not renamed.

## Deviations from Plan

**1. [Rule 3 - Blocking] Registry-success `.lnk` existence check.** `writeWindowsShortcut` requires the `.lnk` to exist after PowerShell exits 0, but the plan forbids creating a file at the registry (non-contained) Desktop. Resolved with a scoped `jest.spyOn` on graceful-fs `existsSync` for the registry Desktop prefix only, restored in `afterEach`. Files: `addShortcutsOutcome.test.ts`. Commit 03013f202.

**2. [Rule 3 - Blocking] `shortcutFiles` return type narrowed.** The old implicit-any `desktopFile` hid that the element can be undefined; once typed, `tsc` flagged an `rmSync(app)` in `addShortcutsOutcome.test.ts` and the linux/darwin arms of `addShortcuts`. Fixed with `&& desktopFile` guards (no behavior change, those arms always have a path) and an `if (app)` guard in the test cleanup. Commit 03013f202.

**3. [Rule 2 - Missing] Logger mock `Gog` prefix.** The legendary test file's `backend/logger` mock had no `LogPrefix.Gog`; added it so the new GOG warning path is exercised with a real prefix value. Commit 3101d837e.

**4. Commit-guard note.** The Step 0 protected-branch assertion would refuse commits on `main`. This task was run on `main` by explicit instruction of the orchestrator and matches the repo's existing practice (recent commits are on `main`); no `git.allow_default_branch_commits` override is set in `.planning/config.json`. All three commits used pathspec commits so unrelated staged or modified files were never included.

`commits: 3` is the number of this plan's own commits. `git rev-list --count` over the ledger range reads 4 because another agent's `docs(quick-261111-a9g)` commit (4252a1d8e) landed on `main` in between.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or file-access pattern was introduced; the plan's T-aq4-01..06 mitigations are implemented and pinned by tests.

## Self-Check: PASSED

- Commits 03013f202, 3101d837e, 03ec9f402 exist on `main`.
- `.planning/todos/completed/2026-11-11-66.3-win32-known-folder-sync-fallback.md` exists with the `## Resolution (code fix, quick 261111-aq4` heading; the pending copy is gone.
- Every file in the plan's `files_modified` list was changed in a task commit.
