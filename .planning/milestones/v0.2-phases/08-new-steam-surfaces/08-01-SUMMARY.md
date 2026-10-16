---
phase: 08-new-steam-surfaces
plan: 01
subsystem: ui
tags: [steam, webview, sidebar, i18n, react, typescript]

# Dependency graph
requires:
  - phase: 07-game-details-enrichment
    provides: steam metadata including platform flags used by game details
provides:
  - Steam Store tab wired into WebView (validStoredUrl + urls map)
  - Steam Store sidebar sub-item (SidebarLinks Stores submenu)
  - steam-store i18n key in translation.json
affects: [08-02-console-mode, verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Steam store follows exact Epic/GOG/Amazon/Zoom WebView pattern (validStoredUrl case + urls map entry + steamStore constant)"
    - "Steam sidebar sub-item uses SidebarItem with no icon, no conditional guard (first-class store)"
    - "D-06: showLoginWarningFor type stays null|epic|gog|amazon|zoom — Steam has no in-app login flow"

key-files:
  created: []
  modified:
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
    - public/locales/en/translation.json

key-decisions:
  - "D-06 honored: showLoginWarningFor type unchanged (null | 'epic' | 'gog' | 'amazon' | 'zoom') — no steam branch added"
  - "D-07 honored: partition untouched — persist:\\${store} resolves to persist:steam automatically"
  - "D-09 honored: steamStore is plain 'https://store.steampowered.com/' with no lang/country interpolation"
  - "D-10 honored: validStoredUrl case 'steam' enables last-URL persistence via existing last-url-steam sessionStorage mechanism"
  - "Steam is always-rendered in sidebar (no enabled/username guard) matching first-class store pattern"

patterns-established:
  - "Adding a new store tab is a 3-point data-only change in WebView/index.tsx: one validStoredUrl case, one URL constant, one urls map entry"
  - "SidebarLinks store sub-items have no icon prop and no conditional guard for first-class stores"

requirements-completed: [STORE-01]

# Metrics
duration: 5min
completed: 2026-07-03
---

# Phase 8 Plan 01: Steam Store WebView Tab Summary

**Steam storefront wired into the existing WebView screen via three additive edits — validStoredUrl case, steamStore constant, urls map entry — plus a sidebar sub-item and steam-store i18n key, with no LoginWarning branch and no new route**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-03T11:04:39Z
- **Completed:** 2026-07-03T11:07:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Steam store tab wired into WebView: navigating to `/store/steam` loads `https://store.steampowered.com/` with last-URL persistence via `validStoredUrl('steam')` case and `persist:steam` partition (D-07 free)
- Steam Store sub-item added to Stores submenu in SidebarLinks, positioned after Amazon Luna and before Zoom (always rendered, no gate)
- `steam-store` i18n key added to translation.json alongside existing store-label siblings

## Task Commits

1. **Task 1: Wire the Steam storefront into the WebView** - `fe7d6fe3` (feat)
2. **Task 2: Add the Steam Store sidebar sub-item and its i18n key** - `e16bf361` (feat)

## Files Created/Modified
- `src/frontend/screens/WebView/index.tsx` - Added `case 'steam':` in validStoredUrl, `const steamStore` constant, and `/store/steam` entry in urls map
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` - Inserted SidebarItem for Steam Store after Amazon Luna, before Zoom conditional
- `public/locales/en/translation.json` - Added `"steam-store": "Steam Store"` flat key after `zoom-store`

## Decisions Made
- D-06 strictly honored: `showLoginWarningFor` state union remains `null | 'epic' | 'gog' | 'amazon' | 'zoom'` with no `'steam'` addition and no new useEffect branch — Steam has no in-app web login flow
- D-07 strictly honored: `partition` attribute untouched — `persist:${store}` already resolves to `persist:steam`, providing a durable web session for free
- D-09 strictly honored: `steamStore = 'https://store.steampowered.com/'` — plain URL, no `${lang}` interpolation unlike Epic's pattern

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — the Steam store tab is fully wired. The steamStore constant is a real URL, not a placeholder. No stub patterns present.

## Threat Flags

No new threat surface beyond what was documented in the plan's threat model (T-08-01, T-08-02). The `steamStore` constant is hard-coded, never user-derived (T-08-02 mitigated). No new network endpoints, auth paths, or schema changes introduced.

## Verification Gates

- `pnpm codecheck` (tsc --noEmit): PASS — exits 0, new `case 'steam':` and `steamStore` typecheck cleanly, union unchanged
- `node -e "JSON.parse(require('fs').readFileSync('public/locales/en/translation.json'))"`: PASS — valid JSON, `translation['steam-store'] === 'Steam Store'`
- Task automated checks: PASS (both task verify commands returned PASS)

## Next Phase Readiness

- Plan 08-01 (STORE-01) complete — Steam store tab functional
- Plan 08-02 (CONSOLE-01) is next: add Steam games to Console mode grid, filter chip, LaunchOverlay and InstallOverlay Steam branches
- Manual UAT (via `/gsd:verify-work`): open Stores submenu → Steam Store in position 4; click → `https://store.steampowered.com/` loads; navigate then return → last URL restored; no LoginWarning shown

## Self-Check: PASSED

- [x] `src/frontend/screens/WebView/index.tsx` modified — confirmed (fe7d6fe3)
- [x] `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` modified — confirmed (e16bf361)
- [x] `public/locales/en/translation.json` modified — confirmed (e16bf361)
- [x] `case 'steam':` in validStoredUrl — confirmed by grep PASS
- [x] `steamStore` constant — confirmed by grep PASS
- [x] `/store/steam` in urls map — confirmed by grep PASS
- [x] `showLoginWarningFor` type unchanged — confirmed by grep PASS
- [x] `steam-store` key in translation.json with value "Steam Store" — confirmed by node PASS
- [x] Both task commits exist: fe7d6fe3, e16bf361

---
*Phase: 08-new-steam-surfaces*
*Completed: 2026-07-03*
