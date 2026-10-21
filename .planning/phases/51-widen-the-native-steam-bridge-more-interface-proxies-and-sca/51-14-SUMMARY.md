---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 14
subsystem: infra
tags: [steam-bridge, proton, vtable-generator, shim-coverage, zig-cc, tdd]

# Dependency graph
requires:
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 11)
    provides: extractProtonInventory.ts, acceptance-interface-versions.json, wire-policy.json, SHIM_EXPORTED_SYMBOLS/SHIM_SERVED_INTERFACE_VERSIONS foundations
provides:
  - "Stub-mode manifests for ISteamRemoteStorage (005 + Hoard's 010), ISteamMatchmaking009, ISteamMatchmakingServers002, ISteamNetworking005"
  - "GAMESERVER_FLAT_STUBS: 11 cdecl flat exports answering the SteamGameServer* family as honest-unavailable"
  - "shimCoverage.ts now reports zero missingSymbols for both XCOM and Hoard, with the second/last interface groups reported stubbed"
  - "Two generator bugs fixed in extractProtonInventory.ts: sret-vs-pointer misclassification, and sret hidden-pointer stripped from the wrong end of the param list"
  - "gen_vtables.ts's cType() no longer echoes an undefined opaque struct type name into generated C"
affects: [51-16, 51-18, D-51-02-notice, bridgeRoute]

actuals:
  tokens: 39800
  tasks: 2
  commits: 3
  plan_head_before: 9476ae6d4728d2798f9b49719bfb22b665a7eb7c
  plan_head_after: 9223c424170992e2a350760bd4ddbe2e02092fb5

tech-stack:
  added: []
  patterns:
    - "Stub-mode manifest extraction via pnpm extract-proton-inventory --versions, no wire-policy entry needed when every method should just answer unavailable"
    - "GAMESERVER_FLAT_STUBS mirrors FLAT_EXPORTS_SUPERSET's shape: a flat, arch-agnostic cdecl export list + body table, wired into both generateShimC and generateDefFile"

key-files:
  created:
    - meta/sdk/isteamremotestorage005.manifest.json
    - meta/sdk/isteamremotestorage010.manifest.json
    - meta/sdk/isteammatchmaking009.manifest.json
    - meta/sdk/isteammatchmakingservers002.manifest.json
    - meta/sdk/isteamnetworking005.manifest.json
  modified:
    - meta/extractProtonInventory.ts
    - meta/gen_vtables.ts
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/ordinals.json
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api.def
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts

key-decisions:
  - "SteamMatchmaking/SteamMatchmakingServers manifest `family` field uses Proton's real lowercase-m filename casing (winISteamMatchmaking.c) so the extractor's network fetch succeeds; shimCoverage.ts's hand-authored SHIM_SERVED_INTERFACE_VERSIONS still records the capital-M family string the plan's acceptance behavior expects in stubbedInterfaces -- the two are independent, never required to match"
  - "SteamMatchMakingServers002's ReleaseRequest has no __thiscall body anywhere in Proton's pinned source (confirmed by direct inspection) -- fell back to a stackBytes-only synthetic shape (void return, one dummy param) rather than inventing a signature from outside SDK knowledge (D-09); safe because stub generation never reads params[] for code emission, only stackBytes for correct __thiscall callee-cleanup"
  - "Fixed two pre-existing bugs in classifyProtonReturn/parseProtonThunks discovered by this plan's new data: (1) any trailing-'*' return type was wrongly treated as the sret convention -- now only CSteamID/CGameID are; (2) the sret hidden _ret pointer was stripped from the END of the real-params list instead of the START (right after `this`), silently dropping a real trailing arg on any sret method with more than zero real args -- both fixes apply only to this plan's new manifests; the already-shipped isteamfriends*.manifest.json files carry the old (cosmetic-only) inaccuracy, logged to deferred-items.md rather than regenerated"

requirements-completed: []

