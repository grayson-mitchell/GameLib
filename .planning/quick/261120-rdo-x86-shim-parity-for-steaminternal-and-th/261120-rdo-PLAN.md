---
phase: quick-261120-rdo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/x86ModernLookupWineHarness.test.ts
  - meta/__tests__/fixtures/x86_modern_lookup_pe_harness.c
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/bridge_dispatch.h
  - src/backend/storeManagers/steam/bridge/shimExports.generated.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
  - meta/sdk/acceptance-interface-versions.json
  - meta/sdk/ordinals.json
  - meta/sdk/isteamfriends017.manifest.json
  - meta/sdk/isteamutils010.manifest.json
  - meta/sdk/isteamutils009.manifest.json
  - meta/sdk/isteamuserstats012.manifest.json
  - meta/sdk/isteamapps008.manifest.json
  - meta/sdk/isteamuser020.manifest.json
  - meta/sdk/isteamugc013.manifest.json
  - meta/sdk/isteamcontroller007.manifest.json
  - meta/sdk/isteaminput001.manifest.json
  - meta/bridgeCensus.ts
  - meta/__tests__/bridgeCensus.test.ts
  - .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
autonomous: true
requirements:
  - TODO-2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred

estimate:
  tokens: 175000
  raw_tokens: 175000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Per D-53-09, the x86 steam_api.dll built by `pnpm build-steam-bridge` exports all nine MODERN_LOOKUP_FLAT_EXPORTS names: SteamInternal_CreateInterface, SteamAPI_GetHSteamUser, SteamAPI_GetHSteamPipe, SteamInternal_SteamAPI_Init, SteamInternal_ContextInit, SteamInternal_FindOrCreateUserInterface, SteamInternal_FindOrCreateGameServerInterface, SteamInternal_GameServer_Init_V2, SteamInternal_GameServer_Init"
    - "On x86, SteamInternal_CreateInterface and SteamInternal_FindOrCreate*Interface return the served proxy for an x86-served version. For a version that has a GameLib manifest but no x86 proxy, they return a null object whose every slot pops exactly that slot's manifest stackBytes (__thiscall callee-cleans), proven under CrossOver Wine. For a version GameLib has no manifest for, they return NULL"
    - "SteamInternal_ContextInit on x86 implements the SDK callback-and-counter protocol: pFn runs once per counter change, and it returns the address 8 bytes past the data pointer"
    - "With the SteamClient ambiguity excluded, every interface version that Amnesia 57300 and Low Magic Age 576770 resolve is either served or null-object answered on x86. evaluateShimCoverage reports no missing symbols for their measured static imports and version pools, and classifyUnservableInterfaceVersions reports no blocking gap, so placement does not withhold their shim"
    - "The x64 export table is unchanged: native/steam-bridge/generated/steam_api64.def has no diff and SHIM64_GENERATED_EXPORTS is unchanged"
    - "`pnpm bridge-census` still prints its existing need line and adds a coverage-aware line. 57300 and 576770 drop out of the not-exported count; 593280 (Cat Quest, flat tier left out) stays in it"
    - "The todo records the 2026-11-20 measurement, stays in pending/ rescoped to the flat-API remainder, and keeps valid severity/platform/ready keys, so `pnpm planning-gates` passes"
    - "The strict bridge-verified criterion is untouched: the live launches of 57300, 576770 and 593280 are listed in the SUMMARY as pending human checks and never as passes"
  artifacts:
    - path: "meta/gen_vtables.ts"
      provides: "x86 modern lookup block, emitX86NullObjects, x86_null_object_for_version, modern names on the x86 .def, SHIM86_NULL_OBJECT_VERSIONS emission"
      contains: "x86_null_object_for_version"
    - path: "native/steam-bridge/generated/steam_api.def"
      provides: "x86 export table carrying the nine modern names and the new x86 accessors"
      contains: "SteamInternal_FindOrCreateUserInterface"
    - path: "meta/__tests__/x86ModernLookupWineHarness.test.ts"
      provides: "runtime proof under CrossOver Wine of ContextInit, served/null/unknown lookup and null-slot ESP balance on the real x86 shim"
    - path: "src/backend/storeManagers/steam/bridge/shimCoverage.ts"
      provides: "x86 export set, x86 served map, version-scoped x86 null-object eligibility"
      contains: "SHIM86_NULL_OBJECT_VERSIONS"
    - path: "meta/bridgeCensus.ts"
      provides: "coverage-aware x86 footer line"
      contains: "countX86ModernOrFlatUnexported"
  key_links:
    - from: "meta/gen_vtables.ts"
      to: "native/steam-bridge/generated/steam_api_shim.c"
      via: "generateShimC emits the `#if defined(__i386__)` modern lookup block and emitX86NullObjects output"
      pattern: "x86_null_object_for_version"
    - from: "meta/gen_vtables.ts"
      to: "src/backend/storeManagers/steam/bridge/shimExports.generated.ts"
      via: "generateShimExportsTs writes SHIM86_NULL_OBJECT_VERSIONS"
      pattern: "SHIM86_NULL_OBJECT_VERSIONS"
    - from: "src/backend/storeManagers/steam/bridge/shimCoverage.ts"
      to: "src/backend/storeManagers/steam/bridge/shimExports.generated.ts"
      via: "import of SHIM86_NULL_OBJECT_VERSIONS into isNullObjectEligible / evaluateShimCoverageWith"
      pattern: "SHIM86_NULL_OBJECT_VERSIONS"
    - from: "meta/bridgeCensus.ts"
      to: "src/backend/storeManagers/steam/bridge/shimCoverage.ts"
      via: "evaluateShimCoverage (live sets) and SHIM_EXPORTED_SYMBOLS in countX86ModernOrFlatUnexported"
      pattern: "countX86ModernOrFlatUnexported"
---

<objective>
Implement todo D-53-09's tier 1 on the x86 bridge shim: export the modern SteamInternal_* lookup family, give it an arity-safe x86 fallback object, and serve on x86 the interface versions that Amnesia: The Dark Descent (57300) and Low Magic Age (576770) request. Then make the coverage model and the census count those symbols as covered.

Purpose: the todo's unblock trigger fired on 2026-11-20. `pnpm bridge-census` printed `x86 titles needing modern SteamInternal_* or flat API: 3 (57300, 576770, 593280)`, where on 2026-10-25 it printed 0. Today the x86 shim lacks SteamInternal_ContextInit and SteamInternal_FindOrCreateUserInterface, so the static imports of 57300 and 576770 fail at load with "entry point not found".

Output: regenerated x86 shim source and .def, an i686 build whose export table carries the new names, a CrossOver Wine harness that proves the x86 ABI at runtime, x86 coverage tables, a coverage-aware census line, and the todo rescoped to what is left.

