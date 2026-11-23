# Phase 94 deferred items

## From 94-05 (found, not fixed: outside that plan's files)

- `.planning/milestones/v0.8-phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py`
  (run by `pnpm planning-gates`) fails with `Axis A site src/backend/sidecar/loginSeamRegistration.ts:331 matched none of
  the mechanical tiers ... AND has no SITE_PROFILES entry`. 94-04 moved the login-window seam into that new file; the
  gate needs a `SITE_PROFILES` entry (or the gate's file list updated) for the relocated site. Owner: whichever 94 plan
  next touches the login seam (94-17, 94-29 or 94-30 per the 94-04 summary), or a quick task.
