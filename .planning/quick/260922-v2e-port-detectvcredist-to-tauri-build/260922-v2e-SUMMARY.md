---
phase: quick-260922-v2e
plan: 01
subsystem: tauri-sidecar
tags: [windows, vcredist, frontendReady, sidecar-exit-contract, mutation-testing, jest]
status: complete

requires: []
provides:
  - "detectVCRedist() ported into the Tauri-era sidecar, wired once per process from appShellFlowRegistration.ts's frontendReady one-shot boot block (D1/D2)"
  - "The powershell probe is bounded (VC_REDIST_PROBE_TIMEOUT_MS = 15_000, windowsHide) and its close handler is signal-safe (D3/D5), honoring the sidecar exit contract's in-flight-work half"
  - "Mutation-tested (M1/M2/M3, all measured red then restored green) proof that the wiring, the bound, and the signal-safe guard are each load-bearing"
  - "Live-proven on this Windows 11 box: probe count (6) and a live pnpm tauri:dev boot log line (Frontend Ready -> VCRuntime is installed (6 matching entries, probe 549 ms))"
affects: [windows-single-instance-guard-and-gamelib-deep-link-registration]

tech-stack:
  added: []
  patterns:
    - "Boot-time in-app dialog work must be wired at frontendReady, not bootstrap.ts's init() -- showDialogBoxModalAuto's sendFrontendMessage push is one-way and drops silently if no renderer listener is mounted yet"
    - "A referenced-work spawn (process handle + stdio pipes hold the event loop) is bounded via spawn's own { timeout, windowsHide } option, not unref() -- unref() would have to cover the child and all three pipes and would silently drop the result on a quick quit"
    - "A close handler for a spawn bounded by { timeout } must treat (code: number | null, signal: NodeJS.Signals | null) explicitly -- code === null on a timeout kill is falsy and a bare `if (code)` guard silently mis-routes into the success/nag branch"

key-files:
  created: []
  modified:
    - src/backend/utils.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/__tests__/detectVCRedistDialog.test.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - .planning/todos/completed/2026-09-06-detectvcredist-never-runs-on-windows.md

key-decisions:
  - "D1/D2 (plan): wired inside frontendReady's one-shot boot block, immediately after the initQueue(true) setTimeout is scheduled, in its own try/catch -- not bootstrap.ts's init() -- because the in-app dialog needs a mounted renderer and a throw must not skip the download-queue auto-resume."
  - "D3/D4: probe bounded via spawn's { timeout: VC_REDIST_PROBE_TIMEOUT_MS, windowsHide: true }, not unref() (referenced work, CLAUDE.md exit-contract half 2). VC_REDIST_PROBE_TIMEOUT_MS = 15_000 satisfies D4's rule (>= 3x the measured worst of 409ms, <= 30_000) -- no adjustment needed after Step A measurement."
  - "D5: close handler made signal-safe -- a timeout kill closes with code === null and a signal, which the old `if (code)` guard would treat as falsy/success and wrongly show the dialog. M3 mutation-proved this exact false-nag."
  - "D6: -NoProfile -NonInteractive prepended to the powershell argv so a user profile script cannot add latency or hang the probe until the timeout."
  - "D7: observability logs count + elapsed ms only (installed path) and a dedicated skip-path log line -- no DisplayNames, no stderr, per the threat model's information-disclosure disposition."
  - "Decision rule (Step E) applied strictly: CLOSE iff call wired + M1-M3 all red-then-green + Step A count >= 4 + Step B observed the live boot line. All four held -- todo closed, not retagged."
  - "Dialog-shown branch intentionally NOT live-proven (T-v2e-06, accept/forbidden): this box has the runtime installed (count 6); nothing was uninstalled, no registry key or skipVcRuntime was touched to force it. Its only evidence is the mutation-tested unit suite."

requirements-completed: [QUICK-260922-V2E]

duration: ~55min
completed: 2026-09-22
---

# Quick Task 260922-v2e: Port detectVCRedist to the Tauri Build Summary

