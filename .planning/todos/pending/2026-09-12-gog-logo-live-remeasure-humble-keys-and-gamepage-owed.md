---
created: 2026-09-12
title: "gog-logo.svg centring fix owes a live re-measure on Humble Keys, GamePage and the Login runner tile (both themes)"
area: humble-keys-ui
status: OPEN
severity: minor
platform: macos
ready: live-gate
source: "Follow-up filed while closing .planning/todos/completed/2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md (quick task 260912-873), which fixed the asset and CSS at the desk-measurement level only"
files:
  - src/frontend/assets/gog-logo.svg
  - src/frontend/screens/Game/GamePage/index.css
  - src/frontend/screens/Login/components/Runner/index.css
resolves_phase: null
---

# GOG logo centring fix owes a live re-measure

Quick task 260912-873 flattened `gog-logo.svg` to a root `viewBox="0 0 34 31"` with default
`preserveAspectRatio` (dropping the old `xMidYMax` bottom-alignment), and deleted the
compensating `&.gogIcon` padding override in `GamePage/index.css`. Both changes were verified by
desk measurement only — `rsvg-convert` re-renders decoded in pure Python, plus a synthetic
square-viewport harness to reproduce the fixed-CSS-box embedding rsvg-convert's CLI doesn't
letterbox by default. **No live app render was taken.** This todo tracks the two surfaces that
still need a real re-measure, in both light and dark themes, before this can be called done.

## Surface 1 — Humble Keys row

`.humbleKeyRowStoreLogo` sizes the icon at `calc(var(--text-md) * 1.2)` ≈ 19.2 × 19.2 CSS px.

- **Expected:** GOG ink measures 19.2 × 17.5 CSS px (unchanged from before — the 34:31 brand
  aspect is not being distorted), centred vertically inside the 19.2px box with ~0.85px of gap
  above and ~0.85px below.
- **What to check:** the GOG mark should now sit vertically centred next to the Steam mark in
  the same row, not visibly lower than it (the original defect this fix targeted).

## Surface 2 — GamePage store-icon row

`.store-icon > & > svg` sizes all store icons at 46×46 with `padding: var(--space-2xs)` (now
including GOG, since its override was deleted).

- **Expected:** GOG renders at the same visual size as the Epic, Steam, and Amazon icons beside
  it — all four now share the identical symmetric padding rule with none singled out.
- **What to check:** GOG should no longer look larger or offset relative to its neighbours (the
  effect the deleted `&.gogIcon` override used to hand-correct for the old bottom-flush glyph).

## Surface 3 — Login runner tile (folded in, and the WEAKEST claim here)

A sweep for other per-consumer compensating overrides found exactly one more, on this same
asset: `Runner/index.css` carried `.runnerIcon.gog img { margin-top: -1px; }` against a base
rule of `.runnerIcon img, .runnerIcon svg { width: 100%; padding: 10px; }`. It was deleted.

**The static reading says this deletion is a no-op**, because the override named `img` while all
six runner tiles render inlined SVG components (`<EpicLogo/>`, `<GOGLogo/>`, `<AmazonLogo/>`,
`<ZoomLogo/>`, `<SteamLogo/>`, `<HumbleLogo/>`, all imported via `?react`), so no `<img>` ever
exists under `.runnerIcon.gog` for it to match. The fingerprint of the rot is the asymmetry: the
base rule was widened to cover `img, svg` at some point and the store-qualified nudge was not.

- **Expected:** the GOG tile on the Login screen is pixel-identical before and after. This is the
  one surface here where the prediction is "nothing changed at all".
- **What to check:** that it genuinely is unchanged. **This is a code-read prediction, not a
  measurement** — if the GOG login tile shifts by ~1px, the static reading was wrong and the rule
  was live after all. That outcome is the finding, not a regression to paper over.

## Not in scope here

Re-litigating whether the icon should be forced to a literal square render — that remedy was
already measured and rejected in the closed todo (a square viewBox + `meet` is a no-op; forcing
true square distorts the rounded corners into ellipses). This todo is purely about confirming
the shipped centring fix in a live render.
