---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 10
subsystem: infra
tags: [tauri, rust, sidecar, process-lifecycle, code-review-gap-closure]

# Dependency graph
requires:
  - phase: 34 (plans 27/28-derived Tauri shell + this phase's earlier waves)
    provides: src-tauri/src/main.rs sidecar spawn/lifecycle plumbing, the Wave-0
      config-shape jest convention (cargoFeatures.test.ts, tauriConf.test.ts)
provides:
  - use_dev_sidecar() gated on cfg!(debug_assertions) alone (no release-reachable
    env-var override into a system `node` process)
  - SidecarState.child (renamed from _child) with a shutdown_child() method that
    kills + reaps the sidecar on RunEvent::Exit, so quitting the app cannot leave
    an orphaned sidecar holding an authenticated Steam session
  - src/backend/__tests__/tauriShellSource.test.ts -- a fifth Wave-0-style
    source-shape suite (with a comment-stripping self-test) that automates WR-01
    and WR-03 against src-tauri/src/main.rs
affects: [34-11, release-tauri.yml matrix legs, the deferred live tag-push gate from 34-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rust source-shape jest assertions against a comment-stripped copy of the
      file, extending the Wave-0 config-shape convention beyond TOML/JSON to
      main.rs itself"
    - "Tauri .build(context) + .run(|app_handle, event| ...) split to hook
      RunEvent::Exit for explicit child-process teardown, instead of relying on
      in-app exit call sites or OS-dependent piped-stdio reaping"

key-files:
  created:
    - src/backend/__tests__/tauriShellSource.test.ts
  modified:
    - src-tauri/src/main.rs

key-decisions:
  - "Kept the WR-03 method literally named shutdown_child (per the plan's explicit
    Task 3 instruction and its own acceptance criteria requiring `fn shutdown_child`
    to be present), and instead narrowed the Task 1 test's over-broad blanket
    `_child` substring check to the specific stale field-declaration pattern
    (`_child: Mutex<Child>`) -- the plan's Task 1 and Task 3 acceptance criteria
    were mutually exclusive as literally written, since a method named
    shutdown_child necessarily contains the substring `_child`"
  - "Plain kill()+wait() on RunEvent::Exit, no graceful-shutdown RPC handshake --
    matches the plan's explicit scope boundary (the sidecar protocol has no
    shutdown frame today)"

patterns-established:
  - "Any future Tauri RunEvent hook should extend the same match arm rather than
    adding a second .run() call or a WindowEvent::CloseRequested handler that
    could interfere with close semantics"

requirements-completed: [REQ-34-03, REQ-34-08]

# Metrics
duration: ~25min
completed: 2026-07-24
---

# Phase 34 Plan 10: Sidecar exec-path hardening + exit-time teardown (WR-01/WR-03) Summary

**Closed WR-01 (release-reachable `GAMELIB_SIDECAR_ENTRY` → system `node` escape hatch) and WR-03 (orphaned sidecar surviving app quit) in `src-tauri/src/main.rs`, both automatically enforced by a new comment-stripped source-shape jest suite.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-24T07:07:00Z (approx.)
- **Completed:** 2026-07-24T07:32:23Z
- **Tasks:** 3
- **Files modified:** 2 (`src-tauri/src/main.rs`, `src/backend/__tests__/tauriShellSource.test.ts`)

## Accomplishments

