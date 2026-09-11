---
created: 2026-09-11
title: "gog-logo.svg renders non-square (19.0x17.5 vs a 19.2 target) and is structurally malformed"
area: humble-keys-ui
status: RESOLVED
severity: minor
platform: any
ready: code
source: "REQ-43-19 item 5, run 1 (20260911T043842Z); re-confirmed carried/out-of-scope in run 2 (20260911T062945Z, measurements-rerun.md); split out of the now-RESOLVED store-logo-fill-currentcolor todo, which handed this geometry finding off rather than absorbing it"
files:
  - src/frontend/assets/gog-logo.svg
  - src/frontend/screens/Game/GamePage/index.css
resolves_phase: null
---

# `gog-logo.svg` renders non-square and is structurally malformed

## This is a geometry finding, NOT the colour defect

The colour defect on this same asset (`fill: currentColor` not reaching the GOG glyph in light
theme, because the global `.gogIcon { fill: var(--text-default) }` rule in `_colors.scss:101`
matched directly and beat the inherited value) is **closed** — see
`.planning/todos/completed/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md`,
fixed by the scoped `.humbleKeyRowStoreLogo .gogIcon { fill: currentColor; }` escape (quick task
260911-p6s, commit `c690a117a`) and re-measured PASS in REQ-43-19 run 2. This todo is about the
glyph's **shape**, which that fix did not touch and was never meant to.

## Measured geometry

REQ-43-19 item 5 measured the GOG icon's rendered bounding box at **19.0 × 17.5 CSS px** against a
19.2 × 19.2 target box, while the Steam icon in the same row measures **19.0 × 19.0** — square, as
intended. Both runs of the live gate confirm this; run 2's `measurements-rerun.md` explicitly
carries it forward as out-of-scope for that run's re-scored items.

## Cause

`src/frontend/assets/gog-logo.svg`:

```xml
<svg class="gogIcon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
	<use href="#icon-logo-gog">
		<symbol preserveAspectRatio="xMidYMax meet" viewBox="0 0 34 31" id="icon-logo-gog">
			<path className="cls-1" d="..."></path>
		</symbol>
	</use>
</svg>
```

The **root `<svg>`'s `viewBox` is `0 0 32 32`, which IS square** — the non-squareness is not at
the outer element most consumers would check first. It comes from the **inner `<symbol>`'s**
`viewBox="0 0 34 31"` (aspect ratio 34:31, not 1:1) combined with `preserveAspectRatio="xMidYMax
meet"`, which scales the symbol's content to fit the outer square box while preserving that
aspect ratio: a 19.2px square box scaled to a 34:31 ratio yields 19.2 × (31/34) ≈ **17.5** — which
is exactly the measured height. This is the non-obvious part: the asset *looks* square from its
outermost declaration and only turns out not to be once the `<symbol>`'s own viewBox is read.

## Other malformations on this same asset (carried across, not newly introduced)

- The `<symbol id="icon-logo-gog">` is nested **inside** the `<use href="#icon-logo-gog">` element
  that references it, rather than being defined once elsewhere (e.g. in a `<defs>` block or
  top-level) and referenced from outside. This is unusual SVG structure — a `<use>` referencing an
  id defined as its own descendant — and its rendering behavior across engines has not been proven
  correct, only observed to currently work in this app's bundled WKWebView.
- The `<path>` carries `className="cls-1"` instead of SVG's own `class="cls-1"` attribute. This is
  a **static `.svg` file**, not JSX — `className` is a React/JSX-only prop name and has no meaning
  as a literal SVG/XML attribute. No embedded `<style>` block in this file defines `.cls-1` either
  way, so the attribute currently appears inert regardless of which name is used, but that has
  only been observed, not proven for every future consumer of this asset.

Both malformations pre-date this todo and are not known to cause any live-observed defect; they
are recorded here because they sit on the same file this todo already tracks a geometry issue
against, not because either has independently demonstrated broken behaviour.

## Suggested fix

Correct the `<symbol>`'s `viewBox` to a square aspect (or drop `preserveAspectRatio="xMidYMax
meet"` in favour of `"xMidYMid meet"` with a square viewBox) so the glyph renders 19.0 × 19.0 like
the Steam icon it sits beside. While touching the file, consider flattening the `<use>`/`<symbol>`
indirection to a plain `<svg><path>` (there is only one glyph in this file, so the indirection
buys nothing) and correcting `className` to `class`. Re-verify against a live render in both
themes afterward, per this project's "measure, do not eyeball" rule for this UI.

## Resolution

