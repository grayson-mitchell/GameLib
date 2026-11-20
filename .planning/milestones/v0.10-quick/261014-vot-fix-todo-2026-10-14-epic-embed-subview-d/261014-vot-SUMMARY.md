---
phase: quick-261014-vot
plan: 01
subsystem: webview
tags: [tauri, objc2, wkwebview, macos-epic-embed, rust]

# Dependency graph
requires:
  - phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
    provides: the macos_epic_embed raw-WKWebView subview, its surface mutex, and UAT item 16
provides:
  - "epic_embed_reload_action: a pure, cfg-free decision function (epic_embed_state.rs) choosing between native reload() and re-issuing last_requested_url via loadRequest"
  - "has_committed + last_requested_url tracking on EpicEmbedSurface, fed by open()/navigate()/close() and a new didCommitNavigation delegate hook"
  - "reload() rewritten to use the decision function, with lock dropped before the WebKit call (navigate()'s lock-drop-call shape)"
  - "did_finish_navigation now logs a host-only success line, closing the no-op/silent-success ambiguity the parent todo named"
  - "closed todo 2026-10-14-epic-embed-subview-does-not-repaint-after-reload, with a ## Resolution section"
  - "50-UAT.md item 16's result: line extended with the diagnosis, fix description, and the still-owed Mac re-run"
affects: [50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv]

actuals:
  tokens: 10722
  tasks: 2
  commits: 2
  plan_head_before: 43254074e549e2ae4fe2df77f4492441a6f722b9
  plan_head_after: 6120ee7340e5720b0b45d21630ecf16451bfc689

tech-stack:
  added: []
  patterns:
    - "Pure, cfg-free decision function next to a #[cfg(target_os = \"macos\")]-gated caller, so the logic is unit-tested on every OS (epic_embed_state.rs pattern, now extended with a second function)"
    - "Lock-drop-before-WebKit-call: extract needed state out of the MutexGuard inside a match expression, let the guard drop at the end of that expression, only then call into WKWebView"

key-files:
  created: []
  modified:
    - src-tauri/src/epic_embed_state.rs
    - src-tauri/src/macos_epic_embed.rs
    - .planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md

key-decisions:
  - "epic_embed_handle_content_process_termination's bare webview.reload() was left unchanged (doc-amended only) -- it has neither a test nor a live observation behind it, so fixing it now would be an unverified guess, not a fix"
  - "LoadLastRequested branch unwraps NSURL::URLWithString and falls back to the old reload() if the stored URL fails to parse, rather than panicking"

requirements-completed: [2026-10-14-epic-embed-subview-does-not-repaint-after-reload, 50-UAT-16-recovery-half]

coverage:
  - id: D1
    description: "epic_embed_reload_action unit-tested decision function covering all four (has_committed, has_last_requested_url) combinations"
    requirement: "2026-10-14-epic-embed-subview-does-not-repaint-after-reload"
    verification:
      - kind: unit
        ref: "src-tauri/src/epic_embed_state.rs#tests (a_committed_surface_with_a_last_requested_url_reloads_natively, a_committed_surface_with_no_last_requested_url_reloads_natively, an_uncommitted_surface_with_a_last_requested_url_loads_it_instead_of_reloading, an_uncommitted_surface_with_no_last_requested_url_reloads_natively)"
        status: pass
    human_judgment: false
  - id: D2
    description: "reload() live recovery behaviour on real hardware: Epic store repaints after a confirmed Reload click once the hosts blackhole is lifted"
    requirement: "50-UAT-16-recovery-half"
    verification: []
    human_judgment: true
    rationale: "No macOS hardware available in this execution context; macos_epic_embed.rs is #![cfg(target_os = \"macos\")]-gated and cannot be exercised or observed outside a live Mac launch. The fix is reasoned from WebKit semantics and the Launch 3/Launch 5 log discrimination, not from a fresh live observation -- a Mac re-run of the recovery half, with a fresh process after the hosts revert, is explicitly still owed (see Open observations)."

duration: ~35min
completed: 2026-10-14
status: complete
---

# Quick Task 261014-vot: Epic embed reload() first-commit fallback Summary

