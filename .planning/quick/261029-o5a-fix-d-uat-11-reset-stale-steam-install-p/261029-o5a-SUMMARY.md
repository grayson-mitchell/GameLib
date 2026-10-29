---
phase: quick-261029-o5a
plan: 01
status: complete
requirements: [D-UAT-11]
commits: [14f572a2a, 479322d5d]
completed: 2026-10-29
---

# Quick 261029-o5a: Zero Steam install progress after a Delete Files cancel

`deleteCancelledSteamInstall` now emits a zero-percent `sendProgressUpdate` (status `done`, runner `steam`) right after a successful delete. That resets the frontend `useInstallProgressRaw['<appId>_steam']` store entry, which every mounted `hasProgress` mirrors. Refusals, the `delete failed` branch, and Stop & Keep Files are unchanged.

## Commits
- 14f572a2a fix: cancelDelete.ts emit, backend regression test, frontend store guard test
- 479322d5d docs: todo moved to completed with Resolution, UAT D-UAT-11 blockquote and open_findings entry updated

## Regression proof (RED, before the source change)
`cancelDelete.test.ts` "resets the frontend progress to 0 once the partial install is deleted (D-UAT-11)":

    Expected number of calls: 1
    Received number of calls: 0
    > 123 |     expect(sendProgressUpdate).toHaveBeenCalledTimes(1)
    Tests: 1 failed, 17 passed, 18 total

After the change: Backend cancelDelete 18/18 pass; Frontend InstallProgress.reset 1/1 pass (as expected it passed on old code too, since the store overwrites); `tsc --noEmit` clean; prettier --check clean on the 3 TS paths (all `ignored: false`); `pnpm planning-gates` 12/12.

## Deviations
- Skipped the optional "delete failed" no-emit test: the file has no seam to make `rmSync` throw (it is imported directly from `node:fs`).
- Refusal no-emit assertions were added by appending to every `clearSteamResumeBreadcrumb not.toHaveBeenCalled` line (covers the settle-timeout test and all refusal cases).
- Task 2 verify omits `prettier --check` for the todo and UAT files: both are `ignored: true` under `--file-info`.

## Observation (not actioned)
A normal uninstall leaves the same never-cleared store entry; out of scope for D-UAT-11, no todo created.

## Status
Code fix only; not live re-tested on Windows. UAT finding stays MINOR open.
