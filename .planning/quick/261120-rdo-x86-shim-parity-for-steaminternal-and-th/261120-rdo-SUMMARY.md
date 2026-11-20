---
phase: quick-261120-rdo
plan: 01
subsystem: steam-bridge
tags: [x86, shim, steaminternal, null-object, thiscall, wine-harness, census, D-53-09]
requires:
  - phase: 53
    provides: "x64 modern SteamInternal_* family, manifests, flat API (D-53-09 deferral of x86)"
provides:
  - "x86 steam_api.dll exports the nine modern lookup names"
  - "emitX86NullObjects: per-version, stackBytes-driven __thiscall null objects"
  - "x86 serves the interface versions Amnesia 57300 and Low Magic Age 576770 request"
  - "coverage-aware census line (countX86ModernOrFlatUnexported)"
affects: [steam-bridge, shimCoverage, bridge-census, 593280 flat tier]
tech-stack:
  added: []
  patterns:
    - "x86 null object per manifest version, arity from manifest stackBytes, fail closed"
    - "modern lookup bodies derived once and swapped x64_ -> x86_null_object_for_version"
key-files:
  created:
    - meta/__tests__/x86ModernLookupWineHarness.test.ts
    - meta/__tests__/fixtures/x86_modern_lookup_pe_harness.c
    - meta/sdk/isteamuser020.manifest.json
    - meta/sdk/isteamugc013.manifest.json
    - meta/sdk/isteamcontroller007.manifest.json
    - meta/sdk/isteaminput001.manifest.json
  modified:
    - meta/gen_vtables.ts
    - meta/bridgeCensus.ts
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/shimExports.generated.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api.def
    - native/steam-bridge/generated/bridge_dispatch.h
    - .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
key-decisions:
  - "Null objects are a fallback only, never rows of g_iface_table, so D-53-07's flat-lookup NULL contract and the served/skew semantics are untouched"
  - "A version GameLib has no manifest for answers NULL on x86 (no i386 arity data); that stays missing and blocking"
  - "Flat API (SteamAPI_ISteam*) for Cat Quest 593280 left out; the todo stays open, rescoped"
  - "SteamUser020 declared helperInterface SteamAPI_SteamUser_v023 in the acceptance entry (same as 016/021) so its wire identity methods dispatch"
patterns-established:
  - "x86 coverage eligibility is version-scoped (SHIM86_NULL_OBJECT_VERSIONS), x64 stays arch-wide"
requirements-completed: [TODO-2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred]
status: complete
commits: 3
plan_head_before: f41f5cd94425e5bd7ed1e0f850e17da36329bdf5
plan_head_after: 23987838e571c3b3744100929aa49877b057669d
actuals:
  tokens: 32000
  tasks: 3
  commits: 3
duration: ~25 min
completed: 2026-11-20
---

# Phase quick-261120-rdo Plan 01: x86 shim parity for the modern SteamInternal_* family Summary

**The x86 shim now exports the full modern `SteamInternal_*` lookup family, answers manifest-known unserved versions with arity-exact `__thiscall` null objects (proven under CrossOver Wine), and serves the versions Amnesia 57300 and Low Magic Age 576770 request, so the two titles' static imports load.**

## What was built

- **Task 1 (tracer), `d475531e7`.** The nine `MODERN_LOOKUP_FLAT_EXPORTS` names now ship on both arches (x86 `.def` gained exactly the 9, `steam_api64.def` byte-identical). The x86 block in `generateShimC` reuses the x64 bodies with `x86_null_object_for_version` swapped in (generation throws on any leftover `x64_`). `emitX86NullObjects` clones every non-x86 manifest into a forced-stub `X86Null_<interface>`, emits it through the existing `emitVtableStub` (stackBytes-driven dummies, real sret pointer zero-filled and returned, SteamClient lookup stubs kept) and fails closed on a stackBytes that is not a non-negative multiple of 4 or an sret below 4. A `g_x86_null_table` exact-strcmp lookup returns the clone or NULL. The SteamClient lookup stub gained an `#elif defined(__i386__)` arm.
- **Task 2, `a94108e3e`.** Widened SteamFriends017, SteamUtils010, SteamUtils009, STEAMUSERSTATS012 and STEAMAPPS008 to x86 (arches only). Extracted SteamUser020, STEAMUGC013, SteamController007 and SteamInput001 from Proton at the pinned SHA as x86-only manifests (ordinals 75-78). `generateShimExportsTs` emits `SHIM86_NULL_OBJECT_VERSIONS`. `shimCoverage.ts` mirrors the 12 new `.def` names, serves the 9 versions on x86, adds `x86NullObjectVersions` to the export-set version, and makes null-object eligibility version-aware (x86 only for a runtime-lookup, non-bare, manifest-known version). `bridgeCensus.ts` gained `countX86ModernOrFlatUnexported` and a second footer line; the need line is unchanged.
- **Task 3, `23987838e`.** Census run, todo rescoped to the flat tier and kept in `pending/` with `severity: medium`, `platform: any`, `ready: code`.

