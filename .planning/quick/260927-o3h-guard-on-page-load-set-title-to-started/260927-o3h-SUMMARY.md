---
phase: quick-260927-o3h
plan: 01
subsystem: login-window
tags: [tauri, rust, login-window, regression-test, anti-phishing-title]
requires: []
provides:
  - "src-tauri/src/main.rs: humble_login_open's on_page_load set_title refresh guarded to PageLoadEvent::Started only"
  - "src/backend/__tests__/tauriShellSource.test.ts: source-shape regression test pinning the guard"
  - "closed .planning/todos/completed/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md"
affects:
  - "on_document_title_changed's composed origin — document title now survives PageLoadEvent::Finished on Windows/Linux (not verifiable on this Mac)"
tech-stack:
  added: []
  patterns:
    - "single match on payload.event() extended to a tuple destructure (kind, is_started) rather than a second match, keeping one source of event-kind truth (D-03)"
    - "line-scoped guard (if is_started { <one statement> }) inside an existing if visible { } block, rather than widening the block's own condition, to keep sibling statements running on both branches"
key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md (git mv'd)
    - .planning/todos/completed/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md (landed path, with Resolution section appended)
    - .planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md (new, standing deferred live check)
decisions:
  - "Chosen guard shape (D-03, decided at planning time, executed as specified): extend the closure's existing match into a tuple destructure (kind, is_started) rather than adding a second, separate match!/payload.event() read a few lines below -- keeps exactly one source of event-kind truth in the closure."
  - "Task 3 filed a new standing todo for the deferred Windows/Linux live check rather than leaving it only in the completed/ file, after confirming no existing pending todo already covered it."
metrics:
  duration: "~25 minutes (commit span ae5968b07..6e2a5fc97 was ~5 minutes; total including reads/verification longer)"
  completed: 2026-09-27
status: complete
actuals:
  tokens: 6400
  tasks: 3
  commits: 3
  plan_head_before: 0c3a8b3acfe7c3dbc51bcd9fcc619dd31056d14c
---

# Phase quick-260927-o3h Plan 01: Guard login window on_page_load set_title to Started Summary

**One-liner:** Guarded the `humble_login_open` `on_page_load` closure's `set_title` refresh to `PageLoadEvent::Started` only (via a tuple-destructured `is_started` bool extending the closure's existing single `match payload.event()`), so the `origin — document title` composed by `on_document_title_changed` survives `PageLoadEvent::Finished` instead of being overwritten with the bare origin; pinned the guard with a falsifiable two-sided source-grep regression test whose RED direction was observed before acceptance; corrected two stale comments; and closed the originating todo with the runtime half recorded honestly as deferred to a Windows/Linux sitting.

## What happened

**Task 1** (`ae5968b07`) implemented D-01 through D-05 in the `humble_login_open` arm's `on_page_load` closure in `src-tauri/src/main.rs`:
- Replaced the existing `let kind = match payload.event() { ... }` with a tuple destructure `let (kind, is_started) = match payload.event() { Started => ("started", true), Finished => ("finished", false) }` — the closure still reads `payload.event()` exactly once (D-03).
- Wrapped only the `let _ = window.set_title(&login_window_title(&new_origin, None));` line in `if is_started { ... }` (D-01). The `page_load_origin.lock()` main-frame origin write and the `#[cfg(target_os = "macos")]` origin-banner block (`login_origin_banner_update_script` + `eprintln!`) stayed outside the guard, unchanged, still running on both `Started` and `Finished` (D-02).
- Added a 13-line in-situ comment immediately above the guard naming `page_load_origin` and `login_origin_banner_update_script` explicitly, explaining why the guard is `Started`-only and why it is scoped to the one line rather than the enclosing `if visible {` block (D-05).
- Corrected the `This is deliberately the WEAKER of the two guarantees` comment (D-04): it no longer says the document title "replaces" the origin — `login_window_title` (`main.rs:2083`) APPENDS it after the origin per T-34.5-G6-23 — and now records that the composed title survives `Finished` because of this guard. The WR-07 framing and the closing ABSENCE-vs-PRESENCE point were kept intact, as required.

**Measured verification for Task 1:**
- `cargo check --bin gamelib-shell`: exit 0, **0** warnings (`CHECK_ZERO_WARN_OK`).
- `cargo clippy --bin gamelib-shell`: exit 0, **14** lines matching `^warning` (13 real diagnostics + the roll-up line) — exactly the measured baseline, no increase (`CLIPPY_NO_INCREASE_OK`).
- `npx jest src/backend/__tests__/tauriShellSource.test.ts`: 221/221 passed (the pre-existing POSITIVE test at the old :1285 and NEGATIVE test at the old :1313 both stayed green).
- `cargo fmt` / `npx prettier --check` were deliberately NOT run on `main.rs`, per the plan's measured finding that the file is neither prettier-parseable (`--check` exits 2) nor rustfmt-managed (`cargo fmt --check` shows 1762 diff lines at HEAD). New comment lines were hand-wrapped to fit within 95 columns (verified with a script; longest new line is 95).

