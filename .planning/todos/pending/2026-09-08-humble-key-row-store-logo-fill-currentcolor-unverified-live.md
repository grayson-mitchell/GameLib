---
created: 2026-09-08
title: "HumbleKeyRow store logo fill:currentColor is a code-level guarantee only — never verified against a live render"
area: humble-keys-ui
status: OPEN
severity: minor
platform: any
ready: live-gate
source: "phase 42 plan 04 (D-42-03 store indicator), CONTEXT.md 'Both themes' UI note"
files:
  - src/frontend/screens/Humble/Keys/index.css (.humbleKeyRowStoreLogo)
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
resolves_phase: null
---

# Store logo `fill: currentColor` never proven against a live render

## Defect

`.humbleKeyRowStoreLogo` sets `fill: currentColor` so the Steam/GOG/Epic
logo SVGs inherit `.humbleKeyRowCaption`'s `--text-secondary` colour token
instead of painting the SVG UA default (`fill: black` — none of the three
source SVGs declare their own `fill="currentColor"`, confirmed by grep:
zero `fill="..."` attributes in any of the three files). This is sound CSS
reasoning (`fill` is an inherited SVG property; GOG's `<use>`/`<symbol>`
indirection still inherits from the referencing element per spec) but it
has **never been rendered**, in either theme, by anything that can see
actual pixels.

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
Steam, GOG, and a no-logo platform (e.g. `uplay`/`origin`) present in both
a light and a dark theme, and screenshot the row caption in each. Confirm
the logo is visible (not black-on-black / not invisible) and roughly
matches the caption text colour in both themes.
