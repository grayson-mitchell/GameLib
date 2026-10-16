---
phase: 49-cross-store-signed-out-offline-mode
plan: 07
subsystem: frontend-state
tags: [react, globalstate, appsettings, sign-in, dismissal, humble, ipc]

requires:
  - phase: 49-01
    provides: signInState/signInDismissal pure modules, collectSignInInputs, LibrarySignInNotice
  - phase: 49-03
    provides: renderer legendaryConfigStore and the three persisted expired keys
  - phase: 49-04
    provides: signInProbeOutcomes push, getSignInProbeOutcomes pull, preload slots
provides:
  - AppSettings.dismissedSignInNotices (factory default [])
  - GlobalState.signInProbeOutcomes (push + mount pull, sanitised)
  - GlobalState.dismissedSignInNotices with handleDismissSignInNotice / handleRearmSignInDismissals
  - collectSignInInputs reading all five persisted verdicts live
  - Humble renderer-mount health check removed (folded into the boot pass)
affects: [49-09, 49-10, 49-11]

actuals:
  tokens: 14000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Idempotent persist-on-change setter pair (dismiss / re-arm) with an element-wise canonical-order equality guard"
    - "Re-arm called from every observation site (push, pull, Humble auth push, end of mount); idempotence makes multiple call sites safe"
    - "Comment-stripped source gate with RED specimens derived from the real file text"

key-files:
  created:
    - src/backend/sidecar/__tests__/dismissedSignInNoticesSetting.test.ts
    - src/frontend/state/__tests__/GlobalStateSignInMount.test.ts
    - src/frontend/helpers/__tests__/signInInputs.test.ts
  modified:
    - src/common/types.ts
    - src/backend/config.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/ContextProvider.tsx
    - src/frontend/types.ts
    - src/frontend/helpers/signInInputs.ts
    - src/frontend/helpers/electronStores.ts
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx

key-decisions:
  - "The dismissed set is one AppSettings key with a [] factory default and no migration: an absent key and the default are the same [] on both sides of the two-store hazard, which the new test checks rather than assumes."
  - "Dismiss and re-arm are the only two writers of dismissedSignInNotices and each persists only when the canonical-order array changed."
  - "Re-arm runs renderer-side from rearmFromCurrentState(), called after the outcome push, the outcome pull, the Humble auth push and once at the end of mount; the sidecar pass never writes AppSettings."
  - "componentDidMount calls humbleSync() only; Humble expiry latching is solely the boot pass, so the renderer cannot become a second latch (T-49-21)."

patterns-established:
  - "Pull-on-mount alongside a push listener for any outcome the sidecar may publish before the renderer subscribes"

requirements-completed: [R1, R3, R5]

coverage:
  - id: D1
    description: "dismissedSignInNotices persists under one AppSettings key, defaults to [] for existing profiles, survives a restart, and lands in both config.json and the settings mirror"
    requirement: R5
    verification:
      - kind: integration
        ref: "src/backend/sidecar/__tests__/dismissedSignInNoticesSetting.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "GlobalState holds the outcome map (push + pull, both sanitised) and the persisted dismissed set with idempotent dismiss and re-arm"
    requirement: R5
    verification:
      - kind: unit
        ref: "src/frontend/state/__tests__/GlobalStateSignInMount.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Humble health check no longer runs on renderer mount (folded into the boot pass)"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/state/__tests__/GlobalStateSignInMount.test.ts#RED specimen (D-16)"
        status: pass
    human_judgment: false
  - id: D4
    description: "collectSignInInputs reads all five persisted verdicts at call time; a sign-in completed while the Library was unmounted leaves no row"
    requirement: R1
    verification:
      - kind: unit
        ref: "src/frontend/helpers/__tests__/signInInputs.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/signInTracer.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The notice and the expiry/dismissal behaviour as the user sees it in the running app"
    verification: []
    human_judgment: true
    rationale: "Painting and navigation cannot be exercised in the node-environment Frontend jest project; owed to the phase live gate (49-11)."

duration: 9min
completed: 2026-10-09
status: complete
plan_head_before: be1caabbc7fc0df2856f4cf19ddb24047b0e8ca9
plan_head_after: d699e0e1fd0baa0b02d9f98292ba4b21beef5e7e
commits: 5
---

# Phase 49 Plan 07: Renderer sign-in state Summary

**GlobalState now holds this launch's sanitised probe outcomes (push + mount pull) and a persisted `dismissedSignInNotices` set with idempotent dismiss/re-arm, the collector reads all five verdict keys live, and Humble's renderer-mount health check is gone.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-09T11:53:56Z
- **Completed:** 2026-10-09T12:02:57Z
- **Tasks:** 3
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments

