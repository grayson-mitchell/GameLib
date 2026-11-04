---
created: 2026-11-05T12:00:00.000Z
title: "Deeper theming of the Steam launch notice toast (highlights, text colours, font)"
area: ui
files:
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
severity: minor
platform: any
ready: live-gate
---

## Problem

The live check of the sketch 006 toast (quick 261104-vvz) passed on 2026-11-05: motion, hover
pause, frozen overlay bar, exit/collapse, dismiss and Reduce Motion all work, and it reads well
in every theme. But the operator noted it could be "more" themed. Today it only picks up a few
generic tokens: `--text-default`, `--text-secondary`, `--background-darker`,
`--body-background`, `--accent`, and `--status-warning` for the stripe, bar and icon. As a result
it looks much the same in every theme and doesn't take on each theme's own highlight colours,
text colours or font treatment the way the rest of the app's surfaces do.

## Solution

Map the toast's surface, title, body, icon, stripe, hairline and × to the same per-theme tokens
the app's themed surfaces already use (cards, nav tabs, InfoBox popovers), so each theme's
highlights and text colours carry through. Follow the multi-theme survival rules in
`Skill("sketch-findings-gamelib")`, and keep the warning semantics readable (stripe and bar must
still read as a warning). This is SCSS only, with no behaviour change.

Then check it live in `pnpm tauri:dev` in every theme. The quickest trigger for the engine
notice is to temporarily rename `/Applications/CrossOver.app`, launch a bridged Steam game, then
rename it back.
