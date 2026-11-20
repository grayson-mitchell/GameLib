# Evidence: the saved Accessibility zoom's boot re-apply, observed on a real relaunch

Quick task `261015-pwy`. Closes the live gate owed by
`.planning/todos/completed/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md`,
filed by `261015-p3q`'s execution: the boot re-apply (`GlobalState.componentDidMount` ->
`applySavedZoomAtBoot` -> `window.api.setZoomFactor` -> `tauriSetZoomFactor` ->
`getCurrentWebview().setZoom()` -> `publishWebviewZoom('--webview-zoom')`) was pinned at the unit
level but had never been exercised through a real quit-and-relaunch cycle.

## (a) What was gated, and with which launcher

A `pnpm tauri:dev` build on this Mac, two launches:

- **Launch 1** (Task 1): started with the operator's as-found profile (`zoomPercent: 90`),
  read the untouched boot state, then drove the real Accessibility zoom slider to 150% via 6
  `ArrowRight` CGEvent keystrokes (the slider's own `onChange`, never a config hand-edit) and
  read the live apply. Left `zoomPercent: 150` persisted on disk and nothing running.
- **Launch 2** (Task 2): relaunched with 150 already persisted. Read the untouched boot state
  before touching anything, bracketed first paint with a screenshot burst, bounded the apply
  latency with 5 probes (which doubled as the `screen.availWidth` k-recomputation hazard test),
  then restored the profile to 90 via the range input's native setter + `input`/`change` dispatch
  (the CGEvent click could not grab the thumb's keyboard focus; this is the plan's sanctioned
  "dispatch fallback") and tore down.

Readback channel throughout: `window.api.logInfo(...)`, landing in `~/Library/Logs/GameLib/gamelib.log`
tagged `PWY <json>` (the `261015-n5k` precedent's channel; `document.title` is not a channel under
Tauri). The rig (`winlist.swift`/`click.swift`/`type.sh`) is the `261015-n5k` rig reused verbatim,
plus one script authored for this gate (`arrows.sh`, CGEvent arrow-key keystrokes) and one
(`task2_launch_burst.sh`) that launched detached, polled the log for Task 1's sidecar-readiness
marker, then ran a continuous `screencapture` burst keyed off `$SD/winlist` first reporting a
window taller than 300px.

Devtools auto-opened docked to the RIGHT of the window (not bottom, the `261015-n5k` default) --
the console prompt sits at a fixed offset from the window's top-left in this layout, found by
pixel measurement and used as `PROMPT_DX=613 PROMPT_DY=17` for every `type.sh` call this gate made.

## (b) Files

| file | what |
| --- | --- |
| `boot-reads.jsonl` | 7 `PWY` records straight from `gamelib.log`: the two untouched-boot reads (90, 150), the post-slider 150 read (Accessibility route and Library route), the 5x apply-latency/k-hazard probe, and the two restore records |
| `01-launch1-asfound-90.jpg` | Launch 1, as-found 90% boot, Library view, console open |
| `02-relaunch-first-frame.jpg` | Launch 2, earliest captured burst frame (rel -76ms to first window sighting), cropped to the window's own bounds |
| `03-relaunch-steady-150.jpg` | Launch 2, last captured burst frame (rel +5947ms), same crop -- steady-state comparison |
| `burst-index.tsv` | 54 rows, one per burst frame: `epoch_ms`, `ms_since_first_window_sighting`, `filename` |

Frames `02` and `03` are cropped from full-screen `screencapture -x -t jpg` captures (the burst
loop did not use `-l<windowID>`) to the window's own logical bounds (`116,65,1280,800` from
`winlist`, doubled for the 2x Retina physical-pixel capture) so the two are a fair visual
comparison of the same region.

## (c) Results

All `zoomProp` values are the live `--webview-zoom` custom property read off
`document.documentElement`'s inline style; `gridCols` is `getComputedStyle(.gameList).gridTemplateColumns`;
`tileWidth` is the `--library-tile-width` custom property (constant, 180px, the slider-chosen
width). Predicted factors: `f*k` at `f=0.9`, `k=1` -> level `-0.4531...` -> `0.9128709`; at
`f=1.5`, `k=1` -> level `2.2655...` -> `1.5774410`.

