---
phase: quick-260910-drs
plan: 01
subsystem: gog-presence
tags: [jest, fake-timers, gog, presence, keep-alive, typescript]

requires:
  - phase: quick-260909-k5x
    provides: "boot-time GOG presence wiring (bootstrap.ts Block H) and the filed-but-not-fixed todo this plan closes"
provides:
  - "deletePresence() resets `interval` to undefined so setPresence()'s `if (!interval)` guard can re-arm the 5-minute keep-alive after any deletePresence() call in the same process"
  - "D-DRS-01: guard/teardown placement decision recorded as a comment on deletePresence() in presence.ts"
  - "Dedicated regression suite src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts (arm -> no-stack -> teardown -> re-arm, plus the D-DRS-01 receipt case)"
affects: [gog-presence, launcher-quit-path, settings-changed-listener]

tech-stack:
  added: []
  patterns:
    - "jest.isolateModules() + require() for a virgin module-scope copy in a suite where module state is sticky across tests (matches bootstrapWirings.test.ts precedent)"
    - "Inline cast-and-call ((GlobalConfig.get as jest.Mock).mockReturnValue(...)) instead of extracting GlobalConfig.get to a variable, to avoid an @typescript-eslint/unbound-method warning under a zero-headroom lint ceiling (established in depot.test.ts)"

key-files:
  created:
    - src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts
  modified:
    - src/backend/storeManagers/gog/presence.ts
    - .planning/todos/completed/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md (moved from pending/)

key-decisions:
  - "D-DRS-01: Option A -- hoist clearInterval(interval) + interval = undefined above every one of deletePresence()'s five early-return guards, so the local timer teardown is unconditional and the guards gate only the network axiosClient.delete call. No reachable call site (utils.ts's quit-path await, or the settingChanged listener's force=true call) ever wants the keep-alive to outlive a deletePresence() call."
  - "Case 3's assertion order (re-enable disablePlaytimeSync BEFORE advancing timers, not after) is what makes Option A vs Option B genuinely distinguishable -- an earlier draft asserted no extra POST while settings stayed disabled, which passes identically under both options because setPresence()'s own guard masks a surviving timer either way. Caught and redesigned before the RED commit was made, per this task's evidence-discipline requirement."

requirements-completed:
  - TODO-2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm

duration: ~24min (measured from the D-DRS-01 audit commit's timestamp to the closing commit's timestamp; the interactive session itself spanned longer across a context-window compaction)
completed: 2026-09-10
---

# Quick Task 260910-drs: Reset the GOG presence keep-alive interval Summary

**`deletePresence()` now resets `interval` to `undefined` after `clearInterval`, restoring `setPresence()`'s re-arm guard, with the teardown hoisted above every guard per D-DRS-01 Option A and pinned by a dedicated fake-timer regression suite.**

## Performance

- **Completed:** 2026-09-10
- **Tasks:** 3/3 completed
- **Files modified:** 2 (`presence.ts`, the new test file) + 1 moved (todo)
- **Commits:** 4

## D-DRS-01 Decision (required output)

**Chosen: Option A** -- the timer teardown (`clearInterval(interval)` followed by `interval = undefined`) is hoisted to the very top of `deletePresence()`, above the settings read and all five early-return guards, so the local 5-minute keep-alive is torn down unconditionally on every call while the guards continue to gate only the network `axiosClient.delete` call.

**One-line rationale:** none of `deletePresence()`'s five early-return guards (`disablePlaytimeSync`, `(!force && disableGOGPresence)`, `!GOGUser.isLoggedIn()`, `!isOnline()`, falsy `credentials`) describes a case where a real, reachable caller (`utils.ts:326`'s quit-path await, or the `settingChanged` listener's `force = true` call) wants the keep-alive to survive a `deletePresence()` call — a surviving timer under any of those guards would just be a 5-minute no-op poll into `setPresence()`'s own guard, so unconditional local teardown is strictly safer with zero downside.

The full guard-by-guard matrix and the repo-wide `deletePresence` caller search are recorded as a comment block on `deletePresence()` itself in `src/backend/storeManagers/gog/presence.ts` (search the literal marker `D-DRS-01`).

## RED Proof: Genuinely Failed Pre-Fix

**Yes — confirmed twice, independently.** First during initial development (Task 2, before the fix was applied), and again in this session as a live re-verification: I set aside the fix with `git stash` (repo is a plain checkout here, not a linked worktree — `.git` is a directory, confirmed before using it), ran the suite against the exact pre-fix code committed at `e7f23224a` (comment-only `presence.ts`, no behavior change), captured the transcript below, then restored the fix.

**Verbatim RED transcript (pre-fix, both Case 1 and Case 3 fail on the same defect):**

