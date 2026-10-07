# Phase 48 deferred items

Out-of-scope discoveries logged by executors. Not fixed by the plan that found them.

## Found by 48-07 (2026-10-07)

- **`src/frontend/screens/Login/__tests__/overlayDismiss.test.ts`, red in isolation.** The source gate
  "SteamLogin and HumbleLogin each receive a dismiss bound to their own overlayMountKey, never the bare
  dismissLoginOverlay" fails because `src/frontend/screens/Login/index.tsx:310` renders
  `dismiss={dismissLoginOverlay}`. Last touched by `79de35f76` / `f4dd412c7` (quick task 261003-u48), which
  predates the 48-07 dispatch base `752b510f8`. 48-07 touches nothing under `src/frontend/screens/Login`
  (`git diff 752b510f8 HEAD --name-only` confirms). It reproduces alone, so it is not one of the known
  parallel-load flakes (`fakeHomeIsolation`, `appShellFlows`). Needs its own todo or quick task: decide whether
  the 261003-u48 wiring or the gate is stale.
