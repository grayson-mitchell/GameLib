---
phase: 49-cross-store-signed-out-offline-mode
plan: 08
subsystem: sidecar-boot
tags: [sidecar, boot, sign-in-probe, connectivity, exit-contract, ready-ordering]
requires:
  - phase: 49-05
    provides: runner probes (probeLegendarySession, probeGogSession, probeNileSession) and SIGN_IN_PROBE_ABORT_IDS
  - phase: 49-06
    provides: SteamUser.probeCredentialPresence and HumbleUser.probeSession (one slot read each)
  - phase: 49-07
    provides: AppSettings.dismissedSignInNotices and the dismiss/rearm handlers the pass must not clobber
provides:
  - "src/backend/signInProbe/pass.ts: one bounded (45 s), parallel, single-flight, edge-triggered boot sign-in probe pass"
  - "init() wiring: outcomes pull handler registered before READY, pass started after READY and before deliverStartupProtocolUrl()"
  - "READY-ordering source gate (bootstrapWirings Test B extension) and signInProbeBootWire.test.ts"
  - "held-out dismissBackstop.test.ts (a mid-pass dismiss survives the pass)"
  - "folded Humble keyring todo closed against Phase 49"
affects: [49-09, 49-10, 49-11, 49-12]
actuals:
  tokens: 85000
  tasks: 3
  commits: 6
plan_head_before: c1cdce89f45355e1c2c2f86765e35bc1f8f18b55
plan_head_after: 397c356577f491fb69090b079a8a709a1572f878
commits: 6
tech-stack:
  added: []
  patterns:
    - "deterministic bound: elapsed >= bound yields unknown regardless of which side of the race won"
    - "edge-gated, single-flight pass with one coalesced re-run; no timers, no intervals"
    - "READY-ordering source gate with RED/GREEN specimens over the comment-stripped init() body"
key-files:
  created:
    - src/backend/signInProbe/pass.ts
    - src/backend/signInProbe/__tests__/pass.test.ts
    - src/backend/signInProbe/__tests__/dismissBackstop.test.ts
    - src/backend/sidecar/__tests__/signInProbeBootWire.test.ts
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/signInProbe/verdict.ts
    - .planning/IPC-PORT-INVENTORY.md
    - .planning/todos/completed/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md
key-decisions:
  - "SIGN_IN_PROBE_BOUND_MS = 45_000 equals Rust KEYRING_READ_TIMEOUT; the 60 s RUST_INVOKE_TIMEOUT_MS is the ceiling, not the bound (D-01)"
  - "The test-worker guard lives inside startSignInProbePass, so the many suites that call init() with logged-in fixtures never run real probes"
  - "bootstrap.ts uses two guard flags: handler registration before READY, pass start after READY"
  - "The pass has one code path on every platform and build; dev-build Keychain prompts remain GAMELIB_DEV_SECRET_VAULT=1's job (D-04)"
