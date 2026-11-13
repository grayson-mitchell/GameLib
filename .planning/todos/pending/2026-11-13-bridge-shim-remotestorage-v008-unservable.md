---
created: 2026-11-13T00:00:00.000Z
title: 'Bridge shim cannot serve STEAMREMOTESTORAGE_INTERFACE_VERSION008 (Dungeons of Dredmor launches with no Steam)'
area: steam
severity: medium
platform: macos
ready: code
source: '74-UAT item 18 (2026-11-13): launch via the Steam bridge bottle directly (shim withheld: coverage gaps STEAMREMOTESTORAGE_INTERFACE_VERSION008, no helper); pre-existing'
files:
  - native/steam-bridge
---

Dungeons of Dredmor (98800) reaches the menu but the shim is withheld because STEAMREMOTESTORAGE_INTERFACE_VERSION008 is not servable, so the launch is bridge-unverified and runs with no Steam. Not a Phase 74 defect. Add RemoteStorage v008 coverage.
