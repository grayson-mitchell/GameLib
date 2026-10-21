---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 16
subsystem: ui
tags: [steam-bridge, install-dialog, game-page, i18n, pure-function, tdd]

requires:
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 04)
    provides: the full steam.bridge.* catalog (route/forceBottle/knownBad/limited/routeNotice/setup keys), SteamBridgeRouteVerdict/SteamBridgeRouteReason/SteamBridgeKnownBadReason types
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 12)
    provides: shimCoverage.ts's stubbedInterfaces output, consumed via SteamBridgeRouteVerdict
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 13)
    provides: the getSteamBridgeRoute / setSteamBridgeUserRoute IPC channels (steamAuthFlowRegistration.ts, installFormIpc.ts)
provides:
  - "resolveBridgeRouteLine(verdict, wineSectionVisible): pure module driving the install dialog's wine-section route line + force-bottled toggle (D-51-09/D-51-10)"
  - "resolveBridgeRouteDisplay(verdict): pure module driving the game-page route row + limited-features lines, installedIn-aware so a stale route reason is suppressed once the live verdict disagrees with where the game is actually installed (D-51-09/D-51-02)"
  - "SteamDialog/index.tsx wired to its own getSteamBridgeRoute round trip, rendering the route line inside the wine section and persisting the force-bottled toggle via setSteamBridgeUserRoute"
  - "AppleWikiInfo.tsx wired to the same channel, rendering the route row beside the compatibility rating with missing symbols and limited-features text"
affects: [51-18, bridgeRoute, D-51-02-notice]

actuals:
  tokens: 8508
  tasks: 2
  commits: 4
  plan_head_before: 97b23ddfe9940422ab581acaade14815f73804ae
  plan_head_after: bfe1a6cb21a091d60ecd3857b58ceeb7e9713180

tech-stack:
  added: []
  patterns:
    - "Both new pure modules independently duplicate the same small steam.bridge.route.reason.*/steam.bridge.knownBad.* key maps rather than sharing an import -- the same zero/near-zero-imports discipline steamSectionGating.ts and steamPlatformRow.ts each hold on their own, so a jsdom-free jest project can prove them without pulling in a stylesheet-importing component tree"
    - "SteamDialog/index.tsx fetches the bridge-route verdict through its OWN getSteamBridgeRoute round trip rather than extending the parent InstallModal/index.tsx's isSteamBottleEligible probe -- kept the plan's files_modified scope (this dialog + the new pure module only) and avoided touching the shared steamEligibilityProbe.ts hook"
    - "installedIn vs route precedence in resolveBridgeRouteDisplay: the game-page display reports where the game's bits ACTUALLY live (installedIn) for routeKey, and only shows the reason sentence when the live route verdict still agrees with that installed location -- prevents a stale explanation (e.g. a since-superseded known-bad reason) from being shown against a route no longer in effect"

key-files:
  created:
    - src/frontend/screens/Library/components/InstallModal/steamBridgeRouteLine.ts
    - src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts
    - src/frontend/screens/Game/GamePage/components/bridgeRouteDisplay.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/bridgeRouteDisplay.test.ts
  modified:
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx

key-decisions:
  - "SteamDialog's route verdict is its own getSteamBridgeRoute(appName) round trip, independent of the parent's isSteamBottleEligible probe -- not a second read of the same hook, and not a parent-component change (out of this plan's files_modified scope)"
  - "resolveBridgeRouteDisplay suppresses the reason sentence (but not routeKey) when installedIn disagrees with the live route verdict -- routeKey always reflects where the game is actually installed; the reason only applies when the live route still agrees"
  - "Limited-features lines (stubbed-interfaces body + identity-fallback) are scoped to installedIn === 'bridge' only, never shown for a bottle install or before anything is installed"
  - "Toggle hidden (showForceBottleToggle: false) for 'known-bad' and 'win64-no-shim' reasons -- neither is fixable by a bottled<->bridge flip from this dialog"

patterns-established:
  - "A second pure, zero-React-import display module per game-page/install-dialog surface, each independently holding its own tiny reason-key map rather than sharing one via import"

requirements-completed: []

