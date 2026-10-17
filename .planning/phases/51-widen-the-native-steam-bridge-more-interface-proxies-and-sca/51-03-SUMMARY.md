---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 03
subsystem: steam-bridge
tags: [steam, native-bridge, zod, allowlist, shim-coverage, persisted-verdict, jest-unit]

requires:
  - phase: 51
    provides: "51-01's per-appId bridge helper registry and shim identity marker; 51-02's widened importScan.ts/interfaceVersions.ts (symbol/version capture this plan's types and persisted verdict are shaped around)"
provides:
  - "SteamBridgeRouteVerdict, SteamBridgeRouteReason, SteamBridgeKnownBadReason, SteamBottleLaunchWaitingCause (common/types/steam.ts) and the getSteamBridgeRoute/setSteamBridgeUserRoute IPC channels + steamBridgeRouteNotice/steamBottleLaunchWaiting frontend messages (common/types/ipc.ts) -- the shared data contracts every later Phase 51 plan (51-07/09/13/16) builds on"
  - "bridge-allowlist.json version 2 (seed + knownBad with a closed reason taxonomy) and allowlist.ts's knownBadReason() lookup -- the static list is now one input (seed) of the composed route verdict, not the sole routing gate"
  - "shimCoverage.ts: the single module owning exported symbols AND served interface versions per arch (SHIM_EXPORTED_SYMBOLS/SHIM64_EXPORTED_SYMBOLS/SHIM_SERVED_INTERFACE_VERSIONS/SHIM64_SERVED_INTERFACE_VERSIONS/SHIM_X64_NULL_OBJECT_FALLBACK/SHIM_EXPORT_SET_VERSION), evaluateShimCoverage/evaluateShimCoverageWith, and isScanVerdictNowCovered for the auto-clear path -- pinned against the committed .def and meta/sdk manifests"
  - "SteamBridgeScanVerdict/SteamBridgeVerdict types + SteamMetadataCacheEntry.bridge field (electronStores.ts), and bridgeVerdict.ts's carry-forward-safe reader/writer family (readBridgeVerdict, writeBridgeScanVerdict, clearBridgeScanVerdict, setBridgeSteamApiPrescreen, setBridgeUserRoute, setBridgeNoticeAcknowledged, markBridgeLimitedNoticeShown, setBridgeIdentityFallback)"
affects: [51-07, 51-09, 51-13, 51-16, 51-18, steam-bridge, steam-bridge-allowlist]

actuals:
  tokens: 20220
  tasks: 3
  commits: 5
  plan_head_before: 9851a88e3c0541695107ac3265bf71aaa33c6341
  plan_head_after: bac8bed4ae7f6abc8e9156154d7d3e2ac925af21

tech-stack:
  added: []
  patterns:
    - "Zero-backend-import pure module boundary for shimCoverage.ts (node:crypto only), following importParse.ts/interfaceVersions.ts's 51-02 precedent, so a future standalone census tool (51-18) can bundle the exact coverage logic without the backend module graph"
    - "Fail-loud bundled-asset parse (allowlist.ts, .parse()) vs fail-safe untrusted-disk-read parse (bridgeVerdict.ts, zod .safeParse() -> undefined, never throws) as two deliberately DIFFERENT postures for two different trust boundaries, per the plan's own threat model (T-51-08 vs T-51-09)"
    - "evaluateShimCoverageWith as the pure, fully-parameterized core (including the x64 null-object-fallback flag as an explicit argument) behind evaluateShimCoverage's real-constants wrapper, so tests can exercise a branch (x64 fallback true) that has no real data yet"
    - "Nested single-field carry-forward contract (SteamMetadataCacheEntry.bridge: SteamBridgeVerdict) instead of N sibling top-level fields, so one CARRY-FORWARD WARNING doc comment and one read-modify-write spread cover the whole verdict family (D-51-07/10 scan/steamApi/userRoute/notice/identityFallback) rather than five separate carry-forward obligations"
    - "Compile-time bidirectional type assertion between a zod enum and its corresponding exported TS union (allowlist.ts's KNOWN_BAD_REASONS `as const satisfies readonly SteamBridgeKnownBadReason[]` plus a Record<SteamBridgeKnownBadReason, true> exhaustiveness literal) so the bundled schema and the IPC-facing type can never silently diverge"

key-files:
  created:
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
  modified:
    - src/common/types/steam.ts
    - src/common/types/ipc.ts
    - src/backend/storeManagers/steam/bridge/allowlist.ts
    - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
    - src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/electronStores.ts