- `AppSettings.dismissedSignInNotices: SignInStore[]` with a `[]` factory default; a profile without the key reads `[]` and a `setSetting` write survives a simulated restart and lands in both stores.
- `GlobalState` gains `signInProbeOutcomes`, `dismissedSignInNotices`, `handleDismissSignInNotice`, `handleRearmSignInDismissals` and a private idempotent `rearmFromCurrentState()`; context types and defaults carry all four.
- `componentDidMount` runs `window.api.humbleSync()` only; a source gate with a RED specimen keeps `humbleCheckHealth` from returning.
- `collectSignInInputs` reads `legendaryConfigStore.expired`, `gogConfigStore.expired`, `nileConfigStore.expired` and `steamConfigStore.credentialsMissing` per call; `LibrarySignInNotice` feeds it the context outcome map.
- The `legendaryConfigStore` ts-prune marker and WHY comment in `electronStores.ts` were removed in the same commit as its first consumer.

## Task Commits

1. **Task 1: dismissedSignInNotices setting** - `6e8e6b17c` (test, RED), `bf460bcf2` (feat, GREEN)
2. **Task 2: GlobalState outcomes, dismiss/re-arm, Humble call removed** - `502bb5dab` (feat)
3. **Task 3: five-verdict collector and notice context outcomes** - `e02223927` (test, RED), `d699e0e1f` (feat, GREEN)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `src/common/types.ts`, `src/backend/config.ts` - the settings key and its factory default
- `src/frontend/state/GlobalState.tsx` - outcome/dismissal state, handlers, push/pull, Humble mount change
- `src/frontend/state/ContextProvider.tsx`, `src/frontend/types.ts` - context members and defaults
- `src/frontend/helpers/signInInputs.ts` - the three new live reads
- `src/frontend/helpers/electronStores.ts` - dropped the `legendaryConfigStore` ts-prune marker
- `src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx` - reads `signInProbeOutcomes` from context
- Three test files listed in key-files.created

## Decisions Made

See `key-decisions` in the frontmatter. No migration or first-launch hydration was added for the dismissed key (no legacy value to seed).

## Deviations from Plan

### Interpretation notes (no code deviation)

**1. Acceptance criterion on `get_nodefault('expired')` outside the collector**
- **Found during:** Task 3 acceptance check
- **Issue:** `grep -rn "get_nodefault('expired')" src/frontend ... | grep -v signInInputs.ts` is not empty: `GlobalState.tsx:506` seeds `humble.expired` from `humbleConfigStore.get_nodefault('expired')`. That line pre-dates this plan.
- **Decision:** left as is. It is the initial value of `GlobalState.humble.expired`, which the collector then consumes through `source.humbleExpired` (the plan's own truth: "Humble's flag comes from `source.humbleExpired`"); it does not decide an expired state itself. Removing it would drop the persisted Humble flag from the first paint and regress `HumbleExpiryToast`. The three NEW reads (legendary, gog, nile) and the Steam read exist only in `signInInputs.ts` (counts 3 and 1).
- **Files modified:** none

**Total deviations:** 0 auto-fixed. **Impact:** none. No backend `ipc` jest mock was needed because no backend module imports the outcomes publisher in this plan.

## Issues Encountered

- First RED specimen for D-16 replaced the wrong `window.api.humbleSync()` occurrence (the login handler's, earlier in the file); fixed by splicing at the last occurrence.
- The Frontend collector test initially hit a `jest.mock` hoisting error (spies referenced before initialisation); spies are now created inside the factory.

## Known Stubs

None.

## Threat Flags

None. T-49-20 (sanitised inbound outcome map and persisted array) and T-49-21 (D-16 gate keeps the renderer from becoming a second Humble latch) are mitigated as planned.

## Verification Run

- Backend `dismissedSignInNoticesSetting` + `focusRowFirstLaunchHydration`: 10/10 pass.
- Frontend `GlobalState*`, `signInInputs`, `signInTracer`, `connectedStoresParity`: 11 suites, 126 tests pass.
- `pnpm codecheck` exit 0; `pnpm lint` production PASS, tests PASS; `node meta/findDeadcode.cjs` exit 0; scoped `npx prettier --check` clean on every written path.
- `graphify update .` run after the last code commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

49-09's notice can call `handleDismissSignInNotice(store)` and read `dismissedSignInNotices` from context; 49-10's tiles can read `signInProbeOutcomes`. The nothing-is-painted risk (notice visibility, dismiss persistence in the running app) is owed to the live gate.

## Self-Check: PASSED

---
*Phase: 49-cross-store-signed-out-offline-mode*
*Completed: 2026-10-09*
