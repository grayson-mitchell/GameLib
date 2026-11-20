# 38-E01 — pre-registered criteria (written BEFORE the scored run)

Written 2026-09-30, sitting 13, Windows 11, before `SPIKE_AUTORUN=1` was run on this host.

Build: spike 027 harness, unmodified source, native `cargo build` on `x86_64-pc-windows-msvc`
(rustc 1.98.1). The lockfile resolves tauri 2.12.0 / tao 0.37.1 / webview2-com 0.39.1, which is
the harness's own lock, not the shipped app's.

Instruments, independent of each other:

1. **API log**: the harness's own `run.log`/`events-export.json`. It records whether `add_child`
   returned `Ok`, `list_webviews`, and Tauri's `position()`/`size()` readback. This is the API
   reporting on itself, so it is NOT sufficient alone (spike 026).
2. **OS geometry**: `hwnd_sampler.ps1`, run from a separate process. It records every descendant
   HWND of the spike's top-level windows, with class, visibility and client-relative rect in
   physical px, plus the window DPI, and captures a PNG on every change.

## PASS requires all of

- P1: `1a create_embed` has no `error`, and `1b list_webviews` shows `main` plus `store-embed`.
- P2: the OS instrument shows a NEW child HWND subtree appear inside the main window after 1a. Its
  outermost webview-container rect equals the requested logical rect scaled by `dpi/96`, within
  ±1 physical px on each edge, at 1a (290,96,760,560) and at each of 4a (290,96,900,700) and 4b
  (10,400,400,300). 4c's fractional rect is recorded but not scored; rounding is a named zone.
- P3: at 4d that container is not visible (or zero-sized), and at 4e it is visible again at the
  4c rect.
- P4: after 7a destroy, the container subtree is gone from the main window.
- P5: the screenshots at 1a and 4b show web content in the placed region and not elsewhere.

## Scoring

- FAIL if `add_child` errors, or if the OS rect does not follow the requested bounds while the
  API readback says it did (the spike-026 pattern). If that happens, name the mechanism.
- PARTIAL/NOT SCORED if the instruments disagree for a reason that is not the item's own
  question, for example a sampler timing miss on the 400 ms 4a/4b steps. That gets a re-run with
  the manual control panel, not a pass.
- "ResizeObserver-visible geometry updates" is measured by proxy: the renderer HWND
  (`Chrome_RenderWidgetHostHWND`, cross-process) size tracking the container. The page's own
  `innerWidth` is not instrumented, and that limit is stated rather than papered over.

Not scored here: phase 8's `data_store_identifier` isolation result. Record it in the todo
`2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md` per the item's own
instruction.
