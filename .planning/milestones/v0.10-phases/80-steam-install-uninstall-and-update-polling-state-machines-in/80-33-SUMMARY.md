---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 33
subsystem: steam-polls
tags: [steam, rust, uat, ci]
requires: [80-32]
provides: [post-deletion live smoke, post-deletion CI legs]
affects: [phase-80-verification]
key-files:
  created: []
  modified:
    - .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-HUMAN-UAT.md
completed: 2026-11-16
---

# Phase 80 Plan 33: Post-deletion smoke and CI legs

With the TS Steam poll loops and the polls flag deleted, the app still installs, uninstalls and launches Steam games, and the three rust-test.yml legs are green.

## Commits

- c04cf07c9: Post-deletion smoke section (items 7-9) with local suite results
- docs(80-33): results for items 7-9, CI legs, this summary

## Results

- Local (task 1): `pnpm build:sidecar` (sidecar.js 2026-11-16 20:24); `cargo test --workspace` green; `cargo test --bin gamelib-shell` 466 passed; `pnpm test:ci` known-red only plus a dxvkInstallRemove timing flake (passes 3/3 in isolation, untouched by phase 80).
- Live (operator, `pnpm tauri:dev`): 7 install pass, 8 uninstall pass, 9 launch (one Playing, one Done) pass.
- CI on eb1e2d37e (pushed at the operator's direction with --no-verify; 31 commits incl. other-session work): rust-test.yml run 43825957344 green on macos/ubuntu/windows. Jest CI run 43825957425 red on the known-red suites plus `steamLaunchRuntime.test.ts`.

## Deviations from Plan

- `steamLaunchRuntime.test.ts` (bottled-Steam raise loop) fails on the Linux Jest CI runner. It is not on the 80-HANDOFF known-red list, but it has failed on every Test run since fba351fbe (2026-11-12, phase 66.4 era), before phase 80, and passes 9/9 on macOS. The test file was last changed in 66.4-06. Recorded, not chased: not a phase-80 regression.
- Tasks 2-3 were run by the orchestrator after the executor returned at the checkpoint.