**Ported the lost Windows startup call `detectVCRedist(mainWindow)` into the Tauri-era sidecar's `frontendReady` handler, bounded its powershell probe (15s timeout + signal-safe close), mutation-tested the wiring/bound/guard (M1-M3 all measured red then restored green), and live-proved it on this Windows 11 box (probe count 6, live `Frontend Ready` -> `VCRuntime is installed (6 matching entries, probe 549 ms)` boot line) -- then closed the todo.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3 completed
- **Files modified:** 5 (2 source, 2 test, 1 todo)

## Accomplishments

- `detectVCRedist()` (`src/backend/utils.ts`) now bounds its `powershell.exe` probe with `{ timeout: VC_REDIST_PROBE_TIMEOUT_MS, windowsHide: true }` (exported constant, 15_000ms default), hardens the argv with `-NoProfile -NonInteractive`, and makes its `close` handler signal-safe: a timeout kill (`code === null`, `signal` set) now logs a warning and shows no dialog, instead of falling through to the "not installed" nag.
- `detectVCRedistDialog.test.ts` gained 5 new tests (bound argv/options, timeout-kill signal-safety, non-zero-exit pinning, installed-count/elapsed log, skip-path log) in a new describe block; both pre-existing 260919-sch tests pass unmodified.
- `appShellFlowRegistration.ts`'s `frontendReady` handler now calls `detectVCRedist()` exactly once per sidecar process, inside the SAME `frontendReadyBootWorkDone` one-shot guard as the `initQueue(true)` auto-resume, immediately after that `setTimeout` is scheduled, wrapped in its own try/catch.
- `appShellFlows.test.ts` gained a new `260922-v2e: detectVCRedist wiring` describe block (3 isolated-registry tests: single-delivery call count, two-delivery one-shot, throw-does-not-skip-initQueue ordering), plus a narrow `../../utils` mock override.
- **Mutation table, all measured red then restored green:**

| ID | Mutation | Result |
|----|----------|--------|
| M1 | Removed the `detectVCRedist()` call site | RED: both wiring tests failed (0 calls, expected 1) |
| M2 | Removed `timeout: VC_REDIST_PROBE_TIMEOUT_MS` from spawn options | RED: bound test's `toMatchObject` failed, `timeout` key missing |
| M3 | Reverted close guard to `if (code)` (removed signal branch) | RED: timeout-kill test's dialog assertion failed -- `showDialogBoxModalAuto` was called once, the exact false-nag D5 exists to prevent |

