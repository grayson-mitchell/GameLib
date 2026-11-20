---
phase: quick-261102-0yc
plan: 01
subsystem: steam
tags: [windows, uac, steam-client-install, d-uat-17, sni-06]
requires: []
provides:
  - "Windows guided Steam install launched elevated via PowerShell Start-Process -Verb RunAs"
  - "startGuidedClientInstall awaits the launcher outcome on Windows and macOS and returns status error on a failed launch"
affects:
  - src/backend/storeManagers/steam/clientSetup.ts
tech-stack:
  added: []
  patterns:
    - "PowerShell single-quoted literal with apostrophes doubled for a path embedded in a powershell argv"
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/clientSetup.ts
    - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts
    - .planning/todos/pending/2026-11-02-d-uat-17-steam-setup-exe-spawn-eacces-on-windows.md
decisions:
  - "Use the repo's existing elevation path (powershell Start-Process -Verb RunAs, as gog/setup.ts) without -Wait and without -ArgumentList"
  - "Accept the 60s sidecar invoke bound and the cached-installer-on-failure edge; both recorded in the todo"
metrics:
  tasks: 2
  completed: 2026-11-02
status: complete
commits: 2
plan_head_before: d05c934d59eeeef8ec12773620d7174fe55cd498
plan_head_after: e79908a023f334668a860a3c57a46033e8d989cc
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Quick 261102-0yc: Windows guided Steam install launches elevated and reports the real outcome

On Windows, `startGuidedClientInstall()` now launches `SteamSetup.exe` through
`powershell Start-Process -FilePath '<path>' -Verb RunAs -ErrorAction Stop`, so UAC is raised
instead of CreateProcess failing with EACCES, and it awaits that launcher so a declined or failed
launch reaches the frontend error phase instead of a false "Installing the Steam client" banner.

## What changed

- `clientSetup.ts`: Windows argv is exactly `-NoProfile -NonInteractive Start-Process -FilePath
  <quoted> -Verb RunAs -ErrorAction Stop` with `{ windowsHide: true }` and no `env`. No `-Wait`, no
  `-ArgumentList`, no silent flag (D-10 / T-21-20 unchanged). The path goes through an unexported
  `toPowerShellLiteral` helper (single-quoted, apostrophes doubled).
- Exit 0 logs "launched" and returns `started`. A non-zero or null exit, or a spawn rejection, calls
  `logError` and returns `{ status: 'error', error }` with the Windows or macOS message. "launched"
  is never logged on failure. macOS awaits `open` the same way. Linux and the download/cache block
  are unchanged. The module header and JSDoc no longer describe a fire-and-forget launch.
- `clientSetup.test.ts`: replaced the old Windows test with success (exact argv, options),
  apostrophe-and-space quoting, no-unattended-flag, UAC-declined, spawn-rejection and null-code
  cases, plus a macOS failed-`open` case. `../constants` is mocked with a `steamSupportPath`
  holding `Jane O'Brien`. 12 tests became 18.
- The D-UAT-17 todo is `severity: major / platform: windows / ready: live-gate`, records commit
  `3f0df053c`, both known edges, and the owed live 4a re-run (NOT yet run).

## TDD

RED (6 failing before the fix): the Windows success/argv case, the quoting case, UAC-declined,
spawn-rejection, null-code and the macOS failed-`open` case. GREEN: all 25 tests pass across
clientSetup (18) and fakeHomeIsolation (7).

## Verification

- jest (clientSetup + fakeHomeIsolation): 25/25. `tsc --noEmit`: clean. eslint: 0 errors, 3
  warnings (baseline). `node meta/findDeadcode.cjs`: exit 0. prettier --check on both .ts files:
  pass. Structure greps: `'RunAs'` present, no direct `spawnAsync(destPath` outside comments, no
  "fire-and-forget" text.
- Todo gate passes (20 pending todos). `python meta/runPlanningGates.py`: only
  `state-sdk-field-anchor-gate.py` FAILs (pre-existing baseline). Prettier `--file-info` reports the
  todo ignored, so `--check` was omitted as vacuous.
- Live 4a (UAC prompt, visible Valve installer, decline path) is NOT run; it is the operator gate.
  The quoting design is the planner's reasoning about powershell.exe argv handling, not a
  measurement.

## Deviations from Plan

None - plan executed as written. Two process notes: commits went straight to `main`, because the repo
uses `branching_strategy: none` and the orchestrator ran the main tree; and the test's mocked
`steamSupportPath` uses posix separators (`/Users/Jane O'Brien/...`) so it behaves identically on
the ubuntu CI runner.

## Known Stubs

None.

## Deferred / accepted edges

- The Rust shell's 60s `INVOKE_TIMEOUT` now spans the download plus the UAC answer; a prompt left
  open longer shows the error phase while still up (Try again recovers).
- A launch failure keeps the cached `SteamSetup.exe`; a corrupt cached copy would fail every retry
  until deleted by hand.
- Task 2 committed the todo (`e79908a02`) as a task artifact. SUMMARY, STATE and ROADMAP are left to
  the orchestrator.

## Commits

- `3f0df053c` fix(quick-261102-0yc): launch the Windows Steam installer elevated and report the real launch outcome
- `e79908a02` docs(quick-261102-0yc): D-UAT-17 todo records the fix and awaits the live 4a re-run

## Self-Check: PASSED

clientSetup.ts, clientSetup.test.ts and the todo exist and are modified as described; both commit
hashes exist in `git log`.
