---
phase: 75-steam-local-file-formats-in-rust
plan: 05
subsystem: steam-local-files
tags: [rust, discovery, windows-registry]
requires: [75-01]
provides:
  - discover_steam_root(os, probe), Probe trait, RealProbe, discover_default, HostOs, Discovery
affects: [75-11, 75-12, 75-14]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/discover.rs
    - src-tauri/crates/gamelib-steamfiles/tests/discover.rs
decisions:
  - Linux candidate qualifies by steamapps/libraryfolders.vdf (intended D-14 behaviour change; for 75-PARITY.md)
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 05: Steam root discovery Summary

Pure `discover_steam_root` over an injected `Probe` for Windows (registry then PROGRAMFILES(X86)), macOS and Linux (Flatpak with install check, ~/.steam/steam, ~/.local/share/Steam, Snap, fallback), plus `RealProbe` with a `RegGetValueW` read (size query then read, capped at 32 768 u16) on Windows.

## Commits
- c6a2cddf0: test(75-05) failing decision tests
- feat(75-05) decision logic and RealProbe skeleton
- feat(75-05) Windows registry read

## Deviations from Plan
- The `real_probe_smoke` test was written in the RED commit with the other tests rather than in task 2.
- Task 1's feat commit carried a RealProbe with a stub Windows registry read; task 2 filled it.

## Verification
14 tests, clippy -D warnings and fmt --check pass on macOS. The Windows FFI body is not compiled locally; the Windows CI leg (plan 25) proves it.

## Known Stubs
None.

## Self-Check: PASSED
