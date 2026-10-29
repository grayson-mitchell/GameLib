---
status: resolved
trigger: "Library cover art renders black after the recently-played row reorders, until a later re-render"
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/pending/2026-10-29-library-cover-art-black-after-recently-played-reorder.md
---

## Symptoms

- expected: When a game moves to the front of the 'recently played' row after a launch, its tile (and every tile that shifts) keeps showing its cover art.
- actual: The moved tiles render black, then recover by themselves on a later re-render — no reload or restart needed.
- errors: None. Sidecar log shows no artwork errors. No per-app art files exist for the affected appids in the GameLib data directory (art comes from remote URLs, not a local cache).
- timeline: Seen during the phase 56 live gate (56-26), 2026-10-29. Not known whether it ever worked; not DRM-specific.
- reproduction: Play any game (seen with Grim Dawn and Raft) so it moves to the front of 'recently played'; observe the moved tiles in the Library.

## Current Focus

hypothesis: CONFIRMED (code-level, not live): CachedImage reset loaded/fallback/useCache in a passive effect keyed on src; GamesList flips justPlayed at index 0, reusing the CachedImage instance with a new src, so the load event can fire before the effect sets loaded=false -> stuck opacity 0
next_action: none — resolved

## Evidence

## Eliminated

## Resolution

root_cause: see Current Focus; img.loading{opacity:0} stuck because loaded reset ran in effect after new-src load
fix: reset per-src state during render in CachedImage
files_changed: [src/frontend/components/UI/CachedImage/index.tsx]
verification: jest CachedImage, prettier, tsc pass; live check confirmed fixed by user 2026-10-29 (bbdd01b63)
