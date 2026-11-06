---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 01
subsystem: steam-bridge
tags: [overlay, macos, vendoring, gpl, build]
requires: []
provides:
  - vendored NotProton overlay_shim.m (hash-pinned)
  - pnpm build-steam-bridge builds universal overlay_shim.dylib
  - builtOverlayShimPath runtime constant
affects: [60-02]
tech-stack:
  added: []
  patterns: [vendored source with pin test, fake-HOME spawn for build tools]
key-files:
  created:
    - native/steam-bridge/overlay-shim/overlay_shim.m
    - native/steam-bridge/overlay-shim/LICENSE
    - native/steam-bridge/overlay-shim/NOTICE
    - native/steam-bridge/overlay-shim/PINS.md
    - meta/__tests__/overlayShimVendor.test.ts
  modified:
    - THIRD-PARTY-NOTICES.md
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - src/backend/constants/paths.ts
    - public/bin/.gitignore
key-decisions:
  - "D-13: inject everywhere, no GPU/macOS gate; interpose() no-ops on missing class, asserted statically"
  - "D-14: vendor source and build from it; no prebuilt binary"
  - "Deployment floor 11.0 (no minimumSystemVersion in src-tauri configs)"
requirements-completed: [D-13, D-14]
duration: 25min
completed: 2026-11-02
---

# Phase 60 Plan 01: Vendored overlay shim and universal build Summary

NotProton's GPLv3 overlay_shim.m is vendored byte-identical at commit 0c798e7 (hash-pin test) and compiled by `pnpm build-steam-bridge` into an ad-hoc-signed arm64+x86_64 dylib at public/bin/<arch>/darwin/overlay_shim.dylib.

## Tasks
1. Vendor source, LICENSE, NOTICE, PINS.md, THIRD-PARTY-NOTICES entry, 6-assertion vendor test - f6f189379
2. compileOverlayShim (clang per slice, lipo, codesign, lipo -info check, fake-HOME env), builtOverlayShimPath, gitignore - 1b476b39d

## Deviations from Plan

- compileOverlayShim is placed after `main()` rather than before it, because the existing B5b test slices compileShim64's body up to `\nexport async function main` and forbids try/catch there; the function is hoisted so main() calls it normally.
- Updated the existing main-call-order assertion in buildSteamBridgeShims.test.ts to include compileOverlayShim.
- Task 1 test was written alongside the vendored file (no separate observed RED commit).
- `pnpm exec jest --selectProjects Meta <path>` ran the whole Meta project in this environment (5 suites / 6 tests failed, e.g. hardcodedStringGate, pre-existing and unrelated to touched files; public/locales/en/translation.json has uncommitted changes). Targeted runs used `--runTestsByPath`. `prettier --file-info` was run per-file group since it rejects multiple files.

## Verification
- Vendor test 6/6, buildSteamBridgeShims test 50/50, fakeHomeIsolation 7/7, `pnpm codecheck` clean, prettier clean.
- `pnpm build-steam-bridge`: lipo reports x86_64 arm64, codesign -dv OK, git check-ignore confirms ignored.
- `pnpm lint` not run.

## Known Stubs
None.

## Self-Check: PASSED
