---
phase: 12-ownership-dedup
plan: 05
subsystem: ui
tags: [react, react-i18next, jest, humble, steam, ownership-badge]

# Dependency graph
requires:
  - phase: 12-01
    provides: HumbleKey ownership-overlay fields (ownedElsewhere, matchConfidence, steamAppId)
  - phase: 12-04
    provides: humbleSetOwnershipOverride/humbleClearOwnershipOverride IPC + preload bridge
provides:
  - Owned-badge ("Owned on Steam" / "Likely owned on Steam") on HumbleKeyRow (D-38/39/41)
  - Fuzzy-only "Not the same game" override affordance firing the override IPC (D-42)
  - HumbleOriginInfo — redeemed-only, confirmed-match-only Humble-origin annotation on the Steam GamePage info tab (D-35/36/37/40)
  - First frontend Jest project (src/frontend/jest.config.js, Node env, DOM-free component testing)
affects: [13-keys-waiting-giftable-spares, 14-guided-claim-flow, ui-review]

# Tech tracking
tech-stack:
  added: []
  patterns: [DOM-free React component testing via jest.mock('react') useContext override — no jsdom dependency]

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx
    - src/frontend/jest.config.js
  modified:
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Game/GamePage/components/index.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - jest.config.js
    - public/locales/en/translation.json
    - public/locales/en/gamepage.json

key-decisions:
  - "Badge styles live in parent Keys/index.css (semantic tokens only) — HumbleKeyRow has no own stylesheet in this codebase"
  - "Frontend Jest project uses Node environment with DOM-free element-tree assertions instead of installing jest-environment-jsdom (package-install exclusion honored)"

patterns-established:
  - "Frontend component tests: mock useContext/useTranslation at module level, invoke component as plain function, assert on returned element tree"

requirements-completed: [HDEDUP-01, HDEDUP-02]

# Metrics
duration: ~16min (agent) + human verification
completed: 2026-07-07
---

# Phase 12 Plan 05: Ownership UI Surfacing Summary

**Owned-badge + fuzzy-only "Not the same game" override on Humble key rows, and a redeemed-only Humble-origin annotation on the Steam game-details info tab — the user-visible proof of HDEDUP-01/02, human-verified in the running app**

## Performance

- **Duration:** ~16 min agent execution + human verification checkpoint
- **Completed:** 2026-07-07
- **Tasks:** 3/3 (Task 3 = human-verify checkpoint, approved by user)
- **Files modified:** 10

## Accomplishments
- `HumbleKeyRow` shows "Owned on Steam" (exact AppID match) or "Likely owned on Steam" (fuzzy) as a fact-only badge — no re-sorting, dimming, or group changes (D-38/39/41)
- Fuzzy-matched rows (only) render a "Not the same game" affordance that fires `window.api.humbleSetOwnershipOverride` (D-42); exact-match rows never show it
- `HumbleOriginInfo` on the GamePage info tab annotates Steam games holding a REDEEMED, confirmed-matched Humble key with "Includes a key from Humble Bundle: {bundle}" — origin only, no date, nothing rendered for unmatched or unredeemed keys (D-35/36/37/40)
- First frontend Jest project established; 4 RED→GREEN test cases for HumbleOriginInfo

## Task Commits

1. **Task 1: Owned badge + fuzzy-only override on HumbleKeyRow** - `7e7e6d46` (feat)
2. **Task 2 (RED): Failing test for HumbleOriginInfo + frontend jest project** - `ce20d631` (test)
3. **Task 2 (GREEN): HumbleOriginInfo annotation + GamePage mount** - `7085eacf` (feat)
4. **Task 3: Human-verify checkpoint** - approved by user 2026-07-07 (no code commit)

## Files Created/Modified
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` - owned badge + override affordance
- `src/frontend/screens/Humble/Keys/index.css` - `.humbleKeyOwnedBadge`/`.humbleKeyOwnedOverride` (semantic tokens)
- `src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx` - redeemed-only origin annotation
- `src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx` - DOM-free component test (4 cases)
- `src/frontend/screens/Game/GamePage/components/index.tsx`, `src/frontend/screens/Game/GamePage/index.tsx` - mount point
- `src/frontend/jest.config.js`, `jest.config.js` - new frontend Jest project registration
- `public/locales/en/translation.json`, `public/locales/en/gamepage.json` - i18n keys

## Decisions Made
- Badge styling placed in parent `Keys/index.css` — the row component has no dedicated stylesheet in this codebase
- DOM-free testing technique adopted instead of adding `jest-environment-jsdom` (respects the no-new-package gate)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Planned stylesheet path does not exist**
- **Found during:** Task 1
- **Issue:** Plan named `HumbleKeyRow/index.css`, but row styling lives entirely in parent `Keys/index.css`
- **Fix:** Added badge/override rules to `Keys/index.css` using semantic tokens only
- **Committed in:** `7e7e6d46`

**2. [Rule 3 - Blocking] No frontend Jest project existed**
- **Found during:** Task 2 (RED)
- **Issue:** Root `jest.config.js` only declared the backend project; `jest-environment-jsdom`/`react-test-renderer` not installed, and new package installs are excluded
- **Fix:** Added `src/frontend/jest.config.js` (Node env) registered in root projects; test mocks `useContext`/`useTranslation` at module level and asserts on the component's returned element tree — no DOM needed
- **Verification:** RED→GREEN sequence in git log (`ce20d631` → `7085eacf`); full suite 34 suites / 567 tests green
- **Committed in:** `ce20d631`

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking)
**Impact on plan:** Both fixes necessary to execute the plan as written in this codebase. No scope creep.

## Issues Encountered
- Human-verify was briefly blocked by a corrupted local Electron install (`node_modules/electron` half-extracted, missing `path.txt`; `extract-zip`'s promise silently never settles in this environment). Fixed outside the plan by re-extracting the cached zip with `ditto` and writing `path.txt` — environment-only, no repo changes.

## User Setup Required

None - no external service configuration required.

## Human Verification (Task 3 — approved 2026-07-07)

User verified in the running app:
1. Owned/Likely-owned badges render on matching Humble key rows; grouping and expiring-soonest ordering unchanged
2. Fuzzy-only override clears the badge and persists across app restart and Humble disconnect/reconnect (D-43)
3. Steam games with a redeemed Humble key show the origin annotation; games without one show nothing
4. Steam logout + refresh does not flip previously-owned badges (D-48 keep-last-known)

## Next Phase Readiness
- HDEDUP-01 and HDEDUP-02 fully surfaced in UI; Phase 12 plans 01–05 all complete
- Phase 13 (Keys-Waiting + Giftable-Spares views) can build on the ownership overlay fields and badge patterns established here

---
*Phase: 12-ownership-dedup*
*Completed: 2026-07-07*
