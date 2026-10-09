---
phase: 49-cross-store-signed-out-offline-mode
plan: 09
subsystem: ui
tags: [react, library, sign-in-notice, tdd, source-gates, i18n]

requires:
  - phase: 49-cross-store-signed-out-offline-mode
    provides: "49-01 tracer notice and row module, 49-02 copy-contract catalogue keys, 49-07 dismissedSignInNotices state and handlers"
provides:
  - "resolveLibrarySignInRows with the not-connected kind and the dismissed-set input, canonical order, expired rows never dismissible"
  - "LibrarySignInNotice rendering both visual weights from one row element, a dismiss control, and the re-arm effect"
  - "librarySignInNoticeSource.test.ts: nine structural gates (non-modal, in-flow, click-only navigation, probe-free, interpolation-only store names) each with a RED specimen"
  - "SteamSyncNotice without a signedOut mode; resolveSteamSyncIndicator suppresses failed + credentials-missing (D-19)"
affects: [49-10, 49-11, 49-12]

actuals:
  tokens: 13235
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Pure row decision extracted from a stylesheet-importing component so Jest can prove it"
    - "Source gates proven against specimens derived from the real file by string manipulation"
    - "Re-arm effect keyed on a canonical-order string of the derived states, with an idempotent handler"

key-files:
  created:
    - src/frontend/screens/Library/__tests__/librarySignInRows.test.ts
    - src/frontend/screens/Library/__tests__/librarySignInNoticeSource.test.ts
  modified:
    - src/frontend/screens/Library/librarySignInRows.ts
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/screens/Library/librarySyncIndicator.ts
    - src/frontend/screens/Library/components/SteamSyncNotice/index.tsx
    - src/frontend/screens/Library/__tests__/librarySyncIndicator.test.ts
    - src/frontend/screens/Library/__tests__/signInTracer.test.ts
    - src/frontend/helpers/__tests__/signInInputs.test.ts

key-decisions:
  - "An expired row ignores the dismissed set entirely, so a dismiss can never hide a proven expiry (T-49-27)."
  - "The re-arm effect uses a scoped eslint-disable of react-hooks/exhaustive-deps (existing repo precedent) because it is keyed on a string derived from the states and the handler is idempotent."
  - "The sync-notice credential-missing case is suppressed, not replaced; the orphaned library.steamSync.signedOut* catalogue keys stay (keepRemoved, 48-05 precedent)."

patterns-established:
  - "One row element, class modifier chosen by kind: expired (warning) and notConnected (neutral) cannot drift into separate layouts."

requirements-completed: [R4, R5, R6, R8, R9]

coverage:
  - id: D1
    description: "Row decision: one row per expired or undismissed not-connected store, none for unknown/connected, canonical order over all 120 permutations, adjacency unmerged, expired non-dismissible"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/librarySignInRows.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dismissal persists across a simulated restart and re-arms exactly once after connected then expired"
    requirement: "R5"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/librarySignInRows.test.ts#connect-then-expire re-arms the dismissal once"
        status: pass
    human_judgment: false
  - id: D3
    description: "Notice structural contract: non-modal, in-flow, click-only navigation, probe-free, store names interpolated, dismiss guarded by row.dismissible"
    requirement: "R9"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/librarySignInNoticeSource.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Row visibility is state-derived across unmount; the library derivation reads no sign-in state"
    requirement: "R6, R8"
    verification:
      - kind: unit
        ref: "src/frontend/helpers/__tests__/signInInputs.test.ts#composition (R6); librarySignInNoticeSource.test.ts#G5"
        status: pass
    human_judgment: false
  - id: D5
    description: "SteamSyncNotice signedOut mode removed; failed + credentials missing resolves to hidden"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/librarySyncIndicator.test.ts#suppress-only (Phase 49 D-19)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A never-connected row reads as information, not an error, in every theme (neutral tokens, no danger colour, no warning icon)"
    verification: []
    human_judgment: true
    rationale: "Visual tone across themes cannot be asserted by a test; routed to 49-12 UAT item 10 (midnightMirage, gruvbox_dark, dracula)."

duration: 30min
completed: 2026-10-10
status: complete
plan_head_before: 8b01b7618d84b49e5572bf42abb9e8f8574502d3
plan_head_after: cb4bf4215b52f9d7e65847a9eb0ffa51048cabe4
commits: 5
---

# Phase 49 Plan 09: Full Library sign-in notice Summary

**The Library's one sign-in surface now lists every expired or undismissed never-connected store in two visual weights from one row element, with a persisted dismiss that can never hide an expiry, and the Steam sync notice no longer has a sign-in mode.**

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-10-10
- **Tasks:** 3 of 3
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments

