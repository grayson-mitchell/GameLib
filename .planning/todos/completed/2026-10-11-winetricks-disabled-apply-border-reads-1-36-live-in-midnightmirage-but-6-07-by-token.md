---
created: 2026-10-11T00:00:00.000Z
title: Disabled Apply border reads 1.36:1 live in midnightMirage but 6.07 (pre-fix) / 10.49 (post-fix) by token
area: ui
severity: minor
platform: macos
ready: live-gate
found_by: "quick 261011-kqx's token-resolved cross-check against the 45-12 live gate, 2026-10-11"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
completed: 2026-10-11
status: "RESOLVED 2026-10-11 in quick task 261011-to5: no live/token gap exists. Re-reading the gate's own scored frame (burst6-007.png) pixel by pixel, the disabled Apply border is a crisp 2-device-px run of A8AEAF on 272F31 on all four edges -- 6.07:1, exactly the --neutral-05 token the SCSS declared at gate time. The 3D4345 the gate scored is an anti-aliased pixel of the 4px corner arc (about 16 percent border coverage), picked up because sample.swift reports the most frequent colours in a rect and the rect fell on a corner. The nord-light control frame reads the same way and agrees with its gate value. The fractional-backing-scale hypothesis is refuted for this control: the capture is exactly 2.0x and no straight-edge pixel is blended. Post-fix (--text-secondary, A6EDFD) is 10.51:1 by the same frame's text pixels; not re-sampled as a border because no packaged build with 261011-kqx exists"
---

## The gap

Phase 45 live gate 45-12 (launch G7) sampled the disabled Apply button's border in midnightMirage
at **1.36:1** (`#3D4345` on `#272F31`), under the 3:1 non-text floor. Resolving the exact same
hex pair through `themeTokens.test.ts`'s `themeTokens` + `globalTokens` + `resolveValue` +
`contrastRatio` chain — the token the SCSS actually declared at the time of that gate — gives
**6.07:1**, already clearing 3:1 by a wide margin. Quick 261011-kqx's fix (swapping the disabled
border to `var(--text-secondary, #a8aeaf)`) raises the resolved value further, to **10.49:1**. In
neither case does the token math predict a failure at this border.

`--text-secondary` (`#A8AEAF`) on `--input-background` (`#272F31`) is not unique to this control:
`nord-light` was separately sampled live during the same 261011-kqx census at this exact pair and
read **6.07:1** — matching the token-resolved value exactly. So the same hex pair's live and
token values agree in nord-light and disagree in midnightMirage, which points at something
specific to the midnightMirage sample or window, not at the resolver chain or the token itself.

## What was checked, and ruled out

