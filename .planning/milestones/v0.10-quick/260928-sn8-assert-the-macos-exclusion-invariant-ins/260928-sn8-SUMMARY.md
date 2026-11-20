---
phase: 260928-sn8
plan: 01
subsystem: testing
tags: [rust, cargo-test, wry, tauri, cfg-gating, regression-pin, macos]

# Dependency graph
requires: []
provides:
  - "F-34.4.2-12 regression pin (`f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`) asserts the macOS-exclusion PROPERTY of each `.cookies()` call site's cfg guard, not equality against one hard-coded spelling"
  - "`guard_excludes_macos(Option<&str>) -> bool` predicate, self-tested by a seven-case fixture table, admitting both live guard spellings (`not(target_os = \"macos\")` and `all(not(target_os = \"macos\"), not(windows))`)"
  - "Rust suite green at 289 passed / 0 failed / 2 ignored -- the permanently-red suite is ended"
affects: [humble-login, cookie-clear, tauri-shell-tests]

# Actuals (#2632)
actuals:
  tokens: 3814
  tasks: 3
  commits: 2
plan_head_before: ad8ea0e8242dfd8d0a029f2568b771105a5d38cb

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Property-asserting matcher (accept-set predicate + self-tested fixture table) replacing exact-string equality assertion, for source-scanning regression pins in `#[cfg(test)] mod tests` inside main.rs"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs

key-decisions:
  - "Re-derived the exact (arm, guard) census from fresh measurement rather than widening it -- sanctioned by the pin's own comment, and safe because the new per-site `assert!` runs ahead of the census inside the same scan loop"
  - "Bound the diverging `humble_login_clear_cookies` (main.rs:7705) guard to its own named variable `guard_ok_not_windows` rather than cloning the shared `guard_ok_broad`, so the census vec visibly distinguishes the deliberately-narrower site"
  - "Negative-control mutation chosen as `#[cfg(all(target_os = \"macos\", windows))]` -- false on every target, so the crate still compiles and only the 'guard present but not recognisably macOS-excluding' rejection class is exercised; the missing-guard and `any(`-disjunction classes are covered by the permanent fixture table instead, since mutating to those shapes breaks the macOS compile before the test can run"
  - "Flattened fixture-table reason strings to single physical lines instead of `\\`-continued literals, preserving this file's existing concat!-not-backslash-continuation convention rather than relying on the newer `joinContinuedLogicalLines` fix in `rustQuoteBalance.ts` to keep a continued literal from misreading"

patterns-established: []

requirements-completed:
  - REQ-34.4.1-13
  - REQ-34.4.1-06

coverage:
  - id: D1
    description: "Regression pin asserts the macOS-exclusion property (guard present, contains `not(target_os = \"macos\")`, no `any(`) rather than equality against one cfg spelling"
    requirement: "REQ-34.4.1-13"
    verification:
      - kind: unit
        ref: "src-tauri/src/main.rs#tests::f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated"
        status: pass
    human_judgment: false
  - id: D2
    description: "guard_excludes_macos matcher proven to discriminate via a seven-case in-test fixture table (both accepted spellings, no guard, macos-only guard, windows-only guard, any( disjunction, and the deliberately-rejected safe spelling)"
    requirement: "REQ-34.4.1-06"
    verification:
      - kind: unit
        ref: "src-tauri/src/main.rs#tests::f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated (fixture_cases loop)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pin observed RED against a live macOS-reachable guard mutation at main.rs:7692, and GREEN again after a byte-for-byte restore; full suite ends at 289 passed / 0 failed / 2 ignored"
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell (full suite, post-restore): test result: ok. 289 passed; 0 failed; 2 ignored"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-09-28
status: complete
---

# Phase 260928-sn8 Plan 01: Assert the macOS-exclusion invariant instead of one cfg spelling Summary

**Rewrote the F-34.4.2-12 regression pin to assert a property (guard excludes macOS) instead of string equality against one cfg spelling, ending a permanently-red Rust suite -- now 289 passed / 0 failed / 2 ignored.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-28T20:49:05+13:00 (plan committed at `ad8ea0e82`)
- **Completed:** 2026-09-28T20:58:07+13:00
- **Tasks:** 3
- **Files modified:** 1 (`src-tauri/src/main.rs`)

## Accomplishments

