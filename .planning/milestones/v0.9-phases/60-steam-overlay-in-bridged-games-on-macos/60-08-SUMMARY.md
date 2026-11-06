---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 08
subsystem: steam-bridge-overlay
tags: [overlay, launch-path, cx_env, fail-open, games.ts]
requires: [60-03, 60-06, 60-07]
provides:
  - games.ts overlay routing for the TCP and DRM bridge launch routes
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "TCP overlay decision lives in a private prepareTcpOverlay that runs on every TCP launch, so any runner change ends the previous wineserver"
  - "hadDrmRunner now means previousRunner.kind === 'drm' (60-07 handoff); an overlay entry is handled inside prepareTcpOverlay"
  - "CX_ENV merge in buildDrmLaunchEnvironment now goes through appendCxEnvTokens (single merge + quote guard)"
metrics:
  completed: 2026-11-03
  tasks: 2
  files: 2
---

# Phase 60 Plan 08: Overlay wired into the bridge launch path

TCP-mode bridge launches on CrossOver now run on the overlay clone with the D-12 CX_ENV tokens by default; DRM-mode launches get the same tokens when the clone is re-signed. Every setup failure is a `[bridge-notice] ... reason=overlay-<step>` line plus a toast on every affected launch, and the game always launches.

## Commits
- d195c4ea1: feat(60-08): both tasks (the two tasks edit the same methods, so they landed as one commit)

## What changed
- `buildDrmLaunchEnvironment`: optional `overlayTokens`, merged with DRM tokens via `appendCxEnvTokens`; the inline `setKey('CX_ENV'` merge is gone.
- `resolveLaunchOverlay` (logs `overlay=<on|off> source=...`, never throws), `notifyOverlaySetupFailed` (log + `notify`, no dedupe, no dialog).
- `launchDrmModeGame`: resign notice when `wineloaderResigned !== true`, else `prepareOverlayTokens`; failure launches the clone without tokens.
- `launchBridgeGameBody`: `prepareTcpOverlay` after the not-applicable branch; fallback engine logs `overlay=skipped reason=fallback-engine (D-07)`; ends the previous runner's wineserver via `endPerGameBridgeBottleSessionWith` when the runner dir changes; registers via `setOverlayBridgeRunner`; re-reads bottle settings.
- `fireBridgeWineLaunch`: 4th `overlay` param; restores the overlay clone if a known fix swapped the runner, then appends tokens (env failure toasts and launches without tokens).
- No CrossOver version gate added (D-06); selectLaunchEngine / preflight untouched.

## Verification
- `pnpm exec jest src/backend/storeManagers/steam`: 116 suites pass (4363 tests); 21 new cases in two `Phase 60 overlay` describes.
- `pnpm codecheck` clean; prettier clean; eslint 0 errors on touched files.
- Not run: `pnpm lint` (known pre-existing gen_vtables error), `pnpm smoke:sidecar` (no sidecar rebuild; live macOS verification belongs to the phase UAT).

## Deviations from Plan
- Test harness: added file-level mocks of overlayPolicy (default overlay off, so pre-Phase-60 launch tests stay on stock CrossOver) and overlayLaunch, plus bottle/drmLaunchSetup mock additions; one existing test's `getDrmBridgeRunner` mock now returns `{kind:'drm'}`.
- [Rule 1] When the previous entry was an overlay runner and this launch falls back to stock CrossOver, settings are re-read from getBridgeBottleSettings so a stale clone wineVersion cannot ride along.
- Task 1 and Task 2 committed together (same methods).

## Known Stubs
None.

## Self-Check: PASSED
