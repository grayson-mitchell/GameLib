---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
plan: 04
subsystem: backend
tags: [typescript, jest, humble, epic, legendary, login-seam, dead-code-collapse, eslint]

requires:
  - phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
    plan: "02"
    provides: "getLoginWindowSeamOrThrow() accessor in src/backend/humble/loginWindowSeam.ts"
provides:
  - "humble/user.ts's disconnect() and legendary/user.ts's logout() each build wipeSteps unconditionally via getLoginWindowSeamOrThrow() -- the five-step session.fromPartition Electron branch is gone from both, and legendary/user.ts no longer imports session from backend/platform"
  - "seamBranchParity.test.ts inverted to guard the collapsed single-path shape (anti-regrowth check) instead of comparing two branches that no longer both exist"
  - "humble/__tests__/user.test.ts, sidecar/__tests__/humbleFlows.test.ts, and storeManagers/legendary/__tests__/user.test.ts all re-pointed at the seam-only path; every test that pinned the deleted Electron branch is deleted or re-pointed, and every vacuous mock assertion against a now-unreachable Electron session method is removed"
affects: [39-05, 39-06, 39-07, 39-08, 39-09]

tech-stack:
  added: []
  patterns:
    - "D-35-14-02 disposition vocabulary applied to a dead comparison test: seamBranchParity.test.ts INVERTED from a two-branch-comparison gate to a static anti-regrowth gate (hasDualBranchWipeShape) plus a fixed reference constant capturing what was deleted, so the file still has a job once only one branch remains"
    - "Locally-scoped fake-seam install/teardown (installFakeSeamDefaults() + setLoginWindowSeam(fakeSeam) in a try/finally) for a single test that needs disconnect()'s new unconditional seam requirement satisfied without inheriting a sibling describe's shared beforeEach"
    - "D-05-style ordering proof re-pointed from 'let the real electronStub's session.fromPartition() return {} to fabricate failing steps' to 'install an explicit all-rejecting fake LoginWindowSeam via setLoginWindowSeam()', obtained through a fresh unmocked require() sharing the same post-resetModules() module registry as the requireActual()'d module under test"

key-files:
  created: []
  modified:
    - src/backend/humble/user.ts
    - src/backend/storeManagers/legendary/user.ts
    - src/backend/sidecar/__tests__/seamBranchParity.test.ts
    - src/backend/humble/__tests__/user.test.ts
    - src/backend/sidecar/__tests__/humbleFlows.test.ts
    - src/backend/storeManagers/legendary/__tests__/user.test.ts

key-decisions:
  - "Continuation note: this plan was executed across a stall/compaction boundary. Task 1 (collapse both disconnect()/logout() sites) and Task 2 (invert seamBranchParity.test.ts) were completed and committed by an earlier instance of this same executor session before the stall; this SUMMARY was written by the continuation agent that resumed to complete Task 3 and had to reconstruct Task 1/2's intent from their commits (a2198f6e2, 1c2a24df1) and the plan's own text, since no SUMMARY existed yet"
  - "Task 3's file scope was expanded from the plan's stated two files (humble/__tests__/user.test.ts, sidecar/__tests__/humbleFlows.test.ts) to three -- storeManagers/legendary/__tests__/user.test.ts was not in Task 3's <files> list but Task 1 (owned by this same plan) collapsed legendary/user.ts's logout() exactly as it did humble/user.ts's disconnect(), breaking 4 of that file's tests. The plan's own overall <verification> requires pnpm test --selectProjects Backend to be fully green, so this is a Rule 1 auto-fix (fixing a bug this plan's own Task 1 introduced), not scope creep against a different plan's territory"
  - "Every test deletion in this plan follows the anti-vacuity discipline: a test/assertion is only deleted after confirming (a) its target code path is gone from source (grep-verified: session.fromPartition, clearStorageData, clearCache, clearAuthCache, clearHostResolverCache, clearData have zero remaining call sites in either user.ts file) and (b) an equivalent invariant already has live, non-duplicate coverage elsewhere -- named explicitly per deletion below, never just removed silently"
  - "The clearEpicStorage-before-clearEpicCookies wipe-step ORDER invariant is deliberately NOT re-proven by a live/mocked test in legendary/__tests__/user.test.ts after this plan -- it already has dedicated, deliberate SOURCE-gate coverage in epicLogoutDomains.test.ts's 'wipe-step ORDER: the storage step runs BEFORE the cookie sweep (epic-cookie-clear-read-divergence)' describe (4 tests: static indexOf order check, ORDER-IS-LOAD-BEARING comment survival check, an anti-vacuity check that the gate itself fails on inverted order, and a stripSourceComments-survival check). That gate's own header comment explains why a live test cannot observe this property: a mocked clearStorage() never re-seeds cookies the way the real Epic origin page load does, so a live/behavioral test would stay green even with the two steps swapped -- exactly the blind spot that produced the original production bug. This gate was untouched by this plan and was green both before and after Task 1's collapse"
  - "CATEGORY_MAP's shape is unchanged by this plan (already noted in Task 1's own commit message a2198f6e2) -- no flag raised for plan 39-08"

