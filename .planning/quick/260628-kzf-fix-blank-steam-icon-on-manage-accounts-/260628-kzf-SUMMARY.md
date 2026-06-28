---
phase: quick-260628-kzf
plan: "01"
subsystem: frontend/login
tags: [steam, ui, icon, login]
dependency_graph:
  requires: []
  provides: [steam-login-icon-fix]
  affects: [src/frontend/screens/Login/index.tsx]
tech_stack:
  added: []
  patterns: [inline-svg-logo-component]
key_files:
  modified:
    - src/frontend/screens/Login/index.tsx
decisions:
  - "Used existing SteamLogo SVG component (same pattern as EpicLogo/GOGLogo/AmazonLogo/ZoomLogo) rather than any FontAwesome icon"
metrics:
  duration: "< 5 minutes"
  completed_date: "2026-06-28"
---

# Phase quick-260628-kzf Plan 01: Fix Blank Steam Icon on Manage Accounts Summary

**One-liner:** Replaced FontAwesome faSteam icon with inline SteamLogo SVG on the /login page, matching the Epic/GOG/Amazon/Zoom runner pattern so the Steam tile renders visually correctly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace Steam FontAwesome icon with inline SteamLogo SVG | 9790746 | src/frontend/screens/Login/index.tsx |

## What Was Done

The Steam Runner on the Manage Accounts (/login) page was rendering a FontAwesome `faSteam` icon via `<FontAwesomeIcon icon={faSteam} />`. The Runner component's CSS applies `.runnerWrapper svg { fill: var(--body-background) }`, which causes the Steam logo to appear blank against the white tile background when using the FontAwesome icon format.

Every other store (Epic, GOG, Amazon, Zoom) uses an inline SVG React component imported via the `?react` Vite/webpack suffix. The fix:

1. Added `import SteamLogo from 'frontend/assets/steam-logo.svg?react'` alongside other logo imports
2. Changed Steam Runner icon prop from `icon={() => <FontAwesomeIcon icon={faSteam} />}` to `icon={() => <SteamLogo />}`
3. Removed now-unused `FontAwesomeIcon` and `faSteam` imports (were exclusively used by this one icon prop)

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `grep -q "import SteamLogo from 'frontend/assets/steam-logo.svg?react'"` — PASS
- `grep -q "icon={() => <SteamLogo />}"` — PASS
- `! grep -Eq "faSteam|FontAwesomeIcon"` — PASS
- TypeScript errors in `GlobalState.tsx` are pre-existing (unrelated to this change); no new type errors introduced by Login/index.tsx
- ESLint on Login/index.tsx shows only a pre-existing warning about `React.memo` usage (line 26, `import-x/no-named-as-default-member`) — no new errors

## Known Stubs

None.

## Threat Flags

None — this change only modifies an icon import/render, no new network endpoints, auth paths, or security-relevant surface.

## Self-Check: PASSED

- File exists: src/frontend/screens/Login/index.tsx ✓
- Commit 9790746 exists ✓
- All content checks passed ✓