coverage:
  - id: D1
    description: "Install dialog's wine section shows the route verdict line + reason, and a force-bottled toggle that persists via setSteamBridgeUserRoute"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts"
        status: pass
    human_judgment: true
    rationale: "The actual rendered checkbox/line appearance in the dialog was not visually confirmed in a running app (no jsdom in this project's frontend jest config) -- the pure resolver and the source-gated wiring are both proven, but the rendered DOM output is not."
  - id: D2
    description: "Game page shows the route next to the compatibility rating, including missing symbols and the D-51-02 limited-features / identity-fallback lines"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/__tests__/bridgeRouteDisplay.test.ts"
        status: pass
    human_judgment: true
    rationale: "Same jsdom-free limitation as D1 -- the resolver's output is fully proven, but the actual rendered row on a live game page was not visually confirmed."
  - id: D3
    description: "Gating logic lives in pure, React-free modules; components only render resolver output"
    verification:
      - kind: unit
        ref: "steamBridgeRouteLine.test.ts and bridgeRouteDisplay.test.ts's own 'at most one import statement' source-shape tests, plus the acceptance_criteria grep checks run during execution"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 16: Install-Dialog Route Line and Game-Page Route Row Summary

**Two pure resolver modules (install-dialog route line + force-bottled toggle; game-page route row + limited-features lines) wired into SteamDialog and AppleWikiInfo via each surface's own `getSteamBridgeRoute` round trip.**

