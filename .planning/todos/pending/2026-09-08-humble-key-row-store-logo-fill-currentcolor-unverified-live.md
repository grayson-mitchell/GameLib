---
created: 2026-09-08
title: "HumbleKeyRow store logo fill:currentColor is a code-level guarantee only — never verified against a live render"
area: humble-keys-ui
status: OPEN
severity: medium
platform: any
ready: code
source: "phase 42 plan 04 (D-42-03 store indicator), CONTEXT.md 'Both themes' UI note; premise corrected by quick task 260908-vo4 (2026-09-08) after the icon moved out of .humbleKeyRowCaption"
files:
  - src/frontend/screens/Humble/Keys/index.css (.humbleKeyRowStoreLogo)
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
resolves_phase: null
---

# Store logo `fill: currentColor` never proven against a live render

## Defect

**Premise corrected 2026-09-08 (quick task 260908-vo4):** the store logo
was hoisted out of `.humbleKeyRowCaption` to be the row's first flex child
(D-42-03 column 0 redesign, `HumbleKeyRow/index.tsx`). It no longer
inherits `--text-secondary` from a caption ancestor — the paragraph below
originally said it did, which is now a stale, load-bearing-wrong claim
about the mechanism. `.humbleKeyRowStoreLogo` (`index.css`) now declares
`color: var(--text-secondary)` **directly on itself**, and `fill:
currentColor` resolves against that own-element declaration instead.

`.humbleKeyRowStoreLogo` sets `fill: currentColor` so the Steam/GOG/Epic
logo SVGs inherit the icon's own `color: var(--text-secondary)` declaration
instead of painting the SVG UA default (`fill: black` — none of the three
source SVGs declare their own `fill="currentColor"`, confirmed by grep:
zero `fill="..."` attributes in any of the three files). This is sound CSS
reasoning (`fill` is an inherited SVG property; GOG's `<use>`/`<symbol>`
indirection still inherits from the referencing element per spec) but it
has **never been rendered**, in either theme, by anything that can see
actual pixels — and the underlying claim is now MORE exposed than when
this was filed: the glyph is larger (sized from the title's line box
instead of the caption's `1em`) and sits at the row's start rather than
mid-row.

The Frontend jest project (`src/frontend/jest.config.js`) has no jsdom and
no browser automation — component tests invoke functions directly and
inspect the returned React-element graph, which cannot compute CSS
inheritance or resolve `currentColor`. CONTEXT.md's own UI note for this
phase says explicitly: "Verify each logo against a light AND a dark theme
before claiming the indicator is done — do not eyeball one" / "Measure, do
not eyeball." Plan 42-04 had no live-DOM verification step available to it,
so that measurement was not — and could not be — performed here.

## What's known vs. unknown

- KNOWN: none of the three logo SVGs hardcode a `fill` attribute (grep-
  verified), so the CSS-inheritance mechanism has a real gap to fill.
- KNOWN: `fill` is CSS-inheritable per the SVG/CSS Painting spec.
- KNOWN (2026-09-08): the colour source is now `.humbleKeyRowStoreLogo`'s
  own `color: var(--text-secondary)` declaration, not an inherited
  `.humbleKeyRowCaption` ancestor — the element left the caption entirely.
- UNKNOWN: whether GOG's specific `<use href="#icon-logo-gog">` →
  `<symbol>` → `<path className="cls-1" ...>` indirection actually
  inherits `fill` through in every engine GameLib ships on (this repo
  targets Electron/Tauri's bundled Chromium, so cross-browser risk is low,
  but it has not been checked even once).
- UNKNOWN: whether the GOG asset's pre-existing `className="cls-1"` typo
  (should be `class="cls-1"` — a static SVG attribute, not JSX; not
  introduced by this plan, not fixed by this plan, out of scope per the
  scope-boundary rule) has any bearing on rendering. It appears inert
  (no embedded `<style>` block defines `.cls-1` in the source SVG), but
  that too is an unverified-against-a-live-render claim.

## Suggested verification

Run the app (dev or packaged), navigate to Humble Keys with rows for
Steam, GOG, and a no-logo platform (e.g. `uplay`/`origin`, which now keeps
its text label in `.humbleKeyRowCaption` below the title rather than in
the icon slot) present in both a light and a dark theme, and screenshot
each row. Confirm the icon at the row's left edge is visible (not
black-on-black / not invisible) and roughly matches
`.humbleKeyRowTitle`/`.humbleKeyRowCaption`'s `--text-secondary` colour in
both themes — i.e. that `.humbleKeyRowStoreLogo`'s own `color` declaration
is actually reaching the SVG's `fill` in a live engine. Verify together
with the geometry todo
(`2026-09-08-humble-key-row-store-icon-geometry-unverified-live.md`) in
one session — both need the same screenshot.


## Live-gate outcome (2026-09-11) — REQ-43-19 item 6: **FAIL for GOG, PASS for Steam**

This todo is **NOT closed**. It was filed as "unverified"; it is now **verified broken, with the
cause identified**. Severity raised `minor` → `medium` and `ready` moved `live-gate` → `code`,
because nothing further needs measuring — the fix is a desk edit.

Measured from screenshot pixels on a packaged release build, both themes:

| Logo | Theme | Measured | `--text-secondary` | Verdict |
|---|---|---|---|---|
| Steam | dark `[20,23,41]` | `[177,177,177]` | `#b1b1b1` = `[177,177,177]` | PASS (exact) |
| Steam | light `[237,239,244]` | `[57,59,64]` | `#393b41` = `[57,59,65]` | PASS (±1, antialiasing) |
| **GOG** | light | **`[33,36,43]`** | `#393b41` | **FAIL** |

### Cause — the GOG logo never resolves through `currentColor` at all

`src/frontend/styles/_colors.scss:101`:

```css
.gogIcon { fill: var(--text-default); }
```

`gog-logo.svg`'s root element carries `class="gogIcon"`. That rule matches the `<svg>` **directly**,
so it beats the `fill: currentColor` that `.humbleKeyRowStoreLogo` (`Keys/index.css:376`) only
passes down by **inheritance** — a directly-matching declaration always wins over an inherited
value, regardless of specificity. The GOG logo is therefore not mis-tinted; it is on a different
colour mechanism entirely, and `--text-secondary` never reaches it.

Steam's logo has no class, inherits normally, and is correct in both themes.

### Fix options (a decision, not just an edit)

1. Scope the escape: `.humbleKeyRowStoreLogo .gogIcon { fill: currentColor; }` — narrow, local,
   leaves every other `.gogIcon` consumer untouched. **Recommended.**
2. Drop `class="gogIcon"` from the Humble row's import — but the asset is shared, so check
   `GamePage/index.css:619`'s `&.gogIcon` first.
3. Change the global rule — widest blast radius, needs its own audit.

### Also on this asset (carried from item 5, not a colour defect)

`gog-logo.svg` renders **19.0 × 17.5** rather than square (`viewBox="0 0 34 31"` +
`preserveAspectRatio="xMidYMax meet"` in a 19.2 box). It is also malformed: a `<symbol>` nested
inside the `<use>` element that references it, and React's `className=` instead of SVG's `class=`
on its path.
