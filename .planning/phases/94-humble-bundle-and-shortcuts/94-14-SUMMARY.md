---
phase: 94-humble-bundle-and-shortcuts
plan: 14
subsystem: backend
tags: [rust, shortcuts, macos-app, icns, desktop-entry, golden, creation-proof, d-13, d-14, d-22, d-25]
status: partial

pending:
  - "icon_geometry golden comparison: golden/icon_geometry/ (94-07) is not recorded (needs a Mac with /usr/bin/sips); tests/icns.rs `icon_geometry_goldens_replay` is #[ignore]d with that reason. Todo: 2026-11-24-record-macos-icon-geometry-goldens-on-a-mac. After recording: un-ignore it and tick 94-07 and 94-14."

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-05 text goldens (132) and the harness; 94-07 add-side clear deltas (remove/deltas.json); 94-11 gamelib-shortcuts paths (shortcut_files, sanitize) and FakeHome replay pattern
provides:
  - gamelib_shortcuts::{launch_url, mac, proof, icns, linux} with encode_uri_component, launch_url, write_mac_app, link_desktop, is_gamelib_bundle, is_gamelib_desktop_link, png_to_icns, write_desktop_file, MacAppWritten, DesktopRefused
  - tests/golden_text.rs (all 132 text goldens, the four add-side clear deltas, the Windows lnk URL pin)
  - tests/icns.rs (13 passing synthetic and structure tests, plus the ignored icon_geometry replay and a guard)
affects: [94-18, 94-22]

requirements-completed: []

actuals:
  tokens: 22000
  tasks: 3
  commits: 3

plan_head_before: f0ffebc7ea58fd2acbdb1b0606de15f60e3a144e
plan_head_after: 85a49b8f8f59b26d944736d2602d17e73d096b29

tech-stack:
  added: []
  patterns:
    - "an expected tree is the golden's own entries (bytes, link targets, modes) compared over the whole profile; an addclear delta case is derived as before-entries plus the golden's non-Desktop after-entries, never typed"
    - "a pending golden is an #[ignore] with its reason plus a guard test that fails once the goldens exist while the replay is still ignored (the guard reads its own source for the marker)"
    - "synthetic icon geometry is checked against the band the documented centred crop names for each sample, skipping samples within 6 px of an edge"

key-files:
  created:
    - src-tauri/crates/gamelib-shortcuts/src/launch_url.rs
    - src-tauri/crates/gamelib-shortcuts/src/mac.rs
    - src-tauri/crates/gamelib-shortcuts/src/proof.rs
    - src-tauri/crates/gamelib-shortcuts/src/icns.rs
    - src-tauri/crates/gamelib-shortcuts/src/linux.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_text.rs
    - src-tauri/crates/gamelib-shortcuts/tests/icns.rs
  modified:
    - src-tauri/crates/gamelib-shortcuts/src/lib.rs
    - .planning/todos/pending/2026-11-24-record-macos-icon-geometry-goldens-on-a-mac.md

key-decisions:
  - "User decision: run 94-14 although the 94-07 icon_geometry goldens do not exist (they need a Mac). The icns writer follows the plan's documented sips behaviour; the golden comparison is an explicit #[ignore] (not a vacuous pass), no geometry value was typed by hand, and everything else in the .icns check runs now on synthetic inputs."
  - "The quoting defect 94-05 found is REPRODUCED, not fixed: run.sh keeps encodeURIComponent (an apostrophe in an app name closes the single quotes) and the Linux Exec= stays unencoded. The plan says byte-identical to the goldens; the fix is the todo 2026-11-24-macos-shortcut-run-sh-breaks-on-single-quote-in-app-name."
  - "The Desktop clear is a std::fs delete guarded by proof.rs, not gamelib-safety remove_tree: that API is built for game installs (trust roots, known installs) and is not a fit for a single link or a bundle GameLib itself proved it wrote."
  - "link_desktop also refuses (OutsideProfile) any Desktop or bundle path not inside paths.user_home, so the `paths` argument carries a safety rule and not just a signature."
  - "An image shorter than 512 after the resize is not padded: crop_imm clamps to the image (512 x ~228 for 900x400). That is what sips -c is believed to do; the recorded golden will confirm or correct it."

patterns-established:
  - "write ops mirror the TS arm: Rust parent folders are created only where the TS created them (macOS bundle and Desktop folder), never for the Linux Desktop or applications folder"

requirements: [SVC-05]
duration: 100min
completed: 2026-11-24
---

# Phase 94 Plan 14: macOS .app, icns and Linux .desktop writers Summary

**The macOS `.app` (run.sh, Info.plist, centred-crop icns, proof-guarded Desktop symlink) and the Linux `.desktop` writer run in Rust and replay all 132 recorded text goldens byte for byte; the icns `icon_geometry` golden comparison is pending its Mac recording.**

## What was built

