---
type: quick
slug: add-publish-block-github-grayson-mitchel
date: 2026-07-20
status: complete
commit: 2129b889
---

# Summary: Repoint electron-updater feed to the GameLib fork

## What changed

Added a top-level `publish` block to `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: grayson-mitchell
  repo: GameLib
```

## Why

`electron-builder.yml` had no `publish` block, so electron-builder derived the
electron-updater feed from `package.json`'s `repository` field
(`Heroic-Games-Launcher/HeroicGamesLauncher`). On startup,
`autoUpdater.checkForUpdates()` (src/backend/main.ts:285, src/backend/updater.ts:59)
polled Heroic's releases, saw Heroic 2.x > GameLib 0.7.0, and fired the
"There is a new Version available!" dialog. Accepting it downloaded Heroic's real
installer → Windows UAC prompt "Heroic … wants to make changes to your computer".

The fork now polls its own releases. Since the fork has no release newer than
0.7.0, the check finds nothing → no popup, no Heroic-installer download, no UAC
branding prompt.

## Verification

- `js-yaml` parses the full file without error.
- `publish` resolves to `{provider: github, owner: grayson-mitchell, repo: GameLib}`.
- `win.target` unchanged (`["nsis"]`).

## Notes / follow-ups

- `package.json` `repository` left pointing at Heroic upstream (unchanged) — the
  `publish` block takes precedence for the update feed, and the repository field is
  still meaningful as the upstream-fork lineage. Change it later only if desired.
- This does not set up an actual GameLib release pipeline; it only stops the bogus
  upstream update prompt. If/when GameLib publishes real releases, the feed is
  already pointed at the right repo.
- The in-app notifier `getLatestReleases()` (src/backend/utils.ts) remains stubbed
  to `return []` — a separate, already-handled path. Left as-is.

## Commit

`2129b889 fix(updater): repoint auto-update feed to GameLib fork`
