---
created: 2026-08-31T18:20:00.000Z
title: "Tray 'About GameLib' opens the About window WITHOUT focus — on a multi-display setup it appears on another screen and needs Mission Control to find"
area: ui-window-management
status: OPEN
severity: minor
files:
  - src-tauri/src/main.rs
---

## Context

Reported by the operator on 2026-08-31 while running **criterion 5** of the Phase 35 live-gate
re-run (plan `35-29`).

Criterion 5's `Expected` is "About window appears" — it does appear, so the criterion was scored
**PASS** and this was filed separately rather than used to fail it. Recorded here so a passing
criterion does not silently absorb a real defect.

## Repro — operator's account

> when clicking on about from tray, focus did not move (and was open on another screen (control <)
> required to see it

1. Right-click the GameLib tray icon.
2. Click **About GameLib**.
3. The About window opens, but focus stays where it was. On a multi-display setup the window is on
   another screen and Mission Control is needed to locate it.

## Hypothesis — NOT MEASURED

`open_about_window_from_tray` (`src-tauri/src/main.rs:722`) does:

```rust
let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else { ... };
if let Err(e) = window.eval("window.api?.showAboutWindow?.()") { ... }
```

It evaluates the renderer call and stops. There is no `set_focus()`, no activation, and nothing
that raises the resulting About window or moves it to the active display. That is a plausible
cause, **but it has not been measured** and must not be treated as diagnosed. Note this project's
record on focus/mouse symptoms: two hypotheses were formed for the mouse-dead button and **both
were wrong**.

## Prior art — check this first

There is a FIXED sibling in the same class:
`reveal-in-finder-does-not-select-when-tauri-window-frontmost` — a cross-display action whose
visible half silently failed while the action itself succeeded. Read how that one was diagnosed and
fixed before designing a fix here.

## Ownership

Unowned. **No `resolves_phase:` is set deliberately** — Phase 35's gap-closure scope fence covers
the 5 verification gaps and the 4 review criticals only, and this is neither. It must not
auto-close when Phase 35 completes.
