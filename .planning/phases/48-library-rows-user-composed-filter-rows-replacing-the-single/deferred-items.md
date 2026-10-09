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

## Found by 48-13 (2026-10-09)

- **`pageScrollDelta` / `canScrollForward` take one click too many in a floor-clientWidth model at single-column widths.**
  status: open
  With `scrollWidth` rounded and `clientWidth` floored, the residual travel at the end can be 1.28px, above
  `SUBPIXEL_EPSILON` (1), so the control stays enabled for one extra click that scrolls about 1px. First failing
  triples: n=14 content 161.92 (14 clicks, want 13); n=20 content 164.88 (20, want 19). The rounded model passes
  for both n over content 156 to 1600. Real engines round `clientWidth`, and Chromium 153 shows no such click in
  the 108 harness variants, so this is not G-48-11b and cannot produce blank travel. Draft walk kept at
  `evidence/48-13/arithmetic-walk-draft.test.ts.txt`. Decide whether the epsilon should absorb 1.5px.
