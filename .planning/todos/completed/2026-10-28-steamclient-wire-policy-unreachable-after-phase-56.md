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

## Resolution (2026-11-02)

Closed by quick task 261102-ht4, after Phase 56 passed verification (56-VERIFICATION `status: passed`). Commits `47224dc4f` (policy + regenerated output) and `e918ec4ab` (generator cleanup).

- **Policy restored.** `wire-policy.json` `SteamClient` is back to the `7ed535984` shape: `CreateSteamPipe` and `ConnectToGlobalUser` carry `helperFallback: 1`, nothing else. Manifests 017 and 014 are back to manifest-level `stub`.
- **Wider than the todo text.** The policy is family-keyed, so manifests 020 and 021 (ordinals 25, 26) lost their per-method wire and dead `#else` branches too.
- **Dead code gone.** The x86 `#else` wire branches are out of every `vt_SteamClient*` body, and the SteamClient cases are out of the generated `bridge_dispatch.h`. `bridge_helper.c` needed no edit: the helper's dispatch cases lived only in generated code. In `gen_vtables.ts` the wire-only paths are removed (`STEAM_CLIENT_OFF_PATH_VALUES`, `steamClientOffPathGate`, `emitSteamClientForwardedLookup`, the presence-return and FWD dispatch emission, `STEAM_CLIENT_APP_SCOPED_LOOKUPS`). `validateManifest` now refuses a SteamClient wire method that has neither `helperFallback` nor `shimLocal`.
- **Answers identical on x64.** A pre/post comparison of all 148 `vt_SteamClient014/017/020/021_*` functions matched: 97 lookups (resolve by exact version, else null object), 8 const-1, 16 const-0 and 27 void. The only delta is the STUBCALL note kind: OFFPATH became FALLBACK for CreateSteamPipe/ConnectToGlobalUser (8 functions) and STUB for the other 24. `GAMELIB_STUBCALL_KIND_OFFPATH 2` stays defined (KIND_NULL must stay 3), but nothing emits it any more.
- **Protocol.** Every remaining `BD_ORDINAL_*` value is unchanged, and `ordinals.json` still has SteamClient017 16 and SteamClient014 22. The four `BD_ORDINAL_SteamClient0xx` defines are no longer emitted, because they have no dispatch case. The dispatch call-id numbering shifted. `BRIDGE_SHIM_TABLE_HASH` and `BRIDGE_DISPATCH_TABLE_HASH` both moved `b83c888ed949` to `e0eae15e3690`, so the shim and helper ship as a rebuilt pair. `.def` files and `shimExports.generated.ts` are byte-identical.
- **Served map unchanged.** `SHIM64_SERVED_INTERFACE_VERSIONS` modes are deliberately untouched, to avoid a new `stubbed:SteamClient` bridge-limited notice. Only the stale Phase 52 comment was rewritten.
- **Verification.** Jest: gen_vtables, bridgeCensus, shimCoverage, helperIntegration, interfaceVersions, shimGenerate and drmTrace, 7 suites, 831 tests, all pass. `pnpm build-steam-bridge` passed for the host arm64 helper, with `GAMELIB_BRIDGE_TARGET_ARCH=x64`, then again for arm64.
