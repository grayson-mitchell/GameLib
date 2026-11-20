---
phase: quick-261029-avh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-10-28-install-route-notice-unaware-of-drm-mode.md
  - .planning/todos/completed/2026-10-28-install-route-notice-unaware-of-drm-mode.md
autonomous: true
requirements:
  - TODO-2026-10-28-install-route-notice-unaware-of-drm-mode

must_haves:
  truths:
    - "Installing a title whose persisted scan is a miss AND carries drmWrapper 'steamstub' (Grim Dawn 219990's exact persisted shape) does NOT fire steamBridgeRouteNotice and proceeds straight to the bridge install"
    - "Installing a non-DRM title with an unacknowledged persisted scan miss still fires exactly one steamBridgeRouteNotice with reason 'scan-miss' on route 'bridge' (behavior unchanged)"
    - "The DRM-mode prediction at install time uses the same resolveBridgeMode() rule that launch uses (steamstub and no CEG markers -> steamclient-layer), not a second hand-written copy"
    - "The persisted scan verdict itself is untouched -- routing still lands on bridge / 'scan-miss' carrying the missing symbols; only the notice is suppressed"
    - "The todo file lives in .planning/todos/completed/ and no longer in .planning/todos/pending/"
  artifacts:
    - path: "src/backend/storeManagers/steam/bridge/bridgeRoute.ts"
      provides: "Row 7 suppresses the scan-miss notice for a DRM-mode (steamclient-layer) title"
      contains: "resolveBridgeMode"
    - path: "src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts"
      provides: "Resolver unit tests: DRM-mode miss -> no notice; non-DRM miss -> notice"
    - path: "src/backend/storeManagers/steam/__tests__/games.test.ts"
      provides: "install()-level tests in the quick 261023-oq7 describe block"
    - path: ".planning/todos/completed/2026-10-28-install-route-notice-unaware-of-drm-mode.md"
      provides: "Closed todo (pure git mv, content unchanged)"
  key_links:
    - from: "src/backend/storeManagers/steam/bridge/bridgeRoute.ts"
      to: "src/backend/storeManagers/steam/bridge/drm/steamclientLayerMode.ts"
      via: "import { resolveBridgeMode } from './drm/steamclientLayerMode'"
      pattern: "from './drm/steamclientLayerMode'"
    - from: "src/backend/storeManagers/steam/games.ts install()"
      to: "resolveBridgeRoute row 7 noticeRequired"
      via: "bridgeRoute().noticeRequired gate before sendFrontendMessage('steamBridgeRouteNotice')"
      pattern: "bridgeRoute.noticeRequired"
---

<objective>
Make the install route notice DRM-aware: a title the launch path will run in
steamclient-layer DRM mode (Phase 56, D-12) must not get the "may not work with the
native Steam bridge ... probably not run" scan-miss dialog.

Root cause (investigated during planning, do not re-derive):
- `install()` in `src/backend/storeManagers/steam/games.ts` (around lines 1656-1745) calls
  `this.bridgeRoute()` -> `resolveBridgeRoute()` in `bridge/bridgeRoute.ts`. Row 7 there returns
  `bridge / 'scan-miss'` with `noticeRequired: !isAcknowledged(verdict, 'scan-miss')` for any
  persisted uncovered scan miss. `install()` then sends `steamBridgeRouteNotice` and defers.
- The resolver has no notion of DRM mode. DRM mode is decided only at LAUNCH (games.ts around
  line 3606: `detectDrmWrapper(exePath)` + `resolveBridgeMode(...) === 'steamclient-layer'`), and a
  DRM-mode launch returns via `launchDrmModeGame` BEFORE any shim placement -- so the shim's
  missing symbols are irrelevant to a DRM-mode title, and the warning is wrong for it.
- The pre-install signal already exists in the persisted verdict: `placeShimForGame`
  (shimGenerate.ts ~line 537-544) stamps `drmWrapper: 'steamstub'` onto the scan verdict.
  Grim Dawn's live store (`~/Library/Application Support/gamelib/store_cache/steam_metadata.json`,
  appId 219990, checked 2026-10-29) carries exactly: `bridge.scan.status: 'miss'`,
  `arch: 'x64'`, nine missing symbols, `drmWrapper: 'steamstub'`, `steamApi: 'both'`.

Scope decision (keep to the todo): suppress the notice only; do NOT clear or rewrite the stale
scan-miss verdict. Its `missingSymbols` still drive shim widening and the census, and the scan is
still correct as a description of the exe's imports. Out of scope, record in SUMMARY only: row 5
(`win64-no-shim`) can likewise be irrelevant to a DRM-mode title, and a DRM-mode title that
has never been installed/scanned has no persisted `drmWrapper` to consult -- neither is what the
todo reports.

Output: resolver change + unit tests, install()-level tests, todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-10-28-install-route-notice-unaware-of-drm-mode.md
@src/backend/storeManagers/steam/bridge/bridgeRoute.ts

