---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 05
subsystem: steam-polling
status: complete
tags: [rust, steam, adoption, windows, linux, content-log, libraryfolders, registry]
requires: [81-04]
provides:
  - gamelib-steampoll adoption_evidence module (folder_key, parse_loaded_apps_line, LogCursor, capture_log_cursor, scan_log_for_rescan, library_folders_list_app, windows_signed_in, connection_log_signed_in)
  - gamelib_steamfiles::library::read_library_folder_apps
  - AdoptionWatch::with_registry_reader
  - AdoptionReading.evidence values "log" (every OS) and "libraryfolders" (Linux)
  - constants ADOPTION_LOG_TAIL_BYTES, ADOPTION_CONNECTION_LOG_TAIL_BYTES
affects: [81-06, 81-09, 81-20]
tech-stack:
  added: []
  patterns: [byte-offset log cursor captured at watch registration, bounded tail window with partial-line drop, injected HKCU reader trait object, scratch Steam root in every watch test]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/src/adoption_evidence.rs
    - src-tauri/crates/gamelib-steampoll/tests/adoption_evidence.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/adoption.rs
    - src-tauri/crates/gamelib-steampoll/src/constants.rs
    - src-tauri/crates/gamelib-steampoll/src/lib.rs
    - src-tauri/crates/gamelib-steampoll/tests/adoption.rs
    - src-tauri/crates/gamelib-steamfiles/src/library.rs
    - src-tauri/crates/gamelib-steamfiles/tests/library.rs
decisions:
  - "A capture cursor sits at the end of the last complete line, not blindly at the file length: a line Steam is still writing when the watch registers is then read once it completes instead of being parsed from its middle"
  - "The first count logged for a folder after a watch that had no prior count does not become a baseline: the Open Question 3 rule stays off exactly as the plan states"
  - "Steam root resolution is cached once per watcher (OnceLock) with the rearm.rs fallback to discover_default, so the fallback probe runs at most once"
  - "The pid probe now runs every tick on every OS (steamRunning and the signed-in gate need it); only macOS reads a pid change as evidence"
metrics:
  tasks: 2
  files: 8
  completed: 2026-11-18
commits: 2
plan_head_before: d356911677a42f9a90b6c85d0382f90d91990679
plan_head_after: d2b64dc510a2b5110ee6c9afd5f205110a133f3c
actuals:
  tokens: 16000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 05: Windows and Linux adoption evidence Summary

The adoption watch now clears a pending record on Windows and Linux from the evidence spikes 087 and 088 found (a Steam content_log rescan on every OS, `libraryfolders.vdf` listing the app on Linux), reports signed-in per OS for the D-03 note, and never reads a Steam pid change or a stopped Steam as adoption off macOS.

## Commits

- 61ea2919a: feat(81-05) content_log rescan evidence clears the adoption watch on every OS (tracer)
- d2b64dc51: feat(81-05) Linux libraryfolders evidence and the Windows/Linux signed-in readings

## What was built

- **Task 1 (tracer).** `adoption_evidence.rs`: `folder_key` (backslash to `/`, drop a final `appmanifest_*` component, trim, ASCII-lowercase), `parse_loaded_apps_line` (finds `] Loaded `, decimal N, the literal ` apps from install folder "`, text to the next quote), `LogCursor`, `capture_log_cursor` and `scan_log_for_rescan` implementing the Open Question 3 rule: a line for the record's own steamapps folder, past the offset captured at registration, with N above the last count logged for that folder before the offset; no prior count keeps the rule off. Reads are capped at `ADOPTION_LOG_TAIL_BYTES` (256 KiB); a rotated file (shorter than the offset) is read from 0; a capped window drops its partial first line; a line without its newline is not consumed. `adoption.rs`: `watch` captures the cursor from `<steamRoot>/logs/content_log.txt` (key = `folder_key(manifest_path)`, steam root = the one given to `new`, else `discover_default`); each tick, after the ACF check, scans and reports evidence `"log"`; `read` uses a copy of the watched entry's cursor (never advancing it) and skips the evidence for an unwatched app.
- **Task 2.** `gamelib_steamfiles::library::read_library_folder_apps` (size cap and parse of `read_library_folders`, numeric `apps` keys of every folder). `library_folders_list_app` (listed AND mtime later than `recordedAtMs`), `windows_signed_in` (`Software\Valve\Steam\ActiveProcess` / `ActiveUser`, 0 = signed out), `connection_log_signed_in` (final 64 KiB, last state line, a private copy of the wrap.rs grammar). `adoption.rs`: `registry_reader` defaulting to `RealRegistry`, `with_registry_reader` for tests; the pid probe runs every tick on every OS; Linux evidence `"libraryfolders"` plus signed-in from connection_log; Windows signed-in from the registry; both only while Steam is running.

