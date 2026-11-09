---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 04
subsystem: infra
tags: [rust, steam-depot, file-modes, macho, path-containment, collisions]
requires: [73-01]
provides:
  - apply_file_modes / ModeReport (POSIX modes, Windows SetFileAttributesW)
  - macho_wants_exec / apply_macho_fallback
  - resolve_contained_path / check_symlink_target / PathTraversal
  - probe_case_insensitive, detect_path_collisions, CollisionPlan
  - FlagsCensus and FLAGS_CENSUS_LOG_PREFIX
affects: [73-05, 73-06, 73-09]
key-files:
  modified:
    - src-tauri/crates/gamelib-depot/src/post.rs
  created:
    - src-tauri/crates/gamelib-depot/tests/post.rs
key-decisions:
  - "Mach-O probe ported directly from machO.ts; gamelib-scan is not reused, crates stay decoupled"
  - "Containment is lexical (mirrors path.resolve/relative), including the rel.startsWith('..') quirk"
  - "probe_case_insensitive ports the TS stat-based probe (dev+ino of the dir vs its case-swapped name), not a file-creation probe"
requirements-completed: [P73-A, D-10]
duration: 25min
completed: 2026-11-09
---

# Phase 73 Plan 04: Post-processing rules Summary

`post.rs` now holds the D-10 per-file rules, exact to the TS: EDepotFileFlag modes (exec then readonly, 0o755 / 0o444 / 0o555, Hidden a POSIX warning no-op, Windows via `SetFileAttributesW` OR-ing onto existing attributes), the content-gated Mach-O +x fallback (thin or fat first slice, nfat <= 32, slice offset <= 64 MiB, EXECUTE/DYLIB only), lexical path and symlink-target containment, cross-depot collision resolution, the volume case probe and the flags census.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1, 2 | 4d181591c | post.rs and tests/post.rs; 53 tests pass, clippy (1.99.1, -D warnings) clean |

Both tasks touch only `post.rs` and `tests/post.rs` and were committed together as one commit.

## Deviations from Plan

1. **[Rule 1 - Plan/TS mismatch] Probe is read-only stat-based, not file-creating.** The plan text says "create a uniquely named file, stat its case-flipped name, remove". The actual TS `probeCaseInsensitiveVolume` stats the directory and its case-swapped spelling and compares dev+ino, falling back to the platform default (linux false, else true). Ported the TS. On non-unix targets (no dev+ino) it compares canonical paths. `probe_case_insensitive_with` takes an injected stat closure so the four TS probe vectors port directly.
2. **[Rule 1] `detect_path_collisions` input shape.** The plan's `(String, &DepotManifest)` tuple lacks `ownerAppId` and `appinfoRank`, which the TS later-depot-wins rule needs. Used a `CollisionDepot { depot_id, owner_app_id, appinfo_rank, files }` struct instead. The function returns a `CollisionPlan` (`resolved`, `unresolved`, `dropped` as `(depot idx, file idx)`, `dropped_bytes`, `warnings`) and does not mutate. Plan 05/06 callers need to build `CollisionDepot` and apply `dropped`.
3. **`census.add` takes `&ManifestFile`** (not just flags) because the TS zeroSizeEntries counter needs size and chunk count. `summary_line(extra)` omits the prefix, as `formatDepotFlagsCensus` does; callers prepend `FLAGS_CENSUS_LOG_PREFIX`.
4. **`ModeReport` carries a `failures` list** besides `all_modes_applied` and `warnings`, so a ReadOnly/Hidden attribute failure is reported (TS `{ ok: false }`) rather than skipped. The exec chmod failure is an `Err`, as the TS throws there.
5. Windows `SetFileAttributesW` path is written but not compiled or exercised here (macOS host); CI Windows leg will be its first run.
6. `cargo fmt -p gamelib-depot` also reformatted four files from plan 03; those changes were reverted and not committed.

## Known Stubs

None.

## Self-Check: PASSED

Commit 4d181591c exists; post.rs and tests/post.rs present; `grep -c Command::new post.rs` is 0.