<interfaces>
From src/backend/storeManagers/steam/bridge/drm/steamclientLayerMode.ts (zero-import module by
design, D-51-15 -- importing FROM it is fine, adding imports TO it is not):

  export function resolveBridgeMode(
    drmWrapper: 'steamstub' | 'none' | undefined,
    cegMarkers?: readonly string[]
  ): BridgeMode   // 'tcp' unless drmWrapper === 'steamstub' AND no cegMarkers -> 'steamclient-layer'

From src/backend/storeManagers/steam/electronStores.ts:

  interface SteamBridgeScanVerdict { status: 'clean' | 'miss'; arch: 'x86' | 'x64';
    missingSymbols: string[]; interfaceVersions: Record<string,string>;
    stubbedInterfaces: string[]; shimExportSetVersion: string; scannedAt: string;
    originalFingerprints?: ...; drmWrapper?: 'steamstub'; managedScan?: ... }
  interface SteamBridgeVerdict { scan?: SteamBridgeScanVerdict; steamApi?: ...;
    userRoute?: 'bottle' | 'bridge'; noticeAcknowledgedFor?: string; drm?: 'ceg'; ... }

From bridgeRoute.ts, current row 7 (the line to change):

  if (scanMiss) {
    return toBridge('scan-miss', {
      knownBadReason,
      missingSymbols,
      noticeRequired: !isAcknowledged(verdict, 'scan-miss')
    })
  }

Test fixtures already present:
- bridge/__tests__/bridgeRoute.test.ts: `baseInput` (line 17, win64ShimPresent: false) and an
  `uncoveredMiss(extra?)` helper used by the row-7 tests (~lines 245-300). Its scan arch is x86, so
  row 5 does not intercept; a test using arch 'x64' must set `win64ShimPresent: true`.
- __tests__/games.test.ts: `describe('quick 261023-oq7: scan-miss routes to the bridge behind an
  informational notice')` (~line 5653) with `missScan`, `arrange(bridge, knownBad)` and
  `noticeCalls()` helpers; its "acknowledged for scan-miss" test shows the proceed-path
  assertions (`downloadSteamDepots` called, `tellBottledSteamToInstall` not called).
  games.test.ts does NOT jest.mock bridgeRoute or steamclientLayerMode, so the real resolver runs.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Row 7 of resolveBridgeRoute suppresses the scan-miss notice for a DRM-mode title</name>
  <files>src/backend/storeManagers/steam/bridge/bridgeRoute.ts, src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts</files>
  <behavior>
    - DRM-mode miss: `verdict: uncoveredMiss()` with `scan.drmWrapper: 'steamstub'` -> route 'bridge', reason 'scan-miss', missingSymbols carried unchanged, noticeRequired false (unacknowledged).
    - Grim Dawn shape: scan arch 'x64', drmWrapper 'steamstub', `win64ShimPresent: true`, `steamApi: 'both'` -> bridge / 'scan-miss', noticeRequired false.
    - Non-DRM miss unchanged: the same miss without drmWrapper -> noticeRequired true (existing row-7 test keeps passing; add one explicit side-by-side assertion in the new test).
    - Known-bad interplay: DRM-mode miss with knownBadReason 'does-not-run' -> still bridge / 'scan-miss', knownBadReason 'does-not-run' carried, noticeRequired false.
  </behavior>
  <action>
RED first: add a `describe` (or `it` group) next to the existing row-7 tests in bridgeRoute.test.ts
covering the four behaviors above. Build the DRM verdict by extending `uncoveredMiss()`'s scan
(spread the scan and add `drmWrapper: 'steamstub'`) rather than a new fixture shape. Run the file;
the DRM-mode cases must fail.

