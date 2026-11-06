---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 04
subsystem: steam-bridge
tags: [shim, x64, flat-api, steamworks-net, gen-vtables, sret]
requires:
  - phase: 53-01
    provides: "x64 manifests for the modern SDK interface versions"
  - phase: 53-02
    provides: "measured steamworksNetFlatNames.json fixture"
provides:
  - "x64 steam_api64.dll exports 512 generated SteamAPI_ISteam* flat names (x86 gains none)"
  - "emitFlatExports: per-version typed slot dispatch from self, sret out pointer, widened cross-version prototypes"
  - "flat ISteamClient_GetISteam* answers NULL on unknown versions and reports over CONTROL slot 4"
  - "LIFECYCLE_NOOP_EXPORTS: 55 Steamworks.NET lifecycle names as x64-only safe no-ops"
  - "shimExports.generated.ts: generated, committed x64 export list replacing the hand list"
affects: [53-05, 53-06, 53-07]
tech-stack:
  added: []
  patterns: ["flat export = self-identified version switch calling the proxy's own vtable slot", "generated export list committed beside the .def and pinned both ways"]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/shimExports.generated.ts
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/shimAbiGate.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api64.def
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
key-decisions:
  - "bool is spelled `bool` (stdbool.h now included) in flat prototypes and narrowed through uint8_t at widened positions; the slot is cast to return `int` for bool and the export converts with (bool)"
  - "A by-value struct param without a known mapping travels as uint64_t (one GPR either as value or as pointer on Win64)"
  - "The vtable is read from self only after self matched a known static instance (T-53-13); an unmatched or NULL self returns the zero"
patterns-established:
  - "emitFlatExports(manifests, unrepresentable) is the single source for both the shim C and the .def/TS export names"
requirements-completed: [D-53-01, D-53-02, D-53-05, D-53-06, D-53-07, D-53-08]
duration: 55min
completed: 2026-10-25
---

# Phase 53 Plan 04: Generated Steamworks flat C API Summary

The x64 shim now exports 512 `SteamAPI_ISteam*` flat names generated from the same manifests as the vtable proxies, plus 55 Steamworks.NET lifecycle no-ops. Every manifest'd version is dispatched with its own slot and its own parameter types.

## What was built

- `emitFlatExports` groups x64 manifest methods by `Family.FlatName`, derives overload names (`GetStatInt32`, `SetStatFloat`, `GetGlobalStatHistoryDouble`, ...), asserts the derived name equals `helperFlat` wherever one exists, and emits one export per name. The export compares `self` to each version's `g_<iface>_instance`, then casts `vt[slot]` to that version's own signature.
- sret methods (every `class` return) declare `uint64_t out = 0;`, call `(self, &out, args...)` and return `out`. A `class` return with `structSize > 8` throws.
- Flat `ISteamClient_GetISteam*` resolves the exact version string, otherwise reports it (`flat_report_unknown_version`, bounded to 128 bytes, at most 16 per process, CONTROL slot 4) and returns NULL. It never returns the null object. The vtable path keeps its null-object fallback.
- `generateShimExportsTs` writes `shimExports.generated.ts`; `SHIM64_EXPORTED_SYMBOLS` is now `new Set(SHIM64_GENERATED_EXPORTS)`.
- `SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck` is exported and answers false through the SteamUtils010 stub.

## Measurements

