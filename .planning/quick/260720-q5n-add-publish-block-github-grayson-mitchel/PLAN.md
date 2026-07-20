---
type: quick
slug: add-publish-block-github-grayson-mitchel
date: 2026-07-20
status: complete
---

# Quick Task: Repoint electron-updater feed to the GameLib fork

## Problem

Fresh Windows builds show a "There is a new Version available!" popup immediately
after install. Accepting it downloads Heroic's real 2.x installer and triggers a
Windows UAC prompt ("Heroic … wants to make changes to your computer").

**Root cause:** `electron-builder.yml` has no `publish` block, so electron-builder
derives the auto-update feed from `package.json`'s `repository` field, which still
points at upstream `Heroic-Games-Launcher/HeroicGamesLauncher`. On startup
`autoUpdater.checkForUpdates()` (src/backend/main.ts:285, src/backend/updater.ts)
polls Heroic's releases, sees Heroic 2.x > GameLib 0.7.0, and offers the update.

The in-app notifier (`getLatestReleases()` in src/backend/utils.ts) was already
stubbed to `return []` for this exact reason, but the electron-updater path was
never repointed.

## Change

Add a top-level `publish` block to `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: grayson-mitchell
  repo: GameLib
```

This makes electron-updater poll the fork's releases instead of Heroic's. The fork
has no release newer than 0.7.0, so the check finds nothing → no popup, no Heroic
installer download, no UAC branding prompt.

## Verification

- `publish` block present and valid YAML in electron-builder.yml.
- Full-file YAML parses (js-yaml) without error.
- No change to `package.json` repository (left as-is; publish block takes precedence
  for the update feed).

## Out of scope

- Setting up an actual GameLib release pipeline / publishing releases.
- Re-enabling the stubbed in-app `getLatestReleases()` notifier.
