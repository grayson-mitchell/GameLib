---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 01
subsystem: infra
tags: [steam, macos, bridge, vtable, abi, thiscall, code-generation, typescript, steam_api]

# Dependency graph
requires: []
provides:
  - "meta/gen_vtables.ts -- R1 vtable + flat-export steam_api.dll shim SOURCE generator (D-10 TypeScript)"
  - "meta/sdk/isteamuser.manifest.json + isteamfriends.manifest.json -- D-09 GameLib-authored interface manifests (SteamUser023/SteamFriends018)"
  - "native/steam-bridge/generated/steam_api_shim.c + steam_api.def -- committed generated shim source (D-07)"
  - "builtBridgeShimPath -- shared bundled compiled-shim location contract (BLOCKER 2)"
affects: [24-02-native-helper, 24-05-runtime-placement, 24-06-packaging-helper, 24-07-packaging-shim]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "meta/*.ts build-time generator convention (mirrors buildCrossoverIndex.ts): typed manifest input -> deterministic string-emission functions -> guarded main()"
    - "Structural source assertions on generated C output strings (no real compile) -- mirrors Phase 21's atomic-write precedent"
    - "GameLib-authored factual interface manifest (D-09) instead of vendored Valve SDK headers"

key-files:
  created:
    - meta/sdk/isteamuser.manifest.json
    - meta/sdk/isteamfriends.manifest.json
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api.def
  modified:
    - package.json
    - .gitignore
    - src/backend/constants/paths.ts

key-decisions:
  - "Test file placed at meta/__tests__/gen_vtables.test.ts (not the frontmatter's literal meta/gen_vtables.test.ts) so meta/jest.config.js's testMatch (**/__tests__/**/*.test.ts) actually discovers it -- matches 24-PATTERNS.md's own stated analog location"
  - "Added a dedicated single-uint64-param synthetic slot (SetUint64Test_TESTONLY) to isteamuser.manifest.json to exercise the 'uint64 param -> ret 8' case distinctly from the two-int-param ret-8 case"
  - "Flat SteamAPI_* export set is a fixed acceptance-set superset constant (FLAT_EXPORTS_SUPERSET), not manifest-derived -- matches R3's acknowledged divergence (review finding #9)"

patterns-established:
  - "ABI width/marshaling rules (paramWidth/isSretReturn/is64BitRegisterReturn/computeRetN) are pure, individually unit-tested functions separate from string emission -- future interface manifests plug in without generator changes"
  - "Per-slot ret N is emitted as a human-readable source comment above every stub (both marshaled and stubbed), giving code reviewers a direct Pitfall-2 audit trail"

requirements-completed: [R1]

# Metrics
duration: 25min
completed: 2026-07-20
---

# Phase 24 Plan 01: macOS Native Steam Bridge -- Vtable Generator Summary

**TypeScript generator (`meta/gen_vtables.ts`) that reads GameLib-authored interface manifests and emits committed `__thiscall` C++ vtable + flat `SteamAPI_*` export source for the pinned `SteamUser023`/`SteamFriends018` interfaces, with 30 unit tests proving per-slot `ret N`, 64-bit register returns, and sret marshaling.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-20T04:32:56Z
- **Completed:** 2026-07-20T04:45:22Z
- **Tasks:** 3
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments

- Authored two GameLib-owned interface manifests (`SteamUser023`, `SteamFriends018`) encoding the spike-006-confirmed identity method slot order plus explicitly-labeled synthetic ABI-exercise slots -- no vendored Valve SDK header text anywhere (D-09/Pitfall 3)
- Built `meta/gen_vtables.ts`: a pure, typed generator computing `ret N` per slot (0/4/8-byte cases, including a dedicated single-uint64-param case), classifying returns into register (EAX), 64-bit register (EDX:EAX), or hidden-sret-pointer paths, and emitting the Pattern-3 wire frame consistently across every stub
- 30 passing unit tests assert slot-order preservation, all `ret N` cases, `GetSteamID`'s 64-bit (not 4-byte) return marshaling, the sret >8-byte hidden-pointer path, `.def` flat-export coverage of both acceptance-set games' imports, and the "no vendored `.h`" guard
- Ran the generator and committed its deterministic output (`steam_api_shim.c` + `steam_api.def`, verified byte-identical across two runs via md5) -- no PE binary built or committed
- Exported `builtBridgeShimPath` from `src/backend/constants/paths.ts` (BLOCKER 2 contract), the single shared bundled location Plan 24-07 will write to and Plan 24-05 will read from

