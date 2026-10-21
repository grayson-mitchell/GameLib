---
phase: quick-261021-pgx
plan: 01
subsystem: steam-bridge
tags: [proton, lsteamclient, vtable-generator, steam-bridge, code-generation, hoard]

requires:
  - phase: 51-11
    provides: meta/extractProtonInventory.ts, shimCoverage.ts's first locked interface group, the pending todo this plan resolves
provides:
  - "Hoard's (63000) real measured interface-version strings, committed as fixture text (HOARD_DLL_VERSION_STRINGS), never invented"
  - "acceptance-interface-versions.json records Hoard's exact SteamUser016/SteamUtils005 matches with XCOM plus its 3 newer versions"
  - "3 new complete, ABI-checked manifests (SteamFriends013, STEAMAPPS_INTERFACE_VERSION005, STEAMUSERSTATS_INTERFACE_VERSION011) -- Proton's pinned tree had all three, no blocker"
  - "shimCoverage.ts serves Hoard's 3 new versions end-to-end (exported, served, ABI-checked, compiled), proven by a real coverage test against Hoard's own captured import table"
  - "The pending todo tracking this gap is deleted -- fully resolved"
affects: [51-14, future-hoard-gate-4-rerun]

actuals:
  tokens: 45500
  tasks: 2
  commits: 2
  plan_head_before: cdf2e6abbc635f2ca8c4b4244ee78fff968ca8e3
  plan_head_after: 8628ea5a781288de28fa97b1c049f90f05110901

tech-stack:
  added: []
  patterns:
    - "Same extractor/wire-policy machinery 51-11 built, reused unchanged against 3 new --versions -- confirms the extractor is genuinely reusable, not a one-off"

key-files:
  created:
    - meta/sdk/isteamfriends013.manifest.json
    - meta/sdk/isteamapps005.manifest.json
    - meta/sdk/isteamuserstats011.manifest.json
  modified:
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/ordinals.json
    - meta/sdk/wire-policy.json
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api.def
    - native/steam-bridge/generated/bridge_dispatch.h

key-decisions:
  - "Hoard's measured strings (16 total, strings -a against the real 104872-byte original steam_api.dll) resolved unambiguously onto its 8 imported bare accessors -- one version per family, nothing ambiguous or unknown, exactly as the plan's context predicted."
  - "Proton's pinned proton_9.0 tree (2c620c0fd7c2c424f6bd91898602bdc4d4260468) had a real __ASM_VTABLE block for all 3 requested versions -- no Proton-tree blocker, so the pending todo is fully resolved (deleted) rather than narrowed."
  - "SteamFriends013/Apps005/UserStats011 share their family's existing Mac dylib helperInterface (SteamAPI_SteamFriends_v018 / SteamAPI_SteamApps_v009 / SteamAPI_SteamUserStats_v013) -- the same one-real-pointer-per-family precedent 51-11 established."

requirements-completed: [TODO-261021-HOARD-STEAM-API-DLL-INTERFACE-VERSIONS-UNMEASURED]

coverage:
  - id: D1
    description: "Hoard's measured interface-version strings recorded as real fixture evidence (HOARD_DLL_VERSION_STRINGS), never invented or extrapolated"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts (Hoard describe block, resolves cleanly against HOARD_DLL_VERSION_STRINGS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "3 new complete, ABI-checked manifests for SteamFriends013/STEAMAPPS_INTERFACE_VERSION005/STEAMUSERSTATS_INTERFACE_VERSION011, each with the correct helperInterface"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts (84/84, completeness gate)"
        status: pass
    human_judgment: false
  - id: D3
    description: "shimCoverage.ts widened to serve Hoard's 3 new versions; regenerated shim compiles; a real coverage test proves Hoard's own import table now resolves and serves its first-locked-interface-group plus User/Friends"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts (111/111 total, Hoard acceptance describe block)"
        status: pass
      - kind: other
        ref: "pnpm build-steam-bridge (COMPILE GATE PASSED)"
        status: pass
  - id: D4
    description: "Pending todo fully resolved (deleted) -- no remaining Proton-tree blocker"
    verification:
      - kind: other
        ref: "git rm .planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md; pnpm planning-gates (12/12 PASS)"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-10-21
status: complete
---

# Quick Task 261021-pgx: Record Hoard's measured Steam interface versions and build Task 1/2 Summary

**Hoard's (63000) real original `steam_api.dll` interface-version strings are now recorded as measured fixture evidence, all 3 of its new versions (SteamFriends013, STEAMAPPS_INTERFACE_VERSION005, STEAMUSERSTATS_INTERFACE_VERSION011) extracted from Proton with no tree blocker, and shimCoverage.ts now serves and proves coverage of Hoard's own captured import table end-to-end -- closing the gap 51-11 left open.**

## Performance

- **Duration:** ~45min
- **Completed:** 2026-10-21
- **Tasks:** 2 of 2
- **Files modified/created:** 13

## Accomplishments

- Added `HOARD_DLL_VERSION_STRINGS` to `objdumpImports.ts`: the 16 interface-version strings
  measured this session via `strings -a` against Hoard's real original `steam_api.dll`
  (104872 bytes), with the operator's full provenance statement recorded verbatim (freshly
  installed from scratch on a separate Windows PC, the coincidental XCOM XEW byte-match
  explicitly flagged as a documented coincidence, not contamination).
