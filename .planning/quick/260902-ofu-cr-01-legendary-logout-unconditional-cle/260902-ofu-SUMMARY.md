---
phase: quick-260902-ofu
plan: 01
subsystem: auth
tags: [legendary, epic, logout, seam, security, tdd]

requires:
  - phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
    provides: "The mechanical getLoginWindowSeam() -> getLoginWindowSeamOrThrow() substitution that introduced CR-01, plus 39-REVIEW.md's finding and 39-VERIFICATION.md's human_verification item naming it"
provides:
  - "LegendaryUser.logout() runs its credential-side cleanup (configStore.delete('userInfo') + clearCache('legendary')) even when no login-window seam is installed"
  - "A 12th regression test in legendary/__tests__/user.test.ts pinning the no-seam invariant, proven RED-then-GREEN"
  - "39-VERIFICATION.md's sole human_verification item for Phase 39 marked resolved"
affects: [legendary-auth, humble-seam-pattern, phase-39-verification]

tech-stack:
  added: []
  patterns:
    - "Per-closure seam acquisition inside a guarded wipe-step loop, rather than a single upfront acquisition, so a missing dependency throws inside the loop's own try/catch instead of before it"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/legendary/__tests__/user.test.ts
    - src/backend/storeManagers/legendary/user.ts
    - .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md

key-decisions:
  - "Chosen shape: move getLoginWindowSeamOrThrow() from one bare statement at user.ts:210 into the first line of each of the two wipeSteps closures (clearEpicStorage, clearEpicCookies), rather than wrapping the whole block in try/finally"
  - "The try/finally fallback named in 39-VERIFICATION.md's human_verification item was NOT needed -- no pinned gate (seamBranchParity.test.ts, loginWindowSeamPredicateRemoved.test.ts, REQ-34.5-04's ordering test) forced the switch"
  - "The hoist of credential cleanup above seam acquisition (39-REVIEW.md's primary suggestion) remains rejected -- it breaks REQ-34.5-04's pinned deleteIdx > cookieIdx ordering assertion"
  - "39-VERIFICATION.md's human_verification item is marked resolved at the ITEM level; the file's own **Status:** human_needed line and phase-level status are left untouched -- flipping phase status is /gsd-verify-phase 39's job, not a quick task's"

requirements-completed: []

duration: 25min
completed: 2026-09-02
---

# Quick Task 260902-ofu: Close Phase 39 CR-01 Summary

**`LegendaryUser.logout()` now runs its credential-side cleanup even with no login-window seam installed, by moving seam acquisition into each wipe-step closure instead of one bare upfront statement.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-02T05:38:00Z (approx, first commit 17:48 local)
- **Completed:** 2026-09-02T05:51:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 3

## Accomplishments

