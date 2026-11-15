---
created: 2026-11-16T00:00:00Z
title: 'Engine-notice dialogs (crossover-required-drm and siblings) have no button'
area: steam-bridge
severity: minor
platform: macos
ready: code
source: Phase 76 plan 76-02 UAT item 2 (pre-existing, not phase scope)
files: [src/backend/engine/engineDialogs.ts]
---

## Problem

The refusal dialog shown for `[engine-notice] tag=crossover-required-drm` ("This game uses Steam DRM support that needs CrossOver (CrossOver isn't working). Install or renew CrossOver, then try again.") has no button. Only the window close control dismisses it. Sibling engine dialogs raised through the same path likely share this.

## Candidate directions (none chosen)

- Give the dialog an explicit OK button where it is raised in engineDialogs.ts, and check every sibling tag.
