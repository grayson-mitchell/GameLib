---
phase: quick-260930-feh
plan: 01
subsystem: tauri-shell
tags: [linux, webkitgtk, store-embed, live-gate, hidpi, drag-resize, measurement]
requires:
  - quick 260930-blh (GTK-box-native embed layout, check_settled.py, cap.py, embed_live.ts)
  - quick 260930-ea0 (DMABUF-unset boot, probe_live.ts identity lines)
provides:
  - gate_live.ts (scale-aware fake-HOME harness that refuses the DMABUF/LD_PRELOAD workaround, per-WebProcess env identity, T-stamped settled lines)
  - region_diff.py, hidpi_check.py, settled_lag.py, drag_probe.py (each checker has a --selftest that rejects its failure shapes)
  - evidence/results.txt (13 CHECK lines, NOT_VERIFIED list) and a dated addendum on the positioning todo
affects:
  - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md (addendum only; frontmatter unchanged, ready: live-gate stays)
key-files:
  created:
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/gate_live.ts
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/region_diff.py
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/hidpi_check.py
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/settled_lag.py
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/drag_probe.py
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/BASE.sha
    - .planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/
  modified:
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
decisions:
  - S1_CONTROL is scored FAIL on the in-run evidence even though a clean relaunch passed, because the plan defined it on the s1 launch and the defect is real.
  - The scale-1 positive control for hidpi_check.py used the clean relaunch (s1b) because the s1 launch had no settled lines at the control sizes.
metrics:
  duration: about 25m
  completed: 2026-09-30
status: complete
commits: 4
plan_head_before: a8ec1e5eb835702198cb01f8a2dd832e9a4de54f
actuals:
  tokens: 23000
  tasks: 3
  commits: 4
---

# Phase quick-260930-feh Plan 01: Desk live gate for the Linux store embed Summary

Four fresh-fake-profile launches of the dev binary on this X11 host, with `WEBKIT_DISABLE_DMABUF_RENDERER` absent from the shell and from every WebKitWebProcess, measured E4b, E5, HiDPI at `GDK_SCALE=2` and drag-resize settle lag. 12 of 13 checks scored on their own terms; one real defect was found and recorded (S1_CONTROL FAIL) and was not diagnosed or fixed under the stop rule.

## Outcome: 13 checks

| Check | Verdict | Key numbers |
| --- | --- | --- |
| TRACER | PASS | slot `204,82,1076x718`, vbox 1280x800, scale 1.000, DMABUF/LD_PRELOAD/GDK_SCALE absent, 1 WebKitWebProcess `dmabuf=absent` |
| E4B | PASS | GOG -> Epic -> GOG: chrome 0.0000, left nav 0.0000, slot 0.1403 changed; 1 zero-area line on leaving, no new settled line on return |
| E5 | RECORDED | link click navigated (GOG GALAXY page); label `www.gog.com` before and after; Back arrow looked enabled; `back_moved_history=NO` (slot b->c 0.0002, a->c 0.6214) |
| S1_CONTROL | **FAIL** | see Findings. In-run: 0 settled lines across 3 resizes, 4 zero-area lines, embed stale at 1100x650. Clean relaunch: 6/6 pass, flush 0,0 |
| HIDPI_SCALE | PASS | measured X 2200x1294 / GTK vbox 1100x647 = 2.000 on both axes; shell and WebKitWebProcess both `GDK_SCALE=2` |
| HIDPI_FLUSH | PASS | `renderer_vs_gtk_logical=agree`: requested `204,82,896x565` = embed, flush 0,0; scale-1 control at 1100x650 and 1000x600 also flush 0,0 |
| HIDPI_RESIZE | PASS | 2000x1200 (vbox 1000x600) and back to 2200x1294: flush 0,0 both; WM clamps height (1300 -> 1294, initial 1600 -> 1294) |
| HIDPI_WHEEL | PASS | 5 wheel clicks at slot centre: slot 0.4873 changed, chrome 0.0000, left nav 0.0000 |
| HIDPI_CLICKTHROUGH | PASS | LIBRARY tab click reached main; Library route shown, no GOG pixels in the old slot |
| HIDPI_CRISP | RECORDED | glyph edges anti-aliased at device px, no 2x2 blocks seen (one crop, one observer) |
| DRAG_PERSTEP | PASS | 6/6 matched, 0 missing/stale/fail; lag 546-590 ms after the X size change |
| DRAG_BURST | PASS | 40 steps at 25 ms: 0 settled lines mid-burst, 1 correct line 571 ms after the final size; `burst_end_stale_frame_visible=no` (+100 ms and +1500 ms captures pixel-identical) |
| DRAG_POINTER | PASS | one best-effort WM drag achieved, 1280x800 -> 1100x700, matched, 570 ms (measured from mouse-up, see caveat) |

`FIX_TAKEN=no`. `src/` and `src-tauri/` are unchanged against `BASE.sha` (0 files). `38-VERIFICATION.md` is unchanged.

## Findings

**1. S1_CONTROL FAIL: window resize does not resize the embed after the Epic round trip and/or an in-embed link click.** In the first launch, after E4b and E5, resizing 1280x800 -> 1100x650 -> 1000x600 -> 1280x800 produced zero settled lines and four `ignored zero-area bounds (slot unmounted)` lines, one at each resize instant. At 1100x650 the embed stayed at `204,82,1076x718` and overhung the window (`evidence/s1/resize-1100x650-after-e4b-e5.png`). A fresh launch doing tracer -> the same resizes gave 6/6 passing settled lines with flush 0,0 (`evidence/s1/s1b-*`), and the HiDPI and drag launches also resize correctly. So plain resize is fine; the fault is in state left by the GOG -> Epic -> GOG round trip and/or the link navigation. The two triggers were not separated and the mechanism was not diagnosed: the stop rule forbids a diagnosis loop and a speculative fix. This affects the E4b PASS only in that E4b's own definition (embed back in the slot, chrome unchanged) still holds; the defect appears after it. It is not the 38-E04 drag branch, which passed from a clean state.