**Left out on purpose: the x86 flat API (`SteamAPI_ISteam*`) for Cat Quest 593280.** The orchestrator pre-authorized this split. A partial flat tier would buy nothing, for this reason. Cat Quest's Steamworks.NET (SteamClient020 / SteamUser020 / ManualDispatch vintage) runs CSteamAPIContext.Init, which fails if any one of its roughly 25 flat `SteamAPI_ISteamClient_GetISteam*` lookups answers NULL. That NULL-answer behaviour is D-53-07's flat-lookup contract, and 53-12 had to serve the whole Init set on x64 for exactly this reason. Making Cat Quest init on x86 therefore needs three things: (a) emitFlatExports per arch, with THISCALL slot casts; (b) about 14 more manifests widened to x86 and 2 or more new manifests extracted (STEAMREMOTESTORAGE014, STEAMUGC014); and (c) a generated, not hand-pinned, x86 export list of roughly 900 names, with a possible port of x64-only subsystems (ManualDispatch gl_md_*, GL_NET, the gl_mms relay). That is Phase 53's 53-04 plus 53-12 work again, more than half a fresh agent's context on top of tier 1. Initializing only the "core" accessors would still fail Init at the first unserved lookup (SteamMatchGameSearch001), so Cat Quest would see no change. Task 3 writes this remainder into the todo, which stays open.

**Census caveat, stated up front.** The census rows for 57300 and 576770 will still read `unknown-version`. That class comes from `SteamClient@ambiguous(...)`: the shipped steam_api.dll's own strings carry two SteamClient versions, which puts the SteamClient family in the runtime-lookup version pool. That is version resolution in `interfaceVersions.ts`, not coverage, and this plan does not change it. Task 2 proves in a unit test that, with that one ambiguity set aside, coverage is complete. The ambiguity is a follow-up candidate for the SUMMARY.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
@.planning/milestones/v0.10-quick/261024-i94-modern-sdk-steaminternal-exports-in-the-/261024-i94-SUMMARY.md

Project skill to load before writing any verify block or todo edit: `Skill("gamelib-conventions")`. It covers the todo triage keys, fake-HOME spawns and the scoped prettier check. Bridge background is in `Skill("spike-findings-gamelib")` (references/macos-steam-bridge.md): the MSVC `__thiscall` vtable mechanism is proven, and the cross-compile is `zig cc -target x86-windows-gnu`.

**The test runner is jest, not vitest.** `package.json` "test": "jest". The meta tests run in the `Meta` jest project (meta/jest.config.js).

## Codebase map (measured 2026-11-20 against HEAD 8ba2ba40a; read these ranges, not whole files)

**meta/gen_vtables.ts (8753 lines), the generator. `pnpm gen-vtables` writes native/steam-bridge/generated/{steam_api_shim.c, steam_api.def, steam_api64.def, bridge_dispatch.h} and src/backend/storeManagers/steam/bridge/shimExports.generated.ts. Never hand-edit those outputs.**
- About L4775-4900: `MODERN_LOOKUP_FLAT_EXPORTS` (the 9 names) and `MODERN_LOOKUP_FLAT_EXPORT_BODIES`. Each body is a cdecl C string. The unknown-version branches call `x64_null_object_for_version`. SteamInternal_SteamAPI_Init and SteamInternal_ContextInit use `g_gamelib_context_counter`. gamelib_bridge_hello, gamelib_report_init and gamelib_stubcall_note are NOT arch-guarded in the generated C (lines 516/525/555), so they exist on x86.
- About L5095-5245: `emitStubBody`. A stub slot's C signature comes ENTIRELY from `method.stackBytes`: a `uint32_t dummyN` per 4 bytes, plus a real `void *sretOut` for class returns, which is memset to `structSize` and returned. THIS is the x86 arity-safe mechanism; the comment at about L5248 says so.
- About L5534-5590: `isSteamClientVersionLookupMethod` / `emitSteamClientVersionLookupStub`. Its unknown branch is `#if defined(__x86_64__) return x64_null_object_for_version(...) #else return NULL #endif`.
- About L5793-5930: `emitVtableStub` / `emitVtableStubBody`. The order is shimLocal, then the SteamClient lookup, then helperFallback, then `mode === 'stub'` (emitStubBody), then wire. Function names are `vt_<interface>_<method>`.
- About L6052: `emitVtableArray` gives `g_<iface lowercase>_vtbl`, `struct Fake<iface>` and `g_<iface lowercase>_instance`.
- About L5067: `stubCallSite` requires `/^[A-Za-z0-9_]+$/` for interface and method names.
- About L6536: `emitFlatExports` (x64 only; NOT touched by this plan). About L6664: `generateShimExportsTs`.
- About L7262-7290: the preamble's `#if defined(__x86_64__)` null-object block and the forward declaration `static void *resolve_iface_by_exact_version(const char *version);`, which ends the `header` template.
- About L7295-7400: `generateShimC` assembly. `vtableSections` are guarded per manifest by `archGuard(m.arches)`. `modernLookupExports` is its own `#if defined(__x86_64__)` block; a 51-15 test pins the literal `#if defined(__x86_64__)\nvoid *SteamInternal_CreateInterface`, so keep it byte-identical. The return string is `${header}${vtableSections}...`.
- About L8603-8660: `generateDefFile` / `defExportNames`. The `x64Only` array holds MODERN_LOOKUP_FLAT_EXPORTS, the flat names, LIFECYCLE_NOOP_EXPORTS, NETWORKING_UTILS_FLAT_INLINE_NAMES and LEGACY_CSTEAMWORKS_X64_EXPORTS. Also `x64DefExportNames` (the dup check).

