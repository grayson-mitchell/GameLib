---
phase: quick-261029-e2t
plan: 01
status: complete
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts
    - src/backend/storeManagers/steam/games.ts
metrics:
  completed: 2026-10-29
---

# Quick 261029-e2t: prefetch DRM-mode downloads at the end of a bridge install

Steps 2-5 of `drmLaunchSetup` (allowlist, component, runner clone, Valve client) moved into
`ensureDrmDownloads`, shared by the launch setup and a new `prefetchDrmDownloads`.
`installBridgeGameLeased` calls the prefetch after the shared redists, under the
`'drm-setup'` status (261029-d7v), for titles that resolve to steamclient-layer mode.

## Commits

- fe658e1d7 feat: `ensureDrmDownloads` extraction, `prefetchDrmDownloads`, install wiring, tests

## Verification

- `npx jest src/backend/storeManagers/steam`: 89 suites, 3404 pass (1 skipped).
- Four new tests: steps 2-5 only (no Steam check, register/clear runner, end session or
  stage); `'drm-setup'` progress contexts; not-applicable for a non-`.bind` title; first
  failure stops, never rejects, runner untouched, no `stage` key leaks.
- The seven existing "returned unchanged" tests (`toBe` identity) caught a first draft that
  spread the error; the helper now returns the step's own error object.
- `pnpm codecheck` clean; prettier clean on the three paths; eslint 0 errors.

## Deviations

- Planner and executor agents skipped; orchestrator wrote the plan and change inline.
- Design choice: no Mac Steam check at install time. The launch-time check exists so a user
  without Mac Steam downloads nothing for a launch that would fail; at install the user has
  chosen a DRM title, and the launch still checks.

## Not verified live

Needs a fresh bridge install of a SteamStub title with the DRM caches absent (or a CrossOver
update that invalidates them). Grim Dawn's caches are already warm, so a reinstall would only
show `drm prefetch: appId 219990 ready ... component=cache runner=cache valve=cache`.
