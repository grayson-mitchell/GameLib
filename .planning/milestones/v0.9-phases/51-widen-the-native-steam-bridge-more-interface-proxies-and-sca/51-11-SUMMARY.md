---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 11
subsystem: steam-bridge
tags: [proton, lsteamclient, vtable-generator, steam-bridge, code-generation]

requires:
  - phase: 51-02
    provides: widened importScan.ts (bare accessors + steam_api64.dll fail-closed), resolveRequiredInterfaceVersions
  - phase: 51-03
    provides: shimCoverage.ts (SHIM_EXPORTED_SYMBOLS / SHIM_SERVED_INTERFACE_VERSIONS, the single coverage module this plan widens)
  - phase: 51-06
    provides: schema v2 manifests, wire/stub mode, bare legacy accessor resolution (g_iface_table)
  - phase: 51-10
    provides: generateDispatchHeader/emitDispatchCase (the helper-side dispatch table this plan extends for out-value)
provides:
  - A real, tested one-shot extractor (meta/extractProtonInventory.ts) that turns Proton's pinned
    lsteamclient thunks into schema v2 manifests -- no more hand-authoring vtable layouts
  - 7 complete (slot-contiguous) manifests, 274 total vtable slots: SteamUser023/SteamFriends018
    (completed in place) + 5 new (SteamUser016, SteamFriends011, SteamUtils005,
    STEAMAPPS_INTERFACE_VERSION004, STEAMUSERSTATS_INTERFACE_VERSION010)
  - Helper-side 'out-value' response encoding in gen_vtables.ts's dispatch generator
  - shimCoverage.ts widened to the first locked interface group for XCOM's measured versions
affects: [51-14, 51-15, future-hoard-measurement]

actuals:
  tokens: 85200
  tasks: 2
  commits: 3
  plan_head_before: 79ed9eb55e4bc45b0a9bd6f7dbd77c4f99ddb15c
  plan_head_after: e53295c1a8cdcfa47f639d3331f04490078aea58

tech-stack:
  added: []
  patterns:
    - "Proton lsteamclient thunk triple-shape parsing (DEFINE_THISCALL_WRAPPER + __thiscall signature + __ASM_VTABLE/VTABLE_ADD_FUNC order) as a factual-inventory extractor, never vendored SDK header text (D-09)"
    - "wire-policy.json as a GameLib-authored overlay applied by (family, method name) across every version of that family"
    - "Append-only ordinal registry (meta/sdk/ordinals.json), persisted on first assignment"

key-files:
  created:
    - meta/extractProtonInventory.ts
    - meta/__tests__/extractProtonInventory.test.ts
    - meta/__tests__/fixtures/protonThunkExcerpt.txt
    - meta/sdk/wire-policy.json
    - meta/sdk/ordinals.json
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/isteamuser016.manifest.json
    - meta/sdk/isteamfriends011.manifest.json
    - meta/sdk/isteamutils005.manifest.json
    - meta/sdk/isteamapps004.manifest.json
    - meta/sdk/isteamuserstats010.manifest.json
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/sdk/isteamuser.manifest.json
    - meta/sdk/isteamfriends.manifest.json
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api.def
    - native/steam-bridge/generated/bridge_dispatch.h
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - package.json

