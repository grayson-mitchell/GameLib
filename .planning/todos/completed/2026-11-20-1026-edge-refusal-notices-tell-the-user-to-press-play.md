---
created: 2026-11-20T00:00:00.000Z
title: 'The 1026-edge refusal notices say "press Play", but Play is not available at that edge'
area: steam-adoption
severity: minor
platform: any
ready: code
files:
  - public/locales/en/gamelib.json
  - src/backend/storeManagers/steam/adoptionStatus.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
---

## Problem

Found by planning and executing quick 261120-88x (Phase 81 Gap 2, the GameLib 1026 waiting
edge). That fix makes "Restart Steam now" act at the edge with no pending record, and its refusals
reuse the existing D-05 notices: `steam.adoptRestart.gameRunning`, `quitTimeout` and `busy`
(`public/locales/en/gamelib.json`). Their copy tells the user to press Play. At the 1026 edge
(`steam-waiting-for-restart`) the main button is "Restart Steam to finish", not Play, and no game
is installed in Steam yet, so the instruction does not match what the page shows. The task was
told to add no new strings, so the copy was left as is. Not verified live: item 12 of
`81-HUMAN-UAT.md` has not run at the edge.

## Direction

Either give the 1026-edge refusals their own notice kinds and strings, or make the existing
strings neutral ("then press Restart Steam now again"). If strings change, put them in
`gamelib.json`, not `translation.json`, and follow the key-removal and `_one`/plural traps in
`removing-a-locale-key-has-three-traps` before deleting or renaming a key. Decide with live item
12, which can show the refusal at the edge.