key-decisions:
  - "bridge-allowlist.json's knownBad array ships EMPTY in this plan (not a placeholder -- research identified no owned DRM-wrapped title); 51-18's census adds evidence-backed entries later, per the plan's own action text"
  - "shimGenerate.ts no longer exports SHIM_EXPORTED_SYMBOLS -- it now imports it from shimCoverage.ts, which is the sole owner of both coverage dimensions (exported symbols + served interface versions); no second hand-synced copy was kept anywhere"
  - "isScanVerdictNowCovered checks a stored missing entry against BOTH export sets and BOTH served-version maps (not just the matching arch) -- deliberately permissive in the 'is this entry recognized at all' direction, while a malformed/differently-shaped entry (e.g. 'SteamUser@unknown-version') still never matches either lookup and is therefore never silently auto-cleared"
  - "setBridgeUserRoute(appId, undefined) deletes the userRoute key via object destructuring rather than storing an explicit undefined value, so a read-back is indistinguishable from 'never set' at the value level while still being a real key removal at the storage level"
  - "SteamBridgeVerdict.noticeAcknowledgedFor is typed as a plain string, not the narrower SteamBridgeRouteReason -- deliberately loose so a future reason value added to the union can never fail to round-trip through a value already persisted under an older build"

requirements-completed: []

coverage:
  - id: D1
    description: "Shared route/IPC contracts: SteamBridgeRouteVerdict, SteamBridgeRouteReason, SteamBridgeKnownBadReason, SteamBottleLaunchWaitingCause (common/types/steam.ts); getSteamBridgeRoute/setSteamBridgeUserRoute IPC channels and steamBridgeRouteNotice/steamBottleLaunchWaiting frontend messages, steamBridgeSetupRequired gains missingSymbols (common/types/ipc.ts)"
    verification:
      - kind: other
        ref: "pnpm codecheck (tsc --noEmit + tsconfig.meta.json) exits 0; grep -n \"SteamBridgeRouteVerdict\" steam.ts and grep -nE for the 4 new ipc.ts declarations both match"
        status: pass
    human_judgment: false
  - id: D2
    description: "Allowlist v2 (seed + knownBad, closed reason taxonomy) and shimCoverage.ts (exported symbols + served interface versions per arch, evaluateShimCoverage/evaluateShimCoverageWith, isScanVerdictNowCovered), both pinned against their sources of truth"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts (v2 schema accept/reject, knownBad reason enum, knownBadReason() numeric-guard/no-throw), __tests__/shimCoverage.test.ts (24-CR-02 .def pin moved here, meta/sdk manifest pin, computeExportSetVersion determinism/change-detection, evaluateShimCoverage ordering, x64 null-object-fallback branch), __tests__/shimGenerate.test.ts (unaffected behavior re-verified after the import move)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Persisted bridge verdict field family (SteamBridgeScanVerdict/SteamBridgeVerdict, SteamMetadataCacheEntry.bridge) with carry-forward-safe writers (bridgeVerdict.ts) and a fail-safe (never-throwing) reader"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts (26 tests: carry-forward across a second scan write, userRoute set/remove, minimal-entry fabrication + single log, malformed-shape fail-safe undefined, clear-scan-keeps-userRoute, every writer's non-numeric-appId no-op); src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts (unaffected, re-run green)"
        status: pass
    human_judgment: false

duration: ~22min
completed: 2026-10-17
status: complete
---

# Phase 51 Plan 03: Shared Bridge Data Contracts Summary

**Shared IPC/route types, the version-2 bundled allowlist (seed + known-bad with a closed reason taxonomy), a new shimCoverage.ts module pinning exported symbols and served interface versions against their sources of truth, and a persisted bridge-verdict field family with carry-forward-safe writers — the complete data-contract foundation every later Phase 51 plan (51-07/09/13/16/18) builds routing, persistence, and UI on top of.**

