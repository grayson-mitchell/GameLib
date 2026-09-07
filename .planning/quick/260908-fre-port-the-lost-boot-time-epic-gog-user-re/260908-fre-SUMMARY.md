---
phase: quick
plan: 260908-fre
subsystem: tauri-sidecar
tags: [bootstrap, online_monitor, legendary, gog, configStore, boot-reconciliation]
requires: []
provides: [reconcileStoreUsersWhenOnline]
affects: [src/backend/sidecar/bootstrap.ts]
tech-stack:
  added: []
  patterns:
    - "Two-guard try/catch: outer wraps runOnceWhenOnline() registration, inner wraps the deferred callback body (a later event-loop turn the outer catch cannot see)."
    - "Floated-promise .catch() on GOGUser.getUserDetails() since runOnceWhenOnline discards its callback's return value."
key-files:
  created:
    - src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md (moved to completed/)
decisions:
  - "Verbatim log-string preservation: the ported logInfo('User Not Found, removing it from Store', ...) line does NOT get this file's local [bootstrap] prefix convention, because the exact literal is the todo's bundle-level grep target."
  - "New imports (LegendaryUser, GOGUser, configStore) add no new module to the sidecar bundle — handlers.ts -> runnerAuthFlowRegistration.ts already imports both classes transitively."
metrics:
  duration: "~1 session (continued after context compaction)"
  completed: 2026-09-08
---

# Quick 260908-fre: Port the lost boot-time Epic/GOG user reconciliation Summary

Restored the boot-time side effect deleted with `src/backend/main.ts` (commit `5643c7583`) by
porting it into the Tauri sidecar's `bootstrap.ts` as a new exported helper,
`reconcileStoreUsersWhenOnline()`, called once from `init()` behind a module-scope guard.

## What was built

**Task 1 — `src/backend/sidecar/bootstrap.ts` (commit `204025b39`)**

Added Block E: a new exported `reconcileStoreUsersWhenOnline()` function, a
`storeUserReconcileInitialized` module-scope guard flag, and a guarded call site in `init()`
placed after Block D and before `output.write(READY_SENTINEL)`. The function:
- Deletes a stale `configStore` `userInfo` entry and logs
  `'User Not Found, removing it from Store'` (with `{ prefix: LogPrefix.Backend, forceLog: true }`,
  verbatim, unprefixed) when `LegendaryUser.isLoggedIn()` is false.
- Refreshes GOG user details via `GOGUser.getUserDetails()` (with a `.catch()`) when
  `GOGUser.isLoggedIn()` is true.
- Uses two try/catch layers (outer around the `runOnceWhenOnline` registration, inner around the
  deferred callback body) plus the floated-promise `.catch()`, so neither leg can fail boot.

`npx tsc --noEmit` clean; eslint baseline unchanged (9 warnings, 0 errors, confirmed identical to
pre-change baseline by stash/diff).

**Task 2 — dedicated test suite + containment registration (commit `00e67503c`)**

New file `src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts` with exactly 7 test cases:
1. Wiring proof: `init()` reconciles a logged-out Epic user and logs it.
2. Direct call, Epic logged OUT: seeded `userInfo` deleted, exact log call made.
3. Direct call, Epic logged IN: seeded `userInfo` survives, no such log call made.
4. Direct call, GOG logged IN: `getUserDetails()` called.
5. Direct call, GOG logged OUT: `getUserDetails()` NOT called.
6. Never-fails-boot (async): a rejected `getUserDetails()` does not throw out of
   `reconcileStoreUsersWhenOnline()`.
7. Never-fails-boot (sync): a throwing `isLoggedIn()` does not throw out of
   `reconcileStoreUsersWhenOnline()`.

Registered the new suite in `testContainment.test.ts`'s `STRUCTURALLY_CONTAINED_SUITES` array
(alphabetically, between `bootstrap.test.ts` and `bootstrapWirings.test.ts`), and corrected the
docstring's stale "59 files: 4 + 55" prose. Measured, not assumed: on-disk count was 61 (4 + 57)
before this task's new file, matching established fact 10, and 62 (4 + 58) after it. `T-34.2-83`
(the strict set-equality census) is green with the new suite registered.

A `resetMocks: true`-related gotcha was discovered and fixed during this task: `src/backend/jest.config.js`
strips the implementation off every `jest.fn(...)`-created mock before every test, including the
first one, even implementations supplied at module-factory creation time. A top-level `beforeEach`
re-arming `runOnceWhenOnline`'s inline-invoke mock was added to compensate (verified empirically via
disposable probe test files, since deleted).

**Task 3 — regression sweep, bundle receipt, todo closure (commit `01f749634`)**

- Regression sweep green: `bootstrap.test.ts`, `bootstrapWirings.test.ts`,
  `playtimeLockBootClear.test.ts`, `structuralContainment.test.ts` — 4 suites, 56 tests, all
  passed. `bootstrapWirings.test.ts`'s `init()` idempotency test ("two `init()` calls yield exactly
  one fetch and one listener") passed unaffected.
