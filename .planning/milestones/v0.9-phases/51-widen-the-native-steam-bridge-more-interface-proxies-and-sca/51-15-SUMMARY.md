---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 15
subsystem: steam-bridge
tags: [steam-bridge, win64, vtable-generator, zig-cc, abi-gate, shim-coverage, proton, tdd]

requires:
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 07)
    provides: builtBridgeShim64Path (src/backend/constants/paths.ts), SHIM64_EXPORTED_SYMBOLS/SHIM64_SERVED_INTERFACE_VERSIONS/SHIM_X64_NULL_OBJECT_FALLBACK placeholders
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 10)
    provides: extractProtonInventory.ts, acceptance-interface-versions.json schema, wire-policy.json
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 14)
    provides: GAMESERVER_FLAT_STUBS, the second/last interface group manifests, shimCoverage.ts's evaluateShimCoverage machinery
provides:
  - "steam_api64.dll: a real, measured-correct Win64 shim built beside steam_api.dll via a second zig cc -target x86_64-windows-gnu compile gate"
  - "The modern-SDK lookup family (SteamInternal_CreateInterface / SteamAPI_GetHSteamUser / SteamAPI_GetHSteamPipe), Win64-only, resolving by exact version string through g_iface_table with an x64 null-object fallback for unknown versions"
  - "A generator-level arch-gating mechanism (archGuard applied to vtable stub sections and flat accessors, not just the pre-existing g_iface_table rows) so an x86-only manifest's code never compiles into the x64 shim and vice versa"
  - "The SteamClient-family GetISteamXxx version-lookup special case in gen_vtables.ts, independent of manifest mode"
  - "The first real compile-and-disassemble ABI gate in this repo (meta/__tests__/shimAbiGate.test.ts), proving self=RCX/sretOut=RDX/plain retq on x64 vs ECX/`ret $0x4` on i386 against the generator's own emitted code"
  - "ELEX's (411300) full Win64 interface set (SteamClient017, SteamUser019, SteamFriends015, SteamUtils008, STEAMAPPS_INTERFACE_VERSION008, STEAMREMOTESTORAGE_INTERFACE_VERSION013, plus the three shared stub manifests widened to x64), zero missing symbols"
affects: [51-16, 51-18, D-51-02-notice, bridgeRoute, shimCoverage]

actuals:
  tokens: 70578
  tasks: 3
  commits: 3
  plan_head_before: b16e775fcf735ebf5dd8eca8fbb57f6f35f7a283
  plan_head_after: 5e42afe5c8f2735b03b7870e781678f49eda1083

tech-stack:
  added: []
  patterns:
    - "A disassembly ABI gate compiled from a synthetic test-only manifest fed directly through generateShimC/generateDefFile (not the committed meta/sdk tree), with a targeted static->__declspec(dllexport) text substitution purely to make objdump able to name the function -- never a body rewrite"
    - "Shared-version manifests (reused across two acceptance titles on different arches, e.g. STEAMUSERSTATS_INTERFACE_VERSION011 serving both Hoard on x86 and ELEX on x64) are widened in place (arches: ['x86','x64']) rather than forked -- the generated dispatch code is arch-neutral (a plain TCP wire protocol), so a genuinely wired manifest is wired on both arches with zero new code"
    - "A brand-new x64-only manifest with no verified macOS helper-dylib accessor is forced to pure stub mode (its wire-policy-injected helperFlat/mode stripped post-extraction) rather than inventing an unmeasured helperInterface -- D-09 applied to helper-side wiring, not just manifest authorship"

key-files:
  created:
    - meta/__tests__/shimAbiGate.test.ts
    - meta/sdk/isteamclient017.manifest.json
    - meta/sdk/isteamuser019.manifest.json
    - meta/sdk/isteamfriends015.manifest.json
    - meta/sdk/isteamutils008.manifest.json
    - meta/sdk/isteamapps008.manifest.json
    - meta/sdk/isteamremotestorage013.manifest.json
    - native/steam-bridge/generated/steam_api64.def
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/ordinals.json
    - meta/sdk/wire-policy.json
    - meta/sdk/isteammatchmaking009.manifest.json
    - meta/sdk/isteammatchmakingservers002.manifest.json
    - meta/sdk/isteamnetworking005.manifest.json
    - meta/sdk/isteamuserstats011.manifest.json
    - native/steam-bridge/generated/steam_api_shim.c
    - public/bin/.gitignore
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts

