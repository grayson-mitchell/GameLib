---
quick_id: 260630-ths
slug: decouple-fork-versioning-from-upstream-h
title: Decouple fork versioning from upstream Heroic
date: 2026-06-30
status: planned
---

# Quick Task 260630-ths: Decouple fork versioning from upstream Heroic

## Problem

GameLib is a fork of Heroic Games Launcher. Two version concepts are currently
conflated:

- `package.json` → `version: 2.22.0` — this is **Heroic's** inherited version.
- Release tag → `v1.0` — this is **GameLib's** own milestone.

Heroic owns the `vX.Y.Z` tag namespace (the repo already carries `v1.0.0`,
`v1.0.1`, … up to `v1.11.x`), so GameLib's `v1.0` tag risks collision on
`git fetch origin --tags`. And the product version string in the binary reports
Heroic's number, not GameLib's.

## Approach

Decouple the two: GameLib gets its own version in `package.json:version`, the
upstream base is recorded as explicit data, GameLib's release tag is moved to a
private `gamelib-*` namespace, and the merge frontier is documented.

Upstream base (confirmed): Heroic **2.22.0** at commit
`b5b5cad3fa2e822602d320b70788d87240fc056e` (2026-06-23) — the merge-base of
`HEAD` and `origin/main`.

## Tasks

### Task 1 — package.json: own version + upstream record
- **files:** `package.json`
- **action:** Set `version` to `1.0.0`. Add an `upstream` object recording
  Heroic as the base project, `baseVersion: 2.22.0`, and the base commit SHA.
- **verify:** `node -e "const p=require('./package.json'); console.log(p.version, p.upstream.baseVersion)"`
- **done:** prints `1.0.0 2.22.0`

### Task 2 — UPSTREAM.md: merge frontier doc
- **files:** `UPSTREAM.md` (new, repo root)
- **action:** Document fork relationship, last-merged upstream tag/commit/date,
  the tag-namespacing convention, and the sync procedure.
- **verify:** file exists and references `b5b5cad3` and `2.22.0`
- **done:** `UPSTREAM.md` present at repo root

### Task 3 — Rename release tag to gamelib namespace
- **files:** git tags (no working-tree change)
- **action:** Create annotated `gamelib-v1.0` at the same commit as `v1.0`
  (message "v1.0 Steam Platform"), then delete the old `v1.0` tag.
- **verify:** `git tag -l 'gamelib-v1.0'` non-empty AND `git tag -l 'v1.0'` empty
- **done:** `gamelib-v1.0` exists, `v1.0` gone (local). Remote push left to user.

## Out of scope
- Pushing the tag rename to the `gamelib` remote (user decides when).
- Changing `versionNames` codenames (Hajrudin/Caesar Clown) — inherited from
  upstream and may be referenced by build logic.
