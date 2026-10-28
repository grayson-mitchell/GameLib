---
created: 2026-10-29
title: "Library cover art renders black after the recently-played row reorders, until a later re-render"
area: library
severity: minor
platform: any
ready: code
source: "phase 56 live gate (56-26), 2026-10-29"
---

## Problem

Repro: play a game so it moves to the front of 'recently played'; the moved tiles render black until a later re-render, then recover by themselves with no reload or restart. Seen for Grim Dawn and Raft after launches; not DRM-specific. A read-only check found no artwork errors in the sidecar log and no per-app art files for those appids in the GameLib data directory.

## Next

Reproduce with any game; check the tile key/ref handling when the recently-played row reorders.
