---
phase: quick-261102-dkw
plan: 01
status: complete
subsystem: backend/steam-install, tauri-shell, settings
tags: [steam, d-uat-19, windows, openExternal]
commits: [1e6e50894, 89f257ede, 40a465f50]
---

# Quick 261102-dkw: D-UAT-19 summary

- **Client gate on the delegated hand-off** (`games.ts`, 1e6e50894): with native install OFF,
  `install()` now runs `ensureSteamClientReady` before `steam://install`. A missing or never-launched
  client opens the D-10/D-11 guided setup and the install defers (`deferredToSetup`), so nothing calls
  `openExternal`, no ACF poller starts and no finished entry is recorded. A reported error is an install error.
- **No shell stall** (`src-tauri/src/main.rs`, 89f257ede): the sidecar's `openExternal` frame is opened on
  a worker thread instead of inside the sidecar-stdout reader loop, so an OS dialog can no longer park
  invoke responses until the 60 s timeout.
- **Help text** (40a465f50): macOS keeps the Mac-version wording; Windows/Linux get
  `help.steam_native_install_other`.

## Deviations

- The SNI-07 "opt-in OFF" test asserted `ensureSteamClientReady` is never called on the OFF path. That
  is the behaviour this fix changes, so it now asserts the call (and still that no depot target resolves).
- Test files got a ready-client default for the `ensureSteamClientReady` mock (games.test.ts: top-level
  `beforeEach`; macArchKnownFixRouting.test.ts: its existing top-level `beforeEach`).

## Not done

- A failed `openExternal` while a client is present is still not reported to the sidecar (the frame is
  fire-and-forget). With the client gate, this only happens when the `steam://` registration is broken.

## Verification

- games/library/macArchKnownFixRouting suites: 5 new D-UAT-19 cases pass; 19 failures, identical to HEAD
  (pre-existing Windows path-separator assertions).
- hardcodedStringGate 176/176; `tsc --noEmit` clean; `cargo check` clean; prettier clean on all touched TS/JSON.
- Live gate pending (Windows): native install OFF, empty Default Steam path, Install → D-10 consent
  dialog, no OS error, no invoke timeout, game not left "installing".
