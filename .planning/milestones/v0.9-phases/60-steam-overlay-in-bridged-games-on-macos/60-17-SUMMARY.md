---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 17
subsystem: steam-bridge-overlay
tags: [overlay, probe, gap-closure, G1, experiment]
requires: [60-12, 60-15]
provides:
  - "Probe signals: signal cb active=<0|1>, signal key shift+tab, image <name> order=<n>"
  - "Observe-only hooks: CGEventPost, CGSForceShowCursor, HideCursor, ShowCursor (c_hooks=10)"
  - "Opt-in release-on-open experiment behind GAMELIB_OVERLAY_RELEASE_EXPERIMENT (cb:release, cb:release+block, key:release)"
affects: [60-18]
key-files:
  modified:
    - native/steam-bridge/overlay-input/overlay_input_probe.m
    - meta/__tests__/overlayInputProbeSmoke.test.ts
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
decisions:
  - "ApplicationServices framework added to the probe argv (HideCursor/ShowCursor link from it; the others from CoreGraphics)"
  - "Experiment lines carry no caller= segment (emit_line accepts NULL caller) so they read `experiment open source=cb action=release`; real calls the experiment makes carry caller=experiment"
  - "Key observer installs as a WineApplication override (class_addMethod) when sendEvent: is inherited, so NSApplication is not patched"
metrics:
  tasks: 2
  completed: 2026-11-04
---

# Phase 60 Plan 17: Probe signal observers and release-on-open experiment Summary

The 60-11 probe now reports three independent overlay open/close candidates (60-15 cb notification, Shift+Tab in WineApplication sendEvent:, caller-attributed renderer imports) and can, when armed, release winemac's capture on open, defer its re-capture while open, and replay it once on close.

## Commits
- 8eb3a7c55 feat(60-17): both tasks in one commit (the two tasks edit the same hook functions in one .m file, so they were not separable)

## interpose-visibility: seen
A fake `gameoverlayrenderer.dylib` carrying its own `__interpose` tuple, dlopened after launch and calling CGAssociateMouseAndMouseCursorPosition, was logged by the probe with `caller=gameoverlayrenderer.dylib`. So the probe's interposes do apply to a later-loaded image that has its own interpose section; 60-18 should not read the absence of renderer lines in 60-12 as a structural blind spot on that account alone (the real renderer is loaded by a different path and `image ... order=` will show the load order live).

## Verification
- Meta smoke (11 cases incl. cb signal, plain renderer attribution, defer/replay once, driver call forwarded, release+block set_active 1/0 and `set_active absent`, no-wineapp inactive, invalid value, key:release open/close, neutrality when unset) and argv tests: 61 passed. A window server was present so the key and experiment cases actually ran.
- fakeHomeIsolation green; `pnpm build-steam-bridge` produces a universal probe (x86_64 arm64); prettier check clean; overlay-shim untouched.

## Deviations from Plan
- All four extra symbols linked, so no hook was dropped.
- Forwarded winemac unhide while open and real depth is 0 is not passed to NSCursor (would unbalance the hide count); the desired depth is still updated. Minor refinement of "forwarded".
- Meta tests run with --runTestsByPath (hardcodedStringGate pre-existing failure from 60-14 is out of scope).

## Known Stubs
None.

## Threat Flags
None beyond the plan's register.

## Self-Check: PASSED