No global dimming rule reaches `.WinetricksStickyBar__apply`'s border at the DOM level:
`button:disabled`, `[disabled]`, any `filter:` rule, and any `opacity` rule in the shared
`_buttons.scss`/`themes.scss` cascade were all checked and none apply additional dimming beyond
what the token chain already resolves. The pre-fix SCSS's own `&:disabled { border-color:
var(--text-secondary, #a8aeaf); ... }` (now generalized by 261011-kqx) was already the declared
rule at gate time — this is not a case of the live gate catching an undeclared/fallback value.

## Leading hypothesis (unverified)

A 1px border anti-aliased at a fractional backing scale — see memory
`wkwebview-1px-border-vanishes-on-fractional-grid-track`. If the live capture sampled a
sub-pixel-blended edge (border partially transparent/blended with a neighbouring surface at a
non-integer device-pixel boundary), the sampled colour would read closer to the surrounding
background than the declared border hex, which would explain a measured ratio far below the
token-resolved one without any CSS or token defect. This is a hypothesis, not a confirmed cause —
it has not been reproduced or disproven on this control specifically.

## What the next live gate needs to capture

- A fresh pixel sample of the disabled Apply button's border in midnightMirage, post-fix, ideally
  with multiple samples along the border's length (not a single point) to catch edge-blending.
- The same control sampled at more than one window-backing scale / DPI if the test machine
  supports it, to see whether the ratio shifts with scale — which would support or refute the
  fractional-grid-track hypothesis directly.
- A repeat sample of the nord-light control at the same `--text-secondary`/`--input-background`
  pair, as a same-run control, since that theme's live and token values already agree.

Not closed by quick 261011-kqx — that task changed the token (to `--text-secondary`) without
being able to explain or close this specific live/token gap, which predates its fix.

## Resolution (2026-10-11, quick 261011-to5)

**There is no gap.** The gate's evidence dir `/tmp/gamelib-gate-45-20261010T194049Z` still held
`burst6-007.png`, the exact frame the 1.36:1 was scored from (terminal.log line 344: "launch 4
first open, 0 selected"). Re-read pixel by pixel instead of by histogram, the disabled Apply
button's border is a crisp **2-device-pixel run of `A8AEAF` on `272F31` on all four edges**:

| edge   | device pixels                 | colour, every pixel |
| ------ | ----------------------------- | ------------------- |
| left   | x = 1937-1938 (y = 1423)      | A8AEAF              |
| right  | x = 2044-2045 (y = 1423)      | A8AEAF              |
| top    | y = 1396-1397 (x = 1990)      | A8AEAF              |
| bottom | y = 1450-1451 (x = 1990)      | A8AEAF              |

`A8AEAF` on `272F31` = **6.07:1**, which is exactly the `--neutral-05` token the SCSS declared at
gate time (`git show 44d9cc4c3` of the StickyBar stylesheet: `border-color: var(--neutral-05,
#a8aeaf)`; midnightMirage does not override `--neutral-05`). Live and token agree.

**Where `3D4345` came from.** It occurs at the button's corners only -- (1939,1401), (2043,1401),
(1939,1446) -- as the ~16 percent-coverage anti-aliased pixel of the 4px `border-radius` arc
(8 device px at 2.0x), alongside its siblings `293032`, `3F4547`, `41484A`, `464D4F`, `565D5E`,
`676D6F`, `717779`, `798081`, `8B9192`, `9CA2A3`. The gate's `steps/sample.swift` reports the
most frequent colours in a rect and the scorer took the second colour as "the border"; a rect
that lands on a corner and contains no straight run of the edge returns one of these blended
pixels. The same tool over the whole button bbox (1937,1396 109x56) returns `272F31` 78.7
percent, `A8AEAF` 9.5 percent, `A6EDFD` 3.5 percent -- background, border, text -- with `3D4345`
nowhere in the top twelve.

**Same-run control.** `burst3-020.png` (nord-light, launch 3 first open) read the same way:
left edge x = 2610-2611, top y = 1396-1397, bottom y = 1450-1451, every pixel `A8AEAF` on
`D8DEE9`, matching the gate's own 1.66:1 reading. That theme's gate rect happened to sit on a
straight edge; the midnightMirage one happened to sit on a corner.

**The hypothesis in this todo is refuted for this control.** The capture is exactly 2.0x
(2784x1824 = 1392x912 pt including the window shadow; the border is exactly two device rows
wide with no partially-covered row on any straight edge). Corner anti-aliasing is a
`border-radius` property, present at every backing scale, so the multi-DPI arm has nothing to
discriminate and was not run.

**Post-fix value.** 261011-kqx's `--text-secondary` resolves to `A6EDFD` in midnightMirage; this
same frame's disabled-Apply text pixels read `A6EDFD` exactly, 10.51:1 on `272F31`. The border
itself was not re-sampled post-fix: no packaged build containing e89c0237f exists (the bundle in
`src-tauri/target/release/bundle` predates it by eight hours) and the arithmetic is settled by the
frame above. The 45-UAT item 7 result line carries this correction.

**Measurement lesson.** A colour histogram's "second most frequent colour" is not "the
outline" when the rect is small and the outline has rounded corners; sample a straight run
of the edge, or dump a pixel line through the control and read the run lengths.