requirements-completed: []
# REQ-39-03 spans plans 39-02..39-07; this plan advances it but does not close it.
# Not marked complete in REQUIREMENTS.md per this execution's explicit instruction.

duration: unrecorded (spans a stall/compaction boundary; continuation-agent wall-clock time for Task 3 completion + SUMMARY: ~1h)
completed: 2026-09-02
---

# Phase 39 Plan 04: Collapse disconnect()/logout() wipe-step sites and re-point their tests Summary

**Both `disconnect()`/`logout()` sites now build a single unconditional seam-driven `wipeSteps` array (the five-step Electron `session.fromPartition` branch is gone from both), their dedicated parity test was inverted into an anti-regrowth guard, and all three test files broken by the collapse are re-pointed with zero vacuous assertions remaining.**

## Performance

- **Tasks:** 3/3 complete
- **Files modified:** 6 (2 source, 4 test — one test file, `storeManagers/legendary/__tests__/user.test.ts`, added beyond the plan's stated scope; see Deviations)

## Continuation note

This plan's execution spanned a stall/compaction boundary. Task 1 and Task 2 were completed and
committed by an earlier instance of this executor session, before the stall. This SUMMARY was
written by the continuation agent that resumed the plan, verified Task 1/2's commits still exist
and match the plan's intent, completed Task 3 (which was left mid-fix, in a temporarily
non-compiling intermediate state, at the point of interruption), and produced this document
covering all three tasks. No SUMMARY existed prior to this one for plan 39-04.

## Accomplishments

- `humble/user.ts`'s `disconnect()` and `legendary/user.ts`'s `logout()` both collapsed to a
  single, unconditional, seam-driven `wipeSteps` array via `getLoginWindowSeamOrThrow()` — the
  `if (seam === null) { ...5-step Electron session.fromPartition wipe... } else { ... }` shape is
  gone from both files entirely.
- `seamBranchParity.test.ts` explicitly dispositioned as **INVERTED** (D-35-14-02 vocabulary):
  from a live two-branch comparison to a static anti-regrowth check (`hasDualBranchWipeShape`)
  plus a fixed reference constant recording exactly what was deleted.
- All three test files broken by the collapse (`humble/__tests__/user.test.ts`,
  `sidecar/__tests__/humbleFlows.test.ts`, and `storeManagers/legendary/__tests__/user.test.ts`,
  the last discovered mid-execution) re-pointed at the seam-only path with zero vacuous
  assertions against dead mocks remaining.
- `pnpm codecheck` and `pnpm lint` both exit 0. `pnpm test --selectProjects Backend`: 188 suites
  passed / 2 failed (both pre-existing, unrelated), 4389 tests passed / 4 failed (same 2 files),
  of 190 suites / 4395 tests total.

## Task Commits

1. **Task 1: Collapse both `disconnect()`/`logout()` wipe-step sites to a single seam-driven path**
   — `a2198f6e2` (feat) — completed and committed before the stall; inherited by this
   continuation agent, verified present in `git log` and matching the plan's `<files>` list
   (`src/backend/humble/user.ts`, `src/backend/storeManagers/legendary/user.ts`).
2. **Task 2: Invert `seamBranchParity.test.ts` to guard the collapsed single-path wipe**
   — `1c2a24df1` (test) — completed and committed before the stall; inherited, verified present.
