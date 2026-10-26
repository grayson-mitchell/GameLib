---
phase: quick-261026-jmm
plan: 01
status: complete
commits: [7e87679c4, 91bb753e8]
---

# Quick 261026-jmm: exempt `launch` from the shell invoke timeout

Added `"launch"` to `LONG_RUNNING_CHANNELS` in `src-tauri/src/main.rs`. The entry carries an inline rationale with the 261025-rkj Manor Lords measurement. Also corrected the `dispatch_tray_launch` doc, added the `launch_is_exempt` test, and extended the exact-set JS gate. `GameCard` now resets `isLaunching` in a `finally`. The todo is moved to `completed/` with a Resolution section.

## Verify
- cargo test exempt: 7 passed
- cargo test every_long_running_channel: passed
- cargo fmt --check: clean
- jest longRunningChannels + captureShellScrollback: 65 passed
- prettier check on both TS files: clean
- non-comment grep of `"launch",` in main.rs: 1
- pnpm codecheck: pass
- jest Library: 1166 passed
- pnpm planning-gates: 11/12. The failing gate is the STATE.md field-anchor check ("Plan: Not started" does not match `<N> of <M>`). This predates the task and is unrelated to the files changed.

## Residual
The live done-when (continuous Play-button state, no unhandled rejection on a redist-installing first launch) is NOT verified. It needs a live relaunch.

## Deviations
None.
