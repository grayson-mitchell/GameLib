---
phase: quick-260710-knr
plan: 01
subsystem: ui
tags: [react, fontawesome, i18n, gamepage]

requires: []
provides:
  - Platform icon rendering in InstalledInfo.tsx's Installed Platform row (getInstallPlatformIcon helper)
  - Visible faFolderOpen affordance on the Install Path row
  - info.openLocation i18n key in gamepage.json
affects: [game-details, install-info-panel]

tech-stack:
  added: []
  patterns:
    - "InstallPlatform -> icon mapping via case-insensitive substring matching (getInstallPlatformIcon), mirrors PlatformSupport.tsx's FontAwesome brand-icon usage"

key-files:
  created: []
  modified:
    - src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
    - public/locales/en/gamepage.json

key-decisions:
  - "Reused PlatformSupport.tsx's exact FontAwesome import identifiers (faApple, faLinux, faWindows, FontAwesomeIcon) for visual consistency"
  - "getInstallPlatformIcon returns null for unrecognized values so the row falls back to the pre-existing raw-text rendering (no behavior change for edge cases)"
  - "Folder-open icon is a visual affordance only -- no new onClick added; the row's existing openFolder handler is unchanged"

patterns-established:
  - "Icon-mapping helper pattern for InstallPlatform values scoped to module level in InstalledInfo.tsx"

requirements-completed: [QUICK-KNR]

duration: ~15min
completed: 2026-07-10
---

# Quick Task 260710-knr: Install Info Platform Icon + Folder-Open Affordance Summary

**Installed Platform row now renders a FontAwesome brand icon (Windows/Apple/Linux) matching PlatformSupport.tsx's style, and the Install Path row gets a visible faFolderOpen icon signaling the existing open-folder click behavior.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 code tasks completed (task 3 is a checkpoint:human-verify, recorded as pending UAT below)
- **Files modified:** 2

## Accomplishments
- Added `getInstallPlatformIcon()` helper in InstalledInfo.tsx mapping win/osx/mac/darwin/linux substrings (case-insensitive) to `{ icon, title }`, with `null` fallback to raw text for unrecognized platform values
- Installed Platform row now renders `<FontAwesomeIcon>` when a mapping exists; Browser early-return path is untouched
- Install Path row shows a `faFolderOpen` icon (with `t('info.openLocation', 'Open location')` tooltip) after the truncated path, inside the existing `clickable` div — no new click handler added
- Registered `info.openLocation: "Open location"` in `public/locales/en/gamepage.json`, alphabetically placed between `installedPlatform` and `path`

## Task Commits

Each task was committed atomically:

1. **Task 1: Platform icon + folder-open affordance in InstalledInfo.tsx** - `87ecfa1e` (feat)
2. **Task 2: i18n key** - `ac97f5d4` (docs)

_Task 3 (checkpoint:human-verify) is a manual visual-verification step — see "User Setup Required" / pending UAT below._

## Files Created/Modified
- `src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx` - Added platform-icon helper + FontAwesome imports; Installed Platform row renders an icon when the platform maps to Windows/macOS/Linux (raw text fallback otherwise); Install Path row gains a trailing `faFolderOpen` icon
- `public/locales/en/gamepage.json` - Added `info.openLocation` key

## Decisions Made
- Reused the exact import identifiers from `PlatformSupport.tsx` (`faApple`, `faLinux`, `faWindows`, `FontAwesomeIcon`) rather than introducing new icon conventions
- Kept the icon-mapping helper pure and null-returning for unmapped platforms (no assumptions about future platform strings)
- Left `index.css` unchanged — the existing `& > div > *` flex row + `gap: var(--space-md-fixed)` already places the icon at the row end without needing new spacing rules (per the plan's interface notes); no visual regression risk since this can't be confirmed without running the GUI (see pending UAT)

## Deviations from Plan

None - plan executed exactly as written. CSS spacing tweak in Task 2 was optional and conditioned on a visual check; since the runtime UAT is pending (see below), `index.css` was left unmodified as the plan explicitly permits ("If no spacing tweak is needed after visual check, leave index.css unchanged and drop it from the commit").

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

**Runtime UAT pending** (checkpoint:human-verify, Task 3 of the plan — cannot be executed by this agent, no GUI access):
1. Run the app (`yarn start` or existing dev command).
2. Open a game that is installed (ideally check one Windows, one Mac, and one Linux/native title if available).
3. In the Install Info panel, confirm the "Installed Platform" row now shows a platform icon (Windows/Apple/Linux) matching the "Supported platforms" row style — not raw text.
4. Confirm the "Install Path" row shows a folder-open icon to the right of the path; hovering shows the "Open location" tooltip.
5. Click the Install Path row (or the icon) and confirm the install folder opens.
6. Confirm a Browser-platform game (if available) still shows the platform as text.
7. If spacing/mapping issues are found, a follow-up quick task can adjust `index.css` or `getInstallPlatformIcon` without touching the rest of this change.

## Next Phase Readiness
- Code changes complete, committed, and verified via `pnpm codecheck` (tsc --noEmit, clean) and `pnpm eslint` (no new errors) and `pnpm exec prettier --check` (clean after auto-format)
- Awaiting human visual UAT per above before this quick task can be considered fully closed

---
*Phase: quick-260710-knr*
*Completed: 2026-07-10*
