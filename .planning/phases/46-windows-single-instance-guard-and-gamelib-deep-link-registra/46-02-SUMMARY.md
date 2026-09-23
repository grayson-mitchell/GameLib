---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 02
subsystem: infra
tags: [rust, tauri, windows, single-instance, named-pipe, mutex, windows-sys, ffi]

# Dependency graph
requires: ["46-01"]
provides:
  - "A compiling Windows single-instance guard wired into main() before tauri::Builder::default(): CreateMutexW decision, CreateNamedPipeW first-instance creation with a strict per-user SDDL descriptor, authenticated secondary-side delivery, unconditional exit(0)"
  - "windows-sys 0.60 declared under [target.'cfg(windows)'.dependencies] with a 6-feature list (no new crate name in Cargo.lock)"
  - "#[cfg(windows)] WindowsPrimaryPipe / WindowsSingleInstanceRole / current_user_identity / create_single_instance_pipe_instance / acquire_single_instance_windows / deliver_to_running_instance_windows, all consumed by plan 46-03's accept loop"
affects: [46-03, 46-04, 46-05]

# Tech tracking
tech-stack:
  added:
    - "windows-sys 0.60.2 (target.'cfg(windows)'.dependencies only; already resolved transitively via arboard/keyring/rfd/shared_child/tauri-plugin-updater -- no new crate name enters Cargo.lock)"
  patterns:
    - "Windows FFI functions are #[cfg(windows)]-only and untested at the unit level, mirroring acquire_single_instance's own precedent -- exercised by the live gate (REQ-46-10, plan 46-05), not cargo test"
    - "A local closure (read_owner_sid) defined INSIDE deliver_to_running_instance_windows's own body, not a separate helper function, so the raw GetSecurityInfo/OWNER_SECURITY_INFORMATION tokens the source gate greps for stay inside that function's own comment-stripped body while still avoiding duplicating the unsafe block across the two call sites (initial open, READ_CONTROL re-open)"
    - "#[allow(dead_code)] on WindowsPrimaryPipe's three fields (first_instance/pipe_name/sddl), each carrying an inline comment naming plan 46-03 as the consumer -- keeps cargo check warning-free across a two-plan wiring split without pretending the fields are read yet"

key-files:
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/main.rs

key-decisions:
  - "Dropped Win32_System_Memory from the feature list RESEARCH's Standard Stack proposed. Grepping the vendored windows-sys-0.60.2 source directly (per this task's own read_first instruction) showed LocalFree/HLOCAL are declared inside Win32/Foundation/mod.rs, gated by Win32_Foundation alone -- Win32_System_Memory gates a different module (VirtualAlloc and friends) that nothing here calls. Documented inline in Cargo.toml rather than carried in silently as unused weight."
  - "create_single_instance_pipe_instance uses PIPE_ACCESS_INBOUND, not RESEARCH's sketched PIPE_ACCESS_DUPLEX -- the primary only ever reads a payload off this pipe, so inbound-only is least privilege. Recorded in the plan's own <action> as an expected deviation, not a surprise."
  - "OWNER_SECURITY_INFORMATION resolves under windows_sys::Win32::Security, not Win32::Security::Authorization where RESEARCH's Code Examples sketch implied it might sit alongside GetSecurityInfo -- caught by cargo check's E0432 on the first build attempt and fixed by moving the import, confirmed against the vendored source (Win32/Security/mod.rs:496)."
  - "Rewrote the current_user_identity Decision-point-(b) doc-comment sentence so the literal substring \"Decision point (b), operator-overridable:\" (colon immediately after \"overridable\") appears verbatim -- the plan's own acceptance grep requires that exact string, but a parenthetical aside between \"overridable\" and the colon (the phrasing windows_pipe_sddl's 46-01 doc comment already uses) does not literally contain it. Restructured to put the colon first and the REQUIREMENTS.md citation second."
  - "Rewrote one clause of the main() preamble comment from `tauri::Builder::default()` (backticked, literal) to \"the Tauri builder\" (prose) -- the plan's own guard-precedes-Builder ordering check is a naive line-scan awk one-liner that exits on the FIRST literal occurrence of the string `tauri::Builder::default()` inside fn main(); the pre-existing (pre-Phase-46) preamble comment already contained that exact literal substring near the top of the function, above where either guard's actual function call executes, which meant the ordering check would find \"builder\" before ever reaching \"guard\" and fail even though the code itself is correctly ordered. Fixed by removing the one literal occurrence from prose; the actual `tauri::Builder::default()` call site at the bottom of the block is untouched."

