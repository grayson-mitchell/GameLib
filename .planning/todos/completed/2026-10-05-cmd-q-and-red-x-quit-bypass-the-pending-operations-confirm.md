---
created: 2026-10-05T00:00:00.000Z
title: "Cmd+Q and the red X (exitToTray off) still quit without the sidecar's \"pending operations\" confirm"
area: tauri-shell
severity: medium
platform: macos
ready: live-gate
found_by: "Split out of 2026-10-05-tray-quit-bypasses-the-pending-operations-confirm.md when tray Quit was fixed, 2026-10-05"
files:
  - src-tauri/src/main.rs
---

## Problem

Tray Quit now routes through `quit_from_tray` -> the sidecar's `quit` listener -> `handleExit()`.
Cmd+Q and the red X with `exitToTray` off do not: the run closure handles only `RunEvent::Exit`
(no `ExitRequested`), and the `CloseRequested` handler falls through to a normal close when
`should_hide_on_close` is false. A running download is killed by `shutdown_child` with no prompt.

## Why it was not folded into the tray fix

It is not the same small change. The red X closes the window BEFORE any exit request, so
`handleExit()`'s confirm would have no parent window and an answer of "No" would leave a running
app with no window. Doing it properly means `prevent_close()` in `CloseRequested` and/or
`api.prevent_exit()` on `ExitRequested { code: None, .. }` (distinguishing the shell's own
`exit(0)` calls, which carry `Some(0)`), then routing through `quit_from_tray`. The Cmd+Q path is
macOS-specific and needs a live run to confirm `ExitRequested` fires with `code: None` there.

## Suggested fix

Reuse `quit_from_tray` (probe + send, `exit(0)` fallback). Intercept `CloseRequested` when it
would close (not hide) and `ExitRequested { code: None }`; verify live on macOS (Cmd+Q, red X)
with a download running and with none.

## Resolution (2026-10-08)

Closed by quick task 261008-kvz (fix commit `0af008b98`, base `f79d3a27c`).

**The suggested fix's premise was wrong, so the fix differs.** macOS Cmd+Q does NOT produce
`RunEvent::ExitRequested { code: None }` in the pinned versions (tauri 2.11.5, tauri-runtime-wry
2.11.4, tao 0.35.3, muda 0.19.3). `main()` never calls `.menu(...)`, so macOS gets `Menu::default`, whose app
submenu ends in `PredefinedMenuItem::quit`; muda maps that to the AppKit selector `terminate:`, and tao's
app delegate implements no `applicationShouldTerminate:` (only `applicationWillTerminate:`, which goes straight to
`Event::LoopDestroyed` -> `RunEvent::Exit`). `ExitRequested { code: None }` is emitted only after the last
window is already destroyed, so intercepting it would have caught nothing on macOS and stranded a windowless
app elsewhere.

**Change (`src-tauri/src/main.rs`).**

- `quit_from_tray` / `tray_quit_via_sidecar` / `TRAY_QUIT_PROBE_TIMEOUT` became `quit_via_sidecar(app, origin)` /
  `route_quit_via_sidecar` / `QUIT_PROBE_TIMEOUT`, one route serving tray Quit, Cmd+Q and the main-window close.
  Its lines now go through `shell_diag` (timestamped, kept in `gamelib-shell.log`).
- The main-window `CloseRequested` handler is attached unconditionally (it used to exist only when a tray did,
  and returned without `prevent_close()` when not hiding). `prevent_close()` runs first, then
  `close_request_action(tray_exists, should_hide_on_close(load_tray_settings()))` hides to the tray or routes the
  quit. A failed settings read routes, never hides.
- macOS only: `route_app_menu_quit_through_sidecar` replaces the default app menu's predefined Quit with a custom
  item (same label, `CmdOrCtrl+Q`, id `app_menu_quit`, deliberately not `quit`) whose menu event calls
  `quit_via_sidecar`. Every lookup/insert failure logs a WARN and leaves the default menu in place.