key-decisions:
  - "The research's 'shift this to RDX for a Win64 sret' rule does NOT apply to the generator's own emitted code: the generator never asks the C compiler to return a real struct by value (it hand-declares (void *self, void *sretOut, ...) with a plain void * return), so self and sretOut naturally land in RCX/RDX by ordinary Windows x64 parameter-position rules, with zero arch-specific branching needed in emitStubBody/emitVtableStub -- the research's free-function test hit a DIFFERENT lowering (the compiler auto-inserting the hidden pointer as an implicit FIRST arg) that never applies here"
  - "MODERN_LOOKUP_FLAT_EXPORTS (SteamInternal_CreateInterface/SteamAPI_GetHSteamUser/SteamAPI_GetHSteamPipe) are x64-ONLY in both the .def export list and the compiled C (gated under #if defined(__x86_64__)) -- keeping SHIM_EXPORTED_SYMBOLS' existing CR-02 pin untouched by this plan"
  - "archGuard (pre-existing from 51-06, previously applied only to g_iface_table rows) is now also applied to the full per-manifest vtable stub section and the flat accessor -- a dual-arch manifest gets no guard at all, an arch-exclusive manifest's code compiles into only that target's object"
  - "resolve_iface_by_exact_version is a single shared function, forward-declared in the preamble (before vtableSections, which needs it for the SteamClient GetISteamXxx special case) and defined once g_iface_table is complete (in emitIfaceTableAndBareAccessors, which SteamInternal_CreateInterface -- emitted later -- also calls) -- avoids a circular forward-reference between the two generated sections without ever duplicating the lookup logic"
  - "isteamuserstats011.manifest.json's re-extraction via pnpm extract-proton-inventory silently dropped its pre-existing helperInterface field (extractProtonInventory.ts's main() never writes that field at all) -- a real regression the regeneration surfaced; restored by hand rather than teaching the extractor to preserve unknown fields, since this is the only manifest in the repo carrying one"
  - "SteamUser019/SteamFriends015/SteamUtils008/SteamApps008's family-wide wire-policy matches (GetHSteamUser/BLoggedOn/GetSteamID, GetPersonaName/GetPersonaState, 11 SteamUtils methods, 14 SteamApps methods) were force-reverted to stub mode post-extraction -- no measured macOS helper-dylib accessor exists for these version strings, and inventing one would violate D-09; SteamClient017's CreateSteamPipe/ConnectToGlobalUser keep their wire-policy-driven helperFallback:1 since that never requires a helperInterface at all"
  - "SHIM64_SERVED_INTERFACE_VERSIONS marks STEAMUSERSTATS_INTERFACE_VERSION011 'wire' (same arch-neutral dispatch code as its x86 Hoard coverage) and all nine other x64 entries 'stub'"

patterns-established:
  - "A disassembly-based ABI gate pattern for future arch/ABI claims: construct a minimal test-only manifest, run it through the real generator, make exactly the target symbol(s) dllexport via a scoped text substitution, compile with the pinned toolchain inside a fresh createFakeHomeProfile(), objdump, assert on the real instruction stream"

requirements-completed: []