**Manifests: meta/sdk/*.manifest.json.** All are Proton-sourced. Every method has `stackBytes`, the i386 callee-pop width excluding `this` and including the sret pointer. Measured: every stackBytes is a multiple of 4. Manifests reached through `arches`:
- x86 today: SteamUser016/023, SteamFriends011/013/018, SteamUtils005, STEAMAPPS 004/005, STEAMUSERSTATS 010/011, STEAMREMOTESTORAGE 005/008/010, SteamMatchMaking009, SteamMatchMakingServers002, SteamNetworking005.
- Everything else is x64-only.

SteamUtils005 (x86) already carries the shimLocal IsAPICallCompleted/GetAPICallResult, and SteamFriends018 (dual) carries the helperCustom invite dialog, so those bodies compile on i386. `meta/sdk/acceptance-interface-versions.json` holds `{family, arches, titles}` per version. `pnpm extract-proton-inventory --versions A,B` fetches Proton at the pinned SHA 2c620c0fd7c2c424f6bd91898602bdc4d4260468 and writes manifests named `i<family lowercase><digits>.manifest.json`. It appends to `meta/sdk/ordinals.json`, applies `meta/sdk/wire-policy.json`, and runs prettier on what it wrote. `meta/sdk/x64-null-sret-inventory.json` confirms that Proton at that SHA ships SteamUser020, SteamController007 and SteamInput001.

**src/backend/storeManagers/steam/bridge/shimCoverage.ts (826 lines)**
- L55: `SHIM_EXPORTED_SYMBOLS`, hand-pinned. shimCoverage.test.ts pins it equal to steam_api.def in both directions (the 24-CR-02 pin).
- L157: `SHIM64_EXPORTED_SYMBOLS`, generated.
- L172: `shimServedInterfaceVersions()` (the x86 map). Later: `shim64ServedInterfaceVersions()`; SteamFriends017, SteamUtils010/009, STEAMUSERSTATS012 and STEAMAPPS008 are all `wire` there.
- L461: `SHIM_X64_NULL_OBJECT_FALLBACK`. L494: `computeExportSetVersion`. L567: `evaluateShimCoverageWith`; its x86 branch never null-objects ("there is no x86 null-object fallback concept").
- About L645: `isNullObjectEligible(arch, symbols, family)`. About L660: `findUnservableInterfaceVersions`, with its version-skew rule. About L720: `CORE_STARTUP_FAMILIES` and `classifyUnservableInterfaceVersions`. About L770: `findRunnerUnservedExports` (Undertale backlog 999.2 note).

**src/backend/storeManagers/steam/bridge/interfaceVersions.ts**
- `RUNTIME_LOOKUP_SYMBOLS` includes SteamInternal_FindOrCreateUserInterface.
- `resolveRequiredInterfaceVersions`, in runtime-lookup mode, resolves every known family in the dll+exe pool; more than one version means `@ambiguous`.

**meta/bridgeCensus.ts**
- About L577 `evaluate()`: problems give `unknown-version` before coverage, then `deps.evaluateShimCoverage`.
- About L640: `X86_MODERN_OR_FLAT` and `countX86ModernOrFlat`. About L2612: the footer line.

**Build and harness**
- `pnpm build-steam-bridge` (meta/buildSteamBridgeShims.ts) builds the helper, the x86 shim (`zig cc -target x86-windows-gnu`, to `public/bin/<arch>/darwin/steam_api.dll`) and the x64 shim.
- meta/__tests__/x86CallbackWineHarness.test.ts plus meta/__tests__/fixtures/x86_callback_pe_harness.c is the precedent: it compiles the REAL x86 shim with `buildShimCompileArgv(ZIG)` and a 32-bit PE harness with the pinned zig (`.build-tools/zig/zig`). It runs them under `/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wineloader` inside `createFakeHomeProfile()`, parses `PASS <name>` / `FAIL` / `DONE` lines, uses inline asm to capture ESP around a `__thiscall` call, and has a mutant variant that proves the ESP check bites. It skips without CrossOver or zig unless `GAMELIB_REQUIRE_WINE_HARNESS=1`. Both tools are present on this Mac.

## Measurements to embed (taken 2026-11-20 by the planner from the installed bridge bottles; copy them into test fixtures, never read the bottles from a test)

- **Amnesia 57300**, `Amnesia.exe` x86.
  - Static imports: SteamAPI_GetHSteamUser, SteamAPI_Init, SteamAPI_IsSteamRunning, SteamAPI_RegisterCallResult, SteamAPI_RegisterCallback, SteamAPI_RunCallbacks, SteamAPI_UnregisterCallResult, SteamAPI_UnregisterCallback, SteamInternal_ContextInit, SteamInternal_FindOrCreateUserInterface.
  - Exe version strings: STEAMUGC_INTERFACE_VERSION017, STEAMUSERSTATS_INTERFACE_VERSION012, SteamFriends017, SteamUser023, SteamUtils010.
  - Shipped steam_api.dll (original, no shim marker) version strings: STEAMAPPLIST_INTERFACE_VERSION001, STEAMAPPS_INTERFACE_VERSION008, STEAMHTMLSURFACE_INTERFACE_VERSION_005, STEAMHTTP_INTERFACE_VERSION003, STEAMINVENTORY_INTERFACE_V003, STEAMMUSICREMOTE_INTERFACE_VERSION001, STEAMMUSIC_INTERFACE_VERSION001, STEAMPARENTALSETTINGS_INTERFACE_VERSION001, STEAMREMOTEPLAY_INTERFACE_VERSION001, STEAMREMOTESTORAGE_INTERFACE_VERSION016, STEAMSCREENSHOTS_INTERFACE_VERSION003, STEAMUGC_INTERFACE_VERSION017, STEAMUSERSTATS_INTERFACE_VERSION012, STEAMVIDEO_INTERFACE_V002, SteamClient017, SteamClient020, SteamController008, SteamFriends017, SteamGameServer015, SteamGameServerStats001, SteamInput006, SteamMatchGameSearch001, SteamMatchMaking009, SteamMatchMakingServers002, SteamNetworking006, SteamNetworkingMessages002, SteamNetworkingSockets012, SteamNetworkingUtils004, SteamParties002, SteamUser023, SteamUtils010.
- **Low Magic Age 576770**, `low_magic_age.exe` x86.
  - Static imports: SteamAPI_GetHSteamUser, SteamAPI_Init, SteamAPI_RegisterCallResult, SteamAPI_RestartAppIfNecessary, SteamAPI_RunCallbacks, SteamAPI_Shutdown, SteamAPI_UnregisterCallResult, SteamInternal_ContextInit, SteamInternal_FindOrCreateUserInterface.
  - Exe version strings: STEAMUGC_INTERFACE_VERSION013, STEAMUSERSTATS_INTERFACE_VERSION011, SteamUser020.
  - Shipped steam_api.dll version strings: SteamClient017, SteamClient019, SteamController007, SteamGameServer012, SteamInput001, SteamUser020, SteamUtils009.
- **Cat Quest 593280**, Unity/Mono x86. No static steam imports. `Assembly-CSharp-firstpass.dll` (Steamworks.NET) carries 902 SteamAPI_*/SteamInternal* names, including SteamInternal_CreateInterface, SteamAPI_GetHSteamUser/Pipe and the 36 `SteamAPI_ISteamClient_*` names. Its UTF-16 version constants: STEAMAPPLIST_INTERFACE_VERSION001, STEAMAPPS_INTERFACE_VERSION008, STEAMAPPTICKET_INTERFACE_VERSION001, STEAMHTMLSURFACE_INTERFACE_VERSION_005, STEAMHTTP_INTERFACE_VERSION003, STEAMINVENTORY_INTERFACE_V003, STEAMMUSICREMOTE_INTERFACE_VERSION001, STEAMMUSIC_INTERFACE_VERSION001, STEAMPARENTALSETTINGS_INTERFACE_VERSION001, STEAMREMOTEPLAY_INTERFACE_VERSION001, STEAMREMOTESTORAGE_INTERFACE_VERSION014, STEAMSCREENSHOTS_INTERFACE_VERSION003, STEAMUGC_INTERFACE_VERSION014, STEAMUSERSTATS_INTERFACE_VERSION011, STEAMVIDEO_INTERFACE_V002, SteamClient020, SteamController007, SteamFriends017, SteamGameCoordinator001, SteamGameServer013, SteamGameServerStats001, SteamInput001, SteamMatchGameSearch001, SteamMatchMaking009, SteamMatchMakingServers002, SteamNetworking006, SteamNetworkingSockets008, SteamNetworkingUtils003, SteamParties002, SteamUser020, SteamUtils009. It is used only by Task 3's todo remainder.