- Added `guard_excludes_macos(Option<&str>) -> bool`: accepts a guard containing `not(target_os = "macos")` and not containing `any(`; rejects `None` (unconditional call site).
- Replaced the per-site `assert_eq!` (exact-string comparison) with `assert!(guard_excludes_macos(...))`, rebuilding the failure message via `concat!` to print the guard actually found and to state the property, rather than naming one required spelling.
- Re-derived the exact `(arm, guard)` census to carry both live guard spellings, with the deliberately-narrower `humble_login_clear_cookies` deletion-branch site (`main.rs:7705`) bound to its own named variable (`guard_ok_not_windows`) rather than hidden behind a shared binding.
- Added a seven-case fixture table directly after `guard_excludes_macos`, permanently pinning its verdict on both accepted guard spellings, an unconditional call, the original macOS-only RED shape, a windows-only guard, an `any(` disjunction, and the deliberately-rejected-but-safe `not(any(target_os = "macos", windows))` spelling.
- Ran a live negative control: mutated `main.rs:7692`'s guard to `#[cfg(all(target_os = "macos", windows))]`, observed the pin fail with the expected message and line number, then restored it byte-for-byte (verified via a `head -11609` diff against HEAD).
- Full suite confirmed at exactly `289 passed; 0 failed; 2 ignored` -- the case total (291) unchanged, and the single prior failure (this pin) now green.

## Task Commits

1. **Task 1: Assert the macOS-exclusion property, not one cfg spelling** - `466a7661c` (fix)
2. **Task 2: Prove the matcher still detects -- fixture table plus a live RED** - `908457043` (test)
3. **Task 3: Full-suite gate at 289/0/2** - verification only, no source change; no additional commit (Task 3's action is running gates and writing this SUMMARY)

**Plan metadata:** committed separately by the orchestrator (per its instructions, this executor did not commit STATE.md/SUMMARY.md).

## Files Created/Modified

- `src-tauri/src/main.rs` - Rewrote the F-34.4.2-12 regression pin's per-site assertion, failure messages, and census inside `#[cfg(test)] mod tests`; added `guard_excludes_macos` and its fixture table. No line above `mod tests` (11610) is changed -- lines 1..11609 are byte-identical to `HEAD` at every checkpoint, confirmed by three separate `diff` gates (post-Task-1, post-restore in Task 2, and again in Task 3).

## Decisions Made

- **Census re-derivation, not widening.** `1a8e1827b` narrowed the Linux arm's guard on purpose (Windows routed to WebView2 directly because wry's `delete_cookie` is broken there -- cookie-0.18's `domain()` drops the leading dot). The pin's own comment already prescribes re-deriving the census from fresh measurement when an arm is genuinely restructured, and this is exactly that case. Safety is preserved because the per-site `assert!` runs first, inside the same scan loop, before the census ever sees the sites -- a genuinely macOS-reachable guard would be caught there, with its own line number, before reaching the 40-lines-later census comparison.
- **Visibly distinct diverging guard binding.** The orchestrator's added requirement: rather than four census entries sharing one `guard_ok` binding (as before), the diverging `humble_login_clear_cookies` site at `main.rs:7705` now binds its own `guard_ok_not_windows`, with a comment naming `1a8e1827b` and the Windows/`cookie-0.18` reason directly above it -- a reader scanning the vec literal sees at a glance that one site is guarded differently.
- **Negative-control mutation choice.** `#[cfg(all(target_os = "macos", windows))]` was chosen because it is false on every target (no target is both macOS and Windows), so the guarded block stays excluded on macOS and the crate still compiles here. Deleting the attribute or using `any(target_os = "macos", windows)` would have made the Linux arm active on macOS alongside the already-active macOS arm -- two tail expressions in one block, a compile error, and a negative control that measures nothing (`cargo check` would fail before the test ever ran).
- **Backslash-continuation avoided in fixture reason strings.** The file's own documented convention (comment at the top of the per-site assertion) is `concat!` of complete literals, never `\`-continued ones, because `longRunningChannels.test.ts`'s WR-08 guard historically could not tell a continued literal from a truncated one. `src/backend/testUtils/rustQuoteBalance.ts` shows this premise was later fixed structurally (via `joinContinuedLogicalLines`), but rather than rely on that fix silently, the seven fixture-table reason strings were kept as single physical lines to stay consistent with the convention this file's own comments still state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/stale documentation] Corrected two comments left describing the old exact-string invariant**
- **Found during:** Task 1
- **Issue:** The backward-walk comment (originally: "must be immediately ... gated behind exactly `#[cfg(not(target_os = \"macos\"))]`") and the `found_split_line_shape` assertion's cross-reference ("see the comment above the first `assert_eq!`") both still described or pointed at the pre-rewrite exact-string assertion, which no longer exists as an `assert_eq!` at that position.
- **Fix:** Updated the backward-walk comment to point at `guard_excludes_macos` for the exact property, and updated the cross-reference to say "first `assert!`" instead of "first `assert_eq!`".
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** `cargo check` clean; targeted test still `1 passed`; byte-diff gate confirms these are the only comment changes in that region (both fall below `mod tests` at line 11610, so out of the byte-identical-to-HEAD scope entirely -- irrelevant to the production-untouched invariant).
- **Committed in:** `466a7661c` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - stale documentation left behind by the property rewrite)
**Impact on plan:** No scope creep -- both corrections are inside the same test the plan already rewrote, and are necessary so the surviving comments do not mislead a future reader about which assertion form is now load-bearing.

## Issues Encountered

None.

## Negative Control Evidence (verbatim)