3. **Task 3: Re-point the disconnect/logout tests broken by Task 1's collapse** — `a5bedaada`
   (test) — completed by this continuation agent, covering 3 files (2 planned + 1 discovered
   deviation).

**Plan metadata:** this commit (docs: complete plan) — see final commit below.

## Files Created/Modified

- `src/backend/humble/user.ts` — `disconnect()`'s `wipeSteps` now built unconditionally via
  `getLoginWindowSeamOrThrow()`; the 5-step Electron branch is gone (Task 1, inherited).
- `src/backend/storeManagers/legendary/user.ts` — `logout()`'s `wipeSteps` likewise collapsed;
  the now-orphaned `session` import from `backend/platform` removed (Task 1, inherited).
- `src/backend/sidecar/__tests__/seamBranchParity.test.ts` — inverted from branch-comparison to
  anti-regrowth static check (Task 2, inherited).
- `src/backend/humble/__tests__/user.test.ts` — 88 → 85 tests (3 deleted); dead mocks and vacuous
  assertions removed; one test re-scoped to install its own local fake seam (Task 3).
- `src/backend/sidecar/__tests__/humbleFlows.test.ts` — 35 tests (count unchanged); the D-05
  ordering-proof test rewritten to drive an explicit all-rejecting fake seam (Task 3).
- `src/backend/storeManagers/legendary/__tests__/user.test.ts` — 14 → 11 tests (3 deleted);
  same class of fix as the humble file, applied here as a Rule 1 auto-fix (Task 3, deviation).

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on: the continuation-boundary handling,
the third-file scope expansion, the anti-vacuity discipline applied to every deletion, why the
Epic wipe-step ORDER invariant is deliberately left to a source gate rather than re-proven live,
and the confirmation that `CATEGORY_MAP`'s shape is unaffected (no flag for plan 39-08).

## Test Deletions — Named, With Reason

### `src/backend/humble/__tests__/user.test.ts` (88 → 85 tests, 3 deleted)

1. **`'clears all five partition caches and clears configStore'`** — pinned the deleted
   `session.fromPartition().clearStorageData/clearCache/clearAuthCache/clearHostResolverCache/
   clearData()` calls directly. DELETED. Surviving coverage: the same describe's seam-path tests
   (`disconnect() — seam path`) already prove `configStore.clear()` runs.
2. **`'WR-02: credential store is cleared FIRST, and a rejected partition-clear step neither
   aborts the remaining steps nor rejects disconnect()'`** — pinned the same deleted 5-step call
   order plus one deliberately-failing step among them. DELETED. Surviving coverage: `'F-6: a
   rejecting clearCookies step does not prevent the storage step from running'` and `'a rejecting
   clearCookies does not throw out of disconnect()'` (both in the seam-path describe) cover
   partial-failure non-abort under the surviving two-step wipe.