## Task Commits

1. **Task 1: Author the GameLib interface manifests (D-09)** - `63f2bca5` (feat)
2. **Task 2: Write the TypeScript vtable/flat generator + ABI unit tests (D-10)** - `bc627bb5` (feat, includes RED-then-GREEN in a single commit per structural-assertion TDD flow)
3. **Task 3: Run the generator and commit its output (D-07)** - `22217fae` (feat)

## Files Created/Modified

- `meta/sdk/isteamuser.manifest.json` - SteamUser023 (ordinal 1) factual slot inventory: confirmed identity slots 0-2 (GetHSteamUser/BLoggedOn/GetSteamID) + 5 labeled ABI-exercise stubs (ret 4/8/8-uint64, sret >8B)
- `meta/sdk/isteamfriends.manifest.json` - SteamFriends018 (ordinal 2): confirmed identity slot 0 (GetPersonaName) + 2 labeled ABI-exercise stubs
- `meta/gen_vtables.ts` - Generator: ABI width/marshaling rules, C-emission functions, `generateShimC`/`generateDefFile`, guarded `main()`
- `meta/__tests__/gen_vtables.test.ts` - 30 assertions across 9 describe blocks covering every acceptance-criteria row
- `native/steam-bridge/generated/steam_api_shim.c` - Generated, committed shim source (flat exports + 2 vtables, 11 total slots)
- `native/steam-bridge/generated/steam_api.def` - Generated, committed export table (12 flat exports)
- `package.json` - Registered `gen-vtables` script
- `.gitignore` - Ignore `native/steam-bridge/generated/*.dll` (source stays tracked)
- `src/backend/constants/paths.ts` - Added `builtBridgeShimPath`

## Decisions Made

- Test file location resolved to `meta/__tests__/gen_vtables.test.ts` to match the project's actual jest `testMatch` convention (see Deviations)
- Added a synthetic single-uint64-param manifest slot so the plan's required "uint64 param -> ret 8" test case is exercised by real manifest data, distinct from the two-int-param ret-8 case
- `sdkVersion` field pinned to a date-anchored, non-overclaiming string (`pinned-2026-07-18-rlabrecque-SteamworksSDK-master`) rather than inventing a precise Steamworks SDK release number not independently confirmed in this session

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file placed under `meta/__tests__/` instead of the frontmatter's literal `meta/gen_vtables.test.ts` path**
- **Found during:** Task 2
- **Issue:** `meta/jest.config.js`'s `testMatch: ['**/__tests__/**/*.test.ts']` only discovers files inside a `__tests__/` directory. A file at the plan frontmatter's literal `meta/gen_vtables.test.ts` path would never be picked up by `pnpm jest`, making the plan's own `<verify>` command silently report zero tests run.
- **Fix:** Placed the test at `meta/__tests__/gen_vtables.test.ts`, matching both the existing `buildCrossoverIndex.test.ts` sibling and 24-PATTERNS.md's own stated analog location ("meta/__tests__/ (buildCrossoverIndex's test sibling, same meta/__tests__ dir)").
- **Files modified:** `meta/__tests__/gen_vtables.test.ts` (created at this path instead)
- **Verification:** `npx jest --selectProjects Meta gen_vtables.test.ts` discovers and runs 30 tests, all passing
- **Committed in:** `bc627bb5` (Task 2 commit)