Mutation applied to `main.rs:7692`: `#[cfg(all(target_os = "macos", windows))]` (temporary; restored byte-for-byte immediately after).

`cargo check --bin gamelib-shell` under the mutation: clean (confirms the mutation is false on every target and does not change what compiles on this machine).

`cargo test --bin gamelib-shell f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` under the mutation -- panic message, verbatim:

```
thread 'tests::f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated' (18675211) panicked at src/main.rs:14448:13:
F-34.4.2-12 regression: `humble_login_clear_cookies` has a wry `.cookies()` call at main.rs line 7705 (`.cookies()`) whose guard does not provably exclude macOS (guard found: #[cfg(all(target_os = "macos", windows))]). This getter blocks the calling closure inside a reentrant NSRunLoop pump that can self-deadlock against tao's EventLoopHandler mutex on macOS -- live-reproduced 2/2, see `.planning/debug/resolved/humble-disconnect-main-wedge.md`. The guard must contain `not(target_os = "macos")` and must NOT contain `any(`. This matcher is deliberately conservative and rejects some semantically-safe spellings on purpose (e.g. `#[cfg(not(any(target_os = "macos", windows)))]`) -- see `guard_excludes_macos`, above. Admitting such a spelling requires a deliberate, reviewed edit to that predicate and its fixture table -- never loosen this rule just to make the test pass.
```

Result line, verbatim: `test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 290 filtered out; finished in 0.01s`

After restoring `main.rs:7692` byte-for-byte: `head -11609` diff against `HEAD` is empty, and `cargo test --bin gamelib-shell f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` reports `test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 290 filtered out; finished in 0.01s`.

**Rejection classes this source mutation could and could not exercise:** the mutation exercises only the "guard present but not recognisably macOS-excluding" rejection class. The missing-guard and `any(`-disjunction classes are unreachable by source mutation here: deleting the `#[cfg(...)]` attribute or writing `any(target_os = "macos", windows)` both make the Linux arm active on macOS alongside the already-active macOS arm, producing two tail expressions in one block -- `cargo check` fails and the pin never runs, so a mutation of either shape would prove nothing. Those two classes are covered instead by the permanent seven-case fixture table added in Task 2 (cases: `None` rejected, and `#[cfg(any(target_os = "macos", windows))]` rejected).

## Before/After Suite Numbers

- **Before** (measured independently during quick task `260928-qvr`, and unchanged since -- this plan added no `.cookies()` call site and no other test): 288 passed / 1 failed / 2 ignored, 291 cases total. The single failure was this pin.
- **After:** `289 passed; 0 failed; 2 ignored`, 291 cases total (measured directly, `cargo test --bin gamelib-shell`, full output tail: `test result: ok. 289 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.06s`).

## Formatter Verdicts (CLAUDE.md, measured with prettier 3.7.4)

- `npx prettier --file-info src-tauri/src/main.rs` -> `{"ignored":false,"inferredParser":null}`. Prettier sees the path but has no Rust parser (`inferredParser: null`), so `--check` would match zero files and print a green that proves nothing. **Not run**, deliberately.
- `npx prettier --file-info .planning/quick/260928-sn8-assert-the-macos-exclusion-invariant-ins/260928-sn8-PLAN.md` -> `{"ignored":true,"inferredParser":null}`. `.planning/` is prettier-ignored. **Not run**, deliberately. Neither probe was scoped to bare `.`.

## Verification Gates Run (all passing)

1. `cargo check --bin gamelib-shell` -- clean, at every checkpoint (post-Task-1, post-fixture-table, post-mutation, post-restore, and finally in Task 3).
2. `cargo test --bin gamelib-shell f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` -- `test result: ok. 1 passed; 0 failed; 0 ignored` at every green checkpoint; `test result: FAILED. 0 passed; 1 failed` under the deliberate mutation.
3. `cargo test --bin gamelib-shell` (full suite) -- `test result: ok. 289 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out`.
4. Byte-level scope gate: `git show HEAD:src-tauri/src/main.rs`, `head -11609` both sides, `diff` -- empty at every checkpoint, proving lines 1..11609 (everything above `#[cfg(test)] mod tests`) are byte-identical to `HEAD`, including the guard at `:7692`, the `.cookies()` call at `:7705`, and the Windows/WebView2 and Linux/webkitgtk arms.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Rust suite is fully green (289/0/2); no outstanding red tests block further work on this subsystem.
- The pin now correctly tracks the macOS-exclusion invariant rather than one cfg spelling, so a future author narrowing or renaming the Linux/webkitgtk guard again will not need to touch this test unless the change genuinely stops excluding macOS.
- No blockers or concerns for follow-on work.

---
*Phase: 260928-sn8*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: `src-tauri/src/main.rs`
- FOUND: `.planning/quick/260928-sn8-assert-the-macos-exclusion-invariant-ins/260928-sn8-SUMMARY.md`
- FOUND commit: `466a7661c`
- FOUND commit: `908457043`
