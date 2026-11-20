# Evidence: `.WebView__embedContainer`'s implicit grid column has no zero floor

Quick task `261015-dlu`. Measures the mechanism behind `TODO-dlu-1` and refutes the `App.css`
shell-column hypothesis `261015-9qy` left open as unmeasured.

## (a) What this is

The shipped stylesheets, unmodified -- `App.css`, the `NavShell`/`NavTabs`/`NavItem`/
`WindowControls` scss compiled by sass, `WebView/index.css`, `index.scss`, `themes.scss` -- plus a
transcription of MUI 5.17.1's `Tabs`/`Tab` base rules (emotion injects those at runtime, so a
static page has to carry them in by hand). The DOM mirrors `NavShell/index.tsx` (the 5 real tabs:
Accounts, Library, Stores, Downloads, Settings) and the tier-2 rail, plus `WebView/index.tsx`'s
`.WebView.WebView__embedContainer` holding `StoreEmbedTimeoutBanner`'s exact markup and English
strings ("Epic is taking a while to load", "Reload", "Open in browser"). Every capture records
`fontsReady: "loaded"` -- the measurement is against the real `@fontsource` webfonts, not a
fallback font.

Each capture is one page, with seven arms measured in it via an injected `<style id="arm">`
override, re-measured after each swap:

- `shipped` -- no override; the stylesheets exactly as they ship.
- `content-min-width-0` -- `.App .content{min-width:0}`
- `navbar-min-width-0` -- `.NavShell__navbar{min-width:0}`
- `navbar-overflow-hidden` -- `.NavShell__navbar{overflow:hidden}`
- `F1-container-minmax0` -- `.WebView__embedContainer{grid-template-columns:minmax(0,1fr)}`
- `F2-row-min-width-0` -- `.WebView__embedNoticeRow{min-width:0}`
- `F3-row-overflow-hidden` -- `.WebView__embedNoticeRow{overflow:hidden}`

`F1` is the container-level fix this quick task ships. `F2` and `F3` are row-level alternatives
that were measured, found equivalent at 600px, and not shipped -- see (d).

This directory holds the harness source (`build-page.mjs`, `wkprobe.swift`) and the 12 captured
result files (`wk-<width>.json`, `cr-<width>.json` at 1280/900/800/700/600/500). It does **not**
hold `page.html`: that file is 64,122 bytes of generated CSS, fully reproducible from
`build-page.mjs`, and committing a generated artifact invites someone to edit it instead of the
builder.

## (b) How to re-run it

Four steps, from the repo root:

1. Compile the six scss inputs with the repo's own sass (`npx sass --no-source-map`, version
   1.89.0 on the machine this was measured on) into one directory, using the flattened filenames
   `build-page.mjs` reads: `index.css` and `themes.css` from `src/frontend/index.scss` and
   `src/frontend/themes.scss`, and `src_frontend_components_UI_NavShell_index.scss.css`,
   `src_frontend_components_UI_NavShell_components_NavTabs_index.scss.css`,
   `src_frontend_components_UI_NavShell_components_NavItem_index.scss.css`,
   `src_frontend_components_UI_WindowControls_index.scss.css` from the matching `index.scss`
   files under `src/frontend/components/UI/`.
2. `node build-page.mjs <repo> <compiled-css-dir> <out.html>` -- `App.css` and
   `WebView/index.css` are read straight from the repo, not from the compiled directory.
3. `/usr/bin/swiftc -O -o wkprobe wkprobe.swift`, then
   `./wkprobe <out.html> <width> 800 [timeoutSeconds]`, which prints `window.__resultsJSON` on
   stdout -- that stdout capture is the `wk-<width>.json` shape. The probe is **macOS-only**: it
   needs `/usr/bin/swiftc` and a WKWebView.
4. The Chromium arm, with chrome-headless-shell at `<width>,800 --dump-dom`, yields
   `cr-<width>.json`. The binary used for this capture was the Playwright-cached one at
   `~/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`
   -- a machine-local path, not a repo dependency, so a re-runner may need to point at their own
   cached binary or install one.

## (c) Results

WebKit numbers (Chromium agrees to within 0.07px at every width -- see below).

| viewport | `.App` grid columns | `.content` width | embed container column | notice row width | message width | actions right edge | actions clipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 900 shipped | 256px 634px | 634 | 634px | 634 | 370.08 | 874 | no |
| 700 shipped | 256px 434px | 434 | 434px | 434 | 170 | 674 | no |
| 600 shipped | 256px 334px | 334 | **419.66px** | **419.66** | 155.73 | **659.66** | **yes** |
| 500 shipped | 256px 234px | 234 | **419.66px** | **419.66** | 155.73 | **659.66** | **yes** |
| 600 F1 | 256px 334px | 334 | 334px | 334 | 70.08 | 574 | no |
| 600 F2 | same | 334 | 334px | 334 | 70.08 | 574 | no |
| 600 F3 | same | 334 | 334px | 334 | 70.08 | 574 | no |
| 500 F1/F2/F3 | 256px 234px | 234 | 234px | 234 | 0 | 503.92 | yes |

Chromium agreement, measured at 600px: container column `419.65625px` WebKit vs `419.594px`
Chromium -- a 0.062px difference, within the stated 0.07px band.

Arithmetic note: the probe's `.App` client width is the viewport minus 10px in every arm (590 at
a 600px viewport, 490 at 500px), so the column sums are against 590/490, not 600/500. A reader
checking `256 + 334` against `600` will otherwise think the numbers are wrong.

## (d) What it concluded

The implicit `auto` column's min-content floor is the mechanism: with no `grid-template-columns`
on `.WebView__embedContainer`, its single grid column takes an automatic minimum equal to its
items' min-content contribution -- set here by the notice row's nowrap message, actions and icon,
~420px wide -- and that floor wins over the container's own narrower content box below ~420px of
available width. The three shell arms (`content-min-width-0`, `navbar-min-width-0`,
`navbar-overflow-hidden`) changed **nothing** at any width measured -- byte-identical to
`shipped` in every field -- which is what refutes the `App.css` shell-column hypothesis
`261015-9qy` left open. At 500px every arm, including all three fixes, still clips: the message
is already at zero width and the actions plus icon and padding exceed the available 234px.

## (e) Limits

This is a static page with a transcribed MUI base and a hand-built DOM, built once per capture
and measured with `getBoundingClientRect()` -- it is **not the running app**. No React, no
router, no theme switch and no real MUI runtime participated in any capture. The 900px and 600px
column figures above come from this harness; the **original** clip that started this whole
investigation is from the Item 16 live-gate photographs (`item16-width600.png`,
`item16-width900.png`), not from here. Nothing in quick task `261015-dlu` was run in the real
app, so nothing in this evidence bundle observes a rendered ellipsis, a rendered clip, or the fix
actually painting in a window -- that remains owed to a live gate.

**That live gate ran on 2026-10-15 as quick task `261015-n5k`** (see
`../../261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/README.md`): in a
`pnpm tauri:dev` build on this Mac the real banner measured 344px / 80.08px / 584px at a 600px
layout viewport (this table's `600 F1` row plus the 10px `.App` offset), the 500px row still
clipped by 3.92px, and a live pre-fix control reproduced this table's `shipped` row to the
hundredth (419.65625px / 155.73 / 659.66). The harness predicted the running app at every width.