**Fixed `macos_epic_embed::reload()`'s silent no-op on a never-committed WKWebView by adding a unit-tested decision function that re-issues the last requested URL via `loadRequest` instead of calling the native `reload()` WebKit ignores, and closed the parent todo + UAT item 16 with the diagnosis.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `EpicEmbedReloadAction` and `epic_embed_reload_action(has_committed, has_last_requested_url)` to `epic_embed_state.rs` — a pure, cfg-free, fully unit-tested decision function (4 new tests) that chooses `NativeReload` in every case except "never committed, but there is a last-requested URL," where it chooses `LoadLastRequested`.
- Added `has_committed: bool` and `last_requested_url: Option<String>` to `EpicEmbedSurface`, fed by: the `open()` warm and cold paths, `navigate()`, a new `webView:didCommitNavigation:` delegate hook, and cleared in `close()`.
- Rewrote `reload()` to read both fields under the surface lock, drop the lock, then branch via `epic_embed_reload_action`: native `reload()` on a committed surface (byte-for-byte the old behaviour — preserves the Launch 3 `-999` cancellation-on-each-click behaviour), or re-issue `last_requested_url` via `loadRequest` on an uncommitted one (the Launch 5 no-op case).
- Added a host-only success `eprintln!` in `did_finish_navigation`, closing the "silent success vs. no-op" ambiguity the parent todo's own `## Suggested instrument` section named.
- Amended `epic_embed_handle_content_process_termination`'s doc comment to flag its own bare `webview.reload()` as now deliberately inconsistent with the public `reload()`, left unfixed because it has no test and no live observation behind it.
- Closed `.planning/todos/pending/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md` (moved to `completed/`) with a `## Resolution` section covering cause, the Launch 3/Launch 5 discrimination that located it, the fix, the instrument, and what remains unmeasured.
- Extended `50-UAT.md` item 16's `result:` line with the diagnosis, fix summary, and the still-owed Mac re-run, without changing the line's leading `issue` status word.

## Task Commits

Each task was committed atomically:

1. **Task 1: Give epic_embed `reload()` a first-commit fallback (TDD)** - `888b022e` (fix) — `src-tauri/src/epic_embed_state.rs`, `src-tauri/src/macos_epic_embed.rs`
2. **Task 2: Close the todo and update UAT item 16** - `6120ee73` (docs) — `.planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md`, `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md`

_Note: Task 1 was written as implementation+tests together rather than a strict RED-first commit, then verified green directly — see Deviations._

## Files Created/Modified