key-decisions:
  - "Task 1 (measuring Hoard's original steam_api.dll) was explicitly skipped this run on operator instruction -- CrossOver bottle GameLibSteamBridge had no network path to re-download Hoard. No Hoard-specific interface version was invented anywhere; SteamUser023/SteamFriends018's acceptance-interface-versions.json entries carry titles: [] and a pending todo tracks the deferred measurement."
  - "Old-style version strings (STEAMAPPS_INTERFACE_VERSION004, STEAMUSERSTATS_INTERFACE_VERSION010) resolve via the SAME proton_9.0 branch and literally identical Proton function-name embedding -- no special-case remapping table was needed, just a different regex shape in computeFlatAccessor for filename/export-name synthesis."
  - "A manifest's per-method mode defaults to 'stub' (manifest-level), with wire-policy.json explicitly promoting only the methods it names to mode:'wire' -- the other 260+ real methods across these 7 manifests are honest stubs (stackBytes-driven, never corrupting the caller's stack), not omitted."
  - "Extended gen_vtables.ts's helper-side dispatch generator (generateDispatchHeader/emitDispatchCase) to support 'out-value' response params -- required for GetStat/SetStat's int32/float overloads and GetAchievement(AndUnlockTime); 'out-buffer' stays refused (not needed this run, GetCurrentBetaName isn't in Apps004). This is new generator logic beyond the plan's literal Task 2/3 action text, applied as deviation Rule 2 (missing critical functionality -- the plan's own wire-policy requires out-value methods to actually dispatch)."
  - "SteamUser016/SteamFriends011 share SteamUser023/SteamFriends018's helperInterface (SteamAPI_SteamUser_v023/SteamAPI_SteamFriends_v018) -- there is exactly one real signed-in interface pointer per family on the Mac side; the Windows-side version string a game asks for doesn't change which Mac accessor the helper resolves through."
  - "shimCoverage's new XCOM shimCoverage test deliberately omits a Hoard case rather than asserting a misleadingly-passing one: a symbol-only check (no requiredInterfaceVersions, since Hoard's versions are unmeasured) would score Hoard's bare accessors as 'covered' purely because the NAME is now exported, which is not provably true of the UNMEASURED version Hoard's dll actually needs."

requirements-completed: []

coverage:
  - id: D1
    description: "One-shot Proton inventory extractor (meta/extractProtonInventory.ts) parsing all three real thunk shapes into schema v2 manifests, with wire-policy overlay and append-only ordinal assignment"
    verification:
      - kind: unit
        ref: "meta/__tests__/extractProtonInventory.test.ts (24 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "7 complete manifests (274 vtable slots) -- SteamUser023/SteamFriends018 completed, 5 new (SteamUser016/SteamFriends011/SteamUtils005/Apps004/UserStats010) -- validate clean and are all complete:true"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts (84 tests, including the new completeness gate)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Helper-side dispatch generator extended to support out-value response params; shim+helper regenerate cleanly and compile (zig cc + clang)"
    verification:
      - kind: unit
        ref: "meta/__tests__/gen_vtables.test.ts"
        status: pass
      - kind: other
        ref: "pnpm build-steam-bridge (COMPILE GATE PASSED)"
        status: pass
    human_judgment: false
  - id: D4
    description: "shimCoverage.ts widened to the first locked group for XCOM's measured versions; XCOM acceptance check reports missing exactly the second/last-group families + GameServer stubs, nothing from the five widened families"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts (25 tests, including the new XCOM acceptance test)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Hoard (63000) Gate 4 re-run readiness / D-51-14 full acceptance coverage for Hoard"
    verification: []
    human_judgment: true
    rationale: "Not achieved this run -- Task 1 (measuring Hoard's original steam_api.dll) was skipped on operator instruction. No automated check can substitute for the missing measurement; a human must resolve the CrossOver network blocker and re-run Task 1 before this can be verified at all. Tracked in the pending todo filed this run."