- A release build of the Tauri shell can no longer be steered onto `Command::new("node")` via any environment variable — `use_dev_sidecar()` is now exactly `cfg!(debug_assertions)`. `resolve_sidecar_entry()`'s `GAMELIB_SIDECAR_ENTRY` override is preserved for dev use.
- Quitting the app (red X / Cmd+Q / Alt+F4, not just the in-app `app_exit`/`app_relaunch` commands) now explicitly kills and reaps the sidecar child process via a `RunEvent::Exit` handler, closing the window where an authenticated Steam session, open sockets, and file handles could survive an apparent quit.
- Both invariants are pinned by seven behavioral assertions plus a self-test proving the comment-stripping helper actually works (main.rs's own doc comments quote the strings under test, so an unfiltered match would have been self-satisfying).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a comment-stripped main.rs source-shape test suite (RED)** - `f66973e6` (test)
2. **Task 2: Gate the dev sidecar path to debug builds only (WR-01)** - `16a3ea25` (fix)
3. **Task 3: Terminate the sidecar child on app exit (WR-03)** - `cdb3c0b3` (feat)

_Note: Task 3's commit also includes a small follow-up fix to Task 1's test file (see Deviations) — both files needed the same commit to keep the suite green._

## Files Created/Modified

- `src/backend/__tests__/tauriShellSource.test.ts` - New Wave-0-style suite: a comment-stripping `loadMainRsCode()` helper (with a self-test), 3 WR-01 assertions, 4 WR-03 assertions.
- `src-tauri/src/main.rs` - `use_dev_sidecar()` reduced to `cfg!(debug_assertions)`; `SidecarState._child` renamed to `child`; new `SidecarState::shutdown_child()` (kill + wait, log-and-swallow on error); `main()`'s builder tail changed from `.run(context)` to `.build(context).run(|app_handle, event| ...)` to hook `RunEvent::Exit`.

## Decisions Made

- Kept the WR-03 method named `shutdown_child` (matching the plan's Task 3 text verbatim and its acceptance criteria requiring `grep -c 'fn shutdown_child'` to print `1`), rather than renaming to something like `shutdown_sidecar` to dodge the Task 1 test's blanket `_child` check. Fixing the test's assertion (see Deviations) was the more surgical resolution of the plan's internal contradiction.
- Used plain `kill()` + `wait()` with all errors logged and swallowed on the exit path, per the plan's explicit instruction not to build a graceful-shutdown RPC handshake (the sidecar protocol has no shutdown frame today, and adding one would expand scope beyond this finding).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's own Task 1 and Task 3 acceptance criteria were mutually exclusive**
- **Found during:** Task 3 (Terminate the sidecar child on app exit)
- **Issue:** Task 1's test #6 asserted the stripped source does NOT contain the substring `_child` (intended to catch the stale, unused-marked field name). Task 3's action text explicitly instructs adding a method named `fn shutdown_child(&self)`, and Task 3's own acceptance criteria requires `grep -c 'fn shutdown_child'` to print `1`. Since `"shutdown_child"` literally contains the substring `"_child"`, no implementation could satisfy both the Task 1 test as originally written and the Task 3 acceptance criteria simultaneously.
- **Fix:** Kept the method named `shutdown_child` (following Task 3's explicit, more specific instruction) and narrowed Task 1's test #6 to check for the actual stale pattern — the field declaration `_child: Mutex<Child>` — via a regex (`/_child\s*:\s*Mutex<Child>/`) instead of a blanket substring match. This preserves the test's real intent (catch the old unused-marker field name) without colliding with the legitimately-named method.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts` (test assertion), `src-tauri/src/main.rs` (no change beyond what Task 3 already specified)
- **Verification:** All 8 tests in `tauriShellSource.test.ts` pass; `grep -v '^\s*//' src-tauri/src/main.rs | grep -c 'fn shutdown_child'` prints `1`; `cargo build` exits 0.
- **Committed in:** `cdb3c0b3` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 — plan-internal contradiction)
**Impact on plan:** No scope creep. The fix only narrowed one test assertion's specificity to match its own documented intent; both WR-01 and WR-03 are fully closed and automatically enforced exactly as the plan's `<success_criteria>` describe.

## Issues Encountered

None beyond the deviation above.

## Verification Evidence

**RED state (Task 1, before any main.rs change):**
```
Test Suites: 1 failed, 1 total
Tests:       6 failed, 2 passed, 8 total
```
(2 pre-existing passes: the comment-stripping self-test, and the `resolve_sidecar_entry still honors GAMELIB_SIDECAR_ENTRY` check, which was already true pre-fix since `resolve_sidecar_entry()` was untouched by WR-01.)

**After Task 2 (WR-01 green):**
```
Tests:       4 failed, 4 passed, 8 total
```
All 3 WR-01 tests + the self-test now pass; the 4 WR-03 tests remain RED as designed.

**After Task 3 (WR-03 green) — final state:**
```
PASS Backend src/backend/__tests__/tauriShellSource.test.ts
PASS Meta meta/__tests__/buildSidecarSea.test.ts
PASS Backend src/backend/__tests__/releaseWorkflow.test.ts
PASS Backend src/backend/__tests__/tauriConf.test.ts
PASS Backend src/backend/__tests__/cargoFeatures.test.ts

Test Suites: 5 passed, 5 total
Tests:       65 passed, 65 total
```

**Grep acceptance criteria (final):**
```
grep -v '^\s*//' src-tauri/src/main.rs | grep -c 'GAMELIB_SIDECAR_ENTRY'   -> 1
grep -v '^\s*//' src-tauri/src/main.rs | grep -c 'is_ok() ||'             -> 0
grep -v '^\s*//' src-tauri/src/main.rs | grep -c 'RunEvent::Exit'         -> 1
grep -v '^\s*//' src-tauri/src/main.rs | grep -c 'fn shutdown_child'      -> 1
```

**cargo build:** exits 0 (final rebuild, ~20s warm, no new warnings).

**git diff src-tauri/Cargo.toml package.json:** empty (no crates/npm packages added, per T-34-SC).

**Additive/reversible invariant:** `git diff --stat` for this plan's work is confined to `src-tauri/src/main.rs` and `src/backend/__tests__/tauriShellSource.test.ts` — no Electron-side file touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-01 and WR-03 are closed. Remaining gap-closure work for this phase: **34-11** (WR-02 `cert.pfx` left on disk, and wiring `GAMELIB_SIDECAR_TARGET_TRIPLE` per matrix leg in `.github/workflows/release-tauri.yml` so 34-08's cross-arch fix takes effect in CI).
- The deferred live tag-push gate (REQ-34-04/REQ-34-09, recorded in `34-07-SUMMARY.md`) is still pending user execution and is unaffected by this plan's changes.
- No blockers for 34-11.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*