**2. [Rule 1 - Bug/gap] Added a missing single-uint64-param manifest slot**
- **Found during:** Task 2
- **Issue:** The plan's acceptance criteria require a test asserting "a slot with a uint64 param emits ret 8," distinct from the two-int-param ret-8 case. The Task 1 manifest had no slot with a raw uint64 parameter to exercise this.
- **Fix:** Added slot 7 (`SetUint64Test_TESTONLY`) to `meta/sdk/isteamuser.manifest.json`, clearly labeled as a synthetic ABI-exercise slot (not a real Steamworks method).
- **Files modified:** `meta/sdk/isteamuser.manifest.json`
- **Verification:** `computeRetN(SetUint64Test_TESTONLY) === 8` unit test passes; `u.methods[2].name === 'GetSteamID'` (Task 1's own verify command) still holds since the new slot was appended at the end
- **Committed in:** `bc627bb5` (Task 2 commit, alongside the generator/tests)

---

**Total deviations:** 2 auto-fixed (1 blocking/test-discovery, 1 test-coverage gap)
**Impact on plan:** Both fixes were necessary for the plan's own verification commands and acceptance criteria to actually pass. No scope creep -- both changes are scoped exactly to what Task 2's stated behavior/acceptance criteria required.

## Issues Encountered

None beyond the deviations above. Prettier auto-reformatted `meta/gen_vtables.ts` and `meta/__tests__/gen_vtables.test.ts` to match the project's `semi: false` / `singleQuote: true` / `trailingComma: none` style after initial authoring; re-ran tests and `pnpm codecheck` post-format to confirm no regressions.

## Known Stubs

None that block this plan's own goal. The manifests intentionally contain several `_TESTONLY`-suffixed synthetic slots (clearly noted as non-real Steamworks methods) whose sole purpose is exercising the generator's ABI computation paths (ret 4/8, sret) -- these are permanent, documented test fixtures for the generator itself, not placeholder application logic. `SteamAPI_Init`/`SteamAPI_InitFlat`/etc. flat-export bodies in the generated `.c` are intentionally minimal stand-ins (return success / no-op) matching spike 005c/006/007/008's own proven pattern; real bridge-backed behavior (marshaling to the native helper for the flat calls themselves) is out of this plan's R1 scope and is the runtime-behavior work of later Wave-2 plans (24-02/24-05).

## Threat Flags

None. All three threat-model rows assigned to this plan's files (T-24-04 wrong `ret N`, T-24-08 vendored-header IP leak, T-24-03 unbounded wire frame) are mitigated as specified: `computeRetN` is unit-tested for every declared slot including stubs; the generator/manifests contain no `.h` include or vendored Valve text (test-asserted); the wire frame carries an explicit 4-byte length field per `24-RESEARCH.md` Pattern 3 (the helper's max-frame-bound enforcement is Plan 24-02's responsibility, out of this plan's files).

## User Setup Required

None - no external service configuration required. No package installs occurred (0 new npm dependencies).

## Next Phase Readiness

- R1's automated acceptance criteria are met: generator output preserves manifest slot order, computes correct per-slot `ret N` (including sret's hidden pointer), and marshals 64-bit vs 4-byte returns distinctly -- all proven via structural unit tests.
- `builtBridgeShimPath` (BLOCKER 2 contract) is live in `src/backend/constants/paths.ts`, unblocking Wave 2 plans 24-05 (runtime placement, reads this path) and 24-07 (packaging, writes to this path) without a same-wave forward reference.
- **Explicitly NOT proven by this plan** (per the plan's own success criteria and the plan-check review's findings #5/#13): runtime ABI correctness of the hand-authored stubs (does the generated `.c` actually compile with `zig cc -target x86-windows-gnu` and does a real `__thiscall` call from a Windows PE binary round-trip correctly against the vtable) is proven downstream by Plan 24-07's compile gate and Plan 24-10's generated-shim <-> helper vtable round-trip test. This plan's "structural source assertions" are a necessary but not sufficient acceptance bar for R1's full success criteria.
- No native helper exists yet (Plan 24-02) -- the generated shim's `bridge_transact()` wire client has no live peer to connect to; this is expected at this stage of Wave 1.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*