requirements-completed: [REQ-46-01, REQ-46-02, REQ-46-03]
requirements-partial: [REQ-46-11]

# Metrics
duration: ~45min
completed: 2026-09-23
---

# Phase 46 Plan 02: Windows single-instance guard FFI + main() wiring Summary

**Added the `#[cfg(windows)]` FFI half of the single-instance guard (token-SID/session lookup, `CreateMutexW` primary/secondary decision, `CreateNamedPipeW` first-instance creation with a strict per-user SDDL descriptor, and authenticated secondary-side pipe delivery) and wired it into `main()` directly before `tauri::Builder::default()`, so a second Windows launch now exits before the sidecar can ever spawn.**

## Performance

- **Duration:** ~45 min (first read to last commit)
- **Started:** 2026-09-23T10:51:50Z (session start per STATE.md)
- **Completed:** 2026-09-23T11:06:46Z (last commit)
- **Tasks:** 2 completed
- **Files modified:** 3 (Cargo.toml, Cargo.lock, main.rs)

## Accomplishments

- `windows-sys 0.60.2` is declared under a new `[target.'cfg(windows)'.dependencies]` table with 6 features (`Win32_Foundation`, `Win32_System_Threading`, `Win32_System_Pipes`, `Win32_Storage_FileSystem`, `Win32_Security`, `Win32_Security_Authorization`), each commented with the specific symbols it resolves. No new crate NAME enters `Cargo.lock` — `cargoFeatures.test.ts`'s crate-name pin stays unchanged (verified: `git diff src-tauri/Cargo.lock` shows exactly one added line, `"windows-sys 0.60.2"`, inside `gamelib-shell`'s own dependency list).
- `cargo tree -i windows-sys@0.60.2 --target x86_64-pc-windows-msvc` confirms 0.60.2 was already resolved transitively via `arboard`, `keyring`, `rfd`, `shared_child`, and `tauri-plugin-updater` — no new major-version bucket entered the tree.
- Six new `#[cfg(windows)]` items exist and compile: `WindowsPrimaryPipe`, `WindowsSingleInstanceRole`, `current_user_identity`, `create_single_instance_pipe_instance`, `acquire_single_instance_windows`, `deliver_to_running_instance_windows`.
- `main()` now derives the current process's token SID/session, decides primary/secondary via the mutex, and — on the Windows `Secondary` path — sends the validated deep-link URL or the `__GAMELIB_FOCUS__` sentinel over the pipe (best-effort, authenticated) and unconditionally calls `std::process::exit(0)` before `tauri::Builder::default()` is ever reached. Confirmed by source-order assertion: `acquire_single_instance_windows(` appears before `tauri::Builder::default()` in `main()`.
- Every Windows guard failure path (SID lookup, mutex creation, pipe creation, SDDL conversion, pipe connect) degrades to `PrimaryWithoutListener`/`None` and a `WARN` log — never aborts startup (T-34.5-G6-24).
- The Unix guard is byte-identical to the pre-phase baseline: the Unix-region diff gate (`46-unix-cfg-regions.awk` against commit `5bc4fa825`) is empty after both tasks.
- The guard-section banner, the retired D-44-A "Windows keeps TODAY's behaviour" comment, and the `main()` preamble comment no longer claim Windows has no guard (REQ-46-11 partial — the `windowsDeepLinkSuppression.test.ts`/`tauriShellSource.test.ts` header-prose half and the todo/ledger-row closure are plan 46-03/46-05's responsibility, not this plan's).
- `current_user_identity` reads `TokenUser` only (decision point (b) default, per-user DACL) and its doc comment carries the literal, grep-pinned string `Decision point (b), operator-overridable:` pointing at `windows_pipe_sddl`'s full override recipe.
- `cargo check --bin gamelib-shell` and `cargo test --bin gamelib-shell` (234 passed, 0 failed, 2 ignored) are clean after both tasks, with zero new warnings beyond the pre-existing 10-warning baseline (confirmed identical warning set to the pre-Phase-46 baseline recorded in 46-RESEARCH.md Q10 — `login_cancel_strip_script`, `login_origin_banner_script`, `login_origin_banner_update_script`, `single_instance_dir`, `single_instance_socket_path`, `wake_lock_reason`, `website_data_record_matches_domain`, unused `Read` import, unused `nav_sentinel_label`, unused `single_instance_socket_path_var`).
- `pnpm exec jest src/backend/__tests__/cargoFeatures.test.ts src/backend/__tests__/tauriShellSource.test.ts`: 158 passed, 158 total, no regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add windows-sys and the #[cfg(windows)] identity, mutex and pipe-instance functions** - `ccfb3c46f` (feat)
2. **Task 2: Secondary-side authenticated delivery and the main() wiring before Builder::default()** - `71599015b` (feat)

