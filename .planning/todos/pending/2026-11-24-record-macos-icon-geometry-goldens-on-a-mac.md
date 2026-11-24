---
created: 2026-11-24T00:00:00.000Z
title: 'Record the macOS icon_geometry goldens (94-07 task 3) on a Mac; they need /usr/bin/sips'
area: shortcuts
severity: medium
platform: macos
ready: blocked
found_by: 'Phase 94 plan 94-07, run on a Windows host: the darwin-only icon geometry oracle is written and skipped, so its goldens do not exist yet.'
files:
  - src/backend/shortcuts/__tests__/oracle/removeIcons.oracle.test.ts
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/icon_geometry
  - src/backend/__tests__/shortcutsFixtureRedaction.test.ts
  - src-tauri/crates/gamelib-shortcuts/tests/icns.rs
---

## Problem

94-07 Task 3 requires four `icon_geometry` goldens (D-25): the shipped `sips` centred crop recorded for a tall (600x900),
wide (900x400), square (512x512) and small (100x300) input, which the Rust `.icns` writer replays on every OS. The oracle's
`icon_geometry` describe is darwin-only and was skipped on the Windows host that ran the plan, so
`golden/icon_geometry/` (four case files and a `MANIFEST.json`) is not committed. Nothing was typed by hand to stand in
for it.

## Do this on a Mac

1. `GAMELIB_WRITE_SHORTCUTS_GOLDEN=1 pnpm exec jest --runTestsByPath src/backend/shortcuts/__tests__/oracle/removeIcons.oracle.test.ts`
2. Compare run: the same command without the variable, plus `src/backend/__tests__/shortcutsFixtureRedaction.test.ts`.
3. Check the 600x900 case: its centre sample (`x` mid, `y` mid) is the middle band's colour (green), and its top sample
   is red or green depending on where the crop starts (the measured crop is centred). If the PNG decoder rejects sips' output
   (`unsupported PNG ...`) extend `decodePng` in the test; its self-tests run on every host.
4. Commit `golden/icon_geometry/` and raise `FILE_FLOOR` in `shortcutsFixtureRedaction.test.ts` from 620 to 625.
5. Un-ignore and run the 94-14 replay: remove the `#[ignore = "pending: 94-07 ..."]` line on
   `icon_geometry_goldens_replay` in `src-tauri/crates/gamelib-shortcuts/tests/icns.rs`, then
   `cd src-tauri && cargo test -p gamelib-shortcuts --test icns`. (Until you do,
   `icon_geometry_goldens_are_replayed_once_recorded` fails as soon as `golden/icon_geometry/` exists, naming this step.)
   The replay compares the Rust port's `.icns` PNG with the recorded size and every sample colour exactly; sips and the
   Rust Lanczos resampler are expected to agree on flat bands (unverified until recorded); if a sample falls within a few pixels of a band edge and differs,
   decide between moving the sample point in the oracle and a tolerance there. Never edit a recorded golden by hand.
6. Tick 94-07 and 94-14 complete in `.planning/ROADMAP.md` (94-14 is annotated "(icon_geometry pending Mac goldens)"
   until then) and drop `status: partial` from `94-07-SUMMARY.md` and `94-14-SUMMARY.md`.