- **Task 1 (tracer).** `launch_url.rs` (`encodeURIComponent` over UTF-8 and UTF-16 with the JS unreserved set, `launch_url(.., encode)`), `mac.rs` (`write_mac_app`: Info.plist and run.sh templates as escaped consts, run.sh mode 755 set outright; `link_desktop`), `proof.rs` (`is_gamelib_bundle`: real dirs all the way down, a regular `run.sh` with the marker line and `gamelib://launch`, a plist naming `run.sh`; `is_gamelib_desktop_link`: a symlink whose target is exactly the Applications bundle path, dangling or not). `golden_text.rs` replays the 48 iconless darwin cases and the seven `remove/addclear-*` cases: three proven items (nothing, a legacy GameLib bundle, a stale GameLib link) are cleared and linked; the four recorded deltas (file, real folder, link elsewhere, dangling link elsewhere) are left in place and reported `Unproven`. The `$(touch pwned)` run.sh is byte-identical (seven cases replayed).
- **Task 2.** `icns.rs`: decode PNG or JPEG by content (bounded: 32 MiB file, 16384 px side, 256 MiB alloc, resized height at most 16384), resize to width 512 keeping aspect (Lanczos3, skipped when already 512), centred 512x512 `crop_imm`, PNG encode, one raw `ic11` element through `IconElement::new` into `IconFamily::write`. Nothing is written unless the whole conversion succeeded. `write_mac_app` writes the iconless bundle when the icon is absent or fails, and the 18 with-icon darwin cases replay (the `.icns` is checked as a one-element icns, not byte-compared).
- **Task 3.** `linux.rs`: `desktop_entry` and `write_desktop_file` (template byte for byte, raw `Exec=` URL, optional `Icon=`, the Desktop copy created with 0o777 under the umask like Node's `mode`). All 66 linux cases replay.

## Evidence

- `golden_text` prints: darwin icon=false 48, darwin icon=true 18, linux icon=false 48, linux icon=true 18 (= the 132 in the text MANIFEST, partition test asserts it), add-side clear 4 refused + 3 cleared, hostile subshell 7, Windows lnk encoded-URL pin (at least 20 `windows/lnk-*` goldens, the encoder equals the TS-built URL in every one).
- Mutation check: letting `link_desktop` clear any item makes `an_unproven_desktop_item_is_left_and_reported_refused` fail.
- `tests/icns.rs`: 13 passed, 1 ignored. Tall, wide, small and a JPEG are checked against the band the centred geometry names for each sample (exact colour); a 512 square passes through pixel for pixel; garbage, truncated, GIF and signature-only inputs are errors that write nothing; a 1x3000 sliver is refused; the container is `icns`, one `ic11` element, declared length equal to the file length.
- `cargo test -p gamelib-shortcuts`: 50 lib + 4 golden_paths + 8 golden_text + 13 icns (1 ignored). `cargo clippy -p gamelib-shortcuts --all-targets -- -D warnings` and `cargo fmt -p gamelib-shortcuts --check` clean. `grep -c 'b"ic11"' src/icns.rs` is 1.

## Pending (why status is partial)

- **`icon_geometry` goldens.** `tests/fixtures/golden/icon_geometry/` does not exist (94-07 needs `/usr/bin/sips`). `tests/icns.rs::icon_geometry_goldens_replay` is `#[ignore = "pending: 94-07 macOS icon_geometry goldens (todo 2026-11-24-record-macos-icon-geometry-goldens-on-a-mac)"]`. `icon_geometry_goldens_are_replayed_once_recorded` is not ignored: it prints a loud PENDING line while the directory is absent, fails if the directory exists with fewer than 4 cases, and fails if the directory exists while the replay is still ignored. `the_replay_itself_discriminates` runs the replay machinery now against a golden built from the port's own output, with an altered sample and a `threw` case. The todo now says: after recording, un-ignore and run the replay, then tick 94-07 and 94-14 and drop both `status: partial`.
- Unverified until recorded: that `sips` and the Lanczos3 resampler agree at the golden sample points, and what `sips -c` does for a 900x400 input (clamped here).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The icon_geometry golden comparison cannot run** (see Pending). Decided by the user; no value was hand-typed.

**2. [Rule 2 - Missing critical] `link_desktop` refuses paths outside `paths.user_home`** (`DesktopRefused::OutsideProfile`), so the `paths` argument is a real containment rule on a delete-then-link.

**3. [Rule 2 - Missing critical] Bounded icon decode** (T-94-26): file size, decoded dimensions, allocation and resized height limits; the plan only named the feature set.

### Choices where the plan was silent or wrong

- The 94-05 quoting defect is reproduced (see key-decisions); recorded here and in the module docs of `mac.rs` and `linux.rs`.
- The Linux writer does not create the Desktop or applications folder (the TS does not; its oracle pre-creates them). The macOS writer creates the bundle folders and the Desktop folder, as the TS does.
- A Windows host without the symlink privilege compares everything but the link; on CI that is a panic. This host created symlinks, so nothing was skipped (the output prints "0 without the Desktop symlink").

## Not verified locally

- This is a Windows host. The Unix-only paths (the `run.sh` mode check, the Linux Desktop 0o777 umask-adjusted check, `std::os::unix` symlinks, `OpenOptionsExt::mode`) were reviewed but not compiled or run here; ubuntu CI runs them. No unix target is installed and WSL is absent.
- The committed Rust files carry CRLF in their blobs, as the existing crate files do on this checkout.

## Windows-only failures

None introduced. Gates not re-run because no TypeScript or gated source changed: `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode`, `testContainment`, the port-complete gates. `pnpm planning-gates` is run after the planning edits (see below). Neither `GAMELIB_HUMBLE` nor `GAMELIB_SHORTCUTS` appears in the crate.

## Known Stubs

None.

## Threat Flags

None. T-94-25 is mitigated by the byte-identical hostile-name goldens (7 `$(touch pwned)` cases among 132); T-94-26 by the png and jpeg-only `image`, the size and dimension bounds and the iconless fallback.

## Self-Check: PASSED

- launch_url.rs, mac.rs, proof.rs, icns.rs, linux.rs, tests/golden_text.rs, tests/icns.rs: present
- commits 60db7dcc7, ffc74a241 and 85a49b8f8 present on gsd/phase-94-humble-bundle-and-shortcuts
- golden/icon_geometry: ABSENT (recorded as pending above)