## HEAD baselines for the count gates below
- None of the nine modern names is an export line in `native/steam-bridge/generated/steam_api.def`.
- `/usr/bin/objdump --private-headers public/bin/arm64/darwin/steam_api.dll` lists 0 of the nine modern names and 0 of the nine Task 2 accessors.
- `steam_api.def` has 50 lines.
- `x86_null_object_for_version` occurs 0 times in steam_api_shim.c.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): x86 SteamInternal_* family + manifest-backed x86 null object, end to end from generator to i686 DLL to a Wine runtime call</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, meta/__tests__/x86ModernLookupWineHarness.test.ts, meta/__tests__/fixtures/x86_modern_lookup_pe_harness.c, src/backend/storeManagers/steam/bridge/shimCoverage.ts, native/steam-bridge/generated/steam_api_shim.c, native/steam-bridge/generated/steam_api.def</files>
  <precondition>CrossOver's wineloader exists at /Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wineloader and the pinned zig at .build-tools/zig/zig. Both were present 2026-11-20. If either is missing, stop and report; do not let the harness skip.</precondition>
  <action>
Implements D-53-09 tier 1 (todo "Scope to build": the x86 CreateInterface export, the fallback object and the SteamInternal_* exports), mirroring how quick 261024-i94 and 51-15 built the x64 family. All C changes go through meta/gen_vtables.ts. Regenerate with `pnpm gen-vtables`; never hand-edit native/steam-bridge/generated/*.

(1) **.def.** In `defExportNames`, take MODERN_LOOKUP_FLAT_EXPORTS out of the `x64Only` array and emit it for BOTH arches, in the same position (right after GAMESERVER_FLAT_STUBS). The flat names, LIFECYCLE_NOOP_EXPORTS, NETWORKING_UTILS_FLAT_INLINE_NAMES and LEGACY_CSTEAMWORKS_X64_EXPORTS stay x64-only; their existing "x86 .def carries none" pins must stay green. Give the x86 list the same duplicate-name throw that `x64DefExportNames` applies. Result: steam_api64.def is byte-identical, and steam_api.def gains exactly the 9 names.

(2) **x86 modern block.** In `generateShimC`, add a SECOND block after the existing x64 `modernLookupExports`, and leave the x64 block and its pinned literal untouched. The new block is `#if defined(__i386__)`, then its own `static uintptr_t g_gamelib_context_counter = 1;`, then the nine MODERN_LOOKUP_FLAT_EXPORT_BODIES, then `#endif`. Derive the nine bodies from the SAME record by replacing every `x64_null_object_for_version` with `x86_null_object_for_version`, so there is one source of truth. Throw at generation time if any derived x86 body still contains the token `x64_`. Give it its own section heading naming x86 and D-53-09.

These are flat cdecl exports, the i686 mingw default. SteamInternal_ContextInit's struct is `{pFn, uintptr_t counter}`, which is 8 bytes on i386, so the context sits at data+8 exactly as the SDK lays it out, and pFn is cdecl (S_CALLTYPE). Rewrite MODERN_LOOKUP_FLAT_EXPORTS' doc comment. It now ships on both arches, unblocked by the 2026-11-20 census measurement of 57300 and 576770 (D-53-09). The x86 unknown-version answer is the manifest-backed x86 null object, else NULL.

(3) **x86 fallback object.** Add `emitX86NullObjects(manifests)`. For every manifest whose `arches` lacks 'x86', build a forced-stub clone:
- `interface` is `X86Null_` plus the real interface name; the result passes stubCallSite's identifier check, and helper STUBCALL logs then name it as an x86 null object.
- `mode` is 'stub', and every method has `mode: 'stub'` with helperFallback, shimLocal, helperCustom, zeroHandleParam and unmapHandle removed.
- slot, name, returns, returnKind, stackBytes, params and structSize are kept.

Emit each clone through the EXISTING `emitVtableStub` per method plus `emitVtableArray`. Every slot then goes through emitStubBody (stackBytes-driven dummies, with sret zero-filled and returned), or, for SteamClient manifests, through the GetISteamXxx lookup stub, which is checked first and uses real params.

Before emitting, validate each clone method and throw (fail closed) unless stackBytes is a non-negative multiple of 4, and is at least 4 when isSretReturn is true.

Emit the whole result inside one `#if defined(__i386__)` block that opens with a forward declaration of `static void *x86_null_object_for_version(const char *version);`. It ends with a `g_x86_null_table[]` of `{ "<real version string>", &g_x86null_<iface lowercase>_instance }` rows and the definition of `x86_null_object_for_version`: NULL for a NULL argument, an exact strcmp over the table, NULL on a miss.

Insert the block into generateShimC's output between `header` and `vtableSections`. The header already forward-declares resolve_iface_by_exact_version, and every stub prerequisite (gamelib_stubcall_note, gl_stub_fail_call_result, THISCALL) is defined in the header.

In `emitSteamClientVersionLookupStub`, change the `#else return NULL` arm to `#elif defined(__i386__)` returning `x86_null_object_for_version(<version param>)`, followed by `#else` returning NULL. On x86 this only compiles inside the null clones.

Do NOT put the null objects in g_iface_table. They are a fallback and not served, which keeps D-53-07's flat-lookup NULL contract and the served/skew semantics intact. Update the comment that says a single generic null object is arity-safe only on Win64, so that it points at this per-version x86 mechanism.

(4) **Coverage pin.** Add the nine names to `SHIM_EXPORTED_SYMBOLS` in src/backend/storeManagers/steam/bridge/shimCoverage.ts, with a short comment citing quick 261120-rdo and D-53-09. This keeps the 24-CR-02 equality pin with steam_api.def green. SHIM_EXPORT_SET_VERSION changes as a result, which re-flags persisted verdicts; that is intended, as it was in i94. Leave every other part of shimCoverage.ts alone; Task 2 owns the rest.

If `findRunnerUnservedExports`' Undertale test pins SteamAPI_GetHSteamPipe and SteamAPI_GetHSteamUser as unserved on x86, flip only those two: they are now exported. SteamAPI_InitSafe stays unserved. Do not claim Undertale fixed.

(5) **gen_vtables tests.** Two pins encoded the D-53-09 deferral itself, so flip them deliberately and do not delete them:
- "lists SteamInternal_CreateInterface / SteamAPI_GetHSteamUser / SteamAPI_GetHSteamPipe on x64 but not on x86" now asserts both arches.
- "x64 .def lists all five; x86 .def lists none" now asserts both list all five.

Add tests for the following:
- (a) the x86 .def lists each of the 9 modern names exactly once;
- (b) generateShimC has an `#if defined(__i386__)` modern block whose bodies contain `x86_null_object_for_version` and no `x64_`;
- (c) for a fake x64-only manifest, the x86 null block contains `g_x86null_<iface>_vtbl`, a slot with stackBytes 12 has exactly 3 `uint32_t dummy` params, and an sret slot takes `void *sretOut`;
- (d) the generator throws for a fake x64-only method whose stackBytes is not a multiple of 4;
- (e) the x64 modern block and `steam_api64.def` output are unchanged; the existing pins cover this, so keep them green.

Any other existing test that breaks must be updated only where its assertion encoded the x86 deferral, never loosened elsewhere. List each one in the SUMMARY.

(6) **Wine harness**, the tracer's end-to-end proof. Create meta/__tests__/fixtures/x86_modern_lookup_pe_harness.c and meta/__tests__/x86ModernLookupWineHarness.test.ts, modeled on the x86CallbackWineHarness pair. Reuse its skip logic, its `GAMELIB_REQUIRE_WINE_HARNESS=1` hard-fail, `buildShimCompileArgv(ZIG)` for the real x86 shim, the zig harness compile, and `createFakeHomeProfile()` for the spawn (fake-HOME convention; fakeHomeIsolation.test.ts gates `env` literals). Do NOT write a gamelib_bridge.cfg and do NOT start a fake helper: every bridge_transact then fails closed (D-51-01), and the harness tests only shim-local behaviour.

The harness does LoadLibraryA on the shim, GetProcAddress on the names, and prints one `PASS <name>` or `FAIL <name> <detail>` per check, then `DONE`:
- `hsteam_handles`: GetHSteamUser() and GetHSteamPipe() both return 1.
- `context_init_protocol`: a data block `{pFn, counter=0, ctx}` whose pFn stores FindOrCreateUserInterface(1, "SteamUser023") into ctx and counts its calls. Two ContextInit calls run pFn exactly once, both return data+8, and ctx is non-NULL.
- `find_or_create_served`: FindOrCreateUserInterface(1, "SteamUser023") equals SteamInternal_CreateInterface("SteamUser023") and is non-NULL.
- `null_object_known_version`: FindOrCreateUserInterface(1, "STEAMUGC_INTERFACE_VERSION017") is non-NULL and differs from the served pointer.
- `null_slot_esp_balanced`: call STEAMUGC_INTERFACE_VERSION017 slot 0 (CreateQueryUserUGCRequest, stackBytes 28, int64 return) through its vtable as `__thiscall`, with ECX set to the object and 7 dwords pushed, capturing ESP before and after with inline asm as the precedent fixture does. ESP must be balanced and the return must be 0.
- `null_sret_slot`: call SteamInput006 slot 29 (GetMotionData, stackBytes 12 = sret pointer + uint64 handle, structSize 40). Pre-fill a 40-byte buffer with 0xAA. ESP must be balanced, EAX must equal the buffer and the buffer must be all zero.
- `esp_check_detects_mismatch`: the same slot-0 call with one extra dword pushed must leave ESP off by exactly 4. This proves the ESP check is live and not vacuous; restore ESP from the frame afterwards.
- `unknown_version_null`: CreateInterface("GameLibNoSuchInterface999") and FindOrCreateUserInterface(1, NULL) are both NULL.
- `steaminternal_init_fails_closed`: SteamInternal_SteamAPI_Init(NULL, buf1024) returns 2 with a non-empty message.
- `gameserver_init_v2_fails`: it returns 1.

Both chosen manifests (STEAMUGC017, SteamInput006) stay x64-only after Task 2. Read their slot numbers and stackBytes from meta/sdk/isteamugc017.manifest.json and meta/sdk/isteaminput006.manifest.json rather than trusting this text. The jest test asserts every name above appears as `PASS <name>`, there is no `FAIL`, `DONE` is present, the exit code is 0 and the run did not time out.

(7) Run `pnpm gen-vtables`, then `pnpm build-steam-bridge`. Both compile gates must pass. Then run the checks in verify.
  </action>
  <verify>
    <automated>pnpm gen-vtables && git diff --exit-code -- native/steam-bridge/generated/steam_api64.def src/backend/storeManagers/steam/bridge/shimExports.generated.ts && echo X64-UNCHANGED   # invariant: x64 export table byte-identical</automated>
    <automated>n=0; for s in SteamInternal_CreateInterface SteamAPI_GetHSteamUser SteamAPI_GetHSteamPipe SteamInternal_SteamAPI_Init SteamInternal_ContextInit SteamInternal_FindOrCreateUserInterface SteamInternal_FindOrCreateGameServerInterface SteamInternal_GameServer_Init_V2 SteamInternal_GameServer_Init; do grep -qx "$s" native/steam-bridge/generated/steam_api.def && n=$((n+1)) || echo "MISSING-IN-DEF $s"; done; echo "x86 .def modern names: $n"; test "$n" -eq 9   # [HEAD=0 EXPECT==9]</automated>
    <automated>pnpm build-steam-bridge && X86=public/bin/$(node -p process.arch)/darwin/steam_api.dll; n=0; for s in SteamInternal_CreateInterface SteamAPI_GetHSteamUser SteamAPI_GetHSteamPipe SteamInternal_SteamAPI_Init SteamInternal_ContextInit SteamInternal_FindOrCreateUserInterface SteamInternal_FindOrCreateGameServerInterface SteamInternal_GameServer_Init_V2 SteamInternal_GameServer_Init; do /usr/bin/objdump --private-headers "$X86" | grep -Eq "[[:space:]]$s$" && n=$((n+1)) || echo "MISSING $s"; done; echo "x86 modern exports: $n"; test "$n" -eq 9   # [HEAD=0 EXPECT==9]</automated>
    <automated>GAMELIB_REQUIRE_WINE_HARNESS=1 npx jest --selectProjects Meta --runTestsByPath meta/__tests__/x86ModernLookupWineHarness.test.ts</automated>
    <automated>npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/wireExtendedCompile.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && GAMELIB_REQUIRE_WINE_HARNESS=1 npx jest --selectProjects Meta --runTestsByPath meta/__tests__/x86CallbackWineHarness.test.ts</automated>
    <automated>pnpm codecheck && npx eslint meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/x86ModernLookupWineHarness.test.ts src/backend/storeManagers/steam/bridge/shimCoverage.ts</automated>
    <automated>for p in meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/x86ModernLookupWineHarness.test.ts src/backend/storeManagers/steam/bridge/shimCoverage.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED $p"; done; npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/x86ModernLookupWineHarness.test.ts src/backend/storeManagers/steam/bridge/shimCoverage.ts   # .c/.def outputs and the .c fixture have no prettier parser (file-info inferredParser null) and are excluded on purpose</automated>
  </verify>
  <done>The x86 .def and the built x86 DLL carry all 9 modern names. steam_api64.def is unchanged. The Wine harness prints PASS for all ten checks, including the ESP-balance and mutant-detection checks, and the existing x86 callback harness still passes. The flipped D-53-09 pins and the new generator tests are green, and codecheck, eslint and the scoped prettier check pass. Commit: feat(quick-261120-rdo): x86 SteamInternal_* family and manifest-backed x86 null object (D-53-09).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Serve the 57300/576770 versions on x86 and teach the coverage model and census the x86 fallback</name>
  <files>meta/sdk/acceptance-interface-versions.json, meta/sdk/ordinals.json, meta/sdk/isteamfriends017.manifest.json, meta/sdk/isteamutils010.manifest.json, meta/sdk/isteamutils009.manifest.json, meta/sdk/isteamuserstats012.manifest.json, meta/sdk/isteamapps008.manifest.json, meta/sdk/isteamuser020.manifest.json, meta/sdk/isteamugc013.manifest.json, meta/sdk/isteamcontroller007.manifest.json, meta/sdk/isteaminput001.manifest.json, meta/gen_vtables.ts, src/backend/storeManagers/steam/bridge/shimExports.generated.ts, src/backend/storeManagers/steam/bridge/shimCoverage.ts, src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts, meta/bridgeCensus.ts, meta/__tests__/bridgeCensus.test.ts, native/steam-bridge/generated/steam_api_shim.c, native/steam-bridge/generated/steam_api.def, native/steam-bridge/generated/bridge_dispatch.h</files>
  <precondition>raw.githubusercontent.com is reachable, because the extractor fetches the pinned Proton SHA. If it is not, stop and report rather than hand-authoring manifests (D-09: manifests come from the Proton inventory, never hand-written).</precondition>
  <behavior>
    - Amnesia fixture: x86, the measured static imports, and the dll+exe pool from context. resolveRequiredInterfaceVersions gives problems exactly ['SteamClient@ambiguous(SteamClient017,SteamClient020)']. evaluateShimCoverage({arch:'x86', ...}) gives missingSymbols [] with SteamUGC among stubbedInterfaces. classifyUnservableInterfaceVersions gives blocking [].
    - Low Magic Age fixture: the same shape. Problems are exactly ['SteamClient@ambiguous(SteamClient017,SteamClient019)'], missingSymbols is [] and blocking is [].
    - An x86 runtime-lookup title that requires a version with NO manifest (SteamNetworkingSockets008) still reports it missing and blocking: NULL on x86, because there is no arity data.
    - An x86 title reaching an unserved manifest-known family through a BARE accessor is still missing (CR-03: resolve_bare_iface returns NULL).
    - Version skew on x86: SteamNetworking006 is null-object answered while SteamNetworking005 is served, so it is unservable but nonCore and not blocking.
    - evaluateShimCoverageWith with no x86NullObjectVersions supplied behaves exactly as before, so existing explicit-set tests are unchanged.
    - countX86ModernOrFlatUnexported counts an x86 item only when a symbol matching X86_MODERN_OR_FLAT is absent from the given export table: Amnesia's symbols with the real table count 0, and a SteamAPI_ISteamClient_GetISteamUser item counts 1.
  </behavior>
  <action>
Serves the measured versions so that the static imports of 57300 and 576770 load against a shim that answers their interface lookups truthfully (D-53-09). Write the shimCoverage and census tests from the behavior block first (RED), then implement (GREEN).

(1) **Widen five core manifests to x86.** Change ONLY the `arches` array of each to ["x86", "x64"], and the matching entries in meta/sdk/acceptance-interface-versions.json (arches, plus the title id appended to `titles`). Do not re-extract them; that would pull wire-policy drift into unrelated fields. They are:
- SteamFriends017, SteamUtils010 and STEAMUSERSTATS_INTERFACE_VERSION012 for 57300;
- STEAMAPPS_INTERFACE_VERSION008 for 57300; it comes from the dll pool, and SteamApps is a core family that x86 already serves at 004/005, so a null object would be blocking skew;
- SteamUtils009 for 576770.

Their shimLocal and helperCustom methods already compile on i386 through SteamUtils005 and SteamFriends018.

(2) **Extract four new x86-only manifests.** Add acceptance entries `{family, arches: ["x86"], titles: ["576770"]}` for SteamUser020 (family SteamUser), STEAMUGC_INTERFACE_VERSION013 (SteamUGC), SteamController007 (SteamController) and SteamInput001 (SteamInput). Then run `pnpm extract-proton-inventory --versions SteamUser020,STEAMUGC_INTERFACE_VERSION013,SteamController007,SteamInput001`. That writes meta/sdk/isteamuser020/isteamugc013/isteamcontroller007/isteaminput001.manifest.json and appends ordinals.

They are x86-only on purpose, which keeps the x64 flat-export emission and the x64 .def untouched. The wire-policy overlay makes SteamUser020's identity methods wire automatically, so bridge_dispatch.h gains cases and the helper must be rebuilt; `pnpm build-steam-bridge` does that. Without these four, LMA's pool versions would answer NULL on x86. A NULL answer is blocking, and blocking means the shim is withheld.

(3) **Generator.** In `generateShimExportsTs`, also emit `export const SHIM86_NULL_OBJECT_VERSIONS: readonly string[]`: the sorted `interface` of every manifest whose arches lacks 'x86', which is exactly the set emitX86NullObjects serves. Update that file's header comment to describe both constants. Run `pnpm gen-vtables`. The x64 .def must stay byte-identical.

(4) **shimCoverage.ts.**
- (a) Mirror the regenerated steam_api.def into `SHIM_EXPORTED_SYMBOLS`. Expect the nine flat accessors SteamAPI_SteamFriends_v017, SteamAPI_SteamUtils_v010, SteamAPI_SteamUtils_v009, SteamAPI_SteamUserStats_v012, SteamAPI_SteamApps_v008, SteamAPI_SteamUser_v020, SteamAPI_SteamUGC_v013, SteamAPI_SteamController_v007 and SteamAPI_SteamInput_v001, plus the new x86 bare family accessors (SteamUGC, SteamController, SteamInput). Take the exact set from the .def, with house-style comments.
- (b) Add the nine versions to `shimServedInterfaceVersions()`. Use the x64 map's mode for the five widened ones (all `wire`). SteamUser020 is `wire`, following the SteamUser016 precedent; STEAMUGC013, SteamController007 and SteamInput001 are `stub`.
- (c) Import SHIM86_NULL_OBJECT_VERSIONS. Add an OPTIONAL `x86NullObjectVersions?: ReadonlySet<string>` to ShimCoverageSets and ExportSetVersionInputs, defaulting to empty. In `computeExportSetVersion`, append `|` plus the sorted list only when it is non-empty. Pass the real set in SHIM_EXPORT_SET_VERSION, evaluateShimCoverage and every live call site.
- (d) Make null-object eligibility version-aware. `isNullObjectEligible(arch, symbols, family, version)` keeps the x64 rule unchanged. For x86 it is true only when usesRuntimeInterfaceLookup(symbols), the family is not reached through a bare accessor, and the version is in SHIM86_NULL_OBJECT_VERSIONS. Apply the same x86 rule inside `evaluateShimCoverageWith`, which yields stubbed rather than missing, and thread `version` through `findUnservableInterfaceVersions` and `classifyUnservableInterfaceVersions`. The skew rule and CORE_STARTUP_FAMILIES are unchanged.
- (e) Rewrite the comments that say x86 has no null-object fallback: x86 has a per-version, manifest-backed fallback, and versions GameLib has no manifest for answer NULL. Leave `isScanVerdictNowCovered` as it is; placement rescans because the export-set version changed.

(5) **bridgeCensus.ts.** Keep `countX86ModernOrFlat` and its footer line byte-identical; it is the todo's need measurement. Add an exported pure `countX86ModernOrFlatUnexported(items, exported = SHIM_EXPORTED_SYMBOLS)` that counts x86 items having at least one X86_MODERN_OR_FLAT-prefixed symbol not in `exported`. Print a second footer line right after the first: `x86 titles whose modern SteamInternal_* or flat API need the x86 shim does not export: N (appids)`. `evaluate()` needs no change; it already uses the live evaluateShimCoverage.

(6) Run `pnpm gen-vtables`, `pnpm build-steam-bridge` and the checks below. If a widened or extracted manifest fails the i686 compile because it references an x64-only subsystem (gl_md_*, GL_NET, gl_mms), do NOT port the subsystem. Stop and report the symbol.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/bridge/__tests__/ meta/__tests__/bridgeCensus.test.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/extractProtonInventory.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/wireExtendedCompile.test.ts meta/__tests__/buildSteamBridgeShims.test.ts</automated>
    <automated>pnpm gen-vtables && git diff --exit-code -- native/steam-bridge/generated/steam_api64.def && echo X64-DEF-UNCHANGED   # invariant</automated>
    <automated>pnpm build-steam-bridge && X86=public/bin/$(node -p process.arch)/darwin/steam_api.dll; T=$(mktemp); /usr/bin/objdump --private-headers "$X86" > "$T"; n=0; for s in SteamAPI_SteamFriends_v017 SteamAPI_SteamUtils_v010 SteamAPI_SteamUtils_v009 SteamAPI_SteamUserStats_v012 SteamAPI_SteamApps_v008 SteamAPI_SteamUser_v020 SteamAPI_SteamUGC_v013 SteamAPI_SteamController_v007 SteamAPI_SteamInput_v001; do grep -Eq "[[:space:]]$s$" "$T" && n=$((n+1)) || echo "MISSING $s"; done; rm -f "$T"; echo "x86 new accessors: $n"; test "$n" -eq 9   # [HEAD=0 EXPECT==9]</automated>
    <automated>GAMELIB_REQUIRE_WINE_HARNESS=1 npx jest --selectProjects Meta --runTestsByPath meta/__tests__/x86ModernLookupWineHarness.test.ts meta/__tests__/x86CallbackWineHarness.test.ts</automated>
    <automated>pnpm codecheck && npx eslint meta/gen_vtables.ts meta/bridgeCensus.ts meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge/shimCoverage.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/shimExports.generated.ts</automated>
    <automated>P="meta/gen_vtables.ts meta/bridgeCensus.ts meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge/shimCoverage.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/shimExports.generated.ts meta/sdk/acceptance-interface-versions.json meta/sdk/ordinals.json meta/sdk/isteamfriends017.manifest.json meta/sdk/isteamutils010.manifest.json meta/sdk/isteamutils009.manifest.json meta/sdk/isteamuserstats012.manifest.json meta/sdk/isteamapps008.manifest.json meta/sdk/isteamuser020.manifest.json meta/sdk/isteamugc013.manifest.json meta/sdk/isteamcontroller007.manifest.json meta/sdk/isteaminput001.manifest.json"; for p in $P; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED $p"; done; npx prettier --check $P   # generated .c/.def/.h have no prettier parser and are excluded on purpose</automated>
  </verify>
  <done>
- The behavior-block tests pass; the Amnesia and LMA fixtures show zero missing symbols and zero blocking gaps on x86.
- The x86 DLL exports the nine new accessors, and steam_api64.def is unchanged.
- Both Wine harnesses still pass.
- The census unit test pins the new count function. codecheck, eslint and scoped prettier are clean.

Commit: feat(quick-261120-rdo): serve 57300/576770 interface versions on x86 and count the x86 null object as coverage (D-53-09).
  </done>
</task>

<task type="auto">
  <name>Task 3: Measure with the census, rescope the todo to the flat-API remainder, record the pending live checks</name>
  <files>.planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md</files>
  <action>
(1) Run `pnpm bridge-census`. It builds the scan and steamfiles CLIs and reads the installed bridge bottles read-only. Capture three things:
- the existing line `x86 titles needing modern SteamInternal_* or flat API:`, expected still `3 (57300, 576770, 593280)` because it measures need;
- the new not-exported line, expected `1 (593280)`;
- the census class and detail of the 57300, 576770 and 593280 rows. 57300 and 576770 are expected to stay `unknown-version` with SteamClient@ambiguous only (version resolution, out of scope).

If 57300 or 576770 shows anything other than the SteamClient ambiguity, or still counts as not exported, stop and report. Do not edit the census to hide it.

(2) Edit the todo; it is in .planning, which prettier ignores, so hand-match its existing style.
- Keep the file in `pending/`, because the flat tier is left out (orchestrator instruction).
- Retitle it to the remainder: x86 flat API (`SteamAPI_ISteam*`) parity for Steamworks.NET titles, which Cat Quest 593280 needs (D-53-09 remainder).
- Set triage keys bare, lowercase, in this order: `severity: medium` (a measured owned title cannot init through the bridge; bounded), `platform: any`, `ready: code` (the remaining work is desk-ready). Keep `audit_acknowledged`. Update `files:`.
- Add a `## 2026-11-20 measurement` section: the census line verbatim, the three titles with their measured imports and SDK vintage (from this plan's context), and the tier-1 commits from Tasks 1-2. State that 57300 and 576770 are now covered on x86, and give their census class after the run, verbatim, with the SteamClient-ambiguity explanation.
- Add a `## Remainder (flat tier)` section:
  - (a) emitFlatExports per arch with `THISCALL` in the slot casts, under an `#if defined(__i386__)` block, keeping the D-53-07 NULL flat-lookup contract;
  - (b) serve on x86 every CSteamAPIContext.Init version Cat Quest requests. Already x86 after this task: SteamUser020, SteamFriends017, SteamUtils009, STEAMUSERSTATS011, STEAMAPPS008, SteamMatchMaking009, SteamMatchMakingServers002, SteamController007, SteamInput001. To widen: SteamClient020, SteamMatchGameSearch001, SteamNetworking006, STEAMSCREENSHOTS003, STEAMHTTP003, STEAMAPPLIST001, STEAMMUSIC001, STEAMMUSICREMOTE001, STEAMHTMLSURFACE005, STEAMINVENTORY_V003, STEAMVIDEO_V002, STEAMPARENTALSETTINGS001, STEAMREMOTEPLAY001, SteamParties002. To extract: STEAMREMOTESTORAGE014, STEAMUGC014, and check SteamNetworkingSockets008 / SteamNetworkingUtils003 / SteamGameServer013;
  - (c) turn the x86 export list into a generated list like SHIM64 (about 900 names);
  - (d) audit which x64-only subsystems Steamworks.NET touches on x86 (ManualDispatch gl_md_*, GL_NET, the gl_mms relay);
  - (e) the 53-12 precedent that Init fails on any NULL.
- Rewrite the old `## Scope to build if a title appears` list so its built items are marked done (CreateInterface, the fallback object, the SteamInternal_* exports) and only the flat exports remain.

(3) Run `pnpm planning-gates`, then `graphify update .` (CLAUDE.md: keep the graph current after code changes).

(4) In the SUMMARY, put the following under a `## Pending human checks` heading, and never mark any of it a pass. Prep: `pnpm build-steam-bridge`, then restart `pnpm tauri:dev` (never `tauri:dev:run`) so the sidecar picks up the new coverage tables and the export-set version re-flags placement. Launch each title from GameLib, and judge it by the strict bridge-verified criterion: HELLO, plus a clean game Steam-init log, or for non-Unity a game-originated bridge call (D-53-13). In-Game never counts.
- 57300 Amnesia: expected to load past the old entry-point-not-found error.
- 576770 Low Magic Age: the same expectation.
- 593280 Cat Quest: a baseline only, with no change expected, because the flat tier is not built.

Also list two follow-up candidates without creating todo files: the SteamClient-ambiguity resolution for FindOrCreate-only titles, and the Undertale 999.2 gap, where SteamAPI_GetHSteamPipe/User are now exported on x86 but SteamAPI_InitSafe is not.
  </action>
  <verify>
    <automated>pnpm planning-gates && grep -nE '^(severity: medium|platform: any|ready: code)$' .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md && grep -n '^## 2026-11-20 measurement' .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md && grep -n '^## Remainder (flat tier)' .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md   # [HEAD: keys are severity minor / ready blocked, neither heading exists; EXPECT the three key lines and both headings printed]</automated>
    <automated>test -f .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md && test ! -f .planning/todos/completed/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md && echo TODO-STAYS-OPEN</automated>
  </verify>
  <done>The census output has been captured verbatim into the todo. The todo is rescoped to the flat tier, has valid triage keys and stays in pending/, and planning-gates passes. The graph has been updated. The SUMMARY lists the three live launches as pending human checks under the strict criterion, plus the two follow-up candidates. Prettier: the only file written is under the prettier-ignored .planning tree, so no formatter check applies (a check there would be vacuous). Commit: docs(quick-261120-rdo): record the 2026-11-20 x86 census and rescope the D-53-09 todo to the flat tier.</done>
</task>

</tasks>

<coverage_audit>
| Source item | Covered by | Status |
|---|---|---|
| Todo scope: x86 `CreateInterface` export | Task 1 | COVERED |
| Todo scope: fallback object for unserved interfaces | Task 1 (manifest-backed, arity-exact per version; versions with no manifest answer NULL, because there is no i386 arity data for them and a generic callee-cleans thunk would corrupt the stack) | COVERED |
| Todo scope: the SteamInternal_* exports the x64 shim carries (all 7 named, plus GetHSteamUser/Pipe) | Task 1 | COVERED |
| Todo scope: flat exports dispatching via `__thiscall` into the proxy vtable | none: left out on context cost (see objective), recorded as the todo remainder in Task 3 | DEFERRED (pre-authorized by orchestrator; todo stays open) |
| Orchestrator: priority 1 = ContextInit + FindOrCreateUserInterface for two titles | Tasks 1-2 | COVERED |
| Orchestrator: shimCoverage.ts x86 static scans count these as covered | Task 2 | COVERED |
| Orchestrator: census coverage judgment | Task 2 (live evaluateShimCoverage plus the new coverage-aware footer) | COVERED |
| Orchestrator: generator tests, i686 build, objdump export check, jest | Tasks 1-2 | COVERED |
| Orchestrator: scoped prettier with `--file-info` first | every task | COVERED |
| Orchestrator: live launches as pending human checks, strict criterion untouched | Task 3 SUMMARY | COVERED |
| Orchestrator: record the measurement in the todo; keep open if flat tier is left out; planning-gates | Task 3 | COVERED |
| Orchestrator: census moves 57300/576770 out "where coverage is the only reason" | Task 2 test proves coverage complete; the class stays `unknown-version` because of SteamClient ambiguity (resolution, not coverage), recorded honestly | COVERED with stated caveat |
</coverage_audit>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game PE to x86 shim exports | untrusted game code passes version-string pointers, context-init blocks and stack arguments |
| extractor to github raw | network fetch of Proton source at a pinned SHA (Task 2) |
| jest to Wine harness spawn | a child process run from meta/ |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-rdo-01 | Tampering / DoS | x86 null-object slots (`__thiscall` callee-cleans) | high | mitigate | Every slot signature comes from the manifest's i386 stackBytes through emitStubBody. The generator throws on a stackBytes that is not a multiple of 4 or below 4 for sret. The Wine harness asserts ESP balance on a 28-byte slot and an sret slot, plus a mutant that must be detected. Versions with no manifest answer NULL, never a generic thunk. |
| T-rdo-02 | Tampering | SteamInternal_ContextInit / FindOrCreate* / x86_null_object_for_version | medium | mitigate | NULL checks on every pointer argument (the existing x64 bodies, reused verbatim). Exact strcmp over a static table; no writes outside the SDK-defined context block. |
| T-rdo-03 | Information disclosure | STUBCALL reports from x86 null slots | low | accept | They reuse gamelib_stubcall_note: bounded identifier strings, once per site, over the authenticated loopback (WR-03); no game data is sent. |
| T-rdo-04 | Tampering | extract-proton-inventory fetch | medium | mitigate | Pinned Proton SHA (no branch ref). The output manifests are reviewed in the diff and validated by validateManifest (computeRetN equals stackBytes for wire methods) before generation. |
| T-rdo-05 | Information disclosure | Wine harness child process | low | mitigate | Spawned inside createFakeHomeProfile() (two-profile rule; fakeHomeIsolation.test.ts gates env literals); no real profile is needed or used. |
| T-rdo-06 | Repudiation / integrity | persisted scan verdicts | low | accept | SHIM_EXPORT_SET_VERSION changes, which re-flags verdicts and rescans placement. Intended, as in i94. |
| T-rdo-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan, so the package-legitimacy gate does not apply. The census builds in-repo Rust CLIs from the existing lockfile only. |
</threat_model>

<verification>
- The x86 .def and the built DLL export the 9 modern names (Task 1) and the 9 new accessors (Task 2); steam_api64.def is byte-identical.
- The CrossOver Wine harness passes all ten checks against the real x86 shim, including ESP balance and mutant detection; the existing x86 callback harness still passes.
- The shimCoverage fixtures for 57300 and 576770 show zero missing symbols and zero blocking gaps on x86.
- The census prints the unchanged need line and a not-exported line of `1 (593280)`.
- The todo is rescoped and open; planning-gates is green.
- Nothing claims a live pass; all three live launches are pending human checks.
</verification>

<success_criteria>
- `pnpm gen-vtables` leaves no drift after the commits, and `pnpm build-steam-bridge` passes both compile gates.
- The objdump count gates read 9 and 9, against 0 at HEAD.
- The jest sets in Tasks 1-2 are green, including `GAMELIB_REQUIRE_WINE_HARNESS=1` runs of both Wine harnesses.
- codecheck, eslint on the touched TS files and scoped prettier are clean.
- The todo stays in pending/ with `severity: medium`, `platform: any`, `ready: code` and the 2026-11-20 measurement.
</success_criteria>

<output>
Create `.planning/quick/261120-rdo-x86-shim-parity-for-steaminternal-and-th/261120-rdo-SUMMARY.md` when done. It must include a `## Pending human checks` section (57300, 576770, 593280 under the strict bridge-verified criterion), the census lines verbatim, every flipped test pin with its reason, and the two follow-up candidates.
</output>
