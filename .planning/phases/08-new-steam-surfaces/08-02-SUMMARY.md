---
phase: 08-new-steam-surfaces
plan: 02
subsystem: ui
tags: [react, typescript, console-mode, steam, i18n, launch-overlay, install-overlay]

# Dependency graph
requires:
  - phase: 08-01
    provides: steam-store tab, steam-store i18n key, WebView wiring for steam
provides:
  - Steam games visible in Console-mode grid alongside Epic/GOG/Amazon/Zoom
  - Steam filter chip in Console top bar (enabled via storesWithGames.has('steam'))
  - LaunchOverlay fire-and-forget branch for Steam: 1500ms auto-dismiss, idle spinner, "Launched in Steam"
  - InstallOverlay handoff branch for Steam: minimal body, 1500ms auto-dismiss, no fields/buttons
  - console.steam.launched + console.steam.installing i18n keys
affects: [console-mode, launch-overlay, install-overlay, i18n]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useEffect cleanup variable pattern for conditional cleanup return (avoids TS7030 with noImplicitReturns)"
    - "runner-conditional useEffect with cleanup variable: let cleanup; if (runner==='steam') { ... cleanup = () => ... } else { ... } return cleanup"
    - "Fire-and-forget overlay: launch() + setTimeout(onDismiss, 1500) with cancelled-flag guard in InstallOverlay"

key-files:
  created: []
  modified:
    - src/frontend/screens/ConsoleMode/index.tsx
    - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
    - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
    - public/locales/en/translation.json

key-decisions:
  - "Steam launch useEffect uses cleanup variable (not direct return in if branch) to satisfy TS noImplicitReturns: let cleanup; if steam { ... cleanup = ... } return cleanup"
  - "No raw steam:// URL in frontend — both LaunchOverlay and InstallOverlay call runner-agnostic launch()/install() helpers that route to validated backend"
  - "Steam chip label is hardcoded 'Steam' (not wrapped in t()) matching existing Epic/GOG/ZOOM pattern"

patterns-established:
  - "useEffect with conditional cleanup: use a cleanup variable rather than multiple return statements to satisfy noImplicitReturns"
  - "Fire-and-forget overlay branch: fire helper(), setTimeout(onDismiss, 1500), return () => clearTimeout(timer) — reusable for any runner that never reports exit"

requirements-completed: [CONSOLE-01]

# Metrics
duration: 5min
completed: 2026-07-03
---

# Phase 08 Plan 02: New Steam Surfaces (Console Mode) Summary

**Steam games surface in Console mode with fire-and-forget launch/install overlays: 1500ms auto-dismiss, idle spinner, and honest "Launched in Steam" / "Opening Steam to install…" copy routed through validated backend helpers**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-03T11:10:21Z
- **Completed:** 2026-07-03T11:15:30Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Steam library now spreads into Console `allGames` useMemo alongside Epic/GOG/Amazon/Zoom; empty Steam library triggers background `refreshLibrary()` on mount
- Steam filter chip added to Console top bar after Amazon, before Other; enabled only when `storesWithGames.has('steam')` is true
- LaunchOverlay gains a Steam fire-and-forget branch: fires `launch()`, shows "Launched in Steam" with idle (success-green) spinner, auto-dismisses after 1500ms; non-Steam path unchanged
- InstallOverlay gains a Steam handoff branch: minimal modal body with only title + game title, fires `install()` helper, auto-dismisses after 1500ms; existing Escape dismiss and `console-modal-open` guard preserved
- Two `console.steam` i18n sub-keys added: `launched` ("Launched in Steam") and `installing` ("Opening Steam to install…")

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Steam to Console grid, refresh guard, and filter chip** - `a399cfe5` (feat)
2. **Task 2: Steam fire-and-forget branch in LaunchOverlay + console.steam i18n keys** - `bbd3e605` (feat)
3. **Task 3: Steam install handoff branch in InstallOverlay** - `0eaa9d96` (feat)
4. **Task 2 TypeScript fix (noImplicitReturns)** - `1f226878` (fix — auto-fixed deviation)

## Files Created/Modified
- `src/frontend/screens/ConsoleMode/index.tsx` - Added steam to context destructure, refresh guard, allGames spread + dep array, storeFilters chip
- `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx` - Steam fire-and-forget useEffect branch, idle spinner condition, label ternary, BackHint gate, useCancelOnHold active flag
- `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx` - Steam-only useEffect with install() handoff + 1500ms timer, JSX branch suppressing fields/buttons for Steam
- `public/locales/en/translation.json` - Added console.steam.{launched, installing} sub-object inside the console object

## Decisions Made

- Steam launch `useEffect` uses a `cleanup` variable (`let cleanup; if (steam) { ... cleanup = () => clearTimeout(timer) } return cleanup`) rather than direct `return` inside the `if` branch — avoids TS7030 (`noImplicitReturns: true` in tsconfig). See deviation below.
- No raw `steam://` URL constructed anywhere in the three frontend files. Both LaunchOverlay and InstallOverlay call runner-agnostic `launch()`/`install()` helpers that route to `steam/games.ts` → `buildSteamProtocolUrl` → `shell.openExternal`.
- Steam chip label is the hardcoded string `'Steam'` (not wrapped in `t()`), matching the existing `'Epic'`/`'GOG'`/`'ZOOM'` chip pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS7030 noImplicitReturns in LaunchOverlay Steam useEffect**
- **Found during:** Overall verification (pnpm codecheck after Task 3)
- **Issue:** The PATTERNS.md example used `return () => clearTimeout(timer)` inside an `if (game.runner === 'steam')` branch and let the `else` branch fall through. With `noImplicitReturns: true` in tsconfig, TypeScript emits TS7030: "Not all code paths return a value" because the function returns a cleanup function in one branch but implicitly returns undefined in the other.
- **Fix:** Replaced `if/else` with a `let cleanup` variable — in the Steam branch, `cleanup = () => clearTimeout(timer)`; the else branch assigns nothing. The function ends with `return cleanup`, so TypeScript sees a single explicit return in all paths.
- **Files modified:** `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx`
- **Verification:** `pnpm codecheck` exits 0
- **Committed in:** `1f226878` (separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix required for correctness (TypeScript compilation). Behavior is identical to the PATTERNS.md pattern — no scope creep.

## Issues Encountered

The Task 3 automated verify (`! grep -q "steam://"`) initially failed because the comment I added to the InstallOverlay `useEffect` contained the literal string `steam://` as documentation. The verify grep is source-level with no comment exclusion. Fixed by rewriting the comment to omit the protocol string while preserving its meaning. No behavior change.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CONSOLE-01 fully satisfied: Steam games appear in Console mode, can be launched (fire-and-forget) and install-handed-off (brief notice) from it
- Phase 8 complete: both STORE-01 (plan 08-01) and CONSOLE-01 (this plan) are done
- Phase 9 (Quality Gate / QA-01) can proceed

---
*Phase: 08-new-steam-surfaces*
*Completed: 2026-07-03*
