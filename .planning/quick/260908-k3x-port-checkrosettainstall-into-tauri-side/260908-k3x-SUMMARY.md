---
quick-task: 260908-k3x
subsystem: tauri-sidecar
tags: [i18next, jest, tdd, dialog, bootstrap, rosetta]
key-files:
  created:
    - src/backend/sidecar/__tests__/rosettaBootWiring.test.ts
    - src/backend/sidecar/__tests__/rosettaPlatformGate.test.ts
    - .planning/todos/pending/2026-09-08-rosetta-dialog-unproven-on-a-rosetta-less-apple-silicon-mac.md
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/todos/completed/2026-09-06-checkrosettainstall-never-runs-under-tauri.md
    - .planning/STATE.md
key-decisions:
  - "Chained checkRosettaWhenMac() off the CAUGHT i18next init promise (i18nReady), not statement order, so the dialog waits for the real catalog load"
  - "Mac gate lives in checkRosettaWhenMac(), not in checkRosettaInstall(), so the latter's own test suite stays valid and unmodified"
  - "Filed a live-gate todo rather than closing silently -- no test on this machine can observe the dialog painting on a Rosetta-less Apple Silicon Mac"
duration: 23min (commit-visible span; pre-commit investigation of a test-timing defect added further unlogged time)
completed: 2026-09-08
---

# Quick Task 260908-k3x: Port checkRosettaInstall into Tauri side Summary

**Wired `checkRosettaInstall()` into the sidecar's `init()` boot path via a new `checkRosettaWhenMac()`, chained off a newly-captured i18next-ready promise so the dialog's strings wait for the real catalog load rather than racing statement order; proven in both directions by two new RED-provable test suites.**

## Performance

- **Started (first commit):** 2026-09-08T14:40:21+12:00
- **Completed:** 2026-09-08T15:03:17+12:00
- **Tasks:** 3/3 complete
- **Files created:** 3
- **Files modified:** 4 (excluding the plan/summary docs)

## Accomplishments

