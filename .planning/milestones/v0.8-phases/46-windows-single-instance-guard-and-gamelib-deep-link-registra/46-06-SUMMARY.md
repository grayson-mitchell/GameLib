---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 06
subsystem: infra
tags: [tauri, windows, tao, nsis, single-instance, focus-sentinel, jest, source-gates]

# Dependency graph
requires:
  - phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra plan 46-05
    provides: "46-LIVE-GATE.md's recorded FAIL at Check 3 (minimized primary window not restored), with the suspected tao-0.35.3 Windows show()/set_focus() root cause and the Windows-foreground-lock candidate carried forward"
provides:
  - "Windows sentinel arm (handle_windows_single_instance_connection): unminimize() before show()/set_focus(), plus receipt and per-call ok/err logging"
  - "Tray 'show' menu arm and tray icon left-click handler: unminimize() before show()/set_focus()"
  - "Secondary foreground grant (deliver_to_running_instance_windows, T-46-16): AllowSetForegroundWindow to the owner-verified pipe server PID, after the owner check and before the payload write, never ASFW_ANY, never fatal on failure"
  - "Corrected open_about_window_from_tray doc comment: the prior 'no latent minimized-window gap' claim is now scoped to macOS, with the Windows correction and a Linux-todo pointer added, and the Unix #[cfg(unix)] region left byte-identical to baseline 5bc4fa825"
  - "A filed, ready:blocked Linux todo for the unmeasured Unix single-instance socket handler"
  - "11 new mutation-proven jest source gates under the Phase 46 describe block, additions-only diff"
  - "46-05-SUMMARY.md, closing out 46-05's live-gate FAIL and handing the re-gate + all closure duties to plan 46-07"
  - "A debug NSIS setup .exe built from this plan's committed fix, proven (via grep -caF against the compiled binary) to carry the new sentinel log literal, ready for the 46-07 re-gate"
