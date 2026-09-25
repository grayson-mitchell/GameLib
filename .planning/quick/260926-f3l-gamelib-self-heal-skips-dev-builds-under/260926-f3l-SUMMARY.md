---
phase: quick-260926-f3l
plan: 01
subsystem: infra
tags: [rust, tauri, windows-registry, self-heal, dev-tooling]

# Dependency graph
requires:
  - phase: quick-260925-uok
    provides: repair_windows_gamelib_protocol_registration and its pure DECISION-block helpers
provides:
  - "gamelib_protocol_dev_build_dirs and gamelib_protocol_exe_is_dev_build: pure, unit-tested predicate for whether the running exe is a dev build of this repo's own cargo target dir"
  - "The dev-build skip wired into repair_windows_gamelib_protocol_registration, before any registry call"
  - "Gate 5 source gate (+ two RED-proof self-tests) pinning the skip's ordering and log discipline"
  - "Live Windows proof that pnpm tauri:dev no longer rewrites HKCU\\Software\\Classes\\gamelib\\shell\\open\\command"
affects: [windows-single-instance-guard, gamelib-deep-link-registration, tauri-dev-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deny-list exactly this build's own cargo target dir (env!(\"CARGO_MANIFEST_DIR\") + option_env!(\"CARGO_TARGET_DIR\")), baked at compile time, rather than an allow-list of the (non-fixed) install root or cfg!(debug_assertions) (too broad -- the debug NSIS install must still self-heal)"
    - "Filesystem-free, ordinal ASCII ignore-case path-prefix comparison with a separator-boundary check, matching the existing gamelib_protocol_paths_equivalent convention"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md

key-decisions:
  - "Chosen predicate: deny-list this build's own cargo target dir, not cfg!(debug_assertions) (rejected: the debug NSIS installer build must still self-heal) and not an allow-list of the install root (rejected: the NSIS install directory is not fixed)"
  - "Skip logs via eprintln!, not shell_diag, so a dev launch does not append to gamelib-shell.log on every run"
  - "Every doubt (empty exe, empty/blank build_dirs, boundary lookalikes like target-other) routes to REPAIR, never to skip -- a false skip would silently stop an installed app self-healing"

patterns-established:
  - "A second decision (dev-build skip) can be bolted onto an existing pure/FFI-split repair without touching the FFI tier's I/O, by inserting the check between current_exe() resolution and the first registry call"

requirements-completed: [TODO-2026-09-26-gamelib-self-heal-dev-builds]

# Metrics
duration: 28min
completed: 2026-09-26
---

# Quick Task 260926-f3l: Dev builds skip the gamelib:// HKCU self-heal Summary

**A pure, unit-tested predicate now stops `pnpm tauri:dev` from hijacking `HKCU\Software\Classes\gamelib` away from the installed GameLib app, and a live Windows run proved HKCU is unchanged across a full dev session.**

## Performance

- **Duration:** ~28 min
- **Completed:** 2026-09-26
- **Tasks:** 3/3 completed
- **Files modified:** 3

## Accomplishments

- Added `gamelib_protocol_dev_build_dirs` and `gamelib_protocol_exe_is_dev_build` to the existing uok DECISION block in `src-tauri/src/main.rs` (now eight pure, unit-tested helpers instead of six), and wired the skip into `repair_windows_gamelib_protocol_registration` before any registry call.
- Added Gate 5 (+ two RED-proof self-tests) to the existing `quick-260925-uok` source-gate describe in `tauriShellSource.test.ts`, pinning that the skip runs after the `CI=e2e` guard and before the first `RegOpenKeyExW`, and that it logs via `eprintln!` not `shell_diag`.
- Ran a live Windows `pnpm tauri:dev` session end-to-end and proved, byte-for-byte, that HKCU is untouched: the skip line fired exactly once, no repair line was logged, and a post-run `reg query` matched the pre-state exactly. Because the pre-state happened to already name the installed exe (not the hijacked `target\debug` value recorded at planning time), this live run proves the todo's verify step 1 in full, not merely the weaker "unchanged from an already-hijacked value" fallback anticipated in the plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure dev-build predicate + unit tests, wired into the repair fn** - `28ff2c3e8` (feat)
2. **Task 2: Gate 5 in the uok source-gate describe (+ RED self-test)** - `4a6f92bdf` (test)
3. **Task 3: Live Windows dev-run check, then record the outcome in the todo** - `3b744142b` (docs)

**Plan metadata:** committed by the orchestrator (this plan does not commit its own SUMMARY.md/STATE.md/ROADMAP.md).

## Files Created/Modified

- `src-tauri/src/main.rs` - Added `gamelib_protocol_dev_build_dirs` / `gamelib_protocol_exe_is_dev_build` (pure, `#[cfg_attr(not(windows), allow(dead_code))]`), wired the skip into `repair_windows_gamelib_protocol_registration`, extended its doc comment and the DECISION-block banner ("six" → "eight"), and added 10 new `#[test]`s covering every `<behavior>` bullet from the plan.
- `src/backend/__tests__/tauriShellSource.test.ts` - Added Gate 5A–5D plus two RED-proof self-tests to the `quick-260925-uok` describe, and a sentence in its header doc comment noting Gate 5 is a source gate too.
- `.planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md` - `ready: code` → `ready: live-gate`; added a `## Progress (quick-260926-f3l, 2026-09-26)` section recording the fix, the live result, and the one remaining operator step (46-POSTFIX R4, verify step 2). Stays in `pending/`.

## Decisions Made

- Predicate choice was pre-decided by the planner (see `<predicate_choice>` in the plan) and implemented as specified: deny-list this build's own cargo target dir, baked at compile time via `env!("CARGO_MANIFEST_DIR")` / `option_env!("CARGO_TARGET_DIR")`. No deviation.
- "Windows-absolute" in `gamelib_protocol_dev_build_dirs` is decided with a plain string check (leading `\`, or drive-letter + `:` + `\`/`/`), never `std::path::Path::is_absolute`, so the function and its unit tests behave identically on the macOS/Linux CI legs — as specified in the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two newly-added code blocks did not match rustfmt's preferred line-wrapping**
- **Found during:** Task 1's `<verify>` step (`cargo fmt --check` hunk-count ratchet)
- **Issue:** The `gamelib_protocol_dev_build_dirs(...)` call site in the repair fn, and three `assert!`/`assert_eq!` calls in the new unit tests, were written with a line-break style rustfmt disagreed with, pushing the `cargo fmt --check` hunk count from the 76-hunk baseline to 81 (5 new diffs). Since `cargo fmt` itself must never be run (it would reformat 76 unrelated pre-existing sites per the plan's `<context>`), the five new hunks were identified by isolating hunks inside this task's own newly-added line ranges and hand-edited to match rustfmt's exact expected output.
- **Fix:** Reformatted the `dev_build_dirs` call site to break each argument onto its own line, and collapsed four multi-line `assert!`/`assert_eq!` calls onto rustfmt's single-line form.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** `cargo fmt --check | grep -c '^Diff in'` returns exactly 76 (the pre-existing baseline, unchanged), and `cargo test gamelib_protocol` still shows 17/17 passing after the reformat.
- **Committed in:** `28ff2c3e8` (part of the Task 1 commit — the reformat happened before the task's first and only commit)

**2. [Auto-adapted, not a fix] The live check's pre-state differed from the plan's anticipated case**
- **Found during:** Task 3, the PRE-STATE `reg query`
- **Issue:** The plan's `<context>` recorded HKCU as already hijacked to `target\debug\gamelib-shell.exe` at planning time, and Task 3's action text was written expecting that same hijacked pre-state, which would only permit proving the weaker "the value did not change" claim. By execution time, HKCU instead named the installed exe (an installed-app launch must have repaired it in the interim).
- **Fix:** No code fix was needed — this is a reporting adaptation, not a bug. The live check and its assertions were run exactly as specified (skip line once, no repair line, unchanged post-run value), and the todo's Progress section was written to honestly reflect the STRONGER result this actually permitted: full proof of the todo's verify step 1, not the weaker fallback the plan anticipated.
- **Files modified:** `.planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md`
- **Verification:** Pre- and post-run `reg query` values are quoted verbatim in the todo's Progress section and are byte-identical.
- **Committed in:** `3b744142b`

## Live Check Details

- **Pre-flight:** `node meta/tauriDevPreflight.cjs` reported no foreign shell running; the live step proceeded.
- **Pre-state:** `MSYS_NO_PATHCONV=1 reg query "HKCU\Software\Classes\gamelib\shell\open\command" /ve` → `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"`.
- **Run:** `pnpm tauri:dev` (cold cargo build, `sidecar signalled READY` reached).
- **Assertions:** skip line `[shell] dev build running from its cargo target dir -- skipping the gamelib:// HKCU registration repair (the installed app owns the scheme; quick-260926-f3l)` appeared exactly once; `repaired the gamelib:// HKCU registration` did not appear; a second `reg query` returned a value byte-identical to the pre-state.
- **Cleanup:** the dev-tree `gamelib-shell.exe` (and its `node` sidecar / further children) was tree-killed via `taskkill /PID <pid> /T /F`; a follow-up `Get-CimInstance` query confirmed zero `gamelib-shell.exe` processes remained anywhere. The installed app was never launched, hijacked, or touched. Scratchpad captures were deleted after the quoted lines above were extracted.

## What Remains Outstanding

The todo stays in `pending/` with `ready: live-gate`. One operator-only step remains before it can move to `completed/`: launch the installed `%LOCALAPPDATA%\GameLib\gamelib-shell.exe` with the key deliberately pointed elsewhere first, and confirm `gamelib-shell.log` shows a `repaired ... (prior value: points-elsewhere)` line and HKCU names the installed exe again afterward (46-POSTFIX R4). This plan's live step is deliberately read-registry-only and never writes to HKCU, so this step was not — and could not be — performed here.

## Verification Against Plan's `<verification>` and `<success_criteria>`

- `cd src-tauri && cargo test gamelib_protocol` — 17/17 pass. `cargo check` clean, no new warnings.
- `cargo fmt --check` hunk count — 76 (at the ratchet ceiling, unchanged from baseline). `cargo fmt` was never run.
- `pnpm exec jest src/backend/__tests__/tauriShellSource.test.ts` — 221/221 pass.
- `npx prettier --check` — passes on the `.ts` file and the todo `.md` file.
- `pnpm codecheck` and `pnpm planning-gates` — both exit clean (13/13 planning gates passed).
- Live capture had the skip line (exactly once), no repair line, and HKCU unchanged (proving verify step 1 in full, stronger than the plan anticipated).
- CI=e2e guard and the Phase 46 single-instance guard are untouched (confirmed by Gate 2/Gate 3 and the unchanged Phase 46 describe still passing).

## Self-Check

- `src-tauri/src/main.rs` contains `fn gamelib_protocol_exe_is_dev_build(` and `fn gamelib_protocol_dev_build_dirs(` — FOUND.
- `src/backend/__tests__/tauriShellSource.test.ts` contains Gate 5's `DEV_BUILD_CALL_TOKEN` and both RED-proof self-tests — FOUND (221/221 jest tests pass, including these).
- `.planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md` has `ready: live-gate` and a `## Progress (quick-260926-f3l, 2026-09-26)` section — FOUND.
- Commits `28ff2c3e8`, `4a6f92bdf`, `3b744142b` all present in `git log --oneline` — FOUND.

## Self-Check: PASSED
