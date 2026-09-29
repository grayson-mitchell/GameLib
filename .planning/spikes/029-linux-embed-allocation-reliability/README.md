---
spike: 029
idea: idea-c-tauri-rearchitecture
name: linux-embed-allocation-reliability
type: standard
validates: "Given spike 028's 10-of-11 degenerate embed allocation on Linux, when the untested window-focus/mapping hypothesis (plus present, wait-for-map, show_all, nudge-resize, queue_resize and off-main-thread add_child) is tested N=10 per variant with a fresh fake profile per attempt, then does anything reliably make the embed allocate, and is the reparent_fixed lever reliable"
verdict: PARTIAL
related: [025, 026, 028]
tags: [tauri, webview, multiwebview, unstable, embed, linux, webkit2gtk, gtk, gtkfixed, reliability, focus, nvidia, phase-38]
---

# Spike 029: Linux embed allocation reliability

## What This Validates

Spike 028 found the `add_child` embed stuck at GTK's never-allocated sentinel (`{-1,-1,1,1}`) in
10 of 11 runs and recorded a window-focus/mapping hypothesis as untested. Its own recommendation:
resolve that BEFORE building any layout code. This spike tests it, then re-measures the
`reparent_fixed` + `fixed_move` lever for reliability.

## How to Run

```
export CARGO_TARGET_DIR=<repo>/src-tauri/target
cd .planning/spikes/029-linux-embed-allocation-reliability/app && cargo build
cd .. && ./run-variants.sh 10 plain reparent blur blur_reparent offmain present wait_map show_all nudge_resize queue_resize
./run-control028.sh 6      # 028's ORIGINAL Phase 9 sequence, same profile/env
python3 analyze-control.py
```

One process == one attempt of ONE variant (`SPIKE_029_VARIANT`), a fresh disposable fake profile
per attempt (all eight variables from `jest.setupContainment.ts`; the session env is otherwise
inherited, see Investigation Trail 1). Per-attempt verdicts land in `results/<variant>-<i>.json`.
Classification is measured on the embed widget's OWN GTK allocation (`with_webview` ->
`PlatformWebview::inner()`), not wry's `bounds()`: `ALLOCATED` = w>1 && h>1; `DEGENERATE` = the
sentinel; for `*reparent*` variants `EXACT` = the requested 700x400.

## Results (measured)

| variant | what it does before/after `add_child` | attempts | outcome |
|---|---|---|---|
| plain | nothing | 10 | 10 ALLOCATED |
| present | `present()` + `set_focus()` + pump first | 10 | 10 ALLOCATED |
| wait_map | poll until mapped AND toplevel-focused | 10 | 10 ALLOCATED |
| blur | `xdotool windowactivate` ANOTHER window first (`hasToplevelFocus:false`, `isActive:false` recorded) | 10 | 10 ALLOCATED |
| offmain | `add_child` from a non-main thread (the real backend's command-thread shape) | 10 | 10 ALLOCATED |
| show_all | `show_all()` on the embed widget | 10 | 10 ALLOCATED |
| nudge_resize | +1px window resize after create | 10 | 10 ALLOCATED |
| queue_resize | `queue_resize()` on the shared vbox | 10 | 10 ALLOCATED |
| reparent | `reparent_fixed` + `fixed_move` 700x400 @150,250 | 10 | 10 EXACT |
| blur_reparent | same, with the window unfocused | 10 | 10 EXACT |
| control (028's own Phase 9, incl. two resizes) | 028's original sequence | 6 | 6 of 6 baseline ALLOCATED; embed 700x400 at the end in 6 of 6 |

100 of 100 one-shot attempts allocated. **The degenerate state did not occur once.**

## Investigation Trail

1. **The harness would not start as first written.** Every launch aborted with
   `Could not create GBM EGL display: EGL_NOT_INITIALIZED` — with a fake HOME, without one, sandbox
   on or off. Not a spike defect: `nvidia-smi` reports `Driver/library version mismatch` (kernel
   module 580.159.03 vs userspace NVML 580.173; `journalctl -k` NVRM lines; boot 2026-09-29 21:55).
   `WEBKIT_DISABLE_DMABUF_RENDERER=1` avoids the abort and is set as a constant for EVERY attempt
   above. `env -i` was tried first and is not the cause. GTK layout does not depend on the renderer,
   but this is a confound, see Results below.
2. **Focus/mapping refuted in its stated form.** `blur` runs held `hasToplevelFocus:false` for the
   whole run, mapped and realized, and still allocated 10 of 10 (and reparented EXACT 10 of 10).
   028's "the tool session held focus" condition is therefore not sufficient to reproduce it.
3. **028's own code path no longer reproduces it either.** `SPIKE_AUTORUN=1 SPIKE_ONLY_028=1`
   through the same fake-profile wrapper: 6 of 6 baseline (9b) 1280x450, resize 900->1100
   moved the split to 650/450 exactly as 028's run 1 read, and the Fixed rect held 700x400
   through the second resize. This corrects a first misread here: a `1280x61` in `list_webviews`
   was the MAIN webview (order in that list varies), not the embed.
4. **A real layout hazard, measured in the control runs.** With the `GtkFixed` packed as a SIBLING
   in the vbox, the main webview is squeezed to whatever the Fixed's natural height leaves:
   161px at 1100px window height, 61px (or 125px) after the resize back to 900px. The embed rect
   is exact; the main webview is not. Any build must not pack the `Fixed` as a vbox sibling.
5. **Tooling trap:** `pkill -f WebKitNetworkProcess` inside a command whose own text contains that
   name kills the calling shell (exit 144, no output). Put it in a script file.

## Results

**PARTIAL.**

- **Established:** the focus/mapping hypothesis does not reproduce the failure. The
  `reparent_fixed` lever is reliable in this configuration: 30 of 30 EXACT across plain, unfocused
  and control shapes, surviving two resizes. `add_child` from a non-main thread is fine.
- **Not established:** why 028 saw 10 of 11 degenerate. It did not reproduce in any of 100+ runs.
  The one variable that changed between 028's runs and every run here is the GPU path: 028 ran
  with a working NVIDIA GL stack and DMABUF/GBM rendering; today's runs are forced onto the
  DMABUF-disabled path because the driver is broken. That is a candidate, NOT a finding. It is
  untestable until the driver is fixed.
- **Gate for the implementing phase, unchanged in kind:** re-run the battery with
  `WEBKIT_DISABLE_DMABUF_RENDERER` UNSET on a machine with a working GPU stack. If it allocates
  100% there too, 028's failure was an environment artefact and the lever is buildable. If it
  degenerates, the fix lives in the renderer path and the layout code must wait on it.
- **Design constraint that IS established now:** do not pack the application's `gtk::Fixed` as a
  vbox sibling of the main webview (main gets squeezed to 61-125px). Overlay it (`gtk::Overlay`
  over the vbox) or make the Fixed non-expanding with main explicitly expanding, and re-measure the
  main webview's height, not only the embed's.

## Evidence

`results/*.json` (one per attempt: verdict, embed geometry, toplevel focus/map state before and
after) and `results/control028-*.jsonl`. No cookie or session data is captured (only geometry).
`run-variants.sh`, `run-control028.sh`, `analyze-control.py` reproduce every number.