coverage:
  - id: D1
    description: "ISteamRemoteStorage served as cloud-disabled (IsCloudEnabledForAccount/App false, reads 0, writes false) for both XCOM (005) and Hoard (010)"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts#evaluateShimCoverage (51-14 Task 2 acceptance check -- XCOM: Enemy Unknown, 200510) > zero missing symbols; the second/last-group families report stubbed, sorted"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts#evaluateShimCoverage (Hoard: 63000) -- 51-14: the second/last-group families now stubbed for Hoard specifically > zero missing symbols; SteamMatchMaking/SteamNetworking/SteamRemoteStorage report stubbed, sorted"
        status: pass
    human_judgment: false
  - id: D2
    description: "ISteamMatchmaking, ISteamMatchmakingServers, ISteamNetworking served as unavailable stubs (P2P join stays out of scope)"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts (same two tests as D1, same result set covers all four families)"
        status: pass
    human_judgment: false
  - id: D3
    description: "XCOM's nine SteamGameServer* imports exported as honest unavailable stubs (SteamGameServer_Init returns false, accessors return NULL) so the exe loads"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts#GAMESERVER_FLAT_STUBS (51-14 Task 2)"
        status: pass
      - kind: other
        ref: "pnpm build-steam-bridge (zig cc compile gate against the generated steam_api_shim.c / steam_api.def)"
        status: pass
    human_judgment: false
  - id: D4
    description: "XCOM's and Hoard's full import sets evaluate to zero missing symbols"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts (both XCOM and Hoard acceptance describe blocks, missingSymbols === [])"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 14: Second/Last Interface Group + GameServer Stubs Summary

**ISteamRemoteStorage (cloud-disabled), ISteamMatchmaking/MatchmakingServers/Networking (unavailable), and the eleven-symbol SteamGameServer* cdecl flat-stub family, closing coverage to zero missing symbols for both XCOM and Hoard.**

## Performance

- **Duration:** 70 min
- **Tasks:** 2
- **Files modified:** 15 (5 new manifests, 10 modified)

## Accomplishments

- Extracted five stub-mode manifests from Proton's pinned `proton_9.0` source: `STEAMREMOTESTORAGE_INTERFACE_VERSION005`/`010`, `SteamMatchMaking009`, `SteamMatchMakingServers002`, `SteamNetworking005` — every method defaults to stub (no wire-policy entry for these families), so RemoteStorage reports cloud-disabled and the networking/matchmaking trio report unavailable.
- Added `GAMESERVER_FLAT_STUBS` to `gen_vtables.ts`: eleven plain-cdecl `(void)` flat exports answering the entire `SteamGameServer*` surface as unavailable (`SteamGameServer_Init` returns 0, the four accessor functions return `NULL`), wired into both `generateShimC` and `generateDefFile` the same way `FLAT_EXPORTS_SUPERSET` already is.
- `shimCoverage.ts` now reports **zero `missingSymbols`** for both XCOM's and Hoard's real captured import tables (`shimCoverage.test.ts`'s two acceptance describe blocks), with the second/last-group families surfacing in `stubbedInterfaces` instead — feeding D-51-02's one-time stubbed-interface notice.
- Fixed two generator bugs in `extractProtonInventory.ts` exposed by this plan's new data (a genuine `void *` register-return and an sret method with a real arg after the hidden pointer, neither pattern exercised by 51-11's five families): the sret/pointer-return misclassification, and the hidden `_ret` param being stripped from the wrong end of the real-params list.
- Fixed `gen_vtables.ts`'s `cType()` to fall back to a generic `void *` for any pointer-returning method whose base type is an opaque struct the shim never defines (`gameserveritem_t_105*` from `GetServerDetails`) — the previous unconditional echo failed the `zig cc` compile gate.

## Task Commits

