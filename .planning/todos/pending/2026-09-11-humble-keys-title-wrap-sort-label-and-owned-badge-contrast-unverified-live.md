---
created: 2026-09-11
title: "Humble Keys title wrap, sort label placement, and owned-badge contrast fixes are unverified live"
area: humble-keys-ui
status: OPEN
severity: minor
platform: any
ready: live-gate
source: "260911-t0p, quick task fixing four UI defects on the Humble Keys screen (source-text pins only, no rendered/computed-style adjudicator exists in this repo's frontend jest project -- testEnvironment: 'node', no jsdom)"
files:
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
resolves_phase: null
---

# Humble Keys title wrap, sort label placement, and owned-badge contrast fixes are unverified live

## Why this todo exists

260911-t0p fixed three CSS-only defects on the Humble Keys screen. All three fixes are pinned by
source-text regex assertions in `humbleKeysStylesheet.test.ts` (with SANITY negative-control
siblings proving each anchor is not vacuously true), because the frontend jest project's
`testEnvironment: 'node'` has no jsdom/CSS engine — it cannot render anything or compute a style,
only inspect the source text of `index.tsx`/`index.css`. Source-text correctness is therefore
adjudicated and closed; **rendered/visual correctness of all three is not**, and needs a live
`tauri:dev` (or packaged) run to confirm the CSS actually produces the intended layout and colour
in a real WKWebView. This mirrors the same P2 constraint already recorded in `43-LIVE-GATE.md`.

## Three items for the next REQ-43-19 live-gate run

1. **`Humble Keys` h4 title wraps to two lines.** Measurable claim: the `<h4>` renders on **one
   line** at the app's default window width. Method: pixel measurement of the title element's
   rendered height (a single-line height, not a two-line wrapped height) or its computed
   `white-space` — not a visual scan. Source pin already holding:
   `humbleKeysStylesheet.test.ts` describe block `'Humble Keys title no longer yields to
   SearchBar (REQ-43-19, 260911-t0p defect 1)'`, which pins `flex-shrink: 0` and
   `white-space: nowrap` on `.humbleKeysTitle`. This todo adjudicates *rendering*, not *source* —
   the source pin already holds.

2. **`Sort` label renders above the picker instead of beside it.** Measurable claim: the `Sort`
   label renders to the **right** of the select, vertically centred with it, and the select is
   not collapsed to its `min-width: 100px` floor (`index.css:711`'s documented fallback for an
   unsized grid track). Method: pixel measurement of the label's bounding box relative to the
   select's bounding box (same-row check: overlapping vertical centre, label's left edge to the
   right of the select's right edge) — not a visual scan. Source pin already holding:
   `humbleKeysStylesheet.test.ts` describe block `'Humble Keys sort picker label sits beside, not
   above, the select (REQ-43-19, 260911-t0p defect 2)'`, which pins
   `grid-template-areas: 'select label'` and an explicit `grid-template-columns` on
   `.humbleKeysSortPicker`. This todo adjudicates *rendering*, not *source*.

3. **`Likely owned on Steam` badge is unreadable on light themes.** Measurable claim: the badge
   text measures **≥ 4.5:1** contrast against `body.nord-light`'s background, with `#3e532d` on
   `#eceff4` = **7.35:1** as the predicted value (the `--success` token's documented nord-light
   resolution, replacing the raw `--status-success` token measured at 1.46:1). Method: colour
   sampling of the rendered badge text against its background and a contrast-ratio calculation —
   not a visual scan (per this repo's own `measure-colour-before-scoring-a-ui-contract` lesson:
   "not red" is not sufficient, the ratio must be computed). Source pin already holding:
   `humbleKeysStylesheet.test.ts` describe block `'Humble Keys owned-badge contrast fix
   (REQ-43-19, 260911-t0p defect 4)'`, which pins `.humbleKeyOwnedBadge { color: var(--success) }`
   and asserts the raw `var(--status-success)` token occurs exactly once file-wide (its one
   remaining, unrelated use), not on this badge. This todo adjudicates *rendering*, not *source*.

## Scope

`ready: live-gate` — the fixes are landed and source-pinned; only rendered/visual verification on
a live run is outstanding. `platform: any` — none of the three is platform-specific; the
adjudicating harness happening to be the operator's Mac is incidental, not a requirement.