## Verification (all run)

- `pnpm gen-vtables` leaves no drift; `steam_api64.def` and the x64 `SHIM64_GENERATED_EXPORTS` are unchanged.
- `pnpm build-steam-bridge`: helper, x86 and x64 compile gates pass. objdump of the built x86 DLL: 9 of 9 modern names (HEAD 0) and 9 of 9 new accessors (HEAD 0).
- CrossOver Wine, `GAMELIB_REQUIRE_WINE_HARNESS=1`: the new harness prints PASS for all ten checks (`hsteam_handles`, `context_init_protocol`, `find_or_create_served`, `null_object_known_version`, `null_slot_esp_balanced` on a 28-byte slot, `null_sret_slot` on SteamInput006 GetMotionData, `esp_check_detects_mismatch`, `unknown_version_null`, `steaminternal_init_fails_closed`, `gameserver_init_v2_fails`). The existing x86 callback harness still passes (12/12, including its mutant).
- jest: gen_vtables, bridgeCensus, extractProtonInventory, shimAbiGate, wireExtendedCompile, buildSteamBridgeShims and the whole `bridge/__tests__` directory pass (34 suites, 1681 tests, after Task 2).
- `pnpm codecheck`, eslint on the touched TS and scoped `prettier --check` (after `--file-info` confirmed none ignored) are clean. The generated `.c`/`.def`/`.h` and the `.c` fixture have no prettier parser and were excluded.

## Census lines, verbatim (`pnpm bridge-census`, 2026-11-20)

```
x86 titles needing modern SteamInternal_* or flat API: 3 (57300, 576770, 593280)
x86 titles whose modern SteamInternal_* or flat API need the x86 shim does not export: 1 (593280)
```

```
| 57300 | Amnesia: The Dark Descent | Amnesia The Dark Descent | x86 | unknown-version | no | unverified (no HELLO) | SteamClient@ambiguous(SteamClient017,SteamClient020) |
| 576770 | Low Magic Age | LowMagicAge | x86 | unknown-version | no | unverified (no HELLO) | SteamClient@ambiguous(SteamClient017,SteamClient019) |
| 593280 | Cat Quest | Cat Quest | x86 | unknown-version | no | unverified (no HELLO) | SteamController@ambiguous(SteamController006,SteamController007); +351 unserved-family imports (lazy) |
```

57300 and 576770 stay `unknown-version` only because of the `SteamClient@ambiguous` version-resolution result (two SteamClient strings in the shipped dll), not coverage. A unit test proves coverage is complete once that ambiguity is set aside (zero missing symbols, zero blocking gaps for both).

## Flipped test pins (each encoded the x86 deferral)

| Test | Change | Reason |
| --- | --- | --- |
| `gen_vtables.test.ts` "lists SteamInternal_CreateInterface / GetHSteamUser / GetHSteamPipe on x64 but not on x86" | now asserts both arches | the family ships on x86 |
| `gen_vtables.test.ts` "x64 .def lists all five; x86 .def lists none" | now asserts both list all five | same |
| `gen_vtables.test.ts` D-53-11 "pre-V2 SteamInternal_GameServer_Init is x64-only" | x86 .def now lists it | same |
| `shimCoverage.test.ts` "modern-SDK lookup family is x64-only -- never present in the x86 steam_api.def" | now asserts present on x86 | same |
| `shimCoverage.test.ts` `isScanVerdictNowCovered` x86 miss `SteamInternal_CreateInterface` | false -> true | an old x86 miss is covered now |
| `shimCoverage.test.ts` Phase 53 "SteamInternal_GameServer_Init in SHIM_EXPORTED_SYMBOLS" | false -> true | same |
| `shimCoverage.test.ts` `findRunnerUnservedExports` Undertale | `SteamAPI_GetHSteamPipe` dropped from the expected list; `SteamAPI_InitSafe` stays | GetHSteamPipe/User are exported on x86 now |
| `shimGenerate.test.ts` Undertale withhold | missing symbols now exactly `['SteamAPI_InitSafe']` | same (the withhold still stands) |