**2. E5: Back did not move history.** Recorded, not gating (Phase 40 Observable Truth 6 is FAILED on macOS itself).

**3. Epic has no in-app embed.** Its route shows the "isn't available in-app yet" panel, so E4b's "Epic" leg exercises a slot unmount to a plain React panel, not an embed swap.

## Deviations from Plan

**1. [Rule 3 - Blocking] Display was blanked when the first launch started.** GNOME's screen shield had blanked the display after idle (`ScreenSaver.GetActive=true`, `xset q` "Monitor is Off", `LockedHint=no`). The first captures were pure black. A mouse move woke it without unlocking. Recorded as environmental, not a blank launch (`BLANK_LAUNCHES=0`). The idle delay is 900 s; xdotool activity kept the display awake for the rest of the run, but a long pause between steps would blank it again.

**2. [Scope] Extra launch `s1b` (a fresh scale-1 launch with tracer then resize only).** Added after the S1_CONTROL failure to discriminate "resize is broken in general" from "state after E4b/E5". It is a control, not a diagnosis of the trigger. LAUNCHES for Task 1 = 2.

**3. Positive control source changed.** Task 2's scale-1 positive control ran `hidpi_check.py` over `s1b-settled.log` with `s1b-xwin-1100x650.txt` / `s1b-xwin-1000x600.txt`, not over the plan's `s1-*` files, because the s1 launch had no settled lines at those sizes (the same defect). Against the s1 files the checker returns `NO_MATCH` (exit 4), as it should. The plan's literal Task 2 verify line would therefore not pass as written; I ran the equivalent over s1b.

**4. Wheel target.** The slot centre falls under the GOG cookie banner. The wheel there still scrolled the page (slot 0.4873 changed), so no retry was needed.

## Caveats on the numbers

- Every drag lag includes the shell's 500 ms `SETTLE_MS` debounce by design, plus 50 ms of poll granularity (the `T=` stamp is the 50 ms drain time). `est_apply = lag - 500` (about 90 ms or less) is an estimate, not a measurement of the renderer-to-GTK path.
- The pointer arm's `t_x_final` is the first poll after mouse-up, so its 570 ms is measured from mouse-up, not from the last X size change.
- `HIDPI_CRISP` is one crop judged by one observer.
- `region_diff.py` slot fractions include page motion (the GOG carousel), so E4b's slot 0.1403 is not a "same image" measure; only the chrome and left-nav bands are gated.

## NOT MEASURED

- Per-frame staleness or tearing during a continuous drag (no settled line fires mid-drag; the only in-drag evidence is two burst-end captures).
- Perceived responsiveness (the ledger's "no visible lag" is perceptual).
- The renderer-to-GTK path separate from the debounce.

## NOT VERIFIED

Packaged AppImage/release build; a real logged-in profile (the two-profile rule's real-profile arm); Wayland; macOS; Windows; mixed-DPI or per-monitor scaling (X11 `GDK_SCALE` is global); fractional scales; Tauri's own `scale_factor()` (never read, the scale is inferred from X vs GTK sizes); keyboard focus and the first-open split frame; any host other than this one (NVIDIA 580.173.02, WebKitGTK 2.50.4); the trigger and mechanism of Finding 1.

## Stop-rule use

Fired once, on Finding 1: recorded as FAIL with evidence, no diagnosis loop, no fix. The other launches did not depend on the defective path and ran. No crash, hang or TRACER failure, so no BLOCKED checks.

## Known Stubs

None. No product code was written.

## Commits

- `5e9d96e39` test(quick-260930-feh): scale-1 desk live gate, tracer + E4b + E5 with DMABUF unset
- `9b61af62a` test(quick-260930-feh): HiDPI GDK_SCALE=2 desk gate, measured scale ratio and logical-px agreement
- `1bbd2b62a` test(quick-260930-feh): drag-resize settle lag and staleness measurement
- `63a187936` docs(todo): positioning todo addendum, desk live gate E4b/E5/HiDPI/drag (quick 260930-feh)

Branch `quick-260930-feh`, not pushed. Vite (started by this execution, pgid recorded) stopped; no `gamelib-shell` left; every teardown reported `POST_TEARDOWN_PROCS=0`.

## Verification run

- `python3` `--selftest` for `region_diff.py`, `hidpi_check.py`, `settled_lag.py` and blh's `check_settled.py`: all PASS.
- Every PASS claim re-derived from committed evidence by its checker (check_settled, region_diff, hidpi_check, settled_lag): reproduced.
- Todo base bytes are an unchanged prefix of the file (frontmatter unchanged); `pnpm planning-gates`: 12/12 passed.
- No committed evidence file contains the fake-profile directory prefix.
- Formatter: every file written lives under `.planning/`, which prettier ignores (`--file-info` reports `ignored: true`), so no `prettier --check` was run; it would be vacuous.

## Self-Check: PASSED

- Files present: `gate_live.ts`, `region_diff.py`, `hidpi_check.py`, `settled_lag.py`, `drag_probe.py`, `BASE.sha`, `evidence/results.txt`, `evidence/{s1,hidpi,drag}/`.
- Commits `5e9d96e39`, `9b61af62a`, `1bbd2b62a`, `63a187936` exist on `quick-260930-feh`.
