---
created: 2026-09-24
title: 'Linux: the Unix __GAMELIB_FOCUS__ single-instance socket arm may not restore a minimized main window, unmeasured'
found_during: phase 46 plan 46-06 (Windows Check 3 gap closure)
severity: minor
platform: linux
ready: blocked
area: src-tauri/shell
files:
  - src-tauri/src/main.rs
---

## Mechanism

Plan 46-06 fixed `46-LIVE-GATE.md` Check 3 on Windows: the Windows focus-sentinel arm
(`handle_windows_single_instance_connection` in `main.rs`) called `show()` + `set_focus()` with
no `unminimize()`, and on Windows that pair does not restore a minimized window (tao-0.35.3's
`platform_impl/windows/window.rs:164-172,175-186` — `set_visible(true)` issues no `ShowWindow`
call for an already-visible window, and `set_focus()` is gated on `!is_minimized`).

The Unix `__GAMELIB_FOCUS__` socket arm (`main()`'s `#[cfg(unix)]` accept loop, `if trimmed ==
"__GAMELIB_FOCUS__" { ... }` near line 9753) has the identical shape — `show()` + `set_focus()`,
no `unminimize()` — and it is **UNCHANGED** by plan 46-06, deliberately: it sits inside a
`#[cfg(unix)]` region pinned byte-identical to the pre-phase baseline (`5bc4fa825`) by the
phase-46 Unix-region gate (`.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-unix-cfg-regions.awk`).

That arm is measured **correct on macOS** (AppKit `makeKeyAndOrderFront:`, called from `show()`,
deminiaturizes the window — see the `open_about_window_from_tray` doc comment in `main.rs`,
corrected by quick `260907-9co` and again by plan 46-06). It is **unmeasured and suspect on
Linux**: tao's Linux implementation (`platform_impl/linux/window.rs:567-576`) gates `set_focus()`
on `!self.minimized.load(...)` the same way Windows gates it on `!is_minimized` — the same class
of bug plan 46-06 just fixed on Windows may be live on Linux too, just never observed.

## Why `ready: blocked`

Confirming or fixing this needs a live Linux machine — hardware not to hand on this development
machine (Windows 11, per this plan's execution context). It is not `code`: any fix here would
touch a `#[cfg(unix)]` region, which the phase-46 Unix-region gate deliberately pins
byte-identical to the pre-phase baseline, so a code fix here needs its own phase or quick task
that **deliberately re-baselines that gate** — not a drive-by edit. It is not `live-gate` (no
live run on this Mac/Windows machine can produce a Linux observation) and not `human` (no
decision is pending, only a measurement and, if confirmed, a scoped fix).

## Verification (once unblocked)

A live Linux session where:
1. GameLib is running with its main window minimized.
2. A bare second launch (or any other action that sends `__GAMELIB_FOCUS__` over the Unix
   single-instance socket) is triggered.
3. The existing window is restored and focused — not left minimized.

If the window is NOT restored, the fix is the same shape as plan 46-06's Windows fix: add
`window.unminimize()` before `window.show()` in the Unix arm, then re-baseline the phase-46
Unix-region gate's pinned baseline commit to include that change.
