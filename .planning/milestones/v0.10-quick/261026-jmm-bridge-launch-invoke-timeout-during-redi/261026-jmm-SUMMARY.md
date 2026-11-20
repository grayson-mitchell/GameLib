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

## Live gate
**Live gate: pass — 2026-10-26.** Manor Lords (1363080), operator-driven `tauri dev` restarted after the fix (shell binary built 14:12:00 after the `main.rs` edit, shell pid 84859 started 14:15:10). Redist state reset: ledger moved to `gamelib-shared-redists.json.bak`, `HKLM\Software\Valve\Steam\Apps\CommonRedist` deleted with `reg delete /reg:32` (`system.reg` count 0 once wineserver flushed). Launched from the Library card at 14:18:20: vcredist 2022 x86/x64 installed 14:18:38-14:19:05, DirectX Jun2010 at 14:19:41, game started 14:19:43 (about 83 s from click), HELLO and GINIT ok=1 at 14:19:44. `gamelib.log` carries no `unhandled-rejection`; `gamelib-shell.log` carries no `invoke abandoned (timeout)` or `(dropped)` line for `channel=launch` under pid 84859 (earlier shell pids show five such pairs, including the 10-25 Manor Lords run). The operator reports the Library card showed `Installing Redistributables` and stayed steady until the game started. The ledger was rewritten and settled.

## Deviations
None.
