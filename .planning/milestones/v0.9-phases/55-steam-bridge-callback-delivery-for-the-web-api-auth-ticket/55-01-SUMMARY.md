---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
plan: 01
subsystem: steam-bridge
tags: [steam-bridge, vtable-codegen, wire-policy, SteamUser023]
requires: []
provides:
  - "ISteamUser::GetAuthTicketForWebApi (SteamUser023 slot 14) forwarded over the wire to the helper"
affects: [55-03, 55-04, 55-05]
tech-stack:
  added: []
  patterns: ["in-string wire param, following 53-14 GetAuthSessionTicket precedent"]
key-files:
  modified:
    - meta/sdk/isteamuser.manifest.json
    - meta/sdk/wire-policy.json
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
key-decisions:
  - "Hand-edited manifest and policy; did not re-run extract-proton-inventory (network fetch, two-key edit)"
  - "No helperNativeArgs: native arity equals manifest arity"
requirements-completed: [P55-1, P55-8]
duration: 10min
completed: 2026-10-26
---

# Phase 55 Plan 01: Forward GetAuthTicketForWebApi Summary

SteamUser023 `GetAuthTicketForWebApi(pchIdentity)` is now a wire method with an in-string identity, so the shim forwards it to the helper's real Mac Steam instead of returning stub handle 0.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 RED: pin forward | b50c5253f | describe `55-01: GetAuthTicketForWebApi forward (P55-1)`, Tests A-D failed, E passed |
| 1+2 GREEN: manifest, policy, regenerated shim + dispatch | a775afb66 | gen-vtables run; second run produces no diff |

## Verification

- `-t GetAuthTicketForWebApi`: 5 passed.
- gen_vtables, buildSteamBridgeShims, protocol.test.ts: 288 passed.
- `pnpm gen-vtables` then `git diff --exit-code` over generated, meta/sdk and shimExports.generated.ts: clean (P55-8).
- Prettier clean on the 3 edited source paths and shimExports.generated.ts.
- Dispatch header has the `// SteamUser023.GetAuthTicketForWebApi` case; the shim function calls `bridge_transact`.

## Deviations from Plan

- Tasks 1 GREEN and 2 share one commit, as the plan itself directs.
- No existing test pinned the old stub body, so no pre-existing pin was changed.
- `steam_api.def`, `steam_api64.def` and `shimExports.generated.ts` did not change (no new exports), so they are not in the commit.
- Not run (by plan): `pnpm build-steam-bridge` (55-05) and the whole bridge-tree jest run (post-wave).

## Known Stubs

None. The returned HAuthTicket is real, but its bytes arrive via callback 168, whose delivery is plans 55-03/04/05.

## Self-Check: PASSED