3. **`'with no seam installed, the original five Electron wipe steps still run instead'`** —
   pinned the exact `if (seam === null)` branch, asserting the Electron mocks fired and the seam
   mocks did not. DELETED — there is no longer a "no seam installed" case to reach at this call
   site (`getLoginWindowSeamOrThrow()` throws instead of falling back), and no test needs to pin
   that throw here (the accessor's own throw behavior belongs to `loginWindowSeam.test.ts`, not
   `disconnect()`'s).

Also (no test count change, in-place fixes):
- 5 dead mock declarations (`mockClearStorageData`, `mockClearCache`, `mockClearAuthCache`,
  `mockClearHostResolverCache`, `mockClearData`) and the `.not.toHaveBeenCalled()` assertions
  against them in the `reconnect()` test were removed — Task 1 left these methods with zero
  remaining call sites anywhere in `src/backend`, making the assertions vacuously true regardless
  of what `reconnect()` does. The D-11 invariant (`reconnect()` opens the partition without
  wiping it) survives via the still-valid `mockFromPartition` assertion.
- `'csrfToken lives on configStore and is wiped by disconnect() alongside the session cookie'`
  was re-scoped (not deleted) to install/tear down a local fake seam, since `disconnect()` now
  always requires one and this test lives outside the describes that already provide one.

### `src/backend/sidecar/__tests__/humbleFlows.test.ts` (35 tests, count unchanged)

No tests deleted. The `humbleDisconnect — D-05 ordering proof (real disconnect(), not
automocked)` test was rewritten in place: it used to rely on the real (unmocked) `electronStub`'s
`session.fromPartition()` returning `{}` to fabricate failing wipe steps for free; now it installs
an explicit all-rejecting fake `LoginWindowSeam` via `setLoginWindowSeam()` (obtained through a
fresh, unmocked `require('../../humble/loginWindowSeam')` sharing the same post-`resetModules()`
module registry as the `jest.requireActual()`'d `humble/user.ts`), and the expected `warnSpy` call
count was corrected from 5 (old 5-step wipe) to 2 (new 2-step `wipeSteps` array).

The surviving assertions, quoted verbatim:

```typescript
await expect(RealHumbleUser.disconnect()).resolves.toBeUndefined()

// (a) all three store clears happened.
expect(clearConfigSpy).toHaveBeenCalledTimes(1)
expect(clearLibrarySpy).toHaveBeenCalledTimes(1)
expect(clearSyncSpy).toHaveBeenCalledTimes(1)
expect(
  realStores.configStore.get_nodefault('sessionCookie')
).toBeUndefined()

// (b) they happened even though both surviving wipeSteps entries
// (clearHumbleCookies, clearHumbleStorage) rejected against the
// all-rejecting fake seam -- proving the credential wipe is NOT
// contingent on either partition step succeeding.
expect(warnSpy).toHaveBeenCalledTimes(2)
for (const call of warnSpy.mock.calls) {
  const message = Array.isArray(call[0]) ? call[0].join(' ') : call[0]
  expect(String(message)).toMatch(/wipe step/i)
}
```

This is the D-05 ordering proof: all three Humble store clears (config, library, sync) happen
independently of every login-window-seam wipe step rejecting, satisfying REQ-34.4-09.

### `src/backend/storeManagers/legendary/__tests__/user.test.ts` (14 → 11 tests, 3 deleted — deviation, see below)

1. **`'REQ-34.5-04 (T-34.5-19, the defect this task fixes): with a session object exposing no
   clear* methods, logout() does NOT throw and configStore.delete("userInfo") STILL runs'`** —
   pinned the deleted `if (seam === null)` branch's specific defect-fix scenario. DELETED as a
   duplicate: the same invariant (credential-side cleanup runs even when the entire wipe fails)
   is already covered, unweakened, by the surviving seam-based test `'F-6 twin: the
   credential-side cleanup runs even when BOTH the cookie step and the storage step reject'`.
2. **`'REQ-34.5-04: with a full Electron-shaped session, all five clear calls run in order'`** and
   its byte-identical duplicate **`'REQ-34.5-04: with a full Electron-shaped session, all five
   clear calls still run in order (unchanged by plan 16)'`** — both pinned the deleted 5-step
   Electron call order. BOTH DELETED. The new `clearEpicStorage`-before-`clearEpicCookies` order
   invariant is deliberately covered by `epicLogoutDomains.test.ts`'s dedicated SOURCE gate (see
   key-decisions above for why a live test cannot observe this property) — that gate was green
   both before and after Task 1, so deleting these two duplicates creates no coverage gap.

Also (no test count change beyond the above, in-place fixes):
- `'REQ-34.5-04: asserts call ORDER — auth --delete runs before any cookie step, and cookie steps
  run before configStore.delete'` was re-pointed (not deleted, no duplicate existed) to install a
  `makeMockSeam()` and track order via the seam's `clearCookies` call instead of the dead
  `mockClearStorageData`.
- 2 now-vacuous `expect(mockFromPartition).not.toHaveBeenCalled()` assertions (in the surviving
  `'the CLI-error early return is unchanged'` and `'with a seam installed, clearCookies is called
  with the Epic host...'` tests) were removed with explanatory comments, mirroring the humble
  file's `reconnect()` fix — `session.fromPartition` has zero remaining call sites in
  `legendary/user.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `storeManagers/legendary/__tests__/user.test.ts` broken by Task 1, outside Task 3's stated file scope, fixed to satisfy the plan's own overall verification**
- **Found during:** Task 3, while running the full `pnpm test --selectProjects Backend` suite
  after fixing the two files Task 3's `<files>` list named.
- **Issue:** Task 1 collapsed `legendary/user.ts`'s `logout()` exactly as it collapsed
  `humble/user.ts`'s `disconnect()` (confirmed via `git show --stat a2198f6e2` touching both
  files), but `storeManagers/legendary/__tests__/user.test.ts` was never updated, leaving 4 tests
  failing and 2 more asserting vacuous truths.
- **Fix:** Applied the same class of fix used for the humble test file: deleted 3 tests that
  pinned the deleted branch (2 of them duplicates of surviving seam-based tests, one a genuine
  duplicate pair), re-pointed the one non-duplicate order-proof test to the seam, and removed 2
  vacuous `mockFromPartition.not.toHaveBeenCalled()` assertions. Full detail above.
- **Files modified:** `src/backend/storeManagers/legendary/__tests__/user.test.ts`.
- **Verification:** `npx tsc --noEmit` clean; `npx jest --selectProjects Backend
  --testPathPattern "legendary/__tests__/user.test.ts"` → 11 passed, 11 total; `npx eslint` → 0
  errors (pre-existing style warnings only).
- **Committed in:** `a5bedaada` (Task 3's commit, alongside the two originally-scoped files).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix required by the plan's own overall
verification, in a file the plan's Task 3 didn't originally list because the plan under-scoped
the blast radius of Task 1's collapse).
**Impact on plan:** Necessary to satisfy this plan's own stated `<verification>` ("`pnpm test
--selectProjects Backend` exits 0 ... and every file this plan touched confirmed present in the
collected run") — `legendary/user.ts` was touched by Task 1, so its test file's health is this
plan's responsibility, not a later plan's. No scope creep into 39-05/39-06/39-07's territory (none
of those plans' file lists include this file).

## Issues Encountered

- Mid-execution, `storeManagers/legendary/__tests__/user.test.ts` was left in a temporarily
  non-compiling intermediate state (module-scope dead mock declarations deleted before all
  downstream references were updated) across the stall/compaction boundary. Resolved by
  systematically walking every remaining reference (`grep` confirmed completeness) and applying
  the same delete/re-point pattern already validated on the humble file, then re-verifying via
  `tsc`, `jest`, and `eslint` before committing. No broken state was ever committed.

## Verification Results

- `pnpm codecheck` (`tsc --noEmit`): **exit 0**, no output.
- `pnpm lint`: **exit 0**, 0 errors, 4165 warnings (pre-existing style warnings only; no new
  warnings introduced by this plan's changes).
- `pnpm test --selectProjects Backend` (full suite):
  ```
  Test Suites: 2 failed, 188 passed, 190 total
  Tests:       4 failed, 2 skipped, 4389 passed, 4395 total
  ```
  The 2 failed suites are **pre-existing and unrelated** to this plan:
  - `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` — native-LZMA
    `lzmaDecoderKind()` reports `'pure-js'` instead of `'native'` on this dev machine (a build/
    environment property, not a regression from this plan's changes).
  - `src/backend/downloadmanager/__tests__/utils.test.ts` — an i18n key mismatch
    (`box.error.install.stalled` vs `gamelib:box.error.install.stalled`), pre-existing, unrelated
    to login/logout paths.
  - All three files this plan touched or added were confirmed present and green in this run:
    `src/backend/humble/__tests__/user.test.ts` (85/85), `src/backend/sidecar/__tests__/
    humbleFlows.test.ts` (35/35), `src/backend/storeManagers/legendary/__tests__/user.test.ts`
    (11/11), and `src/backend/sidecar/__tests__/seamBranchParity.test.ts` (inherited from Task 2,
    part of the 188 passing suites).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Both `disconnect()`/`logout()` wipe-step call sites are on the single seam-only path with a full,
non-vacuous test suite backing them. `seamBranchParity.test.ts`'s anti-regrowth check will catch
any future reintroduction of the dual-branch shape at either site. `CATEGORY_MAP`'s shape is
confirmed unchanged (no flag for plan 39-08). No blockers for plans 39-05 through 39-09.

---
*Phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec*
*Completed: 2026-09-02*
