---
quick_id: 260701-ufx
slug: rebrand-heroic-gamelib-user-facing-strin
title: Rebrand Heroic→GameLib (user-facing + paths + protocol)
date: 2026-07-01
status: planned
---

# Quick Task 260701-ufx: Rebrand Heroic→GameLib

Scope (locked with user): user-facing strings + paths + protocol. Leave the
~300 internal code identifiers (getHeroicVersion, LogPrefix.Heroic, var/type
names) untouched to preserve upstream mergeability.

## Task 1 — Config dir rename + auto-migration (`constants/paths.ts`)
- `appFolder`: `<appData>/heroic` → `<appData>/GameLib`.
- Add one-time migration at module load: if `<appData>/heroic` exists and
  `<appData>/GameLib` doesn't, `renameSync` it over. Non-fatal on error.
- Update the e2e `mkdirSync(... 'heroic')` to `'GameLib'`.
- LEAVE `~/Games/Heroic` (heroicInstallPath / wine prefixes) — migrating game
  installs rewrites absolute paths baked into prefixes/configs; out of scope.

## Task 2 — Protocol heroic:// → gamelib://
- `main.ts`: `protocol.handle('heroic')`, `isDefaultProtocolClient('heroic')`,
  `setAsDefaultProtocolClient('heroic')` → `'gamelib'`.
- `protocol.ts`: `startsWith('heroic://')` → `'gamelib://'` (+ comments).
- `tray_icon.ts`: `heroic://launch?...` → `gamelib://launch?...`.
- `electron-builder.yml`: `protocols:` name/scheme heroic → gamelib (drives the
  .deb's x-scheme-handler registration).
- `flatpak/*.desktop`: MimeType `x-scheme-handler/heroic` → gamelib.
- Frontend `HideWindowOnProtocolLaunch.tsx`: user-facing string.
- Update `protocol.test.ts` fixtures to `gamelib://`.

## Task 3 — User-facing backend strings (`main.ts`)
- "Heroic is already running…", "Heroic started…", snap warning title/body,
  "Heroic Cache Was Cleared!" → GameLib. Leave internal identifiers.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx jest src/backend/__tests__/protocol` → green (updated to gamelib://)
- Note: window title already "GameLib" (index.html). Full frontend/translation
  string sweep is a larger follow-up, not this task.
- E2E (launch, config migration, gamelib:// callback) must be verified on Linux
  by the user — cannot run Electron from this macOS session.
