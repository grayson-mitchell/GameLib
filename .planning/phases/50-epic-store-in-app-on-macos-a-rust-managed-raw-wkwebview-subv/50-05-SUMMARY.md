---
phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
plan: 05
subsystem: ui
tags: [react, hooks, tauri, wkwebview, epic, sign-in-state]

# Dependency graph
requires:
  - phase: 50-02
    provides: "Rust-side nav-event fields (loadTimedOut, challenged, blockedLauncherSchemeCount) drained into StoreEmbedHostState"
  - phase: 50-03
    provides: "StoreEmbedTimeoutBanner, WebviewUnavailablePanel reason=\"epic-challenged\", EpicLauncherBlockedNotice chrome components"
provides:
  - "Nav-signal state (loadTimedOut/challenged/blockedLauncherSchemeCount) surfaced from useStoreEmbedHost into StoreEmbedHostState"
  - "Plan 03's three chrome components wired into WebView/index.tsx's JSX return"
  - "Exactly one auth-triggered Epic subview reload on return, sourced from resolveSignInState over collectSignInInputs' legendary entry (D-04)"
affects: ["50-06", "50-validation", "epic-store-embed"]

actuals:
  tokens: 10668
  tasks: 3
  commits: 6
  plan_head_before: 99466222d983372a42b63c86018eb0c5763497f1
  plan_head_after: 1ab679d48a3b6895c946ddae593982fa68b03d11

tech-stack:
  added: []
  patterns:
    - "Epic-surface gating via isEpicSurface = storeKey === 'epic' && platform === 'darwin', derived inline from existing params rather than threading a new boolean option"
    - "Auth-state comparison via a load-time ref (signInStateAtLoadRef) compared against the current resolved value inside the two existing show branches, rather than a separately memoized callback"

key-files:
  created: []
  modified:
    - src/frontend/screens/WebView/useStoreEmbedHost.ts
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
    - src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts
    - src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx

key-decisions:
  - "Task 3's auth-triggered reload is inlined directly into both existing show branches (suppression-return and refused-target-return) rather than factored into a separately memoized useCallback, since the mocked test harness's useCallback is an identity passthrough (never memoized by deps) and every effect's real side effects are already gated by internal ref/boolean checks, not by whether the effect reran"
  - "signInState is derived in index.tsx via resolveSignInState(collectSignInInputs(...).legendary) — the shared Phase 49 rule table — and passed into the hook as a resolved string, never a raw persisted flag or a cookie read (D-04, Phase 40 D-16)"
  - "storeEmbedReloadLoop.test.tsx required two incidental fixes (its pinned call-shape regex, and Sim.render()'s hook call) to account for the hook's new sixth signInState parameter — both fixed with a fixed non-darwin platform/placeholder value so the new gate never arms in that suite"

patterns-established:
  - "Auth-state-change-triggered reload: compare a load-time-snapshotted ref against the current resolved value inside existing show-transition branches, gated to the surface where the behavior applies"

requirements-completed: []

coverage:
  - id: D1
    description: "Epic nav-signal state (load-timeout, challenge, blocked-launcher-scheme count) surfaced from useStoreEmbedHost's drain into StoreEmbedHostState"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Plan 03's three chrome components (StoreEmbedTimeoutBanner, WebviewUnavailablePanel reason=\"epic-challenged\", EpicLauncherBlockedNotice) rendered in index.tsx's final JSX return"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exactly one auth-triggered Epic subview reload on return, sourced from resolveSignInState(collectSignInInputs(...).legendary), never from cookies (D-04)"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx (Properties 31-35)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-10-13
status: complete
---

# Phase 50 Plan 05: Epic Nav-Signal Chrome Wiring + Auth-Triggered Reload Summary

**Surfaced Plan 02's Rust nav signals and Plan 03's chrome components into the live WebView JSX, then added the one auth-triggered Epic subview reload on return via the shared Phase 49 sign-in rule table.**

## Performance

- **Duration:** ~45 min (first commit to last commit)
- **Started:** 2026-10-12T23:30:10+13:00
- **Completed:** 2026-10-13T00:14:41+13:00
- **Tasks:** 3/3 completed
- **Files modified:** 5

## Accomplishments
- `useStoreEmbedHost`'s 250ms nav-event drain now surfaces `loadTimedOut`, `challenged`, and `blockedLauncherSchemeCount` into `StoreEmbedHostState`, with `onTryAgain` wired to re-navigate and re-show the Epic subview.
- `WebView/index.tsx`'s final JSX return now renders `StoreEmbedTimeoutBanner`, `WebviewUnavailablePanel reason="epic-challenged"`, and `EpicLauncherBlockedNotice` at the correct positions relative to the still-mounted slot div, so the slot's measured rect and `ResizeObserver` survive even while the challenged panel is shown.
- Returning to the Stores tab now issues exactly one `storeEmbedReload()` of the Epic subview when GameLib's own resolved Epic sign-in state has changed since the page last loaded, and issues none when it has not — gated to `storeKey === 'epic' && platform === 'darwin'`, sourced exclusively from `resolveSignInState(collectSignInInputs(...).legendary)`.

