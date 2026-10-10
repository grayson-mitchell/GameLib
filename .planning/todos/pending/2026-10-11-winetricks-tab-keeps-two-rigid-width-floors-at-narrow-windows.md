---
created: 2026-10-10T23:56:34.000Z
title: Winetricks tab keeps two rigid width floors at narrow windows (500px section floor, rigid German cached badge)
area: ui
severity: minor
platform: any
ready: code
found_by: "quick 261011-hh5 diagnosis (desk read), 2026-10-11"
files:
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
---

## Observation (desk-derived, unmeasured)

Quick task 261011-hh5 released the Settings dialog paper's `min-width: fit-content` floor so the
Winetricks tab's content can no longer widen the dialog past the window. Two narrower, rigid
floors live below the paper and were out of scope for that fix. Neither has been measured at a
live window; both are inferred from a scoped grep and the cascade rules below.

**(1) The 500px section floor.**
`.settingsDialogContent section:not(:nth-of-type(0)) { padding-top: var(--space-xl); min-width: 500px; }`
(`GamesSettings/index.scss:34-36`, specificity 0,2,1) out-specifies the `min-width: 0` declared for
the tab's three `<section>` groups (specificity 0,2,0): `.WinetricksSuggested` and
`.WinetricksTaskGroup` (`WinetricksSettings/index.scss:36-40`) and `.WinetricksEverythingElse`
(`EverythingElseGroup/index.scss:12-15`). Once the paper's content box drops below 500px, the
groups overflow and the dialog content scrolls sideways instead of wrapping. That happens roughly
below a 610-690px window, depending on whether the paper's `80vw` or `100%` max-width wins the
cascade at that point. Whether the leaked `padding-top: var(--space-xl)` on this rule is wanted
spacing for the groups or an unrelated carry-over is a design question to record here, not answer.

**(2) The rigid cached badge.** `.WinetricksRow__cached` is `flex: 0 0 auto; white-space: nowrap`
(`Row/index.scss:179-185`). The German label `Zwischengespeichert (Offline-Installation)` is sized
to fit beside a truncated row title at the 700px paper width proven by 261011-hh5, but at narrower
papers it cannot shrink and can paint over the row's 12rem status slot.

## Fix options (not chosen)

- A specificity bump on the three groups' `min-width: 0` (for example re-scoping or `!important`
  is out; a more specific selector matching the existing `0,2,1` is the likely shape) so they beat
  the 500px section floor again.
- Let `.WinetricksRow__cached` shrink last with ellipsis instead of staying rigid. It currently has
  no `title` tooltip, so adding one to recover the full text on hover would be a TSX change, not
  CSS-only.

## Owed

A live capture at a narrow window (roughly 600-700px) in the `de` locale, confirming whether the
500px floor and the cached badge actually arm in practice and at what width.