- `checkRosettaInstall()` (`src/backend/utils.ts`) has a live production call site again under the Tauri sidecar, closing a gap that survived two phases behind a green function-level test suite that said nothing about whether anything called the function.
- The call is macOS-gated, once-guarded, floated (never blocks boot), and cannot crash the sidecar — mirrors the existing `reconcileStoreUsersWhenOnline()` (Block E) shape exactly.
- The dialog's title/message are guaranteed to reflect the loaded i18next catalog, not English fallback defaults, because the call is chained off the **caught** i18next init promise rather than relying on statement order — the ordering-discriminator test proves this rather than assuming it.
- Two new suites RED-proven against the pre-fix tree with a genuine assertion failure (not a module-resolution error), then GREEN-confirmed after restoring the fix byte-identically.
- The originating todo is closed with a narrative naming what was proven, what was not, and why; a new todo scopes the one unproven hop as an explicit live gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire the macOS Rosetta check into the sidecar boot path (Block F)** — `b5b277abe` (feat)
2. **Task 2: Prove the wiring in both directions — RED first** — `ebde94416` (test)
   - Follow-up fix (test-registration gap discovered while running the plan's own regression check): `0bdb72b6a` (fix)
   - Follow-up formatting fix (prettier dry-run): `7cd15c434` (style)
3. **Task 3: Close the todo and record the limits of what was proven** — `46c7db5bf` (docs)

`.planning/STATE.md` was edited by hand (a `last_activity` entry was prepended) but left **unstaged** for the orchestrator's docs commit, per this execution's constraints.

## Files Created/Modified

- `src/backend/sidecar/bootstrap.ts` — Added `checkRosettaWhenMac()` (exported, beside `reconcileStoreUsersWhenOnline`), a module-scope `i18nReady` promise capturing the previously-floated i18next init call, a `rosettaCheckInitialized` guard, and the Block F call site in `init()` immediately before `READY_SENTINEL`.
- `src/backend/sidecar/__tests__/rosettaBootWiring.test.ts` — New. Positive-direction proof driven through the real `init()`: the probe runs from boot, the dialog fires once with the loaded catalog title, and an ordering-discriminator assertion proves the chain waited for the real catalog rather than relying on statement order. Also contains a KNOWN-VACUITY-labeled idempotence test.
- `src/backend/sidecar/__tests__/rosettaPlatformGate.test.ts` — New. Negative-direction proof: a direct call to `checkRosettaWhenMac()` with `isMac: false` never shells the probe. Labeled KNOWN VACUITY in its own header (also passes against a `bootstrap.ts` with zero wiring).
- `src/backend/sidecar/__tests__/testContainment.test.ts` — Registered both new suites in the directory's declared-list census (`STRUCTURALLY_CONTAINED_SUITES`), which reds on any unclassified `*.test.ts` file; corrected the stale file-count comment (62 → 64).
- `.planning/todos/completed/2026-09-06-checkrosettainstall-never-runs-under-tauri.md` — Moved from `pending/`; `status:` rewritten with a RESOLVED narrative.
- `.planning/todos/pending/2026-09-08-rosetta-dialog-unproven-on-a-rosetta-less-apple-silicon-mac.md` — New. `severity: minor` / `platform: macos` / `ready: live-gate`, in that order.
- `.planning/STATE.md` — `last_activity` entry prepended by hand (no `gsd-sdk state.*` verb invoked).
- `src/backend/utils.ts` — **Untouched.** `git diff` against it is empty; its own `checkRosettaInstall.test.ts` suite (3/3) stayed green throughout.

## The RED proof (Task 2's non-negotiable deliverable)

Procedure: held the commit constant at `b5b277abe` (Task 1's commit) throughout; varied only the working-tree content of `bootstrap.ts` via `git show <sha>:<path> > <path>` (never `git checkout --`, which fires this repo's post-checkout hook and triggers a binary download).

1. `git show d627fd223fe31c729f048b0f53008f7dac3b9f87:src/backend/sidecar/bootstrap.ts > src/backend/sidecar/bootstrap.ts` (the commit immediately before Task 1).
2. Ran both new suites. Verbatim failure output for Test 1:

```
FAIL Backend src/backend/sidecar/__tests__/rosettaBootWiring.test.ts (5.985 s)
  ● sidecar bootstrap runs the Rosetta probe (todo 2026-09-06, quick-260908-k3x) › THE POINT OF THIS FIX: a failed probe reaches dialog.showMessageBox with the loaded catalog title, from init() alone

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      191 |         )
      192 |       )
    > 193 |     ).toBe(true)
          |       ^
      194 |
      195 |     // (b) the dialog fired exactly once, with the loaded-catalog title.
      196 |     expect(await waitFor(() => showMessageBoxSpy.mock.calls.length === 1)).toBe(

      at Object.<anonymous> (src/backend/sidecar/__tests__/rosettaBootWiring.test.ts:193:7)
```

This is a genuine assertion failure naming the missing call — the assertion at line 193 checks `waitFor(() => mockedExec.mock.calls.some(call => call[0].includes('arch -x86_64') && call[0].includes('sysctl.proc_translated')))`, i.e. "the probe ran, from boot" (see the test's own comment immediately above it). Against the pre-fix tree, the exec probe genuinely never fires, so this is not a module-resolution error.

`rosettaPlatformGate.test.ts` also failed in this state, as expected and out of scope for the non-negotiable (it targets `rosettaBootWiring.test.ts`'s Test 1 specifically): `TypeError: (0 , bootstrap_1.checkRosettaWhenMac) is not a function`, because the entire Task 1 diff — including the `checkRosettaWhenMac` export — was reverted along with it. This is a natural, expected consequence of reverting the whole file, not a violation.

3. Restored: `git show b5b277abe:src/backend/sidecar/bootstrap.ts > src/backend/sidecar/bootstrap.ts`. `git diff b5b277abe -- src/backend/sidecar/bootstrap.ts` was empty (byte-identical) before re-running.
4. Re-ran both suites: 2 suites / 3 tests, all GREEN.

## Decisions Made

- **`i18nReady` holds the caught promise, not the raw one.** A failed i18n init must still let the Rosetta check run (with i18next's own fallback strings) and must not leave a second unhandled rejection.
- **The macOS gate lives in `checkRosettaWhenMac()`, not `checkRosettaInstall()`.** The probe shells `arch -x86_64 /usr/sbin/sysctl`, meaningless off macOS; keeping the gate at the caller leaves `checkRosettaInstall()` and its existing test suite untouched.
- **Guard flag (`rosettaCheckInitialized`) lives at the call site, not inside the function** — matches Blocks A/B/E's pattern, and is what lets `rosettaPlatformGate.test.ts` call `checkRosettaWhenMac()` directly without re-triggering guard state shared with the boot-wiring suite.
- **Ordering discriminator over statement order.** `i18next.use(Backend).init()` is asynchronous; a default-carrying `t()` call cannot distinguish "chained correctly" from "statement order happened to work" because the catalog string and the inline default are byte-identical. Test 1(c) calls `t()` with no default to make the two states observably different.
- **Prefer filing the live-gate todo over closing silently** — the todo-closure narrative states plainly that no test on this machine (which has Rosetta) can exercise the true failing condition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `backend/config`'s `GlobalConfig.get` mock factory was silently stripped by `resetMocks: true` before every test**
- **Found during:** Task 2, while diagnosing why Test 1's dialog call arrived with `title`/`message` both `undefined`.
- **Issue:** The jest project config sets `resetMocks: true`, which strips a `jest.mock(...)` factory's supplied implementation before every test — the same class of gotcha the test file's own header already documents for `child_process.exec`, but the `backend/config` mock was not re-implemented in `beforeEach`. As a result `GlobalConfig.get()` returned `undefined`, `.getSettings()` threw inside `init()`'s own try/catch (caught and logged, not crashing), and `i18nReady` silently stayed at its initial `Promise.resolve()` value — so `checkRosettaInstall()` fired before real i18next initialization ever ran, and `i18next.t()` returned `undefined` for every call.
- **Root-cause path:** Confirmed via targeted debug instrumentation (later removed) that `i18next.isInitialized` was `undefined` (never-initialized state, not merely pending) and that the entire `if (!i18nInitialized) {...}` guarded init block in `bootstrap.ts` was throwing into its outer `catch` with `TypeError: Cannot read properties of undefined (reading 'getSettings')` at `GlobalConfig.get().getSettings()`.
- **Fix:** Re-implemented `GlobalConfig.get`'s mock return value in the suite's `beforeEach`, identically to the `mockedExec` re-implementation already present. Confirmed via a standalone Node reproduction script (comparing `Object.keys(i18next)`/`isInitialized` against a genuinely-never-initialized instance) before concluding this was a test-construction defect rather than a Task 1 production defect.
- **Files modified:** `src/backend/sidecar/__tests__/rosettaBootWiring.test.ts`.
- **Verification:** `bootstrap.ts` was confirmed byte-identical to its Task 1 commit (`git diff b5b277abe` empty) both before and after this fix — the production code was never touched.
- **Committed in:** `ebde94416` (part of Task 2's commit; this was fixed before Task 2 was committed, so it does not appear as a separate commit).

**2. [Rule 1 - Bug] Test 1's jest test-timeout raced `waitFor()`'s own internal timeout**
- **Found during:** The first RED-proof run — Test 1 failed with `Exceeded timeout of 5000 ms`, an ambiguous failure mode, rather than a clean assertion failure.
- **Issue:** jest's default per-test timeout (5000ms) and `waitFor()`'s own default internal timeout (5000ms) are equal, so against a pre-fix tree (where the awaited condition never becomes true) jest could kill the test before the `expect(await waitFor(...)).toBe(true)` assertion itself got to run and fail — violating the non-negotiable that Test 1's RED failure must be a genuine assertion failure.
- **Fix:** Gave Test 1 an explicit `8000`ms timeout (`it(..., async () => {...}, 8000)`), longer than `waitFor()`'s 5000ms internal timeout, so the `expect(...).toBe(true)` assertion always gets to evaluate and fail with `Expected: true / Received: false`.
- **Files modified:** `src/backend/sidecar/__tests__/rosettaBootWiring.test.ts`.
- **Verification:** Re-ran the RED proof; failure mode changed from "Exceeded timeout" to the clean assertion failure recorded verbatim above.
- **Committed in:** `ebde94416` (part of Task 2's commit).

**3. [Rule 3 - Blocking issue] Two new test files were unclassified in the sidecar's declared-list census**
- **Found during:** Running the plan's own overall verification (`npx jest --selectProjects Backend --testPathPattern "sidecar/__tests__"`) after Task 2 and Task 3 landed.
- **Issue:** `testContainment.test.ts`'s Block C set-equality gate (`T-34.2-83`) requires every `*.test.ts` file in the directory to be classified into one of two declared lists (`IN_SCOPE_SUITES` or `STRUCTURALLY_CONTAINED_SUITES`). The two new rosetta suites were unclassified, turning this test red — a direct, in-scope consequence of Task 2's own new files, not a pre-existing or out-of-scope failure.
- **Fix:** Added both file names to `STRUCTURALLY_CONTAINED_SUITES` (neither declares the `IN_SCOPE_SUITES` four-element mock kit) and corrected the stale directory-count comment (62 → 64 files).
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`.
- **Verification:** Full `sidecar/__tests__` run went from 2 failed/62 passed to 1 failed/63 passed (the remaining failure is the pre-existing `electronUntouched.test.ts` one, below).
- **Committed in:** `0bdb72b6a`.

**4. [Rule 3 - Blocking issue] Prettier dry-run flagged `rosettaBootWiring.test.ts`**
- **Found during:** Running the plan's verification step 5 (`prettier --check` on the three touched source files, per the plan's explicit dry-run-only instruction — never the repo-wide gate, which is already red).
- **Issue:** Minor formatting drift (line-wrap of a multi-line `Error` constructor call) introduced by an earlier edit.
- **Fix:** `npx prettier --write` targeted at the single flagged file only.
- **Files modified:** `src/backend/sidecar/__tests__/rosettaBootWiring.test.ts`.
- **Verification:** `prettier --check` on all four touched files then passed clean; jest suite re-run confirmed no behavior change.
- **Committed in:** `7cd15c434`.

**Total deviations:** 4 auto-fixed (2 × Rule 1, 2 × Rule 3). **Impact on plan:** All four were necessary for correctness of the test suite itself or for the plan's own regression-check step to pass; none touched `bootstrap.ts` beyond what Task 1 already committed, and none touched `utils.ts`. No scope creep.

## Known Vacuity (Non-negotiable #3)

Both files carry the required in-header labeling, in the words `migrationsWiring.test.ts` uses for its own idempotence test:

- `rosettaBootWiring.test.ts`'s second test ("is once-guarded: a second and third `init()` does not re-probe") is commented: "KNOWN VACUITY, recorded rather than hidden ... this test also passes against a bootstrap.ts with NO Rosetta wiring at all. It is meaningful solely in sequence with the test above ... Never read a green here as evidence of wiring."
- `rosettaPlatformGate.test.ts`'s entire suite carries the same labeling in its file header: "KNOWN VACUITY, recorded rather than hidden ... this whole suite ALSO passes against a `bootstrap.ts` with no Block F wiring at all ... This suite proves the platform gate, and says nothing on its own about whether anything in production ever reaches it."

## Pre-existing failure (Non-negotiable #6 — named with its sha)

`src/backend/sidecar/__tests__/electronUntouched.test.ts` fails at `HEAD` (and failed identically, unmodified, at base commit `d627fd223fe31c729f048b0f53008f7dac3b9f87`, this quick task's dispatch point) with:

```
Expected pattern: not /TOKEN_STORE_KEY|TOKEN_PREFIX|configStore/
```

Confirmed by diffing `git show d627fd223:src/backend/sidecar/bootstrap.ts` against the current file for the `configStore` occurrence count and surrounding lines — identical (6 occurrences in both, same context, only line numbers shifted by Block F's insertion). This failure is independently tracked in a pre-existing pending todo, `.planning/todos/pending/2026-09-08-electronuntouched-gate-red-at-head-bans-any-configstore.md` (created 2026-09-08, before this quick task, documenting "8/8 runs on 2026-09-08, before any edit"). Not touched by this quick task; out of scope per the deviation rules' scope boundary (pre-existing failure in an unrelated file).

## Honesty boundary (Non-negotiable #5 — Task 3)

Stated plainly in both the closed todo's `status:` narrative and the new pending todo: **no test here, and no test that can run on this machine, observes the dialog actually rendering on a Rosetta-less Apple Silicon Mac.** This machine has Rosetta, so the true failing condition (`arch -x86_64 /usr/sbin/sysctl` genuinely failing) is unreproducible locally; every test simulates the failure via a mocked `exec` rejection. What is proven: the boot path invokes the probe; a failed probe reaches `dialog.showMessageBox`; the forward to `RUST_DIALOG_MESSAGE` behind it is the existing, already-audited, total Phase 33 Plan 03 channel. The unproven residue — the Rust shell actually painting this dialog — is scoped to `.planning/todos/pending/2026-09-08-rosetta-dialog-unproven-on-a-rosetta-less-apple-silicon-mac.md`, carrying `severity: minor` / `platform: macos` / `ready: live-gate` in that exact key order.

## Issues Encountered

The i18next-timing root cause (deviation #1 above) took substantial investigation to isolate: initial symptoms (dialog called with `title`/`message` both `undefined`) were consistent with several hypotheses (mock-defeat failure, CJS/ESM `.default` interop quirk, genuine Task 1 production defect). Ruled out via: confirming `Object.keys(i18next)`/`constructor.name` showed the real npm singleton, not the manual mock; a standalone Node reproduction script isolating the CJS export shape; and finally targeted debug instrumentation directly in `bootstrap.ts` (temporary, removed before commit) that located the exact throw site. `bootstrap.ts` was confirmed byte-identical to its Task 1 commit both before this investigation began and after all debug instrumentation was removed.

## Verification Commands Run (real exit status)

| Command | Exit |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 0 |
| `npx jest --selectProjects Backend --testPathPattern "sidecar/__tests__/rosetta"` (final) | 0 (2 suites / 3 tests) |
| `npx jest --selectProjects Backend --testPathPattern "sidecar/__tests__"` (final) | 1 (1 pre-existing failure named above; 63/64 suites, 1425/1426 tests) |
| `npx jest --selectProjects Backend --testPathPattern "checkRosettaInstall"` | 0 (3/3) |
| `npx jest --selectProjects Backend` (full backend project) | 1 (same single pre-existing failure; 208/209 suites, 4656/4659 tests, 2 skipped) |
| `git diff -- src/backend/utils.ts` | 0, empty |
| `pnpm codecheck` | 0 |
| `npx prettier --check` (4 touched files, final) | 0 |
| `pnpm planning-gates` | 0 (9/9 gates) |
| `test -f .../completed/2026-09-06-....md && test ! -f .../pending/2026-09-06-....md` | 0 (both true) |

## Next Phase Readiness

The originating todo is closed. One residual gap is filed and ready for pickup when a Rosetta-less Apple Silicon Mac (or an equivalent forced-failure setup) is available: `.planning/todos/pending/2026-09-08-rosetta-dialog-unproven-on-a-rosetta-less-apple-silicon-mac.md` (`ready: live-gate`). No blockers for other work — `utils.ts` is untouched, `bootstrap.ts`'s change is additive and isolated to Block F.

---
*Quick task: 260908-k3x*
*Completed: 2026-09-08*

## Self-Check: PASSED

All created/modified files confirmed present on disk:
- FOUND: `src/backend/sidecar/bootstrap.ts`
- FOUND: `src/backend/sidecar/__tests__/rosettaBootWiring.test.ts`
- FOUND: `src/backend/sidecar/__tests__/rosettaPlatformGate.test.ts`
- FOUND: `src/backend/sidecar/__tests__/testContainment.test.ts`
- FOUND: `.planning/todos/completed/2026-09-06-checkrosettainstall-never-runs-under-tauri.md`
- FOUND: `.planning/todos/pending/2026-09-08-rosetta-dialog-unproven-on-a-rosetta-less-apple-silicon-mac.md`
- FOUND: `.planning/STATE.md`
- CONFIRMED ABSENT from pending: `.planning/todos/pending/2026-09-06-checkrosettainstall-never-runs-under-tauri.md` (moved, not duplicated)

All 5 task commit hashes confirmed present in `git log --oneline --all`:
- FOUND: `b5b277abe`
- FOUND: `ebde94416`
- FOUND: `46c7db5bf`
- FOUND: `0bdb72b6a`
- FOUND: `7cd15c434`

`git diff -- src/backend/utils.ts` confirmed empty (0 lines) — Non-negotiable #4 held.

`git status --short` confirmed clean of scope creep: only `.planning/STATE.md` modified-unstaged (intentional, left for orchestrator), plus the three pre-existing untracked non-task paths (`.claude/skills/archify/`, `.planning/quick/260908-k3x-.../`, `skills-lock.json`) — none staged or touched by this task's commits.
