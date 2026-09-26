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

## Resolution (debug session `linux-focus-restore-minimize`, 2026-09-26)

**Confirmed and fixed.** The `ready: blocked` state was stale: this session ran live on real
Linux hardware (Pop!_OS 22.04, GNOME Shell/mutter, X11 display `:1`, GTK 3.24.33) — the exact
condition this todo said was unavailable.

**Root cause confirmed exactly as suspected.** Read the actual vendored tao-0.35.3 source
(`platform_impl/linux/window.rs:558-576`, `event_loop.rs:296-324`, fetched live via `cargo
fetch`): `set_focus()` is gated on `!self.minimized.load(Ordering::Acquire) &&
self.window.get_visible()`, and `show()`'s underlying GTK call (`show_all()`) does not clear
WM-level iconic state per ICCCM. Only `unminimize()` (`set_minimized(false)` -> `deiconify()`)
clears it. A live GTK3/X11 reproduction faithfully porting this exact call sequence confirmed it
behaviorally: `_NET_WM_STATE_HIDDEN` persisted through a mirror of the current buggy arm
(`show_all()` + guarded no-op `set_focus()`) and only cleared to `_NET_WM_STATE_FOCUSED` after
mirroring the proposed fix (`deiconify()` + `show_all()` + `present_with_time()`) — reproduced
3/3 runs.

**Fix.** Added `window.unminimize()` before `window.show()` and `window.set_focus()` in the Unix
`__GAMELIB_FOCUS__` accept-loop arm (`src-tauri/src/main.rs`), matching the shape and logging
style of the already-shipped Windows fix (`handle_windows_single_instance_connection`, plan
46-06). Updated the `open_about_window_from_tray` correction-history doc comment with a third
entry, and added an inline comment at the fix site documenting the mechanism and the deliberate
divergence of this `#[cfg(unix)]` region from the phase-46 `46-unix-cfg-regions.awk` gate's
`5bc4fa825` baseline (the gate is a plan-invoked awk script parameterized by a `BASE` commit
passed at invocation time, not a checked-in pinned value — nothing to re-baseline beyond
documenting the intentional divergence, which the fix-site comments now do).

**Verification, multi-signal:**
1. Source-level: exact vendored tao-0.35.3 mechanism read directly, not paraphrased.
2. Behavioral: live GTK3/X11 reproduction on real GNOME Shell/mutter, 3/3 runs.
3. Compiler/linker: `cargo check --bin gamelib-shell` and `cargo test --bin gamelib-shell`
   against the actual patched `main.rs`, built via a root-free scratch prefix from this repo's
   own CI-documented native dependency list — 0 compile errors, 0 new warnings, 250/252 tests
   passing (the 2 failures reproduced byte-identically on unmodified `main`, unrelated to this
   fix).
4. Regression scope: the `46-unix-cfg-regions.awk` diff against baseline `5bc4fa825` shows
   changes confined entirely to the `__GAMELIB_FOCUS__` arm.
5. Formatting: `npx prettier --check --ignore-unknown src-tauri/src/main.rs` passes.

**Accepted gap, not silent.** No live end-to-end run of the actual compiled GameLib binary
sending a real `__GAMELIB_FOCUS__` byte string over the real Unix socket to a real minimized main
window — this machine has no `libgtk-3-dev`/`libwebkit2gtk-4.0-dev` headers installed and no
passwordless sudo available to install them. Operator confirmed 2026-09-26: "Confirmed fixed —
accept the live GTK/X11 reproduction plus cargo check/test/prettier as sufficient evidence,
without a full compiled-binary end-to-end run ... not worth blocking on."

See `.planning/debug/resolved/linux-focus-restore-minimize.md` for the full investigation.