**1. The headline remedy — "correct the viewBox to a square aspect" — was REJECTED on
measurement.** The artwork is the gog.com wordmark inside a rounded rectangle whose own `<path>`
spans `0..34` × `0..31` user units (the outer rounded-rect subpath's corners sit at `(0,0)` and
`(34,31)`). 34:31 is the **brand aspect, not a defect**. A square viewBox combined with `meet` is
a no-op — the ink stays 34:31, just letterboxed inside the square, and a live re-measure would
come back 19.0 × 17.5 again, unchanged. The only way to force a literal 19.0 × 19.0 square render
is `preserveAspectRatio="… none"`, a ~9.7% vertical stretch (34/31) that turns the rounded
corners into ellipses and distorts the letterforms. For reference, `steam-logo.svg`
(`viewBox="0 0 496 512"`) and `amazon-logo.svg` (`viewBox="0 0 448 512"`) are also non-square —
"square" was never this repo's house convention for store logos.

**2. What the same measurement DID expose, and what shipped.** The `<symbol>` carried
`preserveAspectRatio="xMidYMax meet"` — `YMax` bottom-aligns the glyph inside its box, dumping
all of the letterbox slack above the glyph and none below. Re-rendered at 192×192 via
`rsvg-convert -w 192 -h 192 -b white` against a square-viewport harness that reproduces the
element's real embedding (a fixed square CSS box, default `preserveAspectRatio`, matching how the
browser actually lays this out — see the SUMMARY for why the bare `rsvg-convert -w 192 -h 192`
command on the flattened file alone stretches rather than letterboxes and required this harness):

| | before (`xMidYMax`) | after (`xMidYMid`, default) |
|---|---|---|
| ink width | 192 | 192 |
| ink height | 176 | 176 |
| top gap | 16 | 8 |
| bottom gap | 0 | 8 |

(The plan's predicted numbers were height 175 / gaps ≈8/≈8 — the 176-vs-175 and 16-vs-17
differences are inclusive-pixel-row rounding at this raster size, not a discrepancy in the fix.)
Height holding constant at 176 both before and after is the proof the 34:31 brand aspect was not
distorted; top and bottom gaps equalising from 16/0 to 8/8 is the proof the bottom-flush
alignment defect — GOG sitting visibly lower than the vertically-centred Steam mark beside it —
is fixed. Shipped by flattening the root to `viewBox="0 0 34 31"` with the default (now absent)
`preserveAspectRatio`, i.e. `xMidYMid meet`.

**3. The two structural malformations this todo also recorded** — the `<symbol>` nested inside
the `<use>` that references it, and `className` (a JSX-only prop name, meaningless as a literal
SVG/XML attribute) on the `<path>` — are both fixed in the same edit: the file is now a flat
`<svg><path class="cls-1" d="…"/></svg>`, with the `d` value extracted programmatically and
sha256-gated against the pre-edit file rather than retyped.

**4. The GamePage `&.gogIcon` override had to ship in the same change.**
`src/frontend/screens/Game/GamePage/index.css` carried an asymmetric `&.gogIcon { padding: 0px
var(--space-3xs) var(--space-3xs); }` override (no top padding, bottom padding only) that existed
solely to hand-correct the old bottom-flush render by lifting it back off the floor. Once the
asset centres itself, that override becomes a ~9px over-correction that would push GOG up and
size it differently from the Epic/Steam/Amazon icons beside it on the GamePage, all of which take
the base symmetric `var(--space-2xs)`. Deleting it (lines 618–621, verified against the plan's
measured baseline before editing) makes GOG inherit the same rule as every other store icon.
Leaving it in place would have converted this fix into a new GamePage defect.

**5. Verification, stated honestly.** Desk measurements above; `pnpm codecheck` clean (0
errors); `pnpm lint` clean (0 errors, pre-existing unrelated warnings only); `npx prettier
--check src/frontend/screens/Game/GamePage/index.css` clean — scoped to that file only, since
`.svg` has no prettier parser and repo-wide `pnpm prettier` is red at HEAD (`64e972122`)
independent of this change, per this repo's known "Pre-push gate is red repo-wide" trap;
`themeTokens.test.ts` and `humbleKeysStylesheet.test.ts` both ran (2 suites, 86 tests, non-zero
count) and passed.

**The live gate is OWED and was NOT run.** No live app render was taken. The Humble Keys row and
the GamePage store-icon row both still need a re-measure in a live render, in both themes, to
confirm the centring lands there and that GOG now matches its neighbours' rendered size on the
GamePage. This is **not** claimed as a PASS anywhere in this resolution or in the SUMMARY. This
todo carried `ready: code`, so the live gate is a follow-up, filed as
`.planning/todos/pending/2026-09-12-gog-logo-live-remeasure-humble-keys-and-gamepage-owed.md`
(`ready: live-gate`), not a blocker on closing this one.
