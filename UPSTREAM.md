# Upstream Tracking

GameLib is a fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)
that adds Steam as a first-class platform. This file records the relationship to
upstream so we can keep merging Heroic's improvements without losing track of
which version we are built on.

## Version model

Two versions are tracked separately:

| Version | Where | Meaning |
|---------|-------|---------|
| **GameLib version** | `package.json` → `version` | Our own release line (starts at `1.0.0`). |
| **Heroic base version** | `package.json` → `upstream.baseVersion` | The Heroic release this fork is currently built on. |

`package.json` → `upstream.baseCommit` pins the exact upstream commit of the last
sync (the merge-base of our `main` and `origin/main`).

## Merge frontier

The most recent upstream point merged into GameLib:

- **Upstream version:** 2.22.0
- **Upstream commit:** `b5b5cad3fa2e822602d320b70788d87240fc056e`
- **Commit date:** 2026-06-23
- **Synced:** 2026-06-30

Update this section (and the matching fields in `package.json` → `upstream`)
every time upstream is merged.

## Remotes

| Remote | Points at | Use |
|--------|-----------|-----|
| `origin` | `Heroic-Games-Launcher/HeroicGamesLauncher` | Read-only upstream — fetch to sync. |
| `gamelib` | `grayson-mitchell/GameLib` | Our fork — push here. |

## Tag namespacing

Upstream owns the `vX.Y.Z` tag namespace (the repo already carries Heroic's
`v1.0.0` … `v1.11.x`). To avoid collisions on `git fetch origin --tags`,
**GameLib releases are tagged `gamelib-vX.Y.Z`** (e.g. `gamelib-v1.0`). Never
create a bare `vX.Y.Z` tag in this fork.

## Syncing upstream

```bash
# 1. Fetch upstream
git fetch origin

# 2. Merge the target Heroic release into your branch
git merge origin/main          # resolve conflicts; for package.json's
                               # `version` field, keep GameLib's value

# 3. Record the new frontier
#    - package.json -> upstream.baseVersion / upstream.baseCommit
#    - the "Merge frontier" section above
#    Set baseCommit to: git rev-parse origin/main

# 4. Push to the fork
git push gamelib
```