```
FAIL src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts
  ● todo 2026-09-09 -- GOG presence keep-alive re-arm after deletePresence() › case 1 -- setPresence() re-arms the keep-alive after a deletePresence() teardown, in the SAME process

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 3
    Received number of calls: 2

      196 |     jest.advanceTimersByTime(FIVE_MINUTES_MS)
      197 |     await new Promise(setImmediate)
    > 198 |     expect(mockAxiosClient.post).toHaveBeenCalledTimes(3)
          |                                  ^
      199 |   })
      200 |
      201 |   // Case 2: guards against the opposite naive fix (unconditional setInterval on every call).

      at Object.<anonymous> (src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts:198:34)

  ● todo 2026-09-09 -- GOG presence keep-alive re-arm after deletePresence() › case 3 -- D-DRS-01 receipt: a guarded deletePresence() call still tears down the live keep-alive (Option A hoists teardown above the guards)

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 2

      264 |     jest.advanceTimersByTime(FIVE_MINUTES_MS)
      265 |     await new Promise(setImmediate)
    > 266 |     expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(1)
          |                                      ^
      267 |   })
      268 | })

Test Suites: 1 failed, 213 passed, 214 total
Tests:       2 failed, 2 skipped, 4806 passed, 4810 total
Snapshots:   0 total
```

Case 1 is the defect's direct proof (the re-arm never happens: only the 2 direct `setPresence()` posts, no 3rd timer-driven post). Case 3 fails for the same underlying reason — the teardown didn't happen at all pre-fix, so the keep-alive was still ticking, and re-enabling `disablePlaytimeSync` before advancing timers let that surviving timer fire an observable extra POST. Case 3's failure here is itself evidence the case is discriminating, not vacuous: an earlier draft of Case 3 (which re-enabled settings AFTER advancing timers, or not at all) passed identically regardless of whether the timer survived, because `setPresence()`'s own guard masked it either way. That draft was caught and redesigned before the RED commit was made.

## GREEN Proof (post-fix)

**Verbatim summary (full backend suite, post-fix):**

```
Test Suites: 214 passed, 214 total
Tests:       2 skipped, 4808 passed, 4810 total
Snapshots:   0 total
Time:        24.353 s
```

`src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts` is among the 214 passing suites (confirmed individually via `pnpm exec jest --selectProjects Backend gogPresenceKeepAlive`, PASS, non-zero test count, no `--passWithNoTests`).

## Mutation Proof (real, re-run in this session)

Reverted **only** the `interval = undefined` line, leaving `clearInterval(interval)` in place at the same (hoisted) call site — isolating exactly the load-bearing statement:

**Verbatim mutation-RED transcript (only Case 1 targeted by this mutant, as expected — Case 3 tests the guard/teardown *placement*, not the reset itself):**

```
FAIL src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts
  ● todo 2026-09-09 -- GOG presence keep-alive re-arm after deletePresence() › case 1 -- setPresence() re-arms the keep-alive after a deletePresence() teardown, in the SAME process

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 3
    Received number of calls: 2

      205 |     jest.advanceTimersByTime(FIVE_MINUTES_MS)
      206 |     await new Promise(setImmediate)
    > 207 |     expect(mockAxiosClient.post).toHaveBeenCalledTimes(3)
          |                                  ^
      208 |   })

      at Object.<anonymous> (src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts:207:34)

Test Suites: 1 failed, 213 passed, 214 total
Tests:       1 failed, 2 skipped, 4807 passed, 4810 total
```

Then restored the `interval = undefined` line exactly (verified `git diff` on `presence.ts` was byte-identical to the pre-mutation fix diff) and re-ran:

```
Test Suites: 214 passed, 214 total
Tests:       2 skipped, 4808 passed, 4810 total
Snapshots:   0 total
```

This is the same failure signature (`expected 3, received 2`, same line) as the original pre-fix RED run, confirming `interval = undefined` — not the surrounding `clearInterval(interval)` call, which was already present pre-fix — is the specific line that carries the fix.

## Task Commits

1. **Task 1: Audit the guard/teardown interaction and record decision D-DRS-01** — `fcd50ae83` (docs) — comment-only, no behavior change.
2. **Task 2a: RED-prove the re-arm defect** — `e7f23224a` (test) — new suite, genuinely RED against pre-fix code.
3. **Task 2b: Fix per D-DRS-01** — `817cdceb0` (fix) — widened `interval` to `NodeJS.Timeout | undefined`, added the reset, hoisted per Option A; also widened the test file's `FAKE_CREDENTIALS` fixture to the full 8-field `GOGCredentials` shape (self-caught deviation, see below).
4. **Task 3: Close the todo and run the full gate set** — `58f3727f0` (docs) — `git mv` to `completed/`, `status:` and `## Resolution` added, full gate set re-verified.

## Files Created/Modified

