---
created: 2026-11-21
title: "Per-game Advanced settings: replace collapsed twisties with always-open headings"
area: ui
files:
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/screens/Settings/components/EnvVariablesTable.tsx
  - src/frontend/components/UI/InfoBox
severity: minor
platform: any
ready: code
resolved: 2026-11-21
resolution: "Per the sketch 009 README note the twisties were on Wine (Engine) and Run (Steam overlay), not Advanced; both are now plain fields with (i) help, and Advanced is grouped into headed cards."
---

## Problem

Operator report (2026-11-21): the sections under a game's Settings > Advanced tab sit behind
twisties (collapsed disclosures). Each visit means opening the twisty before reaching the
control, which is an unneeded step. That came up repeatedly while setting environment
variables during the low-magic-age-no-window debug session.

The operator wants a plain heading per section with the content always visible.

## Fix shape

- Find which disclosures the Advanced tab renders (`TabPanel index='advanced'` in
  `GamesSettings/index.tsx`: AlternativeExe, Scripts, WrappersTable, EnvVariablesTable,
  VerboseLogs, ...). The likely candidate is `InfoBox` as used by `EnvVariablesTable`;
  confirm rather than assume.
- Render each as an always-open section with a heading. Keep any explanatory text as the
  icon-only `(i)` help on the heading line (see memory "Help icon on title line"), not as a
  collapsed block.
- Check `runAdvancedTabs.test.ts` and any test that clicks a twisty open.
- Run `npx prettier --check` scoped to the files written.

## Resolution (2026-11-21, quick 261121-dzl)

Per the sketch 009 README note, the twisties were on the Wine tab (Engine) and the Run tab (Steam overlay), not Advanced. Both are now plain always-visible selects with (i) help, and Advanced is grouped into headed cards (Launch target, Scripts, Wrappers & environment, Diagnostics & updates).
