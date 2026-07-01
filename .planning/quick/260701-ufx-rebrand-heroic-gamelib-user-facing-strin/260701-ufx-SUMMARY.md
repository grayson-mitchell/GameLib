---
quick_id: 260701-ufx
slug: rebrand-heroic-gamelib-user-facing-strin
title: Rebrand Heroic→GameLib (user-facing + paths + protocol)
date: 2026-07-01
status: complete
---

# Quick Task 260701-ufx — Summary

Rebranded the user-visible identity Heroic→GameLib, migrated the config dir, and
renamed the deep-link protocol. Internal code identifiers (~300) left untouched
to preserve upstream mergeability (scope locked with user).

## Changes

### Config dir migration (`d271a474`, `constants/paths.ts`)
- `appFolder`: `<appData>/heroic` → `<appData>/GameLib`.
- One-time module-load migration: renames legacy `heroic` → `GameLib` when it
  exists and GameLib doesn't. Non-fatal; skipped under e2e.
- Left `~/Games/Heroic` (install/prefix root) — migrating it rewrites absolute
  paths inside wine prefixes/game configs.

### Protocol heroic:// → gamelib:// (`1408edc4`)
- Handler + OS registration (`main.ts`), URL parse (`protocol.ts`), tray launch,
  shortcut + non-Steam-shortcut producers, `electron-builder.yml` protocols
  block (drives the .deb's x-scheme-handler), settings label. Tests updated.

### User-facing strings (`1408edc4`, `main.ts`)
- "already running", fullscreen startup, snap warning title+body, cache-cleared.

## Verification (in this session)
- `npx tsc --noEmit` → 0 errors.
- `npx jest protocol + shortcuts + steam` → 5 suites, 152 tests pass.
- Window title was already "GameLib" (index.html) — no change needed.

## NOT verified here / follow-ups
- **E2E is unverified** — Electron can't run from this macOS session. Launch,
  config migration, and gamelib:// callbacks must be tested on the user's Linux
  box after a rebuild.
- Broad frontend/translation-file "Heroic" sweep (many `t()` strings, locale
  JSON) is a larger follow-up, deliberately out of this scope.
- Flatpak desktop file + app-id still Heroic-branded (separate flatpak task).
- This rebrand does NOT explain/fix the app being unresponsive on launch — that
  root cause is still undiagnosed (needs terminal output from a fresh launch).