affects: ["46-07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A synthetic-source RED self-test proving region DISCIPLINE, not just presence: placing the fixed token (unminimize()) textually outside the region the extraction function slices (after the arm's own validation-call boundary) proves the gate is reading the right window of the file, not merely grepping the whole file for the token"
    - "A doc-comment correction that PRESERVES the two lines naming the frozen #[cfg(unix)] sibling site byte-for-byte, so git's own diff shows the enumeration of sibling raise sites as unchanged context even though the surrounding sentences describing their correctness were substantially rewritten -- kept the Unix-region-diff-adjacent acceptance check (no diff line may contain the Unix sentinel literal) satisfied without touching the frozen #[cfg(unix)] code itself"

key-files:
  created:
    - .planning/todos/pending/2026-09-24-linux-unix-focus-sentinel-arm-may-not-restore-a-minimized-window.md
  modified:
    - src-tauri/src/main.rs
    - src-tauri/Cargo.toml
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-05-SUMMARY.md

key-decisions:
  - "Rewrote the open_about_window_from_tray doc-comment correction so the two lines enumerating the four sibling raise sites (including the literal Unix single-instance-socket sentinel string) stay byte-identical to HEAD in the final file, even though the sentences before and after them were substantially rewritten. This was necessary because the plan's own acceptance check (`git diff | grep '^[-+]' | grep -c '__GAMELIB_FOCUS__'` must print 0) is a literal, whole-diff string check, not scoped to the #[cfg(unix)] region -- an earlier draft that both removed the false 'no latent gap' claim AND described the Windows correction in fresh prose mentioning the literal sentinel failed this check with a count of 2 (one deleted line, one added line). Preserving the enumeration verbatim in-place let git's diff algorithm treat those two lines as unchanged context."
  - "Used positional `{}` placeholders (not named-capture `{unminimize_result}` interpolation) in the sentinel-raise eprintln! format string, specifically to match the plan's literal acceptance grep (`focus sentinel raise: unminimize={}, show={}, set_focus={}`), even though named captures would have been the more idiomatic modern Rust formatting style."

requirements-completed: [REQ-46-01, REQ-46-02, REQ-46-10, REQ-46-11]

# Metrics
duration: ~20min (919c4dd57 07:28:42 to 02a37c4e3 07:37:25, plus pre-commit investigation/verification time)
completed: 2026-09-24
---

# Phase 46 Plan 06: Windows focus-sentinel raise fix (46-LIVE-GATE.md Check 3 gap closure) Summary

**Fixed the Windows minimized-window-not-restored defect from `46-LIVE-GATE.md` Check 3 by adding `unminimize()` ahead of `show()`/`set_focus()` at all three Windows raise sites (the pipe sentinel arm, the tray "show" menu arm, and the tray left-click handler), added receipt/result logging to the sentinel arm, added a defensive `AllowSetForegroundWindow` grant from the secondary to the owner-verified primary, corrected the doc comment that previously claimed the fix was universal, filed a Linux follow-up todo, pinned all of it with 11 mutation-proven jest gates, and rebuilt the debug NSIS installer -- proven via `grep -caF` against the compiled `gamelib-shell.exe` to carry the fix -- ready for the 46-07 re-gate.**

## Performance

- **Duration:** ~20 min (commit-to-commit; investigation, cite re-verification, and gate-satisfying rewrites added more wall-clock time than the diff size suggests)
- **Started:** 2026-09-24 (session start)
- **Completed:** 2026-09-24T07:37:25+12:00 (Task 3 commit)
- **Tasks:** 3 completed
- **Files modified:** 5 (main.rs, Cargo.toml, tauriShellSource.test.ts, the new Linux todo, 46-05-SUMMARY.md)

## Accomplishments

- **Root cause fixed.** The Windows sentinel arm (`handle_windows_single_instance_connection`) now calls `window.unminimize()` before `window.show()` and `window.set_focus()`, inside the existing `run_on_main_thread` closure. tao-0.35.3 Windows cites re-confirmed directly against the vendored source both before writing the fix and again after, at the exact `<interfaces>`-cited line ranges:
  - `platform_impl/windows/window.rs:164-172` (`set_visible`): `WindowState::set_window_flags(..., |f| f.set(WindowFlags::VISIBLE, visible))` -- an already-visible window's flag diff is empty, so no `ShowWindow` call is issued.
  - `platform_impl/windows/window.rs:175-186` (`set_focus`): `if is_visible && !is_minimized && !is_foreground { force_window_active(...) }` -- a no-op while minimized.
  - `platform_impl/windows/window.rs:584-597` (`set_minimized`) leading to `platform_impl/windows/window_state.rs:390-402`: `ShowWindow(window, match new.contains(MINIMIZED) { true => SW_MINIMIZE, false => SW_RESTORE })` -- the only one of the three that issues `ShowWindow(..., SW_RESTORE)`.
  - `platform_impl/windows/window.rs:1500-1527` (`force_window_active`): `SetForegroundWindow`, with an Alt-key `SendInput` fallback -- confirmed as the mechanism the secondary's new foreground grant is defending.
  - `platform_impl/linux/window.rs:567-576` (`set_focus`): gated on `!self.minimized.load(...)`, the same shape as Windows -- confirmed as the basis for the new Linux todo.
- **Logging added.** The sentinel arm now `eprintln!`s once on receipt (`received single-instance focus sentinel -- raising the main window`) and once with the ok/err result of each of the three raise calls (`focus sentinel raise: unminimize={}, show={}, set_focus={}`), plus WARN lines for a missing window or a failed thread-schedule -- so a 46-07 re-run of the live gate can distinguish "sentinel never arrived" from "sentinel arrived but a call failed", which `46-LIVE-GATE.md`'s Check 3 record explicitly could not do.
- **Tray sites fixed.** Both the tray `"show"` menu arm and the `MouseButton::Left` left-click handler now call `unminimize()` before `show()`/`set_focus()`.
- **Secondary foreground grant (T-46-16).** `deliver_to_running_instance_windows` now calls `GetNamedPipeServerProcessId` on the owner-verified handle, then `AllowSetForegroundWindow` on that PID -- strictly after the `windows_pipe_owner_matches` check and strictly before `writeln!(file, ...)`. Never `ASFW_ANY`. A failed grant is a WARN only; the payload write and the secondary's unconditional `exit(0)` are untouched. Required one new `Cargo.toml` feature: `Win32_UI_WindowsAndMessaging`. `Cargo.lock` unchanged (`git diff --quiet` verified) -- a feature flag on an already-present crate adds no dependency.
- **Doc comment corrected (REQ-46-11).** The `open_about_window_from_tray` comment's "Consequently there is NO latent minimized-window gap" claim (previously proven wrong on Windows by the live gate) is now explicitly scoped to macOS, with a new "CORRECTED AGAIN" paragraph naming `46-LIVE-GATE.md` Check 3, the same tao-0.35.3 Windows cites above, and the Linux-todo pointer. `grep -c 'NO latent minimized-window gap' src-tauri/src/main.rs` returns 0.
- **Unix regions untouched.** The phase-46 Unix-region diff gate against baseline `5bc4fa825` prints nothing (verified after every main.rs edit in this plan). A stricter, literal whole-diff check (`git diff | grep '^[-+]' | grep -c '__GAMELIB_FOCUS__'` must print 0) also passes -- the doc-comment rewrite was restructured so the two lines enumerating the sibling raise sites (which name the Unix sentinel literal) stay byte-identical to HEAD, letting git's diff treat them as unchanged context (see `key-decisions`).
- **Linux todo filed.** `.planning/todos/pending/2026-09-24-linux-unix-focus-sentinel-arm-may-not-restore-a-minimized-window.md` (`severity: minor`, `platform: linux`, `ready: blocked`), documenting that the Unix `__GAMELIB_FOCUS__` arm has the identical unfixed shape and is unmeasured on Linux, deliberately left untouched because it sits inside a `#[cfg(unix)]` region the phase-46 gate pins byte-identical.
- **11 new jest gates, mutation-proven.** Added to the Phase 46 describe block in `tauriShellSource.test.ts`, additions-only diff (`git diff | grep '^-' | grep -v '^---'` empty): 4 positive-source tests (sentinel-arm ordering + logging, tray "show" ordering, tray left-click ordering, secondary-grant ordering/least-privilege) and 7 RED self-tests (3 for the sentinel arm -- missing unminimize, wrong order, and region-discipline against a token placed outside the arm's own boundary -- plus 1 each for tray "show", tray left-click, grant-ordering, and grant least-privilege). `-t "46-06"` runs 13 (11 new plus 2 pre-existing unrelated `REQ-46-06` tests that substring-match), `-t "unminimize"` runs 10, `-t "AllowSetForegroundWindow"` runs 3 -- all passing. Full file: 199/199 passing. `pnpm exec eslint` clean, `npx prettier --check` clean.
- **Mutation proof.** Temporarily deleted `window.unminimize()` from the sentinel arm; `pnpm exec jest ... -t "46-06"` then failed exactly the test named `46-06 Region: the Windows sentinel arm calls unminimize() before show() before set_focus(), and logs receipt` (12 passed, 1 failed, as expected -- every other 46-06 test, including the RED self-tests, still passed because they drive synthetic source, not the real file). Restored the line; `git diff` against the Task 1 commit (`919c4dd57`) for `src-tauri/src/main.rs` returned empty, confirming a clean restore.
- **cargo check/test green.** `cargo check --bin gamelib-shell`: 0 errors, the identical 9 pre-existing warnings as the pre-plan baseline (none name a symbol this plan touched). `cargo test --bin gamelib-shell`: 234 passed, 0 failed, 2 ignored.
- **Debug NSIS installer rebuilt from the committed fix.** No pre-existing GameLib/sidecar process was found in the pre-flight check (`Get-Process gamelib-shell`, `Get-CimInstance ... sidecar.js` both empty), so no process was killed at any point in this plan (the file-lock incident 46-04 hit, and its kill-the-process remedy, did not recur and would have been forbidden by this plan regardless). Build command: `pnpm exec vite build && pnpm build:sidecar && pnpm build:decompress-worker-dev && pnpm tauri build --debug --bundles nsis`, run in the background and polled to completion. Exited 1 at the documented, expected step: `Error A public key has been found, but no private key. Make sure to set 'TAURI_SIGNING_PRIVATE_KEY' environment variable.` -- after `installer.nsi` and the setup `.exe` were written.
- **46-05 closed out as a FAIL.** `46-05-SUMMARY.md` records `outcome: live-gate FAIL (Check 3)`, `requirements-completed: []`, that Task 3's FAIL branch left the todo in `pending/` and `U-34.5-18` OPEN, and that the re-gate plus all closure duties move to plan 46-07 (which will record in `46-LIVE-GATE-RERUN.md`, leaving `46-LIVE-GATE.md` intact as the historical FAIL record). `.planning/STATE.md` untouched by this plan beyond the orchestrator's own pre-existing begin-phase update.

### Build evidence (this build vs. the state at 46-LIVE-GATE.md's FAIL)

| Field | Value |
|---|---|
| HEAD sha at build time | `5b6201e261ac39e6addfcc15028cb86bb74ed0d9` (Task 2 commit) |
| Setup .exe path | `src-tauri/target/debug/bundle/nsis/GameLib_0.7.0_x64-setup.exe` |
| Setup .exe size | 114,778,338 bytes (~109.5 MiB) |
| Setup .exe mtime | 2026-09-24 07:35:41 +1200 (later than the Task 2 commit, 07:32:51 +1200) |
| `installer.nsi` `Classes\gamelib` line count | 6 (`grep -cF 'Classes\gamelib'`) |
| `gamelib-shell.exe` sentinel literal | present, count 1 (`grep -caF 'received single-instance focus sentinel -- raising the main window'`) |
| Build exit | 1, at the expected `TAURI_SIGNING_PRIVATE_KEY` signing step |
| Process killed to clear a lock | **No** -- none was found; none was killed |

## Task Commits

Each task was committed atomically:

1. **Task 1: Windows raise fix (unminimize + logging, secondary grant, tray sites, corrected comment, Linux todo)** - `919c4dd57` (fix)
2. **Task 2: 46-06 source gates, mutation-proven** - `5b6201e26` (test)
3. **Task 3: Rebuild the debug NSIS installer, close out 46-05 as a recorded FAIL** - `02a37c4e3` (docs)

## Files Created/Modified

- `src-tauri/src/main.rs` -- Windows sentinel arm: `unminimize()` + receipt/result logging; secondary foreground grant (T-46-16); tray `"show"`/left-click `unminimize()`; corrected `open_about_window_from_tray` doc comment
- `src-tauri/Cargo.toml` -- added `Win32_UI_WindowsAndMessaging` to the windows-sys feature list (for `AllowSetForegroundWindow`)
- `src/backend/__tests__/tauriShellSource.test.ts` -- 11 new `46-06`-named jest gates, additions-only
- `.planning/todos/pending/2026-09-24-linux-unix-focus-sentinel-arm-may-not-restore-a-minimized-window.md` -- new, `ready: blocked`
- `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-05-SUMMARY.md` -- new, records the FAIL and hands closure to 46-07

## Decisions Made

See `key-decisions` in the frontmatter: (1) preserving the sibling-site enumeration lines byte-identical in the corrected doc comment, to satisfy a literal whole-diff acceptance check without touching the frozen `#[cfg(unix)]` region; (2) using positional `{}` format-string placeholders to match the plan's literal grep pattern rather than the more idiomatic named-capture style.

## Deviations from Plan

None -- plan executed exactly as written. The one non-trivial judgment call (the doc-comment restructuring to satisfy the `__GAMELIB_FOCUS__` diff-literal acceptance check) was a within-task correction to meet the plan's own stated acceptance criteria, not a deviation from its intent.

## Issues Encountered

The doc-comment rewrite initially failed one acceptance check (`git diff | grep '^[-+]' | grep -c '__GAMELIB_FOCUS__'` returned 2, not 0) because the required removal of the "no latent gap" claim and the required addition of Windows-correction prose both touched a paragraph that also named the Unix sentinel literal. Resolved by restructuring the paragraph so the sentence enumerating the four sibling sites -- which is still factually accurate and needed no correction -- stays byte-identical in place, letting git's diff algorithm read it as unchanged context while the surrounding sentences were substantially rewritten. Re-verified against the acceptance grep after the fix.

## User Setup Required

None -- no external service configuration required. The 46-07 re-gate is operator-driven (installing and running the rebuilt setup .exe) but is a separate, later plan.

## Next Phase Readiness

A debug NSIS setup .exe built from this plan's committed fix is ready for plan 46-07's re-gate against `46-LIVE-GATE.md` Check 3 (and the remaining, not-yet-run Checks 4-5). No blockers. The filed Linux todo (`ready: blocked`) is out of scope for 46-07 and stays pending until Linux hardware is available.

---
*Phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra*
*Completed: 2026-09-24*

## Self-Check: PASSED

All claimed files found on disk (`src-tauri/src/main.rs`, `src-tauri/Cargo.toml`,
`src/backend/__tests__/tauriShellSource.test.ts`, the new Linux todo, `46-05-SUMMARY.md`,
`46-06-SUMMARY.md`, the built setup `.exe`). All claimed commit hashes (`919c4dd57`, `5b6201e26`,
`02a37c4e3`, `4ade96590`) found in `git log --oneline --all`.
