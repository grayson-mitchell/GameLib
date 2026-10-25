# Quick Task 261025-t7i: Shim legacy CSteamworks exports and old-SDK interface versions - Context

**Gathered:** 2026-10-25
**Status:** Ready for planning

<domain>
## Task Boundary

Close `.planning/todos/pending/2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md`
for Unclaimed World (284100) on x64. Step 3 (AnyCPU arch) already shipped in 53-02/53-05. Remaining:
- the x64 legacy exports
- the SDK 1.34 interface versions the Steamworks.NET 7.0.0 wrapper requests
- restoring the original steam_api DLLs
- a live check

</domain>

<decisions>
## Implementation Decisions

### Restore route (operator, 2026-10-25)
- First choice: the operator runs `download_depot 284100 284101 3159369609451446961` in the Mac Steam
  console. Confirm the depot id and GID from the bottle's ACF before asking. The orchestrator then copies the
  two original DLLs over the shims. The next placement creates `.gamelib-orig` on its own.
- If the Mac console cannot fetch the Windows depot, do not build a restore helper in this task. Split
  instead: this task delivers the code change plus a "crash gone, plays offline" live check, and a GameLib
  depot single-file restore helper goes to a follow-up todo.

### Verification rule (operator)
- Keep the 53-11 rule unchanged. Unclaimed World references no identity API, so a clean run with HELLO plus
  stats calls is recorded as working but NOT "verified". The todo closes on the code change plus live evidence.
  Do not loosen the census rule.

### Scope
- x64 only. The x86 gap (17 exports, SteamClient015, VR_*) stays deferred under D-53-09. Record it in the
  closure note.
- The 15 placed shims across 12 other bridge bottles with no `.gamelib-orig` get a follow-up todo. Do not
  restore them here.

### Claude's Discretion
- How `*_InitSafe` reuses the existing init path. It must report init exactly once (init code 2), and must not
  call `SteamAPI_Init()` a second time.
- How the `g_pSteamClientGameServer` data export is emitted.

</decisions>

<specifics>
## Specific Ideas

See 261025-t7i-RESEARCH.md:
- the measured 6-export x64 gap
- the 10 versions (User018, Utils007, Apps007, RemoteStorage012, UGC007, HTTP002, Screenshots002,
  HTMLSurface_003, Inventory_V001, Video_V001), sourced via `pnpm extract-proton-inventory` at the pinned
  Proton SHA (D-09, D-53-03)
- the j4l guard and `findUnservableInterfaceVersions` interaction
- the requirement to restore only after the code change
- the census rule trace

</specifics>

<canonical_refs>
## Canonical References

- the source todo above
- `meta/gen_vtables.ts`
- `meta/sdk/`
- `src/backend/storeManagers/steam/bridge/{interfaceVersions,shimCoverage,importScan,shimGenerate}.ts`
- the memory rule "Bridge verified is strict"

</canonical_refs>
