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