| arm | verdict | predicted | measured |
| --- | --- | --- | --- |
| untouched boot at 90 (Launch 1, before any slider touch) | pass | `zoomProp` 0.9128709 | `0.9128709291752769` |
| track px x `zoomProp` = tileWidth @ 90 | pass | 180px within 1px | 197.180115 x 0.9128709291752769 = 180.0000... |
| live apply after slider -> 150 (Accessibility route) | pass | `zoomProp` 1.5774410, label `(150%)` | `1.5774409656148782`, `labelText: "(150%)"` |
| post-slider tile re-check, Library route | pass | 180px within 1px | 114.108864 x 1.5774409656148782 = 180.0000... |
| **untouched boot at 150, real relaunch** (the todo's primary arm) | pass | `zoomProp` 1.5774410 | `1.5774409656148782` |
| track px x `zoomProp` = tileWidth @ 150, untouched relaunch boot | pass | 180px within 1px | 114.108864 x 1.5774409656148782 = 180.0000... (same track as post-slider -- correct from first Library paint) |
| first-paint flash bracket | bounded | -- | no 100%-rendered frame found in 54 frames spanning -76ms to +5947ms relative to first window sighting; flash is `< 119.1 ms, not resolved by a ~119.1 ms sampler` (mean of 10 calibration captures; min 99ms, max 226ms) |
| apply latency, 5x `setZoomFactor` probes (1.4 -> 1.5 each) | pass | sub-frame | mean 17.5ms, max 25ms over 10 transitions (5x to 1.4, 5x to 1.5), bounded below by `requestAnimationFrame` polling granularity (~16.7ms @ 60Hz) |
| `screen.availWidth` k-recomputation hazard | refuted | hazard: ~811 availWidth, ~0.676 k, ~0.956 resulting factor; expected: unchanged 1428, factor 1.44 | `availWidth` held at 1428 across all 5 probes; resulting factor `1.4399999999999997` (= 1.44) every time |
| profile restore to 90 | pass | `zoomProp` 0.9128709, on-disk `zoomPercent` 90 | `0.9128709291752769`, `sliderValue: "90"`, on-disk `"zoomPercent": 90` |

## (d) Conclusion

All three arms the source todo named are confirmed, not discovered-broken. Each verdict below opens
with a bare status word (`pass`, `fail`, `bounded`, `refuted`) followed by the number, never before it.

pass 1.5774409656148782 -- arm (a), primary. The boot re-apply works on a real relaunch. The
untouched-boot `--webview-zoom` at 150 matched the predicted `1.5774410` factor within 1e-5, the same
precision as the live-apply arm, and the `.gameList` track was already the 150%-correct width
(114.108864px) on the very first captured frame and stayed that width through the full 6-second burst
-- no multi-second stay at 100% was observed. Not a `bounded` or `fail`: nothing in this evidence
suggests the re-apply is slow, partial, or flaky.

pass 180px -- arm (b), the `--webview-zoom` property and tile-width check. Confirmed published and
correct on boot (not absent), and the Library tile width (114.108864px track x 1.5774409656148782
zoomProp = 180.0000...px) is correct from the first paint of that route, within the 1px pass bar --
closing the residual half of `261011-t4y`'s (c) that this todo's `## Arms to run` section named.

bounded < 119.1ms -- arm (a)'s first-paint flash. No 100%-rendered frame exists in the 54-frame, ~6s
burst (mean calibrated sampler interval 119.1ms); the flash is shorter than the sampler resolves, not
a multi-second stay. This is the ACCEPTED cost scored by arm (c) below, not a new defect.

pass 17.5ms -- apply latency, mean over 10 transitions (5x to 1.4, 5x to 1.5); max 25ms. Bounded below
by `requestAnimationFrame` polling granularity (~16.7ms @ 60Hz) -- the apply mechanism itself is
effectively instant.

refuted 1428 -- the `screen.availWidth` k-recomputation hazard, measured as a free by-product of the
apply-latency probe (arm (b)'s "for free" instruction). `availWidth` held at 1428 (unchanged) across
all 5 probes and resolved to the predicted 1.44 factor every time, not the ~0.956 hazard value. No
new todo is filed for it (Task 3 step 4).

pass 90 -- arm (c), the known limitation, scored as expected and the profile restore. The flash bound
measured above (`< 119.1ms`, sampler-limited) does not show the `componentDidMount`-layer first-paint
cost is unacceptable in practice, so the architectural question this todo's "Not in scope" section
named (moving the apply into shell/preload) is not reopened and nothing is re-filed for this arm. The
profile was restored to the as-found `zoomPercent: 90` (confirmed both in the live `zoomProp` and on
disk) before teardown.

No source file was touched. `src/frontend/state/savedZoomBoot.ts`, `src/frontend/state/GlobalState.tsx`,
and `src/preload/api/tauriWindowChrome.ts` -- the plan's deliberately-excluded files -- remain exactly
as `261015-p3q` left them.

## (e) Observations and limits

1. **The flash bound is a sampler bound, not a frame-stepped measurement.** Nothing in this rig
   frame-steps a movie; `screencapture` at a measured mean interval of 119.1ms (10-sample
   calibration, min 99ms, max 226ms -- the 226ms outlier is consistent with a cold-start JIT/disk
   cache effect on the first capture of the run) is the honest ceiling of this instrument. A flash
   shorter than ~119ms is real and would be invisible to this burst; it would still be visible to
   the untouched-boot `PWY` readback if it caused a measurably-wrong `zoomProp`, which it did not.
2. **`gridCols`/tile numbers were taken under a docked inspector.** The Web Inspector docked to the
   right shrinks the page's own layout viewport (`innerWidth: 380` at 150%, vs `657` at 90% -- the
   inspector pane is a fixed px width, so a higher page zoom leaves less room for the app). This
   changes the grid's **column count** (`repeat(auto-fill, ...)` resolves to fewer columns in a
   narrower viewport) but not the **track width** -- `auto-fill` with a fixed-px track keeps the
   per-tile width constant regardless of how many columns fit, which is exactly the number
   compared against `tileWidth` in (c).
