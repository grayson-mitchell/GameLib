# 38-E01 — verdict: PASS (sitting 13, Windows 11, 2026-09-30)

Scored against `e01-prediction.md`, which was written before the run.

**Host:** Windows 11 Home 10.0.26200, display DPI 120 (scale factor 1.25).

**Harness:** spike 027 `app/`, source unmodified. Native `cargo build` on `x86_64-pc-windows-msvc`
(rustc 1.98.1) finished clean in 1m17s. This also answers the MSVC type-check that spike 027 could
not reach from Linux. The lockfile resolves tauri 2.12.0, tao 0.37.1, wry 0.57.0 and
webview2-com 0.39.1. The harness's own `[env]` log line still says "tauri 2.11.5 / wry 0.55.1";
that is a hard-coded label that is out of date, not a measurement.

**Run:** `SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1`. It exited on its own after 30 s, and the autorun
reached `=== COMPLETE ===`. `hwnd_sampler.ps1` ran as a separate process and took 50 ms samples,
recording 35 distinct states.

| criterion | API log | OS (HWND) | result |
|---|---|---|---|
| P1 add_child ok, list shows main + store-embed | `add_child OK` in 95 ms; `["store-embed","main"]` | new `WRY_WEBVIEW` child of the main top-level at 04:28:04.803Z | PASS |
| P2 1a (290,96,760,560) ×1.25 | readback 363,120 950×700 | `363,120 950×700` | PASS (0 px) |
| P2 4a (290,96,900,700) ×1.25 | 363,120 1125×875 | `363,120 1125×875` | PASS (0 px) |
| P2 4b (10,400,400,300) ×1.25 | 13,500 500×375 | `13,500 500×375` | PASS (0 px) |
| 4c fractional (not scored) | 363,121 950×701 | position 363,121 seen; the sampler caught it between `set_position` and `set_size`, then the slot sync overwrote it | recorded only |
| P3 hide/show | ok/ok | 4d: container `HIDDEN`; 4e: visible again, rect unchanged | PASS (see note) |
| P4 destroy | `no webview 'store-embed'` after 7a | container subtree gone at 04:28:27.684Z | PASS |
| P5 content in placed region | — | shot-017: the Steam store exactly covers the dashed `#slot`; shot-020: the store renders only at the 4b rect, and the slot's "compositing failed" text is exposed as it should be | PASS |

**Geometry tracking (the "ResizeObserver-visible" clause), measured by proxy as pre-registered.**
The control panel's `#slot` element has a live ResizeObserver that calls `set_embed_bounds`
(`dist/index.html:128-132`). Each autorun log line grows the panel and shrinks the slot. The OS
record shows the container, and the cross-process `Chrome_RenderWidgetHostHWND` inside it, following
the slot in steps within about 100 ms: 1233×647 → 359 → 295 → 279 → 263 → 183 → 119 → 72 physical
height at the slot's own 353,70 (282.4,56 logical) origin. The renderer HWND tracks the container
to within 1 px. The page's own `innerWidth` was not instrumented.

**P3 wording note.** The prediction said the embed would come back "at the 4c rect". The slot
sync had already replaced the 4c rect (at 04:28:19.405Z) before `hide()` ran. The property that
matters, that the rect is unchanged across hide and show, holds.

**Anomaly, not scored and mechanism NOT proven.** While probe B's window was being created
(04:28:20.770Z), the MAIN window's embed moved to 353,111 33×543 and then 353,111 14×375, and
stayed there until 7a destroy. The API list (6b) reports the same rect, so this was a real move,
not a silent no-op. The harness uses no `auto_resize`, and the rect's left edge equals the slot's
left edge (282.4 logical). The most likely cause is the panel's slot sync reading a momentary
layout while focus moved to the new window. This is probable, not proven. It matters to GameLib only
if the real app's slot sync can read a momentary layout like this; that is a candidate follow-up,
not a finding.

**Probe B (bare Window + two add_child children):** the OS shows two containers at 0,0 400×900
and 400,0 975×900 in the new window, placed side by side as requested.

**Phase 8, `data_store_identifier` isolation (NOT scored here, per the item).** The "isolated"
child's jar reported all 15 cookies, including the Steam and GOG cookies from the shared jar. So on
WebView2, as on Linux, the identifier is a SILENT NO-OP. Source confirms it: wry 0.57.0 defines
`with_data_store_identifier` and the field that carries it only under
`#[cfg(any(target_os = "macos", target_os = "ios"))]` (`src/lib.rs:1579`, `:1612`). Recorded in
`.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`.

**Verdict: PASS on this host.** `add_child` attaches a real `WS_CHILD` WebView2 container to the
main window. The OS places it at the requested slot rect, scaled by the DPI with 0 px error. It
follows renderer-driven slot changes, hides, shows and destroys cleanly, and supports two children
in a bare window. **Claim limit:** ONE host, ONE DPI (1.25), ONE monitor, and the spike's lockfile
(tauri 2.12.0 / wry 0.57.0), NOT the shipped app. The shipped app does not compile `unstable` for
Windows (`src-tauri/Cargo.toml` target-gates it). HiDPI at 2.0 is 38-E03(b), and drag-resize latency
is 38-E04(b).

**Evidence:** `e01-run.log`, `e01-events-export.json`, `e01-stderr.txt` (all with third-party cookie
values redacted to `[REDACTED]`; names, domains and lengths kept), `e01-hwnd/hwnd-samples.jsonl`
(all 35 states), and 9 kept screenshots `e01-hwnd/shot-*.png`. The other 26 near-duplicate
screenshots were pruned for size.