1. **Task 1: Extract the cloud-disabled and unavailable stub manifests** - `47d900401` (feat)
2. **Task 2: GameServer flat stubs, regenerate, coverage reaches zero missing (TDD)** - `43de57648` (test, RED), `9223c4241` (feat, GREEN)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `meta/sdk/isteamremotestorage005.manifest.json` / `isteamremotestorage010.manifest.json` - ISteamRemoteStorage, XCOM's and Hoard's measured versions, stub mode
- `meta/sdk/isteammatchmaking009.manifest.json` - ISteamMatchmaking009, stub mode (shared by XCOM and Hoard)
- `meta/sdk/isteammatchmakingservers002.manifest.json` - ISteamMatchmakingServers002, stub mode, including the ReleaseRequest fallback shape
- `meta/sdk/isteamnetworking005.manifest.json` - ISteamNetworking005, stub mode (shared by XCOM and Hoard)
- `meta/extractProtonInventory.ts` - sret-vs-pointer classification fix, hidden-`_ret`-position fix, missing-body fallback for ReleaseRequest
- `meta/gen_vtables.ts` - `GAMESERVER_FLAT_STUBS` + bodies, wired into `generateShimC`/`generateDefFile`; `cType()` opaque-pointer fallback
- `native/steam-bridge/generated/steam_api_shim.c` / `steam_api.def` - regenerated (15 interfaces, 560 vtable slots, 25 flat exports)
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts` - new flat/bare accessors and `SHIM_SERVED_INTERFACE_VERSIONS` stub entries for the four families
- `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` - XCOM/Hoard acceptance checks updated from "missing" to "zero missing, stubbed"; two now-stale unit tests re-pointed from SteamRemoteStorage to SteamHTTP as the still-uncovered example
- `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` - 24-CR-02 "every exported symbol" fixture embeds the four new families' version strings

## Decisions Made

See `key-decisions` in frontmatter: family-casing split between the manifest's Proton-fetch key and shimCoverage's hand-authored served-family string; the ReleaseRequest stackBytes-only fallback (D-09 compliant); and the two extractor bug fixes scoped to this plan's new manifests only (old isteamfriends* manifests left as-is, logged to deferred-items.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `classifyProtonReturn` crashed on a genuine `void *` register-return**
- **Found during:** Task 1 (extracting `SteamMatchMakingServers002`)
- **Issue:** Any return type ending in `*` was unconditionally treated as the MSVC sret-struct convention; `RequestInternetServerList`'s real `void *` handle return has no known struct size, throwing `unrecognized struct type "void"`.
- **Fix:** Only classify as sret when the base type is a known by-value struct (`CSteamID`/`CGameID`); everything else is a plain `returnKind: 'pointer'`.
- **Files modified:** `meta/extractProtonInventory.ts`
- **Verification:** `meta/__tests__/extractProtonInventory.test.ts` (24 passed), manifest re-extraction succeeds
- **Committed in:** `47d900401`

**2. [Rule 1 - Bug] sret hidden `_ret` param stripped from the wrong end**
- **Found during:** Task 1 (`SteamMatchMaking009`'s `GetLobbyOwner`/`GetLobbyByIndex`/`GetLobbyMemberByIndex`)
- **Issue:** The code assumed the hidden sret pointer was the LAST stack param; Proton's real convention places it FIRST (right after `this`). Any sret method with a real arg after it had that real arg dropped while the synthetic `_ret` leaked into `params[]`.
- **Fix:** Strip the first element after `this` instead of the last.
- **Files modified:** `meta/extractProtonInventory.ts`
- **Verification:** `meta/__tests__/extractProtonInventory.test.ts` passes; manifest spot-checked (`GetLobbyOwner.params === [{steamIDLobby: CSteamID}]`)
- **Committed in:** `47d900401`

**3. [Rule 3 - Blocking] `ReleaseRequest`'s body is genuinely absent from Proton's pinned source**
- **Found during:** Task 1 (`SteamMatchMakingServers002`)
- **Issue:** `DEFINE_THISCALL_WRAPPER` and the `__ASM_VTABLE` slot both reference `ReleaseRequest`, but no `__thiscall` function body exists anywhere in the fetched file — confirmed by direct inspection, not a parser bug.
- **Fix:** Fall back to a stackBytes-only synthetic shape (the ONE fact Proton's source does give — the wrapper's total stack width), never inventing param names/types from outside knowledge (D-09).
- **Files modified:** `meta/extractProtonInventory.ts`
- **Verification:** Manifest has 17 contiguous slots (0..16), `validateManifest` passes, `pnpm build-steam-bridge` compiles
- **Committed in:** `47d900401`

**4. [Rule 1 - Bug] `cType()` echoed an undefined opaque struct type into generated C**
- **Found during:** Task 2 (`pnpm build-steam-bridge` compile gate)
- **Issue:** `GetServerDetails` returns `gameserveritem_t_105 *`; the default branch echoed that unrecognized name verbatim, and the shim has no such struct defined — `zig cc` failed with "unknown type name".
- **Fix:** Fall back to a generic `void *` for any unrecognized trailing-`*` type — ABI-equivalent for a stub that never constructs/dereferences the real struct.
- **Files modified:** `meta/gen_vtables.ts`
- **Verification:** `pnpm build-steam-bridge` compile gate passes
- **Committed in:** `9223c4241`

**5. [Rule 1 - Bug] `shimGenerate.test.ts`'s 24-CR-02 fixture went stale**
- **Found during:** Task 2 (post-implementation full-suite sweep)
- **Issue:** The "every exported symbol is placed, not rejected" test's synthetic original-dll bytes didn't embed the four new families' version strings, so the widened bare-accessor set produced unresolvable versions and the test flipped from `placed` to `miss`.
- **Fix:** Embedded `STEAMREMOTESTORAGE_INTERFACE_VERSION005`/`SteamMatchMaking009`/`SteamMatchMakingServers002`/`SteamNetworking005` in the fixture string, per the test's own documented contract ("their version strings must be embedded here too").
- **Files modified:** `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`
- **Verification:** `shimGenerate.test.ts` (26 passed); full `steam`-scoped jest sweep (2735 passed, 0 failed)
- **Committed in:** `9223c4241`

---

**Total deviations:** 5 auto-fixed (3 Rule 1 bugs in the extractor/generator discovered by new data, 1 Rule 3 blocking data gap with a D-09-safe fallback, 1 Rule 1 stale cross-cutting test fixture).
**Impact on plan:** All five were necessary for correctness (two would have silently corrupted manifest data for future extractions; two blocked the compile gate outright; one was a genuine test regression this plan's widening caused). No scope creep — none touch files outside this plan's natural blast radius.

## Issues Encountered

- The already-shipped `isteamfriends.manifest.json`/`isteamfriends011.manifest.json`/`isteamfriends013.manifest.json` (51-11) carry the SAME sret-param-stripping inaccuracy fixed in deviation #2 above, for every `GetXByIndex`-shaped method. This is documentary-only (stub generation never reads `params[]` by name, only `stackBytes`) and the files sit outside this plan's scope — logged to `deferred-items.md` rather than regenerated.
- `gsd_run windows append` (deviation ledger population) failed with a pre-existing data-integrity error in `.planning/WINDOWS.md` ("Ledger table disagrees with the fenced JSON entries ... row id 3") unrelated to this plan's changes. Per the ledger's own best-effort contract, this did not block execution; the five deviations above are still fully documented in this SUMMARY's "Deviations from Plan" section.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The locked interface order (ROADMAP sub-decision 1) is now fully served for both acceptance-set titles; D-51-14's acceptance ("XCOM loads at all") is met via the compile gate + zero-missing coverage check.
- `shimCoverage.ts`'s widened `stubbedInterfaces` output is ready for D-51-02's one-time stubbed-interface notice (51-13's route-notice dialog plumbing) to surface these four families to the user.
- `deferred-items.md` carries one new entry for a future `ISteamFriends`-touching plan (or a dedicated extractor-output refresh) to regenerate the three pre-51-14 manifests with the corrected sret param ordering.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*

## Self-Check: PASSED
