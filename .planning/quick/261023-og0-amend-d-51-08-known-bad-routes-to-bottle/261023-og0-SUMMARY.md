---
phase: quick-261023-og0
plan: 01
subsystem: steam-bridge-routing
tags: [steam, bridge, routing, d-51-08, i18n]
requirements: [D-51-08]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
    - src/backend/storeManagers/steam/bridge/allowlist.ts
    - meta/bridgeCensus.ts
    - src/backend/storeManagers/steam/games.ts
    - src/common/types/ipc.ts
    - src/frontend/state/SteamBridgeRouteNotice.ts
    - src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-CONTEXT.md
decisions:
  - Only drm-wrapped known-bad routes to bottled Steam; does-not-run, win64-only and p2p-required stay on the bridge behind a one-time informational notice.
metrics:
  completed: 2026-10-23
  tasks: 3
---

# Quick 261023-og0: Amend D-51-08 so only DRM-wrapped known-bad routes to bottle

Hoard (63000) and ELEX (411300) now resolve to the bridge route with `noticeRequired` and an informational "Install anyway" / Cancel dialog; XCOM (200510, drm-wrapped) still routes to bottled Steam.

## Commits
- 46d1618de: resolver row 4 DRM-only, knownBadReason carried through rows 5-11, docs and tests
- 4132d5e30: install() fires the notice for bridge routes, IPC payload gains `route` and `userRoute`, games.test updated
- 6ab44d3c9: informational dialog variant, i18n keys, presence baseline, 51-CONTEXT.md amendment

## Behavior
- Later bottle rows (scan-miss, win64-no-shim) win for non-DRM known-bad titles; the single dialog also names the known-bad reason.
- userRoute 'bottle' beats everything; userRoute 'bridge' suppresses the notice; acknowledgement for 'known-bad' clears it.
- Census still classifies these titles as known-bad (logic unchanged, comment reworded). `bridge-allowlist.json` untouched.

## Deviations
- **[Rule 3 - Blocking] i18n presence baseline regenerated.** The three new gamelib keys (bridgeExplainer, installAnyway, titleBridge) made `lint-translations:gamelib` report 144 hard failures. Regenerated `meta/i18nCatalogPresenceBaseline.json` with `LINT_TRANSLATIONS_WRITE_BASELINE=1` (precedent: 5b42b643e); the diff only adds the 3 keys x 48 locales. Result: 0 hard failures.
- games.test.ts mocks of the out-of-taxonomy `'incompatible'` were changed to `'drm-wrapped'`, as the plan directed.

## Verification
- jest: bridge dir, bridgeCensus, lintTranslations, games.test, SteamBridgeRouteNotice (660 tests green); permanentlyMountedPolls green.
- `pnpm codecheck`, `pnpm lint-translations:gamelib` (0 hard failures), `pnpm i18n-churn-guard` clean. Scoped prettier checks passed on all code files.

## Self-Check: PASSED