- Extended `acceptance-interface-versions.json`: `SteamUser016`/`SteamUtils005` now carry
  `"titles": ["200510", "63000"]` (Hoard's measured versions exactly match XCOM's for those two
  families), plus 3 new entries for `SteamFriends013`/`STEAMAPPS_INTERFACE_VERSION005`/
  `STEAMUSERSTATS_INTERFACE_VERSION011`, each `"titles": ["63000"]`.
- Ran `pnpm extract-proton-inventory` against the same pinned `proton_9.0` commit 51-11 used --
  all 3 requested versions had a real `__ASM_VTABLE` block (no blocker), producing 3 new
  complete manifests (63/20/43 methods respectively, 2/13/16 wired). Hand-added each
  manifest's `helperInterface`, mirroring the family's already-served Mac dylib accessor.
- Widened `shimCoverage.ts`'s `SHIM_EXPORTED_SYMBOLS`/`SHIM_SERVED_INTERFACE_VERSIONS` to the 3
  new flat accessors and served versions; regenerated the native shim (`pnpm gen-vtables` --
  10 interfaces, 400 vtable slots, 20 flat exports) and confirmed it compiles clean
  (`pnpm build-steam-bridge`, COMPILE GATE PASSED).
- Added a new `evaluateShimCoverage (Hoard: 63000)` acceptance test in `shimCoverage.test.ts`:
  Hoard's real `HOARD_REUBEN_REAL_OBJDUMP_OUTPUT` import table resolves cleanly against
  `HOARD_DLL_VERSION_STRINGS` (no unknown-version/ambiguous problems) and the coverage check
  now reports missing exactly `SteamMatchmaking`/`SteamNetworking`/`SteamRemoteStorage` (+
  their required versions) -- nothing from the five widened families.
- Deleted the pending todo (`2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md`)
  -- fully resolved, no remaining blocker.

## Task Commits

1. **Task 1: Record Hoard's measured strings and extract its 3 new manifests** -
   `e9519488d` (feat)
2. **Task 2: Wire shimCoverage.ts, regenerate the shim, prove Hoard's coverage, resolve the todo** -
   `8628ea5a7` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts` -- added
  `HOARD_DLL_VERSION_STRINGS` + updated file header + updated `HOARD_REUBEN_REAL_OBJDUMP_OUTPUT`
  cross-reference comment
- `meta/sdk/acceptance-interface-versions.json` -- extended `SteamUser016`/`SteamUtils005`
  titles, added 3 new entries
- `meta/sdk/ordinals.json` -- 3 new append-only ordinals (8, 9, 10)
- `meta/sdk/wire-policy.json` -- removed `SteamApps.GetCurrentBetaName`'s wire override (see
  Deviations)
- `meta/sdk/isteamfriends013.manifest.json`, `isteamapps005.manifest.json`,
  `isteamuserstats011.manifest.json` -- new, complete manifests with hand-added
  `helperInterface`
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts` -- widened export/served sets,
  updated stale comments
- `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` -- new Hoard
  acceptance describe block, updated stale "no equivalent Hoard case" comment
- `native/steam-bridge/generated/{steam_api_shim.c,steam_api.def,bridge_dispatch.h}` --
  regenerated (10 interfaces, 400 vtable slots, 20 flat exports)
- `.planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md`
  -- deleted (resolved)

## Decisions Made

