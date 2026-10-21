---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 13
subsystem: steam-bridge
tags: [steam, bridge, ipc, zustand, i18next, dialog]

# Dependency graph
requires:
  - phase: 51-03
    provides: bridgeAllowlist, NOTICE_REASONS, bridgeVerdict.ts writers (setBridgeUserRoute, setBridgeNoticeAcknowledged), common/types/ipc.ts channel declarations
  - phase: 51-04
    provides: public/locales/en/gamelib.json steam.bridge.routeNotice.* / steam.bridge.knownBad.* catalog strings
  - phase: 51-08
    provides: SteamBridgeRouteVerdict shape, resolveBridgeRoute() precedence
  - phase: 51-09
    provides: games.ts's bridgeRoute()/assembleBridgeRouteInput(), getBridgeRouteVerdict() export
  - phase: 51-12
    provides: steamAuthFlowRegistration.ts current registration order, bridge-limited-notice precedent
provides:
  - install() route-notice gate (D-51-08/11): known-bad / unrecovered-scan-miss / win64-no-shim bottle routes pause for an explicit user choice instead of silently dispatching to bottled Steam
  - getSteamBridgeRoute / setSteamBridgeUserRoute validated IPC channels (sidecar + preload)
  - getSteamBottleEligibilityVerdict now carries bridgeRoute on the same round trip when eligible
  - SteamBridgeRouteNotice store + 3-button in-app dialog, mounted in App.tsx
affects: [steam-bridge, install-dialog, game-page]

# Actuals (#2632)
actuals:
  tokens: 12284
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Up-front route-notice gate: install() computes the composed SteamBridgeRouteVerdict once and branches on route+noticeRequired before any bottled/bridge dispatch, mirroring the existing steamBottleSetupRequired deferral shape (deferredToSetup: true)."
    - "Validation-core function (handleSetSteamBridgeUserRoute) lives in installFormIpc.ts and is imported by the sidecar registration, following the existing isSteamBottleEligible/persistBottleWineVersion no-fork precedent (D-02)."
    - "acknowledgeReason is validated against bridgeRoute.ts's exported NOTICE_REASONS set rather than the full SteamBridgeRouteReason union, so only reasons that can ever drive a notice are legitimate acknowledgement targets."

key-files:
  created:
    - src/frontend/state/SteamBridgeRouteNotice.ts
    - src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/installFormIpc.ts
    - src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
    - src/preload/api/steam.ts
    - src/preload/__tests__/steamInstallFormApi.test.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/App.tsx
    - public/locales/en/gamelib.json

key-decisions:
  - "getSteamBridgeRoute's IPC body delegates directly to games.ts's existing exported getBridgeRouteVerdict() (which already carries its own typeof/numeric guard) rather than adding a second wrapper in installFormIpc.ts -- avoids a redundant validation layer."
  - "Dynamic i18n key for the known-bad reason line (t(`steam.bridge.knownBad.${knownBadReasonKey(reason)}`)) follows the existing DiscountFilters.tsx/ExperimentalFeatures.tsx precedent for enum-to-catalog-key mapping; confirmed safe by running pnpm i18n and observing zero warnings and a clean, expected 2-key diff."

requirements-completed: []

coverage:
  - id: D1
    description: "install() raises steamBridgeRouteNotice + defers to setup for a known-bad or unrecovered-scan-miss bottle route with no acknowledgement; an acknowledged notice or a userRoute 'bridge' override bypasses it; user-forced-bottle/failed-this-session stay notice-free."
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts#SteamGame.install() — Phase 24 Plan 08 bridge routing (R4/BLOCKER-1/finding-3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getSteamBridgeRoute / setSteamBridgeUserRoute validated IPC channels registered on the sidecar and exposed via preload invokers; getSteamBottleEligibilityVerdict composes bridgeRoute when eligible; handleSetSteamBridgeUserRoute rejects every malformed payload (T-51-30) with no store write."
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts#handleSetSteamBridgeUserRoute — D-51-10/11"
        status: pass
      - kind: integration
        ref: "src/backend/sidecar/__tests__/steamAuthFlows.test.ts"
        status: pass
      - kind: unit
        ref: "src/preload/__tests__/steamInstallFormApi.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "SteamBridgeRouteNotice.tsx renders the 3-button dialog (Use bottled Steam / Try the bridge anyway / Cancel), hides the bridge override for win64-no-shim, and is mounted in App.tsx beside SteamBridgeSetup; GlobalState.tsx subscribes the backend push."
    verification:
      - kind: unit
        ref: "src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts"
        status: pass
    human_judgment: true
    rationale: "The dialog's visual layout, button wiring to window.api.setSteamBridgeUserRoute/installSteamGame, and error-state rendering are exercised only at the store/pure-function level (no jsdom in this project's frontend jest config) -- a human needs to click through the real dialog to confirm the end-to-end UI behaves as designed."

# Metrics
duration: 43min
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 13: Bridge-specific bottled routing notice + validated IPC Summary

**Known-bad/scan-miss/win64-no-shim installs now pause for an explicit 3-button in-app choice (Use bottled Steam / Try the bridge anyway / Cancel) instead of silently routing to the bottled Windows Steam client, backed by two new validated IPC channels (getSteamBridgeRoute, setSteamBridgeUserRoute).**

## Performance

- **Duration:** 43 min
- **Started:** 2026-10-21T19:47:26+13:00
- **Completed:** 2026-10-21T20:30:31+13:00
- **Tasks:** 3
- **Files modified:** 14 (3 created, 11 modified)

