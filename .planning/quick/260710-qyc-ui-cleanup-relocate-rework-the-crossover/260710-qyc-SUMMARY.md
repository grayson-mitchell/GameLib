---
phase: quick-260710-qyc
plan: 01
subsystem: ui
tags: [react, gamepage, i18n, crossover, codeweavers, wine]

# Dependency graph
requires:
  - phase: quick-260710-l27
    provides: "AppleWikiInfo component with separate Crossover/Wine rating rows (this plan relocates + reworks those rows)"
provides:
  - "Crossover/Wine emulation rows moved from Extra-info tab to Install-info tab (next to Supported platforms)"
  - "Emulation rows hidden entirely for native games (is.native gate)"
  - "Crossover row now shows the CodeWeavers logo instead of the generic WineBar icon"
  - "Wine row now links to AppleGamingWiki (macOS) or WineHQ AppDB (Linux) search instead of codeweavers.com"
  - "Extra-info tab no longer appears for games whose only extra data is applegamingwiki/codeweavers"
affects: [gamepage, extra-info-tab, install-info-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CodeweaversLogo svg?react import pattern (mirrors WineVersionSelector.tsx)"

key-files:
  created: []
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
    - public/locales/en/gamepage.json

key-decisions:
  - "hasWikiInfo gate no longer checks applegamingwiki/codeweavers.rating — Extra-info tab visibility now driven solely by howlongtobeat/pcgamingwiki/steamInfo"
  - "AppleWikiInfo relocated to the info TabPanel, rendered directly after PlatformSupport and before DownloadSizeInfo"
  - "Emulation rows gated on is.native (component returns null for native games) since a compat-layer rating is meaningless when the game runs natively"

patterns-established:
  - "Emulation/compat-layer UI belongs beside Supported platforms in the Install-info tab, not the Extra-info tab"

requirements-completed: [QYC-UI-01]

# Metrics
duration: ~12min
completed: 2026-07-10
---

# Quick Task 260710-qyc: UI Cleanup - Relocate/Rework CrossOver Summary

**Moved the CrossOver/Wine emulation compatibility rows from the Extra-info tab to the Install-info tab, gated them to non-native games only, swapped the Crossover row's icon to the CodeWeavers logo, reworded both rows to "Crossover emulation"/"Wine emulation", and repointed the Wine row's link to AppleGamingWiki (macOS) / WineHQ AppDB (Linux) instead of codeweavers.com.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-10T07:18:00Z (approx)
- **Completed:** 2026-07-10T07:30:29Z
- **Tasks:** 3 (2 code tasks + 1 verification-only task)
- **Files modified:** 3

## Accomplishments
- `AppleWikiInfo` relocated out of the Extra-info tab into the Install-info tab (right after `PlatformSupport`, before `DownloadSizeInfo`)
- `hasWikiInfo` gate corrected so the Extra-info tab no longer appears for games whose only extra data is applegamingwiki or codeweavers
- Emulation rows now hidden entirely for native games via a new `is.native` early-return in `AppleWikiInfo`
- Crossover row now renders the `CodeweaversLogo` SVG (24x24) instead of the generic `WineBar` icon; Wine row keeps `WineBar`
- Row labels reworded from "Crossover rating"/"Wine rating" to "Crossover emulation"/"Wine emulation" (both the i18n default fallback string and the `en/gamepage.json` value)
- `onClickWine` reworked to open AppleGamingWiki search (macOS) or WineHQ AppDB search (Linux) — no longer references codeweavers.com or `applegamingwiki.crossoverLink`; `onClickCrossover` left unchanged (still opens codeweavers.com)

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate AppleWikiInfo and correct the hasWikiInfo gate in index.tsx** - `cf24d908` (refactor)
2. **Task 2: Rework AppleWikiInfo rows (gate, CodeWeavers icon, wording, Wine link) + update i18n defaults** - `764a2672` (feat)
3. **Task 3: Typecheck and lint** - verification only, no code changes, no commit

**Plan metadata:** (to be added by orchestrator's docs commit)

## Files Created/Modified
- `src/frontend/screens/Game/GamePage/index.tsx` - Relocated `<AppleWikiInfo>` from the extra TabPanel to the info TabPanel; narrowed the `hasWikiInfo` boolean to drop the `applegamingwiki`/`codeweavers.rating` terms
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` - Added `is.native` early-return gate, swapped Crossover row icon to `CodeweaversLogo`, reworded both row labels, reworked `onClickWine` to branch on `is.mac` (AppleGamingWiki vs WineHQ AppDB)
- `public/locales/en/gamepage.json` - `info.crossover-rating` → "Crossover emulation", `info.wine-rating` → "Wine emulation" (keys unchanged)

## Decisions Made
None beyond the plan's locked decisions — all implemented exactly as specified (relocation target, gate expression, icon swap, wording, Wine-link branching, Crossover-link left untouched).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**`pnpm lint` (full repo run) fails on a pre-existing, unrelated file.** Running the aggregate `pnpm lint` command crashes while linting `spike/crossover-compat-lookup.mjs` (a throwaway spike script added by an earlier, unrelated quick task — 260710-nwb) with a typed-linting parserOptions error unrelated to any file this plan touched. Confirmed pre-existing and out of scope by linting the spike file in isolation (same crash, no relation to this plan's edits) and by linting this plan's two touched `.tsx` files directly — both come back with 0 errors (index.tsx carries 12 pre-existing warnings on unrelated lines; AppleWikiInfo.tsx is fully clean). `pnpm codecheck` (tsc --noEmit) passes with zero errors. Logged to `deferred-items.md` in this quick-task directory with a recommended follow-up (delete `spike/` per its own "delete once acted on" note, or extend the eslint flat config's `**/*.cjs` ignore pattern to also cover `spike/**`/`**/*.mjs`, mirroring quick task 260630-uod's fix for the same class of issue).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- No blockers. The relocated/reworked emulation rows are ready for runtime visual UAT (needs GUI, consistent with other recent quick tasks in this session).
- The pre-existing `pnpm lint` crash on `spike/crossover-compat-lookup.mjs` should be cleaned up in a separate follow-up task (delete the spike directory or fix the eslint config) — tracked in `deferred-items.md`, not blocking this task.

---
*Quick Task: 260710-qyc*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: src/frontend/screens/Game/GamePage/index.tsx
- FOUND: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
- FOUND: public/locales/en/gamepage.json
- FOUND: .planning/quick/260710-qyc-ui-cleanup-relocate-rework-the-crossover/260710-qyc-SUMMARY.md
- FOUND: commit cf24d908 (Task 1)
- FOUND: commit 764a2672 (Task 2)