Mechanical updates that did not weaken an assertion: `gen_vtables.test.ts` `flatMethod` fixture now gives class returns `stackBytes: 4` (the new fail-closed validation reaches these x64-only fixtures); the RequestCurrentStats regex excludes `X86Null_` bodies (they are STUB clones, not fallbacks); the STUBCALL site-count test adds one expected site per method of each non-x86 manifest; the `generateShimExportsTs` test splits at the second constant and pins `SHIM86_NULL_OBJECT_VERSIONS`; two `computeExportSetVersion` tests pass `x86NullObjectVersions` because the real export-set version now includes it.

## Pending human checks

None of these has been run. They are NOT passes. Prep: `pnpm build-steam-bridge`, then restart `pnpm tauri:dev` (never `tauri:dev:run`) so the sidecar picks up the new coverage tables and the changed export-set version re-flags placement. Launch each title from GameLib and judge it by the strict bridge-verified criterion: HELLO plus a clean game Steam-init log, or for a non-Unity title a game-originated bridge call (D-53-13). In-Game never counts.

- **57300 Amnesia: The Dark Descent** - expected to load past the old "entry point not found" error. Pending.
- **576770 Low Magic Age** - same expectation. Pending.
- **593280 Cat Quest** - baseline only, no change expected, because the flat tier is not built. Pending.

## Deviations from Plan

**1. [Rule 3 - Blocking] SteamUser020 needed `helperInterface`.** `generateDispatchHeader` refuses a manifest with dispatch-eligible wire methods and no `helperInterface`. Added `"helperInterface": "SteamAPI_SteamUser_v023"` to SteamUser020's acceptance entry (same accessor as SteamUser016/021) and re-extracted that one manifest. Commit `a94108e3e`.

**2. [Rule 1/3 - pins and fixtures] Additional deferral pins and fixtures updated** beyond the two the plan named (listed in the table above), including `shimGenerate.test.ts`, which is outside the plan's `files_modified`. Each was a direct consequence of the change, none was loosened.

**3. [Process] Concurrent session.** Another session (Phase 82 Plan 02) edited `meta/bridgeCensus.ts` and `meta/__tests__/bridgeCensus.test.ts` in the same tree and committed in between. I staged only my own paths, and `bridgeCensus.ts` held only my hunks by the time I committed it. As a result the git range `plan_head_before..plan_head_after` also contains three 82-02 commits, so `commits: 3` is counted from my own three commits (`d475531e7`, `a94108e3e`, `23987838e`), not from `rev-list`.

`actuals.tokens` is chars/4 over the hand-written diff (generated native files excluded), about 32k against the plan's 175k estimate.

## Issues Encountered

- `pnpm planning-gates` reports 11 of 12 passing. The failing gate is the `.planning/STATE.md` SDK field-anchor check (`field 'Progress': expected 1 match(es), found 0`). STATE.md is dirty from outside this task and was not touched here, so this is out of scope. `todo-frontmatter-gate.py` passes on the rescoped todo.
- Cat Quest's census row also shows `SteamController@ambiguous(SteamController006,SteamController007)`. That is a second version-resolution ambiguity, independent of this work, noted in the todo.

## Known Stubs

None added. The `X86Null_*` objects and the NULL answer for unmanifested versions are the designed fallback (D-51-13 precedent), reported as `stubbed` through STUBCALL kind `STUB`.

## Threat Flags

None. The new x86 export surface (version-string and context-block arguments from game code) is the surface modelled in T-rdo-01/02 and mitigated: NULL checks on every pointer argument, exact strcmp over a static table, fail-closed stackBytes validation, ESP-balance harness with a live mismatch control.

## Follow-up candidates (no todo files created)

1. SteamClient-ambiguity resolution for FindOrCreate-only titles: the shipped steam_api.dll's two SteamClient strings keep 57300 and 576770 at `unknown-version` in the census (and Cat Quest at `SteamController@ambiguous`). This is version resolution in `interfaceVersions.ts`, not coverage.
2. Undertale backlog 999.2: `SteamAPI_GetHSteamPipe` and `SteamAPI_GetHSteamUser` are exported on x86 now, but `SteamAPI_InitSafe` is not, so Undertale is still withheld.

## Self-Check: PASSED

Created files and commits `d475531e7`, `a94108e3e`, `23987838e` verified present; `pnpm gen-vtables` leaves no drift.
