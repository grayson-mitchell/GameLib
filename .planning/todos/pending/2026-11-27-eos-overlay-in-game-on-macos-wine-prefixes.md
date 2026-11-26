---
created: 2026-11-27T00:00:00.000Z
title: "The EOS overlay can be installed on macOS but never enabled for a game, so Epic games on CrossOver run without it"
area: launch
files:
  - src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts:311 (getWinePrefixFolder returns null outside Linux)
  - src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx:51 (the per-game enable is isWindows-gated)
  - .planning/phases/91-epic-legendary-runner/91-CONTEXT.md (D-07)
severity: minor
platform: macos
ready: human
---

## Problem

On macOS the Store Settings panel can install, update and remove the Epic Online Services overlay,
but nothing can enable it for a game. The per-game toggle is Windows-gated in the renderer, and the
backend's Wine-prefix lookup returns null on anything but Linux. An Epic game on CrossOver or the
Staging fallback therefore never gets the overlay. Phase 91 ports this as it is (91-CONTEXT D-07),
because enabling it on macOS is a new capability, not parity.

## Solution

Decide whether GameLib should support the in-game EOS overlay on macOS. If yes: resolve the game's
bottle or prefix on macOS, run `legendary eos-overlay enable --prefix` against it, show the per-game
toggle on darwin, and live-check an EOS title on CrossOver. Spike first: whether the overlay renders
under CrossOver's D3D-to-Metal path is not known.