## Verification

- `cargo test -p gamelib-steampoll` and `cargo test -p gamelib-steamfiles` (whole crates, from `src-tauri/`): no failures. adoption 44, adoption_evidence 27, steamfiles library 17.
- `cargo clippy -p gamelib-steampoll -p gamelib-steamfiles --all-targets -- -D warnings` clean; `cargo fmt --check` clean.
- Mutation checks, each made the matching test fail then restored: `count >= prior` (the Linux and Windows rescan watch tests failed), ignoring the record time in `library_folders_list_app`, reading the Windows signed-in value while Steam is not running.
- Acceptance greps: `apps from install folder` in adoption_evidence.rs (3), `pub mod adoption_evidence;` (1), `"log"` in adoption.rs (2), `pub fn read_library_folder_apps` (1), `ActiveUser` (3), non-comment `Installed"` matches 0, 5 test names mentioning `pid` for Linux/Windows that assert not adopted, 17+ tests in the pure-reader file.
- Windows CI compatibility by construction: fixtures build paths with `join`, one CRLF log fixture, parsed folders normalised across `/` and `\`. Not run on a Windows or Linux host here; the rust-test.yml legs and live item 7 of 81-20 do that.

## Deviations from Plan

**1. [Interpretation] `capture_log_cursor` offset.** The plan says the offset is the file length. It is, for a log that ends in a newline. A log ending mid-line sets the offset at the end of the last complete line instead, so the half-written line is read whole later rather than from its middle. Tested through `a_partial_trailing_line_is_not_consumed_until_it_is_complete`.

**2. [Test setup, Rule 2] Every watch test now has a scratch Steam root.** The existing rig passed `None`, which after this plan means the watch falls back to `discover_default()` and would read the real user's `content_log.txt`. `rig_inner` now always passes a temp directory. The dispatch tests already point HOME at a scratch directory.

**3. [Extra] Two constants.** `ADOPTION_LOG_TAIL_BYTES` (named in the plan) and `ADOPTION_CONNECTION_LOG_TAIL_BYTES` (64 KiB, the plan's number, given a name).

**4. [TDD order] Task 1 and the Task 2 pure readers ran RED first** (compile failures for the missing module and functions). The Task 2 watch evaluation in `adoption.rs` was written before its watch tests; verified instead with the mutations above. The plan is `type: execute`, so no plan-level TDD gate applies.

No pre-existing reds from `deferred-items.md` were touched; `contracts.rs` and the whole crates pass in this run (the 81-04 note on the 24-op pin no longer reproduces).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-81-15 size caps and partial-line handling, T-81-17 pid change never evidence off macOS and pinned by four tests plus the older mixed one, T-81-18 no paths or ids logged by the new code).

## Live gate (operator, 81-20 item 7)

On the operator's Windows and Linux machines: confirm a Steam rescan after a GameLib install logs a `Loaded N apps from install folder` line that clears the record, that Linux `libraryfolders.vdf` lists the app after adoption, and that `ActiveUser` / `Logged On|Off` match the real sign-in state. `content_log.txt` line shape on Windows and Linux comes from spike 087/088 and RESEARCH lines 305-318, not a live run on this Mac.

## Self-Check: PASSED

Created files (`adoption_evidence.rs`, `tests/adoption_evidence.rs`) exist; both commits (61ea2919a, d2b64dc51) are ancestors of HEAD.