- `RunEvent::ExitRequested` is observed (`exit requested (code=...)` line), never prevented.
- The sidecar logs `[GAMELIB_SIDECAR_SEND_HANDLER] quit` as the first statement of its `quit` listener.

**RED -> GREEN.** `tauriShellSource.test.ts`: 6 failed / 244 passed on the pre-fix tree (the two renamed tray
assertions plus four new pins: close handler outside the tray gate, prevent-before-route with no bare early
return, the app-menu replacement, `ExitRequested` observed but never prevented) -> 250/250. `appShellFlows.test.ts`:
1 failed (the `quit` marker) / 47 passed -> 48/48. Rust: `cargo test quit_` 9 passed (4 `tray_quit_*` unchanged
in substance + 5 new `quit_routing_*`); `cargo fmt --check` exit 0; clippy 22 warnings before and after;
`pnpm codecheck` exit 0.

### Live gate

The pending operation was armed by creating `GamesConfig/lock` (the `isLocked` disjunct of `handleExit()`), NOT a
running download. That reaches the identical confirm branch, which is what the routing under test decides; it is
not evidence that a real download survives "No", which is `handleExit`'s pre-existing `response === 0 -> return`.
The panel is out of process (CGWindowList owner `UserNotificationCenter`) and was proven by CGWindowList plus a
window-scoped capture, never AX. Evidence: `.planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/`
(`RESULTS.md` indexes it).

### 1. Cmd+Q with a pending operation armed, answer No
expected: confirm appears; app, sidecar and main window survive; no kill lines.
result: pass - panel up with the routing line and sidecar marker, Return dismissed it, shell + sidecar alive, window onscreen=1 (arm-1-no-cmdq-lock-armed.md).

### 2. Cmd+Q with a pending operation armed, answer Yes
expected: confirm appears; Yes exits the shell and reaps the sidecar through `app_exit`.
result: pass - YES clicked by CGEvent, shell gone in ~1s, `exit requested (code=Some(0))` and `sidecar terminated on exit` logged (arm-1-yes-cmdq-lock-armed.md).

### 3. Red X with exitToTray off and a pending operation armed, answer No
expected: confirm appears; the main WINDOW stays onscreen after No (close prevented before the hand-off).
result: pass - window onscreen=1 throughout and after, shell + sidecar alive (arm-2-no-redx-exittotray-off.md).

### 4. Red X with exitToTray off and a pending operation armed, answer Yes
expected: confirm appears; Yes exits and the sidecar is reaped.
result: pass - same exit lines as item 2 (arm-2-yes-redx-exittotray-off.md).

### 5. Cmd+Q with nothing pending
expected: no confirm; prompt exit attributable to the sidecar route (shell line, sidecar marker, `code=Some(0)`).
result: pass - no panel at any 0.25s poll, shell gone in 0.76s, all three lines present (arm-3a-cmdq-no-pending.md).

### 6. Red X (exitToTray off) with nothing pending
expected: same as item 5.
result: pass - shell gone in 0.71s, all three lines present (arm-3b-redx-no-pending.md).

### 7. Red X with exitToTray on and a tray present
expected: window hides to the tray; no confirm; app alive.
result: pass - window onscreen=0, shell + sidecar alive, no `quit (window close)` line (arm-5-redx-exittotray-on.md).

### 8. Negative control: Cmd+Q on the pre-fix binary, same armed lock
expected: no confirm, app quits, none of the new lines.
result: pass - build identity confirmed (old log text, no `app menu` line), no panel, shell gone in 0.45s, no routing line, no `exit requested` line (arm-4-negative-control-prefix.md).

**Not covered.** Dock-menu Quit and logout/shutdown still send `terminate:` and still bypass the confirm. Dock Quit was
measured live (arm-dock-quit-residual.md): no panel, no routing line. Filed as
`.planning/todos/pending/2026-10-08-dock-quit-and-logout-bypass-the-pending-operations-confirm.md`. The no-tray
(`noTrayIcon` on) red X is pinned by the source test and the `quit_routing_*` Rust tests, not live-gated.