- Added and RED-proved a 12th regression test for `LegendaryUser.logout()`'s no-seam path, then made it GREEN with a three-line production fix
- Closed Phase 39's CR-01 (T-34.5-19, ASVS V3): a missing login-window seam can no longer skip the mandatory `configStore.delete('userInfo')` + `clearCache('legendary')` credential wipe
- Resolved Phase 39's sole open `human_verification` item in `39-VERIFICATION.md` without touching phase status, `STATE.md`, or `ROADMAP.md`
- Left every pinned gate (`seamBranchParity.test.ts`, `loginWindowSeamPredicateRemoved.test.ts`, `epicLogoutDomains.test.ts`, `epicCookieCensus.test.ts`, REQ-34.5-04's ordering test) green and unmodified

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin the no-seam credential-cleanup invariant with a RED test** - `27ecd7920` (test)
2. **Task 2: Move the seam acquisition inside the guarded wipe steps** - `ca7473bb2` (fix)
3. **Task 3: Record CR-01 as resolved in the Phase 39 verification record** - see below (docs)

**Plan metadata:** this SUMMARY.md and the `39-VERIFICATION.md` edit are committed together as the docs commit immediately after this file is written.

## Files Created/Modified

- `src/backend/storeManagers/legendary/__tests__/user.test.ts` - Added the 12th test: `CR-01 (T-34.5-19): with NO seam installed, the credential-side cleanup still runs and the wiring diagnostic still reaches the caller`
- `src/backend/storeManagers/legendary/user.ts` - Deleted the bare `const seam = getLoginWindowSeamOrThrow()` at the former line 210 (replaced with an explanatory comment); inserted `const seam = getLoginWindowSeamOrThrow()` as the first statement of the `clearEpicStorage` closure and again as the first statement of the `clearEpicCookies` closure
- `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md` - Added `resolved: true` + `resolution:` to the sole `human_verification` frontmatter item; added a `### CR-01 resolution` body subsection; left `**Status:** human_needed` unchanged

## Decisions Made

- **Shape chosen: per-closure acquisition, not try/finally.** The plan's `<shape_decision>` named a `try/finally` around the whole seam-acquisition-and-wipe-steps block as the fallback if any pinned gate forced a switch. No gate did — `seamBranchParity.test.ts`'s `wipeSteps` shape parser, `loginWindowSeamPredicateRemoved.test.ts`'s predicate-text grep, and REQ-34.5-04's ordering assertion all stayed green against the per-closure shape, so the lower-footprint option (three-line diff, zero re-indentation, no `prettier --write` needed beyond the single already-clean file) shipped.
- **The naive hoist stays rejected.** Moving `configStore.delete('userInfo')` + `clearCache('legendary')` above the seam acquisition was tried and reverted during Phase 39 itself because it breaks REQ-34.5-04's `deleteIdx > cookieIdx` pinned assertion (cookie steps must run before the credential delete for Epic specifically). This quick task did not re-attempt it.
- **Phase status left alone.** `39-VERIFICATION.md`'s `**Status:** human_needed` and the file's overall `status:` frontmatter key are unchanged. Closing this quick task's item does not re-verify the phase; that is `/gsd-verify-phase 39`'s responsibility. `human_needed` (not `gaps_found`) is what keeps Phase 39 visible to `gsd-sdk query audit-uat` in the meantime — flipping it here would have hidden the phase from that surface.
- **No `gsd-sdk query state.*` or `roadmap.*` verbs were run.** Per the project-specific hard rules, `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified at all in this quick task.

## Deviations from Plan

None — plan executed exactly as written, including its named fallback rule (which was evaluated and found unnecessary, not skipped).

## Task 1: Verbatim RED Output

Captured against the tree at commit `0114292fb` plus only the new test (before the `user.ts` fix), running:

```
npx jest --runTestsByPath src/backend/storeManagers/legendary/__tests__/user.test.ts
```

```
FAIL Backend src/backend/storeManagers/legendary/__tests__/user.test.ts
  LegendaryUser.logout()
    ✓ REQ-34.5-04: the CLI-error early return is unchanged — no cookie step or configStore.delete runs (1 ms)
    ✓ REQ-34.5-04: asserts call ORDER — auth --delete runs before any cookie step, and cookie steps run before configStore.delete
    ✓ REQ-34.5-04 (T-34.5-20): with a seam installed, clearCookies is called with the Epic host, and off macOS the window is closed even when the clear rejects (6 ms)
    ✓ REQ-34.5-04 (T-34.5-20): with a seam installed and a healthy clear, the domain passed is never a blanket/empty value
    ✓ F-6 twin: the Tauri wipeSteps run BOTH a cookie step and a storage step (more than one entry) (1 ms)
    ✓ F-6 twin: the credential-side cleanup runs even when BOTH the cookie step and the storage step reject
    ✕ CR-01 (T-34.5-19): with NO seam installed, the credential-side cleanup still runs and the wiring diagnostic still reaches the caller (3 ms)
    ✓ F-6 twin: a rejecting clearStorage step still leaves logout() resolving, and the cookie step ran anyway (1 ms)
    ✓ F-6 twin: a rejecting clearCookies step does not prevent the storage step from running
    ✓ REQ-34.4.1-06 (Plan 23, F-6 Defect B): clearEpicCookies logs the measured count the clear returned
    ✓ REQ-34.4.1-06 (Plan 23, F-6 Defect B) / T-35-39: a clearCookies total of 0 FAILS the logout (it used to be a swallowed warning) (1 ms)
    ✓ REQ-34.4.1-06 (Plan 23, F-6 Defect B) / T-35-39: a healthy non-zero total resolves and warns about nothing

  ● LegendaryUser.logout() › CR-01 (T-34.5-19): with NO seam installed, the credential-side cleanup still runs and the wiring diagnostic still reaches the caller

    expect(jest.fn()).toHaveBeenCalledWith(...expected)

    Expected: "userInfo"

    Number of calls: 0

      372 |     )
      373 |
    > 374 |     expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
          |                                    ^
      375 |     expect(clearCache).toHaveBeenCalledWith('legendary')
      376 |   })
      377 |

      at Object.<anonymous> (src/backend/storeManagers/legendary/__tests__/user.test.ts:374:36)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 11 passed, 12 total
