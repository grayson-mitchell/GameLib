---
created: 2026-10-28
title: "SteamClient017/014 'wire' policy is unreachable once Phase 56 removes the steamclient forwarder"
area: steam-bridge
severity: minor
platform: macos
ready: blocked
needs: phase-56-executed
source: "Phase 56 planning (56-14 planner finding, user ruling 2026-10-28: follow-up quick task, not Phase 56 scope)"
files:
  - meta/sdk/wire-policy.json
  - meta/gen_vtables.ts
  - native/steam-bridge/helper/bridge_helper.c
---

## Problem

Phase 52-01 set ISteamClient (SteamClient017/014) to `wire` mode, so the Phase 52 forwarder could
hand ISteamClient across the TCP bridge. Phase 56 removes that path in two plans:
- 56-13 removes the forwarder;
- 56-14 removes `GameLibBridge_CreateInterface` and control slot 3.

After both, no x86 export hands out an ISteamClient. These parts become dead code:
- the wire policy;
- its two manifests;
- the x86 `#else` branch 56-14 keeps in the generated SteamClient stubs;
- the helper's SteamClient dispatch cases.

## Direction

Once Phase 56 has executed, a quick task sets SteamClient017/014 back to stub mode in
`meta/sdk/wire-policy.json`, keeping the same local answers. Then:
- regenerate with `pnpm gen-vtables`;
- drop the helper's SteamClient dispatch cases;
- confirm `shimCoverage` and `helperIntegration` tests stay green.

This follows D-14's no-dormant-code rule. It was deferred out of Phase 56 to keep that phase's
scope fixed.