## Accomplishments
- `install()` computes the composed `SteamBridgeRouteVerdict` once and, when the route is `bottle` with `noticeRequired: true` (known-bad or an unrecovered scan-miss, unless already acknowledged for that reason), fires `steamBridgeRouteNotice` and returns `deferredToSetup: true` instead of dispatching to bottled Steam — no silent heavy Windows Steam client (D-51-08).
- A `userRoute: 'bridge'` override (D-51-11's "Try the bridge anyway") bypasses the notice and routes straight to `installBridgeGame`, even for a known-bad title.
- `getSteamBridgeRoute` and `setSteamBridgeUserRoute` sidecar channels + preload invokers expose the composed route and let the renderer persist the user's bridge/bottle override and notice acknowledgement, validated by `handleSetSteamBridgeUserRoute` (installFormIpc.ts) against T-51-30 — every malformed payload (non-numeric appId, invalid userRoute, an acknowledgeReason outside `NOTICE_REASONS`) is rejected before any store write.
- `getSteamBottleEligibilityVerdict` now carries `bridgeRoute` on the same round trip when eligible, so the install dialog's wine section can render the route line without a second IPC call.
- `SteamBridgeRouteNotice.ts`/`.tsx` — the dialog store, pure content resolver (`resolveRouteNoticeContent`, `knownBadReasonKey`), and the 3-button dialog component — mounted in `App.tsx` beside `SteamBridgeSetup` and wired in `GlobalState.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: install() raises the route notice for bridge-specific bottled routes** - `348a33fbe` (feat)
2. **Task 2: Validated IPC for the route verdict and the persisted user route** - `378dad7e6` (feat)
3. **Task 3: In-app route-notice dialog** - `f68cbc625` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/backend/storeManagers/steam/games.ts` - install()'s new up-front route-notice gate
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - rewrote/added tests for the five Behavior rows
- `src/backend/storeManagers/steam/installFormIpc.ts` - bridgeRoute composition + handleSetSteamBridgeUserRoute validation core
- `src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts` - bridgeRoute composition + handleSetSteamBridgeUserRoute + channel-registration tests
- `src/backend/sidecar/steamAuthFlowRegistration.ts` - getSteamBridgeRoute/setSteamBridgeUserRoute handler registration
- `src/backend/sidecar/__tests__/steamAuthFlows.test.ts` - imports for the two new mocked exports (test additions live in installFormIpc.test.ts's channel-list gate)
- `src/preload/api/steam.ts` - getSteamBridgeRoute/setSteamBridgeUserRoute invokers + handleSteamBridgeRouteNotice listener slot
- `src/preload/__tests__/steamInstallFormApi.test.ts` - invoker round-trip tests for the two new exports
- `src/frontend/state/SteamBridgeRouteNotice.ts` - dialog store, signal handler, resolveRouteNoticeContent, knownBadReasonKey
- `src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts` - store/signal/pure-function tests
- `src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx` - the 3-button dialog
- `src/frontend/state/GlobalState.tsx` - registers the handleSteamBridgeRouteNotice listener
- `src/frontend/App.tsx` - mounts `<SteamBridgeRouteNotice />` beside `<SteamBridgeSetup />`
- `public/locales/en/gamelib.json` - two new catalog strings (`steam.bridge.routeNotice.notFound`, `.error`) added via `pnpm i18n`

## Decisions Made
- `getSteamBridgeRoute`'s handler body delegates directly to games.ts's existing `getBridgeRouteVerdict()` (already validated) rather than adding a redundant wrapper in installFormIpc.ts.
- The known-bad reason line in the dialog uses a dynamic i18n key (`steam.bridge.knownBad.${knownBadReasonKey(reason)}`) following the same pattern already shipped in `DiscountFilters/index.tsx` and `ExperimentalFeatures.tsx`; verified safe by running `pnpm i18n` and confirming zero warnings and an exact, expected 2-key diff to `gamelib.json`.
- `acknowledgeReason` is validated against `bridgeRoute.ts`'s exported `NOTICE_REASONS` set (not the full `SteamBridgeRouteReason` union) so a reason that can never have been shown as a notice (e.g. `'seed'`) cannot be recorded as acknowledged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two pre-existing games.test.ts specs asserted the OLD (pre-this-plan) behavior and had to be rewritten, not just extended**
- **Found during:** Task 1
- **Issue:** Two existing specs ("known-bad title ... install() takes the bottled path" and "isBridgeEligible() is false when knownBadReason is non-null ...") asserted that an unacknowledged known-bad route went straight to `tellBottledSteamToInstall`. That is exactly the silent-dispatch behavior D-51-08 requires this plan to close, so both specs would have asserted a now-incorrect contract if left unchanged.
- **Fix:** Rewrote the first spec to assert the notice fires and `deferredToSetup: true` is returned with no bottled dispatch; repurposed the second spec into the "already-acknowledged" bypass case (`noticeAcknowledgedFor: 'known-bad'` persisted → straight to the bottled branch, no notice), which is one of the plan's own Behavior rows.
- **Files modified:** src/backend/storeManagers/steam/__tests__/games.test.ts
- **Verification:** `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` — 300/300 pass.
- **Commit:** 348a33fbe

---

**Total deviations:** 1 auto-fixed (1 bug/stale-test correction).
**Impact:** Necessary — the plan's own Behavior rows explicitly supersede the pre-existing silent-dispatch contract those two specs encoded; leaving them unchanged would have left the suite asserting disproven behavior.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The composed route (including `bridgeRoute`) is now available over validated IPC for any later plan's install-dialog route line or game-page display.
- `SteamBridgeRouteNotice` is a standalone, directly-testable store/component pair any later plan can extend (e.g. additional notice reasons) without touching `SteamBridgeSetup`'s failure-recovery surface.
- No blockers.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*

## Self-Check: PASSED

All created files and all three task commit hashes verified present on disk / in git history.
