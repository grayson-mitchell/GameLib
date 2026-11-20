---
phase: quick-261111-buh
plan: 01
subsystem: shell
tags: [rust, tauri, login-window, refactor, jest-source-pins]
requires:
  - phase: quick-261111-d7o
    provides: Windows/Linux owned-modal login window (login_owner / attach_login_owner / present_owned_login_window)
provides:
  - rpc_humble_login_open split into five named step fns
  - step-splicing source reader and linkage test for the jest pins
affects: [humble_open.rs, tauriShellSource pins, loginChromeCssInjection pins]
tech-stack:
  added: []
  patterns: [pins read the handler with each step spliced in at its call; byte-identical move proof script]
key-files:
  created:
    - .planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline/verbatim_moves.cjs
    - .planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline/jest_failing.cjs
  modified:
    - src-tauri/src/login_window/humble_open.rs
    - src/backend/testUtils/tauriShellSource.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts
    - .planning/todos/pending/2026-11-08-split-rpc-humble-login-open-into-named-steps.md
key-decisions:
  - "login_owner stays local to build_login_window; the d7o owner-present block is that step's last statement before Ok(window), return type unchanged on every platform"
  - "argument parsing stays inline in the handler (17 lines, 9 locals threaded everywhere)"
duration: ~1h
completed: 2026-11-11
status: complete
commits: 2
plan_head_before: 26facda225073a9c51de1c4b58b8a4a5964d9795
plan_head_after: ea210b612327002c5fac6184d4c6d8c2a9ae8d76
actuals:
  tokens: 10000
  tasks: 3
  commits: 2
---

# Phase quick-261111-buh Plan 01: Split rpc_humble_login_open into named steps Summary

