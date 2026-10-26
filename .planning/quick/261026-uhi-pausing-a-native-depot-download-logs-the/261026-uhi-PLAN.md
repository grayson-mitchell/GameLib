---
phase: quick-261026-uhi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
autonomous: true
requirements:
  - TODO-2026-10-25-paused-depot-download-logs-chmod-fail-close-as-integrity-failure

must_haves:
  truths:
    - "Pausing/cancelling a native depot download no longer logs the 'chmodAttempts=0 — failing closed to StateFlags=1026' integrity warning"
    - "A cancelled run still returns allModesApplied: false and outcome 'cancelled' (StateFlags=1026 outcome unchanged)"
    - "A NON-cancelled run whose manifest claims executables but applied zero chmods still logs the warning (genuine signal preserved)"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot.ts"
      provides: "chmodAttempts=0 warning gated on !opts.signal?.aborted; allModesApplied expression unchanged"
      contains: "!opts.signal?.aborted"
    - path: "src/backend/storeManagers/steam/__tests__/depot.test.ts"
      provides: "cancelled-case test + positive warning assertion on the existing Directory|Executable test"
  key_links:
    - from: "depot.ts executableClaimedByManifest warning"
      to: "opts.signal"
      via: "abort check in the if-condition"
      pattern: "executableClaimedByManifest &&\\s*!modesActuallyAppliedThisRun &&\\s*!opts\\.signal\\?\\.aborted"
---

<objective>
Stop a user pause/cancel of a native Steam depot download from logging the
`chmodAttempts=0 — failing closed to StateFlags=1026 ... (G-23-02/T-23-27)` warning,
which presents a pause as an integrity fail-close. The 1026 outcome itself is correct
and MUST NOT change.

Purpose: log readability. Anyone reading a debug bundle should not see a pause reported
as an integrity failure (todo 2026-10-25, observed in the XCOM 200510 live gate).
Output: a one-condition change in `downloadDepotFiles` plus unit tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-25-paused-depot-download-logs-chmod-fail-close-as-integrity-failure.md

Load `Skill("gamelib-conventions")` before writing `<verify>` evidence (scoped prettier rule).

<interfaces>
src/backend/storeManagers/steam/depot.ts, inside `downloadDepotFiles` (~lines 3560-3680).
The todo's line numbers (~3037-3050) are stale; the code is now here:

- `const allJobsAttempted = queue.length === 0` (~3562)
- 23-08 Task 2a comment block, then (~3603-3617):
  - `const executableClaimedByManifest = finalCensus.executableFlagged > 0`
  - `const modesActuallyAppliedThisRun = modeCounters.chmodAttempts > 0`
  - `const allModesApplied = failures.length === 0 && (!executableClaimedByManifest || modesActuallyAppliedThisRun)`  <-- DO NOT TOUCH
  - `if (executableClaimedByManifest && !modesActuallyAppliedThisRun) { logWarning(`downloadDepotFiles: appId=... chmodAttempts=0 — failing closed to StateFlags=1026 ...`, LogPrefix.Steam) }`  <-- the target
- Further down: `const runLooksComplete = allJobsAttempted && failures.length === 0 && !opts.signal?.aborted` (~3642), defined AFTER the warning, guarding verifyStructuralIntegrity.
- Return: `outcome: opts.signal?.aborted ? 'cancelled' : 'completed'`.

The file-worker loop checks `if (opts.signal?.aborted) return` per file (~3313) and per chunk, so an abort fired inside the first `fetchChunk` leaves every executable file un-chmod'd: chmodAttempts=0.

