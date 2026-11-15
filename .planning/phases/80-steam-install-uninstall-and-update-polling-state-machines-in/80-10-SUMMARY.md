---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 10
subsystem: steam-polling
tags: [rust, steam, macos, mach-o, lipo]
requires: [80-01]
provides:
  - mac_arch.rs: locate_macho_binary(_with), locate_macho_candidates, macho_archs, verdict_from_archs, mac_arch_verdict, MacArch
affects: [80-11, 80-14]
key-files:
  created: [src-tauri/crates/gamelib-steampoll/tests/mac_arch.rs]
  modified: [src-tauri/crates/gamelib-steampoll/src/mac_arch.rs]
decisions:
  - "Info.plist: the TS reads it as text and applies a regex (no plist library, no plutil); the port does the same, bare names only"
metrics:
  tasks: 1
  files: 2
  completed: 2026-11-16
---

# Phase 80 Plan 10: Mac arch probe in Rust Summary

mac_arch.rs ports the file-and-process half of the Mac arch ground-truth check: locate the Mach-O, run `lipo -archs` then `file` through `ProcessRunner` (argv arrays, 5 s per probe, timeout = failure), and map the arch list to `MacArch::{Bits32,Bits64}` (serialising to "32"/"64") or `None`. `mac_arch_verdict` carries the native + macOS guard. Applying the verdict stays in the TS handler via `macArchVerdict`.

Commit: bc7f60246.

## Plist handling

TS uses a regex over the XML text of `Contents/Info.plist`; Rust does the same string match. Binary plists yield no declared name and fall back to the first `Contents/MacOS` entry (sorted; TS uses readdir order). T-80-32: only bare names are accepted (no `/`, `\`, `..`), so a hostile value falls back to the directory scan.

## TS test mapping

library.macArch.test.ts:

| TS case | Rust |
| --- | --- |
| runs lipo -archs argv-form | lipo_argv_form_returns_split_archs |
| falls back to file | file_fallback_when_lipo_fails (+ lipo_timeout_is_a_failure_then_file) |
| both fail => [] | both_fail_is_inconclusive_never_32 |
| verdict maps (5 cases) | verdict_table |
| prefers supplied launch executable | locate_prefers_launch_executable_when_it_exists |
| scans top-level .app | locate_scans_top_level_app_bundle |
| no .app / readdir throws / no MacOS dir | locate_none_without_bundle_or_macos_dir_or_dir |
| rejects ".." and absolute escape | launch_executable_escaping_install_path_is_rejected |
| skips bottle / !isMac | guards_skip_without_spawning |
| logs+skips when nothing located | no_binary_is_none_and_no_spawn |
| inconclusive / i386 -> 32 / x86_64 -> 64 | native_mac_verdicts |
| (CFBundleExecutable preference, hostile name, candidates cap: TS locate helpers) | locate_prefers_cfbundleexecutable_over_first_entry, hostile_cfbundleexecutable_falls_back_inside_macos, locate_install_path_is_itself_an_app, candidates_are_capped_and_declared_first |

Stays TS (applied by the plan 11 handler): skips on mac_arch already '32' / verified (metadata-store reads), persisting macho/verified fields, known-fix report cases (reports 32 once, contradicted 32 remove, nothing for 64, early returns, hook never settles, known-fix seed behaviours, paste-ready log, macho 32 short-circuit), the i386 consent dialog, CR-01 library Map push, E1-E4 poll/focus wiring.

macArchKnownFix.test.ts (all 12 cases: hint/Intel/verified/throwing reader, seeding, retraction, report naming) and macArchKnownFixRouting.test.ts (3 cases: bottle-branch routing, eligibility) are apply/classify side: stays TS.

## Verification

`cargo test -p gamelib-steampoll --test mac_arch` (16 pass), clippy `-D warnings`, `cargo fmt --check` clean. rustfmt is the formatter check (no prettier parser for .rs).

## Deviations from Plan

None. The `launch` argument is on `*_with` variants; `locate_macho_binary(install_path)` keeps the plan signature.

## Known Stubs

None. Threat flags: none (T-80-30/31/32 mitigated).

## Self-Check: PASSED