coverage:
  - id: D1
    description: "A measured-correct 64-bit shim ships beside the 32-bit one (self=RCX/sretOut=RDX/plain retq on x64, ECX/ret $0x4 on i386, measured against the generator's OWN emitted code, not a synthetic free function)"
    verification:
      - kind: unit
        ref: "meta/__tests__/shimAbiGate.test.ts#shimAbiGate (51-15 Task 1 -- real compile + disassemble, not a synthetic free function) > all 3 cases (x64 sret register placement, i386 ret $0x4, x64 null-object plain retq)"
        status: pass
      - kind: other
        ref: "pnpm build-steam-bridge (real zig cc -target x86_64-windows-gnu compile gate; file reports PE32+ executable (DLL) x86-64 for public/bin/arm64/darwin/steam_api64.dll)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The modern-SDK lookup family resolves interface versions by the version string the game passes (SteamInternal_CreateInterface / SteamAPI_GetHSteamUser / SteamAPI_GetHSteamPipe), Win64-only, with an x64 null-object fallback for an unknown version"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts#51-15: Win64 shim generation (D-51-13 GO) > SteamInternal_CreateInterface (modern-SDK lookup family) and SteamClient-family GetISteamXxx version-lookup special case describe blocks"
        status: pass
    human_judgment: false
  - id: D3
    description: "ELEX (411300) evaluates to zero missing symbols against the 64-bit coverage sets, with SteamRemoteStorage and every null-object-fallback family it requests (SteamScreenshots, SteamHTTP, SteamUGC, SteamUnifiedMessages, SteamController, SteamAppList, SteamMusic, SteamMusicRemote) reported stubbed"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts#evaluateShimCoverage (51-15 Task 3 acceptance check -- ELEX, 411300, Win64) > zero missing symbols; SteamRemoteStorage plus every null-object-fallback family reports stubbed"
        status: pass
    human_judgment: false
  - id: D4
    description: "The fail-closed rule (steam_api64.dll import with no 64-bit shim present -> bottled Steam, 51-07) remains the guard for any build without steam_api64.dll"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts (x64 'shim-not-built' cases, unmodified by this plan's changes -- 2 tests still pass unchanged)"
        status: pass
    human_judgment: false

duration: ~3h
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 15: Win64 Shim, Modern-SDK Lookup Family, and ELEX Coverage Summary

**steam_api64.dll ships beside steam_api.dll (a real `zig cc -target x86_64-windows-gnu` compile gate), with a measured (not guessed) register-placement ABI gate, a SteamInternal_CreateInterface runtime-lookup family with an x64 null-object fallback, and ELEX's full 10-interface Win64 set evaluating to zero missing symbols.**

## Performance
- **Duration:** ~3h
- **Started:** 2026-10-21T08:08Z (session start, per STATE.md)
- **Completed:** 2026-10-21T11:14Z
- **Tasks:** 3 completed
- **Files modified:** 24 (6 created manifests, 1 created test, 1 created .def, 16 modified)

## Accomplishments
- Shipped a real, disassembly-verified Win64 shim: `meta/gen_vtables.ts` emits arch-correct code for a single, shared C source (no forked generator) compiled twice (`-target x86-windows-gnu` and `-target x86_64-windows-gnu`), and `meta/__tests__/shimAbiGate.test.ts` is the first gate in this repo that actually compiles and objdumps generator output rather than regex-matching source text.
- Discovered (via direct disassembly proof, not the research doc's free-function prototype) that the generator's existing explicit `(self, sretOut, ...)` C signature already produces the correct x64 register convention with zero arch-specific branching -- the planner's correction to 51-RESEARCH's "shift this to RDX" rule is empirically confirmed.
- Built the modern-SDK lookup family (`SteamInternal_CreateInterface`/`SteamAPI_GetHSteamUser`/`SteamAPI_GetHSteamPipe`) and the x64 null-object fallback (`X64_NULL_OBJECT_SLOTS = 256`), plus the SteamClient-family `GetISteamXxx` version-lookup special case in the generator.
- Recorded and shipped ELEX's (411300) full measured interface set via `pnpm extract-proton-inventory`, closing ROADMAP hazard (a) for the one real Win64-only acceptance title.

## Task Commits
1. **Task 1: x64 emission, modern-SDK lookup family, and the compile-and-disassemble ABI gate** - `0c78aaa3f` (feat)
2. **Task 2: Second build target -- steam_api64.dll beside steam_api.dll** - `ef99273a7` (feat)
3. **Task 3: ELEX interface set and the 64-bit coverage sets** - `5e42afe5c` (feat)

## Files Created/Modified
- `meta/gen_vtables.ts` - X64_NULL_OBJECT_SLOTS, MODERN_LOOKUP_FLAT_EXPORTS, the SteamClient version-lookup special case, archGuard applied to vtable sections/accessors, steam_api64.def generation
- `meta/__tests__/shimAbiGate.test.ts` - the real compile-and-disassemble ABI gate
- `meta/buildSteamBridgeShims.ts` - buildShim64CompileArgv/shim64OutputPath/compileShim64, wired into main()
- `meta/sdk/isteamclient017.manifest.json`, `isteamuser019.manifest.json`, `isteamfriends015.manifest.json`, `isteamutils008.manifest.json`, `isteamapps008.manifest.json`, `isteamremotestorage013.manifest.json` - ELEX's new x64-only interfaces (Proton-extracted, forced to stub where no verified helper path exists)
- `meta/sdk/isteamuserstats011.manifest.json`, `isteammatchmaking009.manifest.json`, `isteammatchmakingservers002.manifest.json`, `isteamnetworking005.manifest.json` - widened to `arches: ['x86','x64']` (shared Hoard/ELEX coverage)
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts` - SHIM64_EXPORTED_SYMBOLS/SHIM64_SERVED_INTERFACE_VERSIONS/SHIM_X64_NULL_OBJECT_FALLBACK populated
- `public/bin/.gitignore` - belt-and-braces rules for steam_api64.dll/.pdb

## Decisions Made
See `key-decisions` in the frontmatter -- six decisions, the most load-bearing being that the generator's existing sret signature is already x64-correct with no arch branching, and that brand-new x64-only manifests with no verified helper-dylib accessor are forced to stub rather than inventing one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] isteamuserstats011.manifest.json's re-extraction silently dropped its `helperInterface` field**
- **Found during:** Task 3, immediately after running `pnpm extract-proton-inventory` for the 7 ELEX versions
- **Issue:** `extractProtonInventory.ts`'s `main()` constructs a fresh manifest object with no `helperInterface` field at all, so re-extracting an EXISTING manifest (to pick up its widened `arches`) silently discarded the hand-curated `helperInterface: "SteamAPI_SteamUserStats_v013"` value -- `pnpm gen-vtables` then threw (`generateDispatchHeader: ... has a dispatch-eligible wire method ... but no manifest-level helperInterface`).
- **Fix:** Restored the field by hand at its original position (after `flatAccessor`).
- **Files modified:** `meta/sdk/isteamuserstats011.manifest.json`
- **Verification:** `pnpm gen-vtables` succeeds; `shimGenerate.test.ts`/`shimCoverage.test.ts` pass.
- **Commit:** `5e42afe5c`

**2. [Rule 1 - Bug] Four new ELEX manifests picked up family-wide wire-policy overrides with no verified helper path**
- **Found during:** Task 3, same `pnpm gen-vtables` run
- **Issue:** `wire-policy.json` applies by FAMILY (not exact version), so `SteamUser019`/`SteamFriends015`/`SteamUtils008`/`SteamApps008` inherited existing wire-policy entries meant for the x86 manifests of the same family, making 3/2/11/14 of their methods dispatch-eligible with no `helperInterface` -- and no measured macOS dylib accessor exists for these NEW version strings (D-09 forbids inventing one).
- **Fix:** Stripped the wire-policy-injected `helperFlat`/`mode` from those specific methods post-extraction, forcing them back to inheriting the manifest's `mode: 'stub'` default. Methods using `helperFallback` (never dispatch-eligible) were left untouched.
- **Files modified:** `meta/sdk/isteamuser019.manifest.json`, `isteamfriends015.manifest.json`, `isteamutils008.manifest.json`, `isteamapps008.manifest.json`
- **Verification:** `pnpm gen-vtables` succeeds; `shimCoverage.test.ts`'s ELEX acceptance test reports zero missing symbols with these four served as stub.
- **Commit:** `5e42afe5c`

### Out-of-scope findings (not fixed, scope boundary)

**3. Pre-existing: `sidecarRejectionGuard.test.ts`'s WR-04 floating-promise scan flags `allowlist.ts`'s `_knownBadReasonExhaustiveness`** -- reproduced against the unmodified pre-plan base commit (`b16e775fc`) via a throwaway `git worktree`, confirming this is unrelated to any change in this plan. Not fixed (scope boundary: pre-existing, unrelated file).

**4. Pre-existing: `pnpm lint:tests` already exceeds its 648-warning ceiling at 652** -- also reproduced against the unmodified base commit the same way. Not fixed (scope boundary).

Attempted to log both to `.planning/WINDOWS.md` via `gsd_run windows append` -- the ledger's own table already disagrees with its fenced JSON source for an unrelated pre-existing row (id 3), which the tool refuses to write through (best-effort per the ledger's own contract; not blocking). Recorded here instead.

**Total deviations:** 2 auto-fixed (both Rule 1 bugs surfaced by the extraction tooling itself), 2 pre-existing out-of-scope findings documented but not fixed. **Impact:** none of the four affect this plan's own deliverables; both auto-fixes were required for `pnpm gen-vtables` to succeed at all.

## Issues Encountered
None beyond the deviations above.

## Authentication Gates
None.

## User Setup Required
None - no external service configuration required. `zig 0.16.0` was already cached locally at `.build-tools/zig/zig` from prior research; `pnpm build-steam-bridge` will re-download it on a cold machine via the existing `meta/downloadZig.ts` pinned-checksum flow.

## Known Stubs
None beyond what the coverage model itself tracks as honest, intentional stubs (ROADMAP sub-decision 1): ELEX's six new interfaces (`SteamClient017`/`SteamUser019`/`SteamFriends015`/`SteamUtils008`/`STEAMAPPS_INTERFACE_VERSION008`/`STEAMREMOTESTORAGE_INTERFACE_VERSION013`) and the three shared matchmaking-family interfaces are served as `mode: 'stub'` -- reported to the user via D-51-02's one-time notice, not silently invented as real dispatch.

## Next Phase Readiness
The Win64 target is fully shipped and verified (real compile, real disassembly, real coverage check). `51-16`/`51-18` (UI surfacing of bridge coverage, closing census) can read `SHIM64_EXPORTED_SYMBOLS`/`SHIM64_SERVED_INTERFACE_VERSIONS`/`SHIM_X64_NULL_OBJECT_FALLBACK` directly -- no further plumbing needed from this plan. No blockers for downstream work.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*

## Self-Check: PASSED

All 9 created/modified files listed above confirmed present on disk; all 3 task commit hashes (`0c78aaa3f`, `ef99273a7`, `5e42afe5c`) confirmed in `git log`.
