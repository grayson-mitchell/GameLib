---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 03
subsystem: infra
tags: [rust, tauri, windows, named-pipe, single-instance, jest, source-gates, windows-sys]

# Dependency graph
requires:
  - phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra plan 46-02
    provides: "The compiling #[cfg(windows)] FFI half (WindowsPrimaryPipe, WindowsSingleInstanceRole, current_user_identity, create_single_instance_pipe_instance, acquire_single_instance_windows, deliver_to_running_instance_windows) wired into main() before tauri::Builder::default()"
provides:
  - "run_windows_single_instance_accept_loop (#[cfg(windows)]), the primary's warm-delivery accept loop, spawned in .setup() after the sidecar state exists, replacing the plan-46-02 primary_listener placeholder"
  - "A 'Phase 46 Windows single-instance guard' describe block in tauriShellSource.test.ts: 11 positive-token + RED pairs, 4 region gates + RED pairs, 2 ordering gates (REQ-46-01, REQ-46-08) + RED pairs, the REQ-46-03 decision-point-(b) pin + RED pair, and a Secondary-exit gate + RED pair (39 tests total)"
  - "The Win32_System_IO windows-sys feature, required for ConnectNamedPipe"
affects: [46-04, 46-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A nested `fn` (not a closure) for the accept loop's per-connection handling (handle_windows_single_instance_connection), placed textually AFTER the loop that calls it -- Rust hoists nested fn items, so this is valid, and it was necessary to keep the loop's own ConnectNamedPipe(/ERROR_PIPE_CONNECTED/create_single_instance_pipe_instance( tokens textually first, ahead of the connection-handling body's .take(4096)/SINGLE_INSTANCE_FOCUS_SENTINEL/protocol_url_arg(/handleProtocolUrl/bytes={} tokens -- satisfying this plan's own literal in-order acceptance check"
    - "A local fnRegion(code, fnToken) jest helper generalising the file's existing fixed-400-character region-slice convention (T-35-25's deep_link_decision test) to function bodies that exceed 400 characters -- slices from the token to the next column-0 `\\nfn ` or `\\n#[cfg`, or EOF"
    - "lastIndexOf, not indexOf, for the Secondary-exit region gate: WindowsSingleInstanceRole::Secondary appears twice in main.rs (the enum-variant return inside acquire_single_instance_windows, and the match arm inside main() that actually exits) -- indexOf would silently target the wrong occurrence"
    - "writeln!(file (not the bare word 'write') as the specific ordering token for deliver_to_running_instance_windows's owner-check-before-write gate -- 'write' alone matches the earlier .write(true) OpenOptions call, which only requests write ACCESS, not the actual payload write"

key-files:
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts

key-decisions:
  - "Added the Win32_System_IO windows-sys feature (not in the plan's original interface section): ConnectNamedPipe is gated behind #[cfg(feature = \"Win32_System_IO\")] upstream in windows-sys 0.60.2's own Win32/System/Pipes/mod.rs, because its OVERLAPPED parameter type lives in that module. Win32_System_Pipes alone (already declared in plan 46-02) does not bring it in. Caught immediately by cargo check's E0432 on the first build attempt."
  - "ERROR_PIPE_CONNECTED confirmation (task's own read_first instruction: 'check the ConnectNamedPipe Microsoft Learn page and record the confirmation') was answered from trained knowledge, not a live re-fetch -- no web-search/fetch tool was available in this execution environment. The behaviour (ConnectNamedPipe returns zero with GetLastError() == ERROR_PIPE_CONNECTED when a client connects in the create/connect race window, treated as a successful connect) is a long-standing, extremely well-documented Win32 named-pipe idiom (learn.microsoft.com/windows/win32/api/namedpipeapi/nf-namedpipeapi-connectnamedpipe), matching 46-RESEARCH.md Q4/A1's own description verbatim. Flagged here per that assumption's own recorded low-risk rating (a dropped first-fast-arriving deep link on a narrow timing race is the only failure mode if wrong, not a security defect) -- a live MS Learn re-fetch is recommended before treating this as fully re-verified, but was not possible in this session."
  - "Textual ordering of the accept loop's `use` imports and nested fn placement was driven entirely by this plan's own literal in-order acceptance check (ConnectNamedPipe( before ERROR_PIPE_CONNECTED before create_single_instance_pipe_instance( before .take(4096) before SINGLE_INSTANCE_FOCUS_SENTINEL before protocol_url_arg(&[trimmed.to_string()]) before \"handleProtocolUrl\" before bytes={}) -- a plain top-of-function `use windows_sys::Win32::Foundation::{ERROR_PIPE_CONNECTED, ...}` would have put that literal token before the first ConnectNamedPipe( call, so ERROR_PIPE_CONNECTED is referenced via its full path (windows_sys::Win32::Foundation::ERROR_PIPE_CONNECTED) at its one usage site instead of being imported by name."
  - "The OS deep-link section's source-count comment was renumbered: the Windows pipe accept loop is now the THIRD gamelib:// source into the process (after argv and the Unix socket accept loop), and the OS on_open_url callback -- previously described as third -- is now the fourth. This matches actual code order in main() (Unix accept loop, then Windows accept loop spawn, then the OS deep-link section), not the reverse."
  - "The Secondary-exit jest region gate uses lastIndexOf for 'WindowsSingleInstanceRole::Secondary' rather than the plan's literal 'the slice from WindowsSingleInstanceRole::Secondary to the next WindowsSingleInstanceRole::Primary' -- a naive first-occurrence indexOf lands on the enum-variant construction inside acquire_single_instance_windows (which contains neither deliver_to_running_instance_windows( nor std::process::exit(0)), not the match arm inside main() that actually performs the exit. lastIndexOf correctly targets the real match arm because the enum-variant construction is the only other occurrence in the file and it sits earlier."

requirements-completed: [REQ-46-04, REQ-46-07, REQ-46-08]

# Metrics
duration: ~25min
completed: 2026-09-23
---

# Phase 46 Plan 03: Windows named-pipe accept loop + source gates Summary

**Windows named-pipe accept loop spawned in `.setup()` (mirroring the Unix socket accept loop byte-for-byte in intent: bounded 4096-byte read, `__GAMELIB_FOCUS__` sentinel, `protocol_url_arg` re-validation before dispatch), plus 39 new jest source gates in `tauriShellSource.test.ts` pinning every security-relevant token/ordering in the Windows guard, mutation-proven by deleting and restoring `PIPE_REJECT_REMOTE_CLIENTS`.**

## Performance

- **Duration:** ~25 min (first read to last commit)
- **Started:** ~2026-09-23T23:10Z (estimated; not captured at agent start)
- **Completed:** 2026-09-23T23:34:29+12:00 (last task commit)
- **Tasks:** 2 completed
- **Files modified:** 3 (Cargo.toml, main.rs, tauriShellSource.test.ts)

## Accomplishments

- `run_windows_single_instance_accept_loop` (`#[cfg(windows)]`) services `WindowsPrimaryPipe`'s first pipe instance: `ConnectNamedPipe` (treating `ERROR_PIPE_CONNECTED` as a successful connect, matching 46-RESEARCH.md Q4/A1), creates the NEXT pipe instance before reading the current one (a listening instance always exists, so a fast second launch is never refused), reads a single bounded (4096-byte) line, handles the `__GAMELIB_FOCUS__` sentinel with the same `run_on_main_thread` show/focus dance as the Unix loop, and re-validates every other payload through `protocol_url_arg(&[trimmed.to_string()])` before dispatching to `handleProtocolUrl`. Every pipe-recreation failure logs a WARN and returns (fail-open, T-34.5-G6-24) — the app and main window keep running.
- The plan-46-02 `#[cfg(windows)] let _ = &primary_listener;` placeholder in `.setup()` is replaced with `thread::spawn(move || run_windows_single_instance_accept_loop(primary, accept_state, accept_app_handle));`, positioned after `start_reader`/`start_stderr_forwarder` and before `on_open_url`, mirroring the Unix accept loop's own placement and never-joined discipline.
- Added the `Win32_System_IO` windows-sys feature (`ConnectNamedPipe` is gated on it upstream, not on `Win32_System_Pipes` alone) — caught immediately by `cargo check`'s `E0432` on the first build attempt.
- `cargo check --bin gamelib-shell`: 0 errors, 9 warnings (the pre-existing Windows-target baseline — none name any Phase 46 symbol). `cargo test --bin gamelib-shell`: 234 passed, 0 failed, 2 ignored.
- The Unix-region diff gate (`46-unix-cfg-regions.awk` against baseline commit `5bc4fa825`) is empty — every `#[cfg(unix)]` region in `main.rs` is byte-identical to the pre-phase baseline.
- One new jest `describe` block, `Phase 46 Windows single-instance guard (REQ-46-01/03/04/07/08, U-34.5-18)`, added directly after the existing `Phase 35 plan 07 main.rs OS deep-link registration` block: 11 positive tokens (each with a RED self-test), a local `fnRegion` helper, 4 region gates (pipe security flags T-46-01; SQOS + owner-check-before-write T-46-01/02; accept-loop validate-before-dispatch T-34.5-G6-20/23/25; the SDDL DACL never emitting a well-known alias) each with a RED self-test, 2 ordering gates (REQ-46-01 guard-before-Builder; REQ-46-08 `Builder::default()` < `.setup(` < `on_open_url(`, pinning T-46-09's cold-start double-dispatch property) each with RED self-test(s), the REQ-46-03 decision-point-(b) pin (`current_user_identity` reads `TokenUser` only, never `TokenLogonSid`/`SE_GROUP_LOGON_ID`) with a RED self-test, and a Secondary-arm exit gate with a RED self-test — 39 tests total, all passing (186/186 in the whole file).
- Filtered jest runs confirmed per acceptance criteria: `-t "REQ-46-08"` → 3/3 passed; `-t "PIPE_REJECT_REMOTE_CLIENTS"` → 2/2 passed; `-t "decision point b"` → 2/2 passed.
- Mutation transcript (recorded per this task's own instruction): deleted every occurrence of `PIPE_REJECT_REMOTE_CLIENTS` from `main.rs` via `sed -i 's/PIPE_REJECT_REMOTE_CLIENTS//g'`, re-ran `pnpm exec jest ... -t "PIPE_REJECT_REMOTE_CLIENTS"` — the named test (`Region (PIPE_REJECT_REMOTE_CLIENTS, T-46-01): create_single_instance_pipe_instance pins ...`) failed with `expect(region).toContain('PIPE_REJECT_REMOTE_CLIENTS')` reporting the token absent. Restored via `git checkout -- src-tauri/src/main.rs` (sanctioned single-file restore, not a blanket reset); re-ran the same filtered jest command — 2/2 passed again. `git diff src-tauri/src/main.rs` was empty after restoration, confirmed before continuing.
- `pnpm exec prettier --check` and `pnpm exec eslint` both exit 0 on `tauriShellSource.test.ts`. `git diff` on that file for this task is additions-only (428 insertions, 0 deletions).
- REQ-46-04, REQ-46-07, and REQ-46-08 marked Complete in `REQUIREMENTS.md` via `gsd-sdk query requirements.mark-complete` (REQ-46-07's own verification criterion — `cargo test --bin gamelib-shell windows_` + `single_instance_payload` — was independently re-run and confirmed green: 13 + 3 tests passed).

## Task Commits

Each task was committed atomically:

1. **Task 1: Windows named-pipe accept loop, spawned in .setup() after the sidecar state** - `0cd466572` (feat)
2. **Task 2: Phase 46 source gates in tauriShellSource.test.ts (tokens, regions, orderings) with RED self-tests** - `628747ed5` (test)

## Files Created/Modified

- `src-tauri/Cargo.toml` — added the `Win32_System_IO` feature to the `[target.'cfg(windows)'.dependencies]` `windows-sys` feature list, with an inline comment recording why (gates `ConnectNamedPipe` upstream)
- `src-tauri/src/main.rs` — added `run_windows_single_instance_accept_loop` (`#[cfg(windows)]`) directly after `deliver_to_running_instance_windows`, with a nested `handle_windows_single_instance_connection` fn for per-connection handling; replaced the `.setup()` Windows placeholder with the real `thread::spawn` call; renumbered the OS deep-link section's source-count comment (Windows pipe = third source, OS `on_open_url` = fourth)
- `src/backend/__tests__/tauriShellSource.test.ts` — added the `Phase 46 Windows single-instance guard` describe block (39 tests) directly after the `Phase 35 plan 07` describe block

## Decisions Made

See `key-decisions` in the frontmatter above for the four decisions made during execution: the `Win32_System_IO` feature addition (Rule 3, blocking — caught by the compiler), the ERROR_PIPE_CONNECTED confirmation caveat (no web tool available in this environment, so trained knowledge was used and the limitation is recorded rather than silently asserted as independently re-verified), the textual-ordering-driven `use`-import placement for the accept loop, the source-count comment renumbering, and the `lastIndexOf`-based Secondary-exit region gate (deviating from the plan's literal "first occurrence" phrasing because a naive `indexOf` targets the wrong of two occurrences in the real source).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ConnectNamedPipe` is not resolvable with `Win32_System_Pipes` alone**
- **Found during:** Task 1, first `cargo check` after adding `run_windows_single_instance_accept_loop`
- **Issue:** `E0432: unresolved import` — `ConnectNamedPipe` is declared in `windows-sys-0.60.2`'s `Win32/System/Pipes/mod.rs` behind `#[cfg(feature = "Win32_System_IO")]` (its `OVERLAPPED` parameter type lives in that module), and that feature was not in plan 46-02's feature list.
- **Fix:** Added `"Win32_System_IO"` to the `windows-sys` feature list in `Cargo.toml`, with an inline comment recording the upstream gating.
- **Files modified:** `src-tauri/Cargo.toml`
- **Verification:** `cargo check --bin gamelib-shell` went from 1 error to 0 errors.
- **Committed in:** `0cd466572` (Task 1 commit)

**2. [Rule 3 - Blocking] The plan's literal token-order acceptance check required moving `ERROR_PIPE_CONNECTED`'s first textual occurrence**
- **Found during:** Task 1, verifying the task's own acceptance criterion ("the comment-stripped body ... contains, IN THIS ORDER: `ConnectNamedPipe(`, `ERROR_PIPE_CONNECTED`, ...")
- **Issue:** A conventional top-of-function `use windows_sys::Win32::Foundation::{ERROR_PIPE_CONNECTED, GetLastError, HANDLE};` places the literal substring `ERROR_PIPE_CONNECTED` in the import line, which is textually BEFORE the first `ConnectNamedPipe(` call inside the loop — violating the required order.
- **Fix:** Dropped `ERROR_PIPE_CONNECTED` from the `use` import and referenced it via its full path (`windows_sys::Win32::Foundation::ERROR_PIPE_CONNECTED`) at its one usage site (the post-`ConnectNamedPipe` error-code comparison), which is textually after the call. Verified the full 8-token order with a small node script before committing (see Task 1 verification transcript).
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** Node script computing sequential `indexOf` positions for all 8 required tokens confirmed strictly increasing order.
- **Committed in:** `0cd466572` (Task 1 commit)

**3. [Rule 3 - Blocking] The `thread::spawn` acceptance grep required a single-line call, not a braced closure**
- **Found during:** Task 1, verifying `grep -n "thread::spawn(move || run_windows_single_instance_accept_loop(" src-tauri/src/main.rs` finds exactly 1 line
- **Issue:** A `thread::spawn(move || { run_windows_single_instance_accept_loop(...) });` (multi-line, braced) does not match the exact single-line grep pattern the task's own acceptance criteria requires.
- **Fix:** Collapsed to a single-line `thread::spawn(move || run_windows_single_instance_accept_loop(primary, accept_state, accept_app_handle));`, matching the plan's own interface-section example exactly.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** The grep now finds exactly 1 line.
- **Committed in:** `0cd466572` (Task 1 commit)

**4. [Rule 1 - Bug] The Secondary-exit jest region gate's naive first-occurrence search would have targeted the wrong code site**
- **Found during:** Task 2, while designing the Secondary-exit gate against the real `main.rs` source
- **Issue:** `WindowsSingleInstanceRole::Secondary` appears twice in `main.rs`: once inside `acquire_single_instance_windows`'s own `return WindowsSingleInstanceRole::Secondary { ... };` (constructing the enum variant, no exit logic), and once inside `main()`'s match arm that actually calls `deliver_to_running_instance_windows` and `std::process::exit(0)`. A plain `indexOf('WindowsSingleInstanceRole::Secondary')` finds the first (wrong) occurrence, whose slice to the next `WindowsSingleInstanceRole::Primary` contains neither required token — the gate would have failed against the CORRECT real source, a false positive that would have blocked this task indefinitely if not caught before running jest.
- **Fix:** Used `lastIndexOf` instead of `indexOf` for the region's start boundary, correctly targeting the match arm inside `main()` (the only other occurrence, and the later one in file order).
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts` (design-time fix, no incorrect version was ever committed)
- **Verification:** `pnpm exec jest ... ` — the Secondary-exit tests pass against the real source.
- **Committed in:** `628747ed5` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 Rule 3 — blocking corrections needed to compile or to satisfy this plan's own literal grep/ordering acceptance criteria; 1 Rule 1 — a bug in the gate's own design caught before it was ever committed). None changed the guard's runtime behavior; none represent scope creep.

## Issues Encountered

No web-search/fetch tool was available in this execution environment, so the task's own instruction to "check the ConnectNamedPipe Microsoft Learn page and record the confirmation" could not be satisfied by a live re-fetch. The `ERROR_PIPE_CONNECTED` behavior was instead confirmed from trained knowledge of the documented Win32 API (a long-standing, well-known named-pipe idiom), consistent with 46-RESEARCH.md Q4/A1's own description and risk rating (LOW — the only failure mode if this understanding were wrong is a dropped first-fast-arriving deep link on a narrow timing race, not a security defect). Recorded here rather than silently treated as independently re-verified; a live MS Learn re-fetch is recommended at the next opportunity a web tool is available, but is not blocking.

No authentication gates were hit (this plan is pure Rust/FFI and jest work with no external service).

## User Setup Required

None — no external service configuration required. All verification (`cargo check`/`cargo test`/`pnpm exec jest`) ran natively on the operator's Windows 11 machine.

## Next Phase Readiness

- REQ-46-04, REQ-46-07, and REQ-46-08 are implemented and source-gated. REQ-46-01/02/03 were already Complete (plan 46-02).
- Plan 46-04 can now proceed with `src-tauri/tauri.windows.conf.json`'s `plugins.deep-link.desktop.schemes` override removal and the `windowsDeepLinkSuppression.test.ts` Test A/E inversion (REQ-46-05), and the REQ-46-06 `register_all()` decision pin, per the plan's own dependency chain — both are independent of this plan's own additions and were explicitly out of scope here.
- The FFI itself (Windows accept loop behavior under a real second launch) remains live-gate-only (REQ-46-10, plan 46-05) — this plan's jest gates prove source shape, never that a real Windows process pair behaves correctly end-to-end.
- REQ-46-11's remaining closure items (the `windowsDeepLinkSuppression.test.ts`/`tauriShellSource.test.ts` header-prose rewrites, and closing the `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` todo + ledger row `U-34.5-18`) stay gated on REQ-46-10's live-gate PASS, per REQUIREMENTS.md's own explicit instruction — unchanged by this plan.
- No blockers for 46-04.

---
*Phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra*
*Completed: 2026-09-23*

## Self-Check: PASSED

- FOUND: `src-tauri/src/main.rs`
- FOUND: `src/backend/__tests__/tauriShellSource.test.ts`
- FOUND: `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-03-SUMMARY.md`
- FOUND: `fn run_windows_single_instance_accept_loop(` in `src-tauri/src/main.rs`
- FOUND: commit `0cd466572` (Task 1)
- FOUND: commit `628747ed5` (Task 2)
