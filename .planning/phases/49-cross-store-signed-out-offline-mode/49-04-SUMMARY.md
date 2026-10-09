---
phase: 49-cross-store-signed-out-offline-mode
plan: 04
subsystem: auth
tags: [sign-in-probe, classifier, sidecar, ipc, epoch-fence, legendary, gogdl, nile, humble, steam]

requires:
  - phase: 49-cross-store-signed-out-offline-mode
    provides: "SignInStore / SignInProbeOutcome types (49-01) and the persisted expired flags + legendaryConfigStore (49-03)"
provides:
  - "classifyLegendaryStatus / classifyGogdlAuth / classifyNileOutput: pure classifiers, the only source of an `expired` verdict"
  - "createBoundedOutputCapture: 64 000 char bounded capture with observed() for joined-spawn detection"
  - "sessionEpoch.ts: per-store capture / compare / bump fence"
  - "outcomes.ts: in-memory outcome map, signInProbeOutcomes push, getSignInProbeOutcomes pull, noteSignInSucceeded / noteSignedOut"
  - "applySignInVerdict: the single fenced, write-if-changed latch for all five stores"
  - "FrontendMessages.signInProbeOutcomes, AsyncIPCFunctions.getSignInProbeOutcomes, preload handleSignInProbeOutcomes / getSignInProbeOutcomes"
affects: [49-05, 49-06, 49-07, 49-08, 49-09, 49-10, 49-11, 49-12]

actuals:
  tokens: 12100
  tasks: 3
  commits: 6

plan_head_before: 72f6a0e77e2c3a5333599a14899c98368ae16644
plan_head_after: 77daab020a4c0257284585768a4cb0ff04617139

tech-stack:
  added: []
  patterns:
    - "Pure first-match-wins classifiers with `aborted` first and `healthy` last, so no failure shape falls through to healthy"
    - "Per-store accessor table (isSet / latch / clear) with literal set('expired', true) calls reachable only from the expired branch"
    - "Plain-object fake store (not jest.fn) loaded through jest.requireActual inside jest.mock factories, immune to resetMocks"

key-files:
  created:
    - src/backend/signInProbe/classify.ts
    - src/backend/signInProbe/sessionEpoch.ts
    - src/backend/signInProbe/outcomes.ts
    - src/backend/signInProbe/verdict.ts
    - src/backend/signInProbe/__tests__/classify.test.ts
    - src/backend/signInProbe/__tests__/outcomes.test.ts
    - src/backend/signInProbe/__tests__/verdict.test.ts
    - src/backend/signInProbe/__tests__/fakeFlagStore.ts
  modified:
    - src/common/types/ipc.ts
    - src/preload/api/helpers.ts

key-decisions:
  - "A GOG token object read while offline classifies unknown, not healthy: offline is no positive evidence of a live session, and healthy clears a latched flag."
  - "A Nile capture holding a mix of auth and non-auth refresh statuses (for example 401 then 503) is unknown: one transient status means the failure is not proven to be an authentication failure."
  - "applySignInVerdict checks the epoch before the outcome, so an unknown result with a moved epoch reports stale rather than unchanged (plan-specified order)."
  - "BoundedOutputCapture and SignInVerdictResult are exported ahead of their consumers (49-05/06 and 49-08) and carry ts-prune-ignore-next with a WHY comment."

patterns-established:
  - "Verdict write sites go through applySignInVerdict only; a source gate pins that no signInProbe module references GlobalConfig, setSetting or backend/config (D-10)"
  - "Preload push + pull slots are declared together in helpers.ts with a sidecar-send-channels-fail-silently reminder"

requirements-completed: [R2, R3]