- **Flat names whose signatures differ across versions** (after 53-01's manifests), all GPR-only so none unrepresentable: `ISteamClient.SetLocalIPBinding`, `ISteamFriends.ActivateGameOverlayToWebPage`, `GetChatMemberByIndex`, `GetClanByIndex`, `GetClanOfficerByIndex`, `GetClanOwner`, `GetCoplayFriend`, `GetFriendByIndex`, `GetFriendFromSourceByIndex`, `ISteamGameServer.GetAuthSessionTicket`, `ISteamUser.GetAuthSessionTicket`, `ISteamNetworking.CreateConnectionSocket`, `CreateListenSocket`, `GetListenSocketInfo`, `GetSocketInfo`, `ISteamRemoteStorage.GetQuota` (16; the 7 measured before 53-01 plus 9 more, mostly SteamFriends). `GetISteamUnifiedMessages` is no longer differing because `DEPRECATED_` is stripped and it is a client lookup.
- **FLAT_UNREPRESENTABLE_CASES entries:** none (0 deviations).
- **Fixture coverage:** all fixture names of served families resolve; the 381 unexported fixture names all belong to the 19 unserved families (pinned in `shimCoverage.test.ts`, D-53-04).
- **SHIM_EXPORT_SET_VERSION:** `14737f10d3fc` before, `2fec49979bd2` after (stale persisted verdicts re-evaluate, D-51-07).
- **Export counts:** `steam_api64.def` 512 `SteamAPI_ISteam*` names (635 exports total); `steam_api.def` 0.
- **LIFECYCLE_NOOP_EXPORTS (55):** `SteamAPI_GetSteamInstallPath`, `SteamAPI_ManualDispatch_{FreeLastCallback,GetAPICallResult,GetNextCallback,Init,RunFrame}` (GetNextCallback and GetAPICallResult answer false), `SteamAPI_ReleaseCurrentThreadMemory`, `SteamAPI_SetBreakpadAppID`, `SteamAPI_SetMiniDumpComment`, `SteamAPI_SetTryCatchCallbacks`, `SteamAPI_UseBreakpadCrashHandler`, `SteamAPI_WriteMiniDump`, 13 `SteamAPI_SteamNetworkingIPAddr_*`, 27 `SteamAPI_SteamNetworkingIdentity_*`, `SteamAPI_SteamNetworkingMessage_t_Release`, `SteamGameServerClient`, `SteamGameServer_ReleaseCurrentThreadMemory`. None calls `bridge_transact`.
- **D-53-02 caveat:** the fixture is measured on the 5 installed Mono titles only; owned-but-uninstalled Unity titles (and IL2CPP titles) may import names it lacks.

## Commits

- a30557d66: flat emitter, lifecycle no-ops, generated export list (generator + tests)
- 6a196b229: regenerated shim/.def/export list, shimCoverage adoption, census tests, real-shim PE export gate
- f43af6e24: shimGenerate test example moved off `SteamAPI_ManualDispatch_Init`

## Verification

- `pnpm gen-vtables` idempotent (clean `git diff` over generated files and `shimExports.generated.ts`); `pnpm build-steam-bridge` passes all compile gates; objdump finds the three probe exports.
- gen_vtables (166), shimAbiGate (4, includes compiling the real x64 shim and checking every .def name in the PE), bridge suites (495), all `src/backend/storeManagers/steam` suites and fakeHomeIsolation pass. Prettier clean on all touched `.ts`.
- Pre-existing failures untouched: `pluralCategoriesFor` (3), `genI18nGateScope` A-17, `findDeadcode.cjs` CLI.

## Deviations from Plan

**1. [Rule 1 - Stale test] `shimGenerate.test.ts` used `SteamAPI_ManualDispatch_Init` as an uncovered symbol.**
- It is now a lifecycle no-op export, so the Manor Lords withheld-verdict test no longer missed it. Replaced with the still-unexported `SteamAPI_ISteamUGC_CreateItem` (commit f43af6e24).

**2. [Minor] Census test (b) pins the unexported fixture names as a sorted family-to-count record (19 families, 381 names) instead of 381 literal names.** Each unexported name is asserted to belong to an unserved family, which is the property the pin exists for.

**3. [Rule 3] `#include <stdbool.h>` added to the shim preamble** so flat prototypes and casts can use `bool` as the plan's narrowing form `(bool)(uint8_t)a1` requires.

## Deferred / observations (out of scope)

- `meta/sdk/isteamfriends.manifest.json` (SteamFriends018, pre-53 extraction) models sret as an explicit `_ret CSteamID*` param on top of `returnKind: class` and omits real params for several methods (e.g. `GetClanOwner`, `GetClanByIndex`), unlike 015/017. This is why those Friends names count as cross-version differences. All are stubs so behaviour is unaffected; the manifest should be re-extracted when Friends018 goes wire.
- 53-RESEARCH.md L181 still says "no RCX/RDX sret swap is needed"; the plan states a correction note should be there. It is not in this plan's files_modified, so it was not edited. This SUMMARY and the generator comments carry the correct rule.

## Known Stubs

None added. Lifecycle no-ops are intentional (D-53-06 as amended) and documented in `meta/gen_vtables.ts`.

## Threat Flags

None beyond the plan's register: T-53-13 (dispatch only on known `self`), T-53-14/15 (bounded version string, 16-report cap) and T-53-17 (sret out pointer, per-version casts, class > 8 refusal) are implemented and covered by tests.

## Self-Check: PASSED

All files listed under key-files exist; commits a30557d66, 6a196b229, f43af6e24 exist.
