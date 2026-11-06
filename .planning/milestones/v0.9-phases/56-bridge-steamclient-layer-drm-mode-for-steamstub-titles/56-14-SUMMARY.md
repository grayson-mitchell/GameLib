---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 14
subsystem: steam-bridge
tags: [drm, removal, shim-generator, helper, protocol]
requires: [56-12, 56-13]
provides: [shim-side Phase 52 forwarder support removed]
affects: [56-15]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api64.def
    - src/backend/storeManagers/steam/bridge/shimExports.generated.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - src/backend/storeManagers/steam/bridge/peSections.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/bridgeKnownFixes.ts
    - .claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md
    - .claude/skills/spike-findings-gamelib/SKILL.md
decisions:
  - "D-20 done: x64 SteamClient stubs compile only the local answer; the wire body is x86-only"
  - "CONTROL slot 3 is retired, not renumbered; marked never-reuse in protocol.ts, bridge_helper.c and the generated preamble"
metrics:
  tasks: 3
  completed: 2026-10-28
---

# Phase 56 Plan 14: Shim-side forwarder support removal Summary

The generator, shim, helper and protocol no longer carry the Phase 52 SteamStub entry point (`GameLibBridge_CreateInterface`), its path flag or its control slot, and the stale `.bind` comments and lsteamclient skill guidance now describe Phase 56 DRM mode.

## Commits
- e35fb9d74 feat: generator removal, regenerated shim/.def/export table, D-20 tests
- bf759627f feat: helper and protocol slot 3 retired
- ce9b67c0c docs: stale `.bind` comments, bridgeKnownFixes reference, spike skill
- f41ea6964 test: retired-name pins built by concatenation so the absence grep is clean

## SHIM_EXPORT_SET_VERSION
- Before (measured at step 0, HEAD with 56-13 in): `0e9480d1f340` (matches the plan).
- After regeneration: `e5c8d97c6a2e`.
- Measured cost of D-20's "one forced rescan": **zero forced rescans.** The stamp is diagnostic only (IN-01). `isScanVerdictNowCovered` takes `{arch, missingSymbols}`, has no stamp input, and decides by per-arch membership. Tests: shimCoverage "stale-stamped scan verdict is judged by symbol membership alone" and "stale-stamped miss ... stays uncovered"; bridgeVerdict "still parses and keeps its stamp".

## Regenerated files
`pnpm gen-vtables` changed exactly: `steam_api_shim.c`, `steam_api64.def` (one line), `shimExports.generated.ts`. `steam_api.def` and `bridge_dispatch.h` did not change. A second run is byte-identical (deterministic).

## Behaviour
- x64 SteamClient017/014: 4 GetISteam* lookups per interface return the local proxy or per-version null object; the 8 non-lookup wire methods return `STEAM_CLIENT_OFF_PATH_VALUES` locally with the OFFPATH note. The x64 slice (`#if __x86_64__` to `#else`) contains no `bridge_transact(`. The wire body is compiled for x86 only. The WR-09 refusal for pointer/sret/string/out-buffer shapes is kept (test passes).
- Helper: slot 3 falls through to the unknown-slot STATUS_ERR with no FWD line, proven on the real compiled helper (helperIntegration, ran on darwin, not skipped). The SteamInternal_CreateInterface dlsym is gone. Other slot numbers are unchanged.
- helperIntegration unauthenticated-refusal table: the slot 3 row was **dropped** (slot 3 is now an unknown slot, refused the same way regardless of auth).
- Same-wave grep gate `grep -rnaE "GameLibBridge_CreateInterface|g_bridge_steamstub_path_active|CONTROL_SLOT_CREATE_INTERFACE|CONTROL_SLOT.createInterface" src meta native` ran **in full** (56-13 had already deleted `native/steam-bridge/steamclient/`): prints nothing.

## Deviations from Plan

### Auto-fixed Issues
**1. [Rule 3 - Blocking] gen_vtables.test.ts WR-03 HELLO-sender count**
- Removing GameLibBridge_CreateInterface removed one of the two explicit HELLO senders; the test asserting exactly 2 now asserts 1.
- Commit e35fb9d74.

**2. [Rule 3 - Scope] bridgeVerdict.test.ts edited**
- The stale-stamp schema-parse case needs `readBridgeVerdict` with the existing store mock, which lives in `bridgeVerdict.test.ts` (not in the plan's file list). Added one additive test there. Commit e35fb9d74.

**3. Test literals built by concatenation** (as 56-13 did) so the plan's own repo-wide absence grep finds only live code.

The peSections.test.ts and shimGenerate.test.ts both exist and passed. The log line "(informational, no routing change)" had no consumer in src or meta, so it was changed as planned.

## Verification
- jest: gen_vtables 272, shimCoverage 100, bridgeVerdict, protocol 41, helperIntegration + fakeHomeIsolation, shimGenerate, peSections all pass. A wider sweep of `meta/__tests__` and `steam/bridge` shows only the known failures (isIntelMacRemoved, machineFillGamelib pluralCategoriesFor, genI18nGateScope A-17, findDeadcode CLI).
- `pnpm codecheck` passes. `node meta/findDeadcode.cjs`: only the 3 known pre-existing findings. Scoped prettier and eslint clean.
- `pnpm build-steam-bridge`: helper plus x86 and x64 shim compile gates PASSED.
- `requirements.mark-complete`: REQUIREMENTS.md missing (known); not run.

## Follow-ups for the user
- **Quick task proposed:** commit `da0103f58` (52-01) declared SteamClient017/014 non-callback methods `wire` in `meta/sdk/wire-policy.json` / `isteamclient014/017.manifest.json`. After this plan their x64 stubs never call `bridge_transact`, and no x86 export hands out an ISteamClient (`steam_api.def`), so the remaining x86 `#else` wire branch (`emitSteamClientForwardedLookup` / `steamClientOffPathGate`) and the helper-side SteamClient dispatch cases in `bridge_dispatch.h` are unreachable from any game. Set them back to stub mode with the same local answers. `meta/sdk/*` was not this plan's to edit.
- **For 56-15:** the helper no longer answers slot 3, so a `FWD CreateInterface` line in a live log can only come from an old helper build.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
Commits e35fb9d74, bf759627f, ce9b67c0c, f41ea6964 exist; edited files present.
