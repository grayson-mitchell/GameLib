---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
plan: 03
subsystem: backend
tags: [typescript, jest, humble, login-seam, dead-code-collapse, eslint]

requires:
  - phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
    plan: "02"
    provides: "getLoginWindowSeamOrThrow() accessor in src/backend/humble/loginWindowSeam.ts"
provides:
  - "humblePostRequest() (adapter.ts) always routes through the login-window seam -- the electron-net dispatch branch and its 74-line humblePostRequestViaElectronNet implementation are gone"
  - "library.ts's revealTransportLabel is the fixed string 'login-window seam transport' -- no ternary, no getLoginWindowSeam() import"
  - "adapter.test.ts, library.test.ts, netStub.test.ts all drive the seam path exclusively; zero test in src/ still asserts the electron-net path or label"
affects: [39-04, 39-05, 39-06, 39-07, 39-08]

tech-stack:
  added: []
  patterns:
    - "Seam-mock test fixture (mockRevealPost/fakeSeam/queueSeamResponse/queueSeamError/lastRevealPostInput) replacing the retired FakeIncomingMessage/FakeClientRequest EventEmitter-based net-mock pattern -- reusable by any future test needing to drive a LoginWindowSeam-backed call"
    - "Async-rejecting fixture via a real (unfaked) setImmediate, used alongside jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] }), to prove a promise settles via a genuine async failure path rather than a faked timeout (user.test.ts:437's precedent, now also in netStub.test.ts)"

key-files:
  created: []
  modified:
    - src/backend/humble/adapter.ts
    - src/backend/humble/library.ts
    - src/backend/humble/__tests__/adapter.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/backend/sidecar/__tests__/netStub.test.ts
    - .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/deferred-items.md

key-decisions:
  - "Collapsed humblePostRequest() to call getLoginWindowSeamOrThrow() unconditionally rather than keeping any null-check indirection -- matches the throwing-accessor idiom 39-02 established, and the electron-net branch had exactly one caller (humblePostRequest itself), so there was no fan-out to preserve"
  - "adapter.test.ts's outer describe('revealKey', ...) block (~23 tests) was ALSO fully dependent on the deleted electron-net fallback, not just the plan-named nested describe (~6 tests) -- ground truth (reading the file, not the plan) showed every test in that block relied on getLoginWindowSeam() returning null to reach the net mock. All ~23 were converted to install a fake seam via a new beforeEach/afterEach rather than left broken or skipped"
  - "Two adapter.test.ts diagnostic tests now assert contentType=unknown instead of a specific content-type string (text/html / application/json) -- this is a genuine, permanent structural consequence of LoginWindowRevealPostResult's {status, body} shape (no headers field), not a test regression. The seam was already the only transport running in production before this plan; the tests were simply still asserting behavior from the transport that no longer executes"
  - "library.test.ts's F-8 seam-installed control test was folded into the rewritten round-6 test rather than kept as a separate case -- once the label is an unconditional fixed string, asserting it does NOT contain the retired label is tautological (dead, unreachable text), not a meaningful negative branch check"
  - "netStub.test.ts Group 2 no longer drives the real, unmocked net.request stub at all -- humblePostRequest has no code path left that reaches it. Re-pointed to install a fake LoginWindowSeam whose revealPost rejects asynchronously (real setImmediate, matching the original stub's own async-emission timing) with a named cause, preserving the D-06/REQ-34.4-11 guarantee (a transport failure surfaces its real cause, never a 15s timeout, without the fake timer ever being advanced) without the now-impossible getLoginWindowSeam()-returns-null setup. Group 1 (the stub's own isolated on()/isOnline() contract) is untouched -- it is independent of whether humblePostRequest calls it"

requirements-completed: []

duration: 58min
completed: 2026-09-02
---

# Phase 39 Plan 03: Collapse the humblePostRequest/library.ts electron-net seams outside humble/user.ts Summary

**Deleted the 74-line `humblePostRequestViaElectronNet` fallback and its dispatch ternary from `adapter.ts`, collapsed `library.ts`'s transport-label ternary to a fixed string, and re-pointed all three affected test files off the retired path -- deleting 8 tests that only exercised or duplicated coverage of the now-unreachable branch, each named with its reason.**

## Performance

