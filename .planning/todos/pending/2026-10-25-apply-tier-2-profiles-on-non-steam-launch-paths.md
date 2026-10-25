---
created: 2026-10-25
title: "Apply tier-2 .profile.json fixes on non-Steam (Epic/GOG/Amazon) launch paths"
source: quick 261025-vnf
area: steam-launch
files:
  - src/backend/launcher.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
severity: minor
platform: any
ready: code
---

Decision 1 of `.planning/notes/per-game-compat-fixes-architecture.md` says tier-2 profiles apply
to every store. Today only the Steam bridge applies one (`registry` via `applySteamBridgeKnownFixes`).
`readKnownFixProfile` is already store-agnostic and reads `<appName>-<store>.profile.json`.

The work is not small: `validateRegistryFixes` and the `reg add` application live in the Steam
bridge module, and `prepareWineLaunch` only runs `installFixes` when the prefix was just created.
Lift registry validation/application out of the Steam module and call it from the Wine launch path
for legendary, gog, nile, zoom and sideload games.

Done-when: a `<appName>-gog.profile.json` `registry` entry is written to that game's prefix on
launch, with a test.
