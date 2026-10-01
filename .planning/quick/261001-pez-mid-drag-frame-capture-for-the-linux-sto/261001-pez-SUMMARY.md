# Quick 261001-pez: mid-drag frame capture for the Linux store embed

**Result:** the "per-frame staleness during a continuous drag" gap that 260930-feh recorded as NOT MEASURED is now
measured. The embed TRAILS the window during a grow-drag, exposing a black strip on the right and bottom, and
converges about 85-135 ms after the last resize event. It does not tear, overhang, or stay stale.

## What was built

- `middrag_capture.py`: grabs ~58 fps frames of the window's client area for the whole run (pre-roll, drag, 2.5 s
  hold), stamping each with the host clock and the X size. `--pointer` drives a real xdotool corner drag instead of
  `windowsize`.
- `middrag_check.py`: scores the black strip between the embed's right/bottom edge and the window edge (median over 5
  probe lines, 3 px window border excluded). `--selftest` is 16 of 16 PASS. A run is INVALID unless the pre-drag and
  final frames both score 0.
- `middrag_arm.py`: the 260930-feh driver arm with a mid-drag stage added (grow | shrink | pointer-grow | pointer-shrink).
  It needs the `drv.py` / `launch.sh` of
  `.planning/debug/linux-embed-resize-dead-after-epic-roundtrip-driver/`; `launch.sh` was copied to scratch with the
  binary swapped for the release one and `--no-vite` added.

## Measured

Conditions: release binary `src-tauri/target/release/gamelib-shell` (built 2026-10-01 07:28, includes `d71269c2a`),
X11, DMABUF unset, NVIDIA 580.173.02, fresh `createFakeHomeProfile()` per launch, GOG in the slot, 1100x650 <-> 1280x800,
60 steps 16 ms apart. One host. `compute` graphics mode.

| run | mode | frames | max strip R / B (px) | time exposed | converged after last event | verdict |
|-----|------|-------:|---------------------:|-------------:|---------------------------:|---------|
| g1  | grow            | 228 | 54 / 45 |  987 ms |  94 ms | VALID |
| g2  | grow            | 232 | 51 / 43 |  983 ms | 108 ms | VALID |
| p1  | pointer grow    | 257 | 33 / 22 |  280 ms |  84 ms | VALID |
| p2  | pointer grow    | 253 | 51 / 34 | 1018 ms | 133 ms | VALID |
| s1  | shrink          | 234 |  0 /  0 |    0 ms |    n/a | VALID |

- **Grow:** the window chrome follows live while the embed lags the whole drag (exposed time equals the drag
  duration, about 1 s). The strip is the main webview's background showing through; `evidence/g1-frame-0070-strip-mid-grow.png`
  shows it. Every run's final frame is flush (gap 0) and converged 84-133 ms after the last event, well before the
  shell's 500 ms settled line (543-569 ms after).
- **Pointer drag:** a real corner drag was achieved (pointer drags ended at 1280x770, the window manager clamped the
  height). Exposure varied 280 ms to 1018 ms between two identical runs, so a single pointer run is not a rate.
- **Shrink scores 0 by construction.** The scan sees an uncovered strip, not an embed larger than the window (the
  window clips it). A shrink-drag overhang is NOT measured.

## Not measured / caveats

- Perceived lag (the operator-judgement half of 38-E04). A ~1 s black strip while growing is real and visible; whether it
  is acceptable is the operator's call.
- Not diagnosed: why the embed trails. The renderer-to-GTK path is debounced, not per-frame, by design.
- One launch (`g3`) stayed on the "Loading" splash for the 60 s boot ceiling and was excluded (INVALID by the driver). That
  is the second unexplained splash stall recorded (the AppImage `a4` was the first); the rate is still unmeasured.
- One host, X11, scale 1.0, a fake profile. Not Wayland, not the AppImage or CI artifact, not a real logged-in profile.
- No code in `src/` or `src-tauri/` was changed; nothing committed, pushed or tagged. STATE.md and the pending todo are
  not edited by this task.

## Files

`evidence/*-frames.txt` (per-frame logs), `evidence/g1-settled.log`, `evidence/g1-frame-0070-strip-mid-grow.png`. The
~230-frame PNG sets per run were left in scratch (about 1 GB); the logs plus the scorer reproduce the numbers only with
the frames, so re-run `run.sh`-style (see `middrag_arm.py`) to regenerate.