- **Duration:** 58 min
- **Started:** (continuation from a prior context window; first commit of this session's work `8500bf83b`)
- **Completed:** 2026-09-02
- **Tasks:** 3
- **Files modified:** 5 (+ 1 deferred-items log)

## Accomplishments

- `adapter.ts`'s `humblePostRequest()` calls `getLoginWindowSeamOrThrow()` unconditionally; `humblePostRequestViaElectronNet` (74 lines) and its now-orphaned `firstHeaderValue()` helper are both deleted; the `net`/`HUMBLE_LOGIN_PARTITION` imports that only fed the deleted function are gone.
- `library.ts`'s `revealTransportLabel` is the fixed string `'login-window seam transport'`; the `getLoginWindowSeam` import that fed its ternary is gone.
- Zero occurrences of `"electron-net transport"` or `humblePostRequestViaElectronNet` remain anywhere under `src/` (verified tree-wide, tests included) -- confirmed after finding and fixing 3 additional stale comment occurrences the plan's line-number references did not name (2 in `adapter.ts`, 1 in `library.ts`) plus 2 more discovered while re-pointing the test files (1 in `library.test.ts`, 1 in `netStub.test.ts`).
- `adapter.test.ts`'s entire `revealKey` test surface (outer describe, ~23 tests, plus the nested seam describe, ~6 tests) now drives a mocked `LoginWindowSeam`, not a mocked `net.request` -- a ground-truth gap the plan itself did not name (it called out only the nested describe).
- `library.test.ts`'s log-line assertion is unconditional; the tautological seam-installed control and the now-unreachable no-seam "regression" test are gone.
- `netStub.test.ts`'s D-06/REQ-34.4-11 guarantee (async transport failure surfaces its real cause, not a masked 15s timeout, without the fake timer ever advancing) is preserved through a fake-seam rejection instead of the real stub -- the guarantee this file exists to pin was never weakened, only re-routed to the transport that actually runs.
- `pnpm codecheck` clean; `pnpm lint` 4178 warnings / 0 errors (down from the 4190-warning baseline recorded in 39-02's summary -- net decrease, no new warnings from this plan's own diff).
- All three target test files pass in full isolation: `adapter.test.ts` 65/65, `library.test.ts` 111/111, `netStub.test.ts` 6/6.

## Task Commits

1. **Task 1: Collapse humblePostRequest to route unconditionally through the seam; delete humblePostRequestViaElectronNet** - `8500bf83b` (feat)
2. **Task 2: Collapse library.ts's revealTransportLabel ternary to a fixed string** - `89c944206` (feat)
3. **Task 3: Re-point adapter.test.ts, library.test.ts, netStub.test.ts off the deleted electron-net branch** - `f11893506` (test)

**Plan metadata:** (pending -- see final commit below)

## Files Created/Modified

- `src/backend/humble/adapter.ts` - `humblePostRequest()` collapsed to a single unconditional call through `getLoginWindowSeamOrThrow()`; `humblePostRequestViaElectronNet` and `firstHeaderValue()` deleted; `net`/`HUMBLE_LOGIN_PARTITION` imports removed; stale dual-transport doc comments rewritten
- `src/backend/humble/library.ts` - `revealTransportLabel` is now the fixed string `'login-window seam transport'`; `getLoginWindowSeam` import removed; stale comments rewritten
- `src/backend/humble/__tests__/adapter.test.ts` - Net-mock infrastructure (`FakeIncomingMessage`/`FakeClientRequest`/`mockNetRequest`/etc.) replaced with seam-mock infrastructure (`mockRevealPost`/`fakeSeam`/`queueSeamResponse`/`queueSeamError`/`lastRevealPostInput`); all `revealKey` tests converted to drive the seam; 6 tests deleted (named below)
- `src/backend/humble/__tests__/library.test.ts` - Round-6 log-line test collapsed to assert the unconditional label; F-8's seam-installed control folded into it; F-8's no-seam "regression" test deleted; `setLoginWindowSeam`/`LoginWindowSeam` import removed (no longer used); 3 stale comments rewritten
- `src/backend/sidecar/__tests__/netStub.test.ts` - Group 2's test re-pointed to a fake `LoginWindowSeam` whose `revealPost` rejects asynchronously with a named cause; header docstring rewritten (previously described a now-false "no seam is ever installed in this suite" mechanism); Group 1 (the stub's own isolated contract) untouched
- `.planning/phases/39-.../deferred-items.md` - Logged one additional out-of-scope observation (see Issues Encountered)

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on each. Summary:
- `getLoginWindowSeamOrThrow()` called unconditionally, no indirection kept.
- The outer `describe('revealKey', ...)` block's ~23 tests were converted too, not just the plan-named nested ~6 -- ground truth over the plan's own file inventory.
- `contentType=unknown` in two diagnostic tests is a genuine structural fact about the seam transport's response shape, not a regression.
- The F-8 seam-installed control was folded into the (now unconditional) round-6 assertion rather than kept as a separate tautological case.
- `netStub.test.ts` Group 2 moved from driving the real stub to driving a fake seam, since no code path reaches the real stub from `humblePostRequest` anymore.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `firstHeaderValue()` became an orphaned function after deleting its only caller**
- **Found during:** Task 1, post-edit `eslint` run
- **Issue:** `humblePostRequestViaElectronNet` was `firstHeaderValue()`'s only caller. After deleting the former, ESLint's `no-unused-vars` flagged the latter as a new error (would have violated the plan's "per-file warning count must not rise" acceptance criterion).
- **Fix:** Deleted `firstHeaderValue()` entirely.
- **Files modified:** `src/backend/humble/adapter.ts`
- **Verification:** `npx eslint src/backend/humble/adapter.ts` returned to `errors=0, warnings=1` (matching the pre-change baseline).
- **Committed in:** `8500bf83b` (Task 1 commit)

**2. [Rule 1 - Bug] Stale "electron-net" comments outside the plan's named line numbers**
- **Found during:** Tasks 1, 2, and 3, via `grep -rn "electron-net"` sweeps after each task's primary edits
- **Issue:** The plan's acceptance criteria require zero occurrences of `"electron-net transport"` (and, by extension for Task 1's own scope, no live reference to the deleted function name) anywhere in `src/`. The plan's line-number references did not cover every occurrence: 2 additional stale comments in `adapter.ts` (inside `revealKey`'s doc comment and body comment), 1 in `library.ts` (a historical comment literally containing the phrase), 1 in `library.test.ts` (a comment describing the F-8 mechanism), and 1 in `netStub.test.ts` (a comment naming the deleted function by identifier).
- **Fix:** Reworded each occurrence to describe the seam-transport reality (or, for historical narrative comments, to reference the fact without the literal retired string), preserving the comment's intent.
- **Files modified:** `src/backend/humble/adapter.ts`, `src/backend/humble/library.ts`, `src/backend/humble/__tests__/library.test.ts`, `src/backend/sidecar/__tests__/netStub.test.ts`
- **Verification:** `grep -rc "electron-net transport" src --include='*.ts'` and `grep -rc "humblePostRequestViaElectronNet" src --include='*.ts'` both return 0, tree-wide, after all three tasks.
- **Committed in:** `8500bf83b`, `89c944206`, `f11893506` (each task's own commit, for the occurrences found during that task)

**3. [Rule 1 - Bug] `library.test.ts`'s `setLoginWindowSeam`/`LoginWindowSeam` import became orphaned**
- **Found during:** Task 3, after deleting the F-8 seam-installed test (its only remaining call site for `setLoginWindowSeam(...)`)
- **Issue:** With the F-8 tests collapsed/deleted, `setLoginWindowSeam` had zero call sites left in the file, which would have produced a fresh `no-unused-vars` warning.
- **Fix:** Removed the import.
- **Files modified:** `src/backend/humble/__tests__/library.test.ts`
- **Verification:** `npx eslint src/backend/humble/__tests__/library.test.ts` -- 94 warnings after, vs. 100 baseline (no rise); `pnpm codecheck` clean.
- **Committed in:** `f11893506` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking orphaned-function cleanup, 1 bug-class stale-comment sweep spanning all 3 tasks, 1 blocking orphaned-import cleanup)
**Impact on plan:** All three are direct, necessary fallout from the plan's own deletions -- none introduce scope creep, and all are required to satisfy the plan's own acceptance criteria (zero-occurrence greps, flat-or-lower warning counts). No file outside the plan's declared `files_modified` list was touched.