- **Step A probe measurement** (read-only HKLM query, no HOME/APPDATA touched, two-profile rule N/A): 3 runs via the exact final argv, `count: 6` every run, elapsed `409ms / 375ms / 374ms`. `VC_REDIST_PROBE_TIMEOUT_MS = 15_000` satisfies D4's rule (>= 3x worst = ~1.2s, <= 30_000) with no adjustment needed.
- **Step B live boot observation** (`pnpm tauri:dev`, the plan's named deliberate real-profile arm): first attempt crashed pre-`frontendReady` on an unrelated environment race (`EBUSY` watching `gamelib_shell.exe` while cargo was still writing it) -- no repo/registry/config touched, process tree exited on its own. Second attempt succeeded; matching log lines from `%LOCALAPPDATA%\GameLib\logs\gamelib.log`:
  ```
  (22:51:41) [INFO]:    [Backend]:         Frontend Ready
  (22:51:42) [INFO]:    [Backend]:         VCRuntime is installed (6 matching entries, probe 549 ms)
  ```
  Full process tree (pnpm -> cross-env -> tauri.js -> [vite chain] + [rustup -> cargo -> gamelib-shell.exe -> sidecar node]) was walked and killed via `taskkill /PID <top> /T /F`; `tasklist` afterward confirmed zero `gamelib-shell.exe`/`cargo.exe`/`rustup.exe`/sidecar-or-vite `node.exe` processes remained. Both scratchpad capture files were deleted after the two lines above were copied out.
- **Step C obsolescence evidence** (recorded, not acted on): `gamelib-shell.exe` imports both `VCRUNTIME140.dll` and `VCRUNTIME140_1.dll`; the sidecar SEA binary shows 0 matches. No `.cargo/config.toml` anywhere in the repo (`crt-static` unset). Operator flag: since the shell itself needs a 14.x VC++ runtime to start at all, the in-app prompt can only ever reach a user with an OLDER 14.x runtime (enough to launch GameLib) but missing the specific 2022 Minimum/Additional entries the matcher counts.
- **Step D** `pnpm smoke:sidecar` FAILED (~0.45s, both attempts) for a reason confirmed unrelated to this change: `meta/sidecarStartupSmoke.cjs` calls `spawnSync('pnpm', ['build:sidecar'], ...)` with no `shell: true`, which resolves to `spawnSync pnpm ENOENT` on this Windows box (reproduced directly outside the smoke script). `pnpm build:sidecar` run standalone succeeds in 48ms. Recorded per the plan's Step D instruction ("record and do not chase"); not fixed here.
- Todo `.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md` closed per Step E's decision rule (all four conditions held): `git mv`'d to `completed/`, `status: completed`, `resolved: 2026-09-22`, `resolved_by: quick-260922-v2e`, full dated `## Resolution` section appended.

## Task Commits

1. **Task 1: Bound the probe and make its close handler signal-safe** -- bundled into the Task 2 commit below (plan explicitly directs a single combined commit for the 4 source/test files).
2. **Task 2: Wire the call into frontendReady's one-shot boot block, wiring tests, mutation table** -- `907c08886` (fix)
3. **Task 3: Live measurement, operator-flag evidence, closure decision, SUMMARY** -- `<see final metadata commit>` (docs)

## Files Created/Modified

- `src/backend/utils.ts` -- `VC_REDIST_PROBE_TIMEOUT_MS` (15_000, exported); bounded/hardened `spawn()` call; signal-safe `close` handler; skip-path and installed-count/elapsed `logInfo` lines; JSDoc naming the one call site.
- `src/backend/sidecar/appShellFlowRegistration.ts` -- `detectVCRedist` added to the existing `../utils` import; call site inside `frontendReady`'s one-shot boot block, own try/catch; module docstring's D-11 paragraph and `frontendReadyBootWorkDone`'s doc comment both updated to name the new boot-half member.
- `src/backend/__tests__/detectVCRedistDialog.test.ts` -- new `260922-v2e` describe block (5 tests): bound argv/options, timeout-kill signal-safety, non-zero-exit pinning, installed-count/elapsed log, skip-path log.
- `src/backend/sidecar/__tests__/appShellFlows.test.ts` -- narrow `../../utils` mock override (spreads real module, overrides only `detectVCRedist`); new `260922-v2e: detectVCRedist wiring` describe block (3 isolated-registry tests).
- `.planning/todos/completed/2026-09-06-detectvcredist-never-runs-on-windows.md` -- moved from `pending/` via `git mv`; frontmatter gained `status: completed` / `resolved` / `resolved_by`; body gained a full `## Resolution` section (mutation table, probe measurement, live-run evidence, obsolescence evidence, operator flags, decision-rule verdict).

## Decisions Made

See `key-decisions` in frontmatter above (D1-D7 restated, decision-rule application, dialog-branch disposition).

## Deviations from Plan

None affecting committed scope. One environmental flake was hit and retried (not a deviation from the plan -- the plan explicitly allows "at most two reasonable attempts"): the first `pnpm tauri:dev` attempt crashed on an `EBUSY` watcher race unrelated to this change; the second attempt succeeded and produced the required live-run evidence.

## Issues Encountered

- **`pnpm tauri:dev` attempt 1 crashed pre-`frontendReady`:** vite's `beforeDevCommand` file watcher hit `EBUSY: resource busy or locked, watch '...target\debug\deps\gamelib_shell.exe'` while `cargo` was still writing that file. Self-resolved: the crashed process tree exited fully on its own (`node:internal/fs/watchers`, `ELIFECYCLE` exit 1); confirmed via `tasklist` that no `gamelib-shell.exe`/`node.exe`/`cargo.exe` remained before retrying. Attempt 2 succeeded cleanly. No repo files, registry, or config were touched by either attempt.
- **`pnpm smoke:sidecar` fails on this box for an unrelated, pre-existing reason** -- see "Known Issues" below.

## Known Issues

**`pnpm smoke:sidecar` fails on this Windows box, unrelated to this change.** `meta/sidecarStartupSmoke.cjs` calls `spawnSync('pnpm', ['build:sidecar'], { cwd: REPO_ROOT, encoding: 'utf-8' })` without `shell: true`. On this box that resolves to `spawnSync pnpm ENOENT` (`pnpm` is a shell shim on Windows; `spawnSync` without shell resolution cannot locate it) -- reproduced directly and identically outside the smoke script via `spawnSync('pnpm', ['--version'], ...)`. `pnpm build:sidecar` run directly (not through the smoke script) succeeds in 48ms, confirming the bundle itself builds fine. This file is not in this plan's `files_modified` list and was not touched by any command run in this task; per the scope-boundary rule it was recorded, not fixed. Same pattern as `260922-toc-SUMMARY.md`'s "Known Issues" precedent.

**`pnpm planning-gates` reports 11/12, not 12/12.** The one failure (`planning-envelope-tag-gate.py`, flagging `.planning/quick/260922-p57-make-tar-invocations-drive-letter-safe-o/260922-p57-PLAN.md`) is the same pre-existing, unrelated defect already recorded in `260922-toc-SUMMARY.md`'s "Known Issues" -- untouched by this task, out of scope per the scope-boundary rule.

## Operator Flags (surfaced, not acted on)

1. **Naming-risk latency in the matcher.** The parent redistributable registry entry on this box now reads `Microsoft Visual C++ v14 Redistributable (x64|x86) - 14.51.36247`, not "...2022...". The 6 individual Minimum/Additional/Debug entries `detectVCRedist`'s `.includes('Microsoft Visual C++ 2022')` check actually counts still carry the literal "2022" substring today, so nothing broke here -- but if Microsoft ever renames those the same way it renamed the parent bundle entry, the matcher would stop counting them and would nag users who have the runtime installed. Not acted on; recorded in the todo's Resolution section per the plan's decision-point instruction.
2. **The shell binary's own VCRUNTIME140 dependency narrows who the prompt can reach.** `gamelib-shell.exe` dynamically links `VCRUNTIME140.dll`/`VCRUNTIME140_1.dll`. A machine missing every 14.x VC++ runtime cannot start GameLib at all, so the in-app "not installed" dialog can only ever reach a user who has an older 14.x runtime (enough to launch the shell) but is missing the specific 2022 entries. Not acted on; the check's original purpose (games needing the runtime, not the launcher) is unaffected.

## Gates

- `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/__tests__/detectVCRedistDialog.test.ts` -- 52/52 passed.
- `pnpm codecheck` (`tsc --noEmit`) -- clean, no output.
- `pnpm lint` -- 0 errors, 638 pre-existing warnings across the repo (none newly introduced in the 4 touched source/test files; verified line-by-line against each file's warning list).
- `prettier --check` on all 4 touched source/test files -- clean.
- `pnpm planning-gates` -- 11/12 (the pre-existing, unrelated `260922-p57-PLAN.md` envelope-tag finding, see "Known Issues").
- `pnpm smoke:sidecar` -- FAILED, unrelated pre-existing Windows spawn-shim gap in the smoke script itself (see "Known Issues"); the probe/wiring changes made in this task are not implicated (build:sidecar itself builds fine standalone).

## Self-Check: PASSED

- FOUND: `src/backend/utils.ts` contains `VC_REDIST_PROBE_TIMEOUT_MS`
- FOUND: `src/backend/sidecar/appShellFlowRegistration.ts` contains `detectVCRedist()`
- FOUND: commit `907c08886` in `git log --oneline`
- FOUND: `.planning/todos/completed/2026-09-06-detectvcredist-never-runs-on-windows.md`
- MISSING: `.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md` (expected -- moved to completed/)
- FOUND: `git status --porcelain` shows no leftover mutation markers, no leftover scratchpad staging
- FOUND: `tasklist` shows zero `gamelib-shell.exe`/`cargo.exe`/`rustup.exe` processes after cleanup

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- `detectVCRedist` is live and verified on Windows; no further work needed for this todo.
- The `pnpm smoke:sidecar` Windows spawn-shim gap (`meta/sidecarStartupSmoke.cjs`'s unshelled `spawnSync('pnpm', ...)`) is a candidate for its own follow-up todo -- not filed here per this task's scope.
- The pre-existing `planning-envelope-tag-gate.py` failure in `260922-p57-PLAN.md` remains unresolved (a two-line stray-tag deletion), same as noted in `260922-toc-SUMMARY.md`.

---
*Plan: quick-260922-v2e*
*Completed: 2026-09-22*
