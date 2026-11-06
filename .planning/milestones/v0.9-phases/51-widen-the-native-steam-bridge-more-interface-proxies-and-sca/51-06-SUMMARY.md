---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 06
subsystem: steam-bridge
tags: [steam, native-bridge, codegen, abi, macos, zig, c, wire-protocol]

# Dependency graph
requires:
  - phase: 51
    provides: "51-01's per-appId bridge helper registry, gamelib_bridge.cfg port handoff, and shim identity marker; 51-03's shimCoverage.ts (SHIM_EXPORTED_SYMBOLS / SHIM_SERVED_INTERFACE_VERSIONS)"
provides:
  - "Manifest schema v2 (InterfaceManifestV2/MethodSignatureV2): schemaVersion, family, arches, mode, complete, source, flatAccessor, helperInterface?; returnKind-driven ABI shape, stackBytes, kind/valueType/sizeParam for wire params"
  - "validateManifest(manifest, allManifests?): ordinal range/duplicate, slot-gap-when-complete, wire computeRetN==stackBytes, unknown returnKind, class-without-structSize, _TESTONLY, and the three wire-param-kind checks (pointer-without-kind, out-buffer-without-sizeParam, by-value-struct-param)"
  - "MSVC class-return ABI fix: a sret stub declares void * and returns sretOut (Proton-verified convention), fixing the GetSteamID EDX:EAX defect; THISCALL macro guarded on __i386__ so one generated .c targets a future x64 build too"
  - "Stub-mode emission driven purely by stackBytes (never by params[]); g_iface_table[] + resolve_bare_iface() + one bare legacy accessor per family (SteamUser, SteamFriends), selected per game via gamelib_bridge.cfg's iface.<Family>=<Version>; generateDefFile(manifests, arch)"
  - "Wire marshaling for in-string (request), out-value and out-buffer (response) param kinds, plus helperFallback's no-network constant answer; WIRE_LAYOUT_DOC as the shared contract 51-10's helper-side generator will mirror"
affects: [51-10, 51-11, 51-14, 51-15, steam-bridge, steam-bridge-shim, steam-bridge-coverage]

# Actuals (#2632)
actuals:
  tokens: 23540
  tasks: 3
  commits: 6
  plan_head_before: 3a01dea1f
  plan_head_after: b8c6a4966ccd77f3e7a2f306f13edfc8f18b9191

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "returnKind as the single generator-facing return-shape discriminant (replacing structSize>8/type-string inference) -- isSretReturn/is64BitRegisterReturn/isStringReturn/computeRetN all derive from it alone"
    - "Directory-driven manifest loading (readdirSync(meta/sdk), sorted by ordinal) replacing two literal loadManifest() calls, so adding an interface version is 'drop a file', never a generator edit"
    - "Stub emission keyed on stackBytes, never on params[] -- a stub's C signature can never diverge from the real ABI stack contract even when its param description is incomplete/placeholder"
    - "THISCALL macro (#if defined(__i386__)) instead of a literal __attribute__((thiscall)) on every stub, so the SAME generated .c source is the one 51-15 reuses for an x64 target with zero forked generator path"
    - "Runtime argOff/respOff cursor-based request/response (de)marshaling for variable-length wire fields (in-string, out-buffer), replacing the old fully-static per-param byte offsets -- a fixed WORST-CASE buffer size is still computed at generation time so no dynamic allocation is needed in the stub"

key-files:
  created:
    - meta/__tests__/fixtures/abi-exercise.manifest.json
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/sdk/isteamuser.manifest.json
    - meta/sdk/isteamfriends.manifest.json
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api.def
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts

