---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 05
subsystem: steam-polling
tags: [rust, steam, acf, path-guard, security]
requires: [80-01, 80-04]
provides:
  - SteamInstallCopy, enumerate_copies, find_other_manifests_with_installdir, scan_downloading_app_ids in gamelib-steampoll::acf_copies
  - RemoveCopyResult, remove_copy, guard_install_root (the only install-root guard)
key-files:
  modified:
    - src-tauri/crates/gamelib-steampoll/src/acf_copies.rs
  created:
    - src-tauri/crates/gamelib-steampoll/tests/acf_copies.rs
    - src-tauri/crates/gamelib-steampoll/tests/acf_copies_security.rs
decisions:
  - "remove_copy returns bridge_bottle = Some(GameLibSteamBridge-<appId>) for a full bridge removal; the TS caller still runs resolveBridgeBottleName (legacy shared bottle => skip) and removePerGameBridgeBottle. Rust never removes a bottle."
  - "scan_downloading_app_ids returns every downloading appId; the in-memory libraryState filter stays in the TS caller (sidecar state)"
  - "Refusing-direction deltas from TS: symlinked install root or common dir is refused (TS removed the link only); absolute or climbing installdir is refused"
metrics:
  tasks: 2
  completed: 2026-11-16
---

# Phase 80 Plan 05: acf_copies and the Rust-only path guard Summary

The copy half of acfState.ts is in Rust. `guard_install_root` (absolute, no `.`/`..` segment, `steamapps` ancestor, no symlink or Windows reparse point on root or `common`, canonical containment in `canonicalize(steamapps)/common`) runs before any deletion. 31 cargo tests (22 + 9), clippy `-D warnings`, and `cargo fmt --check` are clean.

## Commits

- 9b9a14d16: acf_copies.rs (all code) and tests/acf_copies.rs
- d0c4ee33d: tests/acf_copies_security.rs (the production code was written in one file with task 1, so task 2's commit is tests only)

## Guard ordering

In acf_copies.rs `guard_install_root(` is called at line 296, the only `remove_dir_all` call is at line 318 in the same function (`remove_copy`). `bridge_bottle` appears in the result type and is only a name; no bottle directory is removed in this file.

## Test mapping

removeCopies.test.ts is a large file (cases at 332-1523). Only the describes whose subject is the Rust functions are ported.

| TS case | Rust |
| --- | --- |
| isAppleSiliconMac (7 cases, 332-515) | stays-TS: host gate, not acfState |
| enumerate: only native when bottle/bridge absent | `enumerate_returns_only_native_when_bottle_bridge_absent` |
| enumerate: excludes downloading | `enumerate_excludes_a_downloading_root` |
| enumerate: fixed order, throwing probe skipped | `enumerate_probes_native_bottle_bridge_in_order_and_skips_failed_probe` |
| remove: non-numeric appId refused | `remove_non_numeric_app_id_is_refused`, `refuses_non_numeric_app_id` |
| remove: unknown refused (WR-01) | `remove_unknown_state_is_refused` |
| remove: absent | `remove_absent_is_absent` |
| remove: downloading refused | `remove_downloading_is_refused_and_untouched` |
| remove: traversal installdir refused | `refuses_traversal_installdir` |
| remove: empty installdir refused | `refuses_empty_installdir` |
| remove: happy path | `remove_happy_path_removes_dir_and_manifest` |
| remove: shared installdir manifest-only | `remove_shared_installdir_is_manifest_only_and_dir_untouched` |
| non-default library removal (261106-s3n) | `remove_in_non_default_library_uses_that_library` |
| installdir climbing out (../../..) | `refuses_traversal_installdir` |
| absolute-looking installdir | `refuses_absolute_installdir` (Rust refuses; TS joined it under common/) |
| common/<installdir> symlink removes link only | `refuses_symlinked_install_root` (Rust refuses outright; victim intact either way) |
| bridge: per-game bottle, full removal | `bridge_full_removal_reports_bottle_and_removes_no_bottle` (bottle call itself stays TS) |
| bridge: legacy shared bottle => not called | stays-TS: resolveBridgeBottleName / removePerGameBridgeBottle |
| bridge: manifest-only => no bottle | `bridge_manifest_only_reports_no_bottle_and_native_bottle_sources_never_do` |
| bridge: removePerGameBridgeBottle error => bottleRemoved:false | stays-TS |
| native / bottle source never touch a bottle | `bridge_manifest_only_reports_no_bottle_and_native_bottle_sources_never_do` |
| SteamGame.install() auto-cleanup (6 cases) | stays-TS: install routing |
| removeAllSteamInstallCopies (8 cases) | stays-TS: sweep orchestration |
| steamRemoveAllCopies IPC census | stays-TS |

library.acfState.test.ts ranges:

| TS case | Rust |
| --- | --- |
| findOther: [] when dir missing | `other_manifests_empty_when_dir_missing` |
| findOther: same installdir | `other_manifests_finds_same_installdir` |
| findOther: sibling installdir not a conflict | `other_manifests_sibling_installdir_is_not_a_conflict` |
| findOther: never self | `other_manifests_never_reports_self` |
| findOther: corrupt sibling => unknown | `other_manifests_corrupt_sibling_is_unknown_conflict` |
| findOther: ignores non-manifest files | `other_manifests_ignores_non_manifest_files` |
| scanDownloading: bit 4 unset AND in library | `scan_downloading_returns_bit_4_unset_ids` (library filter stays TS) |
| scanDownloading: bit 4 set excluded | `scan_downloading_returns_bit_4_unset_ids` |
| scanDownloading: not in library excluded | stays-TS: libraryState filter |
| findOther rust branch: one scan, other appIds | `other_manifests_finds_same_installdir` |
| rust branch: skips own manifest / no appid | `other_manifests_never_reports_self` |
| rust branch: own skipped manifest not a conflict | `other_manifests_own_corrupt_manifest_is_not_a_conflict` |
| rust branch: sentinel when invoke rejects | stays-TS: no transport in Rust; unreadable scan => sentinel is covered by the corrupt-sibling test |

Extra Rust-only: `scan_downloading_empty_when_library_list_unreadable`, `remove_manifest_only_when_install_dir_absent`, security tests `refuses_dot_segment_installdir`, `refuses_absolute_installdir`, `refuses_symlinked_common_dir`, `guard_refuses_canonical_escape_through_symlinked_steamapps_child`, `guard_rejects_relative_dot_and_no_steamapps_ancestor`, `refuses_reparse_point_install_root` (`#[cfg(windows)]`, not run on this host). Every security test asserts a sentinel outside steamapps survives.

## Deviations from Plan

None in behaviour beyond the decisions above. The empty/`.` installdir cases are refused by the guard-or-containment chain; I did not isolate which check fires.

## Known Stubs

None.

## Threat Flags

None. T-80-11/12/13 mitigated and tested; T-80-14 via appId/source/outcome-only eprintln logs. The Windows reparse-point branch compiles only on Windows and was not exercised here.

## Self-Check: PASSED

Files and commits 9b9a14d16, d0c4ee33d verified present.
