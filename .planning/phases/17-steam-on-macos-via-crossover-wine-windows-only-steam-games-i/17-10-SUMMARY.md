---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 10
subsystem: ui
tags: [scss, react, steam-bottle, crossover, toast, gap-closure]

# Dependency graph
requires:
  - phase: 17-06
    provides: SteamBottleSetup.tsx guided consent/provisioning banner (unstyled)
provides:
  - Co-located SteamBottleSetup.scss styling the guided-setup banner
  - Regression test guarding against the banner ever being unstyled again
affects: [17-08, 17-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Co-located component .scss imported directly in .tsx, mirroring HumbleExpiryToast/index.scss token-based fixed-position toast pattern"
    - "fs.readFileSync-based styling regression test (no scss transform/jsdom needed) for a testEnvironment:'node' Jest config with no scss moduleNameMapper"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.scss
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamBottleSetup.styles.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx

key-decisions:
  - "Stacked the toast as flex-direction: column (not row, unlike HumbleExpiryToast) because the provisioning state renders 4 stacked message spans plus a dismiss button, not a single inline message"
  - "Used var(--status-warning) as the border-inline-start accent, matching HumbleExpiryToast, since this banner is also an attention/action surface (error + login-required states)"

patterns-established:
  - "New non-blocking banner components in this codebase should follow the HumbleExpiryToast/SteamBottleSetup co-located .scss + fs-based styles regression test pattern rather than inline styles"

requirements-completed: [MACSTEAM-02]

# Metrics
duration: ~10min
completed: 2026-07-10
---

# Phase 17 Plan 10: Steam Bottle Setup Banner Styling Summary

**Styled the previously-unstyled Steam bottle setup guided-setup banner (`.steamBottleSetupToast`) with a co-located SCSS file mirroring the HumbleExpiryToast token-based fixed-position toast pattern, closing the cosmetic sub-issue of UAT GAP 1 (MACSTEAM-02).**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1 completed
- **Files modified:** 3 (1 created scss, 1 created test, 1 modified tsx)

## Accomplishments
- Created `SteamBottleSetup.scss` with rules for `.steamBottleSetupToast` (fixed position, visible `background`, `padding`, `z-index: 20`, box-shadow, border-radius, warning-accent border), `.steamBottleSetupMessage`, `.steamBottleSetupAction`, `.steamBottleSetupDismiss`, and `.steamBottleSetupEngineLabel`
- Wired the stylesheet import into `SteamBottleSetup.tsx`
- Added an fs-based regression test (`SteamBottleSetup.styles.test.ts`) that asserts all four primary selectors exist and that the toast rule specifically declares `background`, `z-index`, and `padding` — the exact prior regression (zero CSS rules)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create and import SteamBottleSetup.scss styling the guided-setup banner + its states** - `20ce90bb` (fix)

**Plan metadata:** committed separately per worktree protocol (SUMMARY.md only, orchestrator handles STATE.md/ROADMAP.md).

## Files Created/Modified
- `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.scss` - Toast/message/action/dismiss/engine-label styling, token-based (no hardcoded colors)
- `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` - Added `import './SteamBottleSetup.scss'`
- `src/frontend/screens/Game/GamePage/components/__tests__/SteamBottleSetup.styles.test.ts` - fs-based regression test for the scss rules and the tsx import

## Decisions Made
- Flex-direction column (not row) for the toast, since the provisioning state stacks 4 message spans + a dismiss button (HumbleExpiryToast is a single inline row with an icon)
- `var(--status-warning)` accent border, consistent with HumbleExpiryToast, since this banner surfaces both an error state and an actionable login-required prompt

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The visual/cosmetic sub-issue of UAT GAP 1 (MACSTEAM-02) is closed independently of the backend readiness fixes in 17-08/17-09 (no file overlap, ran in parallel as planned).
- The banner now has a legible, styled surface in both the provisioning and error states; no runtime/visual UAT was performed by this executor (jsdom/electron not available in this environment) — recommend a lightweight manual visual check during the next UAT pass to confirm CSS variable values resolve correctly in the actual Electron renderer theme.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: src/frontend/screens/Game/GamePage/components/SteamBottleSetup.scss
- FOUND: src/frontend/screens/Game/GamePage/components/__tests__/SteamBottleSetup.styles.test.ts
- FOUND: commit 20ce90bb
