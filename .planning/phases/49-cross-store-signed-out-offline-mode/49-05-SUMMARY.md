---
phase: 49-cross-store-signed-out-offline-mode
plan: 05
subsystem: auth
tags: [sign-in-probe, legendary, gogdl, nile, expiry-flag, epoch-fence, sidecar]

requires:
  - phase: 49-cross-store-signed-out-offline-mode
    provides: "legendaryConfigStore and the three persisted `expired` keys, CallRunnerOptions.skipErrorHandler (49-03)"
  - phase: 49-cross-store-signed-out-offline-mode
    provides: "classifyLegendaryStatus / classifyGogdlAuth / classifyNileOutput, createBoundedOutputCapture, the epoch fence, noteSignInSucceeded / noteSignedOut, applySignInVerdict (49-04)"
provides:
  - "probeLegendarySession / probeNileSession / probeGogSession and SIGN_IN_PROBE_ABORT_IDS in signInProbe/runnerProbes.ts, for 49-08's pass"
  - "GOGUser.getCredentialsWithVerdict: the single gogdl auth spawn site, verdict per D-17, one shared in-flight promise with Block E"
  - "Epic, Amazon and GOG expiry-flag clear sites: sign-in success -> delete('expired') + noteSignInSucceeded; logout -> noteSignedOut"
  - "T-49-07 source gate: skipErrorHandler: true confined to signInProbe/** and gog/user.ts"
affects: [49-06, 49-07, 49-08, 49-09, 49-11, 49-12]

actuals:
  tokens: 13270
  tasks: 2
  commits: 4

plan_head_before: 1f86d65203833819c032d271227ad3da74509c79
plan_head_after: 44053c8750abbd1302e0a00218f713cd31a8fd45

tech-stack:
  added: []
  patterns:
    - "Probe = lazy `await import('../storeManagers')` + bounded onOutput capture + skipErrorHandler + classifier; no logger import at all"
    - "Single spawn site returns {credentials, verdict}; callers that do not want the verdict (Block E) ignore it, so the pass stays the only latch"
    - "In-flight promise with identity-checked clear in finally, so a rejected spawn cannot poison the next call"

key-files:
  created:
    - src/backend/storeManagers/legendary/__tests__/expiryProbe.test.ts
    - src/backend/storeManagers/nile/__tests__/expiryProbe.test.ts
    - src/backend/storeManagers/gog/__tests__/expiryProbe.test.ts
    - src/backend/signInProbe/runnerProbes.ts
    - src/backend/signInProbe/__tests__/runnerProbes.test.ts
  modified:
    - src/backend/storeManagers/legendary/user.ts
    - src/backend/storeManagers/nile/user.ts
    - src/backend/storeManagers/gog/user.ts
    - src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts
    - src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
    - src/backend/storeManagers/gog/__tests__/user.test.ts
    - src/backend/storeManagers/gog/__tests__/logoutCookies.test.ts

key-decisions:
  - "The GOG probe and the GOGUser import in runnerProbes.ts are lazy (`await import('../storeManagers/gog/user')`), matching the libraryManagerMap import, so runnerProbes.ts has no static storeManagers edge and the Task 1 source gate holds for the whole file."
  - "The Epic clear site is LegendaryUser.login only: a grep of src/backend found no other `subcommand: 'auth'` with --code or --sid success path (launcher.ts hits are the argv redactor list; gog/user.ts and nile/user.ts are other runners)."
  - "The Epic and Amazon clear is placed before getUserInfo()/after getUserData() respectively; Epic's clear runs even if the user.json read yields undefined, because the CLI exit itself proved the session."
  - "GOG's verdict is computed for every caller of getCredentialsWithVerdict but only 49-08's pass will apply it; Block E's getUserDetails reads .credentials only."

patterns-established:
  - "Source gates that walk the tree carry a non-vacuity companion test asserting the allowed sites are seen (caught a wrong-root bug while writing this one)"

requirements-completed: [R2]