See `key-decisions` in the frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Deferred `SteamApps.GetCurrentBetaName` back to stub mode in `wire-policy.json`**
- **Found during:** Task 2 (`pnpm gen-vtables` after wiring `shimCoverage.ts`)
- **Issue:** `wire-policy.json`'s `SteamApps.GetCurrentBetaName` entry (written speculatively in
  51-11, never active because `STEAMAPPS_INTERFACE_VERSION004` doesn't have this method) marks
  its `pchName` param `kind: 'out-buffer'`. `STEAMAPPS_INTERFACE_VERSION005` (Hoard's version,
  extracted this run) is the first manifest to actually include `GetCurrentBetaName` (slot 15).
  `applyWirePolicy` applies the policy per-(family, method name) across every version, so this
  method became `mode: 'wire'` in the new manifest and `generateDispatchHeader`'s
  `assertDispatchable` immediately threw: "out-buffer dispatch decoding is deferred to a future
  plan, never silently wrong (51-10)" -- a real, documented generator limitation, not a bug to
  route around.
- **Fix:** Removed the `GetCurrentBetaName` entry from `wire-policy.json`'s `SteamApps` family
  entirely (a no-op for `STEAMAPPS_INTERFACE_VERSION004`, which never had the method). The
  method now stays manifest-level default `mode: 'stub'` for `STEAMAPPS_INTERFACE_VERSION005`
  -- correct per the generator's own stated boundary, and matches the already-documented
  "out-buffer stays refused (not needed this run)" precedent from 51-11's own summary. Re-ran
  `pnpm extract-proton-inventory --versions STEAMAPPS_INTERFACE_VERSION005` to regenerate the
  manifest without the now-removed policy entry, then re-added its hand-edited
  `helperInterface` field (the extractor overwrites the whole file).
- **Files modified:** `meta/sdk/wire-policy.json`, `meta/sdk/isteamapps005.manifest.json`
- **Verification:** `pnpm gen-vtables` succeeds (10 interfaces, 400 slots, 20 flat exports);
  `pnpm jest meta/__tests__/gen_vtables.test.ts shimCoverage.test.ts` 111/111 pass;
  `pnpm build-steam-bridge` COMPILE GATE PASSED
- **Committed in:** `8628ea5a7` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue).
**Impact on plan:** The fix was necessary for `pnpm gen-vtables` to succeed at all with the
extracted manifest set this plan's own Task 1 action produced -- no scope creep, and the
deferred method stays an honest stub rather than a corrupted wire call.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None -- no external service configuration required. The operator's provision of Hoard's real
`steam_api.dll` (outside this repo, at `/Users/graysonmitchell/Downloads/steam_api.dll`) was
already complete before this task started, per the plan's context section.

## Next Phase Readiness

- Hoard's (63000) D-51-14 acceptance coverage now matches XCOM's: every one of its 8 bare
  accessors resolves to a served, ABI-checked interface version. The remaining gap --
  `SteamMatchmaking`/`SteamMatchmakingServers`/`SteamNetworking`/`SteamRemoteStorage` (the
  second/last locked interface group) -- is shared with XCOM and tracked by future Phase 51
  plans (51-14 and beyond), not a Hoard-specific blocker anymore.
- The 24-UAT Gate 4 Hoard re-run now has real, measured acceptance coverage behind it for the
  families this task widened. A live hardware re-run is still a separate, future step (not
  attempted in this quick task).
- The pending todo this task resolved named only the measurement gap; no new todo was filed,
  since Proton's tree had no blocker for any of the 3 requested versions.

## Self-Check: PASSED

- `[ -f meta/sdk/isteamfriends013.manifest.json ]` → FOUND
- `[ -f meta/sdk/isteamapps005.manifest.json ]` → FOUND
- `[ -f meta/sdk/isteamuserstats011.manifest.json ]` → FOUND
- `grep -n "HOARD_DLL_VERSION_STRINGS" src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts` → FOUND (export + doc reference)
- `[ ! -f .planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md ]` → CONFIRMED (deleted)
- `git log --oneline --all --grep="261021-pgx"` → FOUND (2 commits: `e9519488d`, `8628ea5a7`)
- Re-ran every task's `<acceptance_criteria>`: all PASS
- Re-ran the plan-level `<verification>`: `pnpm gen-vtables` → no diff after commit (idempotent);
  `pnpm jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts`
  → 111/111 pass; `pnpm build-steam-bridge` → COMPILE GATE PASSED; `pnpm lint` exit 0 (no ceiling
  breach); `pnpm codecheck` exit 0; `pnpm planning-gates` → 12/12 PASS

---
*Phase: quick-261021-pgx*
*Completed: 2026-10-21*
