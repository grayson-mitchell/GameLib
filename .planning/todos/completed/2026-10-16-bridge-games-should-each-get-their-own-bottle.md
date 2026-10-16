---
created: 2026-10-16
title: "Bridge-routed Steam games should each get their own CrossOver bottle"
source: operator design question 2026-10-16 (CrossOver tweaking under one shared bottle)
area: steam
files:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
severity: medium
platform: macos
ready: code
---

Operator decision 2026-10-16: games routed through the Phase 24 native Steam bridge get one CrossOver
bottle per game, Proton-style, instead of all sharing `GameLibSteamBridge`.

The single shared bridge bottle was never an operator decision. Phase 24's D-03 (`24-CONTEXT.md:47`)
chose one shared long-lived helper PROCESS; `24-RESEARCH.md:453-457` and `24-04-PLAN.md:31` extended
that to the bottle under a "share as much as possible" philosophy that no D-number records. The operator
expected per-game bottles from Phase 24 on.

Why it is cheap now: a bridge bottle holds no Windows Steam client, so a new one costs no second
login and no Steam self-update. `provisionBridgeBottle` already skips the SteamSetup.exe step, and
the bottle primitives in `bottle.ts` already take a `bottleName` argument; nothing passes a per-game one.

Scope to settle in planning:
- naming (derive from appId, e.g. `GameLibSteamBridge-<appId>`) and where the appId to bottle mapping
  lives, if derivation alone is not enough;
- `isBridgeBottleReady()` / provisioning becomes per-game, at install time;
- `library.ts` `buildBridgeInstalledMap()` scans one bottle today and must scan all of them;
- uninstall removes the game's bottle;
- existing installs in the shared `GameLibSteamBridge` (Avernum 5/6): keep resolving them there, or
  migrate.

Reach is limited to allowlisted games (2 today) until the bridge is widened; see
[[2026-10-16-widen-the-native-steam-bridge-beyond-two-games]].
