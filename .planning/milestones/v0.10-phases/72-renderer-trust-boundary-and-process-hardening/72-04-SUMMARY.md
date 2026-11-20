---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 04
subsystem: shell
tags: [rust, tauri, shell-open, trust-boundary]
requires: [72-01]
provides:
  - shell_open.rs authoritative open/reveal path policy
  - shared fixture src/common/__fixtures__/openPolicyCases.json
affects: [72-06]
key-files:
  created:
    - src-tauri/src/shell_open.rs
    - src/common/__fixtures__/openPolicyCases.json
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
requirements-completed: [D-06, D-07, D-08, D-15]
completed: 2026-11-08
---

# Phase 72 Plan 04: Rust open/reveal path policy Summary

`shell_open_path` now opens only an absolute, existing, non-bundle directory, and `shell_show_item_in_folder` reveals only an absolute, existing, scheme-free path. Both live in the new `shell_open.rs` and fail closed with fixed-literal errors that never echo the input.

## Commits
- c7dfdf8e1: policy functions, fixture, tests (Task 1)
- a8088c5c6: arms in store_embed.rs delegate to shell_open (Task 2)

## Names for 72-06 to mirror
- `OPEN_PATH_BUNDLE_EXTENSIONS`: app, prefpane, saver, workflow, action, plugin, bundle, framework, component, kext, mdimporter, qlgenerator, xpc, appex, wdgt, pkg, mpkg (compared ASCII case-insensitively on the canonicalized path's extension; only `app` is required, rest is RESEARCH A3)
- Shape rejects: empty, NUL, contains `://`, leading `\\` or `//`, non-absolute
- Fixture schema: `{ urlCases: [{input, expect: "allow"|"reject"}], folderShapeCases: [{input, expect: "reject"}] }`
- Rust fns: `open_path_policy_check`, `reveal_path_policy_check`, `is_launchable_bundle`; URL cases run through `relay_commands::open_external_scheme_check`

## Deviations from Plan
**[Rule 3 - Blocking]** `tests::shell_source_files_names_every_shell_module_file` in main.rs requires every shell `.rs` file to be listed in `SHELL_SOURCE_FILES`/`SHELL_SOURCE`; added `shell_open.rs` to both (main.rs).

Reveal's existence check uses `symlink_metadata` (so a dangling symlink can still be revealed). The arms take `args: &[Value]` to match `dispatch_rust_channel`.

## Verification
`cargo test --bin gamelib-shell`: 435 passed, 0 failed (5 new `shell_open_*` tests). Clippy ratchet PASS (darwin, 1.99.1). Prettier check passes on the fixture JSON.

## Known Stubs
None.

## Self-Check: PASSED