**Task 2** (`49ea778cb`) added a regression test in `src/backend/__tests__/tauriShellSource.test.ts`, inside the existing `F-34.5-G6-04` describe block, immediately after the pre-existing POSITIVE test:
- Added `sliceBracedBlock(body, headerIdx)`, a local helper that finds the first `{` at or after `headerIdx`, walks forward tracking brace depth, and returns the substring between that `{` and its matching `}` (throwing on unbalanced input).
- The new test slices the arm body from `.on_page_load(` to the *next* `.on_navigation(` (narrower than the POSITIVE test's slice to `.build()`, which also spans the `.on_navigation(` closure), asserts `page_load_origin.lock()` and `login_origin_banner_update_script` both exist in that closure (anti-vacuity control), locates the `if is_started {` header, slices its braced body, and asserts that body contains `set_title(` but neither of the two protected statements.
- **RED direction observed, not assumed:** the guard was temporarily unwrapped in the working tree (`if is_started { ... }` removed, leaving the bare `set_title` call), the suite was re-run with `-t "quick 260927-o3h REGRESSION"`, and it failed exactly as predicted — `guardHeaderIdx` was `-1`, failing `expect(guardHeaderIdx).toBeGreaterThan(-1)` at the new test's own assertion line. The guard was then restored; `git diff src-tauri/src/main.rs` showed zero diff against the Task 1 commit, confirming an exact restoration.
- **GREEN direction confirmed after restoration:** 222/222 tests passed (221 pre-existing + 1 new).
- `npx prettier --check` initially failed on the test file (Task 1's plan text notwithstanding — this path IS prettier-managed); ran `npx prettier --write` scoped to the one path, re-verified `--check` green, re-ran jest (still 222/222 green), and confirmed the only diff was prettier reflowing two `throw new Error(...)` calls onto multiple lines — no logic changed.
- `pnpm codecheck` (`tsc --noEmit` twice) passed clean.

**Task 3** (`6e2a5fc97`) closed out the todo:
- `git mv`'d the clean, unmodified `.planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md` to `completed/` first, then appended a `## Resolution (2026-09-27, quick 260927-o3h)` section recording what shipped, that the Phase 38 `38-W03` acceptance is superseded (with `38-VERIFICATION.md` deliberately left unrewritten, as an accurate record of the decision at that time), the two comment corrections, the new regression test and what turns it red, the stale line-number citations found while fixing this (`main.rs:1551` now points at an unrelated clipboard helper; every Mechanism-section line number was off by ~110-120 lines at HEAD), and the deferred live check.
- Filed a new standing todo, `.planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md` (`severity: minor`, `platform: windows`, `ready: live-gate`), after checking `.planning/todos/pending/` and confirming no existing item already covered the Windows/Linux-only live check.
- `pnpm planning-gates`: `12/12 planning gates passed.`
- Confirmed the move was fully staged (`git status --porcelain .planning/todos/` showed `A`/`D` pairs, zero `??`/unstaged `M`/`D` lines).
- Formatter check over `.planning/` paths declared vacuous and skipped, per the plan (`.prettierignore` covers the tree; `--check` would match zero files and print a false-looking pass).

## Deviations from Plan

None — plan executed exactly as written, including the deliberate choices the plan called out in advance (tuple-destructure over `matches!`, line-scoped guard, no formatter run on `main.rs`).

One addition beyond the plan's explicit task list: after writing this summary, appended an `unrun-verify` entry to the cross-phase `.planning/WINDOWS.md` broken-windows ledger (file did not previously exist; `gsd-tools windows append` created it) recording the deferred Windows/Linux live title-bar check, per this workflow's broken-windows ledger requirement. This is process bookkeeping, not a code change, and is not one of Task 1-3's committed changes.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this plan.

## Threat Flags

None. All new surface (the `is_started` guard, the two comments, the regression test) was already covered by the plan's own `<threat_model>` (T-o3h-01, T-o3h-02, T-o3h-03) — no new trust boundary, endpoint, or schema change was introduced.

## Measured outcomes (per plan's `<output>` spec)

- **`cargo check --bin gamelib-shell` warning count:** 0 (target: 0). `CHECK_ZERO_WARN_OK`.
- **`cargo clippy --bin gamelib-shell` diagnostic count:** 14 lines matching `^warning` (13 real diagnostics), against the measured 14-line / 13-diagnostic baseline — no increase. `CLIPPY_NO_INCREASE_OK`.
- **New regression test RED direction:** observed — guard temporarily unwrapped, test failed with `guardHeaderIdx` = `-1` at its own `toBeGreaterThan(-1)` assertion.
- **New regression test GREEN direction:** observed — guard restored (file byte-identical to Task 1's commit via `git diff`), full suite 222/222 green.
- **Deferred Windows/Linux live check:** NOT done. Not verifiable on this Mac — the login window is an AppKit sheet with no title bar UI at all (`main.rs:2710-2718`, F-34.5-G6-16). Deferred to the next Windows/Linux sitting; tracked as a new standing todo at `.planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md` and recorded as an open `unrun-verify` entry in `.planning/WINDOWS.md`.

## Commits

- `ae5968b07` — fix(quick-260927-o3h): guard login window set_title to PageLoadEvent::Started only
- `49ea778cb` — test(quick-260927-o3h): pin the on_page_load Started-only set_title guard with a source-grep regression test
- `6e2a5fc97` — docs(quick-260927-o3h): close the login-window on_page_load title todo, file the deferred live check

## Self-Check: PASSED

- FOUND: `src-tauri/src/main.rs` contains `let (kind, is_started) = match payload.event()` and `if is_started {` (verified via grep after commit).
- FOUND: `src/backend/__tests__/tauriShellSource.test.ts` contains `sliceBracedBlock` and the `quick 260927-o3h REGRESSION` test (verified: jest reports 222 passed, including this test by name in the run output).
- FOUND: `.planning/todos/completed/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md` exists and contains `## Resolution (2026-09-27, quick 260927-o3h)`; `.planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md` does NOT exist.
- FOUND: `.planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md` exists.
- FOUND: commit `ae5968b07` — `git log --oneline --all | grep ae5968b07` matches.
- FOUND: commit `49ea778cb` — `git log --oneline --all | grep 49ea778cb` matches.
- FOUND: commit `6e2a5fc97` — `git log --oneline --all | grep 6e2a5fc97` matches.