```

The `rejects.toThrow('no login-window seam is installed')` assertion passed (the throw did surface to the caller); the `configStore.delete('userInfo')` assertion failed with 0 calls — exactly the defect CR-01 describes: the credential cleanup was skipped, not merely delayed or reordered.

## Task 2: Gate Sweep Results (all green, numbers measured)

| Gate | Result |
|------|--------|
| `npx jest --runTestsByPath .../legendary/__tests__/user.test.ts` | 12/12 passed |
| `npx jest --runTestsByPath .../sidecar/__tests__/seamBranchParity.test.ts` | 29/29 passed |
| `npx jest --runTestsByPath meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` | 11/11 passed |
| `npx jest --runTestsByPath .../epicLogoutDomains.test.ts .../epicCookieCensus.test.ts` | 40/40 passed (combined) |
| `pnpm codecheck` | exit 0, no output (clean `tsc --noEmit`) |
| `pnpm lint` | exit 0, `4157 problems (0 errors, 4157 warnings)` — ratchet unchanged, no new warning |
| `python3 meta/runPlanningGates.py` | `7/7 planning gates passed.` |
| `npx prettier --check src/backend/storeManagers/legendary/user.ts` | `All matched files use Prettier code style!` |

No `seam === null` / `!seam` / `seam ? :` predicate was reintroduced anywhere under
`src/backend/storeManagers` or `src/backend/humble` — confirmed by `loginWindowSeamPredicateRemoved.test.ts` staying green (it would go RED on any such reintroduction) and by direct grep showing exactly two `const seam = getLoginWindowSeamOrThrow()` acquisitions, both inside the two wipe-step closures, and zero at the method's own statement indent.

## Accepted Residual (from `<shape_decision>`)

Durability against a FUTURE eager throw added between the seam-acquisition point and the
credential cleanup is weaker under the shipped shape than a structural `try/finally` would give:
a `try/finally` would also cover some later throwing statement added anywhere inside the wrapped
block, whereas the shipped per-closure acquisition only guards the seam-acquisition call itself
(which is now the sole per-closure statement moved). This is judged acceptable because: (1) the
region between CLI success and the credential cleanup was independently re-confirmed (measured
fact 2 in the plan) to contain no other eager-throwing statement outside the loop's own
try/catch, and (2) the new no-seam test stands as the specific regression guard for exactly the
case this task exists to close. A future contributor adding a new throwing statement directly
inside `logout()`'s body (outside the `wipeSteps` closures and outside the loop) would not be
caught by either the existing gates or this new test — that is a standing, named limitation, not
a silent one.

## Three Commit SHAs

1. **Test (RED):** `27ecd7920` — `test(legendary): pin logout's no-seam credential-cleanup invariant (CR-01)`
2. **Fix (GREEN):** `ca7473bb2` — `fix(legendary): keep logout's credential cleanup reachable with no seam (CR-01)`
3. **Docs:** committed immediately after this file is written — `docs(39): record CR-01 resolution -- logout credential cleanup reachable with no seam`

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired data sources were introduced by
this task.

## Threat Flags

None — this task closes an existing, already-registered threat (T-34.5-19) and does not
introduce new network endpoints, auth paths, file-access patterns, or trust-boundary schema
changes.