duration: ~3h20m (includes the Proton source research/analysis this plan's extraction logic is built on)
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 11: Proton Inventory Extractor + First Locked Interface Group Summary

**A real Proton lsteamclient parser replaces hand-authored vtable manifests; XCOM's measured ISteamUtils/ISteamApps/ISteamUserStats + older SteamUser/SteamFriends versions are now served (274 vtable slots across 7 manifests); Hoard's own measurement stays an open, explicitly-tracked blocker.**

## Performance

- **Duration:** ~3h20m
- **Completed:** 2026-10-21
- **Tasks:** 2 of 3 (Task 1 skipped on operator instruction — no network path to re-download Hoard)
- **Files modified/created:** 24

## Accomplishments

- Built `meta/extractProtonInventory.ts`: a real, tested parser for Proton's `lsteamclient` wine
  thunks (`DEFINE_THISCALL_WRAPPER` + the `__thiscall` C signature + the
  `__ASM_VTABLE`/`VTABLE_ADD_FUNC` slot order — all three shapes, read directly against the
  pinned `proton_9.0` branch head `2c620c0fd7c2c424f6bd91898602bdc4d4260468`), producing
  GameLib-authored schema v2 manifests — never vendored Valve SDK header text (D-09).
- Ran the extractor for real against the live network: completed `SteamUser023`
  (33 methods, 3 wired) and `SteamFriends018` (78 methods, 2 wired) to their full real layouts,
  and wrote 5 new manifests — `SteamUser016` (22/3), `SteamFriends011` (63/2), `SteamUtils005`
  (23/8), `STEAMAPPS_INTERFACE_VERSION004` (14/11), `STEAMUSERSTATS_INTERFACE_VERSION010`
  (41/14) — 274 vtable slots total, every one `complete: true`.
- Extended `gen_vtables.ts`'s helper-side dispatch generator to support `out-value` response
  params (the plan's own wire-policy needs this for `GetStat`/`SetStat`'s int32/float
  overloads and `GetAchievement(AndUnlockTime)` — the shim side already supported it; the
  helper side didn't).
- Widened `shimCoverage.ts`'s `SHIM_EXPORTED_SYMBOLS`/`SHIM_SERVED_INTERFACE_VERSIONS` to the
  first locked interface group, and added a real acceptance test against XCOM's captured
  import table.
- `pnpm gen-vtables` regenerates the shim/def/dispatch-header idempotently; `pnpm
  build-steam-bridge` compiles both the native helper (clang, against the new 274-slot
  dispatch table) and the PE32 shim (`zig cc -target x86-windows-gnu`) cleanly.

## Task Commits

1. **Task 2: One-shot Proton inventory extractor, wire policy and ordinal registry** —
   `2c7b6b10b` (test, RED) → `2412d6cfb` (feat, GREEN)
2. **Task 3: Extract the x86 core manifests, regenerate, update coverage, compile** —
   `e53295c1a` (feat)

_Task 1 (checkpoint:human-action, measure Hoard's original steam_api.dll) was skipped on
operator instruction this run — see "Deviations from Plan" below._

## Files Created/Modified

- `meta/extractProtonInventory.ts` — the extractor: `parseProtonThunks`, `applyWirePolicy`,
  `classifyProtonReturn`, `mapProtonCType`, `splitProtonParam`, `computeFlatAccessor`,
  `manifestFilenameFor`, `resolveOrdinal`, CLI `main()`
- `meta/__tests__/extractProtonInventory.test.ts` + `fixtures/protonThunkExcerpt.txt` — 24
  tests against a synthetic fixture (invented family/version/method names)
- `meta/sdk/wire-policy.json` — per-(family, method) wire/stub overlay for all 5 families
- `meta/sdk/ordinals.json` — append-only ordinal registry (now 7 entries)
- `meta/sdk/acceptance-interface-versions.json` — version → {family, arches, titles}
- `meta/sdk/isteamuser.manifest.json` / `isteamfriends.manifest.json` — completed in place
  (33/78 real methods)
- `meta/sdk/isteamuser016.manifest.json`, `isteamfriends011.manifest.json`,
  `isteamutils005.manifest.json`, `isteamapps004.manifest.json`,
  `isteamuserstats010.manifest.json` — new, complete manifests
- `meta/gen_vtables.ts` — `assertDispatchable`/`emitDispatchCase` now support `out-value`
  response encoding
- `meta/__tests__/gen_vtables.test.ts` — new completeness gate test; two pre-existing tests
  updated for the now-complete manifests
- `native/steam-bridge/generated/{steam_api_shim.c,steam_api.def,bridge_dispatch.h}` —
  regenerated (274 slots, 7 interfaces, 17 flat exports)
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts` — widened export/served sets
- `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` — new XCOM
  acceptance test; 3 pre-existing tests' "still uncovered" examples moved from
  SteamUtils/SteamUtils005 to SteamRemoteStorage/its version (now genuinely still uncovered)
- `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` — the 24-CR-02
  fixture's fake dll now embeds the 3 new version strings too
- `package.json` — new `extract-proton-inventory` script

## Decisions Made

See `key-decisions` in the frontmatter above.

## Deviations from Plan

### Operator-authorized scope change (not a Rule 1-4 deviation, a direct instruction)

**Task 1 skipped entirely.** The operator could not obtain Hoard's original `steam_api.dll`
this session (CrossOver bottle `GameLibSteamBridge` has no network path to Steam's CDN —
`content_log.txt` showed zero download activity) and explicitly said to skip Task 1 and
proceed with Tasks 2/3. Per the accompanying instructions, Task 3 was scoped to XCOM's
measured versions only; no Hoard-specific interface version was invented anywhere. A pending
todo (`.planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md`,
`ready: blocked`) tracks the deferred measurement.

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended the dispatch generator to support `out-value` response params**
- **Found during:** Task 3 (running `pnpm gen-vtables` after wiring `GetStat`/`SetStat`/`GetAchievement`)
- **Issue:** `gen_vtables.ts`'s `assertDispatchable` (added in 51-10) unconditionally refused
  ANY `out-value` param on a dispatch-eligible wire method ("deferred to a future plan"). The
  plan's own Task 2 wire-policy action text explicitly requires `GetStat`/`SetStat`'s
  int32/float overloads and `GetAchievement(AndUnlockTime)` to be wired with `out-value`
  params — running `pnpm gen-vtables` threw immediately.
- **Fix:** Extended `emitDispatchCase` to decode out-value params as zero-initialized locals
  passed by address to the real flat call, then append each one's `valueType` width to the
  response after the base return value (mirroring `WIRE_LAYOUT_DOC`'s already-documented wire
  shape). `out-buffer` stays refused (genuinely out of this run's scope). Updated the one
  pre-existing test that asserted the old blanket throw.
- **Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
- **Verification:** `pnpm gen-vtables` succeeds; `pnpm jest meta/__tests__/gen_vtables.test.ts` 84/84; `pnpm build-steam-bridge` compiles both artifacts
- **Committed in:** `e53295c1a` (Task 3 commit)

**2. [Rule 1 - Bug] Fixed a `require()`-style import in the new extractor's own test**
- **Found during:** Task 3's `pnpm lint` pass (run as a precaution beyond the plan's own `<verify>` blocks)
- **Issue:** `meta/__tests__/extractProtonInventory.test.ts`'s `resolveOrdinal` test used
  `require('fs')` inline, forbidden by `@typescript-eslint/no-require-imports` — a real lint
  error, landed in Task 2's own GREEN commit.
- **Fix:** Top-level `import { readFileSync, rmSync, writeFileSync } from 'fs'` instead.
- **Files modified:** `meta/__tests__/extractProtonInventory.test.ts`
- **Verification:** `pnpm jest meta/__tests__/extractProtonInventory.test.ts` 24/24; `pnpm lint` no longer reports this file
- **Committed in:** `e53295c1a` (Task 3 commit — the fix landed here since it was found during Task 3's verification pass, not re-opening the already-closed Task 2 commit)

**3. [Rule 1 - Bug] Updated two pre-existing gen_vtables tests and one shimGenerate/shimCoverage fixture for the now-complete manifests**
- **Found during:** Task 3 (`pnpm jest meta/__tests__/gen_vtables.test.ts`, `shimCoverage.test.ts`, `shimGenerate.test.ts`)
- **Issue:** Three tests hardcoded assumptions true only of the OLD 1-3-method partial
  manifests: (a) `GetHSteamUser`'s header-comment return-type display string changed from
  the old hand-picked `"HSteamUser"` to the extractor's factual `"int32"` (both map to the
  same 4-byte register return — cosmetic only); (b) `isStringReturn` now correctly classifies
  many more `SteamFriends018` methods as string returns, not just `GetPersonaName`; (c)
  `shimGenerate.test.ts`'s 24-CR-02 "every `.def` symbol imported" exercise needed its fake
  dll content to embed `SteamUtils005`/`STEAMAPPS_INTERFACE_VERSION004`/
  `STEAMUSERSTATS_INTERFACE_VERSION010` too, now that those bare accessors are also exported.
- **Fix:** Updated all three assertions to match the new, correct reality (narrowed from
  exact-equality to containment where the underlying fact genuinely widened).
- **Files modified:** `meta/__tests__/gen_vtables.test.ts`, `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`, `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts`
- **Verification:** all three suites green (84, 26, 25 tests respectively)
- **Committed in:** `e53295c1a` (Task 3 commit)

---

**Total deviations:** 1 operator-authorized scope change (Task 1 skip) + 3 auto-fixed (1 missing-critical generator extension, 2 bug fixes).
**Impact on plan:** The generator extension (deviation 1) was necessary for the plan's own wire-policy to function at all — without it, `pnpm gen-vtables` cannot succeed with the method set the plan itself specifies. No scope creep beyond what Task 2/3's own action text required.

## Issues Encountered

- **`pnpm jest meta` surfaced 3 pre-existing failing suites** (`findDeadcode.test.ts`,
  `hardcodedStringGate.test.ts`, `genI18nGateScope.test.ts`) and a **`pnpm lint` tests-scope
  ceiling breach** (648 actual vs 638 ceiling). Both were confirmed, via an isolated
  `git worktree add <tmp> 79ed9eb55 --detach` (the commit immediately before this plan's own
  first commit), to be byte-identical at that pre-51-11 baseline — neither is caused by this
  plan's work. Logged in `deferred-items.md`, not fixed here per the deviation-rules scope
  boundary.
- **Mid-session self-inflicted near-miss, caught and recovered:** while investigating the
  lint-ceiling baseline with a plain `git checkout <old-sha> -- .` (not yet aware a
  `git worktree` would be the safe tool), the working tree's uncommitted Task 3 changes were
  at risk. They had already been moved into a `git stash` immediately beforehand, so nothing
  was lost — `git stash pop` recovered everything, confirmed by re-running the test suites
  before continuing. No destructive command (`git stash drop`, `reset --hard`, `clean`) was
  used at any point.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The extractor (`meta/extractProtonInventory.ts`) is reusable for any future Proton-sourced
  interface version — adding the second locked group (`SteamRemoteStorage`, then
  `SteamMatchmaking`/`SteamMatchmakingServers`/`SteamNetworking` as stubs) is now "add
  acceptance-interface-versions.json entries + run the extractor + wire-policy", not another
  hand-authoring pass.
- **Blocker for full D-51-14 acceptance coverage:** Hoard's (63000) real interface versions
  remain unmeasured. The pending todo
  (`.planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md`)
  names the exact unblock steps (fix the CrossOver bottle's network access, re-run Task 1's
  verification commands, extend `acceptance-interface-versions.json` + re-run the extractor).
  This is a genuine gap, not a deferred nicety — the 24-UAT Gate 4 Hoard re-run cannot be
  meaningfully attempted until it closes.
- `meta/sdk/isteamuser.manifest.json`/`isteamfriends.manifest.json` carry `titles: []` in
  `acceptance-interface-versions.json` — they are the same files Phase 24 used for Hoard, but
  that assignment was never measured and should not be treated as confirmed.

## Self-Check: PASSED

- `[ -f meta/extractProtonInventory.ts ]` → FOUND
- `[ -f meta/sdk/isteamuser016.manifest.json ]` → FOUND
- `[ -f meta/sdk/isteamfriends011.manifest.json ]` → FOUND
- `[ -f meta/sdk/isteamutils005.manifest.json ]` → FOUND
- `[ -f meta/sdk/isteamapps004.manifest.json ]` → FOUND
- `[ -f meta/sdk/isteamuserstats010.manifest.json ]` → FOUND
- `[ -f .planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md ]` → FOUND
- `git log --oneline --all --grep="51-11"` → FOUND (3 commits: 2c7b6b10b, 2412d6cfb, e53295c1a)
- Re-ran every task's `<acceptance_criteria>`: all PASS (see "Accomplishments"/task commits above)
- Re-ran the plan-level `<verification>`: `pnpm gen-vtables` → no diff; `pnpm jest
  meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts`
  → 109/109 pass; `pnpm build-steam-bridge` → COMPILE GATE PASSED (both helper and shim)

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*
