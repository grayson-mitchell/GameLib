---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
part: A (Rust crates)
fixed_at: 2026-11-16
review_path: .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 80: Code Review Fix Report, Part A (Rust crates), iteration 2

**Fixed at:** 2026-11-16
**Source review:** .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md (the re-review after the first fix pass)
**Iteration:** 2. The finding IDs below are the iteration-2 IDs in REVIEW.md Part A. They are not the iteration-1 WR-01 and WR-07, although they are those findings' residuals. The iteration-1 report is in git.

**Summary:**

- Findings in scope: 2 (the Part A Warnings; Info excluded by scope)
- Fixed: 2
- Skipped: 0

**Verification** (crate `gamelib-steampoll`, after rebasing on main at `1c3fbd866`):

- `cargo test -p gamelib-steampoll --features testing`: all passed.
- `cargo clippy -p gamelib-steampoll --features testing --all-targets -- -D warnings` is clean on the host (aarch64-apple-darwin), `x86_64-pc-windows-msvc` and `x86_64-unknown-linux-gnu`.
- `cargo fmt -p gamelib-steampoll --check` is clean.

Each regression test was also run against the old source and failed there. The numbers are under each finding.

## Fixed Issues

### A/WR-01: The conflict scan compares the validated segment against other manifests' raw `installdir`

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs`, `src-tauri/crates/gamelib-steampoll/tests/acf_copies_security.rs`
**Commit:** c4a444479
**Applied fix:**

- A new `top_level_segment` returns the folder directly under `common/` that a raw installdir lives in.
  - `/` and `\` both act as separators on every OS, and empty and `.` segments are skipped.
  - On Windows, trailing dots and spaces are trimmed, because Win32 strips them.
  - It returns `None` (unparseable) for an empty or absolute installdir, any `..` segment, `:`, NUL, or nothing left after trimming.
- `find_other_manifests_with_installdir` reduces **both** sides with it before calling `same_installdir`. Reducing both sides keeps the TS callers correct: `cancelDelete.ts` passes a raw installdir, so reducing only the other side would have missed an exact `Studio/GameB` == `Studio/GameB` match.
- An unparseable other installdir counts as a conflict, which downgrades the removal to manifest-only. An unparseable target returns `UNKNOWN_CONFLICT`.
- The doc comments on the function and on `remove_copy` were updated to match.

**Tests:** 7 new tests. Each puts `10 = "Studio"` next to an `11` with a different spelling, then asserts a manifest-only removal and that `common/Studio/GameB/game.bin` survives. The spellings covered:

- `Studio/GameB` and `Studio\GameB`
- `Studio/`
- `.\Studio` and `./Studio`
- `Studio.` and `Studio ` (cfg(windows) only)
- unparseable: `""`, `/`, `../Studio`, `Foo/../Studio`, `C:\Studio`, `/abs/Studio`

A further test checks that a different folder (`Studios/GameB`) still allows the full delete.

On the old source, the 5 tests compiled on macOS fail at the "shared files deleted" or "expected manifest-only" assertions (14 passed, 5 failed). The cfg(windows) case was compiled through clippy for msvc, but not run.

**Behaviour note:** treating an empty other installdir as a conflict means that any such manifest in a library makes every removal from that library manifest-only. Steam does not write installed manifests without an installdir, and the review asked for unparseable to fail safe, so I kept it.

**Out of scope, still open:** the TS `uninstallBottleGameDirectly` still deletes `relFromCommon.split(sep)[0]`. That is Part C's file. Its conflict scan calls this Rust function, so it now gets the both-sides reduction.

### A/WR-02: `RunningPoll::start` races a concurrent `stop`, leaving an uncancellable poller

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/running.rs`, `src-tauri/crates/gamelib-steampoll/tests/running.rs`
**Commit:** 4a4100057
**Applied fix:** I applied both of the review's options.

- `start()` now calls `registry.register` inside the state critical section. The lock order is state -> registry map. Nothing takes them in reverse: `PollGuard::drop` and `cancel_all_and_wait` take only the map.
- `start()` stores the token in a new `State.token`, and cancels any token it replaces.
- `stop()` takes and cancels `State.token` under the same lock, instead of calling `registry.cancel` before taking it.
- Shell shutdown through `cancel_all_and_wait` still works, because the registry entry holds the same token.
- The public API is unchanged.

**Test:** `start_racing_stop_on_other_threads_never_orphans_a_poller`.

- Setup: 20 rounds, each with one std thread looping `start()` 2000 times and another looping `stop()` until the first finishes, released together by a barrier. Then a final stop, a start and one 5 s tick under paused time.
- Assertion: exactly one probe.
- Old source: it failed in 3 of 3 runs, with 26, 84 and 55 probes per tick (orphaned pollers).
- New source: it passed 28 of 28 runs.

The first version of the test raced a single start against a single stop and did not reproduce the race on the old code, so it was replaced with the looping form.

**Status note:** this changes concurrency logic. The test is strong evidence but is probabilistic by nature, so a human should check the lock-order claim (`fixed: requires human verification` on the ordering argument only).

## Skipped Issues

None.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