coverage:
  - id: D1
    description: "Only an authentication failure is a verdict: each runner classifier returns expired from exactly one evidence shape and unknown for every network, timeout, abort, 5xx/429/408, unparsable or joined-spawn case"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/signInProbe/__tests__/classify.test.ts (48 tests, negative row per runner and per D-17 condition)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Captured runner output is bounded at 64 000 chars and never logged; classify.ts has one type-only import"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/signInProbe/__tests__/classify.test.ts (createBoundedOutputCapture and source gate)"
        status: pass
    human_judgment: false
  - id: D3
    description: "applySignInVerdict is idempotent, epoch-fenced, never writes on unknown, and never touches AppSettings; Humble still pushes humbleAuthState"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/backend/signInProbe/__tests__/verdict.test.ts (64 tests across all five stores plus source gates)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Outcome map reaches the renderer by one push and a pure-getter pull; noteSignInSucceeded publishes healthy without a probe"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/backend/signInProbe/__tests__/outcomes.test.ts (18 tests incl. handler-body source gate)"
        status: pass
      - kind: other
        ref: "pnpm codecheck exits 0 (preload slots name channels present in FrontendMessages / AsyncIPCFunctions)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Marker strings (Stored credentials are no longer valid, Failed to refresh credentials, Failed to refresh the token <Response [NNN]>) match the real runner output"
    verification: []
    human_judgment: true
    rationale: "The strings are source-derived from legendary 0.21.0, gogdl v1.3.0 and nile v1.2.0 and are live-gated by 49-11 / 49-12 (RESEARCH A1, A3, A5, A6). A drifted marker degrades to unknown, never to a false expired."

duration: 14min
completed: 2026-10-09
status: complete
---

# Phase 49 Plan 04: Sign-in probe core Summary

**Pure Epic/GOG/Amazon runner-output classifiers, a per-store session-epoch fence, an in-memory outcome map with a push and a read-only pull channel, and `applySignInVerdict` as the one idempotent, stale-proof writer for all five stores' expiry flags.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-09T10:54:31Z
- **Completed:** 2026-10-09T11:09Z
- **Tasks:** 3
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments

- `classify.ts` decides every runner verdict from captured output, never `ExecResult.stderr`. `expired` comes from exactly one evidence shape per runner; D-17's four GOG conditions each have a failing-individually row. The module imports only a type and has no log path (T-49-09), pinned by a source gate.
- `sessionEpoch.ts` plus `noteSignInSucceeded` / `noteSignedOut` give R1/R2 the concurrency edge: a probe that began before a sign-in cannot re-set `expired` afterwards, and a successful sign-in resolves to `healthy` with no probe and no keyring read.
- `outcomes.ts` publishes `signInProbeOutcomes` (labels only) and registers a `getSignInProbeOutcomes` handler whose body is gated to a pure getter, so no renderer action can start a probe (T-49-11).
- `applySignInVerdict` covers legendary, gog, nile, humble (`expired`) and steam (`credentialsMissing`). A second `expired` performs no `set`; `unknown` never writes; Humble keeps pushing the cookie-free `humbleAuthState`.

## Task Commits

