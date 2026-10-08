---
created: 2026-10-08T00:00:00.000Z
title: "Dock Quit and logout/shutdown still quit without the sidecar's \"pending operations\" confirm"
area: tauri-shell
severity: medium
platform: macos
ready: live-gate
found_by: "Quick task 261008-kvz (Cmd+Q / red X routing), 2026-10-08 -- residual left out of scope"
files:
  - src-tauri/src/main.rs
---

## Problem

Cmd+Q, the red X and tray Quit now all route through `quit_via_sidecar` -> the sidecar's `quit` listener ->
`handleExit()`. Dock-menu Quit and macOS logout/shutdown do not: they send the AppKit selector `terminate:`
directly to the application. tao 0.35.3's app delegate implements no `applicationShouldTerminate:`; it implements only
`applicationWillTerminate:`, which calls `AppState::exit()` and emits `Event::LoopDestroyed`, which
tauri-runtime-wry maps straight to `RunEvent::Exit` (`shutdown_child()` then kills the sidecar). No confirm, and
`RunEvent::ExitRequested` is never emitted on this path.

Source citations (vendored crates at the versions in `Cargo.lock`: tauri 2.11.5, tauri-runtime-wry 2.11.4, tao 0.35.3,
muda 0.19.3):

- `tao-0.35.3/src/platform_impl/macos/app_delegate.rs` L131-135 and `app_state.rs` L272-282 (`applicationWillTerminate:` only).
- `tauri-runtime-wry-2.11.4/src/lib.rs` ~L4185 (`LoopDestroyed` -> `RunEvent::Exit`); `ExitRequested { code: None }` only from the
  `TaoWindowEvent::Destroyed` arm after the last window is gone (~L4313), `Some(c)` only from `Message::RequestExit`.
- `muda-0.19.3/src/platform_impl/macos/mod.rs` ~L994 (predefined Quit -> `terminate:`).

## Measured, not only source-derived

Quick task 261008-kvz ran the Dock arm live (fix binary, `GamesConfig/lock` armed so `isLocked` is true): System Events
`AXShowMenu` on the `gamelib-shell` Dock tile then its `Quit` item produced NO confirm panel, the app exited, and the shell
log had no `quit (...)` routing line and no `exit requested` line; the sidecar never logged the `quit` marker. Evidence:
`.planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/arm-dock-quit-residual.md`. Logout/shutdown
was NOT run live; it is inferred from the same `terminate:` mechanism.

## Suggested fix to evaluate

Add `applicationShouldTerminate:` to tao's delegate class at runtime (objc2 `class_addMethod` on the delegate class), returning
`NSTerminateCancel` and routing through `quit_via_sidecar(app, "Dock Quit")`, so Dock Quit gets the same confirm and the
sidecar's `app_exit` -> `app.exit(0)` does the actual exit. Open decisions before building it:

- logout/shutdown behaviour as an explicit decision: cancelling termination during a system logout can block the logout or show
  macOS's "application canceled logout" notice, so either distinguish the reason (`NSWorkspace` power-off notification /
  `NSApp.terminateReply` semantics) and let a shutdown proceed, or accept the confirm;
- how the cancel reply interacts with the `exit(0)` fallback when the sidecar is dead (quit must never become a no-op);
- riskier than the Cmd+Q fix: it patches a framework-owned class at runtime, so it needs a live run on this Mac and a source pin.
