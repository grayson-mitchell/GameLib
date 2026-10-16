---
phase: 19-crossover-compatibility-index-macos
plan: 08
subsystem: ui
tags: [react, typescript, zustand, filters, crossover, macos]

# Dependency graph
requires:
  - phase: 19-06
    provides: "crossoverRatings zustand slice (GlobalStateV2), Record<string, number | null> keyed by app_name"
provides:
  - "macOS-only, multi-select, opt-out CrossOver-rating library filter (gold/silver/bronze/wontRun/unrated)"
  - "Non-blocking .infoBox advisory warning on the Steam CrossOver-bottle install path for knownnottowork (rating <=2) titles"
affects: [library-filters, install-modal, steam-macos-crossover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-select opt-out filter object (default all-true), mirrors PlatformsFilters -- NOT the tri-state FilterMode chain"
    - "Sibling advisory .infoBox render, structurally decoupled from Install button enablement (D-18)"

key-files:
  created: []
  modified:
    - src/frontend/types.ts
    - src/frontend/components/UI/LibraryFilters/index.tsx
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/LibraryContext.tsx
    - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
    - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx

key-decisions:
  - "CrossoverRatingFilters kept as its own multi-select boolean-object type (not FilterMode) per D-17 -- a rating filter is inherently multi-select, not tri-state off/show/only"
  - "WineSelector gained an optional runner?: Runner prop (default undefined) so the D-18 warning can distinguish the Steam CrossOver-bottle guided-setup path (SteamBottleSetup.tsx, the only caller that now passes runner=\"steam\") from the generic GOG/Epic/Amazon/sideload Wine installs that share this same component and must never show the warning"
  - "Warning gate uses showBottle (wineVersion?.type === 'crossover') as the CrossOver-bottle-path signal, combined with platform==='darwin' && runner==='steam' && a resolved numeric rating <=2 -- absent (never looked up) or null (unrated) ratings render nothing"

patterns-established:
  - "D-17 multi-select filter clause pattern: derive a tier from a raw number inline in the display useMemo, treat map-absence as 'no signal' (never filtered out), guard the whole clause on platform==='darwin'"

requirements-completed: [CXIDX-12, CXIDX-13]

# Metrics
duration: ~20min
completed: 2026-07-14
---

# Phase 19 Plan 08: CrossOver-Rating Filter & Install-Modal Warning Summary

**Adds the two user-facing consumers of the 19-06 CrossOver rating data: a macOS-only opt-out library filter over five rating tiers, and a non-blocking advisory warning on the Steam CrossOver-bottle install path for known-not-to-work titles.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-14
- **Tasks:** 2/2 completed
- **Files modified:** 6 (4 planned + 2 Rule-3 blocking fixes)

## Accomplishments

- macOS-only "CrossOver rating" filter section in the library Filters dropdown: five default-on checkboxes (gold/silver/bronze/wontRun/unrated), multi-select opt-out, absent on Windows/Linux, no sort control added anywhere (D-17).
- Non-blocking `.infoBox` advisory warning on the Steam CrossOver-bottle install path (the `SteamBottleSetup.tsx` guided wizard) for confirmed knownnottowork (rating <=2) titles -- reuses the already-imported `faWarning` icon, `var(--status-danger)` color token, and never touches the Install button's enablement (D-18).

## Task Commits

1. **Task 1: macOS-only CrossOver-rating filter (type + UI + application)** - `0ad104b2` (feat)
2. **Task 2: non-blocking knownnottowork install-modal warning** - `60a584b4` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/frontend/types.ts` - `CrossoverRatingFilters` interface (5 boolean keys, default true); `LibraryContextType` gains `crossoverRatingFilters`/`setCrossoverRatingFilters`
- `src/frontend/components/UI/LibraryFilters/index.tsx` - new macOS-gated "CrossOver rating" toggle section (5 `ToggleSwitch`es), `toggleCrossoverRatingFilter` helper, `resetFilters` extended to default-all-true
- `src/frontend/screens/Library/index.tsx` - `crossoverRatingFilters` persisted state (localStorage, mirrors `platformsFilters`), reads the `crossoverRatings` slice via `useGlobalState.keys`, new tier-derivation filter clause added to the display `useMemo` (macOS-gated, absent-app_name never filtered), context provider wiring
- `src/frontend/screens/Library/LibraryContext.tsx` - default context value extended with the two new fields (Rule 3: blocking typecheck fix, `LibraryContextType` now requires them)
- `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx` - reads `crossoverRatings[appName]`, renders the sibling `.infoBox` warning gated on `platform==='darwin' && runner==='steam' && showBottle && rating<=2`; added optional `runner?: Runner` prop
- `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` - passes `runner="steam"` at its `WineSelector` call site (Rule 3: the only caller on the actual Steam CrossOver-bottle path)

## Decisions Made

- **`runner?: Runner` prop added to `WineSelector` (Rule 3 auto-fix).** The plan's own D-18 gate (`is.mac && gameInfo.runner === 'steam' && crossoverRating <= 2`) requires distinguishing the Steam CrossOver-bottle guided-setup path from the generic GOG/Epic/Amazon/sideload Wine-install path that shares the same `WineSelector` component -- without this signal, the acceptance criteria ("renders when the install is a macOS CrossOver-bottle **Steam** install") could not be satisfied, since Steam installs never reach the generic `InstallModal` (bypassed by `openInstallGameModal`'s early `steam://install` return) and only ever reach `WineSelector` via `SteamBottleSetup.tsx`. Added as an optional, default-undefined prop (same low-risk shape as the existing `hideSharedPrefixToggle` prop from 17-17) and threaded through the single call site that needs it, leaving all four generic `InstallModal` call sites byte-for-byte unchanged.
- **`LibraryContext.tsx` default value extended (Rule 3 auto-fix).** Not in the plan's file list, but `tsc --noEmit` failed without it once `LibraryContextType` required the two new fields -- a blocking typecheck issue, fixed inline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `LibraryContext.tsx` default context value missing new required fields**
- **Found during:** Task 1 verification (`pnpm codecheck`)
- **Issue:** `LibraryContextType` in `types.ts` now requires `crossoverRatingFilters`/`setCrossoverRatingFilters`; the `initialContext` object in `LibraryContext.tsx` (not in the plan's file list) did not have them, failing `tsc --noEmit` with TS2739.
- **Fix:** Added `crossoverRatingFilters: { gold: true, silver: true, bronze: true, wontRun: true, unrated: true }` and `setCrossoverRatingFilters: () => null` to the default context value, mirroring the existing `platformsFilters`/`setPlatformsFilters` defaults.
- **Files modified:** `src/frontend/screens/Library/LibraryContext.tsx`
- **Verification:** `pnpm codecheck` passes (0 errors).
- **Committed in:** `0ad104b2` (part of Task 1 commit)

**2. [Rule 3 - Blocking issue] `WineSelector` had no signal to distinguish the Steam CrossOver-bottle path from generic Wine installs**
- **Found during:** Task 2 implementation
- **Issue:** The plan's D-18 gate explicitly requires `gameInfo.runner === 'steam'`, but `WineSelector`'s existing props (`appName`, `title`) carry no runner/game-source information, and this shared component is also rendered by the generic `InstallModal` for GOG/Epic/Amazon/sideload Wine installs (never Steam, which bypasses `InstallModal` entirely). Without a way to identify the Steam path, the acceptance criterion "warning renders when the install is a macOS CrossOver-bottle **Steam** install" was unsatisfiable.
- **Fix:** Added an optional `runner?: Runner` prop to `WineSelector` (default `undefined`, so all four existing `InstallModal` call sites are unchanged and never show the warning) and passed `runner="steam"` from `SteamBottleSetup.tsx`'s single call site -- the actual Steam-on-macOS CrossOver-bottle guided-setup surface (Phase 17).
- **Files modified:** `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx`, `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx`
- **Verification:** `pnpm codecheck` + `pnpm lint` (via direct `eslint` invocation to avoid an unrelated stray worktree config file under `.claude/worktrees/`) both pass with 0 errors; `grep -Ec "disabled=\{[^}]*crossoverRating"` returns 0 (Install button never gated).
- **Committed in:** `60a584b4` (part of Task 2 commit)

## Known Stubs

None -- both consumers are fully wired to the live 19-06 `crossoverRatings` slice; no hardcoded/empty data paths introduced.

## Threat Flags

None -- both surfaces are pure consumers of already-validated display data (the 19-08 threat model's own disposition), and the new `runner` prop carries no new trust boundary (it is sourced from the same in-memory `InstallGameModal`/`SteamBottleSetup` state that already gates Steam-specific install behavior elsewhere in the codebase).

## Self-Check: PASSED

- FOUND: src/frontend/types.ts (CrossoverRatingFilters present)
- FOUND: src/frontend/components/UI/LibraryFilters/index.tsx (crossover toggle section present)
- FOUND: src/frontend/screens/Library/index.tsx (crossoverRatings[ filter clause present)
- FOUND: src/frontend/screens/Library/LibraryContext.tsx (default context updated)
- FOUND: src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx (infoBox + crossoverRating present)
- FOUND: src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx (runner="steam" present)
- FOUND commit 0ad104b2 in git log
- FOUND commit 60a584b4 in git log