## Deleted Tests (8 total, each named with its reason)

**`adapter.test.ts` (6 deleted, outer `revealKey` describe unless noted):**

1. `"sends keytype=machineName (naming trap), key=gamekey, keyindex as form-encoded body"` -- superseded/duplicate of the nested `"calls seam.revealPost with..."` test, which asserts the identical body-encoding contract against the seam.
2. `"routes the reveal POST through the live persist:humble partition, with native session cookie attachment (round 6)"` -- no seam equivalent exists; the seam has no partition/cookie-jar concept for this file to assert against (cookie handling is internal to the seam implementation, not observable here).
3. `"sends Accept, Content-Type and User-Agent headers; omits csrf header when csrfToken is undefined"` -- no header-setting surface exists in this file under the seam (the seam's `revealPost` takes structured fields, not raw headers); userAgent presence and csrf-omission are already covered by the nested `"calls seam.revealPost with..."` test.
4. `"round 5: does NOT send X-Requested-By on the reveal POST (neither working reference sends it)"` -- same reason as #3 (no header-setting surface under the seam).
5. `"T-14-04: sends csrf-prevention-token header when a csrfToken is provided"` -- superseded by the nested `"calls seam.revealPost with..."` test, which already asserts the csrf token is threaded through.
6. `"the Electron net.request path still runs unchanged when no seam is installed"` (nested `describe('revealKey via the Tauri login-window seam (D-07)', ...)`) -- asserted dead behavior; explicitly named by the plan itself for deletion, since the fallback it exercised no longer exists.

**`library.test.ts` (2 deleted):**

7. `"F-8: with a login-window seam installed, the calling-adapter log line names the seam transport, not electron-net"` -- folded into the rewritten `"round 6: calling-adapter log line names the login-window seam transport and carries no fullCookieJarPresent field"` test rather than kept separately, since asserting the label does NOT contain the retired string is now tautological (dead text, not a live alternate branch) once the label is an unconditional fixed string.
8. `"F-8: with no seam installed, the calling-adapter log line still names the electron-net transport (regression)"` -- the branch this test guarded (no-seam-installed falling back to the electron-net label) no longer exists; there is nothing left to regress to.

**`netStub.test.ts`:** 0 tests deleted -- Group 2's single test was re-pointed (fake-seam rejection instead of the real net stub), not deleted, per the plan's explicit instruction to preserve the D-06/REQ-34.4-11 guarantee. Group 1 (4 tests) untouched.

## Issues Encountered

`pnpm test --selectProjects Backend` (full project run) reports 5 failing tests across 3 suites -- 4 of these are the 2 pre-existing failures already logged in `deferred-items.md` from plan 39-02 (`decompressPool.test.ts` x3 assertions, `utils.test.ts` x1 assertion), reproduced identically and reconfirmed failing in isolation, unrelated to any file this plan touches. The 5th, in `src/backend/sidecar/__tests__/enrichmentFlows.test.ts`, appeared ONLY in the full-suite run and passed 41/41 when run standalone -- a full-suite-load/ordering flake (the file has zero pending changes from this or any recent plan). Logged as a new entry in `deferred-items.md`; not fixed here (out of scope: unrelated file, not touched by this plan's `files_modified` list).

All three files this plan touches (`adapter.test.ts`, `library.test.ts`, `netStub.test.ts`) are fully green, both in isolation and inside the full-suite run.

Test count: full Backend suite total dropped from 4408 (39-02 baseline) to 4400 -- exactly the 8 tests this plan's Task 3 deleted (6 in `adapter.test.ts`, 2 in `library.test.ts`), with `netStub.test.ts`'s own count unchanged (re-pointed, not deleted).

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- The login-window seam collapse pattern (unconditional `getLoginWindowSeamOrThrow()` call, no null-check indirection) is now demonstrated twice (39-02's `captureOAuthLogin`, this plan's `humblePostRequest`) for plans 39-04 through 39-07 to follow for their own remaining `getLoginWindowSeam() === null` predicates.
- The seam-mock test fixture pattern (`fakeSeam`/`queueSeamResponse`/`queueSeamError`/`lastRevealPostInput` in `adapter.test.ts`; the simpler `fakeSeam`/`asyncRejectingRevealPost` in `netStub.test.ts`) is available as a reusable template for any future test needing to drive a `LoginWindowSeam`-backed call without touching the real Rust sidecar.
- Two pre-existing, unrelated test failures (`decompressPool.test.ts`, `utils.test.ts`) plus one full-suite-load flake (`enrichmentFlows.test.ts`) remain logged in `deferred-items.md` for later triage -- none are blockers for 39-04 through 39-07.
- `meta/planningGates/34.4.1/seam-parity-sweep-gate.py`'s disposition (already noted as deferred to plan 39-08 per 39-02's summary) is unaffected by this plan; not addressed here.

---
*Phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec*
*Completed: 2026-09-02*

## Self-Check: PASSED

All modified files confirmed present on disk (`src/backend/humble/adapter.ts`,
`src/backend/humble/library.ts`, `src/backend/humble/__tests__/adapter.test.ts`,
`src/backend/humble/__tests__/library.test.ts`,
`src/backend/sidecar/__tests__/netStub.test.ts`, this SUMMARY, and
`deferred-items.md`). All three task commits (`8500bf83b`, `89c944206`, `f11893506`)
confirmed present in `git log --oneline --all`.