## Performance
- **Duration:** ~20min
- **Started:** 2026-10-21 (session start; first commit 2026-10-21T11:31:44Z)
- **Completed:** 2026-10-21T11:40:59Z
- **Tasks:** 2 completed
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- `resolveBridgeRouteLine` (D-51-09/D-51-10): a pure, zero-React-import module turning a `SteamBridgeRouteVerdict` + `wineSectionVisible` into the install dialog's route line fields — native/bottled label, the full `steam.bridge.route.reason.*` key map, known-bad's translated `reasonParams`, missing symbols passthrough, and whether/how the force-bottled toggle renders.
- `resolveBridgeRouteDisplay` (D-51-09/D-51-02): the game-page sibling, additionally `installedIn`-aware so the route row always reflects where the game's bits actually live, suppressing a stale reason sentence once the live route verdict no longer agrees with the installed location, and scoping the limited-features lines (stubbed interfaces, identity fallback) to a live bridge install only.
- `SteamDialog/index.tsx` fetches the verdict via its own `getSteamBridgeRoute` round trip (kept out of the parent `InstallModal/index.tsx` and the shared `steamEligibilityProbe.ts` hook, per this plan's file scope), renders the line inside the wine section, and on toggle persists through `setSteamBridgeUserRoute` then re-probes the same channel so the UI reflects what was actually written.
- `AppleWikiInfo.tsx` fetches the same verdict once per Steam game and renders the route row beside the AppleGamingWiki compatibility rating, with a "Not covered: …" line and each limited-features line as plain text (no `dangerouslySetInnerHTML`, per T-51-36).

## Task Commits
1. **Task 1a: RED — failing test for steamBridgeRouteLine** - `346578361` (test)
2. **Task 1b: GREEN — install-dialog route line and force-bottled toggle** - `552c059ca` (feat)
3. **Task 2a: RED — failing test for bridgeRouteDisplay** - `4ba9775fc` (test)
4. **Task 2b: GREEN — game-page route row with missing symbols and limited-features lines** - `bfe1a6cb2` (feat)

## Files Created/Modified
- `src/frontend/screens/Library/components/InstallModal/steamBridgeRouteLine.ts` — pure resolver for the install dialog's route line + toggle (D-51-09/D-51-10)
- `src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts` — its tests
- `src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx` — wired the resolver, the `getSteamBridgeRoute`/`setSteamBridgeUserRoute` round trips, and the rendered line + `ToggleSwitch`
- `src/frontend/screens/Game/GamePage/components/bridgeRouteDisplay.ts` — pure resolver for the game-page route row + limited-features lines (D-51-09/D-51-02)
- `src/frontend/screens/Game/GamePage/components/__tests__/bridgeRouteDisplay.test.ts` — its tests
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` — wired the resolver, the `getSteamBridgeRoute` round trip, and the rendered row

## Decisions Made
- SteamDialog's route verdict is its own `getSteamBridgeRoute(appName)` round trip, independent of the parent's `isSteamBottleEligible` probe — this plan's `files_modified` scope excludes `InstallModal/index.tsx` and `steamEligibilityProbe.ts`, so adding a second channel read in the dialog itself (mirroring the game-page component's own approach) was the only way to surface the verdict without touching out-of-scope files.
- `resolveBridgeRouteDisplay` suppresses the reason sentence (not `routeKey`) when `installedIn` disagrees with the live route verdict — documented in the module's own header as a deliberate interpretation of the plan's "reasonKey null unless the verdict also routes bottle" rule, applied symmetrically to the bridge case for consistency.
- The toggle's cancellation-flag local variable in `SteamDialog/index.tsx`'s new effect is named `bridgeRouteCancelled`, not the generic `cancelled` Effect B already uses two effects down — a second `let cancelled = false` ahead of Effect B would have silently relocated `steamDialogSource.test.ts`'s positional disk-space-clear gate onto the wrong effect (caught by running that regression suite before committing).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a self-authored test assertion bug in the RED commit for steamBridgeRouteLine.test.ts**
- **Found during:** Task 1, confirming GREEN after writing the pure module
- **Issue:** The "zero-import" source-shape test checked `importLines[0]` (the first physical line of the import statement) for the substring `'common/types/steam'`, but prettier wraps a 3-name type-only import onto multiple lines, so the first line is only `import type {` and the module path sits on a later line — the assertion failed even though the real acceptance criterion (`grep -c "^import"` prints at most 1) was already satisfied.
- **Fix:** Changed the assertion to match the whole file source with a multiline-aware regex (`/^import[^;]*common\/types\/steam/m`) instead of indexing into the split-by-newline import lines array.
- **Files modified:** `src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts` (and the identical pattern pre-emptively used correctly in the sibling `bridgeRouteDisplay.test.ts`)
- **Verification:** Both the corrected assertion and the independent shell-run acceptance-criteria grep pass.
- **Commit:** `552c059ca` (folded into the GREEN commit, since the RED commit's failure was the intended "module does not exist" error, not this assertion)

**2. [Rule 1 - Bug] Renamed a new effect's cancellation flag to avoid colliding with an existing positional test gate**
- **Found during:** Task 1, running `steamDialogSource.test.ts` after wiring the new effect into `SteamDialog/index.tsx`
- **Issue:** The new `getSteamBridgeRoute` effect's `let cancelled = false` was textually the FIRST occurrence of that literal in the file (ahead of the pre-existing Effect B), and `steamDialogSource.test.ts`'s `assertDiskSpaceClearedBeforeProbe` locates Effect B's boundaries by searching for that exact string — the new effect silently became the one the positional gate inspected, and its own RED-proof sub-test failed (`did not throw` where it expected a thrown error from a known-bad specimen).
- **Fix:** Renamed the new effect's local flag to `bridgeRouteCancelled`, leaving Effect B's `let cancelled = false` as the unique, correctly-located first occurrence.
- **Files modified:** `src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx`
- **Verification:** `steamDialogSource.test.ts` 137/137 passing after the rename.
- **Commit:** `552c059ca`

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs caught by the plan's own regression suites before committing). **Impact:** none to the shipped behavior; both were caught and fixed before the GREEN commits, with the full regression suites re-run afterward to confirm.

## Issues Encountered

None blocking. One out-of-scope, pre-existing finding surfaced while running the full frontend+meta suites beyond what this plan's `<verify>` blocks required (not fixed, per the deviation scope boundary — it is unrelated to any file this plan touches):

- `meta/__tests__/hardcodedStringGate.test.ts` fails with 6 violations, all in `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` (object-property hardcoded strings/keys for the "Waiting for Steam…" bottle-launch causes). That file was last touched by Phase 51 Plan 08 (`67ef1c4b1`), not this plan — `git diff` confirms zero changes to it here. Not run as part of either task's `<verify>` block (which scope to the frontend jest project's `--silent` run plus `codecheck`/`i18n`/`prettier`, none of which include this separate `meta/` jest project). Surfacing it here rather than silently leaving it undiscovered; recommend a follow-up quick task or todo against Plan 08's own scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Both D-51-09/D-51-10/D-51-02 UI surfaces are wired end-to-end against the Plan 13 IPC channels and the Plan 04 catalog. The route is now visible and overridable from both the install dialog and the game page. No blockers for subsequent plans in this phase (51-17/51-18 per the roadmap).

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*

## Self-Check: PASSED

All 4 created/modified source files and all 4 task commit hashes verified present on disk / in `git log --oneline --all`.
