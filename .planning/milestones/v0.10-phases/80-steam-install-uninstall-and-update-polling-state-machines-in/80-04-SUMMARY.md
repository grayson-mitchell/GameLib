---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 04
subsystem: steam-polling
tags: [rust, steam, acf, gamelib-steamfiles]
requires: [80-01]
provides:
  - PollRoots, AcfSource, AcfState, read_acf_state, steam_libraries in gamelib-steampoll::acf_state
  - AcfUpdateFields, read_acf_update_state, read_acf_update_fields_from_dir, is_acf_update_pending
affects: [80-05 .. 80-33]
tech-stack:
  patterns: [parsing only through gamelib-steamfiles, fail-to-unknown, numeric appId check before any join]
key-files:
  modified:
    - src-tauri/crates/gamelib-steampoll/src/acf_state.rs
  created:
    - src-tauri/crates/gamelib-steampoll/tests/acf_state.rs
    - src-tauri/crates/gamelib-steampoll/tests/acf_update.rs
decisions:
  - "Strict steam_libraries errors only on an I/O read failure of an existing libraryfolders.vdf (no transport to reject in Rust); missing or unparsable still yields the system path only, as TS"
  - "A bottle/bridge source whose root is None in PollRoots reads as Unknown (TS threw; callers relied on the throw)"
  - "AcfState::Downloading.state_flags is Option<u32> (TS NaN); byte counters are u64"
metrics:
  tasks: 2
  completed: 2026-11-16
---

# Phase 80 Plan 04: ACF read side and update fields Summary

`read_acf_state`, `steam_libraries` and the whole of acfUpdateState.ts now exist in Rust on `gamelib_steamfiles::{library::find_acf, library::read_library_folders, acf::read_acf}` with no tokenizer of their own. 34 cargo tests (25 + 9), clippy `-D warnings` and `cargo fmt --check` are clean.

## Commits

- ae292d11f: acf_state.rs (both tasks' code) and tests/acf_state.rs
- 139df6768: tests/acf_update.rs (the update-fields code was written in the same file as task 1, so it landed in ae292d11f)

## Test mapping

Read-side `it(` count in library.acfState.test.ts: lines 253-640 = 16, lines 891-1040 = 6; total 22 rows below.

| TS case (library.acfState.test.ts) | Rust |
| --- | --- |
| returns installed with installPath/sizeOnDisk when bit 4 set | `installed_when_bit_4_set` |
| downloading when bit 4 unset | `downloading_when_bit_4_unset` |
| downloading ACF returns byte numbers | `downloading_carries_byte_counters` |
| defaults missing/non-numeric byte fields to 0 | `missing_or_non_numeric_byte_fields_default_to_zero` |
| absent when no manifest | `absent_when_no_manifest_in_any_existing_dir` |
| skips a corrupt ACF => absent | `corrupt_acf_is_skipped_as_absent` |
| GameLib-written 1026 manifest => downloading | `gamelib_written_1026_manifest_reads_as_downloading` |
| same manifest flipped to 4 => installed | `steam_flipped_state_flags_4_reads_as_installed` |
| bottle: reads manifest under bottle root | `bottle_reads_manifest_under_bottle_root` |
| bottle: absent though native installed (no conflation) | `bottle_is_not_conflated_with_native` |
| bottle: win32 layout root | `bottle_win32_layout_program_files_root_resolves_installed` |
| native unchanged with no source arg | `native_default_unchanged_with_same_fixture` |
| bridge: reads StateFlags=4 under bridge root | `bridge_reads_manifest_under_bridge_root` |
| bridge: absent when dir missing, no throw | `bridge_absent_when_dir_does_not_exist` |
| bridge: absent for native-only ACF | `bridge_not_conflated_with_native` |
| bridge-only ACF absent under native and bottle | `bridge_only_acf_is_absent_under_native_and_bottle` |
| rust branch: installed path under the dir found in | `rust_installed_reports_path_under_dir_record_was_found_in` |
| rust branch: downloading numeric counters, non-numeric 0 | `rust_downloading_numeric_counters_non_numeric_zero` |
| rust branch: absent when nothing found; unknown when invoke rejects | `absent_when_nothing_found_and_unknown_when_manifest_read_fails_not_applicable` (absent half ported; the rejecting-invoke half is stays-TS, there is no transport in Rust) |
| rust branch: unknown when library list unreadable (WR-01) | `unknown_when_native_library_list_cannot_be_read` |
| scanDownloadingAppIds makes one scan call | stays-TS here: subject is `scanDownloadingAppIds`, ported by plan 05 |
| scanDownloadingAppIds empty list when invoke rejects | stays-TS here: plan 05 |

Out of the 253-640 range, not read-side: `findOtherManifestsWithInstalldir` (641-767) and `scanDownloadingAppIds` (769-890) are plan 05 / uninstall.

Extra Rust-only tests: `installed_size_defaults_to_zero_and_buildid_optional`, `unknown_when_bottle_or_bridge_root_unprovisioned`, `traversal_shaped_app_ids_are_unknown_and_never_joined` (T-80-08, `../1`, `1/../2`, empty, `1a`, `-1`, ` 1`), `steam_libraries_strips_quotes_and_filters_existing`, `steam_libraries_missing_list_yields_system_path_only`.

Update-state mapping (acf_update.rs):

| TS case | Rust |
| --- | --- |
| updateDetection: isAcfUpdatePending flags bit 0x2 and differing TargetBuildID | `pending_flags_bit_2_and_differing_target_build` |
| ignores TargetBuildID 0/absent and stale counters | `pending_ignores_target_zero_absent_and_stale_counters` |
| counts a scheduled update only with bytes outstanding | `pending_counts_scheduled_update_only_with_bytes_outstanding` |
| readAcfUpdateState reads pending and current fixtures | `reads_pending_and_current_fixtures_from_native_roots` (fixtures inlined, not copied from the TS tree) |
| returns null for corrupt or missing manifest | `null_for_corrupt_or_missing_manifest` |
| readAcfUpdateFieldsFromDir keeps build ids exact, counters numeric | `keeps_build_ids_as_exact_strings_and_counters_numeric` |
| feeds the unchanged pending rules | `feeds_pending_rules_target_and_scheduled` |
| null without buildid / unparsed / absent / bad id / rejected invoke | `null_without_buildid_unparsed_absent_or_bad_id` (rejected-invoke part stays-TS: no transport) |
| (new) bottle/bridge sources read only their root | `bottle_and_bridge_sources_read_only_their_root` |
| acfInstalledDepots.test.ts, 3 cases (19-digit gid, skip bad gid, null when absent/bad id/rejects) | stays-TS: subject is `readAcfInstalledDepots` (acfInstalledDepots.ts), not in acfUpdateState.ts and not in D-12 scope for this plan |
| acfInstalldir.test.ts, 6 cases | stays-TS: subject is `readAcfInstalldir`, used by resume.ts's user-triggered resume and installLocation.ts, which stay TS |

## Deviations from Plan

None in behaviour. Note: the plan names `is_acf_update_pending`; the TS name is `isAcfUpdatePending`, ported 1:1. Task 2's production code was authored together with task 1 in one file, so task 2's commit is tests only.

## Known Stubs

None.

## Threat Flags

None. T-80-08 (numeric appId before any join, tested), T-80-09 (install path only reported, never touched), T-80-10 (read failures are Unknown / None, no panics) mitigated.

## Self-Check: PASSED

Files and commits ae292d11f, 139df6768 verified present.