`rpc_humble_login_open` went from 659 lines to a 124-line handler that calls five named step fns, every moved code line byte-identical to HEAD 26facda22 and proven so by a script; the jest source pins now read the handler with each step spliced in at its call, behind a linkage test.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | `2da0210de` | extract `install_login_window_close_hook`; spliced-pin readers, linkage test, baselines, proof scripts |
| 2 | `ea210b612` | extract the latch, build (with d7o owner), native-bar and presentation steps |
| 3 | not committed by me | gates, after-baselines, todo status paragraph, this SUMMARY (left for the orchestrator's docs commit, per the run constraints) |

Plan was re-derived against HEAD 26facda22 (the first run stopped because quick-261111-d7o had edited the handler). The precondition held at 26facda22 on this run. HEAD stayed at 26facda22 until my Task 1 commit.

## Layout after the split (humble_open.rs, at ea210b612)

| fn | lines | notes |
| -- | ----- | ----- |
| `rpc_humble_login_open` | L90-213 (124 lines; was 659) | args, latch call, pristine route, build call, native-bar call, presentation call, non-macOS `sheet_presented = false`, record print, close-hook call, title seed, devtools, `Ok` |
| `arm_visible_login_latch_macos` | L217-292 | `#[cfg(target_os = "macos")]`; `(label: String, visible: bool) -> Result<(), String>`; HEAD L117-188 + `Ok(())` |
| `build_login_window` | L296-611 | 7 params, `Result<tauri::WebviewWindow, String>`; HEAD L197-496, then d7o owner block HEAD L600-603, then `Ok(window)` |
| `install_native_bar_for_sheet_macos` | L615-666 | macOS-gated; `-> bool`; HEAD L515-557 + `native_bar_installed` |
| `present_visible_login_window_macos` | L671-757 | macOS-gated; `-> bool`; HEAD L558-597 + L604-641 + `sheet_presented` |
| `install_login_window_close_hook` | L760-829 | HEAD L652-715; `app` carries the file's own `cfg_attr(unused_variables)` |

Handler call order: latch (macOS, `?`), pristine route (macOS), `build_login_window`, native bar (macOS), presentation (macOS), non-macOS `sheet_presented = false`, record print, close hook, title seed, devtools.

## Owner-threading decision (quick-261111-d7o)

d7o added three non-macOS `login_owner` sites: the declaration and the `attach_login_owner` match, both inside the build range, and an `if let Some(owner) = login_owner.as_ref() { present_owned_login_window(...) }` block that sat between the non-macOS `sheet_presented = false;` and the present-b block. All three now live in `build_login_window`, the last as the step's tail statement. Off macOS the only statement that ran between `.build()` and that block was `let sheet_presented = false;` (no side effect), so side-effect order is unchanged. On macOS the block never existed. This keeps every line verbatim and the step signature uniform, and avoids a cfg-split return type. `verbatim_moves.cjs full` additionally asserts that the owner run follows the build run inside `build_login_window`.

## Verification measurements

- **Move proof:** `baseline/verbatim-full.txt`: RESULT PASS. All 12 code ranges found as one byte-identical contiguous run, exactly once, inside the expected fn; ranges tile L90-748; the barcomment range has zero code lines; ordering assertions pass (handler ranges ascending, build < owner, present-a < present-b).
- **cargo test --bin gamelib-shell:** `test result: ok. 427 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out`, identical before and after (and after Task 1).
- **cargo check:** passes, same 5 pre-existing warnings (dead_code) as before.
- **clippy (win32, 1.99.1):** per-lint counts identical before/after (cloned_ref_to_slice_refs 2, doc_lazy_continuation 5, if_same_then_else 1, incompatible_msrv 1, manual_hash_one 1, match_like_matches_macro 1, needless_borrows_for_generic_args 1, type_complexity 2, unnecessary_to_owned 2, useless_conversion 1, dead_code 5, non_snake_case 2); location-stripped sorted site list identical; ratchet PASS.
- **rustfmt:** humble_open.rs `cargo fmt --check` hunks 4 before, 4 after (the same 4 pre-existing verbatim lines; they moved with their ranges). One new glue hunk (the `let native_bar_installed = ...` call) appeared mid-run and was hand-fixed to rustfmt's form. `cargo fmt` was never run in write mode.
- **Pin suites** (tauriShellSource + loginChromeCssInjection): 289 tests / 1 failing before (the unrelated WR-07 `.title(format!` store-embed popup check); 299 tests / 1 failing after (same one). The 10 new tests are the linkage describe. No existing `expect(` line changed.
- **Broad jest** (all 35 suites that read Rust source): failing set identical before and after EXCEPT `steamAuthFlows.test.ts`, which is flaky on this box independent of the change: 9 failing assertions in both full runs but a different subset each time, and 4 / 7 / 9 across three standalone reruns. That suite reads no handler source (`src-tauri/src/main.rs` appears only in a comment). With it excluded the sets are byte-identical (`jest-failing-before.txt` vs `jest-failing-after.txt`, 17 lines each, 8 non-steamAuthFlows lines identical).
- **Prettier `--check`:** the three `.ts` files pass (each `--file-info` ignored: false). Omitted for humble_open.rs (`inferredParser: null`) and `.planning/` paths (ignored).
- **pnpm codecheck:** clean. **pnpm find-deadcode:** PASS (350 baselined findings). **pnpm lint:** `production: PASS | tests: PASS`. **pnpm planning-gates:** 12/12 pass.
- **graphify update .:** started in the background (it exceeded the foreground limit); graphify-out/ is gitignored and not staged.

## Mutation self-tests (each reverted from a saved copy; `cmp` clean every time)

| Id | Mutation | Pins that went red |
| -- | -------- | ------------------ |
| M-orphan | delete the handler's `install_login_window_close_hook(` call | "Test 2 (INVERTED 2026-08-04...)" (Destroyed block), linkage test, "every step's statements appear" |
| M-body | delete `dismiss_login_window_sheet(&app_for_dismiss, &close_event_label);` in the hook | "Test 2 (INVERTED 2026-08-04...)" |
| M-build | `.inner_size(464.0, 592.0)` -> `(900.0, 700.0)` in `build_login_window` | "Guard 1 (D-3)" |
| M-order | move the latch call (cfg + call) below the route's closing `}` | "Test 1 (ORDERING, updated quick-261029-utr)", "Test 3b" |
| M-swap | swap the native-bar and presentation call statements | "Test 1: install_native_login_bar( is called inside..." and the linkage test |
| M-css | `#[cfg(target_os = "macos")]` above the `login_chrome_css_script()` call | loginChromeCss "the real source: the CSS call sits at brace depth 1..." |

## macOS manual review (the macOS-only steps cannot be compiled on this machine)

GLUE lines (signatures, call sites, tails) are listed in `baseline/verbatim-full.txt`. Verdicts:

- (a) params carry the handler-local names and types: owned `String` for label/origin, `&tauri::WebviewWindow`, `&AppHandle`, `bool`. OK.
- (b) return types fit: latch `Result<(), String>` (it has `?` and `return Err`); bar and presentation `-> bool` (no `?`; their `return false`s are inside closures). OK.
- (c) tails: `Ok(())`, `Ok(window)`, `native_bar_installed`, `sheet_presented`. OK.
- (d) cfg gates: latch call, `let native_bar_installed` and macOS `let sheet_presented` are each `#[cfg(target_os = "macos")]`; non-macOS `let sheet_presented = false;` untouched; the owner block keeps its own `#[cfg(not(target_os = "macos"))]`. OK.
- (e) darwin lint parity by construction: `if visible == true {` occurs exactly once (non-comment); no step has more than 7 params; no new `#[allow]` beyond the hook's `cfg_attr`; the one generic borrow `WebviewWindowBuilder::new(app, &label, ...)` still has later `label` uses in `build_login_window` (including the owner block's `&label`). OK.
- (f) every identifier in the moved macOS bodies resolves through the file's existing `use super::*;` (same module as before). OK.

`cargo fmt --check` parses the cfg'd-out steps and shows no new hunk, so they are at least syntactically sound. The compile and darwin clippy ratchet check is the macos-latest rust-test leg.

