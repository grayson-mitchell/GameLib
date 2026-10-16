---
phase: 49-cross-store-signed-out-offline-mode
plan: 01
subsystem: ui
tags: [sign-in-state, selector, react-router, i18n-gate, library-notice, jest]

requires:
  - phase: 34.15
    provides: steamConfigStore.credentialsMissing latch (260822-vov) and the SteamSyncNotice structural contract
provides:
  - src/common/signInState.ts four-value per-store selector (connected | not-connected | expired | unknown) with the D-07 rule order
  - src/common/signInDismissal.ts idempotent dismissal helpers (add / re-arm / normalize)
  - collectSignInInputs renderer collector, resolveLibrarySignInRows pure row module
  - LibrarySignInNotice mounted above the Library grid (expired slice for Steam end to end)
  - loginOpenParam + Login ?open= consumer (validated, consumed once, URL rewritten with replace)
  - the four new frontend modules registered in the i18n hardcoded-string gate scope
affects: [49-03, 49-04, 49-05, 49-06, 49-07, 49-08, 49-09, 49-10]

actuals:
  tokens: 13700
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Branch-ordered pure selector in src/common with zero imports; surfaces reach it via collectSignInInputs + resolveSignInStates"
    - "Composition test over real pure modules plus comment-stripped source gates with RED specimens, for components Jest cannot mount (no jsdom)"

key-files:
  created:
    - src/common/signInState.ts
    - src/common/signInDismissal.ts
    - src/common/__tests__/signInState.test.ts
    - src/common/__tests__/signInDismissal.test.ts
    - src/frontend/helpers/signInInputs.ts
    - src/frontend/screens/Library/librarySignInRows.ts
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/screens/Library/__tests__/signInTracer.test.ts
    - src/frontend/screens/Login/loginOpenParam.ts
  modified:
    - src/frontend/screens/Library/facetLabels.ts
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Login/index.tsx
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - meta/__tests__/hardcodedStringGate.test.ts

key-decisions:
  - "Selector rule order is expiredFlag, then !loggedIn, then healthy, then unknown: a latched flag outranks a logged-out read because legendary deletes user.json on the verdict that latches it (D-07, RESEARCH Pitfall 3)"
  - "parseSignInStore is a linear exact-membership scan, not an object-key or in-operator lookup, so __proto__ and constructor cannot pass (T-49-01)"
  - "Epic, GOG and Amazon expiredFlag is false in collectSignInInputs until 49-03 adds the stores' expired keys and 49-07 Task 3 adds the reads; documented in the module header as sequencing, not a decision"
  - "Frontend source gates use a whitespace-tolerant regex for resolveSignInStates(collectSignInInputs( because prettier wraps the call across lines"

patterns-established:
  - "Rows module takes SIGN_IN_STORES as its only runtime import from common; everything else is type-only"
  - "Notice component returns null for zero rows and is otherwise a single in-flow div (no position, no Dialog)"

requirements-completed: [R1, R4, R5, R6]

coverage:
  - id: D1
    description: "A latched Steam credential produces exactly one Library row whose Sign in targets /login?open=steam, and the Login mount consumes ?open= once and rewrites the URL with replace"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/signInTracer.test.ts#tracer (a): latched Steam expiry -> one row -> ?open=steam"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/signInTracer.test.ts#tracer (b): source gates on the wired files (real source)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The notice actually paints above the grid and the Steam overlay visibly opens on Manage Accounts"
    requirement: "R4"
    verification: []
    human_judgment: true
    rationale: "No jsdom in the Frontend jest project; rendering and overlay open are only observable in the live app (owed to the 49-11 live gate)"
  - id: D3
    description: "The 80-case R1 selector table, D-07 precedence, purity and the sign-in-after-stale-expiry flip"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "src/common/__tests__/signInState.test.ts#R1: exhaustive selector table"
        status: pass
      - kind: unit
        ref: "src/common/__tests__/signInState.test.ts#D-07 precedence"
        status: pass
    human_judgment: false
  - id: D4
    description: "Idempotent, order-stable dismissal helpers (add, re-arm exactly once, normalize persisted value)"
    requirement: "R5"
    verification:
      - kind: unit
        ref: "src/common/__tests__/signInDismissal.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The four new frontend modules are in the scanned i18n gate scope; declared unscanned debt did not grow"
    requirement: "R6"
    verification:
      - kind: unit
        ref: "meta/__tests__/genI18nGateScope.test.ts + meta/__tests__/hardcodedStringGate.test.ts"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-09
status: complete
plan_head_before: 14741a64fa5f1ceeec92ce9ba0249951a00ed5d8
plan_head_after: 7d3516bcc0a6abb8589660a87416b4a43719181d
commits: 4
---

# Phase 49 Plan 01: Sign-in selector tracer Summary

**Common four-value sign-in selector (expired flag outranks logged-out) driving one Library row whose Sign in opens the Steam overlay via a validated, consume-once `/login?open=steam` deep link, with all new modules inside the i18n gate.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-09T03:01:42Z
- **Completed:** 2026-10-09T03:22:00Z
- **Tasks:** 3
- **Files modified:** 17 (10 created, 7 modified)

## Accomplishments