## Files Created/Modified

- `src-tauri/Cargo.toml` — new `[target.'cfg(windows)'.dependencies]` table (`windows-sys = { version = "0.60", features = [...] }`), commented in the same style as the existing `[target.'cfg(unix)'.dependencies]` table
- `src-tauri/Cargo.lock` — one line added (`"windows-sys 0.60.2"`) inside `gamelib-shell`'s own `dependencies` array; no other package's `version =` line changed
- `src-tauri/src/main.rs` — guard-section banner and D-44-A accepted-gap comment rewritten; six new `#[cfg(windows)]` items (struct/enum/4 functions) added directly after `acquire_single_instance`; `main()`'s preamble comment rewritten; a new `#[cfg(windows)] let primary_listener: Option<WindowsPrimaryPipe> = ...` block added between the existing `#[cfg(unix)]` block and `tauri::Builder::default()`; the `#[cfg(not(unix))]` fallback for `primary_listener` became `#[cfg(not(any(unix, windows)))]`; `.setup()`'s placeholder `let _ = &primary_listener;` split into a `#[cfg(windows)]` arm (with a comment pointing at plan 46-03) and the renamed `#[cfg(not(any(unix, windows)))]` arm

## Decisions Made

See `key-decisions` in the frontmatter above for the five decisions made during this plan (feature-list correction, `PIPE_ACCESS_INBOUND` deviation, `OWNER_SECURITY_INFORMATION` module-path correction, the decision-point-(b) grep-string fix, and the `main()` preamble literal-string fix). The two grep-string fixes are Rule 3 (blocking) corrections — this plan's own acceptance criteria are literal `grep`/`awk` one-liners, and two of the doc-comment/preamble-comment drafts I wrote initially satisfied the *intent* of their acceptance criteria but not the *exact literal string* the criteria's own grep pattern requires. Both were caught by running the plan's own acceptance checks before committing, not discovered later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `OWNER_SECURITY_INFORMATION` is not in `Win32::Security::Authorization`**
- **Found during:** Task 2, first `cargo check` after adding `deliver_to_running_instance_windows`
- **Issue:** `E0432: unresolved import` — I had grouped `OWNER_SECURITY_INFORMATION` with `ConvertSidToStringSidW`/`GetSecurityInfo`/`SE_KERNEL_OBJECT` under a single `use windows_sys::Win32::Security::Authorization::{...}`, but the constant actually lives in `windows_sys::Win32::Security` (confirmed by grepping the vendored `windows-sys-0.60.2` source directly: `Win32/Security/mod.rs:496`).
- **Fix:** Split the import into two `use` statements, one per actual module.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** `cargo check --bin gamelib-shell` went from 1 error to 0 errors.
- **Committed in:** `71599015b` (the error was fixed before the first commit attempt for Task 2, so no separate correction commit was needed)

**2. [Rule 3 - Blocking] `WindowsPrimaryPipe.first_instance` triggered a new dead-code warning after Task 2's wiring**
- **Found during:** Task 2, re-running `cargo check` after wiring `primary_listener` into `main()`
- **Issue:** Task 2's own acceptance criteria requires "no warning naming any function, type or binding added in 46-01 or 46-02." Once `main()` constructed a real `WindowsPrimaryPipe` (via the `Primary(pipe) => Some(pipe)` arm) and then only borrowed it via `let _ = &primary_listener;` (the plan's own placeholder, pending plan 46-03's accept loop), the compiler flagged `first_instance` as "never read" — `pipe_name`/`sddl` already carried `#[allow(dead_code)]` from Task 1, but `first_instance` did not.
- **Fix:** Added the identical `#[allow(dead_code)] // consumed by plan 46-03's accept loop, not this plan` annotation to `first_instance`, matching its two sibling fields exactly.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** `cargo check --bin gamelib-shell` warning count dropped from 11 to 10, matching the pre-Phase-46 baseline exactly.
- **Committed in:** `71599015b`