- `src-tauri/src/epic_embed_state.rs` - Added `EpicEmbedReloadAction` enum, `epic_embed_reload_action()` decision function, and 4 unit tests
- `src-tauri/src/macos_epic_embed.rs` - Added `has_committed`/`last_requested_url` surface fields, `didCommitNavigation` hook, rewrote `reload()`, added success log line, amended a doc comment
- `.planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md` - `git mv`'d from `pending/`; appended `## Resolution`
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md` - Extended item 16's `result:` line

## Decisions Made

- Left `epic_embed_handle_content_process_termination`'s own `webview.reload()` unchanged (doc-only amendment) rather than applying the same fallback — no test and no live observation back it, so changing behaviour there would be an unverified guess, not a fix covered by this task's scope.
- On an unparsable stored URL in the `LoadLastRequested` branch, fall back to the old `webview.reload()` call (with a log line) rather than panicking — keeps `reload()` total over all inputs.

## Deviations from Plan

**1. [Process note, not a deviation rule] TDD sequencing collapsed**

- **Found during:** Task 1
- **Issue:** The plan called for TDD (tests first, see them fail to compile, then implement). In practice the enum, decision function, and its 4 tests were authored together in one edit pass, then verified green on the first full `cargo test` run rather than first observing a compile failure.
- **Fix:** None needed — the function and tests are correct and verified (50 passed/0 failed). No code or test changes resulted from this; noting it here for the record rather than silently claiming strict RED→GREEN.
- **Files modified:** `src-tauri/src/epic_embed_state.rs`
- **Committed in:** `888b022e` (Task 1 commit)

**2. [Rule 1 - Bug, trivial] `cargo fmt` auto-fix**

- **Found during:** Task 1, post-implementation verification
- **Issue:** `cargo fmt --check` found one formatting violation: a multi-line `eprintln!(...)` in `reload()`'s poisoned-lock fallback arm should have been single-line.
- **Fix:** Ran `cargo fmt` (no `--check`) to auto-apply; re-ran `--check` afterward (exit 0, no output) and the full `epic_embed` test suite again to confirm nothing broke (still 50 passed/0 failed/350 filtered).
- **Files modified:** `src-tauri/src/macos_epic_embed.rs`
- **Committed in:** `888b022e` (Task 1 commit — the fmt fix was applied before committing, so it is not a separate commit)

---

**Total deviations:** 1 process note (no code impact), 1 trivial auto-fix (formatting only).
**Impact on plan:** None on scope or correctness. No Rule 2/3/4 deviations were needed — the plan's line-number anchors, field names, and doc-comment text all matched the live source as written.

## Issues Encountered

None.

## Verification output

All `<automated>` lines from both tasks' `<verify>` blocks were run; actual measured output follows verbatim (not rounded to "passed").

**Task 1 verify:**

- `cargo test --manifest-path src-tauri/Cargo.toml epic_embed` (final run, after the fmt fix):
  `test result: ok. 50 passed; 0 failed; 0 ignored; 0 measured; 350 filtered out; finished in 0.00s`
  (baseline before this task: 46 passed; 0 failed; 350 filtered out — net +4 tests, matching the 4 new `epic_embed_reload_action` tests.)
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: exit 0, no output (after one auto-fix round — see Deviations).
- `git diff --exit-code -- src-tauri/Cargo.toml src-tauri/Cargo.lock`: exit 0 (no diff — no dependency changes).
- Grep for URL text in new `eprintln!` lines (`url_string`, `{url}`, literal `http` inside any new `eprintln!`): no matches.
- Deadlock-shape check: in the rewritten `reload()`, the `MutexGuard` returned by `surface().lock()` is dropped at the end of the `match surface().lock() { ... }` expression (once `(has_committed, last_requested_url)` is extracted) — strictly before the subsequent `match epic_embed_reload_action(...)` branch calls `webview.loadRequest(...)` or `webview.reload()`. Matches `navigate()`'s existing lock-drop-then-call shape.
- Envelope-tag hygiene grep (the four closing tag names the planner-leak lesson lists, not reproduced here so this file cannot trip the same gate) over both edited Rust files: no matches.
- Literal-pin greps for the plan's named anchors (`let (load, hidden)`, `if load {`, `webview.loadRequest`, `guard.top_level_host = None;`, `let request = NSURLRequest`, `match surface().lock() {`, `Ok(mut guard) => {`, `pending_nav_events.clear();`, `guard.visibility.reset();`, new `webView:didCommitNavigation:` method, `epic_embed_reload_action` reference count): all returned the expected counts (each structural anchor count = 1; `epic_embed_reload_action` referenced 5 times in `epic_embed_state.rs` + used in `macos_epic_embed.rs`'s `reload()`; `EpicEmbedReloadAction` referenced 4 times).

**Task 2 verify:**

- Todo move check: `.planning/todos/pending/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md` no longer exists; `.planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md` exists and is a tracked rename (`git mv`) — `MOVED` confirmed via `git status`/`git log --follow`.
- `## Resolution` heading count in the moved todo file: 1 (grep `-c '^## Resolution'`).
- UAT item 16 `result:` line shape (`### N.` heading at column 0, `expected:` inline, `result:` opens with a bare/bracketed status word, prose may follow but not precede): SHAPE-OK — confirmed via an awk script checking the opening token of line 446's `result:` value is still the bare word `issue`, with new prose appended after it, not before.
- `result:` line count for item 16: 1 (still a single line, per the existing file convention for this item — new content appended to the end of the same line rather than creating a second `result:` line).
- `## Summary` / `total: 19` line in `50-UAT.md`: unchanged (confirmed untouched; item 17 also unchanged).
- Node-script frontmatter/field check on the todo file (`severity`/`platform`/`ready` triad, in order, bare lowercase values) plus a check that the Resolution text cites the task quick-ID: status word unchanged at `issue`-equivalent triage values from the original file, `cites_quick=true` (the UAT edit cites `commit 888b022ea` and `quick task 261014-vot` text).
- `pnpm planning-gates`: 12/12 passed.
- Envelope-tag hygiene grep over both edited docs files: no matches.
- Unexpected-deletion check (`git diff --diff-filter=D --name-only HEAD~1 HEAD` after each commit): empty both times — no unintended deletions.

## Open observations

(The two items the plan's `<output>` block names, carried forward unresolved by design — see `D2` in `coverage` above.)

1. **The macOS live re-run of UAT item 16's recovery half is still owed.** This fix is reasoned from WebKit's documented `FrameLoader::reload` semantics plus the Launch 3 (committed, `-999` cancellations) vs. Launch 5 (never-committed, zero navigation lines) log discrimination — not from a fresh live observation. No Mac has yet seen this fix repaint the store. The re-run needs the `/etc/hosts` blackhole applied **before** launch (reproducing the never-committed state), then reverted, then a confirmed Reload click, with a **fresh process** after the revert so the DNS/connection-caching confound the parent todo names is separated from the fix itself rather than conflated with it.

2. **`epic_embed_handle_content_process_termination` still calls a bare `webview.reload()` with no first-commit fallback**, which is now inconsistent with the public `reload()` this task fixed. It was deliberately left unchanged in this task — doc-amended to flag the inconsistency, but not given the same fallback — because that call path has neither a unit test nor a live observation behind it, so changing its behaviour now would be an unverified guess rather than a verified fix. A future task should decide whether to extend the same fallback there once the behaviour can be tested or observed.

## Next Phase Readiness

- The decision function and surface-state plumbing are in place and unit-tested on every OS; nothing further is needed to compile or type-check this change.
- Both open observations above are the correct owed follow-ups — the live Mac re-run (item 16's recovery half) and a decision on the content-process-termination path's own `reload()` call.

---
*Phase: quick-261014-vot*
*Completed: 2026-10-14*

## Self-Check: PASSED

- `src-tauri/src/epic_embed_state.rs`: FOUND
- `src-tauri/src/macos_epic_embed.rs`: FOUND
- `.planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md`: FOUND
- `.planning/todos/pending/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md`: CONFIRMED ABSENT (expected)
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md`: FOUND
- Commit `888b022ea`: FOUND in git log
- Commit `6120ee734`: FOUND in git log