src/backend/storeManagers/steam/__tests__/depot.test.ts:
- `import { logWarning, logInfo, logError } from 'backend/logger'` (line 40), mocked as `jest.fn()` (line 93). Jest config uses resetMocks:true (see comment ~line 117), so mocks are clean per test. Existing inspection idiom: `jest.mocked(logWarning).mock.calls.map((c) => String(c[0]))` (~4876).
- D-02 abort pattern (~5007-5040): `const controller = new AbortController()`; `jest.mocked(fetchChunk).mockImplementation(async () => { controller.abort(); return Buffer.from('x') })`; pass `signal: controller.signal` to `downloadDepotFiles(plan, { targetSteamappsDir: dir, installdir: 'SomeGame', hosts: HOSTS, signal })`; `expect(result.outcome).toBe('cancelled')`.
- Helpers in scope inside that describe: `makePlan(depots, totalBytes)` (~4065), `EXECUTABLE_FLAG`, `DIRECTORY_FLAG`, `sha1Hex`, `dir`, `HOSTS`, type `DepotPlanFile`.
- Target describe: `'allModesApplied fail-closed gate (23-08 Task 2a) + zero-byte exec modes (Task 2b)'` (~6098). Its existing test `'Task 2a: a plan whose only executable-flagged entry never reaches chmod (Directory|Executable combo, ...)'` (~6176-6213) is the non-cancelled zero-chmod case; it currently asserts only `failures` and `allModesApplied`, NOT the warning.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Gate the chmodAttempts=0 warning on a non-aborted run, with cancelled + non-cancelled tests</name>
  <files>src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/__tests__/depot.test.ts</files>
  <behavior>
    - Test A (new, cancelled): plan with one depot holding 2-3 files, each `flags: EXECUTABLE_FLAG`, non-empty chunks (e.g. cb_original 1, sha_content arbitrary). `fetchChunk` mock aborts the controller on its first call (D-02 pattern). Assert `result.outcome === 'cancelled'`, `result.allModesApplied === false`, `result.allFilesVerifiedThisRun === false`, and that no `logWarning` call's first arg matches `/chmodAttempts=0/`. Before the fix this test FAILS on the last assertion (RED).
    - Test B (extend existing Directory|Executable test ~6176): additionally assert some `logWarning` call's first arg matches `/chmodAttempts=0/` and `/failing closed to StateFlags=1026/`. Proves the genuine non-cancelled signal is preserved. Passes both before and after the fix.
  </behavior>
  <action>
    Tests first (RED). In the 23-08 Task 2a describe block, add Test A after the existing Directory|Executable test, named along the lines of `'quick-261026-uhi: a cancelled run against an executable-claiming plan still returns allModesApplied: false but does NOT log the chmodAttempts=0 fail-close warning'`, with a short comment explaining a pause leaves chmodAttempts=0 by construction and is not an integrity signal. Use the D-02 abort-in-fetchChunk pattern (not a pre-aborted signal, so the job loop actually starts and the census/gate code runs). Inspect warnings via `jest.mocked(logWarning).mock.calls.map((c) => String(c[0]))` and assert `.some(m => /chmodAttempts=0/.test(m))` is false. Add the Test B assertions to the existing Directory|Executable test. Run the file, confirm Test A fails for the expected reason.

    Fix (GREEN). In depot.ts change only the warning's if-condition to `executableClaimedByManifest && !modesActuallyAppliedThisRun && !opts.signal?.aborted`. Use the abort-only gate, not a `runLooksComplete`-style condition: a non-cancelled run that attempted every job (or had failures) yet applied zero chmods against an executable-claiming manifest is still a real signal worth the warning, and `runLooksComplete` is declared later in the function and would also suppress the failures>0 case. Leave the `allModesApplied` expression byte-identical. It is load-bearing (T-23-27) and a cancelled run must still resolve to false. Above the if, add a dense rationale comment in the surrounding style: cite quick-261026-uhi and the 2026-10-25 todo, say a user pause/cancel aborts the job loop before executable files reach chmod so chmodAttempts=0 is expected and not an integrity finding (the XCOM 200510 pause logs), say that allModesApplied is deliberately still false so the 1026 outcome is unchanged and the cancelled run also fails allFilesVerifiedThisRun via allJobsAttempted, and say the narrower abort-only gate (not runLooksComplete) keeps the warning for non-cancelled runs. Do not reword the warning text itself.

    Todo closure: the executor does NOT move the todo file. Following the quick-261026-u1a precedent (28149bd60), the orchestrator moves `.planning/todos/pending/2026-10-25-paused-depot-download-logs-chmod-fail-close-as-integrity-failure.md` to `.planning/todos/completed/` in its docs commit along with STATE.md and SUMMARY.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t "23-08 Task 2a" && npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts && npx prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depot.test.ts && ! (npx tsc --noEmit -p . 2>&1 | grep -E "steam/(depot|__tests__/depot)")</automated>
  </verify>
  <done>
    Test A was observed failing before the fix and passes after. Test B passes. The full depot.test.ts suite is green. `git diff src/backend/storeManagers/steam/depot.ts` shows only the added `&& !opts.signal?.aborted` term and the new comment; the `allModesApplied` lines are untouched. Prettier passes on both paths (neither is prettier-ignored, checked with --file-info at planning time). tsc reports no errors in either file.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| depot download run → ACF StateFlags | The completeness gate decides whether an install is marked 4 (complete) or 1026 (verify-handoff) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-uhi-01 | Tampering | `allModesApplied` gate in downloadDepotFiles | mitigate | Only the logWarning condition changes. The `allModesApplied` expression stays byte-identical and Test A asserts a cancelled run still returns allModesApplied: false, so the fail-closed T-23-27 contract is preserved |
| T-uhi-02 | Repudiation | diagnostic log signal | mitigate | Abort-only gate, plus a Test B assertion, keeps the warning for every non-cancelled zero-chmod run, so real integrity signals are not hidden |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts` passes
- `npx prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depot.test.ts` passes
- `grep -n "!modesActuallyAppliedThisRun && !opts.signal?.aborted\|executableClaimedByManifest &&" src/backend/storeManagers/steam/depot.ts` shows the gated warning condition
</verification>

<success_criteria>
A paused/cancelled native depot download no longer emits the chmodAttempts=0 integrity warning. It still resolves to allModesApplied false and StateFlags=1026. Non-cancelled zero-chmod runs still warn. Tests cover both cases.
</success_criteria>

<output>
Create `.planning/quick/261026-uhi-pausing-a-native-depot-download-logs-the/261026-uhi-SUMMARY.md` when done
</output>
