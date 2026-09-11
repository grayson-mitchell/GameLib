---
created: 2026-09-11
title: "gog-logo.svg renders non-square (19.0x17.5 vs a 19.2 target) and is structurally malformed"
area: humble-keys-ui
status: OPEN
severity: minor
platform: any
ready: code
source: "REQ-43-19 item 5, run 1 (20260911T043842Z); re-confirmed carried/out-of-scope in run 2 (20260911T062945Z, measurements-rerun.md); split out of the now-RESOLVED store-logo-fill-currentcolor todo, which handed this geometry finding off rather than absorbing it"
files:
  - src/frontend/assets/gog-logo.svg
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
