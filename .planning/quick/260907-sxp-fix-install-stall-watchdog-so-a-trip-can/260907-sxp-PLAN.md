---
phase: quick-260907-sxp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/downloadmanager/installStallWatchdog.ts
  - src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts
  - .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md
autonomous: true
requirements: [TODO-260827-STALL]
baseline_sha: 5623c6c28

must_haves:
  truths:
    - "A watchdog trip signals the appName's registered AbortController, at the moment of the trip, before the caller can observe the rejection."
    - "A trip with NO controller registered for that appName signals nothing and emits no `[ERROR] Aborting not possible` log."
    - "`withStallTimeout` still imports nothing from `storeManagers/steam` — the runner-agnostic contract in its own header holds."
    - "At least one new test FAILS against the tree at 5623c6c28 and passes after the fix; at least one pre-existing test is green in BOTH states."
    - "The todo records the verified mechanism at HEAD and stays OPEN — this plan does not claim to close it."
  artifacts:
    - path: "src/backend/downloadmanager/installStallWatchdog.ts"
      provides: "trip() signals cancellation via the existing abort registry"
      contains: "hasAbortController"
    - path: "src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts"
      provides: "RED/GREEN coverage asserting the signal, not the rejection"
      contains: "signal.aborted"
    - path: ".planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md"
      provides: "corrected mechanism record, narrowed hypotheses, residual"
      contains: "Verified at HEAD"
  key_links:
    - from: "src/backend/downloadmanager/installStallWatchdog.ts"
      to: "src/backend/utils/aborthandler/aborthandler.ts"
      via: "hasAbortController + callAbortController inside trip()"
      pattern: "callAbortController\\(appName\\)"
---

<objective>
Make a `withStallTimeout` trip signal cancellation to the wrapped install itself, instead of
depending on its caller's `finally` to do it — and record, honestly, that this hardening cannot by
itself account for the 51-minute orphan the todo observed.

Purpose: `withStallTimeout` is exported and documented as runner-agnostic. Today it only rejects;
every abort on the stall path comes from ONE caller's `finally` block. That is a real fragility (a
second caller would leak outright), and it is what the todo's "fix direction" asks for.

Output: watchdog aborts on trip (gated), RED/GREEN tests that assert the SIGNAL rather than the
rejection, and a corrected todo that stays OPEN with narrowed hypotheses.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md
@src/backend/downloadmanager/installStallWatchdog.ts
@src/backend/utils/aborthandler/aborthandler.ts
@src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts

<planner_findings>
Verified against the tree at `5623c6c28` (2026-09-07). These narrow the task; read them before
touching code, and do NOT re-derive them from scratch.

**F1 — THE TODO'S MECHANISM PARAGRAPH IS AN INCOMPLETE ACCOUNT OF HEAD. An abort ALREADY fires on
the stall path.** `installQueueElement` (`downloadmanager/utils.ts`) catches the `StallError`, sets
`status = 'error'`, returns — and its `finally` then runs the `if (status === 'error')` branch at
~L346-380, which does `hasAbortController(appName)` then `callAbortController(appName)`, plus
`SteamGame.stop(false)` for `runner === 'steam'`. That branch landed in `c41684299` (2026-08-16,
quick 260816-vgc) and was gated on `hasAbortController` in `7024bc1ad` (2026-08-22, 37-05) — **both
five-plus days BEFORE the 2026-08-27 live observation.** So on 2026-08-27 a trip did signal an
abort, one microtask after rejecting, and the depot loop still ran for 51 minutes.

**Consequence for this plan: moving the abort into `trip()` is redundancy hardening, and it CANNOT
be claimed to close the todo.** It fires the same `callAbortController(appName)` a microtask
earlier. Task 3 exists precisely so this is recorded rather than quietly shipped as "the fix". Do
not write a SUMMARY that says the orphan-download defect is resolved.

**F2 — the abort signal IS threaded and IS honoured, so "nobody honours the signal" is also not the
explanation.** `games.ts:1651` `createAbortController(this.appId)`; `games.ts:1771` passes
`signal: controller.signal` into the depot download; `depot.ts` consults it ~50 times
(`throwIfAborted` between major steps, an abort-interruptible `delay(ms, signal)`, per-chunk
`signal?.aborted` checks, and an `opts.signal?.aborted -> outcome 'cancelled'` forcing at ~L2902).
`depot.ts` has not been touched since 2026-08-22, i.e. that machinery was live on 2026-08-27.