3. **Comparing the full-screen burst frames to the window-cropped Launch-1 screenshot required a
   coordinate conversion.** `01-launch1-asfound-90.jpg` is sized to the window itself; the Task 2
   burst frames are full-screen captures with the GameLib window occupying a sub-region (position
   differed between launches -- not maximized on the relaunch). `02-relaunch-first-frame.jpg` and
   `03-relaunch-steady-150.jpg` are cropped to the window's own logical bounds (doubled for the 2x
   Retina physical capture) specifically so this README's frames are directly comparable to each
   other and to Launch 1's screenshot.
4. **Launch-to-window-sighting gap was unexpectedly short (76ms)** and first-contentful-paint
   (per the untouched-boot `PWY` record) was measured at 816ms relative to navigation start --
   well before the sidecar-readiness marker the launch script polled for. This means React's boot
   effect had almost certainly already run before the burst's very first frame, which is the most
   direct explanation for why no 100%-rendered frame was ever captured.
5. **Cmd+Q did not fully quit the app on either launch's teardown.** Both times, `keystroke "q"
   using command down` left all five dev processes (gamelib-shell, vite, sidecar.js, the shell
   wrapper, the `tauri dev` node process) running and port 5173 listening several seconds later.
   Both times, `kill -TERM` on the identified PIDs completed teardown cleanly -- the plan's
   sanctioned fallback, used twice, not once.
6. **The range-input CGEvent click did not grab keyboard focus for the restore.** Clicking the
   visible slider thumb (computed from a fresh screenshot, same method as the earlier slider
   drives) left 6 subsequent `ArrowLeft` keystrokes with no effect on the on-disk value. The
   plan's "dispatch fallback" (native `HTMLInputElement` value setter + `input`/`change` event
   dispatch, still the real element's real `onChange` handler, never a `store/config.json`
   hand-edit) worked on the first attempt and is recorded as `restore-dispatch` /
   `restore-confirmed-90` in `boot-reads.jsonl`.