requirements-completed: [R3, R5]
coverage:
  - id: D1
    description: "pass.ts probes logged-in stores once each, in parallel, bounded at 45 s with a deterministic boundary, single-flight, edge-triggered, writing only through applySignInVerdict"
    requirement: "R3"
    verification:
      - kind: unit
        ref: "src/backend/signInProbe/__tests__/pass.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "READY is written before the pass starts; the outcomes pull handler exists before READY; protocol-URL delivery is still last"
    requirement: "R3"
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/signInProbeBootWire.test.ts (order ['ready','start'], handler first)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/bootstrapWirings.test.ts (Test B READY-ordering source gate + 3 RED specimens + 1 GREEN specimen)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A dismiss persisted during a running pass survives the pass"
    requirement: "R5"
    verification:
      - kind: unit
        ref: "src/backend/signInProbe/__tests__/dismissBackstop.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Folded Humble keyring todo closed with resolves_phase: 49, triage lines intact, planning gates green"
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12) and the Task 3 node frontmatter check (TODO CLOSED OK)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The sidecar still exits by event-loop drain at stdin EOF on a warm profile (bounded probes drain within 45 s; every pass handle unref()'d, children aborted at the bound)"
    verification: []
    human_judgment: true
    rationale: "Warm-profile exit timing with real Keychain behaviour cannot be asserted in jest; pnpm smoke:sidecar measures a cold profile only (D-20). Owned by the 49-12 live gate (T-49-22)."
duration: 7min
completed: 2026-10-10
status: complete
---

# Phase 49 Plan 08: Bounded boot sign-in probe pass Summary

**One bounded (45 s), parallel, single-flight, edge-triggered sign-in probe pass, wired into `init()` after READY with its outcomes pull handler registered before READY, plus the closure of the folded Humble keyring todo it supersedes.**

## Performance
- **Duration:** 7 min for this continuation (the first executor's start time is unknown; it stalled after the Task 2 RED commit)
- **Started:** 2026-10-09T17:31:10Z (continuation)
- **Completed:** 2026-10-09T17:39:04Z (UTC)
- **Tasks:** 3
- **Files modified:** 10 (source/tests) plus the inventory and the todo

## Accomplishments
- `pass.ts`: `SIGN_IN_PROBE_BOUND_MS`, `boundedSignInProbe`, `runSignInProbePass`, `requestSignInProbePass`, `startSignInProbePass` and a test reset. Five probes run in parallel; logged-out stores are never probed; every timer is `unref()`'d and cleared; spawn probes are aborted at the bound only through `SIGN_IN_PROBE_ABORT_IDS`; verdicts are written only through `applySignInVerdict`; the outcome map is published once per pass.
- `bootstrap.ts`: two guard flags and two blocks. `registerSignInProbeOutcomesHandler()` runs before the READY write; `startSignInProbePass()` runs after READY and before `deliverStartupProtocolUrl()`.
- A source gate proves that order on the real `init()` body, with three RED specimens and one GREEN specimen. A dedicated boot-wire test proves it behaviourally (`['ready', 'start']`, handler first, second `init()` starts nothing).
- The held-out dismiss backstop proves a mid-pass dismiss survives the pass's state write.
- The folded Humble keyring todo is moved to `completed/` with `resolves_phase: 49` and a Resolution section citing D-01, D-04, D-15, D-16 and D-18.

## Task Commits
1. **Task 1 RED: failing pass tests and the dismiss backstop** - `51c12dcbb` (test)
2. **Task 1 GREEN: pass.ts implementation** - `2fb51a175` (feat)
3. **Task 2 RED: READY-ordering gate and boot-wire test** - `7a5e32374` (test)
4. **Task 2 GREEN: wire the pass into init()** - `6cdba939d` (feat)
5. **Task 3 (deviation, Rule 3): list `getSignInProbeOutcomes` in the IPC port inventory** - `e29b5ee1e` (docs)
6. **Task 3: close the folded Humble keyring todo** - `397c35657` (docs)

**Plan metadata:** recorded in the following docs commit (SUMMARY, STATE, ROADMAP).

## Files Created/Modified
- `src/backend/signInProbe/pass.ts` - the pass (see Accomplishments)
- `src/backend/signInProbe/__tests__/pass.test.ts` - bound, parallelism, single-flight, edge gating, exit contract, source gates
- `src/backend/signInProbe/__tests__/dismissBackstop.test.ts` - T-49-25 held-out backstop
- `src/backend/sidecar/bootstrap.ts` - guard flags, handler block before READY, pass start after READY
- `src/backend/sidecar/__tests__/bootstrapWirings.test.ts` - Test B READY-ordering extension
- `src/backend/sidecar/__tests__/signInProbeBootWire.test.ts` - behavioural boot-wire test
- `src/backend/sidecar/__tests__/testContainment.test.ts` - classifies the new suite (72 = 4 + 68)
- `src/backend/signInProbe/verdict.ts` - dropped the now-unneeded `SignInVerdictResult` ts-prune marker
- `.planning/IPC-PORT-INVENTORY.md` - `getSignInProbeOutcomes` added (Phase 34.1 bucket 33 to 34, Unique 216 to 217, Ported 61 to 62)
- `.planning/todos/completed/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` - closed

## Decisions Made
- The 45 s bound equals Rust's `KEYRING_READ_TIMEOUT`; the sidecar's 60 s invoke ceiling is not the bound.
- The `JEST_WORKER_ID` guard sits inside `startSignInProbePass`, so `init()`-calling suites never run real probes.
- The pass has no platform, `NODE_ENV` or dev-vault branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm planning-gates` was RED on a gap left by plan 49-04**
- **Found during:** Task 3 verification
- **Issue:** `preload-surface-gate.py` failed: `getSignInProbeOutcomes` (added to `src/preload/api/helpers.ts` by `57ea8923b`, plan 49-04) appeared in no bucket line of `IPC-PORT-INVENTORY.md`. Task 3's acceptance criterion requires `pnpm planning-gates` to exit 0.
- **Fix:** Added the channel the way the gate's own docstring prescribes (never by weakening an assertion), following the `getLoginBackground` precedent: Phase 34.1 app-shell bucket 33 to 34, `Unique channels` 216 to 217, `Ported to sidecar` 61 to 62, plus a reconciliation note. The sibling gate `ported-channels-gate.py` requires the inventory to be committed, so this went in its own commit before the todo move.
- **Files modified:** `.planning/IPC-PORT-INVENTORY.md`
- **Commit:** `e29b5ee1e`

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** planning-only; no production code.

## Issues Encountered
- The first executor stalled (no stream progress for 10 minutes) after committing Task 2's RED test (`7a5e32374`). This continuation verified the committed state and resumed from there.
- Baseline comparison for `bootstrap.test.ts`: before the Task 2 edit, exactly 1 test failed (`boot-time asset-root self-check ... healthy arm`, a pre-existing Windows failure); after, the identical single test fails and nothing else. No new failure.
- `pnpm lint`: 0 errors, production and tests ceilings PASS. `pnpm smoke:sidecar` was not run locally (it launches the sidecar; the cold-profile gate runs in CI on ubuntu); `meta/sidecarStartupSmoke.cjs` is unchanged (D-20). No local exit-time measurement was taken, so the warm-profile exit timing remains a 49-12 live-gate item.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## Threat Flags
None. The pass adds no network endpoint, auth path or schema change beyond what the plan's threat model (T-49-22 to T-49-25) covers.

## Next Phase Readiness
The boot signal is live end to end in the sidecar. 49-09 can rely on the Library tree invoking no probe channel, and 49-12 owns the warm-profile sidecar exit timing and real Keychain behaviour.

## TDD Gate Compliance
Task 1: RED `51c12dcbb`, GREEN `2fb51a175`. Task 2: RED `7a5e32374`, GREEN `6cdba939d`. Both sequences are in order; the Task 2 RED was re-verified red for the right reasons (ordering assertions, not import errors) before the GREEN edit.

## Self-Check: PASSED
- Created files exist: `pass.ts`, `pass.test.ts`, `dismissBackstop.test.ts`, `signInProbeBootWire.test.ts` - FOUND.
- Commits `51c12dcbb`, `2fb51a175`, `7a5e32374`, `6cdba939d`, `e29b5ee1e`, `397c35657` - FOUND in `git log`.
- Task 1 criteria: no `45000`/`45_000` literal in `pass.test.ts`; comment-stripped `pass.ts` has 2 `unref` sites and 0 `setInterval`; no call site of `requestSignInProbePass(`/`runSignInProbePass(` outside `pass.ts` and tests; `meta/sidecarStartupSmoke.cjs` unchanged; prettier clean.
- Task 2 criteria: `signInProbeInitialized = true` count is 1; ordering gate and boot-wire test pass; codecheck exit 0; prettier clean.
- Task 3 criteria: file only under `completed/`, triage lines intact and in order, 5 decision-id hits, `pnpm planning-gates` 12/12.
- Plan verification: 12 suites / 278 tests green (signInProbe, bootWire, electronReachLedger, gogPresenceBootWire, testContainment, bootstrapWirings, fakeHomeIsolation); `node meta/findDeadcode.cjs` exits 0.