## Comment edits (positional rule)

Four comments pointed above/below at code that now lives in a different fn with the direction no longer true:

1. In `arm_visible_login_latch_macos`: "Sits AFTER the pristine-route variables above and BEFORE the pristine route and the builder below" now reads "Called from `rpc_humble_login_open` AFTER the pristine-route variables and BEFORE the pristine route and `build_login_window`".
2. In `build_login_window`: "see the print call after `window` exists, below" now reads "see the print call in `rpc_humble_login_open`, after `build_login_window` returns".
3. In `build_login_window`: "this arm's `open_devtools()` call below" now reads "...call (in `rpc_humble_login_open`)".
4. In the handler's record print: "see this arm's builder-setup block above" now reads "...builder-setup block in `build_login_window`".

Left unchanged because the direction still holds in file order (handler, latch, build, bar, present, hook): comments in the build body pointing further down at the presentation step, in present-b pointing up at the builder, in the hook pointing up at the `on_page_load` hook and the presentation call, the handler's `url`/builder "below" notes, and the latch's "BEFORE that block" ordering note. Already stale before the split and left alone: "`humble_login_close` (a few match arms below)", "line ~3718", "main.rs:2083".

## Deviations from Plan

**1. [Plan expectation off] M-order did not turn the linkage test red.** The plan expected it to. The linkage test checks step-to-step call order and the latch still precedes `build_login_window`; the route is not a step, so latch-vs-route order is guarded only by "Test 1 (ORDERING)" and "Test 3b", which both went red. No code change; recorded for accuracy.

**2. [Rule 3 - splice detail] `readHandlerBodyWithSteps` inserts a step's statements after the statement that ends the call (first line ending `;`), not strictly after the line that contains the call.** The plan said "after each body line that calls a listed step". For single-line calls these are the same; for the rustfmt-vertical `build_login_window(` call, inserting after its first line would have landed the statements inside the argument list. Pins are text-based so either works; this is just cleaner.

**3. [Environment] steamAuthFlows.test.ts is flaky on this box** (see Verification). The plan's "failing set equals baseline" gate is therefore evaluated with that one suite excluded, and the flake is demonstrated rather than assumed (3 standalone reruns: 4, 7, 9 failures).

**4. [Protocol note] Commits were made on `main`**, which `git.base-branch --is-protected` reports as protected. This is the main checkout (not a worktree), HEAD did not drift, and the orchestrator launched the run there with commits expected on main; no config was changed.

**5. Handler is 124 lines**, slightly above the plan's "about 105-120" estimate (the retained comments, devtools block and the pointer comments count).

## Not covered by any source pin

No jest or cargo pin covers the d7o owner wiring (d7o added none). Its guard is the byte-identical move proof (including owner-follows-build) plus the Windows live gate. main.rs was NOT edited: `baseline/cargo-pin-scan.txt` shows the cargo tests that locate handler bodies only target the F-34.4.2-12 cookie arms, the keyring locator and the clear-cookies locators; none locate `rpc_humble_login_open`.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path, file access or trust-boundary schema; the moved code is unchanged.

## Human verification required (live-gate)

(a) **macOS live sign-in through Humble or Amazon.** In order, the log must show: `login chrome CSS injected for '`; `login-window sheet: present_login_window_as_sheet entered for '`; `presentation requested visible=true ... sheet_presented=true`; `title change applied len=N`; `origin banner updated len=N` on navigation. A second visible login while the first is pending must log `REFUSED visible login window` and fail with `login-already-in-progress`. x/Esc must resolve the flow as cancelled and log the latch clear, and a new sign-in after that must be accepted. Epic and GOG must still present their pristine sheets. Also: the macos-latest leg of rust-test.yml must be green (cargo test plus the darwin equality ratchet) on the first push carrying these commits. That run is the first compile of the three macOS-only steps.

(b) **Windows live sign-in on this box.** The login window opens owned by main and centred over it, with no taskbar button. Main is disabled while it is up, and is re-enabled and re-focused when it closes. The title reads `origin — document title`, and the CSS-injected log line fires. Closing the window resolves the sign-in as cancelled. With main minimised, the login window still opens free-floating, centred and focused, logging `owner not attached`.

Linux: compile and unit tests on the CI ubuntu leg only. No live run.

The todo stays in `pending/` (`ready: live-gate`) until (a) and (b) pass; it carries a new **Status (2026-11-11)** paragraph (frontmatter byte-identical).

## Uncommitted by instruction

Left in the working tree for the orchestrator's docs commit: this SUMMARY, the todo edit, and `baseline/jest-failing-after.txt`, `baseline/clippy-after.txt`, `baseline/fmt-after.txt` (Task 3 after-baselines). `baseline/raw/` (large raw outputs) was deleted.

## Self-Check: PASSED

- humble_open.rs, tauriShellSource.ts, both test files, baseline scripts: present.
- Commits `2da0210de` and `ea210b612`: present in `git log`.
