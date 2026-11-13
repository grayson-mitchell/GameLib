---
created: 2026-11-13T00:00:00.000Z
title: 'Settings shows "Automatically update games" off while the stored value is true'
area: settings
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-UAT.md item 20 (operator side note, deferred by the 74 gap-closure round 3, 2026-11-13)'
files:
  - src/frontend/screens/Settings/components/AutoUpdateGames.tsx
  - src/backend/config.ts:321
---

## Problem

During the 74 live gate, Settings showed the "Automatically update games" toggle off while
`store/config.json` held `autoUpdateGames: true`. Toggling it on and then off wrote `false`.
The backend reads the stored value, so the UI and the behaviour disagree: a user who sees "off"
can still get unattended bridge updates at boot.

`AutoUpdateGames.tsx` reads it through `useSetting('autoUpdateGames', true)`. Not root-caused:
candidates are the setting being read from a different scope (game vs global config), a stale
cache in `useSetting`, or the default masking a read that has not resolved.

## Done when

With `autoUpdateGames: true` in the stored config, Settings shows the toggle on after a fresh
launch, and with `false` it shows off; a unit test pins the read path.