1. **Task 1: Classifiers and bounded capture** - RED `edd3ed857` (test), GREEN `f32516ade` (feat)
2. **Task 2: Epoch fence, outcome map, push/pull channel** - RED `f13410f7f` (test), GREEN `57ea8923b` (feat)
3. **Task 3: applySignInVerdict** - RED `19f964bd4` (test), GREEN `77daab020` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/backend/signInProbe/classify.ts` - the three classifiers, marker constants, bounded capture
- `src/backend/signInProbe/sessionEpoch.ts` - epoch capture / compare / bump leaf module
- `src/backend/signInProbe/outcomes.ts` - in-memory map, publish, pull handler registration, noteSignInSucceeded / noteSignedOut
- `src/backend/signInProbe/verdict.ts` - `applySignInVerdict`, `SignInVerdictResult`
- `src/backend/signInProbe/__tests__/{classify,outcomes,verdict}.test.ts` and `fakeFlagStore.ts` - tables, source gates, and the plain-object fake store
- `src/common/types/ipc.ts` - `signInProbeOutcomes` in `FrontendMessages`, `getSignInProbeOutcomes` in `AsyncIPCFunctions`
- `src/preload/api/helpers.ts` - `handleSignInProbeOutcomes`, `getSignInProbeOutcomes`

## Decisions Made

See `key-decisions`. The two classifier judgment calls (GOG healthy-while-offline is `unknown`; a mixed-status Nile capture is `unknown`) both lean toward `unknown`, which is the safe direction under the 260822-vov rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `require()` in jest.mock factories tripped `no-require-imports`**
- **Found during:** Task 3 (`pnpm lint`, tests scope: 5 errors)
- **Issue:** the factories loaded `fakeFlagStore` with `require()`, which the lint ceiling rejects.
- **Fix:** `jest.requireActual<typeof import('./fakeFlagStore')>(...)`.
- **Files modified:** `src/backend/signInProbe/__tests__/verdict.test.ts`
- **Verification:** `pnpm lint` 0 errors, both ceilings PASS (production: PASS, tests: PASS).
- **Committed in:** `77daab020`

**2. [Rule 3 - Blocking] findDeadcode gate flagged three new exports**
- **Found during:** Tasks 1 and 3 (`node meta/findDeadcode.cjs`)
- **Issue:** `BoundedOutputCapture`, `SignInVerdictResult` (used only in their own module until 49-05/06/08 land) and `makeFakeFlagStore` (reached through `jest.requireActual`).
- **Fix:** `// ts-prune-ignore-next` with a WHY comment on the line above each symbol.
- **Verification:** `node meta/findDeadcode.cjs` reports `unreachable: 46 OK | used-in-module: 0 OK`.
- **Committed in:** `f32516ade`, `77daab020`

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3)
**Impact on plan:** None on scope; both are gate-compliance corrections. The ignore markers for `BoundedOutputCapture` and `SignInVerdictResult` should be removed when their consumers land.

## TDD Gate Compliance

Each task has a `test(49-04)` commit preceding its `feat(49-04)` commit. RED evidence was recorded for each with `gsd check tdd-red-evidence` and returned `RED_EVIDENCE_OK` (jest `--json` converted to TAP; 17, 12 and 39 failing tests respectively). Every RED commit carries a deliberately inert stub of the module under test, so the tests fail on assertions rather than on a missing module.

## Issues Encountered

- A Windows-local `hardcodedStringGate` run in the Meta project exceeded the shell timeout and was backgrounded; the new code adds no user-facing strings (only `[signInProbe]` log lines), so it was not pursued.
- Pre-existing Windows jest baseline failures are untouched and out of scope.

## Known Stubs

None. The three RED stubs were replaced in their GREEN commits.

## Threat Flags

None. The only new renderer-reachable surface is `getSignInProbeOutcomes` (planned T-49-11, mitigated by the pure-getter source gate) and the outcome-labels-only push (T-49-09).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

49-05 and 49-06 can return outcomes through the classifiers; 49-07 can subscribe to `handleSignInProbeOutcomes` and pull `getSignInProbeOutcomes` on mount; 49-08 owns registering the pull handler before READY (`registerSignInProbeOutcomesHandler`) and the bound-abort of the probe children. The classifier marker strings remain unobserved in a real log until 49-11 / 49-12. `graphify update .` was run after the last task commit.

## Self-Check: PASSED

- Created files exist: `classify.ts`, `sessionEpoch.ts`, `outcomes.ts`, `verdict.ts`, the three test files and `fakeFlagStore.ts` under `src/backend/signInProbe/`.
- Commits exist: `edd3ed857`, `f32516ade`, `f13410f7f`, `57ea8923b`, `19f964bd4`, `77daab020`.
- Plan verification: `signInProbe/__tests__/(classify|outcomes|verdict)` 130/130 pass; `pnpm codecheck` exits 0; `pnpm lint` 0 errors, both ceilings PASS; scoped `prettier --check` clean; `node meta/findDeadcode.cjs` OK.
- Acceptance criteria: comment-stripped `classify.ts` logger/console count is 0 and it has exactly 1 import; `sessionEpoch.ts` has 1 import and it is `import type`; `helpers.ts` exports both preload slots; `verdict.ts` has 5 literal flag-latch calls, each reachable only from the `expired` branch.