key-decisions:
  - "Schema v2's full TS shape (InterfaceManifestV2/MethodSignatureV2, including kind/valueType/sizeParam/helperFlat/helperFallback) was defined entirely in Task 1, even though wire-param-kind marshaling and helperFallback behavior were not implemented until Task 3 -- matches the plan's own 'Implement schema v2 exactly as listed under Artifacts' instruction and avoids a field being added to the type mid-plan"
  - "A stub method's dummy-param count comes ONLY from stackBytes, never from method.params -- deliberately so a stub can never corrupt the caller's stack even when its params[] is an incomplete/placeholder description (the exact situation 51-11 inherits before it completes the real layouts)"
  - "An out-buffer param's sibling sizeParam is ALSO independently sent via its own normal 'value'-kind encoding (not suppressed) -- a small, accepted redundancy that avoids a second 'this param is consumed elsewhere, do not encode it' special case in packArgsBlock"
  - "helperFallback short-circuits BEFORE the stub/wire branch entirely and reuses the method's real params[] for its C signature (unlike a stub, which cannot trust params[]) -- a helperFallback method is assumed to have an accurate signature, just no real backend call behind it"
  - "The committed abi-exercise.manifest.json fixture is never fed through main()'s generation-refusal validateManifest gate (that walks meta/sdk only) -- its deliberate _TESTONLY names and (for the pre-Task-3 SetPersonaNameTest_TESTONLY slot) a bare pointer param with no kind are therefore expected validateManifest findings, not defects; only the two new Task 3 slots were asserted error-free on the wire-param-kind checks specifically"

requirements-completed: []

coverage:
  - id: D1
    description: "Manifest schema v2 + validateManifest + MSVC class-return ABI fix: GetSteamID emits an SRET stub (void *, returns sretOut) instead of the old EDX:EAX register-return defect; synthetic _TESTONLY slots moved out of production manifests into a dedicated test fixture; main() loads meta/sdk via a directory listing and refuses to generate on any validation error"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts (61 tests: ABI/sret/validateManifest describes)"
        status: pass
      - kind: other
        ref: "pnpm build-steam-bridge (real zig cc -target x86-windows-gnu compile of the regenerated shim)"
        status: pass
    human_judgment: false
  - id: D2
    description: "stackBytes-exact stub emission (never from params[]), g_iface_table + resolve_bare_iface + one bare legacy accessor per family (SteamUser, SteamFriends) selected via gamelib_bridge.cfg's iface.<Family>=<Version>, generateDefFile(manifests, arch) filtering by arches, shimCoverage.ts's SHIM_EXPORTED_SYMBOLS gaining the two bare symbols"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts (stub emission / bareAccessorName / g_iface_table / generateDefFile describes); src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts (24-CR-02 .def pin, re-verified green with the two new symbols)"
        status: pass
      - kind: other
        ref: "grep -xc SteamUser / SteamFriends native/steam-bridge/generated/steam_api.def (both print 1); grep -c g_iface_table native/steam-bridge/generated/steam_api_shim.c (prints 4); pnpm build-steam-bridge"
        status: pass
    human_judgment: false
  - id: D3
    description: "Wire marshaling for in-string (request), out-value and out-buffer (response) param kinds; helperFallback's no-bridge_transact constant answer; WIRE_LAYOUT_DOC exported and embedded in the generated header for 51-10 to mirror"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts (in-string NULL sentinel, out-value NULL-pointer skip, out-buffer capacity cap/truncation/NUL-termination, helperFallback, three new validateManifest wire-param-kind checks)"
        status: pass
      - kind: other
        ref: "Standalone zig cc -target x86-windows-gnu compile of the fixture-only generated shim (manual verification, not part of the committed build; exit 0, one pre-existing unrelated warning); pnpm build-steam-bridge re-verified green against the unchanged-shape production manifests"
        status: pass
    human_judgment: false

# Metrics
duration: ~2h of agent execution (single continuous session)
completed: 2026-10-17
status: complete
---

# Phase 51 Plan 06: Manifest Schema v2, Class-Return ABI Fix, and Wire Marshaling Summary

**Upgraded the Steam bridge shim generator from two hand-wired partial interfaces to a schema-v2, manifest-driven generator with a Proton-verified MSVC class-return ABI fix, stackBytes-exact stub emission, cfg-selected bare legacy accessors, and in-string/out-value/out-buffer wire marshaling — all three tasks real-compiled under the pinned zig toolchain.**

## Performance

- **Duration:** ~2h of agent execution, single continuous session
- **Tasks:** 3 (all `type="auto" tdd="true"`, each RED commit then GREEN commit)
- **Files modified:** 8 (1 created, 7 modified, excluding `.planning/`)
- **Commits:** 6 (`a80b5d20e`, `122c932e7`, `99f8bc667`, `5046a6052`, `fd702b8c1`, `b8c6a4966`)

## Accomplishments

