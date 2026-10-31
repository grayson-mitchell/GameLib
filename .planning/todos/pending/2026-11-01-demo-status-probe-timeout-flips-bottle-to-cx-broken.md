---
created: 2026-11-01T00:00:00.000Z
title: "A single 15 s demo-status probe timeout flips the bridge bottle to cx-broken and switches it to the pinned engine"
area: steam-bridge
severity: medium
platform: macos
ready: code
source: debug session fullscreen-3440-dx11-crossover (2026-11-01); 58-32 flagged the same behaviour
files:
  - .planning/debug/fullscreen-3440-dx11-crossover.md
---

## Problem

One demo-status probe timing out at 15 s marks CrossOver as broken for the bottle (`reason=cx-broken`). GameLib then switches the bottle to the pinned Wine-Staging + DXVK engine and rewrites the engine-dependent `user.reg` entries (for example the Marlett/Symbol font paths). The 11:22 Schedule I launch on 2026-11-01 did exactly this.

A transient timeout should not demote the engine. The side effects are a changed renderer (D3DMetal to DXVK) and a mutated bottle, and they confounded the 58-37 windowed workaround.

## Suggested direction

Require repeated or corroborated failures before marking cx-broken, or make the demotion reversible. Do not mutate the bottle on a single timeout. Verify against the logic that sets `reason=cx-broken` in the bridge engine selection.
