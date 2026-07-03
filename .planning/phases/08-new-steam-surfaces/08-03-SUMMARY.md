---
phase: 08-new-steam-surfaces
plan: 03
subsystem: ui
tags: [react, svg, branding, placeholder, cached-image, steam-artwork]

# Dependency graph
requires:
  - phase: 08-new-steam-surfaces
    provides: ConsoleMode grid (ConsoleCard) and Library GameCard rendering Steam art_square tiles
provides:
  - GameLib-branded default placeholder SVG (gamelib_card.svg) replacing Heroic's heroic_card.jpg across all 7 fallback-image consumers
  - Greyed "Artwork unavailable" placeholder SVG (gamelib_card_missing.svg) for broken/404 art URLs
  - CachedImage fallback prop wired into ConsoleCard and Library GameCard so broken Steam art degrades to the greyed placeholder instead of a blank tile
affects: [console-mode, library-grid, steam-artwork, branding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Import bundled SVGs with the explicit ?url suffix so they resolve to a URL string (not a vite-plugin-svgr React component) usable as an <img> src"
    - "Broken/404 art degrades via CachedImage's existing onError→fallback chain (pass fallback prop) rather than a dead `|| fallback` on src, which only fires on empty string"

key-files:
  created:
    - src/frontend/assets/gamelib_card.svg
    - src/frontend/assets/gamelib_card_missing.svg
  modified:
    - src/frontend/screens/Library/components/GameCard/constants.ts
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx
    - src/frontend/screens/Discounts/components/DiscountCard/index.tsx
    - src/frontend/screens/Game/GamePicture/index.tsx
    - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
    - src/frontend/components/UI/EditGameDialog/index.tsx

key-decisions:
  - "Fixed gap A via CachedImage's existing fallback prop (no new onError handler) — the greyed variant renders through the bounded onError chain, avoiding infinite retry (T-08-05 mitigation)"
  - "Dropped ConsoleCard's dead `|| fallBackImage` — getImageFormatting already returns the branded default for empty art, and `||` never fires on a 404"
  - "Used ?url import suffix (Vite-native, already typed by vite/client.d.ts) so no ambient module declaration was needed"

patterns-established:
  - "Pattern: bundled placeholder art imported via '...svg?url' to guarantee a URL string src"
  - "Pattern: broken-art resilience through CachedImage fallback prop, not a src-level `||` guard"

requirements-completed: [CONSOLE-01]

# Metrics
duration: 9min
completed: 2026-07-04
---

# Phase 8 Plan 03: GameLib Placeholder Branding + Broken-Art Fallback Summary

**Replaced Heroic's leftover default card image with a GameLib-branded SVG across all 7 consumers, and wired a distinct greyed "Artwork unavailable" variant as the CachedImage broken-art fallback so 404 Steam art URLs in the Console and Library grids never render blank.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-04T11:35:18+12:00
- **Completed:** 2026-07-04T11:44:05+12:00
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- Authored two self-contained 600x900 portrait SVG placeholders: a dark GameLib-branded default ("No artwork") and a visibly greyer variant ("Artwork unavailable")
- Swapped every `heroic_card.jpg` import (7 consumers) to `gamelib_card.svg?url`, preserving each file's local identifier so no downstream usage changed — closes UAT gap C (branding) app-wide
- Wired `fallback={fallBackImageMissing}` into ConsoleCard and Library GameCard cover images (and the justPlayed cover), and removed ConsoleCard's dead `|| fallBackImage` — closes UAT gap A (blank Steam art tiles)
- `pnpm codecheck` (tsc --noEmit) exits 0; no `heroic_card.jpg` reference remains in `src/frontend`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GameLib-branded default + greyed SVG assets** - `6ab7bb41` (feat)
2. **Task 2: Swap all 7 heroic_card.jpg references to the branded default** - `aba253a3` (feat)
3. **Task 3: Wire the greyed variant as the broken-art fallback in ConsoleCard + GameCard** - `eef2b084` (fix)

_(STATE.md / ROADMAP.md updates are owned by the orchestrator after the wave completes — not written here per parallel-executor rules.)_

## Files Created/Modified
- `src/frontend/assets/gamelib_card.svg` - Branded default placeholder (dark #1b1d2a, "GameLib" wordmark, "No artwork" caption)
- `src/frontend/assets/gamelib_card_missing.svg` - Greyed variant (muted #2a2a2e, dimmed wordmark, "Artwork unavailable" caption)
- `src/frontend/screens/Library/components/GameCard/constants.ts` - `getImageFormatting` now returns the GameLib branded default for empty/'fallback' cover
- `src/frontend/screens/Library/components/GameCard/index.tsx` - Import branded default + greyed variant; `fallback={fallBackImageMissing}` on cover and justPlayed CachedImage
- `src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx` - Import greyed variant; dropped dead `|| fallBackImage`; added `fallback` prop
- `src/frontend/screens/Discounts/components/DiscountCard/index.tsx` - Branded default import swap
- `src/frontend/screens/Game/GamePicture/index.tsx` - Branded default import swap
- `src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx` - Branded default import swap
- `src/frontend/components/UI/EditGameDialog/index.tsx` - Branded default import swap

## Decisions Made
- **Reused CachedImage's existing fallback mechanism for gap A** rather than adding a new onError handler. Passing a `fallback` prop routes a 404 through the component's bounded onError chain (`setUseFallback(true)`), which is the T-08-05 mitigation (no infinite retry, no blank render).
- **Dropped the dead `|| fallBackImage`** on ConsoleCard's `src` — `getImageFormatting` already returns the branded default when art is empty, and `||` never fires on a broken (non-empty) URL, which was gap A's root cause.
- **`?url` import suffix** — Vite already types `*?url` in `node_modules/vite/client.d.ts`, so the imports typecheck with no ambient `declare module` needed. Guarantees a URL string (not a vite-plugin-svgr React component).

## Deviations from Plan

None - plan executed exactly as written. The plan's contingency (add an ambient `*.svg?url` module declaration if codecheck fails) was not needed, since Vite's client types already cover `*?url`.

## Issues Encountered
None. `pnpm codecheck` passed on the first run after both Task 2 and Task 3.

## User Setup Required
None - no external service configuration required.

## Notes
- `src/frontend/assets/heroic_card.jpg` remains on disk but is now unreferenced by the frontend. It was intentionally left in place (out of plan scope to delete); a future housekeeping pass may remove it.
- Manual re-UAT is deferred to `/gsd:verify-work`: verify valid Steam art still renders, a 404 art URL shows the greyed placeholder in Console + Library grids, and a game with no art shows the branded default.

## Self-Check: PASSED

## Next Phase Readiness
- UAT gaps A (blank art) and C (branding) closed and code-verified. Ready for runtime re-UAT.
- No blockers introduced.

---
*Phase: 08-new-steam-surfaces*
*Completed: 2026-07-04*