**F3 — key alignment is real.** `SteamGame`'s `appId` is its constructor argument
(`games.ts:534-539`), and `libraryManagerMap.steam.getGame(appName)` constructs it from `appName`,
so `callAbortController(appName)` and `createAbortController(this.appId)` address the same registry
key. `downloadqueue.ts:379` relies on the same alignment.

**F4 — leading UNCONFIRMED hypothesis for the real orphan, for the todo record only (do NOT fix it
in this plan).** `createAbortController` does `abortControllers.set(id, controller)` — "add or
update". A SECOND run for the same appId therefore REPLACES the first run's controller in the
registry, and the first run's controller becomes permanently unreachable: no `callAbortController`
can ever abort it. The todo's own session notes say several large downloads were started and
cancelled. If 402060 was started, cancelled and restarted, the surviving loop could belong to the
FIRST run, which would survive both the watchdog trip AND the user's Cancel — matching every
observed symptom. Unconfirmed: nothing in the captured log proves 402060 was restarted.

**F5 — runner coverage census (answers the todo's "not yet established" item).** Measured, not
assumed:
- `steam`: registers under `appId` for the whole native depot run (`games.ts:1651`, deleted in
  `runNativeDepotDownload`'s own `finally` at ~L1860). Covered while installing.
- `gog`, `legendary`, `nile`, `zoom`: their install work runs as child processes through
  `runRunnerCommand` (`launcher.ts:1723`), where `abortId = options?.abortId || appName` and every
  install call site passes `abortId: this.id` / `abortId: this.appName` — i.e. the appName.
  `deleteAbortController(abortId)` runs at `launcher.ts:1857` when the command ends. So coverage is
  INTERMITTENT: present while a runner command is spawned, absent before the first one and between
  consecutive ones. An abort there kills the spawned child via `spawn`'s `signal`.
- `sideload`: `storeManagerCommon/games.ts:114/174` registers under `abortId: appName` on the
  BROWSER-GAME launch path, not on an install path. A sideload install registers no controller.
  **This is why the `hasAbortController` gate is mandatory, not decorative** — an ungated
  `callAbortController` in `trip()` would emit `[ERROR][Backend] Aborting not possible. Could not
  find a matching abort controller for <appName>` on exactly the false-alarm shape 37-05 removed
  from the sibling caller.

**F6 — the unhandled-rejection worry in the task brief does not apply to the current shape, and
must not be broken by the change.** `Promise.race` attaches handlers to BOTH inputs, so a late
rejection of the inner install promise (after the race already settled) is consumed by the race and
never surfaces as an `unhandledRejection`. Keep `Promise.race` as the composition primitive; if you
restructure it, you own this hazard. Task 1 pins it with a test.

**F7 — single production call site confirmed.** `grep -rn withStallTimeout src` yields exactly
`downloadmanager/utils.ts:23` (import) and `:239` (call), plus the test file.

**F8 — jest trap in this project.** `src/backend/jest.config.js` sets `resetMocks: true`. A
`jest.mock(path, () => ({ ...jest.requireActual(path), fn: jest.fn(actual.fn) }))` factory loses its
implementation between tests under `resetMocks`. Use bare `jest.fn()`s with NO implementation
(history-reset is harmless), or assert on the REAL registry instead of a spy.
</planner_findings>

<interfaces>
From `src/backend/utils/aborthandler/aborthandler.ts`:

- `createAbortController(id: string): AbortController` — set-or-UPDATE, see F4
- `callAbortController(id: string): void` — `logError`s on a GENUINE lookup miss
- `deleteAbortController(id: string): void`
- `hasAbortController(id: string): boolean` — read-only registration query

From `src/backend/downloadmanager/installStallWatchdog.ts`:

- `INSTALL_NO_PROGRESS_TIMEOUT_MS: number`
- `interface StallError extends Error { isStall: true; msSinceProgress: number }`
- `isStallError(err: unknown): err is StallError`
- `withStallTimeout<T>(promise: Promise<T>, appName: string, stallMs: number, label: string): Promise<T>`

The logger module specifier used across this seam is `backend/logger`, exporting `logError`,
`logInfo`, `logWarning`, `LogPrefix`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — tests that assert the SIGNAL, not the rejection</name>
  <files>src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts</files>
  <behavior>
    Four new cases appended to the existing `describe('withStallTimeout')` block. Each must fail for
    a REAL assertion reason against the tree at `5623c6c28`, not a module-resolution error.

    - T-A (positive, decisive): register a real controller via `createAbortController(appName)`.
      Run `withStallTimeout(new Promise(() => {}), appName, stallMs, 'test')`, advance fake timers
      to `stallMs`, await the rejection. Assert `controller.signal.aborted === true` AND
      `isStallError(err) === true`, so the case pins both halves. RED today: `Received: false`.
    - T-B (ordering): as T-A, but an `abort` listener on `controller.signal` records a monotonic
      tick, and the caller's rejection handler records the same tick. Assert the abort tick is
      recorded and is strictly earlier than the rejection tick. RED today — the abort never fires,
      so the abort tick stays `undefined`.
    - T-C (no spurious ERROR): register NO controller. Mock `backend/logger` (shape per F8) and
      assert `logError` was called ZERO times across the trip, and that the guarded promise still
      rejects with a `StallError`. Green both before and after BY DESIGN — it is the counter-failure
      guard for Task 2's gate, not a RED case.
    - T-D (F6 regression pin): inner promise rejects 1s AFTER the trip. Capture
      `unhandledRejection` for the duration, trip the watchdog, flush under REAL timers, assert zero
      captured. Green both before and after — it exists so Task 2 cannot silently break
      `Promise.race`'s late-rejection absorption.

    The 10 existing cases are not modified or reordered.
  </behavior>
  <action>
Append the four cases described above to
`src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts`.

Import `createAbortController` and `deleteAbortController` from
`backend/utils/aborthandler/aborthandler` — the REAL module for T-A and T-B, because asserting
`controller.signal.aborted` proves the abort was genuinely signalled, whereas a call-count spy would
only prove a function was invoked. The task brief's scope item 5 asks for the former.

For T-C, mock the logger per F8 with bare `jest.fn()`s and a plain-object `LogPrefix` — a factory
returning `LogPrefix` as an object literal plus `logError`, `logInfo` and `logWarning` as bare
`jest.fn()`s is `resetMocks: true`-safe, because none of the mocks carries an implementation to
lose. Note that `aborthandler` imports `logError` from the same `backend/logger` specifier, so this
mock covers the registry's own error log — which is the log T-C asserts the absence of.

For T-D, register the listener with `process.prependListener('unhandledRejection', ...)`, remove it
in a `finally`, and do the flush with `jest.useRealTimers()` followed by awaiting a
`setImmediate`-resolved promise. A microtask-only flush will not observe the event.

Every new case uses a UNIQUE `appName` (the existing suite's convention) so the shared
`backendEvents` bus and the shared abort registry cannot leak between cases, and every case that
registers a controller calls `deleteAbortController` in a `finally` — the registry is module-global
and `resetMocks` does not clear it.

Commit the tests ALONE, before any production edit, so the RED is a property of the commit rather
than of a hand-edited working tree.

RECORD THE RED VERBATIM in the SUMMARY: the failing test names and the actual assertion text
(`Expected: true / Received: false`). A RED that reads as a module-resolution error or a TypeError
is NOT a valid RED — fix the harness and re-observe. Also record that T-C and T-D are green at this
point; if either is RED here, STOP AND REPORT, because that means the harness itself is broken.
  </action>
  <verify>
    <automated>pnpm jest --selectProjects Backend --testPathPattern 'installStallWatchdog' 2>&1 | tail -40</automated>
  </verify>
  <done>Suite runs 14 tests: T-A and T-B FAIL on a real assertion, T-C and T-D pass, all 10 pre-existing cases pass. Failure text captured verbatim. Tests committed on their own.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — trip() signals the abort, gated, before it rejects</name>
  <files>src/backend/downloadmanager/installStallWatchdog.ts</files>
  <behavior>
    T-A and T-B go green. T-C, T-D and all 10 pre-existing cases stay green. No new import from
    `storeManagers/*`.
  </behavior>
  <action>
Import `callAbortController` and `hasAbortController` from
`backend/utils/aborthandler/aborthandler`, and `LogPrefix`, `logInfo`, `logWarning` from
`backend/logger`. `aborthandler` imports only `backend/logger`, which imports nothing from
`storeManagers/*`, so the header's runner-agnostic constraint holds and no import cycle is created.
Confirm that with the grep in `<verify>` rather than asserting it.

Inside `trip()`, BEFORE the `rejectStall(...)` call:

- If `hasAbortController(appName)` is true — `logInfo` a line naming the WATCHDOG as the aborter,
  then `callAbortController(appName)`. The line must be textually distinguishable from
  `installQueueElement`'s existing `Aborting in-flight download for ${appName} after terminal
  install failure`, because a future live capture needs to tell the two abort sources apart; that
  distinguishability is the entire point of the log line, so do not paraphrase the existing wording.
- Else — `logWarning` that the watchdog tripped with no registered controller for this appName, so
  nothing could be signalled. NEVER call `callAbortController` unguarded here: per F5 a sideload
  install registers nothing at all, and the four CLI runners are registered only while a runner
  command is spawned, so an ungated call would emit the exact `[ERROR][Backend] Aborting not
  possible` false alarm that 37-05 removed from the sibling caller.

ORDERING — abort BEFORE reject. Reproduce this justification in the code comment:
(a) `callAbortController` is synchronous, so aborting first is strictly earlier and can never be
later than the status quo, where the abort arrives one microtask after the rejection via
`installQueueElement`'s `finally`; (b) the abort IS the cancellation act and the rejection is only
the report of it — reporting failure before cancelling is the ordering the todo criticises;
(c) rejecting first yields control to the caller's `catch`, and this module must not depend on what
any particular caller chooses to do there.

Keep `return await Promise.race([promise, stallPromise])` and the `finally` EXACTLY as they are.
Per F6 the race already absorbs the inner promise's late rejection, so restructuring would create an
unhandled-rejection hazard that does not currently exist. Do not touch the `finally`: clearing the
timer and detaching the listener remains correct on the abort path, because the abort changes
nothing about the listener's or the timer's lifetime.

Extend the file's header comment with a short paragraph stating that the watchdog now signals
cancellation through the shared abort registry, that the registry is keyed by `appName`, and that
registration is NOT guaranteed for every runner (name sideload explicitly) — so the gate is
load-bearing rather than defensive decoration.

Do not refactor anything else in this file, and do not touch `downloadmanager/utils.ts`: its
`finally`-block abort stays exactly as it is. The two paths are deliberately redundant, and F1 is
the reason.
  </action>
  <verify>
    <automated>pnpm jest --selectProjects Backend --testPathPattern 'installStallWatchdog' 2>&1 | tail -20 && grep -c "storeManagers" src/backend/downloadmanager/installStallWatchdog.ts; pnpm codecheck</automated>
  </verify>
  <done>14/14 pass. `grep -c storeManagers` on the watchdog returns 0. `pnpm codecheck` exits 0. Non-vacuity re-proved by holding the commit constant and varying the TREE — `git show <task-2-sha>^:src/backend/downloadmanager/installStallWatchdog.ts` written back into the tree, suite re-run (T-A/T-B red again), tree restored and verified byte-identical. Never `git checkout --`: the repo's post-checkout hook triggers a helper-binary download.</done>
</task>

<task type="auto">
  <name>Task 3: Record — correct the todo, keep it OPEN, name the residual</name>
  <files>.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md</files>
  <action>
The todo stays in `pending/` with `status: OPEN`. This plan hardens the watchdog; it does not
explain the 51-minute orphan, and the record must say so plainly.

Add a `## Verified at HEAD (2026-09-07, quick 260907-sxp, tree 5623c6c28)` section containing:

1. F1, with the two commit shas and dates (`c41684299` 2026-08-16, `7024bc1ad` 2026-08-22) and the
   explicit consequence: an abort WAS already signalled on the stall path on 2026-08-27, so the
   `Promise.race` reading in this todo's own Mechanism section is a correct statement about
   `withStallTimeout` in isolation but an incomplete account of the running system. Do not delete
   the original Mechanism section — annotate it, so the correction carries a dividing sha rather
   than quietly superseding the earlier claim.
2. F2, with the depot.ts evidence and the fact that depot.ts was unchanged since 2026-08-22.
3. F3 — key alignment confirmed, so a wrong-key miss is ruled out for Steam.
4. What 260907-sxp actually changed: the watchdog now aborts on trip, gated on
   `hasAbortController`, before rejecting — hardening that removes the module's dependence on one
   caller's `finally`, NOT a fix for the observed symptom.

Replace the `## Not yet established` bullet "Whether other `withStallTimeout` callers (non-Steam
runners) leak the same way" with the F5 census as a settled finding, keeping the per-runner detail
including the sideload-registers-nothing case and the intermittent CLI-runner window. Leave the
CDN-auth-cause bullet as it stands — this task establishes nothing about it.

Add a `## Narrowed hypotheses (unconfirmed)` section carrying F4 as hypothesis A, with its code
citation (`aborthandler.ts` `set` is add-or-update) and the honest caveat that nothing in the
captured log proves 402060 was restarted; and hypothesis B — the abort fired, the signal was
honoured at every checkpoint depot.ts has, and the wedged code path sat somewhere that has no
checkpoint. State what evidence would discriminate them: a log capture showing whether the
`Aborting in-flight download for 402060` INFO line (or the `No in-flight download to abort` warning)
appeared between the 21:50:55 ERROR and the 21:50:56 WARNING. The todo's quoted excerpt shows
neither, which is why this is undetermined rather than answered.

Add a `## Residual` section: closing this todo needs a live re-drive under genuine CDN-stall
conditions, which cannot be manufactured on demand and is out of scope for a quick task. Note that
the original observation was on the ELECTRON shell during the 34.13 UAT and that the app has since
cut over to Tauri (Phase 35, 2026-08-29), so any re-drive must be performed on the Tauri shell and
an Electron-era reproduction cannot be assumed to transfer.

Do NOT move this file to `completed/`.
  </action>
  <verify>
    <automated>grep -c "Verified at HEAD" .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md; grep -c "^status: OPEN" .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md; ls .planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md 2>&1 | grep -c "No such file"</automated>
  </verify>
  <done>All three greps return 1. The todo names the F5 census as settled, carries both hypotheses as unconfirmed, and states the Tauri-shell residual.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none crossed | All three tasks are local to the backend process. No new input is parsed, no network call is made, no IPC surface changes, no package is installed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sxp-01 | Denial of Service | `trip()` calling `callAbortController(appName)` | mitigate | The registry is keyed by `appName` and the watchdog is instantiated per-install with that same `appName`, so a trip can only abort its own install. Task 1's T-A/T-B use unique appNames and delete their registrations, so no cross-test abort is possible either. |
| T-sxp-02 | Repudiation | abort-source ambiguity in the log | mitigate | Task 2 requires the watchdog's `logInfo` to be textually distinct from `installQueueElement`'s existing abort line, so a future capture can attribute which of the two redundant paths fired. This is the evidence the residual live re-drive depends on. |
| T-sxp-03 | Information Disclosure | new log lines | accept | The lines carry only `appName` (a Steam AppID or runner app name), already logged verbatim throughout this seam. |
| T-sxp-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this plan. No Package Legitimacy Audit required. |
</threat_model>

<verification>
1. `pnpm jest --selectProjects Backend --testPathPattern 'installStallWatchdog'` — 14/14 pass,
   1 suite. Confirm the suite actually ran: `--selectProjects` is case-sensitive in this repo and a
   mismatched project name exits 0 having run nothing, so check the reported suite/test counts, not
   the exit code.
2. `pnpm codecheck` exits 0.
3. `grep -c "storeManagers" src/backend/downloadmanager/installStallWatchdog.ts` returns 0 — the
   runner-agnostic contract in the file's own header still holds.
4. Non-vacuity, proven by holding the commit constant and varying the tree (never
   `git checkout --`, which fires the repo's post-checkout helper-binary download): T-A and T-B go
   red against the pre-Task-2 blob and green after; T-C, T-D and the 10 pre-existing cases are green
   in BOTH states. Both directions recorded in the SUMMARY.
5. `git diff <baseline>..HEAD --stat` touches exactly the three files in `files_modified`.
   `downloadmanager/utils.ts`, `depot.ts` and `games.ts` are NOT modified.
</verification>

<success_criteria>
- A watchdog trip aborts the appName's registered controller before the caller observes the
  rejection, and does nothing (no ERROR) when no controller is registered.
- The RED is recorded verbatim, in both directions, and at least one pre-existing test is green in
  both states as the counter-failure guard.
- `installStallWatchdog.ts` imports nothing from `storeManagers/*`; `Promise.race` and the `finally`
  are unchanged.
- The todo is OPEN, carries the corrected mechanism with its dividing shas, settles the runner
  census, and names the Tauri-shell live re-drive as the residual.
- The SUMMARY does NOT claim the orphaned-download defect is fixed.
</success_criteria>

<output>
Create `.planning/quick/260907-sxp-fix-install-stall-watchdog-so-a-trip-can/260907-sxp-SUMMARY.md`
when done.
</output>
