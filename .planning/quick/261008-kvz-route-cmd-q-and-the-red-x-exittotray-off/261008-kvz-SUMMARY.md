---
phase: quick-261008-kvz
plan: 01
subsystem: tauri-shell
tags: [tauri, macos, quit-path, sidecar, live-gate]
requires: []
provides:
  - "Cmd+Q, the red X (exitToTray off or no tray) and tray Quit all route through quit_via_sidecar -> sidecar handleExit()"
affects: [src-tauri/src/main.rs]
tech-stack:
  added: []
  patterns:
    - "one routing fn with an injected-policy twin (route_quit_via_sidecar) for unit tests"
    - "macOS Cmd+Q via a replaced app-menu item, not an ExitRequested interceptor"
key-files:
  created:
    - .planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/
    - .planning/todos/pending/2026-10-08-dock-quit-and-logout-bypass-the-pending-operations-confirm.md
  modified:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - .planning/todos/completed/2026-10-05-tray-quit-bypasses-the-pending-operations-confirm.md
decisions:
  - "Cmd+Q is fixed by replacing the default app menu's predefined Quit; ExitRequested is observed, never prevented"
  - "Close handler attached unconditionally; prevent_close() first, then Hide or RouteQuit via close_request_action"
metrics:
  tasks: 3
  commits: 2
  completed: 2026-10-08
status: complete
plan_head_before: f79d3a27cea58f37b3f29fea11c9cda8e00464e8
plan_head_after: 1da8348b88b9bc2d39bc24acbdb6fdfd4e71b669
actuals:
  tokens: 60000
  tasks: 3
  commits: 2
---

# Phase quick-261008-kvz Plan 01: route Cmd+Q and the red X through the sidecar's pending-operations confirm Summary

Cmd+Q, the red X (exitToTray off or no tray) and tray Quit now share one `quit_via_sidecar` route into the sidecar's `handleExit()`, proven live on macOS with a pre-fix negative control; the todo is closed and the Dock/logout residual is filed.

BASE = `f79d3a27c`, FIX = `0af008b98`, docs/evidence commit = `1da8348b8`.

## Planner finding that shaped the fix

macOS Cmd+Q is the AppKit selector `terminate:` (muda maps the default menu's predefined Quit to it); tao 0.35.3 has no
`applicationShouldTerminate:`, so it reaches `RunEvent::Exit` and never `ExitRequested`. Fix: replace the predefined Quit with a
custom `CmdOrCtrl+Q` item (id `app_menu_quit`) routed to `quit_via_sidecar`; `ExitRequested` is only logged.

## RED -> GREEN

- `tauriShellSource.test.ts`: 6 failed / 244 passed on the pre-fix tree (2 renamed tray assertions + 4 new pins) -> 250/250.
- `appShellFlows.test.ts`: 1 failed / 47 passed (quit marker) -> 48/48.
- `cargo test quit_`: 9 passed (4 `tray_quit_*` + 5 `quit_routing_*`; `--list` count 9); `cargo fmt --check` exit 0; clippy 22 warnings before and after;
  `pnpm codecheck` exit 0; prettier clean on the three TS paths.

## Live gate (see evidence/RESULTS.md)

| Arm | Result |
| --- | --- |
| 5 red X, exitToTray on | PASS (hides, no confirm) |
| 1-No Cmd+Q | PASS |
| 2-No red X, exitToTray off (window stays onscreen) | PASS |
| tray Quit-No (optional) | PASS |
| 1-Yes Cmd+Q | PASS |
| 2-Yes red X | PASS |
| 3a Cmd+Q, nothing pending (0.76s) | PASS |
| 3b red X, nothing pending (0.71s) | PASS |
| Dock Quit (optional residual) | bypass CONFIRMED, filed as todo |
| 4 negative control, pre-fix binary | PASS (bypass reproduced, 0.45s, no panel) |

The pending operation was the `GamesConfig/lock` file (`isLocked`), not a running download. The panel is out of process (owner
`UserNotificationCenter`); it was proven by CGWindowList plus window-scoped captures.

## Deviations from Plan

**1. [Rule 1 - environment] Answering the confirm.** The plan's Return keystroke needs the shell frontmost; the display session was locked for about 15 minutes during launch L1
and a first L1 No answer could not be delivered (that launch's unscored attempt was later answered Yes by something I did not drive). The arms were re-run cleanly on L2/L3 with the
frontmost pid asserted before every Return; Yes was answered by CGEvent click at panel-derived coordinates. L1 contributes only arm 5.

**2. [Rule 3 - ordering] Launch sequencing.** Arms 2-No and 1-No ran on one launch (L2), then 1-Yes on L2, 2-Yes on L3, so fewer relaunches than the plan's list; every arm still ran under its stated armed state.

**3. Build-before-remove in the menu swap.** `route_app_menu_quit_through_sidecar` builds the replacement item before removing the predefined one and re-inserts the original if the insert fails (stricter than the plan).

No auto-fixed bugs; no package installs; Cargo.lock and package.json unchanged.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model.

## Self-Check: PASSED

- FOUND: commits 0af008b98 and 1da8348b8; `git diff --quiet -- src-tauri` exits 0; exitToTray restored to `true` (config.json byte-identical to the snapshot); lock file absent; no shell/sidecar/tauri-dev process left.
- FOUND: evidence/RESULTS.md, the three todo changes, `pnpm planning-gates` 12/12.