GREEN: in bridgeRoute.ts add `import { resolveBridgeMode } from './drm/steamclientLayerMode'`.
Inside the row-7 branch compute whether the title will launch in DRM mode with
`resolveBridgeMode(scan.drmWrapper, undefined) === 'steamclient-layer'` -- reuse the launch-path
rule, do not hand-write a `=== 'steamstub'` copy. CEG markers are passed as undefined because a
CEG title never reaches row 7: `verdict.drm === 'ceg'` routes to bottle at row 4, and a
user-forced 'bridge' returns at row 6 first -- state this in a short comment. Set
`noticeRequired` to false when DRM mode, else keep `!isAcknowledged(verdict, 'scan-miss')`.
Keep route 'bridge', reason 'scan-miss', knownBadReason and missingSymbols exactly as today: the
verdict is not cleared or rewritten (per the plan's scope decision). The known-bad informational
notice is also not raised for a DRM-mode miss: the known-bad list's non-DRM reasons describe the
shim path, which DRM mode bypasses -- say so in the comment.

Update the docs: the module header's row-7 entry in the `resolveBridgeRoute` doc comment and the
inline row-7 comment gain one sentence each, tagged `quick 261029-avh`, saying a scan miss on a
title whose persisted scan carries drmWrapper 'steamstub' (steamclient-layer DRM mode, Phase 56
D-12) owes no notice because DRM mode launches before any shim placement. Also update the
`NOTICE_REASONS` doc comment if it states 'scan-miss' always owes a notice. Do not touch
steamclientLayerMode.ts (zero-import module).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts && npx tsc --noEmit -p tsconfig.json && npx prettier --check src/backend/storeManagers/steam/bridge/bridgeRoute.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts && grep -v '^\s*\*\|^\s*//' src/backend/storeManagers/steam/bridge/bridgeRoute.ts | grep -c "resolveBridgeMode("</automated>
  </verify>
  <done>New DRM-mode tests fail before the change and pass after; all pre-existing bridgeRoute tests pass unchanged; tsc clean; prettier clean on both paths (both report "ignored": false via --file-info, checked during planning); the final grep prints at least 1 (a real call, not a comment).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: install()-level coverage, then close the todo</name>
  <files>src/backend/storeManagers/steam/__tests__/games.test.ts, .planning/todos/pending/2026-10-28-install-route-notice-unaware-of-drm-mode.md, .planning/todos/completed/2026-10-28-install-route-notice-unaware-of-drm-mode.md</files>
  <behavior>
    - DRM-mode miss (missScan plus drmWrapper 'steamstub', unacknowledged): `install()` sends no steamBridgeRouteNotice, does not return `{ status: 'done', deferredToSetup: true }` from the notice branch, calls `downloadSteamDepots`, never calls `tellBottledSteamToInstall`.
    - Non-DRM miss, unacknowledged: exactly one steamBridgeRouteNotice with reason 'scan-miss', route 'bridge' (assert it in the same new `it` group so the pair reads side by side, even though the existing "unacknowledged" test already covers it).
  </behavior>
  <action>
Add two `it` cases inside the existing `describe('quick 261023-oq7: scan-miss routes to the bridge
behind an informational notice')` block in games.test.ts, tagged `quick 261029-avh` in the test
names. Reuse `arrange()` by passing a `scan` override in its `bridge` argument
(`{ scan: { ...missScan, drmWrapper: 'steamstub' } }` -- arrange spreads `bridge` after `scan`, so
the override wins). Mirror the assertions of the existing "acknowledged for scan-miss: no notice,
downloads through the bridge" test for the DRM case. These should pass immediately on top of
Task 1; if the DRM case still shows a notice, the fix is in games.ts's notice gate reading
something other than `bridgeRoute.noticeRequired` -- investigate before changing anything there.
No production change to games.ts is expected.

Then close the todo with a pure rename, content unchanged, matching how
`98837f09b` closed `2026-10-28-grim-dawn-drm-crash-after-getactionsethandle.md` (R100):
`git mv .planning/todos/pending/2026-10-28-install-route-notice-unaware-of-drm-mode.md .planning/todos/completed/`.
The completed/ directory already exists.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "scan-miss routes to the bridge" && npx prettier --check src/backend/storeManagers/steam/__tests__/games.test.ts && test -f .planning/todos/completed/2026-10-28-install-route-notice-unaware-of-drm-mode.md && test ! -e .planning/todos/pending/2026-10-28-install-route-notice-unaware-of-drm-mode.md && pnpm planning-gates</automated>
  </verify>
  <done>Both new install() cases pass alongside the existing oq7 cases; prettier clean on games.test.ts (not ignored, checked during planning); the todo moves are under .planning/, which prettier ignores, so no formatter check is carried for them; the todo exists only under completed/ and planning-gates passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| persisted metadata store -> route resolver | `bridge.scan.drmWrapper` is written by GameLib's own PE scan; not user/network input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-avh-01 | Tampering | bridgeRoute.ts row 7 | accept | A forged drmWrapper only suppresses an informational dialog; routing is unchanged (still bridge / 'scan-miss') and the store is local, user-owned |
| T-avh-02 | Repudiation | suppressed notice | mitigate | Routing still carries reason 'scan-miss' and missingSymbols, and the launch path logs the DRM-mode decision, so the skipped notice stays diagnosable |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` passes in full (not just the -t subset).
- `pnpm codecheck` passes.
- `npx prettier --check` over the three .ts paths passes.
</verification>

<success_criteria>
- A DRM-mode (SteamStub, no CEG) title with a persisted scan miss installs without the scan-miss dialog.
- A non-DRM title with a persisted scan miss still gets the dialog.
- The scan verdict is not modified by this change.
- The todo is in .planning/todos/completed/.
</success_criteria>

<output>
Create `.planning/quick/261029-avh-route-notice-consults-drm-routing-before/261029-avh-SUMMARY.md` when done. Record the two out-of-scope notes from the objective (row 5 win64-no-shim for DRM titles; never-scanned DRM titles have no persisted drmWrapper).
</output>
