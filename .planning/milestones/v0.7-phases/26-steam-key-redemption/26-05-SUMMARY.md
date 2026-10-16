---
phase: 26-steam-key-redemption
plan: 05
subsystem: ui
tags: [react, sidebar, steam, redeem-key, jest, entry-point]

# Dependency graph
requires:
  - phase: 26-04
    provides: showRedeemKeyDialog/handleRedeemKeyDialog boolean context toggle, RedeemSteamKeyDialog modal mounted in App.tsx
provides:
  - Login-gated "Redeem a Steam key" SidebarItem (button-style, opens the 26-04 modal)
  - SidebarLinks login-gating test infrastructure (first test file for this component)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct-invocation component test (no jsdom/react-test-renderer): mock 'react' (useContext), 'react-router-dom' (useLocation), 'react-i18next' (useTranslation), stub sibling components that carry a colocated CSS side-effect import (SidebarItem, QuitButton) or a window.api-at-import-time module body ('frontend/helpers'), invoke the component as a plain function, and walk the returned React-element object graph"

key-files:
  created:
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx
  modified:
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx

key-decisions:
  - "Stubbed SidebarItem, QuitButton, 'frontend/helpers', and 'frontend/components/UI/ExternalLinkDialog' in the new test rather than rendering them for real — SidebarItem/QuitButton each carry a colocated `import './index.css'` side-effect import with no CSS transform configured for this jest project (same constraint documented in src/frontend/jest.config.js), and 'frontend/helpers' reads `window.api.openDiscordLink` at module-body scope (executes at import time, not lazily), which would otherwise require a global window.api stub for a test that has nothing to do with Discord/help links."
  - "Mocked global.sessionStorage (getItem/setItem/removeItem/clear/key/length) because SidebarLinks calls `sessionStorage.getItem('last-store')` directly in its render body (not inside a click handler) to compute the default Stores link, and testEnvironment is 'node' (no DOM globals) per this project's established constraint."

requirements-completed: [REQ-26-01]

# Metrics
duration: ~10min
completed: 2026-07-20
---

# Phase 26 Plan 05: Sidebar Entry Point Summary

**Login-gated "Redeem a Steam key" sidebar button (steam.username gate, opens the 26-04 modal via handleRedeemKeyDialog(true), no route navigation) plus SidebarLinks' first-ever automated test, closing the Wave 0 gating-coverage gap.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-20T03:11:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `SidebarLinks/index.tsx` destructures `handleRedeemKeyDialog` from `ContextProvider` (alongside the already-destructured `steam`) and renders a new `<SidebarItem elementType="button" onClick={() => handleRedeemKeyDialog(true)} icon={faKey} label={t('sidebar.redeemSteamKey', 'Redeem a Steam key')} dataTour="sidebar-redeem-steam-key" />`, gated on `steam.username` (same truthy proxy the file's existing `loggedIn` variable already uses for Steam) and placed immediately after the Settings `SidebarItemWithSubmenu` block (D-01)
- Uses `elementType="button"` + `onClick` (not `url`), matching the file's existing Discord/Patreon/Ko-fi button-style items, so clicking opens the modal in place rather than navigating to a route (D-03)
- Created `SidebarLinks/__tests__/index.test.tsx` — the first automated test for this component — asserting the item is absent with no Steam session and present + wired to `handleRedeemKeyDialog(true)` on click when `steam.username` is set (D-02 / SPEC REQ1)
- `npx tsc --noEmit` reports zero errors project-wide after both changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add login-gated Redeem-a-Steam-key sidebar item under Settings** - `de51e731` (feat)
2. **Task 2: SidebarLinks login-gating test (hidden logged-out, shown logged-in)** - `e801db55` (test)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` - Added `handleRedeemKeyDialog` to the `useContext(ContextProvider)` destructure and a new `steam.username`-gated button `SidebarItem` after the Settings block
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx` - New test file: two cases (absent logged-out, present + click-wired logged-in), using a direct-invocation harness (mocked `react`/`react-router-dom`/`react-i18next`, stubbed `SidebarItem`/`QuitButton`/`frontend/helpers`/`ExternalLinkDialog`, mocked `global.sessionStorage`)

## Decisions Made

- Stubbed out `SidebarItem`, `QuitButton`, `frontend/helpers`, and `frontend/components/UI/ExternalLinkDialog` in the test rather than letting Jest resolve them for real, to avoid CSS-side-effect-import failures (no CSS transform configured for this jest project) and an import-time `window.api` read in `frontend/helpers`.
- Mocked `global.sessionStorage` since `SidebarLinks` reads `sessionStorage.getItem('last-store')` synchronously during render (not inside a handler), and this project's frontend jest config deliberately runs `testEnvironment: 'node'` (no DOM globals available).

## Deviations from Plan

None - plan executed exactly as written. The plan's `<interfaces>` section and `26-PATTERNS.md`'s exact code snippet for the new `SidebarItem` block were followed verbatim; the test file's specific harness shape (mocking `react-router-dom`'s `useLocation` and stubbing `SidebarItem`/`QuitButton`/`frontend/helpers`) was left to this plan's discretion per the task's `<action>` wording ("look at a sibling component test for the render/wrap helper") and follows the project's established direct-invocation pattern (`HumbleOriginInfo.test.tsx`, `StoreSearchScreen.test.tsx`).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 26 (Steam Key Redemption) is now end-to-end wired: backend `redeemKey()` wrapper (26-01) → client-side format validation (26-02) → IPC method (26-03) → modal + context toggle (26-04) → login-gated sidebar entry point (26-05).
- Manual UAT per `26-VALIDATION.md` remains: with no Steam session the item is absent; after Steam login it appears and opens the modal; a real key redemption exercises the full round trip.
- No blockers for phase completion beyond that manual UAT pass.

---
*Phase: 26-steam-key-redemption*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
- FOUND: src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx
- FOUND: commit de51e731
- FOUND: commit e801db55