- `src/backend/storeManagers/gog/presence.ts` — widened `interval` declaration, added `interval = undefined` reset hoisted above all guards in `deletePresence()` per D-DRS-01, added the D-DRS-01 audit comment block.
- `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts` — new suite: Case 1 (re-arm, THE defect proof), Case 2 (no timer-stacking), Case 3 (D-DRS-01 receipt, guarded `deletePresence()` still tears down).
- `.planning/todos/completed/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md` — moved from `pending/`, `status:` and `## Resolution` added.

## Decisions Made

See "D-DRS-01 Decision" above. No other architectural decisions were required — the fix is a one-file, two-line change (declaration widen + reset) plus a comment recording the audit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Self-caught bug] Case 3 was originally vacuous, redesigned before the RED commit**
- **Found during:** Task 2, while drafting the D-DRS-01 receipt case
- **Issue:** The first draft of Case 3 asserted "no extra POST" while `deletePresence()` ran under a guard that never re-enabled settings afterward. That assertion holds identically whether Option A (unconditional teardown) or Option B/pre-fix (teardown skipped, timer survives) is in effect, because `setPresence()`'s own `disablePlaytimeSync` guard blocks the POST regardless of whether the timer is alive underneath it — the case was measuring nothing.
- **Fix:** Redesigned Case 3 to flip `disablePlaytimeSync` back to `false` AFTER the guarded `deletePresence()` call but BEFORE advancing fake timers by 5 minutes. A surviving timer becomes observable the moment settings are re-enabled (it fires a POST on the next tick); a correctly torn-down timer produces nothing. This makes the case genuinely discriminate between the two options.
- **Files modified:** `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`
- **Verification:** Re-ran against pre-fix code — Case 3 now genuinely fails (see RED transcript above, `expected 1, received 2`).
- **Committed in:** `e7f23224a` (RED commit — the redesign landed before this commit was made, so the committed RED suite already reflects the fix)

**2. [Rule 3 - Blocking] Case 2 spuriously failed for the wrong reason, fixed with module isolation**
- **Found during:** Task 2, first RED run
- **Issue:** Case 1 (file-scope, run first, deliberately not isolated so it can observe the true across-calls module state) leaves module-scope `interval` in a stuck-truthy state by design. Case 2, sharing that same module instance, then found `interval` already truthy at its own start, so its `setPresence()` calls never armed a fresh timer at all — its "advance 5 minutes, expect 3 posts" assertion failed for a reason unrelated to the defect it targets (timer stacking).
- **Fix:** Gave Case 2 (and Case 3) a virgin module instance via a shared `loadIsolatedPresence()` helper built on `jest.isolateModules()` + `require()`, matching the established `bootstrapWirings.test.ts` precedent, and staying within the plan's "at most two re-requires" constraint.
- **Files modified:** `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`
- **Verification:** Case 2 and Case 3 now correctly isolate from Case 1's module-scope state; full suite green post-fix.
- **Committed in:** `e7f23224a`

**3. [Rule 3 - Blocking] `@typescript-eslint/unbound-method` warnings on `GlobalConfig.get`, `GOGUser.isLoggedIn`, `GOGUser.getCredentials`**
- **Found during:** Task 2, `pnpm exec eslint` on the new test file
- **Issue:** Extracting `jest.mocked(GOGUser).isLoggedIn` / `.getCredentials` to standalone variables did NOT trip the rule (verified empirically), but the established `depot.test.ts` pattern of inline cast-and-call for `GlobalConfig.get` was still required to avoid it there — 3 initial warnings against a `TESTS_CEILING = 638` with zero headroom.
- **Fix:** Followed the `depot.test.ts` precedent: `(GlobalConfig.get as jest.Mock).mockReturnValue(...)` inline at every call site, never extracted to a variable.
- **Files modified:** `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`
- **Verification:** `pnpm exec eslint` on the file: 0 warnings.
- **Committed in:** `e7f23224a`

**4. [Rule 1 - Self-caught bug] `FAKE_CREDENTIALS` type mismatch discovered by `pnpm codecheck` AFTER the RED commit had already been made**
- **Found during:** Task 2, running the full gate set after the RED commit
- **Issue:** `jest.mocked(GOGUser).getCredentials` is strictly typed against the real 8-field `GOGCredentials` interface (`src/common/types/gog.ts:480`), but the RED-commit test file supplied only 2 fields (`user_id`, `access_token`) in two places. `tsc --noEmit` failed with `TS2345`. Because ts-jest under the test runner did not itself surface this (the suite still ran and produced the expected RED failures), the type error was only caught by the separate `pnpm codecheck` gate, run after `e7f23224a` was already committed.
- **Fix:** Introduced a single `FAKE_CREDENTIALS` const supplying all 8 required fields (`access_token`, `expires_in`, `token_type`, `scope`, `session_id`, `refresh_token`, `user_id`, `loginType`) and used it in both `installDefaultMocks()` and `loadIsolatedPresence()`, replacing the two inline partial objects. This correction rode along in the `fix(quick-260910-drs): ...` commit (`817cdceb0`) rather than amending the already-made RED commit, so the test file's evolution is visible in git history rather than hidden. **Transparency note:** the test file as committed at `e7f23224a` in isolation would fail `tsc --noEmit` if checked out on its own; the corrected version only exists from `817cdceb0` onward. This is documented here rather than silently left out of the record.
- **Files modified:** `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`
- **Verification:** `pnpm codecheck` clean after the fix.
- **Committed in:** `817cdceb0`