- `resolveLibrarySignInRows` takes `{ states, dismissed }` and walks `SIGN_IN_STORES`: `expired` always yields a non-dismissible row; `not-connected` yields a dismissible row unless dismissed; `unknown` and `connected` yield nothing. The test generates all 120 permutations and asserts its own case count.
- `LibrarySignInNotice` renders both weights from one `LibrarySignInNotice__row` element (class picked by `kind`): expired uses the warning triangle and `Reconnect`; not-connected uses the store logo, `{{store}} is not connected`, `Sign in`, and a `faXmark` dismiss button present only when `row.dismissible`. A `useEffect` keyed on the five derived states calls `handleRearmSignInDismissals`.
- `librarySignInNoticeSource.test.ts` pins nine gates (G1-G9) plus a key-set check, each with a RED specimen derived from the real source.
- `SteamSyncNotice` lost its `signedOut` mode, its branch and `useNavigate`; `resolveSteamSyncIndicator` returns `hidden` for `failed` + `steamCredentialsMissing`, so no Retry renders beside the expired Steam row.

## Task Commits

1. Task 1 RED: `8c9632e77` test(49-09): add failing test for the full sign-in row decision
2. Task 1 GREEN: `a55820c76` feat(49-09): resolve the full sign-in row set with dismissal
3. Task 2: `85d9dc8b3` feat(49-09): render the full Library sign-in notice in two weights
4. Task 3 RED: `fbcf4db8d` test(49-09): add failing tests for the suppress-only Steam sync branch
5. Task 3 GREEN: `cb4bf4215` feat(49-09): drop the Steam sync notice sign-in mode, keep a suppress-only branch

TDD gate compliance: Tasks 1 and 3 each have a RED commit (target tests failing on the planned assertions: 4 and 3 failures respectively) followed by a GREEN commit. No REFACTOR commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing tests broke on the widened `resolveLibrarySignInRows` input**
- **Found during:** Task 1 (signInTracer) and Task 2 (`pnpm codecheck`, signInInputs)
- **Issue:** `signInTracer.test.ts` and `signInInputs.test.ts` call the function with `{ states }` over fixtures where four stores are signed out. With the new `not-connected` rows those assertions saw extra rows, and `dismissed` became a required property.
- **Fix:** `signInTracer.test.ts` now asserts on the `expired` slice it is about; `signInInputs.test.ts` passes `dismissed` for the four stores that are not under test. Intent of both tests is unchanged.
- **Files modified:** `src/frontend/screens/Library/__tests__/signInTracer.test.ts`, `src/frontend/helpers/__tests__/signInInputs.test.ts`
- **Commits:** `a55820c76`, `85d9dc8b3`

**2. [Plan wording] Task 1 acceptance: "counts only `import type` lines"**
- `librarySignInRows.ts` keeps one value import of `SIGN_IN_STORES` (required to order rows canonically; the module header already states it is the only runtime import, and it comes from the import-free `common/signInState.ts`). The module is otherwise pure. Not changed.

**Total deviations:** 1 auto-fixed (Rule 3), 1 plan-wording note. **Impact:** none on behaviour.

### Verification not fully green (pre-existing, out of scope; see deferred-items.md)

- `meta/__tests__/hardcodedStringGate.test.ts` "scans the whole committed scope" fails on `src/frontend/index.tsx:88` (the Phase 48 CSP-violation forwarding string `'(inline)'`). Not a file this plan touches; the notice files produce no violation. `genI18nGateScope` passes.
- `pnpm lint-translations:gamelib` reports 720 findings (missing translations such as `tour.*` and `wineExplanation.*` in other locales); none concern the `library.signIn.*` or `login.*Reconnect` keys. The plan's expectation of `0 findings` does not hold on this tree. Also, `pnpm lint-translations:gamelib` cannot run under the Windows `pnpm` shell (its script starts with `export`); it was run with the same environment variable set from bash.

## Verification Results

- `npx jest --selectProjects Frontend` over `librarySignInRows`, `librarySignInNoticeSource`, `signInTracer`, `librarySyncNoticeSource`, `librarySyncIndicator`: 89 tests pass.
- `pnpm i18n`: no-op over `public/locales`; `pnpm i18n-churn-guard`: clean.
- `pnpm codecheck`: exit 0. `pnpm lint`: `production: PASS | tests: PASS` (0 errors).
- Scoped `npx prettier --check` over every written path: clean.
- Acceptance greps: `position` in the notice stylesheet = 0 (code only); `window.api` in the notice = 0; `signedOut` in `librarySyncIndicator.ts` and `SteamSyncNotice/index.tsx` = 0; `steamCredentialsMissing` in the resolver code = 2. `steamLibraryVisibility.ts` and `SteamSignOut.ts` untouched.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change.

## Issues Encountered

None blocking. The "never-connected row reads as information, not an error, across themes" truth is a judgment item routed to 49-12 UAT item 10, as the plan states.

## Next Phase Readiness

Ready for 49-10. The notice's Sign in clicks use `buildLoginOpenPath(row.store)`, already consumed by Login (49-01).

## Self-Check: PASSED
