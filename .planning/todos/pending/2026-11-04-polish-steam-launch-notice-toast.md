---
created: 2026-11-04T07:35:00.000Z
title: "Make the in-app Steam launch notice toast look polished"
area: ui
files:
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
severity: minor
platform: any
ready: code
---

## Problem

The operator asked for the toast to look better ("make toast sexy") during the Phase 60 gap
re-run (60-16, UAT item 16, 2026-11-04). In that run the "Steam overlay unavailable" notice
showed up in-app and did not block anything, but its styling is plain. The same component also
renders the 59-19 engine-fallback notice, so any visual change reaches both notices.

The same file also fails `meta/__tests__/hardcodedStringGate.test.ts`. Its overlay-cause table
(lines ~41-62, added in 60-14) has 8 untranslated literals. That gate failure is tracked
separately at Phase 60 close, but whoever restyles the component should check that it is fixed.

## Solution

Restyle the notice to match the app's themed surfaces. See `Skill("sketch-findings-gamelib")`
for the multi-theme survival rules. Ideas: elevation/shadow, an icon per cause, an
enter/exit animation, a progress hairline for the ~8 s focus-gated auto-hide, and a dismiss
affordance. Keep it non-modal and focus-gated (G4). Check it in every theme.

## Design decided (sketch 006, 2026-11-04)

Winner: **Variant A — refined stripe** (`.planning/sketches/006-launch-notice-toast/`). Build to
that sketch:

- Stays bottom-right. Replace the hard-coded `--overlay` 4.5rem offset with a shared
  bottom-right stack region (flex column); a leaving toast collapses its slot so the other glides.
- Enter: slide in from the right, ~240ms with slight overshoot. Exit: slide out right + fade,
  ~180ms ease-in. Reduced motion: fade only.
- Exit needs a "leaving" state before unmount, and `useSuppressStoreEmbedWhile` must stay held
  until the exit animation ends.
- Surface: 10px radius, layered shadow, 3px warning start-stripe kept; bold title + muted body
  (engine notice needs a title/body split — new i18n keys).
- Icon per cause: clock (cx-expired), wrench (cx-broken), search (cx-missing), eye-slash (overlay).
- 2px warning progress hairline for the 8s auto-hide; pauses on hover; overlay countdown stays
  frozen until GameLib is in front (existing G4 gating). Dismiss × always visible. No swipe.
