# Evidence: `.WebView__embedContainer`'s zero-floor column, observed in the RUNNING app

Quick task `261015-n5k`. Closes the live gate `261015-dlu` owed: that quick task measured
`grid-template-columns: minmax(0, 1fr)` in a static harness (sass-compiled stylesheets, a
hand-built DOM, a compiled WKWebView probe and chrome-headless-shell) and said so in its own
README's Limits section -- "nothing in this evidence bundle observes a rendered ellipsis, a
rendered clip, or the fix actually painting in a window". This directory is that observation.

## (a) What this is

A `pnpm tauri:dev` build of HEAD (`6d7ad30db`, which carries the fix at
`src/frontend/screens/WebView/index.css:88`) launched detached on this Mac on 2026-10-15,
dev pid 53538, window CGWindowID 86558, Retina 2x. The route driven was Stores -> Epic
(`#/store/epic`), the real macOS surface: the raw-WKWebView Epic subview, the real
`StoreEmbedControls` row, the real `StoreEmbedTimeoutBanner` rendered by React through
`useStoreEmbedHost` and i18n.

**How the banner was raised without a 45 s timeout, a hosts blackhole, or sudo.** The banner is
driven by `navState.loadTimedOut`, which `useStoreEmbedHost.ts`'s 250 ms drain reads from
`window.api.storeEmbedTakeNavEvents()`. `probe.js` (loaded into the main webview from the Web
Inspector console via vite's `/@fs/` path -- `tauri dev` applies no CSP) wraps that one function
so every drained batch carries `loadTimedOut: true`. The real hook sets the real state and the real
component renders. No stylesheet, no component, and no Rust code was touched; the only DOM the
probe writes is nothing (it reads rects and logs). This is the same kind of lever as the
`storeEmbedShow()` console drive used in earlier gates.

**How viewports below the 900 px window floor were reached.** `tauri.conf.json` pins `minWidth:
900`, and that pin held (see (c), "clamp"). The Web Inspector was docked to the RIGHT of the window,
which in WebKit shrinks the page's layout viewport to the space left of the divider. The divider
was dragged (CGEvent drag) to put `document.documentElement.clientWidth` at exactly 600, 500 and
400 inside a 1280 px window. This is a real layout viewport, not a CSS override: `.App` resolved to
`256px 344px` at 600 by itself.

**Controls.** At 600 and at 500, an injected `<style id="arm">.WebView__embedContainer
{grid-template-columns:auto}</style>` put the PRE-FIX sizing back (the implicit column is an
`auto` track), the row was re-measured, and the style was removed and re-measured again. This
is what shows the live rig discriminates fixed from unfixed rather than reporting "not clipped"
for an unrelated reason.

**Readback.** `__measure(tag)` writes one JSON record per call to `console.log` and to
`window.api.logInfo` (so it lands in `~/Library/Logs/GameLib/gamelib.log`). `document.title` was
tried first and does NOT reach the native window title under Tauri -- CGWindowList kept reporting
`GameLib` -- so it is not a channel. `gate-measurements.jsonl` is the log's twelve records
verbatim; the 1280 px armed record predates the log channel (first probe build logged to the
console only) and is read from frame `01` instead.

## (b) Files

| file | what |
| --- | --- |
| `probe.js` | the `__gateArm` / `__measure` globals; loaded with `import('/@fs/<repo>/.planning/quick/261015-n5k-.../evidence/probe.js')` |
| `gate-measurements.jsonl` | 12 JSON records, one per `__measure` call, straight from `gamelib.log` |
| `01-window-1280-banner.png` | window 1280x800, banner armed; message, Reload, Open in browser on one row |
| `02-window-900-floor-banner.png` | window resized to the 900 floor, banner armed; nothing clipped |
| `03-viewport-600-fixed.png` | inspector docked right, layout viewport 600; message ellipsised ("Epic is taking..."), both actions whole |
| `04-viewport-500-fixed.png` | layout viewport 500; message at 0 width, Open in browser's right border cut by the viewport edge |
| `05-viewport-600-CONTROL-prefix-auto-column.png` | viewport 600 with the pre-fix `auto` column injected; message full width, Open in browser cut off |
| `06-viewport-500-CONTROL-prefix-auto-column.png` | viewport 500, same control |
| `winlist.swift`, `click.swift`, `drag.swift`, `type.sh` | the rig: CGWindowList geometry/ids, CGEvent click and drag, and the console-typing driver (frontmost assert, click prompt, `System Events` keystroke + Return) |

Frames are `screencapture -x -o -l<CGWindowID>` of the app window with frontmost asserted at
capture time -- never AX (the 50-UAT Item 16 instrument warning applies).

## (c) Results

All numbers are CSS px from `getBoundingClientRect()` / `getComputedStyle()` in the live main
webview. `container col` is `getComputedStyle(.WebView__embedContainer).gridTemplateColumns`.
"clipped" is `actions.right > container.right` or `> viewport`.

| arm | viewport | `.App` cols | container col | row w | msg w | ellipsised | actions right | clipped |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| window 1280 (frame 01) | 1280 | 256px 1024px | 1024px | 1024 | 760.08 | no | 1264 | no |
| window 900 = floor (frame 02) | 900 | 256px 644px | 644px | 644 | 380.08 | no | 884 | no |
| window 1280, inspector docked | 780 | 256px 524px | 524px | 524 | 260.08 | no | 764 | no |
| viewport 600 (frame 03) | 600 | 256px 344px | **344px** | 344 | 80.08 | **yes** | 584 | **no** |
| viewport 500 (frame 04) | 500 | 256px 244px | **244px** | 244 | 0 | yes | 503.92 | **yes** (3.92 px past 500) |
| viewport 400 (record tagged `docked-600`, viewport was 400) | 400 | 256px 144px | 144px | 144 | 0 | yes | 503.92 | yes |
| CONTROL 600, pre-fix `auto` (frame 05) | 600 | 256px 344px | **419.65625px** | 419.66 | 155.73 | no | 659.66 | yes |
| CONTROL 500, pre-fix `auto` (frame 06) | 500 | 256px 244px | **419.65625px** | 419.66 | 155.73 | no | 659.66 | yes |
| control removed, 600 | 600 | 256px 344px | 344px | 344 | 80.08 | yes | 584 | no |
| control removed, 500 | 500 | 256px 244px | 244px | 244 | 0 | yes | 503.92 | yes |

**Against the `261015-dlu` harness.** The harness's `.App` was the viewport minus 10 px; the live
`.App` is the full viewport, so every live width is the harness width plus 10: harness `600 F1`
container 334 / msg 70.08 / actions right 574 vs live 344 / 80.08 / 584. The two control arms are
the harness's `shipped` arm to the hundredth: harness 419.66 / 155.73 / 659.66, live
419.65625 / 155.73 / 659.66. The harness predicted the running app correctly at every width.

**Clamp (the `261015-9qy` half that was "not verifiable at desk").** With the window at 900x800,
`System Events … set size of window 1 to {800, 800}` left CGWindowList reporting
`116 65 900 800` -- AppKit refused the width. Height was not exercised (only `minWidth` is
measured; `minHeight: 600` remains the judgment call 9qy recorded it as).

## (d) What it concluded

- **E3 at the floor: PASS, observed.** At 900 px the single 40 px row shows the message (380 px,
  not ellipsised) and both actions whole; actions' right edge 884 < 900. Frame 02.
- **Below the floor the fix degrades as predicted, observed.** At 600 the column track equals the
  container's own box (344, not 419.66), the message ellipsises to 80 px, and both actions stay
  inside the viewport. Frame 03. This is the regime the Item 16 photograph `item16-width600.png`
  showed clipped before the fix; the live control arm (frame 05) reproduces that photograph's
  shape on demand and removing the control restores frame 03's.
- **The 500 regime still clips, observed, and the fix does not claim it.** Message at 0 width,
  actions 187.92 wide plus icon and padding exceed the 244 px box by 3.92 px; Open in browser's
  right border is cut. Frame 04. CSS on this container cannot help there; `minWidth: 900` is what
  keeps a user out of it.
- **No discrepancy between harness and hardware**, so no code change.

## (e) Observations recorded, not acted on

1. **Under the injected flag, a window resize can clear the banner.** After the 1280 -> 900 window
   resize the banner had gone (`floor-900` record: `bannerPresent:false`) and needed re-arming.
   The embed slot's ResizeObserver issues a set-bounds call whose direct return goes through
   `applyNavResult`, and Rust's returned state carries its OWN `load_timed_out`, which is `false`
   because nothing really timed out. This is an artefact of raising the flag renderer-side; under
   a genuine timeout Rust's flag is `true` on that same path, and 50-UAT Item 16 Launch 5 saw the
   banner persist across a 200 -> 1280 sweep. Not a defect. The later 900 -> 1280 resize did NOT
   clear it, so the clear is also timing-dependent on whether a drain or a direct return landed
   last.
2. **With the pre-fix sizing the native Epic subview follows the inflated slot rect past the
   webview's edge.** In frames 05 and 06 the Epic page is painted out to ~657 and ~675 CSS px
   while the layout viewport was 600 / 500 -- it is drawn OVER the docked inspector pane, because
   `useStoreEmbedHost`'s ResizeObserver reports the slot's rect and the native NSView is not
   clipped by the web content. In a real (undocked) window the window edge hides this, but it
   means the pre-fix defect also mis-sized the native subview, not only the banner row. The fix
   removes it (frames 03 / 04 show the page confined to the viewport). During the 500 control
   this overlap swallowed two console clicks until the prompt was clicked further right.
3. **`document.title` is not a readback channel under Tauri** -- see (a).
4. **The Web Inspector's docked-right pane has a minimum width of about 500 px**, so a 900 px
   window can only reach a 400 px app viewport; widen the window to 1280 first for 600 / 500.
