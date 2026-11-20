---
quick_id: 260630-ths
slug: decouple-fork-versioning-from-upstream-h
title: Decouple fork versioning from upstream Heroic
date: 2026-06-30
status: complete
---

# Quick Task 260630-ths — Summary

Decoupled GameLib's fork versioning from inherited Heroic versioning.

## What changed

1. **`package.json`** (`49c550a8`)
   - `version`: `2.22.0` → `1.0.0` (GameLib's own release line).
   - Added `upstream` object: `project`, `repository`, `baseVersion: 2.22.0`,
     `baseCommit: b5b5cad3…` — records the Heroic base this fork is built on.
   - Left `versionNames` codenames untouched (inherited; may be used by build).

2. **`UPSTREAM.md`** (new, `b95c6e67`)
   - Version model (GameLib vs Heroic base), merge frontier
     (2.22.0 @ `b5b5cad3`, 2026-06-23), remote topology, the `gamelib-*` tag
     namespacing rule, and the upstream sync procedure.

3. **Git tag rename** (local)
   - `v1.0` (annotated, "v1.0 Steam Platform") → `gamelib-v1.0` at the same
     commit `36130f9f`. Old `v1.0` deleted to clear the collision with Heroic's
     `vX.Y.Z` namespace.

## Verification
- `node -e` confirms `version=1.0.0`, `upstream.baseVersion=2.22.0`.
- `gamelib-v1.0` present at `36130f9f`; bare `v1.0` gone locally.

## Follow-up for the user (not done — needs your call)
The tag rename is **local only**. To publish it to the fork:
```bash
git push gamelib gamelib-v1.0      # push the new tag
git push gamelib :refs/tags/v1.0   # delete the old tag on the remote (if it was pushed)
```