- `structuralContainment.test.ts`'s `node:os` gate does not fire on the new test file: its
  `usesForbiddenNodeOsBinding()` predicate strips comments before matching, and the new file's only
  mention of the `'node:os'` specifier lives inside a doc-comment (confirmed both by direct
  inspection of the gate's source and by the suite passing green).
- Bundle receipt recorded (see below).
- Todo closed: `.planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md`
  moved to `.planning/todos/completed/` with a `RESOLVED 2026-09-08 by quick-260908-fre` status.
- Cross-reference check: `grep -rln "boot-time-epic-and-gog\|A4" .planning/todos/pending/` returned
  only the todo being closed itself — no sibling pending todos reference this finding.

## Mutation proofs (mandatory, Task 2)

All three prescribed mutations were applied to `bootstrap.ts`, confirmed RED, then reverted.

**Mutation 1 — comment out the `reconcileStoreUsersWhenOnline()` call site in `init()`:**
```
FAIL src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
  ● todo 2026-09-06 -- sidecar boot restores Epic/GOG user reconciliation
    › wiring proof: init() reconciles a logged-out Epic user and logs it

    expect(received).toBe(expected) // Object.is equality

    Expected: false
    Received: true

      99 |     init(new PassThrough(), new PassThrough())
     100 |
    101 |     expect(configStore.has('userInfo')).toBe(false)
                                                    ^
Tests: 1 failed, 6 passed, 7 total
```
The other 6 direct-call cases were unaffected (as expected — they call
`reconcileStoreUsersWhenOnline()` directly, bypassing `init()`'s call site entirely). Restored.

**Mutation 2 — delete `forceLog: true` from the ported `logInfo(...)` options object:**
```
FAIL src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
  ● todo 2026-09-06 -- sidecar boot restores Epic/GOG user reconciliation
    › wiring proof: init() reconciles a logged-out Epic user and logs it

    expect(jest.fn()).toHaveBeenCalledWith(...expected)
    Expected: "User Not Found, removing it from Store", {"forceLog": true, "prefix": "Backend"}
    Number of calls: 1

  ● todo 2026-09-06 -- sidecar boot restores Epic/GOG user reconciliation › reconcileStoreUsersWhenOnline() -- called directly
    › case 2 -- Epic logged OUT: seeded userInfo is deleted, exact log call made

    expect(received).toHaveLength(expected)
    Expected length: 1
    Received length: 0

Tests: 2 failed, 5 passed, 7 total
```
Both the wiring proof and case 2 failed, since both assert the exact options object (not merely
the message string) — the receipt `forceLog: true` exists to protect. Restored.

**Mutation 3 — remove the `.catch()` from the floated `GOGUser.getUserDetails()` call:**
```
FAIL src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
  ● todo 2026-09-06 -- sidecar boot restores Epic/GOG user reconciliation › reconcileStoreUsersWhenOnline() -- called directly
    › case 6 -- never-fails-boot (async): a rejected getUserDetails() does not surface

    UnhandledPromiseRejection: This error originated either by throwing inside of an async
    function without a catch block, or by rejecting a promise which was not handled with .catch().
    The promise rejected with the reason "gogdl auth failed".

Tests: 1 failed, 6 passed, 7 total (plus the unhandled-rejection surfaced alongside)
```
Case 6 failed with the expected unhandled-rejection signature. Restored.

Final state after all three mutations reverted, confirmed green:
`npx jest src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts src/backend/sidecar/__tests__/testContainment.test.ts`
→ 62 tests passed.

## Bundle-level receipt (Task 3, verification item 6)

```
$ pnpm build:sidecar
  build/main/sidecar.js  1.3mb
  Done in 34ms

$ grep -c "User Not Found, removing it from Store" build/main/sidecar.js
1

$ stat -f "size=%z bytes, mtime=%Sm" build/main/sidecar.js
size=1363535 bytes, mtime=Sep  8 11:43:12 2026
```

The literal appears **1 time** in the built bundle (`build/main/sidecar.js`, 1,363,535 bytes,
2026-09-08 11:43), versus the todo's original evidence of **0 occurrences** in a 1,351,269-byte
bundle from 2026-09-06 10:27. Note: this is a bundle-level grep, not a source-level grep of
`bootstrap.ts` — the plan explicitly called out that a source-level grep would be unsound here,
since the string now also appears in `bootstrap.ts`'s own doc-comment block describing the design
decision, not just in the executable `logInfo(...)` call.

## Established-fact-4 honesty note (Epic leg's pre-existing partial mitigation)

The Epic leg of this fix is a restoration of *eager, boot-time* reconciliation, not the
introduction of the only reconciliation that exists. `LegendaryUser.getUserInfo()`
(`src/backend/storeManagers/legendary/user.ts`) already calls `configStore.delete('userInfo')`
lazily, on its own read path, when legendary reports not-logged-in. What was missing — and what
this fix restores — is the *proactive*, boot-time trigger: without it, a stale `userInfo` entry
could survive indefinitely if nothing happened to call `getUserInfo()` after Epic credentials went
bad. This fix does not modify `storeManagers/legendary/user.ts` or `storeManagers/gog/user.ts`
themselves; it adds the missing boot-time caller in `bootstrap.ts`.

## Deviations from Plan

None — plan executed exactly as written, including all 3 mandated mutation proofs and the
measured (not assumed) suite-count correction in `testContainment.test.ts`.

## Auth Gates

None encountered.

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired data sources introduced.

## Threat Flags

None — both crossed boundaries (local filesystem via `configStore`/`existsSync`, and the GOG API
via `getUserDetails()` -> `gogdl auth` subprocess -> `api.gog.com`) were already crossed by the same
underlying code on other call paths; this change adds only a new boot-time trigger, not a new
boundary. Matches the plan's own threat model (T-fre-01 through T-fre-03, all already dispositioned
`accept`/`mitigate` in the plan).

## Self-Check: PASSED

- FOUND: src/backend/sidecar/bootstrap.ts (modified, commit 204025b39)
- FOUND: src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts (created, commit 00e67503c)
- FOUND: src/backend/sidecar/__tests__/testContainment.test.ts (modified, commit 00e67503c)
- FOUND: .planning/todos/completed/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md (commit 01f749634)
- FOUND: commit 204025b39 in git log
- FOUND: commit 00e67503c in git log
- FOUND: commit 01f749634 in git log