## Performance
- **Duration:** ~22min
- **Started:** 2026-10-17T05:39:00Z (continuing directly from 51-02's close-out)
- **Completed:** 2026-10-17T06:01:09Z
- **Tasks:** 3 completed
- **Files modified:** 12 (4 created, 8 modified)

## Accomplishments
- `common/types/steam.ts`/`ipc.ts` now carry the full Phase 51 data-contract surface (`SteamBridgeRouteVerdict` and its reason/known-bad/waiting-cause unions, the `getSteamBridgeRoute`/`setSteamBridgeUserRoute` IPC channels, two new frontend messages) with each member's doc comment naming the exact D-51-NN decision and the later plan that produces/consumes it — zero runtime behavior change, confirmed by `pnpm codecheck` staying green with no other file touched.
- `bridge-allowlist.json` is version 2: the static list is demoted to `seed` (one input of 51-07's composed route verdict), and a `knownBad` array with a closed, zod-enforced reason taxonomy (`drm-wrapped`/`win64-only`/`p2p-required`/`does-not-run`) is added — a compile-time bidirectional assertion keeps the zod enum and the exported `SteamBridgeKnownBadReason` TS type from ever silently diverging.
- `shimCoverage.ts` is the new single owner of both shim coverage dimensions (exported symbols, served interface versions per arch) — the 24-CR-02 `.def` pin moved here from `shimGenerate.test.ts` verbatim, a new pin proves `SHIM_SERVED_INTERFACE_VERSIONS`'s keys against `meta/sdk/*.manifest.json`, and `evaluateShimCoverage`/`isScanVerdictNowCovered` give 51-07 and the persisted-verdict auto-clear path their one shared coverage check.
- `electronStores.ts` gained `SteamBridgeScanVerdict`/`SteamBridgeVerdict`/`SteamMetadataCacheEntry.bridge`, and `bridgeVerdict.ts` is the sole reader/writer: every writer spreads `...existing` (14 occurrences across 7 writers) following the `markForcedWindowsViaBottle` precedent exactly, and `readBridgeVerdict` safe-parses the stored value, returning `undefined` (never throwing) on malformed/tampered data — the deliberate fail-safe opposite of the allowlist's fail-loud bundled-asset posture.
- All three tasks followed RED-GREEN TDD discipline with separate commits: for Task 2 and Task 3, the test file was written and committed first, confirmed to genuinely fail (schema-rejects-v2 assertions and `Cannot find module` respectively — Task 3's RED was additionally verified by temporarily removing the already-drafted `bridgeVerdict.ts` and re-running the suite), then the implementation commit made every test pass with zero fix-up iterations needed in either task.

## Task Commits
1. **Task 1 (types only): shared route/IPC contracts** - `e70ea8953` (feat)
2. **Task 2 RED: allowlist v2 + shimCoverage tests** - `f2bee6950` (test)
3. **Task 2 GREEN: allowlist v2 + shimCoverage.ts** - `653d9685b` (feat)
4. **Task 3 RED: bridgeVerdict tests** - `21812def6` (test)
5. **Task 3 GREEN: bridgeVerdict.ts + electronStores.ts field family** - `bac8bed4a` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP)

## Files Created/Modified
- `src/common/types/steam.ts` - `SteamBridgeKnownBadReason`, `SteamBridgeRouteReason`, `SteamBridgeRouteVerdict`, `SteamBottleLaunchWaitingCause`; `SteamBottleEligibilityVerdict.bridgeRoute?`
- `src/common/types/ipc.ts` - `getSteamBridgeRoute`/`setSteamBridgeUserRoute` async channels; `steamBridgeRouteNotice`/`steamBottleLaunchWaiting` frontend messages; `steamBridgeSetupRequired` gains `missingSymbols?`
- `src/backend/storeManagers/steam/bridge/allowlist.ts` - schema bumped to `version: 2` (`seed`/`knownBad`), `knownBadReason()` lookup, compile-time enum/type assertion
- `src/backend/storeManagers/steam/bridge/bridge-allowlist.json` - `games` renamed `seed`; `knownBad: []` added
- `src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts` - widened for the v2 schema + `knownBadReason()`
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts` (new) - `SHIM_EXPORTED_SYMBOLS`/`SHIM64_EXPORTED_SYMBOLS`, `SHIM_SERVED_INTERFACE_VERSIONS`/`SHIM64_SERVED_INTERFACE_VERSIONS`, `SHIM_X64_NULL_OBJECT_FALLBACK`, `SHIM_EXPORT_SET_VERSION`/`computeExportSetVersion`, `evaluateShimCoverage`/`evaluateShimCoverageWith`, `isScanVerdictNowCovered`
- `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` (new) - 24-CR-02 pin (moved), manifest pin, coverage/fallback/auto-clear behavior
- `src/backend/storeManagers/steam/bridge/shimGenerate.ts` - imports `SHIM_EXPORTED_SYMBOLS` from `./shimCoverage` instead of declaring it
- `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` - moved pin test out; drops the now-unneeded `SHIM_EXPORTED_SYMBOLS` import
- `src/backend/storeManagers/steam/electronStores.ts` - `SteamBridgeScanVerdict`, `SteamBridgeVerdict`, `SteamMetadataCacheEntry.bridge?`
- `src/backend/storeManagers/steam/bridge/bridgeVerdict.ts` (new) - `readBridgeVerdict` + 7 carry-forward-safe writers
- `src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts` (new) - 26 tests, stateful in-memory `steamMetadataStore` fake

## Decisions Made
See `key-decisions` in frontmatter: empty `knownBad` list by design, single coverage owner (no second hand-synced symbol list), permissive-but-safe `isScanVerdictNowCovered` membership test, `userRoute` key-deletion semantics, and the deliberately loose `noticeAcknowledgedFor` string type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Acceptance criterion `grep -c "safeParse"` would have failed on an inherited comment**
- **Found during:** Task 2, acceptance-criteria verification loop
- **Issue:** The plan's acceptance criteria require `grep -c "safeParse" allowlist.ts` to print `0` (proving the fail-loud `.parse()` posture has no non-throwing variant anywhere in the file). The ORIGINAL Phase 24 file already contained a comment reading `` `.parse()` (not `.safeParse()`) is deliberate `` — carried forward verbatim into this plan's widened doc comment, it would have made the literal grep print `1`, failing the gate on a comment, not a behavior.
- **Fix:** Reworded the comment to explain the same fail-loud rationale without using the literal string `safeParse` (now: "deliberately NOT the non-throwing parse variant").
- **Files modified:** `src/backend/storeManagers/steam/bridge/allowlist.ts`
- **Verification:** `grep -c "safeParse" allowlist.ts` now prints `0`; all allowlist tests still pass.
- **Committed in:** `653d9685b`

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking issue, a wording-only fix with no behavior change)
**Impact on plan:** None beyond satisfying the plan's own acceptance gate exactly as written — no scope creep, no behavior change.

## TDD Gate Compliance
`workflow.tdd_mode` is `false` for this project and no `TDD_MODE=true` was passed to this executor, so the MVP+TDD runtime gate did not apply. Task 2 and Task 3 (both `tdd="true"`) still followed RED-GREEN with separate commits each: for Task 2, `allowlist.test.ts`/`shimCoverage.test.ts`/`shimGenerate.test.ts` were written and run first, producing genuine failures (schema-rejects-v2 assertion failures for the former, `Cannot find module '../shimCoverage'` for the latter — a real RED for a module that does not exist yet); the implementation commit then made all 58 tests in that scope pass. For Task 3, `bridgeVerdict.test.ts` was written, and RED was additionally VERIFIED by temporarily moving the already-drafted `bridgeVerdict.ts` out of the tree and re-running the suite (confirmed `Cannot find module '../bridgeVerdict'`) before restoring it and committing the RED/GREEN pair separately — a stronger confirmation than relying on the test's as-written failure alone. No `gsd_run check tdd-red-evidence` record was persisted (consistent with this project's established practice, e.g. 48-05/49-01/51-02) — both RED states here are module-resolution failures or clean assertion failures, not a classifier-scored TAP run.

## Issues Encountered
None beyond the acceptance-criterion wording fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 51-07's route resolver can now import `SteamBridgeRouteVerdict`/`SteamBridgeRouteReason` directly and compose seed ∪ persisted verdict (`readBridgeVerdict`) ∖ known-bad (`bridgeAllowlist.knownBadReason`) ∖ forced-bottle, using `shimCoverage.ts`'s `evaluateShimCoverage`/`isScanVerdictNowCovered` for the coverage half.
- 51-09 has everything it needs to extend `games.ts`'s enumerated `fetchMetadataIfNeeded` writer (~L870) with a `bridge` carry-forward clause — called out explicitly in `electronStores.ts`'s new doc comment so it is not missed, and NOT done in this plan per the plan's own scope boundary.
- 51-13 (IPC handlers) and 51-16 (UI) have concrete, documented types/channels to implement against with no further type negotiation needed.
- No blockers. Full `pnpm jest src/backend/storeManagers/steam --silent` (51 suites, 1804 tests) and `pnpm codecheck` both green at close-out.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-17*

## Self-Check: PASSED