**3. [Rule 3 - Blocking] Decision-point-(b) grep string did not literally match my first doc-comment draft**
- **Found during:** Task 1, running the task's own acceptance-criteria grep
- **Issue:** `grep -n "Decision point (b), operator-overridable:"` requires the literal substring with a colon immediately after "overridable". My first draft (matching 46-01's own `windows_pipe_sddl` phrasing style) wrote "operator-overridable (REQUIREMENTS.md ...)：" with a parenthetical between the word and the colon — which does not contain the required literal substring, and neither does 46-01's own already-committed text on `windows_pipe_sddl` (confirmed: that pre-existing line also fails a literal match of this exact string).
- **Fix:** Restructured the sentence in `current_user_identity`'s doc comment to put the colon immediately after "operator-overridable", moving the `REQUIREMENTS.md`/`windows_pipe_sddl` citation after it.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** `grep -n "Decision point (b), operator-overridable:" src-tauri/src/main.rs` now finds the new line inside `current_user_identity`'s doc comment.
- **Committed in:** `ccfb3c46f`

**4. [Rule 3 - Blocking] The pre-existing `main()` preamble comment defeated the plan's own guard-precedes-Builder ordering check**
- **Found during:** Task 2, running the task's own acceptance-criteria awk one-liner
- **Issue:** The check scans `fn main()` line by line and exits at the FIRST literal occurrence of `tauri::Builder::default()`, printing "guard" only if `acquire_single_instance_windows(` is seen first. The pre-existing (pre-Phase-46) preamble comment — inherited unchanged from Phase 34.5 gap cycle 6 — already contained the literal backticked string `` `tauri::Builder::default()` `` in its second line, far above where either guard's actual function call executes. This made the check exit on the comment before ever reaching the real code, regardless of how correctly the code itself was ordered.
- **Fix:** Reworded that one clause from the backticked literal to plain prose ("before the Tauri builder is constructed"), preserving the sentence's meaning while removing the collision. The actual `tauri::Builder::default()` call site later in the function is untouched.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** The plan's own awk check now prints `guard <line>` before `builder <line>`.
- **Committed in:** `71599015b`

---

**Total deviations:** 4 auto-fixed (all Rule 3 — blocking corrections needed to satisfy this plan's own literal grep/awk acceptance criteria or to keep `cargo check` warning-free; none changed the guard's actual runtime behavior).
**Impact on plan:** None of the four affected behavior — three were doc-comment/prose text corrections to satisfy literal string-matching acceptance checks, and one was an import module-path fix caught immediately by the compiler. No scope creep.

## Issues Encountered

None beyond the deviations above. No authentication gates were hit (this plan is pure Rust/FFI work with no external service).

## User Setup Required

None — no external service configuration required. This plan's own verification (`cargo check`/`cargo test`/`jest`) ran natively on the operator's Windows 11 machine, so no cross-compilation or emulation was needed.

## Next Phase Readiness

- Plan 46-03 can now spawn the Windows accept-loop thread inside `.setup()`, consuming `WindowsPrimaryPipe.first_instance`/`pipe_name`/`sddl` (currently `#[allow(dead_code)]`-suppressed, exactly as the plan's own interface section anticipated) and removing the `#[cfg(windows)] let _ = &primary_listener;` placeholder this plan added.
- `windows_pipe_connect_should_retry`, `windows_pipe_owner_matches`, `single_instance_payload`, and all of plan 46-01's pure helpers are now consumed by real call sites in addition to their unit tests — no dead code remains among 46-01's helpers on the Windows FFI path.
- REQ-46-01/02/03 are implemented in code; live-gate proof (REQ-46-10) is plan 46-05's responsibility, unchanged.
- REQ-46-11 is partially closed: the `main.rs` comment record now matches reality. The `windowsDeepLinkSuppression.test.ts`/`tauriShellSource.test.ts` header-prose rewrites, and closing the `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` todo + ledger row `U-34.5-18`, remain gated on REQ-46-10's live-gate PASS (plan 46-05), per REQUIREMENTS.md's own explicit instruction.
- No blockers for 46-03.

---
*Phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra*
*Completed: 2026-09-23*

## Self-Check: PASSED

- FOUND: `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-02-SUMMARY.md`
- FOUND: commit `ccfb3c46f` (Task 1)
- FOUND: commit `71599015b` (Task 2)
- FOUND: `[target.'cfg(windows)'.dependencies]` table in `src-tauri/Cargo.toml`
- FOUND: `fn deliver_to_running_instance_windows` in `src-tauri/src/main.rs`
