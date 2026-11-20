---
phase: 75-steam-local-file-formats-in-rust
plan: 14
subsystem: steam-local-files
tags: [typescript, config, discovery]
requires: [75-13]
provides:
  - steamRootDefault(userHome, env, platform) feeding getFactoryDefaults().defaultSteamPath
affects: [75-31]
key-files:
  modified:
    - src/backend/config.ts
  created:
    - src/backend/__tests__/config.steamRootDefault.test.ts
decisions:
  - Legacy logic renamed getSteamCompatFolderTs, kept as the ts-flag fallback until plan 31
  - No boot-time rustInvoke; the shell's GAMELIB_STEAM_ROOT_DEFAULT is read synchronously
metrics:
  tasks: 1
  completed: 2026-11-14
---

# Phase 75 Plan 14: config.ts Steam root default Summary

Under GAMELIB_STEAMFILES_TEXT=rust the factory default defaultSteamPath is the root the shell discovered (GAMELIB_STEAM_ROOT_DEFAULT), else a plain per-OS fallback matching Rust's; the ts flag keeps today's logic. User-set values still win since only the factory default changed.

## Commits
- test(75-14): failing tests for steamRootDefault
- feat(75-14): Rust-discovered Steam root as factory default behind text flag

## Deviations from Plan
None. Persisted-user-override is covered structurally (factory default only); no separate settings-level test was added.

## Deferred Issues (pre-existing)
- `pnpm backend-di-ceilings` fails on frontend jestMock baselines (unrelated; no new violations from this plan).

## Known Stubs
None.

## Self-Check: PASSED
