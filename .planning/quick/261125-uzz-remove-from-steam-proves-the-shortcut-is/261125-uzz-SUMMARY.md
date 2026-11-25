---
phase: quick-261125-uzz
plan: 01
subsystem: shortcuts
tags: [steam, shortcuts-vdf, rust, goldens, remove-from-steam]
requires: []
provides:
  - "Remove from Steam proves an entry is GameLib's (LaunchOptions carry gamelib://launch?appName= with this game's appName, raw or percent-encoded) before removing it"
  - "ShortcutsOp::Remove optional launchOptions: gamelib-steamfiles removes only an entry whose AppName and LaunchOptions both match, on its locked re-read"
  - "golden/steam/deltas.json: 9 recorded removal deltas, each replayed refused then proven"
affects: [gamelib-shortcuts, gamelib-steamfiles, src-tauri shortcuts_dispatch]
tech-stack:
  added: []
  patterns: ["recorded golden deltas in an object keyed by case id (as golden/remove/deltas.json)", "refused arm and proven arm per delta case"]
key-files:
  created:
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/deltas.json
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs
    - src-tauri/crates/gamelib-steamfiles/tests/shortcuts.rs
    - src-tauri/crates/gamelib-shortcuts/src/ctx.rs
    - src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs
    - src-tauri/src/shortcuts_dispatch.rs
    - .planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md
decisions:
  - "The proof reads the appName only, not the runner; a pre-rebrand heroic:// entry is refused"
  - "The op still answers null: a refusal is a log note plus the existing corrupt notice, so the IPC contract and renderer are unchanged"
  - "The Rust mirror's launch_options is required (String), so the crate cannot express a title-only removal"
metrics:
  duration: "about 40 minutes"
  completed: 2026-11-25
status: complete
commits: 2
plan_head_before: ce0c8398167b739e7922587d11a73541eaaaf825
plan_head_after: f0709db9d
actuals:
  tokens: 30000
  tasks: 3
  commits: 2
---

# Phase quick-261125-uzz Plan 01: Remove from Steam proves the shortcut is GameLib's Summary

Remove from Steam now deletes a `shortcuts.vdf` entry, and its five grid files, only when the entry's LaunchOptions carry GameLib's launch URL for this game's appName; a same-titled entry it cannot prove stays put and the user sees the "could not be removed" notice.

## What changed

- **gamelib-steamfiles** (`src/shortcuts.rs`): `ShortcutsOp::Remove` takes an optional `launchOptions` (`launch_options_of` beside `app_name_of`). With it, the first entry whose AppName and LaunchOptions both match exactly goes, matched again on the locked re-read. Without it (the shape `tests/golden.rs` and the TS type send) behaviour is unchanged.
- **gamelib-shortcuts** (`src/ctx.rs`, `src/steam/mod.rs`): the mirror's `Remove` carries a required `launchOptions`. `proves_app_name` accepts the raw URL `entry::launch_options` writes (whatever bytes the name holds) and the percent-encoded URL `launch_url(.., true)` writes (invalid UTF-8 after decoding is a refusal). `proven_entry` picks the first same-titled entry that proves the appName. `steam_remove` refuses the rest with a log note (no LaunchOptions text, Exe or user folder) and routes a refusal to the corrupt notice, never the success one.
- **Goldens** (`tests/golden_steam.rs`, `tests/fixtures/golden/steam/deltas.json`): the 9 removal goldens whose upstream entry carries no GameLib URL replay refused as seeded (no apply, grid art stays, corrupt notice taken from `remove-apply-throws.json`) and again proven (the TS's recorded answer, each apply gaining `launchOptions`). The delta set is checked both ways independently of the code under test. No golden JSON and no MANIFEST.json was edited.

## Commits

- `efba5cd01` fix(quick-261125-uzz): Remove from Steam removes only the shortcut GameLib proves it wrote (the seven code and fixture paths, Tasks 1 and 2 together so no commit has a red golden suite)
- `f0709db9d` docs(quick-261125-uzz): close the Remove from Steam proof todo (Task 3)

## Verification (measured)

- `cargo test -p gamelib-steamfiles`: 156 passed (baseline 153; 3 new).
- `cargo test -p gamelib-shortcuts --lib steam::`: 21 passed (baseline 17).
- `cargo test -p gamelib-shortcuts`: 196 passed (baseline 191). `golden_steam`: 16 passed, printing `steam remove: 14 replayed, 9 against a recorded delta (refused, then proven)`.
- `cargo test -p gamelib-shell shortcuts_dispatch::tests`: 21 passed, including `add_to_steam_writes_and_remove_takes_out_a_real_shortcuts_file` unchanged. The shell built at the time; no gamelib-info breakage was hit.
- `cargo +1.99.1 clippy -p gamelib-shortcuts -p gamelib-steamfiles --all-targets`: 0 warnings. `cargo fmt --check` and `rustfmt --check shortcuts_dispatch.rs`: clean. No prettier check carried (every written path is `.rs`, a prettier-ignored fixture tree, or under `.planning/`).
- `deltas.json`: 9 sorted `remove-` keys; `git diff HEAD` over `golden/steam` was clean before the commit. `pnpm planning-gates`: 12/12.
- The commit holds exactly the 7 planned paths. Verified by tests, not by a live Steam client.

## Deviations from Plan

None in behaviour. One process note: Task 1's RED step was not run as a separate failing build; the steamfiles tests, proof unit tests and implementation were written together and the suites were then run green. The plan's `git add` for the todo move needed the completed side re-added after the appended Resolution, which is why that commit was made from the index (it held only the two sides of the move).

## Known Stubs

None.

## Threat Flags

None. The change narrows what Remove from Steam deletes and adds no endpoint, auth path or trust boundary.

## Follow-ups not done

- `steam_is_added` and the add's duplicate check still match by title alone. A user's own same-titled shortcut still reads as "in Steam", and the game page's Show in Steam switch (which sets itself off after any remove, `useSteamShortcut.ts`) comes back on at the next mount after a refused remove.
- A pre-rebrand `heroic://launch` entry is refused, not removed.
- The sibling encoding todo (`2026-11-24-steam-shortcut-launch-options-carry-the-app-name-and-runner-unencoded.md`) is untouched; the proof already accepts the encoded form it will write.

## Self-Check: PASSED

- FOUND: `deltas.json`, the completed todo with its Resolution, and the SUMMARY.
- FOUND: `efba5cd01` and `f0709db9d`, both ancestors of HEAD.
