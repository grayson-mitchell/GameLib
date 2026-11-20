---
phase: 71-rust-shell-module-decomposition
plan: 03
subsystem: testing
tags: [rust, source-text-tests, wave-0]
requires: [71-02]
provides:
  - shell_production_source, cut_test_modules, SHELL_SOURCE_PARTS in main.rs tests
  - directory-aware SHELL_SOURCE_FILES guard, Rust no-slicer guard
  - baselines/wave-0-end, wave_0_complete true
affects: [71-04 and later Phase 71 waves]
key-files:
  modified:
    - src-tauri/src/main.rs
    - .planning/phases/71-rust-shell-module-decomposition/71-VALIDATION.md
key-decisions:
  - "Cut rule identical to the jest reader (column-0 #[cfg(test)] + column-0 mod <ident> {, through next line exactly })"
requirements-completed: [D-03, D-09, D-10, D-11, D-14]
duration: 40min
completed: 2026-11-08
---

# Phase 71 Plan 03: Rust production-source builder and Wave 0 close Summary

Rust source-text tests now read per-file test-cut production text, the file-list guard is directory-aware, and Wave 0 is closed with wave-0-end baseline and three-leg CI green.

## Accomplishments
- `SHELL_SOURCE` const replaced by `SHELL_SOURCE_PARTS` (same order as `SHELL_SOURCE_FILES`), `cut_test_modules`, `shell_production_source`. No `shell_full_source` was needed (no other reader).
- Four users migrated (`let source = shell_production_source();`, no needle or assertion edits): keyring probe READS, wry blocking cookies macOS gate, both epic cold jar login timeout pins. All pass.
- New tests: `shell_source_parts_align_with_file_names`, `cut_test_modules_cuts_whole_test_mod_blocks_only`, `shell_production_source_main_part_equals_pre_test_slice`, `no_shell_source_test_slices_on_mod_tests`.
- `shell_source_files_names_every_shell_module_file` skips a pre-split sibling's directory (prefix derived from `macos_epic_embed.rs`). Probe: an empty `src/zz_probe.rs` made it fail ("missing ... zz_probe.rs"); probe deleted.
- Wave 0 gate: baseline compare PASS (cargo 445 >= 441, no test name lost, 4 new tests, clippy list identical, jest failing set identical, jest 713 >= 701); moveproof wave 1 clean; `pnpm check:ipc-contract` up to date.
- CI: rust-test.yml run 42443435105 on pushed HEAD 748e86f69: macos-latest, ubuntu-latest, windows-latest all success.

## Needle counts (whole concatenated source, full vs production-cut)
| needle | full | cut |
|---|---|---|
| `RustInvokeChannel::KeyringAvailable => {` | 1 | 1 |
| `Entry::new(KEYRING_SERVICE, KEYRING_REACHABILITY_PROBE_ACCOUNT)` | 3 | 1 |
| `fn clear_default_data_store_cookies_for_domain` | 3 | 1 |
| `fn dispatch_rust_channel` | 1 | 1 |
| `humble_login_cookies` | 53 | 32 |
| `removeDataOfTypes` | 13 | 7 |

The counts are NOT all equal: the cut also removes main.rs's own `mod tests`, which previously sat inside `SHELL_SOURCE` and contributed self-matches. The production-code anchors each test scans (arm opener, `fn` definitions, dispatcher) are equal; the drops are all test-module text. All four tests pass with unchanged needles and assertions.

## Task Commits
1. 7296c7ec4 shell_production_source cutter and four migrations
2. aa1502ac3 directory-aware guard and no-slicer guard
3. wave-0-end baseline and wave_0_complete (docs commit)
4. 748e86f69 fix: two unused imports (see Deviations)

## Deviations from Plan
- [Rule 3 - Blocking] The pre-push hook (`pnpm lint`) failed on two pre-existing lint errors from Phase 72 (`absolutePathArg` unused in `src/common/types/ipc/shellFiles.ts`, `join` unused in `src/backend/sidecar/shellFilesFlowRegistration.ts`), so the push for CI was impossible. Removed both unused imports (commit 748e86f69); prettier and tsc clean.
- Needle counts differ before/after as explained above, rather than being equal.
- cargo fmt reports pre-existing diffs across other shell files; not touched.

## Known Stubs
None.

## Self-Check: PASSED