coverage:
  - id: D1
    description: "Epic and Amazon probes run legendary status --json / nile list-updates --json with unique abort ids, skipErrorHandler and a bounded never-logged capture; only an auth failure yields expired"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/signInProbe/__tests__/runnerProbes.test.ts (16 tests)"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/legendary/__tests__/expiryProbe.test.ts and nile/__tests__/expiryProbe.test.ts (per-store non-auth fixtures leave the flag unset)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GOG verdict follows D-17 inside the single gogdl auth spawn; Block E and the pass share one in-flight promise"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/gog/__tests__/expiryProbe.test.ts (concurrent calls spawn exactly once)"
        status: pass
      - kind: integration
        ref: "src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts and gogPresenceBootWire.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sign-in success clears the flag and publishes healthy; logout clears it and bumps the epoch; a probe that began before a sign-in returns stale and cannot re-set expired"
    requirement: R2
    verification:
      - kind: unit
        ref: "expiryProbe.test.ts in legendary, nile and gog (login, logout and epoch-staleness cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No store-manager file writes set('expired', true), and skipErrorHandler: true appears only in signInProbe/** and gog/user.ts"
    requirement: R2
    verification:
      - kind: unit
        ref: "per-store source gates in expiryProbe.test.ts and runnerProbes.test.ts 'T-49-07'"
        status: pass
    human_judgment: false
  - id: D5
    description: "The probes classify the real legendary / gogdl / nile output on a signed-out and an offline machine"
    verification: []
    human_judgment: true
    rationale: "Marker strings and the cost of legendary status are source-derived and live-gated by 49-11 / 49-12 (RESEARCH A1, A3, A4); a drifted marker degrades to unknown, never a false expired."

duration: 13min
completed: 2026-10-09
status: complete
---

# Phase 49 Plan 05: Epic, GOG and Amazon expiry probes Summary

**Epic, GOG and Amazon each have an expiry probe whose only `expired` verdict is a proven authentication failure, with sign-in and logout clear sites wired through the 49-04 epoch fence, and GOG's verdict decided inside its single shared `gogdl auth` spawn.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-09T11:17:44Z
- **Completed:** 2026-10-09T11:31:30Z
- **Tasks:** 2
- **Files modified:** 12 (5 created, 7 modified)

## Accomplishments

