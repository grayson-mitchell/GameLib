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
