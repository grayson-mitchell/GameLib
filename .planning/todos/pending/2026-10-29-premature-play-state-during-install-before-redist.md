---
created: 2026-10-29
title: "Card flashes a Play-now state during a native install, before the redistributables step runs"
area: steam-bridge
severity: minor
platform: macos
ready: live-gate
source: "phase 56 live gate (56-34), launch 0 reinstall, 2026-10-29"
---

## Problem

While reinstalling Grim Dawn through the bridge (56-34 launch 0) the card went: installing, processing files, `[play now]` for a few seconds, installing redistributables, then Play enabled. The final state was correct (G3 passed), but the transient Play state appears before the redistributables step has run. The operator did not click Play during the flash, so whether a click in that window launches the game before the redists are settled is untested. In the log the manifest is written and install polling flips the badge to installed (`Steam: install polling complete ... badge flipped to installed`) before the redist step finishes, which is the likely source.

## Next

Reproduce with a native install of a DRM title and click Play during the flash to see what happens. If it launches, hold the installed/Play state until the redist step reports done (or disable Play while redists are pending).
