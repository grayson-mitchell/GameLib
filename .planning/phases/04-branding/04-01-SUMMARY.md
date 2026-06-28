---
phase: 04-branding
plan: "01"
subsystem: branding
tags: [branding, rename, package-metadata, i18n, distribution]
dependency_graph:
  requires: []
  provides: [BRAND-01]
  affects: [package-identity, electron-builder, i18n-en, sidebar-version, about-page, clipboard-info]
tech_stack:
  added: []
  patterns: [APP_DISPLAY_NAME centralization, i18n value-only rename (key paths preserved)]
key_files:
  created:
    - scripts/verify-branding.cjs
  modified:
    - package.json
    - electron-builder.yml
    - public/locales/en/translation.json
    - src/backend/constants/others.ts
    - src/backend/utils/systeminfo/index.ts
    - src/frontend/components/UI/Sidebar/components/HeroicVersion/index.tsx
    - src/frontend/screens/Settings/sections/SystemInfo/software.tsx
decisions:
  - "APP_DISPLAY_NAME constant in others.ts centralizes backend display name (D-07 backend)"
  - "i18n VALUE-only rename: keys info.heroic.version and settings.systemInformation.heroicVersion unchanged (Pitfall 1 avoided)"
  - "author.email left as heroicgameslauncher@protonmail.com per D-04 (upstream maintainer contact, not user-visible)"
  - "Desktop entry Comment updated to Steam-inclusive description alongside Name rename"
  - "Smoke script uses regex for desktop Name check to avoid productName substring false-positive"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-28"
  tasks_completed: 3
  files_changed: 8
---

# Phase 4 Plan 01: GameLib Branding Rename Summary

**One-liner:** Targeted 7-location rename that makes GameLib identify as itself — not Heroic — in the sidebar, About page, system-info clipboard, and OS/distribution layer, via `APP_DISPLAY_NAME` centralization and i18n value-only edits.

## What Was Built

A reusable 12-check identity smoke script (`scripts/verify-branding.cjs`) proven RED before edits and GREEN after, plus a targeted metadata + display-string rename across 7 source/config locations that satisfies BRAND-01 without touching the ~82 unrelated "Heroic" references, the `heroic://` deep-link protocol, or the `appFolder` game-config path.

## Tasks

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Write failing GameLib identity smoke script (RED) | 6040f55 | Done |
| 2 | Apply targeted GameLib rename across metadata + display strings (GREEN) | ad6d86b | Done |
| 3 | Assert already-correct GameLib surfaces remain correct + no over-reach | (no new commit — checks already in Task 1 script, all pass) | Done |

## Verification Results

- `node scripts/verify-branding.cjs` — 12/12 PASS (GREEN)
- `npm run codecheck` (tsc --noEmit) — exit 0, no errors
- `git diff --name-only` across both commits — exactly 8 files in `files_modified`, zero over-reach

## Changes Made

### package.json
- `name`: `"heroic"` → `"gamelib"` (npm lowercase requirement)
- `author.name`: `"Heroic Games Launcher"` → `"GameLib"`
- `description`: added Steam to the launcher list

### electron-builder.yml
- `appId`: `com.heroicgameslauncher.hgl` → `com.gamelib.app`
- Linux desktop entry `Name`: `Heroic Games Launcher` → `GameLib`
- Linux desktop entry `Comment`: updated to Steam-inclusive description
- `productName: GameLib` left unchanged (already correct, D-02)
- `protocols:` block left unchanged (heroic:// deep-link, locked)

### public/locales/en/translation.json (English only)
- `info.heroic.version` VALUE: `"Heroic Version"` → `"GameLib Version"`
- `settings.systemInformation.heroicVersion` VALUE: `"Heroic: {{heroicVersion}}"` → `"GameLib: {{heroicVersion}}"`
- KEY paths unchanged (Pitfall 1 avoided)

### src/backend/constants/others.ts
- Added `export const APP_DISPLAY_NAME = 'GameLib'`

### src/backend/utils/systeminfo/index.ts
- Imported `APP_DISPLAY_NAME` from `backend/constants/others`
- Clipboard template literal: `Heroic: ${...}` → `${APP_DISPLAY_NAME}: ${...}`

### src/frontend/components/UI/Sidebar/components/HeroicVersion/index.tsx
- i18n fallback: `'Heroic Version'` → `'GameLib Version'` (key `info.heroic.version` unchanged)

### src/frontend/screens/Settings/sections/SystemInfo/software.tsx
- i18n fallback: `'Heroic: {{heroicVersion}}'` → `'GameLib: {{heroicVersion}}'` (key unchanged)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed false-positive in smoke script desktop Name check**
- **Found during:** Task 1 initial smoke run
- **Issue:** `builderYml.includes('Name: GameLib')` matched the substring in `productName: GameLib`, causing the Linux desktop entry check to pass even before the rename
- **Fix:** Changed check to `/^\s+Name: GameLib\s*$/m.test(builderYml)` — regex anchors to a proper indented line, not a substring
- **Files modified:** `scripts/verify-branding.cjs`
- **Commit:** 6040f55

### Task 3 Note

Task 3 required extending `scripts/verify-branding.cjs` with already-correct surface guards. These checks were written proactively in Task 1 (productName, applicationName, appFolder, protocols), so no additional file changes were needed. All 12 checks pass; no separate Task 3 commit was required.

## Locked Constraints Honored

| Constraint | Verification |
|-----------|-------------|
| `heroic://` protocol unchanged | `grep -q 'schemes:' electron-builder.yml && grep -q 'heroic' electron-builder.yml` ✓ |
| `appFolder = join(configFolder, 'heroic')` preserved | `grep -q "join(configFolder, 'heroic')" src/backend/constants/paths.ts` ✓ |
| No ~82-file sweep (D-04) | `git diff --name-only` shows exactly 8 files ✓ |
| i18n key paths unchanged | `info.heroic.version`, `settings.systemInformation.heroicVersion` keys untouched ✓ |
| `package.json` name lowercase | `"gamelib"` (npm requirement) ✓ |

## Known Stubs

None. All 8 display surfaces are fully wired to live data.

## Threat Flags

None. This plan introduces no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Pure display/metadata rename.

## Self-Check: PASSED

- `scripts/verify-branding.cjs` exists ✓
- `6040f55` commit exists ✓
- `ad6d86b` commit exists ✓
- All 12 smoke checks pass ✓
- TypeScript compiles cleanly ✓
- Exactly 8 files changed (no over-reach) ✓