- Fixed the MSVC class-return ABI defect the planner found 2026-10-17 (VERIFIED against Proton `proton_9.0/lsteamclient/winISteamUser.c`): `GetSteamID`'s stub now declares `void *` and returns `sretOut` — the previous stub returned `uint64_t` via EDX:EAX, which would have silently corrupted every real game's `CSteamID` consumption and the stack of the NEXT vtable call after it.
- Manifest schema v2 is fully in place: `schemaVersion`, `family`, `arches`, `mode`, `complete`, `source`, `flatAccessor`, and a `returnKind` discriminant that now SOLELY drives `isSretReturn`/`is64BitRegisterReturn`/`isStringReturn`/`computeRetN` (replacing the old `structSize > 8` / type-string inference, which could never tell an 8-byte-or-less struct return apart from a genuine 8-byte register return).
- `validateManifest` catches seven structural defect classes before generation ever runs (reserved/duplicate ordinals, slot gaps, a wire method's `stackBytes` disagreeing with its own declared params, unknown `returnKind`, a class return missing `structSize`, any `_TESTONLY` name surviving into `meta/sdk`) plus three wire-specific ones added in Task 3 (a pointer param with no kind, an out-buffer missing `sizeParam`, a by-value struct param) — `main()` now walks `meta/sdk` via a directory listing and refuses to generate, listing every error, on any failure.
- Stub emission is now driven purely by `stackBytes`, never by a method's (possibly incomplete) `params[]` — the exact situation 51-11 inherits before it finishes authoring the real per-version layouts. A class-returning stub still takes the real `sretOut` pointer and zero-fills the caller's buffer; every other kind answers a canned zero/NULL/empty-string value, and no stub ever calls `bridge_transact`.
- Bare legacy accessors (`SteamUser()`, `SteamFriends()`) are now generated once per family, resolved at runtime through a new `g_iface_table[]` + `resolve_bare_iface()` against `gamelib_bridge.cfg`'s `iface.<Family>=<Version>` lines (the cfg loader's single-return-on-port-found bug was fixed so it keeps scanning the rest of the file). `shimCoverage.ts`'s `SHIM_EXPORTED_SYMBOLS` gained both bare symbols, keeping the 24-CR-02 `.def` pin green.
- Wire marshaling now supports in-string request params (length-prefixed, NULL-sentinel, capped), out-value response params (decoded after the base return value, written only when the caller's pointer is non-NULL), and out-buffer response params (capacity-capped, truncated on decode, NUL-terminated for `char*`) — plus `helperFallback`, which answers a declared constant with zero network traffic. The exact layout is captured once as `WIRE_LAYOUT_DOC` and embedded verbatim in the generated shim header so 51-10's helper-side generator decodes the identical frame.
- Every task's generated-source change was proven against the REAL `zig cc -target x86-windows-gnu` compile gate (`pnpm build-steam-bridge`), not just the TypeScript-level string-match tests — including a standalone manual compile of the fixture-only shim (not part of the committed build) to prove the new in-string/out-value/out-buffer C code assembles correctly, since neither new fixture method is wired into a production manifest this plan touches.

## Task Commits

Each task followed RED-GREEN TDD with separate commits:

1. **Task 1 RED: schema v2 manifests + sret ABI fix** - `a80b5d20e` (test)
2. **Task 1 GREEN: schema v2 generator + MSVC class-return ABI fix** - `122c932e7` (feat)
3. **Task 2 RED: stub emission, bare accessors, cfg iface parsing** - `99f8bc667` (test)
4. **Task 2 GREEN: stackBytes-exact stubs, g_iface_table, cfg-selected bare accessors** - `5046a6052` (feat)
5. **Task 3 RED: wire marshaling for in-string/out-value/out-buffer** - `fd702b8c1` (test)
6. **Task 3 GREEN: wire marshaling + helperFallback** - `b8c6a4966` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `meta/gen_vtables.ts` - schema v2 types; `validateManifest`; `returnKind`-driven ABI predicates; `THISCALL` macro; stub emission (`emitStubBody`); `bareAccessorName`; `g_iface_table`/`resolve_bare_iface`/bare accessor emission (`emitIfaceTableAndBareAccessors`); cfg loader's bounded `iface.*` parsing; `generateDefFile(manifests, arch)`; `packArgsBlock`'s kind-aware request encoding; the generic register-return branch's out-value/out-buffer response decode; `helperFallback` short-circuit; `WIRE_LAYOUT_DOC`
- `meta/__tests__/gen_vtables.test.ts` - rewritten for schema v2; retargeted ret-N tests to the fixture; replaced the EDX:EAX GetSteamID expectation with the SRET expectation; added `validateManifest`, stub-emission, `bareAccessorName`, `g_iface_table`, `generateDefFile(arch)`, wire-marshaling, and `helperFallback` test suites (61 tests total)
- `meta/__tests__/fixtures/abi-exercise.manifest.json` (new) - the five original synthetic ABI-exercise slots (renumbered 0-4) plus two new Task 3 slots (`GetStatTest_TESTONLY`, `GetDirTest_TESTONLY`)
- `meta/sdk/isteamuser.manifest.json` - schema v2; `GetHSteamUser`/`BLoggedOn`/`GetSteamID` only (slots 3+ were fabricated, dropped pending 51-11); `GetSteamID` is now `returnKind: 'class'`
- `meta/sdk/isteamfriends.manifest.json` - schema v2; `GetPersonaName` only
- `native/steam-bridge/generated/steam_api_shim.c` - regenerated three times (one per task); `.def` unchanged in Task 1/3, gained `SteamFriends`/`SteamUser` in Task 2
- `native/steam-bridge/generated/steam_api.def` - gained the two bare accessor exports (Task 2)
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts` - `SHIM_EXPORTED_SYMBOLS` gained `SteamUser`/`SteamFriends`

## Decisions Made

See `key-decisions` in frontmatter: schema v2's full TS shape defined upfront in Task 1; stub dummy-param count sourced only from `stackBytes`; an out-buffer's `sizeParam` sibling is independently (redundantly) encoded rather than suppressed; `helperFallback` trusts `params[]` unlike a stub; the fixture is never validated through `main()`'s refusal gate.

## Deviations from Plan

None - plan executed exactly as written. Two test-authoring mistakes were caught and self-corrected during the RED/GREEN loop before any commit (a `stackBytes` arithmetic error in an inline test manifest, and an incorrect "fixture validates clean" assertion that didn't account for the fixture's own deliberate `_TESTONLY` names) — neither reached a commit in its wrong form, so there is nothing to document as a deviation.

## Issues Encountered

- `meta/__tests__/findDeadcode.test.ts` and `meta/__tests__/genI18nGateScope.test.ts` fail on this branch independently of this plan's changes (confirmed by `git stash`-ing this plan's work and re-running both — identical failures on the pre-existing tree). Out of scope per the deviation rules' scope boundary; not touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 51-10 (helper-side dispatch generation) can now generate `bridge_dispatch.h` from the SAME manifests and the SAME `WIRE_LAYOUT_DOC` contract this plan documents — the shim and helper decode/encode the identical frame by construction, not by hand-sync.
- 51-11 (ISteamUtils/ISteamApps/ISteamUserStats + old SteamUser016/SteamFriends011 versions) can author new schema-v2 manifests directly against the validated shape, using `mode: 'stub'` for not-yet-wired methods and the wire-param-kind checks to catch authoring mistakes before generation.
- 51-15 (x64 target) inherits the `THISCALL` macro's `__i386__` guard and `generateDefFile`'s `arch` parameter with no generator fork needed — `arches` is already a per-manifest array field ready for a `'x64'` entry.
- No blockers. `pnpm gen-vtables` produces no diff on repeat runs, `meta/__tests__/gen_vtables.test.ts` is green (61/61), `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` and `shimGenerate.test.ts` are green, and `pnpm build-steam-bridge`'s real `zig cc` compile gate passes.

## Self-Check: PASSED

- FOUND: `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-06-SUMMARY.md`
- FOUND commit `a80b5d20e` (Task 1 RED)
- FOUND commit `122c932e7` (Task 1 GREEN)
- FOUND commit `99f8bc667` (Task 2 RED)
- FOUND commit `5046a6052` (Task 2 GREEN)
- FOUND commit `fd702b8c1` (Task 3 RED)
- FOUND commit `b8c6a4966` (Task 3 GREEN)
- `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated/` re-run clean at close-out
- `pnpm build-steam-bridge` re-run clean at close-out: "Compile gate PASSED"
- `npx jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` re-run clean: 98/98 tests

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-17*
