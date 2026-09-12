---
created: 2026-09-12
title: "gog-logo.svg centring fix owes a live re-measure on Humble Keys, GamePage and the Login runner tile (both themes)"
area: humble-keys-ui
status: RESOLVED
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

## Resolution — quick task 260912-k09 (2026-09-12)

Measured live against the packaged release build `/private/tmp/gamelib-gate-20260912T164819Z`
(binary sha256 `e7bbeb664…`, source `16ec08de3`, carrying all three fix commits). Full record,
including method and the seven estimator traps hit on the way, in
`.planning/quick/260912-k09-gog-logo-centring-live-re-measure/evidence/measurements.md`.

**Prediction fixed before measuring** (OLD vs NEW rendered into identical square viewports): centred
→ centroid offset `+0.032` device px; bottom-flush → `+1.726`.

| surface | theme | measured | verdict |
|---|---|---|---|
| Surface 1, Humble Keys "Racine" | nord-light | GOG − Steam centroid **−0.088 device** | PASS |
| Surface 1, Humble Keys "Racine" | nord-dark | GOG − Steam centroid **+0.415 device** | PASS |
| Surface 2, GamePage store icon | nord-light | box **46.0 CSS** (= Steam's), gaps 15/15, asym **0** | PASS |
| Surface 2, GamePage store icon | nord-dark | box **46.0 CSS** (= Steam's), gaps 15/15, asym **0** | PASS |
| Surface 3, Login runner tile | — | no `<img>` exists under `.runnerIcon.gog` | resolved by code-read |

**Surface 2's neighbour concern does not materialise**: GOG's painted box matches Steam's to the
device pixel in both themes. GOG's glyph is 31.0 CSS tall vs Steam's 33.0 — the 34:31 vs 496:512
brand aspect, not a size defect.

**Surface 3 is deliberately NOT claimed as a live PASS.** `Login/index.tsx:302` passes
`icon={() => <GOGLogo />}` (a `?react` import) into `Runner/index.tsx:124`, so every tile is an
inlined SVG and the deleted `.runnerIcon.gog img` rule matched no element — the static reading in
this todo is confirmed. "Pixel-identical before and after" is a counterfactual that would require a
second release build of `39e1e62bb^`; it was not taken, and no screenshot substitutes for it.

**One expectation in this todo was wrong.** It predicted Humble ink of 19.2 × 17.5 CSS; the measured
extent is **19.0 × 18.0** across thresholds 16–40 (17.5 appears only at threshold ≥60). Extent is
threshold-dependent and is not the discriminator — the centroid is, and it moves 0.002 device px
across that same threshold range.