## Task Commits

Each task was committed atomically via TDD RED -> GREEN:

1. **Task 1: Surface Epic nav-signal state into hook state**
   - `2b9395f7f` - test(50-05): add failing tests for Epic nav-signal surfacing and onTryAgain
   - `5aa251a59` - feat(50-05): surface Epic load-timeout, challenge and launcher-block nav signals
2. **Task 2: Render plan 03's three chrome components in index.tsx's JSX**
   - `64fe4ade0` - test(50-05): add failing raw-source assertions for index.tsx's Epic chrome wiring
   - `c363aaac6` - feat(50-05): wire Epic nav-signal chrome into index.tsx's final JSX return
3. **Task 3: One reload on return when Epic sign-in state changed (D-04)**
   - `cb2c72064` - test(50-05): add failing tests for the Epic auth-triggered reload (D-04)
   - `1ab679d48` - feat(50-05): add one auth-triggered Epic reload on return (D-04)

_Note: all three tasks were `tdd="true"` and each produced exactly one RED commit and one GREEN commit — no REFACTOR commit was needed on any task._

## Files Created/Modified
- `src/frontend/screens/WebView/useStoreEmbedHost.ts` - nav-signal surfacing (Task 1) + `isEpicSurface`/`signInStateAtLoadRef`/auth-triggered reload in both show branches (Task 3)
- `src/frontend/screens/WebView/index.tsx` - chrome component wiring in final JSX return (Task 2) + `signInState` derivation and widened hook call (Task 3)
- `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` - Task 1 nav-signal tests + Task 3 Properties 31-35 (auth-triggered reload)
- `src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts` - Task 2 raw-source-slice assertions for chrome wiring
- `src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx` - incidental fix: widened pinned call-shape regex and `Sim.render()`'s hook call to account for the new `signInState` parameter

## Decisions Made
- Dropped the originally-sketched `reloadIfSignInStateChanged` callback abstraction in favor of inlining the compare-and-reload logic directly into both of the hook's two existing show branches — matches the plan's own wording more literally and avoids an unnecessary intermediate abstraction given the mocked test harness's unmemoized `useCallback`.
- `isEpicSurface` is derived inline inside the hook from the existing `storeKey`/`platform` params rather than threaded in as a new boolean option, mirroring the duplicate derivation already present in `index.tsx`'s own render condition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `storeEmbedReloadLoop.test.tsx`'s pinned call-shape regex and `Sim.render()`'s hook call needed updating for the hook's new sixth parameter**
- **Found during:** Task 3, after restoring the GREEN implementation and re-running the combined suite
- **Issue:** `storeEmbedReloadLoop.test.tsx` pins both a raw-source regex asserting the exact `useStoreEmbedHost({...})` call shape in `index.tsx`, and its own `Sim.render()` helper's call to the real hook. Adding the new `signInState` parameter to the real call site broke the former (regex no longer matched) without that file being named in Task 3's own `<files>` list.
- **Fix:** Widened the regex to include `signInState` as a sixth property; added `signInState: 'not-connected'` to `Sim.render()`'s hook call (the suite's `platform` is always `'linux'`, so the new Epic-surface gate never arms regardless of this placeholder value).
- **Files modified:** `src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx`
- **Verification:** Re-ran `npx jest --selectProjects Frontend --testPathPattern "useStoreEmbedHost|storeEmbedReloadLoop"` -- 2 suites passed, 55 tests passed, 0 regressions.
- **Committed in:** `1ab679d48` (part of Task 3's GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue)
**Impact on plan:** Necessary to keep an existing, passing test suite green after Task 3's new hook parameter; no scope creep beyond the one incidental fix.

## Issues Encountered

During the plan-wide `pnpm test:ci` run, 2 pre-existing failures were observed in `meta/__tests__/lintTranslations.test.ts` (`REQ-41-02` live-tree hard-failures count, `REQ-41-01` presence-baseline drift). Both are unrelated to any file this plan touched (no locale/translation file was modified by Plan 05) and are therefore out of this plan's scope per the Scope Boundary rule. Logged to `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/deferred-items.md` rather than fixed here. All other suites in the full `pnpm test:ci` run (543 of 544 suites, 11846 of 11851 tests) passed, and `cargo test` from `src-tauri/` passed fully clean (352 passed, 0 failed, 2 ignored).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All three must-have truths for sign-in-state-driven reload, nav-signal chrome, and the surfaced hook state are now wired end-to-end in the renderer. The remaining Wave 0 items in `50-VALIDATION.md` that are explicitly `manual (live gate)` (subview show/hide lifecycle, the 45s timeout live behavior, sign-in button reachability) are outside this plan's automated scope and remain for the phase's live-gate verification pass.

## Self-Check: PASSED