- Tracer slice end to end: `steamConfigStore.credentialsMissing` -> `collectSignInInputs` -> `resolveSignInStates` -> `resolveLibrarySignInRows` -> `LibrarySignInNotice` (mounted after `AlphabetFilter`, before the main `GamesList`) -> `navigate(buildLoginOpenPath('steam'))` -> `Login` mount effect -> `openLoginOverlay('steam')` -> `setSearchParams(..., { replace: true })`.
- R1 truth table pinned: 80 enumerated cases across the five stores, D-07 precedence (with a rule-order RED specimen), purity under frozen input, and the sign-in-after-stale-expiry flip.
- Dismissal helpers (`addSignInDismissal`, `rearmSignInDismissals`, `normalizeSignInDismissals`) are idempotent and always return `SIGN_IN_STORES` order.
- `libraryToShow` / `makeLibrary` untouched (R8): sign-in state never gates the library.

## Task Commits

1. **Task 1: Tracer** - `2abdf9c4b` (feat)
2. **Task 2: R1 table and dismissal helpers (TDD)** - RED `d13db2429` (test), GREEN `2a1e6d0bf` (feat); no refactor needed
3. **Task 3: i18n gate registration** - `7d3516bcc` (chore)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified

- `src/common/signInState.ts` - types, `SIGN_IN_STORES`, `resolveSignInState(s)`, `parseSignInStore`, `sanitizeSignInProbeOutcomeMap`; zero imports
- `src/common/signInDismissal.ts` - pure dismissal helpers
- `src/frontend/helpers/signInInputs.ts` - `collectSignInInputs`
- `src/frontend/screens/Library/librarySignInRows.ts` - expired-slice row resolver
- `src/frontend/screens/Library/components/LibrarySignInNotice/index.{tsx,scss}` - inline notice, no `position`, no `Dialog`
- `src/frontend/screens/Login/loginOpenParam.ts` - `LOGIN_OPEN_PARAM`, `buildLoginOpenPath`, `resolveLoginOpenRequest`
- `src/frontend/screens/Login/index.tsx` - `?open=` consumer effect
- `src/frontend/screens/Library/facetLabels.ts` - `RunnerToStore.humble`
- `src/frontend/screens/Library/index.tsx` - notice mount
- `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json` - four new paths, sorted, scanned scope
- Tests: `signInState`, `signInDismissal`, `signInTracer`; repinned `genI18nGateScope` and `hardcodedStringGate` counts

## Decisions Made

See `key-decisions` above. The notable one: `unknown` is never produced by an authentication failure; a proven failure latches the flag and lands in branch 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repinned literal count assertions in two meta test files**
- **Found during:** Task 3 (i18n gate registration)
- **Issue:** `genI18nGateScope.test.ts` pins the scope and fork-touched sizes as literals (189 / 233), and `hardcodedStringGate.test.ts` W3 pins `facetLabels.ts`'s `exempted` count (13). Adding four scanned files and the `humble: 'Humble Bundle'` brand-name entry necessarily moved all three, turning 4 tests red. The plan's acceptance line "`genI18nGateScope.test.ts` is unchanged" was written to guard that declared unscanned debt did not grow; it did not anticipate the literal pins.
- **Fix:** 189 -> 193 and 233 -> 237 (in assertions and test titles), and `exempted` 13 -> 14. `DECLARED_UNSCANNED_DEBT` is untouched. This matches the established precedent (`873718d59`, `9dc85e5da`: "refresh i18n-gate-scope artifacts ... repin the counts").
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`, `meta/__tests__/hardcodedStringGate.test.ts`
- **Verification:** both suites pass (183 passed, 1 pre-existing skip)
- **Committed in:** `7d3516bcc`

**2. [Plan wording] `librarySignInRows.ts` has one runtime import**
- The plan says "type-only imports" but also requires iterating `SIGN_IN_STORES`, which is a runtime value. The module imports `SIGN_IN_STORES` (and types) from `common/signInState`, which itself has no imports, so the no-jsdom rationale is unaffected.

---

**Total deviations:** 1 auto-fixed (1 blocking), 1 wording reconciliation
**Impact on plan:** Both necessary and scope-neutral; no behavior change.

## TDD Gate Compliance

- RED: `d13db2429` `test(49-01)`. The dismissal tests failed on assertions against a stub that returns the wrong values (10 failed, assertion-level, not a load crash).
- GREEN: `2a1e6d0bf` `feat(49-01)`.
- Note: the `signInState.test.ts` cases passed on their first run because the selector module landed in Task 1 (the tracer). That file is therefore a characterization of an existing module; its regression power is demonstrated inside the test by the rule-order specimen (a branches-swapped reimplementation returns `not-connected` where the real module returns `expired`). `gsd_run check tdd-red-evidence` was not run (no persisted RED record).

## Issues Encountered

- `hardcodedStringGate.test.ts` takes about 3 minutes locally (Windows); not related to this change.

## Known Stubs

None. The `{}` outcome map in `LibrarySignInNotice` and the `false` expiry flags for Epic/GOG/Amazon are documented sequencing (49-07 and 49-03/49-07 respectively), not stubs that block this plan's goal.

## Threat Flags

None. T-49-01 is mitigated (allow-list, consume-once, replace); the `?open=` surface is the one the plan's threat model already covers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 49-03 can add the Epic/GOG/Amazon `expired` keys; 49-07 Task 3 then adds the three reads in `collectSignInInputs` and wires `signInProbeOutcomes` from context.
- 49-09 widens `resolveLibrarySignInRows` with `not-connected` and the dismissed set.
- Live confirmation that the notice paints and the overlay opens is owed to 49-11.

## Self-Check: PASSED

---
*Phase: 49-cross-store-signed-out-offline-mode*
*Completed: 2026-10-09*