- `runnerProbes.ts` exports `probeLegendarySession`, `probeNileSession`, `probeGogSession` and `SIGN_IN_PROBE_ABORT_IDS` (`signin-probe-legendary`, `signin-probe-nile`, `gogdl-get-credentials`). The Epic and Amazon probes spawn with `skipErrorHandler: true`, feed `onOutput` into a bounded capture, and import no logger, so captured text cannot be logged (T-49-15). Argv are constant literals, asserted exactly (T-49-14).
- `GOGUser.getCredentialsWithVerdict` is the one `gogdl auth` spawn site. It returns `{credentials, verdict}`: offline is `unknown` with no spawn, a TTL hit is `healthy`, otherwise it joins or starts a module-level in-flight promise and classifies the capture with `classifyGogdlAuth`. `getCredentials()` is now a thin wrapper, so its 15 existing callers are unchanged. A test proves a `getCredentials()` caller (Block E) and a verdict caller share exactly one `runRunnerCommand` call.
- Clear sites: `LegendaryUser.login`, `NileUser.login` and `GOGUser.login` delete `expired` and call `noteSignInSucceeded`; the three `logout` methods call `noteSignedOut` (Epic and Amazon also delete the flag; GOG's `configStore.clear()` already did).
- Source gates: no store-manager file writes `set('expired', true)`; `skipErrorHandler: true` appears only in `signInProbe/**` and `storeManagers/gog/user.ts` (the T-49-07 gate 49-03 handed over), with a companion test proving the gate actually sees those two files.

## Task Commits

1. **Task 1: Epic and Amazon probes and clear sites** - RED `c894082a3` (test), GREEN `35b2cd32a` (feat)
2. **Task 2: GOG verdict in the single spawn site** - RED `4369e04b5` (test), GREEN `44053c875` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/backend/signInProbe/runnerProbes.ts` - three probes, abort ids, the spawn/exit-contract header
- `src/backend/storeManagers/gog/user.ts` - `getCredentialsWithVerdict`, in-flight promise, login/logout hooks
- `src/backend/storeManagers/legendary/user.ts`, `nile/user.ts` - login/logout clear sites
- `src/backend/signInProbe/__tests__/runnerProbes.test.ts` and the three `expiryProbe.test.ts` suites - 99 new tests between them
- `epicLogoutDomains.test.ts`, `epicCookieCensus.test.ts`, `gog/__tests__/user.test.ts`, `gog/__tests__/logoutCookies.test.ts` - mock `backend/ipc` (and `configStore.delete` for gog user) now that login/logout publish outcomes

## Decisions Made

See `key-decisions`. The one behavioural judgment: Epic's clear runs on the `status: 'done'` path before `getUserInfo()`, so it holds even when the user.json read yields nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing login/logout suites broke on the new `outcomes` import**
- **Found during:** Tasks 1 and 2 (existing-suite runs)
- **Issue:** `noteSignedOut` / `noteSignInSucceeded` call the real `sendFrontendMessage`, which needs an Electron window. Two Epic suites (`epicLogoutDomains`, `epicCookieCensus`) failed, and the GOG `user.test.ts` crashed its jest worker with an uncaught `TypeError`; the GOG user suite's `configStore` mock also lacked `delete`.
- **Fix:** `jest.mock('backend/ipc', ...)` in the four suites, and `delete: jest.fn()` in `gog/__tests__/user.test.ts`.
- **Files modified:** the four test files listed above (none were in the plan's `files_modified`)
- **Verification:** `(legendary|nile|gog)/__tests__/` all green except the pre-existing `gog/library.test.ts` Windows path-separator failure.
- **Committed in:** `35b2cd32a`, `44053c875`

**2. [Rule 1 - Bug] The T-49-07 gate's first draft was vacuous**
- **Found during:** Task 2 (writing the non-vacuity companion test)
- **Issue:** the first version used regex literals that lost their backslashes in transit and matched nothing, so the "no offenders" assertion passed on an empty set.
- **Fix:** match with plain `includes('skipErrorHandler: true')` and `endsWith('.ts')`; the companion test now asserts both allowed sites are seen.
- **Committed in:** `44053c875`

**3. [Rule 1 - Bug] Lint test ceiling**
- **Found during:** Task 2 (`pnpm lint`: tests 640 warnings against a ceiling of 638)
- **Fix:** two `async` stale-epoch tests with no `await` made synchronous.
- **Committed in:** `44053c875`

---

**Total deviations:** 3 auto-fixed (1 Rule 3, 2 Rule 1)
**Impact on plan:** None on scope. The suites touched outside `files_modified` are mock-only edits.

## TDD Gate Compliance

Both tasks have a `test(49-05)` commit preceding the `feat(49-05)` commit. RED evidence was recorded for each and `gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` (jest `--json` converted to TAP): Task 1 had 16 failing of 38, Task 2 had 11 failing of 27. Both RED commits carry deliberately inert stubs (`runnerProbes.ts` for Task 1; `getCredentialsWithVerdict` and `probeGogSession` for Task 2), so the tests fail on assertions, not on missing symbols.

## Issues Encountered

- **Pre-existing Windows failures, out of scope:** `gog/__tests__/library.test.ts` (`\Users\u\Dest` vs `/Users/u/Dest`), the steam storeManager suites, and the sidecar flow suites (`bootstrap` asset-root self-check, `installFlows`, `structuralContainment`, and so on). A scoped run of `storeManagers|sidecar|signInProbe|humble|ipc|handlers` shows 20 failing suites, all in the known baseline list; none mention `signInProbe`, `noteSignedOut` or `getCredentialsWithVerdict`.
- `pnpm lint` passes both ceilings but the tests ceiling is now exactly met (638).

## Known Stubs

None. Both RED stubs were replaced in their GREEN commits.

## Threat Flags

None. No new network endpoint, auth path or trust boundary beyond the plan's threat model (T-49-13 to T-49-15). T-49-13's bound-abort is 49-08's `boundedSignInProbe`; this plan supplies the unique abort ids it will signal.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

49-08's pass can call the three probe functions, `captureSignInEpoch(store)` before each, and `applySignInVerdict` after; it must `callAbortController(SIGN_IN_PROBE_ABORT_IDS[store])` at the bound. The `BoundedOutputCapture` and `SignInVerdictResult` `ts-prune-ignore-next` markers from 49-04 are still needed (this plan imports neither). The classifier markers and the cost of `legendary status` remain unobserved in a real log until 49-11 / 49-12. `graphify update .` was run after the last task commit.

## Self-Check: PASSED

- Created files exist: `runnerProbes.ts`, `runnerProbes.test.ts` and the three `expiryProbe.test.ts` files.
- Commits exist: `c894082a3`, `35b2cd32a`, `4369e04b5`, `44053c875` (`git rev-list --count` from the persisted ledger base is 4).
- Acceptance criteria: comment-stripped `set('expired', true)` count is 0 in legendary, nile and gog `user.ts`; `skipErrorHandler: true` code count in `runnerProbes.ts` is 2; static storeManagers imports in `runnerProbes.ts` are 0; the `['auth']` spawn count in `gog/user.ts` is 1; `skipErrorHandler: true` lists only `signInProbe/runnerProbes.ts` and `storeManagers/gog/user.ts`.
- Plan verification: scoped Backend jest over `signInProbe`, the three `expiryProbe`/`user` suites, `fakeHomeIsolation` and the two sidecar boot suites is green (247 tests before the final lint edits; re-run green afterwards); `pnpm codecheck` exits 0; `pnpm lint` 0 errors, both ceilings PASS; scoped `prettier --check` clean; `node meta/findDeadcode.cjs` reports `unreachable: 46 OK | used-in-module: 0 OK`.