**5. [Rule 1 - Self-caught bug] Task 1 originally included a premature behavior change**
- **Found during:** Task 1
- **Issue:** An early edit to `deletePresence()` included both the D-DRS-01 comment block AND the actual `interval = undefined` behavior change, violating Task 1's "comment-only, no behavior change yet" instruction.
- **Fix:** Reverted the behavior change via a second edit, leaving only the comment block. Re-verified Task 1's automated check (`grep -c "clearInterval"` == 1, i.e., exactly one live, non-comment `clearInterval` call) passed before proceeding.
- **Files modified:** `src/backend/storeManagers/gog/presence.ts`
- **Verification:** Task 1's automated verify block passed (`grep`, `pnpm codecheck`, `pnpm exec prettier --check`).
- **Committed in:** `fcd50ae83` (the premature change never reached a commit)

---

**Total deviations:** 5 self-caught and auto-fixed (2 Rule 1 test-design bugs caught before commit, 1 Rule 1 test-design bug caught after commit and documented transparently, 1 Rule 3 lint-ceiling fix, 1 Rule 1 premature-scope revert). None required Rule 4 (no architectural change was needed).
**Impact on plan:** All fixes were necessary for the RED proof to be genuine rather than vacuous, or for the gates to pass. No scope creep — every file touched is one of the three the plan named.

## Issues Encountered

None beyond the deviations above. One transient bash-chaining misread (a combined `pnpm codecheck && ... && pnpm lint && ... && pnpm exec prettier --check` reported overall exit 1; re-running the three commands separately showed `codecheck` and `lint` were clean and the failure was `prettier --check` flagging formatting in the new test file, unrelated to logic) — resolved with `--write` and re-verified with `--check`.

## Verbatim Results — All Gates (from `<verification>`)

1. **`pnpm exec jest --selectProjects Backend src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`** — PASS, non-zero test count, no `--passWithNoTests`. Confirmed as part of `Test Suites: 214 passed, 214 total` in the full-suite run.
2. **`pnpm codecheck`** — `tsc --noEmit`, clean, exit 0.
3. **`pnpm lint`** — exit 0. Both ceilings hit their exact unchanged values: `✖ 1123 problems (0 errors, 1123 warnings)` for the SRC scope, `✖ 638 problems (0 errors, 638 warnings)` for the TESTS scope. `git diff --stat` on `meta/lintScoped.cjs` against the base commit is empty — neither ceiling was touched.
4. **`pnpm exec prettier --check src/backend/storeManagers/gog/presence.ts src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`** (run from repo root) — `All matched files use Prettier code style!`
5. **`pnpm planning-gates`** — `9/9 planning gates passed.`

Additionally, `git diff --name-only a129def3a2a12118a73728fcb4e0c8931e02888a..HEAD` lists exactly the three expected paths: `src/backend/storeManagers/gog/presence.ts`, `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`, and `.planning/todos/completed/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md`. Nothing else.

## Known Stubs

None — this is a bugfix and test-suite addition, no new UI surface or data flow that could stub out.

## Threat Flags

None — every threat register entry (T-DRS-01 through T-DRS-05, T-DRS-SC) in the plan's `<threat_model>` was matched by an implemented mitigation, and no new network endpoint, auth path, file access pattern, or schema change at a trust boundary was introduced beyond what the register already covers.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

The GOG presence keep-alive can now correctly re-arm after any `deletePresence()` call within a process lifetime (game-stop path via `launcher.ts`, and the `settingChanged` listener's disable/re-enable cycle). No follow-on work is required; the todo this plan resolves is fully closed (both the re-arm defect and the previously-unaudited guard/teardown interaction).

## Self-Check: PASSED

All claimed created/modified files verified present on disk: `src/backend/storeManagers/gog/presence.ts`, `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`, `.planning/todos/completed/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md` (and confirmed absent from `pending/`), and this SUMMARY itself. All four claimed commit shas (`fcd50ae83`, `e7f23224a`, `817cdceb0`, `58f3727f0`) verified present in `git log --oneline --all`.
