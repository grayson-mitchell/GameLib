---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 11
subsystem: steam-overlay
tags: [overlay, diagnostics, macos, g1, interposer]
requires: []
provides:
  - overlay_input_probe.dylib (universal, ad hoc signed) built by build-steam-bridge
  - overlayInputProbeFromEnv and optional probe in overlay env values
affects: [60-12]
tech-stack:
  added: []
  patterns: [dyld __interpose tuples plus ObjC swizzles, dev-only env flag]
key-files:
  created:
    - native/steam-bridge/overlay-input/overlay_input_probe.m
    - meta/__tests__/overlayInputProbeSmoke.test.ts
  modified:
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - public/bin/.gitignore
    - src/backend/constants/paths.ts
    - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "Probe is appended last in DYLD_INSERT_LIBRARIES so the shim stays first (D-12); flag unset leaves output byte-identical"
  - "overlayProbeArg() in games.ts is synchronous (lstatSync/mkdirSync, already imported) rather than async; no new handles in the sidecar"
requirements-completed: [G1, D-15, D-12]
duration: 40min
completed: 2026-11-04
---

# Phase 60 Plan 11: Overlay input probe for G1 Summary

A GameLib-owned, behaviour-neutral interposer dylib that logs which image calls which cursor and input API, wired into all three overlay launch routes behind `GAMELIB_OVERLAY_INPUT_PROBE=1`.

## Tasks

1. Probe dylib, build, smoke test: commit 494a566e3. Hooks CGAssociateMouseAndMouseCursorPosition, CGWarpMouseCursorPosition (rate-limited), CGDisplayHide/ShowCursor, CGEventTapCreate/Enable, +[NSCursor hide/unhide], -[NSWindow setMouseConfinementRect:], plus a bounded (2 s x 60) sendEvent: owner sampler and a `set_active-symbol` check. Log opened O_NOFOLLOW, 0600, 4 MiB cap. The smoke test passes on this Mac; the NSCursor call assertion is guarded by a CGSessionCopyCurrentDictionary check.
2. Launch wiring: commit a4f4696e2. `overlayInputProbeFromEnv` (flag must be exactly `1`), probe appended last in DYLD plus a single-quoted `GAMELIB_OVERLAY_PROBE_LOG` token / plain env var, unsafe probe silently dropped, passed at the DRM, TCP-clone and fallback-engine call sites. A missing dylib logs a warning only.

## Verification

- Meta jest (buildSteamBridgeShims, overlayInputProbeSmoke, findDeadcode), fakeHomeIsolation, overlay dir jest, full games.test.ts (648): all pass. `pnpm codecheck` clean. Prettier check clean on all prettier-visible files. `lipo -info` shows x86_64 and arm64; dylib is gitignored; vendored overlay-shim untouched.
- Note: the build-steam-bridge main-order test was updated to expect `compileOverlayInputProbe` after `compileOverlayShim`.

## Deviations from Plan

None to behaviour. Minor: `builtOverlayInputProbePath` carries a `// ts-prune-ignore-next` comment? No - it is consumed by games.ts, so dead-code check passes without it (the comment I briefly added noting this is only prose). The games.test.ts `backend/constants/paths` mock gained a tmp `builtOverlayInputProbePath` so tests do not depend on a built dylib.

## Deferred Issues

`pnpm lint` exits 1 on the repo-wide warning ceiling (661 vs 1130 found). Per-file warning counts for games.ts, games.test.ts and overlayLaunch.test.ts are identical to HEAD before this plan, so it is pre-existing and out of scope.

## Self-Check: PASSED

Both commits exist (494a566e3, a4f4696e2); created files present.
